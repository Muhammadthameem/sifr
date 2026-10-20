import {
  Prisma,
  OrderStatus,
  SalesChannel,
  PaymentStatus,
  PaymentMethod,
  RefundMethod,
  RefundPurpose,
  RefundStatus,
  ManualRefundResolutionType,
  PaymentProvider,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { normalizeIndiaMobile } from '@/lib/validation/mobile';
import {
  CreateWhatsAppOrderInput,
  CreateOnlineOrderInput,
  CreateDirectSaleInput,
  TransitionOrderStatusInput,
  ConfirmWhatsAppOrderSaleInput,
  DispatchOrderInput,
  MarkOrderDeliveredInput,
  CancelConfirmedOrderInput,
  createWhatsAppOrderSchema,
  createOnlineOrderSchema,
  createDirectSaleSchema,
  transitionOrderStatusSchema,
  confirmWhatsAppOrderSaleSchema,
  dispatchOrderSchema,
  markOrderDeliveredSchema,
  cancelConfirmedOrderSchema,
} from '@/lib/validation/ordering';
import { generateOrderNumber } from './sequence';
import { calculateWhatsAppOrderShipping } from './shipping';
import {
  createNotificationInOutbox,
  processNotification,
  processPendingNotifications,
} from '@/lib/notifications/notification-engine';


/**
 * Robust target constraint checker for Prisma P2002 unique constraint errors.
 */
export function isTargetConstraint(err: any, fieldName: string): boolean {
  if (err?.code !== 'P2002') return false;
  const target = err.meta?.target;
  const cleanField = fieldName.toLowerCase().replace(/_/g, '');
  if (Array.isArray(target)) {
    return target.some((t: string) => t.toLowerCase().replace(/_/g, '').includes(cleanField));
  }
  if (typeof target === 'string') {
    return target.toLowerCase().replace(/_/g, '').includes(cleanField);
  }
  return false;
}

/**
 * Resolves or creates a Customer master record in a concurrency-safe manner.
 */
export async function resolveCustomer(
  customerData: {
    name: string;
    mobile: string;
    email?: string | null;
    address?: string | null;
  }
) {
  const normalizedMobile = normalizeIndiaMobile(customerData.mobile);

  let customer = await prisma.customer.findUnique({
    where: { mobile: normalizedMobile },
  });

  if (!customer) {
    try {
      customer = await prisma.customer.create({
        data: {
          name: customerData.name,
          mobile: normalizedMobile,
          email: customerData.email || null,
          address: customerData.address || null,
        },
      });
    } catch (err: any) {
      if (isTargetConstraint(err, 'mobile') || err?.code === 'P2002') {
        customer = await prisma.customer.findUniqueOrThrow({
          where: { mobile: normalizedMobile },
        });
      } else {
        throw err;
      }
    }
  }

  // Update customer master with latest submitted information where changed
  const updateData: { name?: string; email?: string | null; address?: string | null } = {};
  if (customerData.name && customerData.name.trim() && customerData.name.trim() !== customer.name) {
    updateData.name = customerData.name.trim();
  }
  if (customerData.email && customerData.email.trim() && customerData.email.trim() !== customer.email) {
    updateData.email = customerData.email.trim();
  }
  if (customerData.address && customerData.address.trim() && customerData.address.trim() !== customer.address) {
    updateData.address = customerData.address.trim();
  }

  if (Object.keys(updateData).length > 0) {
    try {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: updateData,
      });
    } catch {
      // Non-blocking update failure fallback
    }
  }

  return { customer, normalizedMobile };
}

import {
  validateAndConsumeCouponInTransaction,
  previewCouponEligibility,
  CouponItemInput,
} from '@/lib/coupons/coupon-engine';
import crypto from 'crypto';

/**
 * WHATSAPP Order Creation Engine
 * Customer submits order request on website before being redirected to WhatsApp.
 * - salesChannel = WHATSAPP
 * - status = CONTACTED
 * - paymentStatus = DUE
 * - paymentMethod = nullable / optional
 * - reservationExpiresAt = null (no reservation timer)
 * - Freezes product prices, discounts, and shipping fee into Order snapshots
 * - Authoritative shipping fee = MIN(SUM(Product.shippingCharge * quantity), globalShippingCap)
 * - ZERO stock reservation (reservedStock untouched, physicalStock untouched)
 * - ZERO FIFO consumption, ZERO SALE_OUT, ZERO FIFO COGS
 * - ZERO notification sent (customer drafts WhatsApp message via wa.me redirect)
 */
export async function createWhatsAppOrder(input: CreateWhatsAppOrderInput) {
  const parsed = createWhatsAppOrderSchema.parse(input);

  // Check creation idempotency before transaction
  const existingOrder = await prisma.order.findUnique({
    where: { creationIdempotencyKey: parsed.creationIdempotencyKey },
    include: { items: true, customer: true, statusTransitions: true, coupon: true },
  });
  if (existingOrder) {
    return existingOrder;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Double check creation idempotency inside transaction
      const txExisting = await tx.order.findUnique({
        where: { creationIdempotencyKey: parsed.creationIdempotencyKey },
        include: { items: true, customer: true, statusTransitions: true, coupon: true },
      });
      if (txExisting) {
        return txExisting;
      }

      // Pre-generate Order ID
      const orderId = crypto.randomUUID();

      // 2. Format delivery address snapshot and resolve Customer
      const formattedAddress = `${parsed.customer.address}\nCity: ${parsed.customer.city}\nState: ${parsed.customer.state}\nPincode: ${parsed.customer.pincode}`;

      const { customer, normalizedMobile } = await resolveCustomer({
        name: parsed.customer.name,
        mobile: parsed.customer.mobile,
        email: parsed.customer.email,
        address: formattedAddress,
      });

      // 3. Sort variant IDs deterministically and validate variants exist and are active
      const variantIds = Array.from(new Set(parsed.items.map((i) => i.variantId))).sort();

      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: { product: true },
      });

      const varMap = new Map(variants.map((v) => [v.id, v]));

      for (const item of parsed.items) {
        const variant = varMap.get(item.variantId);
        if (!variant) {
          throw new Error(`PRODUCT_VARIANT_NOT_FOUND: Variant ${item.variantId} does not exist`);
        }
        if (!variant.isAvailable) {
          throw new Error(`VARIANT_UNAVAILABLE: Variant '${variant.title}' (${variant.sku}) is currently not available`);
        }
      }

      // 4. Calculate merchandise subtotal & build coupon inputs
      let subtotalNum = 0;
      const couponInputs: CouponItemInput[] = [];

      for (const item of parsed.items) {
        const variant = varMap.get(item.variantId)!;
        const priceNum = Number(variant.sellingPrice);
        subtotalNum += priceNum * item.quantity;
        couponInputs.push({
          variantId: item.variantId,
          productId: variant.productId,
          categoryId: variant.product.categoryId,
          sellingPrice: variant.sellingPrice,
          quantity: item.quantity,
        });
      }

      // 5. Calculate authoritative WhatsApp shipping fee: MIN(SUM(Product.shippingCharge * quantity), globalShippingCap)
      const shippingItems = parsed.items.map((item) => {
        const variant = varMap.get(item.variantId)!;
        return {
          shippingCharge: variant.product.shippingCharge,
          quantity: item.quantity,
        };
      });
      const authoritativeShippingDecimal = await calculateWhatsAppOrderShipping(shippingItems, tx);
      const shippingFeeNum = Number(authoritativeShippingDecimal);

      // 6. Optional Coupon validation (READ-ONLY: does NOT consume usage or create CouponUsage at creation)
      let couponValidationResult: {
        couponId: string;
        code: string;
        discountTotal: Prisma.Decimal;
        lineDiscounts: Map<string, Prisma.Decimal>;
      } | null = null;

      if (parsed.couponCode && parsed.couponCode.trim() !== '') {
        const validation = await previewCouponEligibility(
          parsed.couponCode,
          couponInputs,
          normalizedMobile
        );
        if (!validation.valid) {
          throw new Error(`INVALID_COUPON: ${validation.reason || 'Invalid coupon code'}`);
        }
        couponValidationResult = {
          couponId: validation.couponId!,
          code: validation.code!,
          discountTotal: validation.discountTotal,
          lineDiscounts: validation.lineDiscounts,
        };
      }

      // 7. Lock/Generate DocumentSequence for WHATSAPP
      const orderNumber = await generateOrderNumber('WHATSAPP', tx);

      const discountTotalNum = couponValidationResult ? Number(couponValidationResult.discountTotal) : 0;
      const lineDiscountsMap = couponValidationResult?.lineDiscounts || new Map<string, Prisma.Decimal>();

      // 8. Snapshot Order Items
      const preparedItems = parsed.items.map((item) => {
        const variant = varMap.get(item.variantId)!;
        const unitPriceNum = Number(variant.sellingPrice);
        const mrpNum = Number(variant.mrp);
        const grossLineTotalNum = unitPriceNum * item.quantity;
        const lineDiscountDecimal = lineDiscountsMap.get(item.variantId) || new Prisma.Decimal('0.00');
        const lineDiscountNum = Number(lineDiscountDecimal);
        const netLineTotalNum = Math.max(0, grossLineTotalNum - lineDiscountNum);

        return {
          variantId: item.variantId,
          productNameSnapshot: variant.product.name,
          variantTitleSnapshot: variant.title,
          skuSnapshot: variant.sku,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(unitPriceNum),
          mrp: new Prisma.Decimal(mrpNum),
          discountAmount: lineDiscountDecimal,
          lineTotal: new Prisma.Decimal(netLineTotalNum),
        };
      });

      const grandTotalNum = Math.max(0, subtotalNum - discountTotalNum) + shippingFeeNum;
      const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days TTL

      // 9. Persist Order Header & Items
      const order = await tx.order.create({
        data: {
          id: orderId,
          orderNumber,
          salesChannel: SalesChannel.WHATSAPP,
          status: OrderStatus.CONTACTED,
          paymentStatus: PaymentStatus.DUE,
          paymentMethod: parsed.paymentMethod || null,
          creationIdempotencyKey: parsed.creationIdempotencyKey,
          guestAccessTokenExpiresAt: tokenExpiresAt,
          reservationExpiresAt: null, // Zero reservation timer
          customerId: customer.id,
          customerNameSnapshot: parsed.customer.name,
          customerMobileSnapshot: normalizedMobile,
          customerEmailSnapshot: parsed.customer.email || null,
          shippingAddressSnapshot: formattedAddress,
          billingAddressSnapshot: formattedAddress,
          subtotal: new Prisma.Decimal(subtotalNum),
          shippingFee: new Prisma.Decimal(shippingFeeNum),
          discountTotal: new Prisma.Decimal(discountTotalNum),
          taxTotal: new Prisma.Decimal(0),
          grandTotal: new Prisma.Decimal(grandTotalNum),
          totalFifoCogs: new Prisma.Decimal(0),
          couponId: couponValidationResult?.couponId || null,
          couponCodeSnapshot: couponValidationResult?.code || null,
          notes: parsed.notes || null,
          items: {
            create: preparedItems,
          },
        },
        include: { items: true, customer: true, statusTransitions: true, coupon: true },
      });

      return order;
    });
  } catch (err: any) {
    if (isTargetConstraint(err, 'creation_idempotency_key')) {
      return await prisma.order.findUniqueOrThrow({
        where: { creationIdempotencyKey: parsed.creationIdempotencyKey },
        include: { items: true, customer: true, statusTransitions: true, coupon: true },
      });
    }
    throw err;
  }
}

/**
 * ONLINE Order Creation Engine
 */
export async function createOnlineOrder(input: CreateOnlineOrderInput) {
  const parsed = createOnlineOrderSchema.parse(input);

  // Check creation idempotency before transaction
  const existingOrder = await prisma.order.findUnique({
    where: { creationIdempotencyKey: parsed.creationIdempotencyKey },
    include: { items: true, customer: true, statusTransitions: true, coupon: true, couponUsage: true },
  });
  if (existingOrder) {
    return existingOrder;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Double check creation idempotency inside transaction
      const txExisting = await tx.order.findUnique({
        where: { creationIdempotencyKey: parsed.creationIdempotencyKey },
        include: { items: true, customer: true, statusTransitions: true, coupon: true, couponUsage: true },
      });
      if (txExisting) {
        return { order: txExisting, notificationId: null };
      }

      // Pre-generate Order ID for transactional FK references (e.g. CouponUsage)
      const orderId = crypto.randomUUID();

      // 2. Resolve Customer
      const { customer, normalizedMobile } = await resolveCustomer(parsed.customer);

      // 3. Sort variant IDs deterministically
      const variantIds = Array.from(new Set(parsed.items.map((i) => i.variantId))).sort();

      // 4. LOCK STEP 1: Lock InventoryItem rows in deterministic ascending variant ID order
      for (const vId of variantIds) {
        await tx.$queryRaw`SELECT * FROM inventory_items WHERE variant_id = ${vId} FOR UPDATE`;
      }

      // Fetch InventoryItems & ProductVariants with Product details
      const inventoryItems = await tx.inventoryItem.findMany({
        where: { variantId: { in: variantIds } },
      });

      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: { product: true },
      });

      const invMap = new Map(inventoryItems.map((inv) => [inv.variantId, inv]));
      const varMap = new Map(variants.map((v) => [v.id, v]));

      // 5 & 6. Validate Available Stock (physicalStock - reservedStock >= requestedQty)
      for (const item of parsed.items) {
        const inv = invMap.get(item.variantId);
        if (!inv) {
          throw new Error(`Inventory item for variant ${item.variantId} not found`);
        }
        const availableStock = inv.physicalStock - inv.reservedStock;
        if (availableStock < item.quantity) {
          throw new Error(
            `INSUFFICIENT_AVAILABLE_STOCK: Variant ${item.variantId} has available stock ${availableStock}, requested ${item.quantity}`
          );
        }
      }

      // Calculate merchandise subtotal
      let subtotalNum = 0;
      const couponInputs: CouponItemInput[] = [];

      for (const item of parsed.items) {
        const variant = varMap.get(item.variantId)!;
        const priceNum = Number(variant.sellingPrice);
        subtotalNum += priceNum * item.quantity;
        couponInputs.push({
          variantId: item.variantId,
          productId: variant.productId,
          categoryId: variant.product.categoryId,
          sellingPrice: variant.sellingPrice,
          quantity: item.quantity,
        });
      }

      // 7. LOCK STEP 2: Lock Coupon row FOR UPDATE and consume coupon inside transaction (if couponCode provided)
      let couponValidationResult: {
        couponId: string;
        code: string;
        discountTotal: Prisma.Decimal;
        lineDiscounts: Map<string, Prisma.Decimal>;
        recordUsage?: () => Promise<void>;
      } | null = null;

      if (parsed.couponCode && parsed.couponCode.trim() !== '') {
        const validation = await validateAndConsumeCouponInTransaction(
          tx,
          parsed.couponCode,
          orderId,
          customer.id,
          normalizedMobile,
          couponInputs
        );
        couponValidationResult = {
          couponId: validation.couponId!,
          code: validation.code!,
          discountTotal: validation.discountTotal,
          lineDiscounts: validation.lineDiscounts,
          recordUsage: validation.recordUsage,
        };
      }

      // 8. LOCK STEP 3: Lock/Generate DocumentSequence (AFTER InventoryItem and Coupon locks!)
      const orderNumber = await generateOrderNumber('ONLINE', tx);

      const discountTotalNum = couponValidationResult ? Number(couponValidationResult.discountTotal) : 0;
      const lineDiscountsMap = couponValidationResult?.lineDiscounts || new Map<string, Prisma.Decimal>();

      const preparedItems = parsed.items.map((item) => {
        const variant = varMap.get(item.variantId)!;
        const unitPriceNum = Number(variant.sellingPrice);
        const mrpNum = Number(variant.mrp);
        const grossLineTotalNum = unitPriceNum * item.quantity;
        const lineDiscountDecimal = lineDiscountsMap.get(item.variantId) || new Prisma.Decimal('0.00');
        const lineDiscountNum = Number(lineDiscountDecimal);
        const netLineTotalNum = Math.max(0, grossLineTotalNum - lineDiscountNum);

        return {
          variantId: item.variantId,
          productNameSnapshot: variant.product.name,
          variantTitleSnapshot: variant.title,
          skuSnapshot: variant.sku,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(unitPriceNum),
          mrp: new Prisma.Decimal(mrpNum),
          discountAmount: lineDiscountDecimal,
          lineTotal: new Prisma.Decimal(netLineTotalNum),
        };
      });

      const shippingFeeNum = Number(parsed.shippingFee);
      const taxTotalNum = 0; // Preserved Phase 5/6 tax calculation architecture
      const grandTotalNum = Math.max(0, subtotalNum - discountTotalNum) + shippingFeeNum + taxTotalNum;

      // 9 & 10. Create Order & OrderItems Header
      const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days TTL
      const reservationExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes reservation TTL

      const order = await tx.order.create({
        data: {
          id: orderId,
          orderNumber,
          salesChannel: SalesChannel.ONLINE,
          status: OrderStatus.RECEIVED,
          paymentStatus: PaymentStatus.PENDING,
          creationIdempotencyKey: parsed.creationIdempotencyKey,
          guestAccessTokenExpiresAt: tokenExpiresAt,
          reservationExpiresAt,
          customerId: customer.id,
          customerNameSnapshot: parsed.customer.name,
          customerMobileSnapshot: normalizedMobile,
          customerEmailSnapshot: parsed.customer.email || null,
          shippingAddressSnapshot: parsed.customer.shippingAddress || parsed.customer.address || null,
          billingAddressSnapshot: parsed.customer.billingAddress || parsed.customer.address || null,
          subtotal: new Prisma.Decimal(subtotalNum),
          shippingFee: new Prisma.Decimal(shippingFeeNum),
          discountTotal: new Prisma.Decimal(discountTotalNum),
          taxTotal: new Prisma.Decimal(taxTotalNum),
          grandTotal: new Prisma.Decimal(grandTotalNum),
          couponId: couponValidationResult?.couponId || null,
          couponCodeSnapshot: couponValidationResult?.code || null,
          notes: parsed.notes || null,
          items: {
            create: preparedItems,
          },
        },
        include: { items: true, customer: true, statusTransitions: true, coupon: true, couponUsage: true },
      });

      if (couponValidationResult?.recordUsage) {
        await couponValidationResult.recordUsage();
      }

      // 11. Increment reservedStock for each variant
      for (const item of parsed.items) {
        await tx.inventoryItem.update({
          where: { variantId: item.variantId },
          data: { reservedStock: { increment: item.quantity } },
        });
      }

      // 12. Verify Invariants
      const updatedInvs = await tx.inventoryItem.findMany({
        where: { variantId: { in: variantIds } },
      });
      for (const inv of updatedInvs) {
        if (inv.reservedStock > inv.physicalStock) {
          throw new Error(`INVARIANT_VIOLATION: Reserved stock (${inv.reservedStock}) exceeds physical stock (${inv.physicalStock})`);
        }
      }

      // 13. Create ORDER_RECEIVED outbox notification inside transaction
      const notif = await createNotificationInOutbox(tx, {
        orderId: order.id,
        eventType: 'ORDER_RECEIVED',
        recipientMobile: normalizedMobile,
        payload: {
          customerName: parsed.customer.name,
          orderNumber,
          grandTotal: grandTotalNum.toFixed(2),
        },
      });

      return { order, notificationId: notif.id };
    });

    // Post-commit: Optional unawaited latency acceleration (failures do not impact order transaction)
    if (result.notificationId) {
      processNotification(result.notificationId).catch(() => {});
    }

    return result.order;
  } catch (err: any) {
    if (isTargetConstraint(err, 'creation_idempotency_key')) {
      return await prisma.order.findUniqueOrThrow({
        where: { creationIdempotencyKey: parsed.creationIdempotencyKey },
        include: { items: true, customer: true, statusTransitions: true, coupon: true, couponUsage: true },
      });
    }
    throw err;
  }
}


/**
 * DIRECT SALE Engine (Over-the-counter POS)
 */
export async function createDirectSale(input: CreateDirectSaleInput) {
  const parsed = createDirectSaleSchema.parse(input);

  // Check mandatory creation idempotency before transaction
  const existingOrder = await prisma.order.findUnique({
    where: { creationIdempotencyKey: parsed.creationIdempotencyKey },
    include: { items: true, customer: true, statusTransitions: true },
  });
  if (existingOrder) {
    return existingOrder;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Double check creation idempotency inside transaction
      const txExisting = await tx.order.findUnique({
        where: { creationIdempotencyKey: parsed.creationIdempotencyKey },
        include: { items: true, customer: true, statusTransitions: true },
      });
      if (txExisting) {
        return txExisting;
      }

      // 2. Normalize & Resolve Customer
      const { customer, normalizedMobile } = await resolveCustomer(parsed.customer);

      // 3. Sort variant IDs deterministically
      const variantIds = Array.from(new Set(parsed.items.map((i) => i.variantId))).sort();

      // 4. Lock InventoryItem rows in ascending variant ID order
      for (const vId of variantIds) {
        await tx.$queryRaw`SELECT * FROM inventory_items WHERE variant_id = ${vId} FOR UPDATE`;
      }

      // Fetch InventoryItems & ProductVariants
      const inventoryItems = await tx.inventoryItem.findMany({
        where: { variantId: { in: variantIds } },
      });

      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: { product: true },
      });

      const invMap = new Map(inventoryItems.map((inv) => [inv.variantId, inv]));
      const varMap = new Map(variants.map((v) => [v.id, v]));

      // 5 & 6. Validate Available Stock
      for (const item of parsed.items) {
        const inv = invMap.get(item.variantId);
        if (!inv) {
          throw new Error(`Inventory item for variant ${item.variantId} not found`);
        }
        const availableStock = inv.physicalStock - inv.reservedStock;
        if (availableStock < item.quantity) {
          throw new Error(
            `INSUFFICIENT_AVAILABLE_STOCK: Variant ${item.variantId} has available stock ${availableStock}, requested ${item.quantity}`
          );
        }
      }

      // 7. Lock/Generate DocumentSequence (AFTER InventoryItem locks!)
      const orderNumber = await generateOrderNumber('DIRECT', tx);

      // Calculate commercial totals
      let subtotalNum = 0;
      const preparedItems = parsed.items.map((item) => {
        const variant = varMap.get(item.variantId)!;
        const unitPriceNum = Number(variant.sellingPrice);
        const mrpNum = Number(variant.mrp);
        const lineTotalNum = unitPriceNum * item.quantity;
        subtotalNum += lineTotalNum;

        return {
          variantId: item.variantId,
          productNameSnapshot: variant.product.name,
          variantTitleSnapshot: variant.title,
          skuSnapshot: variant.sku,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(unitPriceNum),
          mrp: new Prisma.Decimal(mrpNum),
          discountAmount: new Prisma.Decimal(0),
          lineTotal: new Prisma.Decimal(lineTotalNum),
        };
      });

      const grandTotalNum = subtotalNum;
      const transactionNow = new Date();

      // 8 & 9. Create Order Header & OrderItems
      // deliveredAt = transaction timestamp (now()), confirmedAt = null, dispatchedAt = null
      // ZERO OrderStatusTransition is created!
      const order = await tx.order.create({
        data: {
          orderNumber,
          salesChannel: SalesChannel.DIRECT,
          status: OrderStatus.DELIVERED,
          paymentStatus: PaymentStatus.PAID,
          creationIdempotencyKey: parsed.creationIdempotencyKey,
          customerId: customer.id,
          customerNameSnapshot: parsed.customer.name,
          customerMobileSnapshot: normalizedMobile,
          customerEmailSnapshot: parsed.customer.email || null,
          shippingAddressSnapshot: parsed.customer.address || null,
          billingAddressSnapshot: parsed.customer.address || null,
          subtotal: new Prisma.Decimal(subtotalNum),
          discountTotal: new Prisma.Decimal(0),
          taxTotal: new Prisma.Decimal(0),
          grandTotal: new Prisma.Decimal(grandTotalNum),
          deliveredAt: transactionNow,
          confirmedAt: null,
          dispatchedAt: null,
          notes: parsed.notes || null,
          items: {
            create: preparedItems,
          },
        },
        include: { items: true, customer: true, statusTransitions: true },
      });

      let totalOrderFifoCogs = 0;

      // 10 & 11 & 12. FIFO Layer Consumption & SALE_OUT Movements with Deterministic Keys
      for (const orderItem of order.items) {
        let neededQty = orderItem.quantity;
        let itemFifoCogs = 0;
        let consumptionIndex = 1;

        // Fetch active FIFO layers for this variant in strict order (createdAt ASC, id ASC)
        const fifoLayers = await tx.fifoLayer.findMany({
          where: {
            variantId: orderItem.variantId,
            remainingQuantity: { gt: 0 },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });

        for (const layer of fifoLayers) {
          if (neededQty <= 0) break;

          const takeQty = Math.min(layer.remainingQuantity, neededQty);
          const layerUnitCost = Number(layer.unitCost);
          const portionCost = takeQty * layerUnitCost;

          itemFifoCogs += portionCost;
          neededQty -= takeQty;

          // Decrement FIFO layer remaining quantity
          await tx.fifoLayer.update({
            where: { id: layer.id },
            data: { remainingQuantity: { decrement: takeQty } },
          });

          // Create SALE_OUT InventoryMovement with deterministic key
          const movementKey = `SALE_OUT:${order.id}:${orderItem.id}:${consumptionIndex}`;
          consumptionIndex++;

          await tx.inventoryMovement.create({
            data: {
              variantId: orderItem.variantId,
              type: 'SALE_OUT',
              quantity: -takeQty,
              unitCost: new Prisma.Decimal(layerUnitCost),
              totalCost: new Prisma.Decimal(portionCost),
              referenceId: order.id,
              idempotencyKey: movementKey,
            },
          });
        }

        if (neededQty > 0) {
          throw new Error(
            `INSUFFICIENT_FIFO_LAYERS: Variant ${orderItem.variantId} missing ${neededQty} units in FIFO layers`
          );
        }

        // Update OrderItem fifoCogs
        await tx.orderItem.update({
          where: { id: orderItem.id },
          data: { fifoCogs: new Prisma.Decimal(itemFifoCogs) },
        });

        totalOrderFifoCogs += itemFifoCogs;

        // Decrease physicalStock on InventoryItem (reservedStock is untouched!)
        await tx.inventoryItem.update({
          where: { variantId: orderItem.variantId },
          data: { physicalStock: { decrement: orderItem.quantity } },
        });
      }

      // Update totalFifoCogs on Order Header
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: { totalFifoCogs: new Prisma.Decimal(totalOrderFifoCogs) },
        include: { items: true, customer: true, statusTransitions: true },
      });

      // 14. Verify Invariants
      const updatedInvs = await tx.inventoryItem.findMany({
        where: { variantId: { in: variantIds } },
      });
      for (const inv of updatedInvs) {
        if (inv.physicalStock < 0 || inv.reservedStock < 0) {
          throw new Error(`INVARIANT_VIOLATION: Negative stock detected for variant ${inv.variantId}`);
        }
        if (inv.reservedStock > inv.physicalStock) {
          throw new Error(`INVARIANT_VIOLATION: Reserved stock (${inv.reservedStock}) exceeds physical stock (${inv.physicalStock})`);
        }
      }

      return updatedOrder;
    });
  } catch (err: any) {
    if (isTargetConstraint(err, 'creation_idempotency_key')) {
      return await prisma.order.findUniqueOrThrow({
        where: { creationIdempotencyKey: parsed.creationIdempotencyKey },
        include: { items: true, customer: true, statusTransitions: true },
      });
    }
    throw err;
  }
}

/**
 * State Transition Engine (CONFIRMED, DISPATCHED, DELIVERED, CANCELLED)
 */
export async function transitionOrderStatus(input: TransitionOrderStatusInput) {
  const parsed = transitionOrderStatusSchema.parse(input);

  // Check if transition idempotency key already exists
  const existingTransition = await prisma.orderStatusTransition.findUnique({
    where: { idempotencyKey: parsed.idempotencyKey },
    include: { order: true },
  });

  if (existingTransition) {
    // If found AND transition matches: return current order state with zero mutations
    if (existingTransition.orderId === parsed.orderId && existingTransition.toStatus === parsed.targetStatus) {
      return await prisma.order.findUniqueOrThrow({
        where: { id: parsed.orderId },
        include: { items: true, customer: true, statusTransitions: true, shipment: true },
      });
    }
    // If found AND transition conflicts: throw error with zero mutations
    throw new Error(
      `CONFLICTING_IDEMPOTENCY_KEY_REUSE: Key ${parsed.idempotencyKey} was previously used for order ${existingTransition.orderId} transition to ${existingTransition.toStatus}`
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Pre-fetch order items to determine variant IDs for canonical lock ordering
      const initialOrder = await tx.order.findUniqueOrThrow({
        where: { id: parsed.orderId },
        include: { items: true },
      });

      const variantIds = Array.from(new Set(initialOrder.items.map((i) => i.variantId))).sort();

      // Step A (Lock #1 - InventoryItem ASC): Lock InventoryItem rows FIRST to preserve canonical lock hierarchy
      for (const vId of variantIds) {
        await tx.$queryRaw`SELECT * FROM inventory_items WHERE variant_id = ${vId} FOR UPDATE`;
      }

      // Step B (Lock #4 - Order): Lock Order row SECOND to preserve canonical lock hierarchy
      const orderRows = await tx.$queryRaw<any[]>`SELECT * FROM orders WHERE id = ${parsed.orderId} FOR UPDATE`;
      if (!orderRows || orderRows.length === 0) {
        throw new Error(`Order ${parsed.orderId} not found`);
      }

      // Check if transition idempotency key was inserted by a concurrent transaction that won the lock race
      const txExistingTrans = await tx.orderStatusTransition.findUnique({
        where: { idempotencyKey: parsed.idempotencyKey },
      });
      if (txExistingTrans) {
        if (txExistingTrans.orderId === parsed.orderId && txExistingTrans.toStatus === parsed.targetStatus) {
          const ord = await tx.order.findUniqueOrThrow({
            where: { id: parsed.orderId },
            include: { items: true, customer: true, statusTransitions: true, shipment: true },
          });
          return { order: ord, notificationIdToTrigger: null };
        }
        throw new Error(
          `CONFLICTING_IDEMPOTENCY_KEY_REUSE: Key ${parsed.idempotencyKey} was reused for conflicting transition`
        );
      }

      const order = await tx.order.findUniqueOrThrow({
        where: { id: parsed.orderId },
        include: { items: true, shipment: true },
      });

      const currentStatus = order.status;
      const targetStatus = parsed.targetStatus;

      // 2. Validate allowed status transitions
      const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
        [OrderStatus.CONTACTED]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
        [OrderStatus.RECEIVED]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
        [OrderStatus.CONFIRMED]: [OrderStatus.DISPATCHED, OrderStatus.CANCELLED],
        [OrderStatus.DISPATCHED]: [OrderStatus.DELIVERED],
        [OrderStatus.DELIVERED]: [],
        [OrderStatus.CANCELLED]: [],
      };

      if (!allowedTransitions[currentStatus]?.includes(targetStatus)) {
        throw new Error(
          `INVALID_STATUS_TRANSITION: Cannot transition order ${order.id} from ${currentStatus} to ${targetStatus}`
        );
      }

      const transitionNow = new Date();

      // 3. Execute transition-specific logic
      let notificationIdToTrigger: string | null = null;

      if (targetStatus === OrderStatus.CONFIRMED) {
        if (currentStatus === OrderStatus.CONTACTED) {
          // WHATSAPP flow: Re-check physical stock, deduct physical stock, consume FIFO, create SALE_OUT
          const invs = await tx.inventoryItem.findMany({
            where: { variantId: { in: variantIds } },
          });
          const invMap = new Map(invs.map((inv) => [inv.variantId, inv]));

          for (const item of order.items) {
            const inv = invMap.get(item.variantId);
            if (!inv || inv.physicalStock < item.quantity) {
              throw new Error(
                `INSUFFICIENT_STOCK: Item '${item.productNameSnapshot} (${item.variantTitleSnapshot})' requires ${item.quantity} units, but only ${inv?.physicalStock || 0} physically available.`
              );
            }
          }

          let totalOrderFifoCogs = 0;

          // Deduct physical stock, consume FIFO layers, create SALE_OUT movements
          for (const orderItem of order.items) {
            let neededQty = orderItem.quantity;
            let itemFifoCogs = 0;
            let consumptionIndex = 1;

            const fifoLayers = await tx.fifoLayer.findMany({
              where: {
                variantId: orderItem.variantId,
                remainingQuantity: { gt: 0 },
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            });

            for (const layer of fifoLayers) {
              if (neededQty <= 0) break;

              const takeQty = Math.min(layer.remainingQuantity, neededQty);
              const layerUnitCost = Number(layer.unitCost);
              const portionCost = takeQty * layerUnitCost;

              itemFifoCogs += portionCost;
              neededQty -= takeQty;

              await tx.fifoLayer.update({
                where: { id: layer.id },
                data: { remainingQuantity: { decrement: takeQty } },
              });

              const movementKey = `SALE_OUT:${order.id}:${orderItem.id}:${consumptionIndex}`;
              consumptionIndex++;

              await tx.inventoryMovement.create({
                data: {
                  variantId: orderItem.variantId,
                  type: 'SALE_OUT',
                  quantity: -takeQty,
                  unitCost: new Prisma.Decimal(layerUnitCost),
                  totalCost: new Prisma.Decimal(portionCost),
                  referenceId: order.id,
                  idempotencyKey: movementKey,
                },
              });
            }

            if (neededQty > 0) {
              throw new Error(
                `INSUFFICIENT_FIFO_LAYERS: Variant ${orderItem.variantId} missing ${neededQty} units in FIFO layers during confirmation`
              );
            }

            await tx.orderItem.update({
              where: { id: orderItem.id },
              data: { fifoCogs: new Prisma.Decimal(itemFifoCogs) },
            });

            totalOrderFifoCogs += itemFifoCogs;

            // Decrement physicalStock on InventoryItem (reservedStock is UNTOUCHED because CONTACTED never reserved it)
            await tx.inventoryItem.update({
              where: { variantId: orderItem.variantId },
              data: { physicalStock: { decrement: orderItem.quantity } },
            });
          }

          // Consume coupon usage if coupon was applied to this order
          if (order.couponId) {
            const lockedCoupons = await tx.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM coupons WHERE id = ${order.couponId} FOR UPDATE
            `;
            if (!lockedCoupons || lockedCoupons.length === 0) {
              throw new Error(`COUPON_NOT_FOUND: Coupon associated with order no longer exists.`);
            }

            const coupon = await tx.coupon.findUniqueOrThrow({
              where: { id: order.couponId },
            });

            if (coupon.status !== 'ACTIVE') {
              throw new Error(`COUPON_INACTIVE: Coupon '${coupon.code}' is no longer active.`);
            }

            const now = new Date();
            if (coupon.startDate && now < coupon.startDate) {
              throw new Error(`COUPON_NOT_YET_ACTIVE: Coupon '${coupon.code}' is not active yet.`);
            }

            if (coupon.endDate && now > coupon.endDate) {
              throw new Error(`COUPON_EXPIRED: Coupon '${coupon.code}' has expired.`);
            }

            if (coupon.usageLimitGlobal !== null && coupon.usageCountGlobal >= coupon.usageLimitGlobal) {
              throw new Error(`COUPON_LIMIT_REACHED: Coupon '${coupon.code}' has reached its global usage limit.`);
            }

            if (coupon.usageLimitPerCustomer !== null) {
              const normalizedMobile = normalizeIndiaMobile(order.customerMobileSnapshot);
              const customerUsageCount = await tx.couponUsage.count({
                where: {
                  couponId: coupon.id,
                  customerMobile: normalizedMobile,
                  status: 'ACTIVE',
                },
              });
              if (customerUsageCount >= coupon.usageLimitPerCustomer) {
                throw new Error(
                  `COUPON_CUSTOMER_LIMIT_REACHED: Customer has reached maximum usage limit for coupon '${coupon.code}'.`
                );
              }
            }

            await tx.coupon.update({
              where: { id: order.couponId },
              data: { usageCountGlobal: { increment: 1 } },
            });

            await tx.couponUsage.create({
              data: {
                couponId: order.couponId,
                orderId: order.id,
                customerId: order.customerId,
                customerMobile: order.customerMobileSnapshot,
                discountAmount: order.discountTotal,
              },
            });
          }

          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.CONFIRMED,
              confirmedAt: transitionNow,
              totalFifoCogs: new Prisma.Decimal(totalOrderFifoCogs),
              ...(parsed.paymentMethod ? { paymentMethod: parsed.paymentMethod } : {}),
              ...(parsed.paymentStatus ? { paymentStatus: parsed.paymentStatus } : {}),
            },
          });

          // Create ORDER_CONFIRMED outbox notification inside transaction
          const notif = await createNotificationInOutbox(tx, {
            orderId: order.id,
            eventType: 'ORDER_CONFIRMED',
            recipientMobile: order.customerMobileSnapshot,
            payload: {
              customerName: order.customerNameSnapshot,
              orderNumber: order.orderNumber,
            },
          });
          notificationIdToTrigger = notif.id;
        } else {
          // Legacy RECEIVED -> CONFIRMED
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.CONFIRMED,
              confirmedAt: transitionNow,
            },
          });

          // Create ORDER_CONFIRMED outbox notification inside transaction
          const notif = await createNotificationInOutbox(tx, {
            orderId: order.id,
            eventType: 'ORDER_CONFIRMED',
            recipientMobile: order.customerMobileSnapshot,
            payload: {
              customerName: order.customerNameSnapshot,
              orderNumber: order.orderNumber,
            },
          });
          notificationIdToTrigger = notif.id;
        }
      } else if (targetStatus === OrderStatus.DISPATCHED) {
        // Validate required shipment payload for dispatch
        if (!parsed.shipment || !parsed.shipment.courierName || !parsed.shipment.trackingId) {
          throw new Error(
            `MISSING_SHIPMENT_DETAILS: Courier name and tracking ID are required for order dispatch`
          );
        }

        if (order.shipment) {
          throw new Error(
            `SHIPMENT_ALREADY_EXISTS: Order ${order.orderNumber} already has an active shipment`
          );
        }

        if (order.salesChannel === SalesChannel.WHATSAPP) {
          // WHATSAPP flow: inventory was ALREADY deducted and FIFO was ALREADY consumed at confirmation!
          // DO NOT deduct stock or consume FIFO here.
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.DISPATCHED,
              dispatchedAt: transitionNow,
            },
          });

          await tx.shipment.create({
            data: {
              orderId: order.id,
              courierName: parsed.shipment.courierName.trim(),
              trackingId: parsed.shipment.trackingId.trim(),
              trackingUrl: parsed.shipment.trackingUrl ? parsed.shipment.trackingUrl.trim() : null,
              status: 'DISPATCHED',
              dispatchedAt: transitionNow,
            },
          });

          const notif = await createNotificationInOutbox(tx, {
            orderId: order.id,
            eventType: 'ORDER_DISPATCHED',
            recipientMobile: order.customerMobileSnapshot,
            payload: {
              customerName: order.customerNameSnapshot,
              orderNumber: order.orderNumber,
              courierName: parsed.shipment.courierName.trim(),
              trackingId: parsed.shipment.trackingId.trim(),
              trackingUrl: parsed.shipment.trackingUrl ? parsed.shipment.trackingUrl.trim() : 'N/A',
            },
          });
          notificationIdToTrigger = notif.id;
        } else {
          // Legacy ONLINE flow: verify reserved stock, consume FIFO, decrement physical & reserved stock
          const invs = await tx.inventoryItem.findMany({
            where: { variantId: { in: variantIds } },
          });
          const invMap = new Map(invs.map((inv) => [inv.variantId, inv]));

          // Verify owned reservation entitlement for each variant
          for (const item of order.items) {
            const inv = invMap.get(item.variantId);
            if (!inv || inv.reservedStock < item.quantity) {
              throw new Error(
                `INSUFFICIENT_RESERVED_STOCK: Order ${order.id} requires ${item.quantity} reserved units for variant ${item.variantId}, but found ${inv?.reservedStock || 0}`
              );
            }
          }

          let totalOrderFifoCogs = 0;

          // Consume FIFO layers and create SALE_OUT movements with deterministic keys
          for (const orderItem of order.items) {
            let neededQty = orderItem.quantity;
            let itemFifoCogs = 0;
            let consumptionIndex = 1;

            const fifoLayers = await tx.fifoLayer.findMany({
              where: {
                variantId: orderItem.variantId,
                remainingQuantity: { gt: 0 },
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            });

            for (const layer of fifoLayers) {
              if (neededQty <= 0) break;

              const takeQty = Math.min(layer.remainingQuantity, neededQty);
              const layerUnitCost = Number(layer.unitCost);
              const portionCost = takeQty * layerUnitCost;

              itemFifoCogs += portionCost;
              neededQty -= takeQty;

              await tx.fifoLayer.update({
                where: { id: layer.id },
                data: { remainingQuantity: { decrement: takeQty } },
              });

              const movementKey = `SALE_OUT:${order.id}:${orderItem.id}:${consumptionIndex}`;
              consumptionIndex++;

              await tx.inventoryMovement.create({
                data: {
                  variantId: orderItem.variantId,
                  type: 'SALE_OUT',
                  quantity: -takeQty,
                  unitCost: new Prisma.Decimal(layerUnitCost),
                  totalCost: new Prisma.Decimal(portionCost),
                  referenceId: order.id,
                  idempotencyKey: movementKey,
                },
              });
            }

            if (neededQty > 0) {
              throw new Error(
                `INSUFFICIENT_FIFO_LAYERS: Variant ${orderItem.variantId} missing ${neededQty} units in FIFO layers during dispatch`
              );
            }

            await tx.orderItem.update({
              where: { id: orderItem.id },
              data: { fifoCogs: new Prisma.Decimal(itemFifoCogs) },
            });

            totalOrderFifoCogs += itemFifoCogs;

            // Decrement both physicalStock and reservedStock by order's reserved quantity
            await tx.inventoryItem.update({
              where: { variantId: orderItem.variantId },
              data: {
                physicalStock: { decrement: orderItem.quantity },
                reservedStock: { decrement: orderItem.quantity },
              },
            });
          }

          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.DISPATCHED,
              dispatchedAt: transitionNow,
              totalFifoCogs: new Prisma.Decimal(totalOrderFifoCogs),
            },
          });

          // Create Shipment record (1-to-1 with Order)
          await tx.shipment.create({
            data: {
              orderId: order.id,
              courierName: parsed.shipment.courierName.trim(),
              trackingId: parsed.shipment.trackingId.trim(),
              trackingUrl: parsed.shipment.trackingUrl ? parsed.shipment.trackingUrl.trim() : null,
              status: 'DISPATCHED',
              dispatchedAt: transitionNow,
            },
          });

          // Create ORDER_DISPATCHED outbox notification inside transaction
          const notif = await createNotificationInOutbox(tx, {
            orderId: order.id,
            eventType: 'ORDER_DISPATCHED',
            recipientMobile: order.customerMobileSnapshot,
            payload: {
              customerName: order.customerNameSnapshot,
              orderNumber: order.orderNumber,
              courierName: parsed.shipment.courierName.trim(),
              trackingId: parsed.shipment.trackingId.trim(),
              trackingUrl: parsed.shipment.trackingUrl ? parsed.shipment.trackingUrl.trim() : 'N/A',
            },
          });
          notificationIdToTrigger = notif.id;
        }
      } else if (targetStatus === OrderStatus.DELIVERED) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.DELIVERED,
            deliveredAt: transitionNow,
          },
        });

        // Update linked Shipment status and timestamp if shipment exists
        await tx.shipment.updateMany({
          where: { orderId: order.id },
          data: {
            status: 'DELIVERED',
            deliveredAt: transitionNow,
          },
        });
        // ZERO Notification created for DELIVERED!
      } else if (targetStatus === OrderStatus.CANCELLED) {
        if (currentStatus === OrderStatus.CONFIRMED) {
          // Disallow cancellation if shipment already exists
          if (order.shipment) {
            throw new Error(
              `ORDER_ALREADY_DISPATCHED: Order ${order.orderNumber} already has an active shipment and cannot be cancelled.`
            );
          }

          let newPaymentStatus = order.paymentStatus;

          // Paid vs DUE handling
          if (order.paymentStatus === PaymentStatus.PAID) {
            if (!parsed.refundMethod) {
              throw new Error(
                `REFUND_METHOD_REQUIRED: Select a refund method before cancelling this paid order.`
              );
            }

            const refundAmount = Number(order.grandTotal);
            const shippingRefund = Number(order.shippingFee);

            // DocumentSequence (#3 in canonical lock order)
            let seq = await tx.documentSequence.findUnique({ where: { code: 'REFUND' } });
            if (!seq) {
              seq = await tx.documentSequence.create({ data: { code: 'REFUND', nextValue: 1001 } });
            }
            await tx.$executeRaw`SELECT * FROM document_sequences WHERE code = 'REFUND' FOR UPDATE;`;
            const nextVal = seq.nextValue;
            await tx.documentSequence.update({
              where: { code: 'REFUND' },
              data: { nextValue: { increment: 1 } },
            });
            const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const refundNumber = `REF-${datePrefix}-${String(nextVal).padStart(4, '0')}`;

            let refundMethodEnum: RefundMethod = RefundMethod.CASH;
            let resolutionType: ManualRefundResolutionType = ManualRefundResolutionType.OFFLINE_SETTLED_CASH;
            let providerRefundId = 'OFFLINE_CASH';

            if (parsed.refundMethod === 'BANK_TRANSFER') {
              refundMethodEnum = RefundMethod.BANK_TRANSFER;
              resolutionType = ManualRefundResolutionType.OFFLINE_SETTLED_BANK;
              providerRefundId = 'OFFLINE_BANK_TRANSFER';
            } else if (parsed.refundMethod === 'UPI') {
              refundMethodEnum = RefundMethod.BANK_TRANSFER;
              resolutionType = ManualRefundResolutionType.OFFLINE_SETTLED_BANK;
              providerRefundId = 'OFFLINE_UPI';
            }

            // Find and lock linked payment if exists
            const payment = await tx.payment.findFirst({
              where: { orderId: order.id },
            });
            if (payment) {
              await tx.$executeRaw`SELECT * FROM payments WHERE id = ${payment.id} FOR UPDATE;`;
            }

            // Line refund allocations
            const netMerchTotal = Number(order.subtotal) - Number(order.discountTotal);
            const lineAllocationsData = [];
            for (const orderItem of order.items) {
              const lineNetValue = Number(orderItem.lineTotal);
              let lineTaxAllocation = 0;
              if (netMerchTotal > 0 && Number(order.taxTotal) > 0) {
                lineTaxAllocation = Number(((Number(order.taxTotal) * lineNetValue) / netMerchTotal).toFixed(2));
              }
              const lineRefundTotal = lineNetValue + lineTaxAllocation;
              lineAllocationsData.push({
                orderItemId: orderItem.id,
                merchandiseRefund: orderItem.lineTotal,
                discountDeduction: new Prisma.Decimal(0),
                taxRefund: new Prisma.Decimal(lineTaxAllocation),
                lineRefundTotal: new Prisma.Decimal(lineRefundTotal),
              });
            }

            const refundIdempotencyKey = `REFUND_CANCEL:${order.id}:${parsed.refundMethod}`;
            await tx.refund.create({
              data: {
                refundNumber,
                orderId: order.id,
                paymentId: payment ? payment.id : null,
                purpose: RefundPurpose.ORDER_REFUND,
                provider: PaymentProvider.MOCK,
                method: refundMethodEnum,
                status: RefundStatus.COMPLETED,
                amount: new Prisma.Decimal(refundAmount),
                shippingRefund: new Prisma.Decimal(shippingRefund),
                currency: 'INR',
                idempotencyKey: refundIdempotencyKey,
                processedAt: transitionNow,
                resolvedAt: transitionNow,
                manualResolutionType: resolutionType,
                manualResolutionNotes: parsed.notes
                  ? `Refunded via ${parsed.refundMethod}: ${parsed.notes}`
                  : `Refunded via ${parsed.refundMethod}`,
                providerRefundId,
                allocations: {
                  create: lineAllocationsData,
                },
              },
            });

            newPaymentStatus = PaymentStatus.REFUNDED;
          }

          // 1. Restore physical inventory for each order item
          for (const item of order.items) {
            await tx.inventoryItem.update({
              where: { variantId: item.variantId },
              data: { physicalStock: { increment: item.quantity } },
            });
          }

          // 2. Query original SALE_OUT movements for this order
          const saleMovements = await tx.inventoryMovement.findMany({
            where: {
              referenceId: order.id,
              type: 'SALE_OUT',
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          });

          // 3. Restore FIFO layers in LIFO order (reverse of consumption)
          if (saleMovements.length > 0) {
            for (let i = saleMovements.length - 1; i >= 0; i--) {
              const sm = saleMovements[i];
              const restoreQty = Math.abs(sm.quantity);
              await tx.fifoLayer.create({
                data: {
                  variantId: sm.variantId,
                  initialQuantity: restoreQty,
                  remainingQuantity: restoreQty,
                  unitCost: sm.unitCost ?? new Prisma.Decimal(0),
                  referenceId: `CANCEL_${order.id}`,
                },
              });
            }
          } else {
            // Fallback for orders without separate SALE_OUT records
            for (const item of order.items) {
              const fallbackUnitCost = item.fifoCogs
                ? Number(item.fifoCogs) / item.quantity
                : Number(item.unitPrice);
              await tx.fifoLayer.create({
                data: {
                  variantId: item.variantId,
                  initialQuantity: item.quantity,
                  remainingQuantity: item.quantity,
                  unitCost: new Prisma.Decimal(fallbackUnitCost || 0),
                  referenceId: `CANCEL_${order.id}`,
                },
              });
            }
          }

          // 4. Create auditable ADJUSTMENT_IN reversal movements (one per orderItem)
          for (const item of order.items) {
            const variantSales = saleMovements.filter((m) => m.variantId === item.variantId);
            const restoredCost =
              variantSales.reduce((sum, m) => sum + Number(m.totalCost || 0), 0) ||
              Number(item.fifoCogs);

            await tx.inventoryMovement.create({
              data: {
                variantId: item.variantId,
                type: 'ADJUSTMENT_IN',
                quantity: item.quantity,
                unitCost: new Prisma.Decimal(item.quantity > 0 ? restoredCost / item.quantity : 0),
                totalCost: new Prisma.Decimal(restoredCost),
                reason: 'PHYSICAL_CORRECTION',
                referenceId: order.id,
                idempotencyKey: `ADJUSTMENT_IN_CANCEL:${order.id}:${item.id}`,
                notes: `Cancellation stock reversal for Order ${order.orderNumber}`,
              },
            });
          }

          // 5. Restore coupon usage if coupon was consumed
          if (order.couponId) {
            const lockedCoupons = await tx.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM coupons WHERE id = ${order.couponId} FOR UPDATE
            `;
            if (lockedCoupons && lockedCoupons.length > 0) {
              await tx.coupon.update({
                where: { id: order.couponId },
                data: { usageCountGlobal: { decrement: 1 } },
              });

              await tx.couponUsage.updateMany({
                where: {
                  orderId: order.id,
                  couponId: order.couponId,
                  status: 'ACTIVE',
                },
                data: {
                  status: 'REVERSED',
                  reversedAt: transitionNow,
                  reversalReason: 'ORDER_CANCELLED',
                },
              });
            }
          }

          // 6. Update order status, cancelledAt, and paymentStatus
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.CANCELLED,
              cancelledAt: transitionNow,
              paymentStatus: newPaymentStatus,
            },
          });
        } else if (currentStatus === OrderStatus.RECEIVED) {
          // Legacy ONLINE flow: Release reserved stock without touching physical stock or FIFO layers
          const invs = await tx.inventoryItem.findMany({
            where: { variantId: { in: variantIds } },
          });
          const invMap = new Map(invs.map((inv) => [inv.variantId, inv]));

          for (const item of order.items) {
            const inv = invMap.get(item.variantId);
            if (!inv || inv.reservedStock < item.quantity) {
              throw new Error(
                `INSUFFICIENT_RESERVED_STOCK_FOR_CANCELLATION: Variant ${item.variantId} reserved stock ${inv?.reservedStock || 0} is less than order quantity ${item.quantity}`
              );
            }
          }

          // Release reserved stock on InventoryItem
          for (const item of order.items) {
            await tx.inventoryItem.update({
              where: { variantId: item.variantId },
              data: { reservedStock: { decrement: item.quantity } },
            });
          }

          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.CANCELLED,
              cancelledAt: transitionNow,
            },
          });
        } else {
          // If currentStatus is CONTACTED: zero stock was reserved, so zero inventory changes!
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.CANCELLED,
              cancelledAt: transitionNow,
            },
          });
        }
      }

      // 4. Create OrderStatusTransition log record
      await tx.orderStatusTransition.create({
        data: {
          orderId: order.id,
          idempotencyKey: parsed.idempotencyKey,
          fromStatus: currentStatus,
          toStatus: targetStatus,
          notes: parsed.notes || null,
        },
      });

      // 5. Return updated Order with relations
      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true, customer: true, statusTransitions: true, shipment: true },
      });

      return { order: updatedOrder, notificationIdToTrigger };
    }).then((res) => {
      // Post-commit: Optional unawaited latency acceleration
      if (res.notificationIdToTrigger) {
        processNotification(res.notificationIdToTrigger).catch(() => {});
      }
      return res.order;
    });

  } catch (err: any) {
    if (isTargetConstraint(err, 'idempotency_key')) {
      const existing = await prisma.orderStatusTransition.findUnique({
        where: { idempotencyKey: parsed.idempotencyKey },
      });
      if (existing && existing.orderId === parsed.orderId && existing.toStatus === parsed.targetStatus) {
        return await prisma.order.findUniqueOrThrow({
          where: { id: parsed.orderId },
          include: { items: true, customer: true, statusTransitions: true, shipment: true },
        });
      }
      throw new Error(
        `CONFLICTING_IDEMPOTENCY_KEY_REUSE: Key ${parsed.idempotencyKey} was reused for conflicting transition`
      );
    }
    throw err;
  }
}

/**
 * Deletes a CONTACTED order and its dependent records.
 * Only CONTACTED orders can be deleted (CONFIRMED, DISPATCHED, DELIVERED, CANCELLED cannot be deleted).
 * Because CONTACTED orders never touch inventory/FIFO/financial ledgers, no inventory reversal is needed.
 */
export async function deleteContactedOrder(orderId: string) {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new Error(`ORDER_NOT_FOUND: Order with ID '${orderId}' does not exist.`);
    }

    if (order.status !== OrderStatus.CONTACTED) {
      throw new Error(
        `CANNOT_DELETE_ORDER: Only CONTACTED orders can be deleted. Order ${order.orderNumber} has status ${order.status}.`
      );
    }

    // Clean up dependent records respecting foreign key constraints
    await tx.orderItem.deleteMany({ where: { orderId } });
    await tx.orderStatusTransition.deleteMany({ where: { orderId } });
    await tx.notification.deleteMany({ where: { orderId } });

    await tx.order.delete({ where: { id: orderId } });

    return { success: true, deletedOrderId: orderId };
  });
}

export interface UpdateOrderPaymentAdminInput {
  orderId: string;
  paymentMethod?: PaymentMethod | null;
  paymentStatus?: PaymentStatus;
  notes?: string;
}

/**
 * Administrative action to update payment details (paymentMethod and/or paymentStatus).
 * 
 * Rules:
 * - If marking paymentStatus as PAID, the order MUST have a paymentMethod (either existing or newly specified).
 * - Supported payment methods: COD, UPI, CASH.
 * - Supported payment statuses: PAID, DUE (or any valid PaymentStatus).
 * - Zero inventory, stock, or FIFO changes are made.
 */
export async function updateOrderPaymentAdmin(input: UpdateOrderPaymentAdminInput) {
  const { orderId, paymentMethod, paymentStatus } = input;

  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error(`ORDER_NOT_FOUND: Order with ID '${orderId}' does not exist.`);
    }

    const effectivePaymentMethod = paymentMethod !== undefined ? paymentMethod : order.paymentMethod;

    if (paymentStatus === PaymentStatus.PAID && !effectivePaymentMethod) {
      throw new Error(
        'PAYMENT_METHOD_REQUIRED: Marking an order as PAID requires a valid payment method (COD, UPI, or CASH).'
      );
    }

    const dataToUpdate: Prisma.OrderUpdateInput = {};
    if (paymentMethod !== undefined) {
      dataToUpdate.paymentMethod = paymentMethod;
    }
    if (paymentStatus !== undefined) {
      dataToUpdate.paymentStatus = paymentStatus;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return order;
    }

    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: dataToUpdate,
      include: {
        customer: true,
        items: true,
        statusTransitions: true,
        shipment: true,
      },
    });

    return updatedOrder;
  });
}

/**
 * CONFIRM WHATSAPP ORDER SALE (Phase C)
 * Authoritative business operation to confirm a CONTACTED WhatsApp order.
 * Validates order channel, status, payment method and status.
 * Re-reads and locks inventory and order rows deterministically,
 * verifies available stock, consumes FIFO, creates SALE_OUT, consumes coupon,
 * updates order status to CONFIRMED and records selected paymentMethod & paymentStatus,
 * logs status transition, and enqueues ORDER_CONFIRMED notification.
 */
export async function confirmWhatsAppOrderSale(input: ConfirmWhatsAppOrderSaleInput) {
  const parsed = confirmWhatsAppOrderSaleSchema.parse(input);

  // 1. Initial Order Pre-Checks
  const order = await prisma.order.findUnique({
    where: { id: parsed.orderId },
    include: { items: true },
  });

  if (!order) {
    throw new Error(`ORDER_NOT_FOUND: Order ${parsed.orderId} does not exist`);
  }

  if (order.salesChannel !== SalesChannel.WHATSAPP) {
    throw new Error(
      `INVALID_SALES_CHANNEL: Only WHATSAPP orders can use Confirm WhatsApp Sale. Order ${order.orderNumber} has channel ${order.salesChannel}.`
    );
  }

  if (order.status !== OrderStatus.CONTACTED) {
    throw new Error(
      `INVALID_ORDER_STATUS: Only CONTACTED orders can be confirmed. Order ${order.orderNumber} has status ${order.status}.`
    );
  }

  if (!parsed.paymentMethod || !['COD', 'UPI', 'CASH'].includes(parsed.paymentMethod)) {
    throw new Error(
      `INVALID_PAYMENT_METHOD: Payment method is required and must be COD, UPI, or CASH. Received: ${parsed.paymentMethod}`
    );
  }

  if (!parsed.paymentStatus || !['DUE', 'PAID'].includes(parsed.paymentStatus)) {
    throw new Error(
      `INVALID_PAYMENT_STATUS: Payment status is required and must be DUE or PAID. Received: ${parsed.paymentStatus}`
    );
  }

  if (!order.items || order.items.length === 0) {
    throw new Error(`INVALID_ORDER_ITEMS: Order ${order.orderNumber} has no line items to confirm.`);
  }

  const idempotencyKey =
    parsed.idempotencyKey ||
    `CONFIRM_SALE:${order.id}:${parsed.paymentMethod}:${parsed.paymentStatus}`;

  const confirmedOrder = await transitionOrderStatus({
    orderId: parsed.orderId,
    idempotencyKey,
    targetStatus: OrderStatus.CONFIRMED,
    paymentMethod: parsed.paymentMethod as PaymentMethod,
    paymentStatus: parsed.paymentStatus as PaymentStatus,
    notes: parsed.notes || `Confirmed sale via Admin (${parsed.paymentMethod} / ${parsed.paymentStatus})`,
  });

  return confirmedOrder;
}

/**
 * ADMIN DISPATCH ORDER (Phase D)
 * Authoritative business operation to dispatch a CONFIRMED order.
 * Validates order status (strictly CONFIRMED), courier name, tracking ID, and shipment non-existence.
 * Transitions order status to DISPATCHED, persists shipment record with courier & tracking details,
 * records status transition audit, and queues ORDER_DISPATCHED notification.
 * Guarantees ZERO inventory/FIFO/COGS/coupon/payment mutation.
 */
export async function dispatchOrder(input: DispatchOrderInput) {
  const parsed = dispatchOrderSchema.parse(input);

  // 1. Initial Order Pre-Checks
  const order = await prisma.order.findUnique({
    where: { id: parsed.orderId },
    include: { shipment: true },
  });

  if (!order) {
    throw new Error(`ORDER_NOT_FOUND: Order ${parsed.orderId} does not exist`);
  }

  if (order.status !== OrderStatus.CONFIRMED) {
    throw new Error(
      `INVALID_ORDER_STATUS: Only CONFIRMED orders can be dispatched. Order ${order.orderNumber} has status ${order.status}.`
    );
  }

  if (order.shipment) {
    throw new Error(
      `SHIPMENT_ALREADY_EXISTS: Order ${order.orderNumber} already has an existing shipment.`
    );
  }

  const idempotencyKey =
    parsed.idempotencyKey || `DISPATCH:${order.id}:${parsed.trackingId.trim()}`;

  const dispatchedOrder = await transitionOrderStatus({
    orderId: parsed.orderId,
    idempotencyKey,
    targetStatus: OrderStatus.DISPATCHED,
    shipment: {
      courierName: parsed.courierName.trim(),
      trackingId: parsed.trackingId.trim(),
      trackingUrl: parsed.trackingUrl ? parsed.trackingUrl.trim() : undefined,
    },
    notes: `Dispatched order via Admin (${parsed.courierName.trim()} / ${parsed.trackingId.trim()})`,
  });

  return dispatchedOrder;
}

/**
 * ADMIN MARK ORDER DELIVERED (Phase E)
 * Authoritative business operation to mark a DISPATCHED order as DELIVERED.
 * Validates order existence, status (strictly DISPATCHED), shipment presence and non-delivery.
 * Transitions order status to DELIVERED atomically:
 * - Updates Order: status = DELIVERED, deliveredAt = transitionNow
 * - Updates linked Shipment: status = DELIVERED, deliveredAt = transitionNow
 * - Preserves courierName, trackingId, trackingUrl, dispatchedAt
 * - Records OrderStatusTransition audit record
 * - Guarantees ZERO notification outbox event (NO ORDER_DELIVERED event)
 * - Guarantees ZERO inventory / FIFO / COGS / movement / coupon / payment mutation
 */
export async function markOrderDelivered(input: MarkOrderDeliveredInput) {
  const parsed = markOrderDeliveredSchema.parse(input);

  // 1. Initial Order Pre-Checks
  const order = await prisma.order.findUnique({
    where: { id: parsed.orderId },
    include: { shipment: true },
  });

  if (!order) {
    throw new Error(`ORDER_NOT_FOUND: Order ${parsed.orderId} does not exist`);
  }

  const idempotencyKey =
    parsed.idempotencyKey || `DELIVER:${order.id}:${order.shipment?.trackingId || 'SHIPMENT'}`;

  // Check if transition idempotency key already exists for this exact operation
  const existingTransition = await prisma.orderStatusTransition.findUnique({
    where: { idempotencyKey },
  });

  if (existingTransition) {
    if (existingTransition.orderId === parsed.orderId && existingTransition.toStatus === OrderStatus.DELIVERED) {
      return await prisma.order.findUniqueOrThrow({
        where: { id: parsed.orderId },
        include: { items: true, customer: true, statusTransitions: true, shipment: true },
      });
    }
  }

  if (order.status !== OrderStatus.DISPATCHED) {
    throw new Error(
      `INVALID_ORDER_STATUS: Only DISPATCHED orders can be marked as delivered. Order ${order.orderNumber} has status ${order.status}.`
    );
  }

  if (!order.shipment) {
    throw new Error(
      `SHIPMENT_NOT_FOUND: Order ${order.orderNumber} does not have a shipment to mark as delivered.`
    );
  }

  if (order.shipment.status === 'DELIVERED') {
    throw new Error(
      `SHIPMENT_ALREADY_DELIVERED: Order ${order.orderNumber} shipment is already marked as delivered.`
    );
  }

  const deliveredOrder = await transitionOrderStatus({
    orderId: parsed.orderId,
    idempotencyKey,
    targetStatus: OrderStatus.DELIVERED,
    notes: parsed.notes || `Marked delivered via Admin (${order.shipment.courierName} / ${order.shipment.trackingId})`,
  });

  return deliveredOrder;
}

/**
 * ADMIN CANCEL CONFIRMED ORDER (Phase F)
 * Authoritative business operation to cancel an eligible pre-dispatch CONFIRMED order.
 * - Validates order status is strictly CONFIRMED.
 * - Rejects cancellation if already dispatched or shipment exists.
 * - Rejects paid order if refundMethod is omitted.
 * - Coordinates atomic transactional reversal:
 *   * Restores physical stock (InventoryItem.physicalStock += quantity)
 *   * Reserved stock remains untouched
 *   * Reconstructs FifoLayer records in LIFO order preserving cost
 *   * Creates auditable ADJUSTMENT_IN inventory movements (preserves SALE_OUT)
 *   * Retains historical COGS in order and line items for audit
 *   * Restores coupon usage if coupon was consumed
 *   * For PAID orders: processes offline refund (CASH / BANK_TRANSFER / UPI) for grandTotal (including shipping) and marks paymentStatus = REFUNDED
 *   * For DUE orders: zero refund, paymentStatus remains DUE
 *   * ZERO WhatsApp notification / ZERO outbox event
 *   * Records OrderStatusTransition audit record
 */
export async function cancelConfirmedOrder(input: CancelConfirmedOrderInput) {
  const parsed = cancelConfirmedOrderSchema.parse(input);

  // 1. Initial Order Pre-Checks outside transaction
  const order = await prisma.order.findUnique({
    where: { id: parsed.orderId },
    include: { shipment: true },
  });

  if (!order) {
    throw new Error(`ORDER_NOT_FOUND: Order ${parsed.orderId} does not exist`);
  }

  if (order.status !== OrderStatus.CONFIRMED) {
    throw new Error(
      `INVALID_ORDER_STATUS: Only CONFIRMED orders can be cancelled. Order ${order.orderNumber} has status ${order.status}.`
    );
  }

  if (order.shipment) {
    throw new Error(
      `ORDER_ALREADY_DISPATCHED: Order ${order.orderNumber} already has an active shipment and cannot be cancelled.`
    );
  }

  if (order.paymentStatus === PaymentStatus.PAID && !parsed.refundMethod) {
    throw new Error(
      `REFUND_METHOD_REQUIRED: Select a refund method before cancelling this paid order.`
    );
  }

  const idempotencyKey =
    parsed.idempotencyKey ||
    `CANCEL:${order.id}:${parsed.refundMethod || 'NO_REFUND'}`;

  // Check if transition idempotency key already exists for this exact operation
  const existingTransition = await prisma.orderStatusTransition.findUnique({
    where: { idempotencyKey },
  });

  if (existingTransition) {
    if (existingTransition.orderId === parsed.orderId && existingTransition.toStatus === OrderStatus.CANCELLED) {
      return await prisma.order.findUniqueOrThrow({
        where: { id: parsed.orderId },
        include: { items: true, customer: true, statusTransitions: true, shipment: true, payments: true, refunds: true },
      });
    }
  }

  const cancelledOrder = await transitionOrderStatus({
    orderId: parsed.orderId,
    idempotencyKey,
    targetStatus: OrderStatus.CANCELLED,
    refundMethod: parsed.refundMethod,
    notes: parsed.notes || `Cancelled order via Admin${parsed.refundMethod ? ` (Refunded via ${parsed.refundMethod})` : ''}`,
  });

  return cancelledOrder;
}



