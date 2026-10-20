import { Prisma, PaymentProvider, PaymentAttemptStatus, OrderStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { isTargetConstraint } from '@/lib/ordering/order-engine';
import { MockPaymentAdapter } from './mock-adapter';
import { RazorpayAdapter } from './razorpay-adapter';
import crypto from 'crypto';

export interface InitiatePaymentInput {
  orderId: string;
  provider?: 'RAZORPAY' | 'MOCK';
  initiationIdempotencyKey: string;
  guestAccessToken?: string;
}

/**
 * Payment Initiation Engine
 * Locks Order, enforces Single Active Attempt rule, checks idempotency,
 * and creates gateway order.
 */
export async function initiatePayment(input: InitiatePaymentInput) {
  const provider = input.provider || (process.env.NODE_ENV === 'test' ? 'MOCK' : 'RAZORPAY');

  // Idempotency check before transaction
  const existingIdem = await prisma.payment.findUnique({
    where: { initiationIdempotencyKey: input.initiationIdempotencyKey },
    include: { order: true },
  });

  if (existingIdem) {
    if (existingIdem.orderId !== input.orderId) {
      throw new Error(`CONFLICTING_IDEMPOTENCY_KEY_REUSE: Key '${input.initiationIdempotencyKey}' was already used for a different order`);
    }
    return existingIdem;
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Lock Order row FOR UPDATE
    const orderArr = await tx.$queryRaw<Array<any>>`
      SELECT * FROM orders WHERE id = ${input.orderId} FOR UPDATE
    `;
    if (!orderArr || orderArr.length === 0) {
      throw new Error(`ORDER_NOT_FOUND: Order '${input.orderId}' does not exist`);
    }
    const order = orderArr[0];

    // Validate guestAccessToken if provided
    if (input.guestAccessToken && order.guest_access_token !== input.guestAccessToken) {
      throw new Error(`UNAUTHORIZED_ACCESS: Invalid guest access token for order '${input.orderId}'`);
    }

    if (order.sales_channel === 'WHATSAPP' || order.sales_channel === 'DIRECT') {
      throw new Error(
        `GATEWAY_PAYMENT_NOT_ALLOWED: Sales channel '${order.sales_channel}' does not support online payment gateway checkout.`
      );
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new Error(`INVALID_ORDER_STATE: Cannot initiate payment for CANCELLED order '${input.orderId}'`);
    }

    if (order.payment_status === PaymentStatus.PAID) {
      throw new Error(`INVALID_ORDER_STATE: Order '${input.orderId}' is already PAID`);
    }

    const now = new Date();
    const reservationExpiresAt = order.reservation_expires_at ? new Date(order.reservation_expires_at) : new Date(now.getTime() + 30 * 60 * 1000);

    if (reservationExpiresAt <= now) {
      throw new Error(`ORDER_EXPIRED: Order reservation window has expired`);
    }

    // 2. Single Active Attempt Enforcement: Check existing INITIATED / PROCESSING attempts
    const activeAttempts = await tx.payment.findMany({
      where: {
        orderId: input.orderId,
        status: { in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.PROCESSING] },
      },
    });

    for (const attempt of activeAttempts) {
      if (attempt.expiresAt > now) {
        throw new Error(`ACTIVE_PAYMENT_EXISTS: An active payment attempt '${attempt.paymentNumber}' is already in progress for this order`);
      } else {
        // Expire older attempt
        await tx.payment.update({
          where: { id: attempt.id },
          data: { status: PaymentAttemptStatus.EXPIRED },
        });
      }
    }

    // 3. Calculate Payment ExpiresAt = min(reservationExpiresAt, now + 30m)
    const paymentExpiresAt = new Date(Math.min(reservationExpiresAt.getTime(), now.getTime() + 30 * 60 * 1000));
    const grandTotalNum = Number(order.grand_total);
    const paymentNumber = `PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Create Gateway Order ID
    let providerOrderId: string;
    let amountPaise: number;

    if (provider === 'MOCK') {
      const gwResult = MockPaymentAdapter.createGatewayOrder({
        orderId: input.orderId,
        amount: grandTotalNum,
        currency: 'INR',
      });
      providerOrderId = gwResult.providerOrderId;
      amountPaise = gwResult.amountPaise;
    } else {
      const gwResult = await RazorpayAdapter.createOrder({
        amount: grandTotalNum,
        orderNumber: order.order_number,
      });
      providerOrderId = gwResult.providerOrderId;
      amountPaise = gwResult.amountPaise;
    }

    // 4. Create Payment Attempt Record
    try {
      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          orderId: input.orderId,
          provider: provider as PaymentProvider,
          status: PaymentAttemptStatus.INITIATED,
          amount: new Prisma.Decimal(grandTotalNum),
          currency: 'INR',
          providerOrderId,
          initiationIdempotencyKey: input.initiationIdempotencyKey,
          expiresAt: paymentExpiresAt,
        },
      });

      return payment;
    } catch (err: any) {
      if (isTargetConstraint(err, 'initiationIdempotencyKey')) {
        const existing = await tx.payment.findUnique({
          where: { initiationIdempotencyKey: input.initiationIdempotencyKey },
        });
        if (existing?.orderId !== input.orderId) {
          throw new Error(`CONFLICTING_IDEMPOTENCY_KEY_REUSE: Key '${input.initiationIdempotencyKey}' was already used for a different order`);
        }
        return existing!;
      }
      throw err;
    }
  });
}

export interface ProcessWebhookInput {
  provider: 'RAZORPAY' | 'MOCK';
  rawBody: string;
  signature: string;
  secret?: string;
}

export interface ProcessWebhookResult {
  processed: boolean;
  duplicate?: boolean;
  unmatched?: boolean;
  success?: boolean;
  requiresReconciliation?: boolean;
  orderStatus?: OrderStatus;
  message?: string;
}

/**
 * Webhook Processing Engine
 * Verifies HMAC signature, enforces event deduplication with payload conflict checking,
 * locks resources in Global Lock Order (InventoryItem -> Coupon -> Order -> Payment),
 * verifies amount matching, and updates Order state or sets REQUIRES_RECONCILIATION.
 */
export async function processPaymentWebhook(input: ProcessWebhookInput): Promise<ProcessWebhookResult> {
  const secret = input.secret || (input.provider === 'MOCK' ? MockPaymentAdapter.MOCK_SECRET : process.env.RAZORPAY_WEBHOOK_SECRET || '');

  // 1. Verify HMAC Signature
  let isValidSignature = false;
  if (input.provider === 'MOCK') {
    isValidSignature = MockPaymentAdapter.verifyWebhookSignature({
      rawBody: input.rawBody,
      signature: input.signature,
      secret,
    });
  } else {
    isValidSignature = RazorpayAdapter.verifyWebhookSignature(input.rawBody, input.signature, secret);
  }

  if (!isValidSignature) {
    throw new Error(`INVALID_WEBHOOK_SIGNATURE: HMAC signature verification failed`);
  }

  const payloadObj = JSON.parse(input.rawBody);
  const eventId = payloadObj.event_id || payloadObj.id;
  const eventType = payloadObj.event || 'payment.authorized';

  // Extract payment details from payload
  const entity = payloadObj.payload?.payment?.entity || payloadObj.payment || {};
  const providerOrderId = entity.order_id;
  const providerPaymentId = entity.id;
  const amountPaise = Number(entity.amount || 0);

  if (!eventId) {
    throw new Error(`INVALID_WEBHOOK_PAYLOAD: Missing event_id`);
  }

  // Deduplication pre-check outside transaction to avoid PostgreSQL 25P02 transaction aborts
  const existingEvent = await prisma.paymentWebhookEvent.findUnique({
    where: { eventId },
  });

  if (existingEvent) {
    if (existingEvent.payload === input.rawBody && existingEvent.signature === input.signature) {
      return { processed: false, duplicate: true, message: 'Duplicate webhook event acknowledged cleanly' };
    } else {
      throw new Error(`CONFLICTING_WEBHOOK_EVENT: Event ID '${eventId}' received with conflicting payload`);
    }
  }

  return await prisma.$transaction(async (tx) => {
    // 2. Record PaymentWebhookEvent inside transaction
    try {
      await tx.paymentWebhookEvent.create({
        data: {
          provider: input.provider as PaymentProvider,
          eventId,
          eventType,
          payload: input.rawBody,
          signature: input.signature,
          isVerified: true,
          processedAt: new Date(),
        },
      });
    } catch (err: any) {
      if (isTargetConstraint(err, 'eventId')) {
        return { processed: false, duplicate: true, message: 'Duplicate webhook event acknowledged cleanly' };
      }
      throw err;
    }

    // 3. Find matching Payment record
    let paymentRecord = await tx.payment.findFirst({
      where: { providerOrderId },
      include: { order: { include: { items: true } } },
    });

    if (!paymentRecord && providerOrderId) {
      // Unmatched event: update event record paymentId as null and return
      return { processed: true, unmatched: true, message: `Webhook logged as unmatched event for providerOrderId ${providerOrderId}` };
    }

    if (!paymentRecord) {
      return { processed: true, unmatched: true, message: 'Webhook logged without payment association' };
    }

    const orderId = paymentRecord.orderId;

    // 4. GLOBAL LOCK ORDERING HIERARCHY:
    // 1. InventoryItem (ASC variantId)
    // 2. Coupon (FOR UPDATE)
    // 3. Order (FOR UPDATE)
    // 4. Payment (FOR UPDATE)
    const variantIds = Array.from(new Set(paymentRecord.order.items.map((i) => i.variantId))).sort();
    for (const vId of variantIds) {
      await tx.$queryRaw`SELECT * FROM inventory_items WHERE variant_id = ${vId} FOR UPDATE`;
    }

    if (paymentRecord.order.couponId) {
      await tx.$queryRaw`SELECT * FROM coupons WHERE id = ${paymentRecord.order.couponId} FOR UPDATE`;
    }

    const orderArr = await tx.$queryRaw<Array<any>>`
      SELECT * FROM orders WHERE id = ${orderId} FOR UPDATE
    `;
    const lockedOrder = orderArr[0];

    const paymentArr = await tx.$queryRaw<Array<any>>`
      SELECT * FROM payments WHERE id = ${paymentRecord.id} FOR UPDATE
    `;
    const lockedPayment = paymentArr[0];

    // 5. Amount Verification: gatewayAmountPaise === Math.round(Number(grandTotal) * 100)
    const expectedPaise = Math.round(Number(lockedOrder.grand_total) * 100);
    if (amountPaise !== expectedPaise) {
      await tx.payment.update({
        where: { id: lockedPayment.id },
        data: {
          status: PaymentAttemptStatus.FAILED,
          errorCode: 'AMOUNT_MISMATCH',
          errorMessage: `Server expected ₹${lockedOrder.grand_total} (${expectedPaise}p), gateway reported ${amountPaise}p`,
        },
      });
      throw new Error(`SECURITY_ALERT: Amount mismatch. Expected ${expectedPaise}p, received ${amountPaise}p`);
    }

    // Link paymentId on PaymentWebhookEvent
    await tx.paymentWebhookEvent.update({
      where: { eventId },
      data: { paymentId: lockedPayment.id },
    });

    const now = new Date();

    // 6. RACE CHECK & STATE TRANSITIONS
    if (lockedOrder.status === OrderStatus.RECEIVED) {
      // Normal Payment Success
      await tx.payment.update({
        where: { id: lockedPayment.id },
        data: {
          status: PaymentAttemptStatus.SUCCESS,
          providerPaymentId,
          completedAt: now,
          paymentMethod: entity.method || 'online',
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: PaymentStatus.PAID,
          status: OrderStatus.CONFIRMED,
          confirmedAt: now,
        },
      });

      await tx.orderStatusTransition.create({
        data: {
          orderId,
          idempotencyKey: `webhook-confirm-${orderId}-${Date.now()}`,
          fromStatus: OrderStatus.RECEIVED,
          toStatus: OrderStatus.CONFIRMED,
          notes: `Payment verified via webhook (${input.provider}). PaymentId: ${providerPaymentId}`,
        },
      });

      return { processed: true, success: true, orderStatus: OrderStatus.CONFIRMED };
    } else if (lockedOrder.status === OrderStatus.CANCELLED) {
      // Exceptional Race Case: Payment SUCCESS on CANCELLED order
      await tx.payment.update({
        where: { id: lockedPayment.id },
        data: {
          status: PaymentAttemptStatus.REQUIRES_RECONCILIATION,
          providerPaymentId,
          errorMessage: `Late payment verified on CANCELLED order. Order remains CANCELLED and stock unreserved. Manual reconciliation required.`,
        },
      });

      // Order remains CANCELLED, paymentStatus remains FAILED
      return {
        processed: true,
        success: false,
        requiresReconciliation: true,
        orderStatus: OrderStatus.CANCELLED,
        message: 'Payment received for cancelled order. Flagged for manual reconciliation.',
      };
    } else {
      // Already CONFIRMED / DISPATCHED / DELIVERED
      await tx.payment.update({
        where: { id: lockedPayment.id },
        data: {
          status: PaymentAttemptStatus.SUCCESS,
          providerPaymentId,
          completedAt: now,
        },
      });
      return { processed: true, success: true, orderStatus: lockedOrder.status };
    }
  });
}
