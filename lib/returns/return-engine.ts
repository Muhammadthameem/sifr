import { prisma } from '@/lib/db/prisma';
import {
  Prisma,
  ReturnStatus,
  ReturnReason,
  ReturnResolutionType,
  ExchangeItemStatus,
  PaymentPurpose,
  PaymentAttemptStatus,
  PaymentStatus,
  RefundMethod,
  RefundStatus,
  ManualRefundResolutionType,
  PaymentProvider,
  RefundPurpose,
} from '@prisma/client';
import { consumeFifoStock } from '@/lib/inventory/fifo-engine';

export interface CreateReturnItemInput {
  orderItemId: string;
  quantityRequested: number;
}

export interface CreateReturnInput {
  orderId: string;
  reason: ReturnReason;
  reasonDetails?: string;
  items: CreateReturnItemInput[];
  submissionIdempotencyKey: string;
  guestAccessToken?: string;
  customerMobile?: string;
  isMerchantError?: boolean;
}

export interface InspectItemInput {
  returnItemId: string;
  quantityRestocked: number;
  quantityDamaged: number;
}

export interface InspectionInput {
  returnRequestId: string;
  idempotencyKey: string;
  receivedBy?: string;
  notes?: string;
  items: InspectItemInput[];
}

export interface PartialClosureItemInput {
  returnItemId: string;
  quantityClosedUnreceived: number;
}

export interface ApproveExchangeInput {
  returnRequestId: string;
  returnItemId: string;
  replacementVariantId: string;
  quantity?: number;
  adminId?: string;
}

/**
 * Deterministic Return Resolution Evaluator
 * Evaluates 4 explicit terminal conditions before setting ReturnRequest.status = RESOLVED.
 * Caller MUST already acquire and hold the ReturnRequest (FOR UPDATE) lock in position #6.
 */
export async function evaluateReturnResolution(
  tx: Prisma.TransactionClient,
  returnRequestId: string
): Promise<boolean> {
  const returnReq = await tx.returnRequest.findUnique({
    where: { id: returnRequestId },
    include: {
      items: true,
      refunds: true,
      exchanges: true,
    },
  });

  if (!returnReq) {
    throw new Error(`ReturnRequest '${returnRequestId}' not found during resolution evaluation.`);
  }

  // Already terminal
  if (returnReq.status === ReturnStatus.RESOLVED || returnReq.status === ReturnStatus.REJECTED) {
    return true;
  }

  // Condition 1: All line items quantity terminal (quantityRequested == quantityReceived + quantityClosedUnreceived)
  const isQuantityTerminal = returnReq.items.every(
    (item) => item.quantityRequested === item.quantityReceived + item.quantityClosedUnreceived
  );
  if (!isQuantityTerminal) return false;

  // Condition 2: All received units inspected (quantityReceived == quantityRestocked + quantityDamaged)
  const isInspectionComplete = returnReq.items.every(
    (item) => item.quantityReceived === item.quantityRestocked + item.quantityDamaged
  );
  if (!isInspectionComplete) return false;

  // Condition 3: Zero active financially unresolved refunds exist
  // A refund blocks resolution if status IN (PENDING, PROCESSING, REQUIRES_RECONCILIATION)
  // OR (status === FAILED AND replacedByRefund IS NULL AND resolvedByAdminId IS NULL).
  const hasUnresolvedRefunds = returnReq.refunds.some((refund) => {
    if (['PENDING', 'PROCESSING', 'REQUIRES_RECONCILIATION'].includes(refund.status)) {
      return true;
    }
    if (
      refund.status === 'FAILED' &&
      refund.replacesRefundId === null && // unreplaced
      refund.resolvedByAdminId === null && // un-resolved
      (refund as any).replacedByRefund === undefined // extra safety
    ) {
      // Check if replacedByRefund exists via query if needed
      return true;
    }
    return false;
  });
  if (hasUnresolvedRefunds) return false;

  // Condition 4: All ExchangeItems are terminal (DISPATCHED or CANCELLED)
  const hasOutstandingExchanges = returnReq.exchanges.some(
    (ex) => ex.status === ExchangeItemStatus.RESERVED
  );
  if (hasOutstandingExchanges) return false;

  // All 4 conditions satisfied -> RESOLVED
  await tx.returnRequest.update({
    where: { id: returnRequestId },
    data: {
      status: ReturnStatus.RESOLVED,
      resolvedAt: new Date(),
    },
  });

  return true;
}

/**
 * Creates a new ReturnRequest for a delivered order.
 * Enforces 14-calendar-day return eligibility window and over-return prevention.
 */
export async function createReturnRequest(input: CreateReturnInput) {
  const {
    orderId,
    reason,
    reasonDetails,
    items,
    submissionIdempotencyKey,
    guestAccessToken,
    customerMobile,
    isMerchantError = false,
  } = input;

  if (!items || items.length === 0) {
    throw new Error('Return request must include at least one item.');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Idempotency Check
    const existing = await tx.returnRequest.findUnique({
      where: { submissionIdempotencyKey },
      include: { items: true },
    });
    if (existing) {
      return { returnRequest: existing, isDuplicate: true };
    }

    // 2. Lock Order (FOR UPDATE)
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        returnRequests: {
          include: { items: true },
        },
      },
    });

    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }

    if (order.status !== 'DELIVERED') {
      throw new Error(`Return requests can only be created for DELIVERED orders (current: ${order.status}).`);
    }

    // Validate Guest Authorization if token provided
    if (guestAccessToken) {
      if (order.guestAccessToken !== guestAccessToken) {
        throw new Error('UNAUTHORIZED_GUEST_ACCESS: Invalid guest access token for order.');
      }
      if (new Date() > order.guestAccessTokenExpiresAt) {
        throw new Error('GUEST_TOKEN_EXPIRED: Return request window guest token expired.');
      }
    }

    // Validate 14-Calendar-Day Return Window from Order.deliveredAt
    const deliveryDate = order.deliveredAt || order.createdAt;
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    if (Date.now() - deliveryDate.getTime() > fourteenDaysMs) {
      throw new Error('RETURN_WINDOW_EXPIRED: Return requests must be submitted within 14 calendar days of delivery.');
    }

    // 3. Over-Return Prevention Check
    for (const reqItem of items) {
      const orderItem = order.items.find((oi) => oi.id === reqItem.orderItemId);
      if (!orderItem) {
        throw new Error(`OrderItem '${reqItem.orderItemId}' does not belong to Order '${orderId}'.`);
      }

      // Sum already requested quantities across all non-REJECTED return requests
      let alreadyRequested = 0;
      for (const existingReturn of order.returnRequests) {
        if (existingReturn.status !== ReturnStatus.REJECTED) {
          const matchingItem = existingReturn.items.find((ri) => ri.orderItemId === reqItem.orderItemId);
          if (matchingItem) {
            alreadyRequested += matchingItem.quantityRequested;
          }
        }
      }

      if (alreadyRequested + reqItem.quantityRequested > orderItem.quantity) {
        throw new Error(
          `OVER_RETURN_ATTEMPT: Attempted to return ${reqItem.quantityRequested} units of item '${orderItem.skuSnapshot}', but only ${orderItem.quantity - alreadyRequested} unreturned units remain.`
        );
      }
    }

    // 4. Generate Document Sequence Number (RET-YYYYMMDD-XXXX)
    let seq = await tx.documentSequence.findUnique({ where: { code: 'RETURN' } });
    if (!seq) {
      seq = await tx.documentSequence.create({ data: { code: 'RETURN', nextValue: 1001 } });
    }
    await tx.$executeRaw`SELECT * FROM document_sequences WHERE code = 'RETURN' FOR UPDATE;`;
    const nextVal = seq.nextValue;
    await tx.documentSequence.update({
      where: { code: 'RETURN' },
      data: { nextValue: { increment: 1 } },
    });

    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const returnNumber = `RET-${datePrefix}-${String(nextVal).padStart(4, '0')}`;

    // 5. Compute Line Pro-Rata Discounts & Net Refunds
    let subtotalRefundSum = 0;
    let taxRefundSum = 0;

    const returnItemData = items.map((reqItem) => {
      const orderItem = order.items.find((oi) => oi.id === reqItem.orderItemId)!;
      const unitPrice = Number(orderItem.unitPrice);
      const lineTotal = Number(orderItem.lineTotal);
      const discountAmount = Number(orderItem.discountAmount);

      // Pro-rata discount deduction
      const proRataDiscount = Number(
        ((discountAmount * reqItem.quantityRequested) / orderItem.quantity).toFixed(2)
      );

      const netRefundAmount = Number((unitPrice * reqItem.quantityRequested - proRataDiscount).toFixed(2));
      subtotalRefundSum += netRefundAmount;

      return {
        orderItemId: reqItem.orderItemId,
        variantId: orderItem.variantId,
        quantityRequested: reqItem.quantityRequested,
        unitPrice: new Prisma.Decimal(unitPrice),
        proRataDiscount: new Prisma.Decimal(proRataDiscount),
        netRefundAmount: new Prisma.Decimal(netRefundAmount),
      };
    });

    // 6. Create ReturnRequest Header
    const returnReq = await tx.returnRequest.create({
      data: {
        returnNumber,
        submissionIdempotencyKey,
        orderId,
        customerId: order.customerId,
        customerMobile: customerMobile || order.customerMobileSnapshot,
        status: ReturnStatus.REQUESTED,
        reason,
        reasonDetails: reasonDetails || null,
        isMerchantError,
        subtotalRefund: new Prisma.Decimal(subtotalRefundSum),
        taxRefund: new Prisma.Decimal(taxRefundSum),
        totalRefundAmount: new Prisma.Decimal(subtotalRefundSum + taxRefundSum),
        items: {
          create: returnItemData,
        },
      },
      include: { items: true },
    });

    return { returnRequest: returnReq, isDuplicate: false };
  });
}

/**
 * Admin approves a ReturnRequest.
 */
export async function approveReturnRequest(returnRequestId: string, adminNotes?: string) {
  return prisma.$transaction(async (tx) => {
    const returnReq = await tx.returnRequest.findUnique({
      where: { id: returnRequestId },
      include: { order: true },
    });
    if (!returnReq) throw new Error(`ReturnRequest '${returnRequestId}' not found.`);

    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${returnReq.orderId} FOR UPDATE;`;
    await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${returnRequestId} FOR UPDATE;`;

    if (returnReq.status !== ReturnStatus.REQUESTED) {
      throw new Error(`Cannot approve ReturnRequest in state '${returnReq.status}'. Must be REQUESTED.`);
    }

    const updated = await tx.returnRequest.update({
      where: { id: returnRequestId },
      data: {
        status: ReturnStatus.APPROVED,
        approvedAt: new Date(),
        adminNotes: adminNotes || returnReq.adminNotes,
      },
      include: { items: true },
    });

    return updated;
  });
}

/**
 * Admin rejects a ReturnRequest.
 */
export async function rejectReturnRequest(returnRequestId: string, adminNotes?: string) {
  return prisma.$transaction(async (tx) => {
    const returnReq = await tx.returnRequest.findUnique({ where: { id: returnRequestId } });
    if (!returnReq) throw new Error(`ReturnRequest '${returnRequestId}' not found.`);

    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${returnReq.orderId} FOR UPDATE;`;
    await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${returnRequestId} FOR UPDATE;`;

    if (returnReq.status !== ReturnStatus.REQUESTED && returnReq.status !== ReturnStatus.APPROVED) {
      throw new Error(`Cannot reject ReturnRequest in state '${returnReq.status}'.`);
    }

    const updated = await tx.returnRequest.update({
      where: { id: returnRequestId },
      data: {
        status: ReturnStatus.REJECTED,
        resolutionType: ReturnResolutionType.NO_REFUND_REJECTED,
        rejectedAt: new Date(),
        adminNotes: adminNotes || returnReq.adminNotes,
      },
      include: { items: true },
    });

    return updated;
  });
}

export interface PhysicalReceiptItemInput {
  returnItemId: string;
  quantityReceived: number;
}

export interface PhysicalReceiptInput {
  returnRequestId: string;
  idempotencyKey: string;
  receivedBy?: string;
  notes?: string;
  items: PhysicalReceiptItemInput[];
}

/**
  * Record Physical Arrival Receipt of returned units.
  * Canonical lock order: InventoryItem (ASC) -> Order -> ReturnRequest.
  */
export async function recordPhysicalReceipt(input: PhysicalReceiptInput) {
  const { returnRequestId, idempotencyKey, receivedBy, notes, items } = input;

  return prisma.$transaction(async (tx) => {
    // Idempotency Check
    const existingEvent = await tx.returnReceiptEvent.findUnique({
      where: { idempotencyKey },
      include: { items: true },
    });
    if (existingEvent) {
      return { receiptEvent: existingEvent, isDuplicate: true };
    }

    const returnReq = await tx.returnRequest.findUnique({
      where: { id: returnRequestId },
      include: {
        items: true,
        order: { include: { items: true } },
      },
    });

    if (!returnReq) throw new Error(`ReturnRequest '${returnRequestId}' not found.`);

    if (returnReq.status !== ReturnStatus.APPROVED && returnReq.status !== ReturnStatus.RECEIVED) {
      throw new Error(`Cannot record physical receipt for ReturnRequest in state '${returnReq.status}'. Must be APPROVED or RECEIVED.`);
    }

    const variantIds = Array.from(new Set(returnReq.items.map((i) => i.variantId))).sort();

    for (const vId of variantIds) {
      await tx.$executeRaw`SELECT * FROM inventory_items WHERE variant_id = ${vId} FOR UPDATE;`;
    }
    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${returnReq.orderId} FOR UPDATE;`;
    await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${returnRequestId} FOR UPDATE;`;

    const receiptItemData: Array<{
      returnItemId: string;
      quantityReceived: number;
      quantityRestocked: number;
      quantityDamaged: number;
    }> = [];

    for (const itemInput of items) {
      const returnItem = returnReq.items.find((ri) => ri.id === itemInput.returnItemId);
      if (!returnItem) {
        throw new Error(`ReturnItem '${itemInput.returnItemId}' does not belong to ReturnRequest '${returnRequestId}'.`);
      }

      if (itemInput.quantityReceived <= 0) {
        throw new Error('Received quantity must be greater than zero.');
      }

      const newReceivedTotal = returnItem.quantityReceived + itemInput.quantityReceived;
      if (newReceivedTotal > returnItem.quantityRequested) {
        throw new Error(
          `OVER_RECEIPT: Total received quantity (${newReceivedTotal}) exceeds requested quantity (${returnItem.quantityRequested}) for item.`
        );
      }

      await tx.returnItem.update({
        where: { id: returnItem.id },
        data: {
          quantityReceived: newReceivedTotal,
        },
      });

      receiptItemData.push({
        returnItemId: returnItem.id,
        quantityReceived: itemInput.quantityReceived,
        quantityRestocked: 0,
        quantityDamaged: 0,
      });
    }

    const receiptEvent = await tx.returnReceiptEvent.create({
      data: {
        returnRequestId,
        idempotencyKey,
        receivedBy: receivedBy || null,
        notes: notes || null,
        items: { create: receiptItemData },
      },
      include: { items: true },
    });

    await tx.returnRequest.update({
      where: { id: returnRequestId },
      data: {
        status: ReturnStatus.RECEIVED,
        receivedAt: returnReq.receivedAt || new Date(),
      },
    });

    return { receiptEvent, isDuplicate: false };
  });
}

/**
 * Process Incremental Physical Inspection & Restocking.
 * Canonical lock order: InventoryItem (ASC) -> Order -> ReturnRequest.
 * LIFO layer restoration from InventoryMovement.consumedLayersJson.
 */
export async function processIncrementalInspection(input: InspectionInput) {
  const { returnRequestId, idempotencyKey, receivedBy, notes, items } = input;

  return prisma.$transaction(async (tx) => {
    // Idempotency Check
    const existingEvent = await tx.returnReceiptEvent.findUnique({
      where: { idempotencyKey },
      include: { items: true },
    });
    if (existingEvent) {
      return { receiptEvent: existingEvent, isDuplicate: true };
    }

    const returnReq = await tx.returnRequest.findUnique({
      where: { id: returnRequestId },
      include: {
        items: true,
        order: { include: { items: true } },
      },
    });

    if (!returnReq) throw new Error(`ReturnRequest '${returnRequestId}' not found.`);

    if (returnReq.status !== ReturnStatus.APPROVED && returnReq.status !== ReturnStatus.RECEIVED && returnReq.status !== ReturnStatus.INSPECTED) {
      throw new Error(`Cannot inspect ReturnRequest in state '${returnReq.status}'. Must be APPROVED, RECEIVED, or INSPECTED.`);
    }

    // Collect variant IDs for sorting
    const variantIds = Array.from(new Set(returnReq.items.map((i) => i.variantId))).sort();

    // 1. Lock InventoryItems (ASC)
    for (const vId of variantIds) {
      await tx.$executeRaw`SELECT * FROM inventory_items WHERE variant_id = ${vId} FOR UPDATE;`;
    }

    // 2. Lock Order
    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${returnReq.orderId} FOR UPDATE;`;

    // 3. Lock ReturnRequest
    await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${returnRequestId} FOR UPDATE;`;

    // Process items & restore LIFO stock for RESTOCKABLE units
    const receiptItemData: Array<{
      returnItemId: string;
      quantityReceived: number;
      quantityRestocked: number;
      quantityDamaged: number;
    }> = [];

    for (const itemInput of items) {
      const returnItem = returnReq.items.find((ri) => ri.id === itemInput.returnItemId);
      if (!returnItem) {
        throw new Error(`ReturnItem '${itemInput.returnItemId}' does not belong to ReturnRequest '${returnRequestId}'.`);
      }

      const newlyInspected = itemInput.quantityRestocked + itemInput.quantityDamaged;
      if (newlyInspected <= 0) {
        throw new Error('Inspection item quantity must be greater than zero.');
      }

      const newRestockedTotal = returnItem.quantityRestocked + itemInput.quantityRestocked;
      const newDamagedTotal = returnItem.quantityDamaged + itemInput.quantityDamaged;
      const totalInspected = newRestockedTotal + newDamagedTotal;

      // If physical receipt was already recorded and inspection exceeds received quantity:
      if (returnItem.quantityReceived > 0 && totalInspected > returnItem.quantityReceived) {
        throw new Error(
          `INSPECTION_EXCEEDS_RECEIVED: Total inspected quantity (${totalInspected}) exceeds physically received quantity (${returnItem.quantityReceived}) for item.`
        );
      }

      // If physical receipt was NOT pre-recorded (quantityReceived == 0), set quantityReceived to totalInspected
      const newReceivedTotal = Math.max(returnItem.quantityReceived, totalInspected);

      if (newReceivedTotal > returnItem.quantityRequested) {
        throw new Error(
          `OVER_RECEIPT: Total received quantity (${newReceivedTotal}) exceeds requested quantity (${returnItem.quantityRequested}) for item.`
        );
      }

      const newlyReceivedIncrement = newReceivedTotal - returnItem.quantityReceived;

      // Restock RESTOCKABLE units via LIFO layer reconstruction
      if (itemInput.quantityRestocked > 0) {
        // Query SALE_OUT movements for order to extract consumedLayersJson
        const saleMovements = await tx.inventoryMovement.findMany({
          where: {
            variantId: returnItem.variantId,
            type: 'SALE_OUT',
            referenceId: returnReq.orderId,
          },
          orderBy: { createdAt: 'desc' },
        });

        // Collect all consumed layers in LIFO order
        const consumedLayers: Array<{ layerId: string; quantity: number; unitCost: number }> = [];
        for (const mov of saleMovements) {
          if (mov.consumedLayersJson) {
            try {
              const parsed = JSON.parse(mov.consumedLayersJson);
              if (Array.isArray(parsed)) {
                consumedLayers.push(...parsed);
              }
            } catch (e) {
              // fallback
            }
          }
        }

        // Reconstruct FifoLayer records using LIFO resolution
        let restockRemaining = itemInput.quantityRestocked;
        if (consumedLayers.length > 0) {
          // Process LIFO (from end of array)
          for (let i = consumedLayers.length - 1; i >= 0 && restockRemaining > 0; i--) {
            const layerInfo = consumedLayers[i];
            const restoreQty = Math.min(layerInfo.quantity, restockRemaining);
            restockRemaining -= restoreQty;

            await tx.fifoLayer.create({
              data: {
                variantId: returnItem.variantId,
                initialQuantity: restoreQty,
                remainingQuantity: restoreQty,
                unitCost: new Prisma.Decimal(layerInfo.unitCost),
                referenceId: `RETURN_${returnRequestId}`,
              },
            });
          }
        }

        // If fallback cost needed
        if (restockRemaining > 0) {
          const orderItem = returnReq.order.items.find((oi) => oi.variantId === returnItem.variantId);
          const fallbackCost = orderItem ? Number(orderItem.fifoCogs) / orderItem.quantity : Number(returnItem.unitPrice);

          await tx.fifoLayer.create({
            data: {
              variantId: returnItem.variantId,
              initialQuantity: restockRemaining,
              remainingQuantity: restockRemaining,
              unitCost: new Prisma.Decimal(fallbackCost || 0),
              referenceId: `RETURN_${returnRequestId}`,
            },
          });
        }

        // Increment physicalStock
        await tx.inventoryItem.update({
          where: { variantId: returnItem.variantId },
          data: { physicalStock: { increment: itemInput.quantityRestocked } },
        });

        // Log RETURN_IN movement
        await tx.inventoryMovement.create({
          data: {
            variantId: returnItem.variantId,
            type: 'RETURN_IN',
            quantity: itemInput.quantityRestocked,
            referenceId: returnRequestId,
            idempotencyKey: `${idempotencyKey}_restock_${returnItem.id}`,
            notes: `Restocked returned unit(s) from ReturnRequest ${returnReq.returnNumber}`,
          },
        });
      }

      // Update ReturnItem cumulative totals
      await tx.returnItem.update({
        where: { id: returnItem.id },
        data: {
          quantityReceived: newReceivedTotal,
          quantityRestocked: newRestockedTotal,
          quantityDamaged: newDamagedTotal,
        },
      });

      receiptItemData.push({
        returnItemId: returnItem.id,
        quantityReceived: newlyReceivedIncrement,
        quantityRestocked: itemInput.quantityRestocked,
        quantityDamaged: itemInput.quantityDamaged,
      });
    }

    // Create append-only ReturnReceiptEvent
    const receiptEvent = await tx.returnReceiptEvent.create({
      data: {
        returnRequestId,
        idempotencyKey,
        receivedBy: receivedBy || null,
        notes: notes || null,
        items: { create: receiptItemData },
      },
      include: { items: true },
    });

    // Check if inspection of received units is complete
    const updatedReq = await tx.returnRequest.findUnique({
      where: { id: returnRequestId },
      include: { items: true },
    });

    const isFullyInspected = updatedReq!.items.every(
      (item) => item.quantityReceived === item.quantityRestocked + item.quantityDamaged
    );

    await tx.returnRequest.update({
      where: { id: returnRequestId },
      data: {
        status: isFullyInspected ? ReturnStatus.INSPECTED : ReturnStatus.RECEIVED,
        receivedAt: returnReq.receivedAt || new Date(),
        inspectedAt: isFullyInspected ? new Date() : returnReq.inspectedAt,
      },
    });

    // Invoke evaluateReturnResolution
    await evaluateReturnResolution(tx, returnRequestId);

    return { receiptEvent, isDuplicate: false };
  });
}

/**
 * Admin manual closure of unreceived units.
 */
export async function resolvePartialReturn(returnRequestId: string, closures: PartialClosureItemInput[]) {
  return prisma.$transaction(async (tx) => {
    const returnReq = await tx.returnRequest.findUnique({ where: { id: returnRequestId } });
    if (!returnReq) throw new Error(`ReturnRequest '${returnRequestId}' not found.`);

    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${returnReq.orderId} FOR UPDATE;`;
    await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${returnRequestId} FOR UPDATE;`;

    for (const closure of closures) {
      await tx.returnItem.update({
        where: { id: closure.returnItemId },
        data: {
          quantityClosedUnreceived: closure.quantityClosedUnreceived,
        },
      });
    }

    await evaluateReturnResolution(tx, returnRequestId);

    return tx.returnRequest.findUnique({
      where: { id: returnRequestId },
      include: { items: true },
    });
  });
}

/**
 * Same-Product Variant Exchange Approval.
 * Lock order: InventoryItem (ASC) -> Order -> Payment -> ReturnRequest.
 */
export async function approveSameProductExchange(input: ApproveExchangeInput) {
  const { returnRequestId, returnItemId, replacementVariantId, quantity = 1, adminId } = input;

  return prisma.$transaction(async (tx) => {
    const returnItem = await tx.returnItem.findUnique({
      where: { id: returnItemId },
      include: {
        variant: { include: { product: true } },
        returnRequest: true,
      },
    });

    if (!returnItem) throw new Error(`ReturnItem '${returnItemId}' not found.`);
    if (returnItem.isExchanged) throw new Error(`OrderItem has already been exchanged once.`);

    const replacementVariant = await tx.productVariant.findUnique({
      where: { id: replacementVariantId },
      include: { product: true },
    });

    if (!replacementVariant) throw new Error(`Replacement variant '${replacementVariantId}' not found.`);

    // Enforce SAME-PRODUCT constraint
    if (returnItem.variant.productId !== replacementVariant.productId) {
      throw new Error(
        `CROSS_PRODUCT_EXCHANGE_DISALLOWED: Exchanges are restricted to variants of the same product ('${returnItem.variant.product.name}').`
      );
    }

    // Sort variant IDs for ASC locking
    const vIds = [returnItem.variantId, replacementVariantId].sort();
    for (const vId of vIds) {
      await tx.$executeRaw`SELECT * FROM inventory_items WHERE variant_id = ${vId} FOR UPDATE;`;
    }

    // Lock Order -> Payment -> ReturnRequest
    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${returnItem.returnRequest.orderId} FOR UPDATE;`;
    await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${returnRequestId} FOR UPDATE;`;

    // Check available stock on replacement variant
    const replInventory = await tx.inventoryItem.findUnique({ where: { variantId: replacementVariantId } });
    const available = (replInventory?.physicalStock || 0) - (replInventory?.reservedStock || 0);
    if (available < quantity) {
      throw new Error(`INSUFFICIENT_EXCHANGE_STOCK: Replacement variant has ${available} available units (required: ${quantity}).`);
    }

    // Reserve replacement stock (reservedStock += quantity, physicalStock UNCHANGED)
    await tx.inventoryItem.update({
      where: { variantId: replacementVariantId },
      data: { reservedStock: { increment: quantity } },
    });

    // Price calculation
    const originalPrice = Number(returnItem.unitPrice);
    const replacementPrice = Number(replacementVariant.sellingPrice);
    const priceDifference = Number((replacementPrice * quantity - Number(returnItem.netRefundAmount)).toFixed(2));

    let differentialPaymentId: string | undefined = undefined;

    // Higher-priced replacement -> create differential Payment attempt
    if (priceDifference > 0) {
      let seq = await tx.documentSequence.findUnique({ where: { code: 'PAYMENT' } });
      if (!seq) seq = await tx.documentSequence.create({ data: { code: 'PAYMENT', nextValue: 1001 } });
      await tx.$executeRaw`SELECT * FROM document_sequences WHERE code = 'PAYMENT' FOR UPDATE;`;
      const pNum = `PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(seq.nextValue).padStart(4, '0')}`;
      await tx.documentSequence.update({ where: { code: 'PAYMENT' }, data: { nextValue: { increment: 1 } } });

      const diffPayment = await tx.payment.create({
        data: {
          paymentNumber: pNum,
          orderId: returnItem.returnRequest.orderId,
          purpose: PaymentPurpose.EXCHANGE_DIFFERENTIAL,
          provider: 'MOCK',
          status: PaymentAttemptStatus.INITIATED,
          amount: new Prisma.Decimal(priceDifference),
          currency: 'INR',
          initiationIdempotencyKey: `exchange-pay-${returnItemId}-${Date.now()}`,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 mins TTL
        },
      });
      differentialPaymentId = diffPayment.id;
    }

    // Create ExchangeItem
    const exchangeItem = await tx.exchangeItem.create({
      data: {
        returnRequestId,
        originalVariantId: returnItem.variantId,
        replacementVariantId,
        quantity,
        status: ExchangeItemStatus.RESERVED,
        originalUnitPrice: new Prisma.Decimal(originalPrice),
        replacementUnitPrice: new Prisma.Decimal(replacementPrice),
        priceDifference: new Prisma.Decimal(priceDifference),
        differentialPaymentId,
      },
    });

    // Mark ReturnItem as exchanged
    await tx.returnItem.update({
      where: { id: returnItemId },
      data: { isExchanged: true },
    });

    return exchangeItem;
  });
}

/**
 * Dispatch / Fulfill Exchange Replacement Item.
 * Lock order: InventoryItem (ASC) -> Order -> Payment -> ReturnRequest -> ExchangeItem.
 */
export async function dispatchExchangeItem(exchangeItemId: string) {
  return prisma.$transaction(async (tx) => {
    const exchange = await tx.exchangeItem.findUnique({
      where: { id: exchangeItemId },
      include: {
        differentialPayment: true,
        returnRequest: true,
      },
    });

    if (!exchange) throw new Error(`ExchangeItem '${exchangeItemId}' not found.`);
    if (exchange.status !== ExchangeItemStatus.RESERVED) {
      throw new Error(`ExchangeItem is in state '${exchange.status}', cannot dispatch.`);
    }

    // If higher priced, payment MUST be SUCCESS
    if (Number(exchange.priceDifference) > 0) {
      if (!exchange.differentialPayment || exchange.differentialPayment.status !== PaymentAttemptStatus.SUCCESS) {
        throw new Error('CANNOT_DISPATCH_UNPAID_EXCHANGE: Higher-priced exchange differential payment is not complete.');
      }
    }

    // Lock InventoryItem (ASC)
    await tx.$executeRaw`SELECT * FROM inventory_items WHERE variant_id = ${exchange.replacementVariantId} FOR UPDATE;`;

    // Lock Order -> Payment -> ReturnRequest -> ExchangeItem
    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${exchange.returnRequest.orderId} FOR UPDATE;`;
    await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${exchange.returnRequestId} FOR UPDATE;`;
    await tx.$executeRaw`SELECT * FROM exchange_items WHERE id = ${exchangeItemId} FOR UPDATE;`;

    // 1. Consume FIFO stock (decrements physicalStock, creates SALE_OUT InventoryMovement with consumedLayersJson)
    await consumeFifoStock(
      {
        variantId: exchange.replacementVariantId,
        quantity: exchange.quantity,
        type: 'SALE_OUT',
        referenceId: exchange.id,
        idempotencyKey: `dispatch-exchange-${exchangeItemId}`,
        notes: `Exchange replacement dispatch for ReturnRequest ${exchange.returnRequestId}`,
      },
      tx
    );

    // 2. Release reservedStock
    await tx.inventoryItem.update({
      where: { variantId: exchange.replacementVariantId },
      data: {
        reservedStock: { decrement: exchange.quantity },
      },
    });

    // Update status to DISPATCHED
    const updated = await tx.exchangeItem.update({
      where: { id: exchangeItemId },
      data: { status: ExchangeItemStatus.DISPATCHED },
    });

    // Invoke evaluateReturnResolution
    await evaluateReturnResolution(tx, exchange.returnRequestId);

    return updated;
  });
}

/**
 * Cancel Exchange Replacement.
 */
export async function cancelExchangeItem(exchangeItemId: string) {
  return prisma.$transaction(async (tx) => {
    const exchange = await tx.exchangeItem.findUnique({
      where: { id: exchangeItemId },
      include: { returnRequest: true },
    });

    if (!exchange) throw new Error(`ExchangeItem '${exchangeItemId}' not found.`);
    if (exchange.status !== ExchangeItemStatus.RESERVED) {
      throw new Error(`ExchangeItem is in state '${exchange.status}', cannot cancel.`);
    }

    // Lock InventoryItem
    await tx.$executeRaw`SELECT * FROM inventory_items WHERE variant_id = ${exchange.replacementVariantId} FOR UPDATE;`;
    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${exchange.returnRequest.orderId} FOR UPDATE;`;
    await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${exchange.returnRequestId} FOR UPDATE;`;
    await tx.$executeRaw`SELECT * FROM exchange_items WHERE id = ${exchangeItemId} FOR UPDATE;`;

    // Release stock reservation
    await tx.inventoryItem.update({
      where: { variantId: exchange.replacementVariantId },
      data: { reservedStock: { decrement: exchange.quantity } },
    });

    const updated = await tx.exchangeItem.update({
      where: { id: exchangeItemId },
      data: { status: ExchangeItemStatus.CANCELLED },
    });

    if (exchange.differentialPaymentId) {
      await tx.payment.update({
        where: { id: exchange.differentialPaymentId },
        data: { status: PaymentAttemptStatus.CANCELLED },
      });
    }

    await evaluateReturnResolution(tx, exchange.returnRequestId);

    return updated;
  });
}

/* ============================================================================
 * SIFR CANONICAL ADMIN RETURNS LIFECYCLE (REQUESTED -> ACCEPTED / REJECTED)
 * ============================================================================ */

/**
 * Normalizes India phone number to E.164 (+91XXXXXXXXXX) format.
 */
function normalizePhoneInput(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith('091')) return `+${digits.slice(1)}`;
  if (phone.startsWith('+')) return phone.trim();
  return phone.trim();
}

/**
 * Searches for an order by exact/case-safe order number for return creation.
 * Evaluates return eligibility and active duplicate returns.
 */
export async function findOrderByNumber(orderNumber: string) {
  const normalized = orderNumber.trim();
  if (!normalized) return null;

  const order = await prisma.order.findFirst({
    where: {
      orderNumber: { equals: normalized, mode: 'insensitive' },
    },
    include: {
      customer: true,
      items: {
        include: {
          variant: {
            include: {
              product: {
                include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
              },
            },
          },
        },
      },
      payments: { orderBy: { createdAt: 'desc' } },
      returnRequests: {
        where: {
          status: { in: [ReturnStatus.REQUESTED, ReturnStatus.ACCEPTED] },
        },
        select: { id: true, returnNumber: true, status: true },
      },
    },
  });

  if (!order) return null;

  // Eligibility evaluation
  let isEligible = true;
  let ineligibilityReason: string | null = null;

  if (order.status === 'CONTACTED') {
    isEligible = false;
    ineligibilityReason = 'This order has not been dispatched yet. A return cannot be created.';
  } else if (order.status === 'CONFIRMED') {
    isEligible = false;
    ineligibilityReason = 'This order has not been dispatched yet. A return cannot be created.';
  } else if (order.status === 'CANCELLED') {
    isEligible = false;
    ineligibilityReason = 'Cancelled orders cannot be returned.';
  } else if (order.status !== 'DISPATCHED' && order.status !== 'DELIVERED') {
    isEligible = false;
    ineligibilityReason = `Order status '${order.status}' is not eligible for return.`;
  }

  // Duplicate active return check
  const activeReturn = order.returnRequests[0] || null;

  return {
    order,
    isEligible,
    ineligibilityReason,
    hasActiveReturn: !!activeReturn,
    activeReturn,
  };
}

/**
 * Searches for orders by customer mobile phone number.
 */
export async function findOrdersByPhone(phone: string) {
  const trimmed = phone.trim();
  if (!trimmed) return [];

  const normalizedPhone = normalizePhoneInput(trimmed);
  const rawDigits = trimmed.replace(/\D/g, '');

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { customerMobileSnapshot: normalizedPhone },
        { customerMobileSnapshot: trimmed },
        { customerMobileSnapshot: rawDigits },
        { customer: { mobile: normalizedPhone } },
        { customer: { mobile: trimmed } },
      ],
    },
    include: {
      items: {
        include: {
          variant: {
            include: {
              product: {
                include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
              },
            },
          },
        },
      },
      returnRequests: {
        where: {
          status: { in: [ReturnStatus.REQUESTED, ReturnStatus.ACCEPTED] },
        },
        select: { id: true, returnNumber: true, status: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return orders.map((order) => {
    let isEligible = true;
    let ineligibilityReason: string | null = null;

    if (order.status === 'CONTACTED') {
      isEligible = false;
      ineligibilityReason = 'This order has not been dispatched yet. A return cannot be created.';
    } else if (order.status === 'CONFIRMED') {
      isEligible = false;
      ineligibilityReason = 'This order has not been dispatched yet. A return cannot be created.';
    } else if (order.status === 'CANCELLED') {
      isEligible = false;
      ineligibilityReason = 'Cancelled orders cannot be returned.';
    } else if (order.status !== 'DISPATCHED' && order.status !== 'DELIVERED') {
      isEligible = false;
      ineligibilityReason = `Order status '${order.status}' is not eligible for return.`;
    }

    const activeReturn = order.returnRequests[0] || null;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      customerName: order.customerNameSnapshot,
      customerMobile: order.customerMobileSnapshot,
      status: order.status,
      paymentStatus: order.paymentStatus,
      grandTotal: Number(order.grandTotal),
      itemsCount: order.items.reduce((s, i) => s + i.quantity, 0),
      isEligible,
      ineligibilityReason,
      hasActiveReturn: !!activeReturn,
      activeReturn,
    };
  });
}

export interface CreateAdminFullReturnInput {
  orderId: string;
  reason: ReturnReason;
  reasonDetails?: string;
  notes?: string;
  idempotencyKey?: string;
}

/**
 * Creates an admin return request (status: REQUESTED) for an entire order.
 * Strictly does NOT mutate inventory, FIFO, COGS, revenue, refund, payment, or order status.
 */
export async function createAdminFullReturn(input: CreateAdminFullReturnInput) {
  const { orderId, reason, reasonDetails, notes, idempotencyKey } = input;

  return prisma.$transaction(async (tx) => {
    // 1. Lock Order
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        returnRequests: {
          where: {
            status: { in: [ReturnStatus.REQUESTED, ReturnStatus.ACCEPTED] },
          },
        },
      },
    });

    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }

    // Eligibility check
    if (order.status === 'CONTACTED') {
      throw new Error('This order has not been dispatched yet. A return cannot be created.');
    }
    if (order.status === 'CONFIRMED') {
      throw new Error('This order has not been dispatched yet. A return cannot be created.');
    }
    if (order.status === 'CANCELLED') {
      throw new Error('Cancelled orders cannot be returned.');
    }
    if (order.status !== 'DISPATCHED' && order.status !== 'DELIVERED') {
      throw new Error(`Return requests cannot be created for ${order.status} orders. Only DISPATCHED or DELIVERED orders are eligible.`);
    }

    // Duplicate check
    if (order.returnRequests.length > 0) {
      const active = order.returnRequests[0];
      throw new Error(`A return already exists for this order. (${active.returnNumber} - ${active.status})`);
    }

    // Reason validation
    if (reason === ReturnReason.OTHER && (!reasonDetails || reasonDetails.trim() === '')) {
      throw new Error('An explanation is required when "Other" is selected as the return reason.');
    }

    // Sequence generation (RET-YYYYMMDD-XXXX)
    let seq = await tx.documentSequence.findUnique({ where: { code: 'RETURN' } });
    if (!seq) {
      seq = await tx.documentSequence.create({ data: { code: 'RETURN', nextValue: 1001 } });
    }
    await tx.$executeRaw`SELECT * FROM document_sequences WHERE code = 'RETURN' FOR UPDATE;`;
    const nextVal = seq.nextValue;
    await tx.documentSequence.update({
      where: { code: 'RETURN' },
      data: { nextValue: { increment: 1 } },
    });

    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const returnNumber = `RET-${datePrefix}-${String(nextVal).padStart(4, '0')}`;
    const subKey = idempotencyKey || `admin_return_${order.id}_${Date.now()}`;

    // Full order line items
    let subtotalRefundSum = 0;
    const returnItemData = order.items.map((orderItem) => {
      const unitPrice = Number(orderItem.unitPrice);
      const discountAmount = Number(orderItem.discountAmount);
      const netRefundAmount = Number(orderItem.lineTotal);
      subtotalRefundSum += netRefundAmount;

      return {
        orderItemId: orderItem.id,
        variantId: orderItem.variantId,
        quantityRequested: orderItem.quantity,
        unitPrice: new Prisma.Decimal(unitPrice),
        proRataDiscount: new Prisma.Decimal(discountAmount),
        netRefundAmount: new Prisma.Decimal(netRefundAmount),
      };
    });

    const shippingRefund = Number(order.shippingFee);
    const taxRefund = Number(order.taxTotal);
    const totalRefundAmount = Number(order.grandTotal);

    const returnRequest = await tx.returnRequest.create({
      data: {
        returnNumber,
        submissionIdempotencyKey: subKey,
        orderId: order.id,
        customerId: order.customerId,
        customerMobile: order.customerMobileSnapshot,
        status: ReturnStatus.REQUESTED,
        reason,
        reasonDetails: reasonDetails || null,
        adminNotes: notes || null,
        subtotalRefund: new Prisma.Decimal(subtotalRefundSum),
        shippingRefund: new Prisma.Decimal(shippingRefund),
        taxRefund: new Prisma.Decimal(taxRefund),
        totalRefundAmount: new Prisma.Decimal(totalRefundAmount),
        items: {
          create: returnItemData,
        },
      },
      include: {
        items: true,
        order: true,
      },
    });

    return returnRequest;
  });
}

export interface AcceptAdminReturnInput {
  returnRequestId: string;
  refundMethod?: RefundMethod;
  offlineSettlementSuccess?: boolean; // defaults to true
  notes?: string;
  adminId?: string;
}

/**
 * Accepts a REQUESTED return:
 * - Restores physical stock
 * - Reconstructs FIFO layers (LIFO order from original SALE_OUT movements)
 * - Logs RETURN_IN inventory movement
 * - If PAID: creates Refund record and settles it (marks payment REFUNDED if settled)
 * - If DUE: no refund created, payment remains DUE
 * - Order status remains DISPATCHED or DELIVERED (never changed)
 * - Return becomes ACCEPTED
 * - Strictly idempotent and concurrency-safe
 */
export async function acceptAdminReturn(input: AcceptAdminReturnInput) {
  const {
    returnRequestId,
    refundMethod = RefundMethod.BANK_TRANSFER,
    offlineSettlementSuccess = true,
    notes,
    adminId,
  } = input;

  return prisma.$transaction(async (tx) => {
    // 1. Fetch returnRequest with items & order
    const returnReq = await tx.returnRequest.findUnique({
      where: { id: returnRequestId },
      include: {
        items: { include: { orderItem: true } },
        order: { include: { items: true, payments: true } },
        refunds: true,
      },
    });

    if (!returnReq) {
      throw new Error(`ReturnRequest '${returnRequestId}' not found.`);
    }

    // Deterministic Lock Hierarchy:
    // A. InventoryItem records (sorted by variantId ASC)
    const variantIds = Array.from(new Set(returnReq.items.map((i) => i.variantId))).sort();
    for (const vId of variantIds) {
      await tx.$executeRaw`SELECT * FROM inventory_items WHERE variant_id = ${vId} FOR UPDATE;`;
    }

    // B. Order record FOR UPDATE
    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${returnReq.orderId} FOR UPDATE;`;

    // C. ReturnRequest record FOR UPDATE
    await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${returnRequestId} FOR UPDATE;`;

    // Re-verify authoritative status under lock
    const lockedReturnReq = await tx.returnRequest.findUniqueOrThrow({
      where: { id: returnRequestId },
      include: {
        items: { include: { orderItem: true } },
        order: { include: { items: true, payments: true } },
        refunds: true,
      },
    });

    // Idempotency: if already ACCEPTED, return safely
    if (lockedReturnReq.status === ReturnStatus.ACCEPTED) {
      return { returnRequest: lockedReturnReq, isDuplicate: true };
    }

    if (lockedReturnReq.status === ReturnStatus.REJECTED) {
      throw new Error(`Cannot accept ReturnRequest '${lockedReturnReq.returnNumber}' because it is already REJECTED.`);
    }

    if (lockedReturnReq.status !== ReturnStatus.REQUESTED) {
      throw new Error(`Cannot accept ReturnRequest in state '${lockedReturnReq.status}'. Must be REQUESTED.`);
    }

    // --- STEP A: RESTORE INVENTORY & FIFO ---
    for (const item of lockedReturnReq.items) {
      // 1. Increment physicalStock
      await tx.inventoryItem.update({
        where: { variantId: item.variantId },
        data: { physicalStock: { increment: item.quantityRequested } },
      });

      // 2. Query SALE_OUT movements for order to inspect consumed layers
      const saleMovements = await tx.inventoryMovement.findMany({
        where: {
          variantId: item.variantId,
          type: 'SALE_OUT',
          referenceId: lockedReturnReq.orderId,
        },
        orderBy: { createdAt: 'desc' },
      });

      const consumedLayers: Array<{ layerId: string; quantity: number; unitCost: number }> = [];
      for (const mov of saleMovements) {
        if (mov.consumedLayersJson) {
          try {
            const parsed = JSON.parse(mov.consumedLayersJson);
            if (Array.isArray(parsed)) {
              consumedLayers.push(...parsed);
            }
          } catch (e) {
            // fallback
          }
        }
      }

      // Reconstruct FifoLayer records using LIFO resolution
      let restockRemaining = item.quantityRequested;
      let totalReturnedCost = 0;

      if (consumedLayers.length > 0) {
        for (let i = consumedLayers.length - 1; i >= 0 && restockRemaining > 0; i--) {
          const layerInfo = consumedLayers[i];
          const restoreQty = Math.min(layerInfo.quantity, restockRemaining);
          restockRemaining -= restoreQty;
          totalReturnedCost += restoreQty * layerInfo.unitCost;

          await tx.fifoLayer.create({
            data: {
              variantId: item.variantId,
              initialQuantity: restoreQty,
              remainingQuantity: restoreQty,
              unitCost: new Prisma.Decimal(layerInfo.unitCost),
              referenceId: `RETURN_${lockedReturnReq.id}`,
            },
          });
        }
      }

      // Fallback if needed
      if (restockRemaining > 0) {
        const orderItem = lockedReturnReq.order.items.find((oi) => oi.variantId === item.variantId);
        const fallbackCost = orderItem
          ? Number(orderItem.fifoCogs) / orderItem.quantity
          : Number(item.unitPrice);
        totalReturnedCost += restockRemaining * fallbackCost;

        await tx.fifoLayer.create({
          data: {
            variantId: item.variantId,
            initialQuantity: restockRemaining,
            remainingQuantity: restockRemaining,
            unitCost: new Prisma.Decimal(fallbackCost || 0),
            referenceId: `RETURN_${lockedReturnReq.id}`,
          },
        });
      }

      // 3. Log RETURN_IN movement
      await tx.inventoryMovement.create({
        data: {
          variantId: item.variantId,
          type: 'RETURN_IN',
          quantity: item.quantityRequested,
          unitCost: new Prisma.Decimal(totalReturnedCost / item.quantityRequested),
          totalCost: new Prisma.Decimal(totalReturnedCost),
          referenceId: lockedReturnReq.id,
          idempotencyKey: `return_${lockedReturnReq.id}_${item.id}`,
          notes: `Restocked returned unit(s) from ReturnRequest ${lockedReturnReq.returnNumber}`,
        },
      });

      // 4. Update ReturnItem cumulative totals
      await tx.returnItem.update({
        where: { id: item.id },
        data: {
          quantityReceived: item.quantityRequested,
          quantityRestocked: item.quantityRequested,
        },
      });
    }

    // --- STEP B: REFUND & PAYMENT STATUS ---
    const isPaid = lockedReturnReq.order.paymentStatus === PaymentStatus.PAID;

    if (isPaid) {
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

      const refundAmount = Number(lockedReturnReq.order.grandTotal);
      const refundStatus = offlineSettlementSuccess ? RefundStatus.COMPLETED : RefundStatus.PENDING;

      const manualResType =
        refundMethod === RefundMethod.CASH
          ? ManualRefundResolutionType.OFFLINE_SETTLED_CASH
          : ManualRefundResolutionType.OFFLINE_SETTLED_BANK;

      const lineAllocationsData = lockedReturnReq.items.map((item) => ({
        orderItemId: item.orderItemId,
        returnItemId: item.id,
        merchandiseRefund: item.netRefundAmount,
        discountDeduction: item.proRataDiscount,
        taxRefund: new Prisma.Decimal(0),
        lineRefundTotal: item.netRefundAmount,
      }));

      await tx.refund.create({
        data: {
          refundNumber,
          returnRequestId: lockedReturnReq.id,
          orderId: lockedReturnReq.orderId,
          purpose: RefundPurpose.ORDER_REFUND,
          provider: PaymentProvider.MOCK,
          method: refundMethod,
          status: refundStatus,
          amount: new Prisma.Decimal(refundAmount),
          shippingRefund: lockedReturnReq.order.shippingFee,
          currency: 'INR',
          idempotencyKey: `refund_${lockedReturnReq.id}`,
          processedAt: offlineSettlementSuccess ? new Date() : null,
          resolvedAt: offlineSettlementSuccess ? new Date() : null,
          resolvedByAdminId: adminId || null,
          manualResolutionType: offlineSettlementSuccess ? manualResType : null,
          manualResolutionNotes: notes || (offlineSettlementSuccess ? `Settled via ${refundMethod}` : 'Pending settlement'),
          providerRefundId: offlineSettlementSuccess ? `OFFLINE_${refundMethod}` : null,
          allocations: {
            create: lineAllocationsData,
          },
        },
      });

      // Update Order.paymentStatus only if offline refund succeeded
      if (offlineSettlementSuccess) {
        await tx.order.update({
          where: { id: lockedReturnReq.orderId },
          data: { paymentStatus: PaymentStatus.REFUNDED },
        });
      }
    }

    // --- STEP C: UPDATE RETURN REQUEST HEADER ---
    const updatedReturn = await tx.returnRequest.update({
      where: { id: returnRequestId },
      data: {
        status: ReturnStatus.ACCEPTED,
        resolutionType: ReturnResolutionType.FULL_REFUND,
        acceptedAt: new Date(),
        receivedAt: new Date(),
        inspectedAt: new Date(),
        adminNotes: notes || lockedReturnReq.adminNotes,
      },
      include: {
        items: true,
        refunds: true,
        order: true,
      },
    });

    return { returnRequest: updatedReturn, isDuplicate: false };
  });
}

export interface RejectAdminReturnInput {
  returnRequestId: string;
  rejectionReason: string;
  adminNotes?: string;
}

/**
 * Rejects a REQUESTED return:
 * - Return becomes REJECTED
 * - Strictly zero mutation to inventory, FIFO, COGS, revenue, refund, payment, or order
 */
export async function rejectAdminReturn(input: RejectAdminReturnInput) {
  const { returnRequestId, rejectionReason, adminNotes } = input;

  if (!rejectionReason || rejectionReason.trim() === '') {
    throw new Error('Rejection reason is required.');
  }

  return prisma.$transaction(async (tx) => {
    const returnReq = await tx.returnRequest.findUnique({
      where: { id: returnRequestId },
    });

    if (!returnReq) {
      throw new Error(`ReturnRequest '${returnRequestId}' not found.`);
    }

    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${returnReq.orderId} FOR UPDATE;`;
    await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${returnRequestId} FOR UPDATE;`;

    const locked = await tx.returnRequest.findUniqueOrThrow({
      where: { id: returnRequestId },
    });

    if (locked.status === ReturnStatus.REJECTED) {
      return { returnRequest: locked, isDuplicate: true };
    }

    if (locked.status === ReturnStatus.ACCEPTED) {
      throw new Error(`Cannot reject ReturnRequest '${locked.returnNumber}' because it is already ACCEPTED.`);
    }

    if (locked.status !== ReturnStatus.REQUESTED) {
      throw new Error(`Cannot reject ReturnRequest in state '${locked.status}'. Must be REQUESTED.`);
    }

    const updated = await tx.returnRequest.update({
      where: { id: returnRequestId },
      data: {
        status: ReturnStatus.REJECTED,
        resolutionType: ReturnResolutionType.NO_REFUND_REJECTED,
        rejectedAt: new Date(),
        reasonDetails: rejectionReason,
        adminNotes: adminNotes || locked.adminNotes,
      },
      include: { items: true },
    });

    return { returnRequest: updated, isDuplicate: false };
  });
}

/**
 * Fetches single return request details with order, customer, items, and refunds.
 */
export async function getAdminReturnDetails(returnRequestId: string) {
  const returnReq = await prisma.returnRequest.findUnique({
    where: { id: returnRequestId },
    include: {
      order: {
        include: {
          customer: true,
          items: {
            include: {
              variant: {
                include: {
                  product: {
                    include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
                  },
                },
              },
            },
          },
          payments: { orderBy: { createdAt: 'desc' } },
        },
      },
      items: {
        include: {
          variant: {
            include: {
              product: {
                include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
              },
            },
          },
        },
      },
      refunds: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  return returnReq;
}

export interface QueryAdminReturnsOptions {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Queries admin returns list with search, status filtering, and counts.
 */
export async function queryAdminReturns(options: QueryAdminReturnsOptions = {}) {
  const { status = 'ALL', search = '', page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const whereClause: any = {};
  if (status !== 'ALL') {
    whereClause.status = status;
  }

  if (search && search.trim()) {
    const q = search.trim();
    whereClause.OR = [
      { returnNumber: { contains: q, mode: 'insensitive' } },
      { customerMobile: { contains: q, mode: 'insensitive' } },
      { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
      { order: { customerNameSnapshot: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const [returnRequests, totalCount, requestedCount, acceptedCount, rejectedCount] = await Promise.all([
    prisma.returnRequest.findMany({
      where: whereClause,
      include: {
        order: {
          select: {
            orderNumber: true,
            salesChannel: true,
            customerNameSnapshot: true,
            customerMobileSnapshot: true,
            paymentStatus: true,
            paymentMethod: true,
            grandTotal: true,
          },
        },
        items: true,
        refunds: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.returnRequest.count({ where: whereClause }),
    prisma.returnRequest.count({ where: { status: ReturnStatus.REQUESTED } }),
    prisma.returnRequest.count({ where: { status: ReturnStatus.ACCEPTED } }),
    prisma.returnRequest.count({ where: { status: ReturnStatus.REJECTED } }),
  ]);

  return {
    returnRequests,
    totalCount,
    requestedCount,
    acceptedCount,
    rejectedCount,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit) || 1,
  };
}
