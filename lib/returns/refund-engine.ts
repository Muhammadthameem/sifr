import { prisma } from '@/lib/db/prisma';
import {
  Prisma,
  RefundPurpose,
  RefundStatus,
  ManualRefundResolutionType,
  RefundMethod,
  PaymentProvider,
  PaymentStatus,
} from '@prisma/client';
import { evaluateReturnResolution } from './return-engine';

export interface CreateRefundIntentInput {
  orderId: string;
  returnRequestId?: string;
  paymentId?: string;
  purpose?: RefundPurpose;
  method?: RefundMethod;
  amount: number;
  shippingRefund?: number;
  idempotencyKey: string;
  replacesRefundId?: string;
  allocations?: Array<{
    orderItemId: string;
    returnItemId?: string;
    merchandiseRefund: number;
    discountDeduction?: number;
    taxRefund?: number;
  }>;
}

export interface ResolveFailedRefundInput {
  refundId: string;
  adminId: string;
  resolutionType: ManualRefundResolutionType;
  notes: string;
}

/**
 * Calculates authoritative alreadyRefundedTax for an OrderItem.
 * Includes PENDING, PROCESSING, REQUIRES_RECONCILIATION, COMPLETED, unreplaced retryable FAILED, and OFFLINE_SETTLED_* MANUALLY_RESOLVED refunds.
 */
export async function calculateAlreadyRefundedTax(
  tx: Prisma.TransactionClient,
  orderItemId: string,
  excludingRefundId?: string
): Promise<number> {
  const allocations = await tx.refundLineAllocation.findMany({
    where: {
      orderItemId,
      refund: {
        id: excludingRefundId ? { not: excludingRefundId } : undefined,
        OR: [
          { status: { in: ['PENDING', 'PROCESSING', 'REQUIRES_RECONCILIATION', 'COMPLETED'] } },
          {
            status: 'FAILED',
            replacesRefundId: null,
            resolvedByAdminId: null,
            replacedByRefund: { is: null },
          },
          {
            status: 'MANUALLY_RESOLVED',
            manualResolutionType: { in: ['OFFLINE_SETTLED_CASH', 'OFFLINE_SETTLED_BANK'] },
          },
        ],
      },
    },
    select: { taxRefund: true },
  });

  return allocations.reduce((sum, a) => sum + Number(a.taxRefund), 0);
}

/**
 * Calculates authoritative alreadyReservedOrDisbursed amount for a differential Payment P.
 */
export async function calculateAlreadyReservedOrDisbursed(
  tx: Prisma.TransactionClient,
  paymentId: string
): Promise<number> {
  const refunds = await tx.refund.findMany({
    where: {
      paymentId,
      purpose: RefundPurpose.DIFFERENTIAL_REVERSAL,
      OR: [
        { status: { in: ['PENDING', 'PROCESSING', 'REQUIRES_RECONCILIATION', 'COMPLETED'] } },
        {
          status: 'FAILED',
          replacesRefundId: null,
          resolvedByAdminId: null,
          replacedByRefund: { is: null },
        },
        {
          status: 'MANUALLY_RESOLVED',
          manualResolutionType: { in: ['OFFLINE_SETTLED_CASH', 'OFFLINE_SETTLED_BANK'] },
        },
      ],
    },
    select: { amount: true },
  });

  return refunds.reduce((sum, r) => sum + Number(r.amount), 0);
}

/**
 * Calculates authoritative cumulativeRefundedMoney for an Order header.
 */
export async function calculateCumulativeRefundedMoney(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<number> {
  const refunds = await tx.refund.findMany({
    where: {
      orderId,
      purpose: RefundPurpose.ORDER_REFUND,
      OR: [
        { status: RefundStatus.COMPLETED },
        {
          status: RefundStatus.MANUALLY_RESOLVED,
          manualResolutionType: { in: ['OFFLINE_SETTLED_CASH', 'OFFLINE_SETTLED_BANK'] },
        },
      ],
    },
    select: { amount: true },
  });

  return refunds.reduce((sum, r) => sum + Number(r.amount), 0);
}

/**
 * Derives Order.paymentStatus from cumulativeRefundedMoney.
 */
export async function deriveOrderPaymentStatus(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<PaymentStatus> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { grandTotal: true },
  });

  if (!order) return PaymentStatus.PAID;

  const cumulativeRefunded = await calculateCumulativeRefundedMoney(tx, orderId);
  const grandTotal = Number(order.grandTotal);

  if (cumulativeRefunded <= 0) {
    return PaymentStatus.PAID;
  } else if (cumulativeRefunded < grandTotal) {
    return PaymentStatus.PARTIALLY_REFUNDED;
  } else {
    return PaymentStatus.REFUNDED;
  }
}

/**
 * Phase 1: Creates a Refund Intent (status: PENDING).
 * Canonical lock order: DocumentSequence (#3) -> Order (#4) -> Payment (#5) -> ReturnRequest (#6) -> Refund (#8).
 */
export async function createRefundIntent(input: CreateRefundIntentInput) {
  const {
    orderId,
    returnRequestId,
    paymentId,
    purpose = RefundPurpose.ORDER_REFUND,
    method = RefundMethod.ORIGINAL_PAYMENT_GATEWAY,
    amount,
    shippingRefund = 0,
    idempotencyKey,
    replacesRefundId,
    allocations = [],
  } = input;

  if (amount <= 0) {
    throw new Error('Refund intent amount must be greater than zero.');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Idempotency Check
    if (idempotencyKey) {
      const existing = await tx.refund.findUnique({
        where: { idempotencyKey },
        include: { allocations: true },
      });
      if (existing) {
        return { refund: existing, isDuplicate: true };
      }
    }

    // 2. Lock DocumentSequence FOR UPDATE
    let seq = await tx.documentSequence.findUnique({ where: { code: 'REFUND' } });
    if (!seq) seq = await tx.documentSequence.create({ data: { code: 'REFUND', nextValue: 1001 } });
    await tx.$executeRaw`SELECT * FROM document_sequences WHERE code = 'REFUND' FOR UPDATE;`;

    // 3. Lock Order -> Payment -> ReturnRequest
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { payments: true, items: true },
    });
    if (!order) throw new Error(`Order '${orderId}' not found.`);

    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${orderId} FOR UPDATE;`;

    if (paymentId) {
      await tx.$executeRaw`SELECT * FROM payments WHERE id = ${paymentId} FOR UPDATE;`;
    }

    if (returnRequestId) {
      await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${returnRequestId} FOR UPDATE;`;
    }

    // Handle replacement validation
    if (replacesRefundId) {
      const origRefund = await tx.refund.findUnique({
        where: { id: replacesRefundId },
        include: { replacedByRefund: true },
      });
      if (!origRefund) throw new Error(`Original refund '${replacesRefundId}' not found for replacement.`);
      if (origRefund.status !== 'FAILED') {
        throw new Error(`Cannot replace refund in state '${origRefund.status}'. Must be FAILED.`);
      }
      if (origRefund.replacedByRefund !== null && origRefund.replacedByRefund !== undefined) {
        throw new Error(`Original failed refund '${replacesRefundId}' has already been replaced.`);
      }
      if (origRefund.resolvedByAdminId !== null) {
        throw new Error(`Original failed refund '${replacesRefundId}' has already been manually resolved.`);
      }

      await tx.$executeRaw`SELECT * FROM refunds WHERE id = ${replacesRefundId} FOR UPDATE;`;
    }

    // Validate Payment-Path Restrictions
    if (order.salesChannel === 'ONLINE') {
      const successPayment = order.payments.find((p) => p.status === 'SUCCESS');
      if (successPayment && successPayment.provider === 'RAZORPAY') {
        if (method !== RefundMethod.ORIGINAL_PAYMENT_GATEWAY) {
          throw new Error('PAYMENT_PATH_RESTRICTION_VIOLATION: Online Razorpay prepaid orders must be refunded via ORIGINAL_PAYMENT_GATEWAY path only.');
        }
      }
    } else if (order.salesChannel === 'WHATSAPP' || order.salesChannel === 'DIRECT') {
      if (method === RefundMethod.ORIGINAL_PAYMENT_GATEWAY) {
        throw new Error(
          `INVALID_REFUND_METHOD: ${order.salesChannel} orders do not have an online payment gateway. Refund method must be CASH or BANK_TRANSFER.`
        );
      }
    }

    // Purpose-Aware Refund Reconciliation & Cap Protection
    let lineAllocationsData: Array<{
      orderItemId: string;
      returnItemId?: string;
      merchandiseRefund: Prisma.Decimal;
      discountDeduction: Prisma.Decimal;
      taxRefund: Prisma.Decimal;
      lineRefundTotal: Prisma.Decimal;
    }> = [];

    if (purpose === RefundPurpose.ORDER_REFUND) {
      // Validate line allocations
      if (allocations.length === 0 && amount > shippingRefund) {
        throw new Error('ORDER_REFUND requires at least 1 line item allocation.');
      }

      let lineRefundsSum = 0;

      for (const allocInput of allocations) {
        const orderItem = order.items.find((oi) => oi.id === allocInput.orderItemId);
        if (!orderItem) throw new Error(`OrderItem '${allocInput.orderItemId}' not found in order.`);

        const merchandiseRefund = allocInput.merchandiseRefund;
        const discountDeduction = allocInput.discountDeduction || 0;

        // Calculate line tax allocation & residual bucket
        const lineNetValue = Number(orderItem.lineTotal);
        const netMerchTotal = Number(order.subtotal) - Number(order.discountTotal);
        let lineTaxAllocation = 0;
        if (netMerchTotal > 0 && Number(order.taxTotal) > 0) {
          lineTaxAllocation = Number(((Number(order.taxTotal) * lineNetValue) / netMerchTotal).toFixed(2));
        }

        const alreadyTax = await calculateAlreadyRefundedTax(tx, allocInput.orderItemId, replacesRefundId);
        const remainingTax = Math.max(0, lineTaxAllocation - alreadyTax);

        const computedTaxRefund = allocInput.taxRefund !== undefined ? allocInput.taxRefund : remainingTax;
        const lineRefundTotal = Number((merchandiseRefund - discountDeduction + computedTaxRefund).toFixed(2));

        lineRefundsSum += lineRefundTotal;

        lineAllocationsData.push({
          orderItemId: allocInput.orderItemId,
          returnItemId: allocInput.returnItemId || undefined,
          merchandiseRefund: new Prisma.Decimal(merchandiseRefund),
          discountDeduction: new Prisma.Decimal(discountDeduction),
          taxRefund: new Prisma.Decimal(computedTaxRefund),
          lineRefundTotal: new Prisma.Decimal(lineRefundTotal),
        });
      }

      const calculatedTotal = lineRefundsSum + shippingRefund;
      if (Math.abs(calculatedTotal - amount) > 0.05) {
        throw new Error(`Refund total mismatch: calculated (${calculatedTotal}) vs input (${amount}).`);
      }

      // Check Order.grandTotal cap
      const cumulativeRefunded = await calculateCumulativeRefundedMoney(tx, orderId);
      if (cumulativeRefunded + amount > Number(order.grandTotal) + 0.01) {
        throw new Error(
          `REFUND_CAP_EXCEEDED: Total refunds (${cumulativeRefunded + amount}) cannot exceed Order.grandTotal (${order.grandTotal}).`
        );
      }
    } else if (purpose === RefundPurpose.DIFFERENTIAL_REVERSAL) {
      if (!paymentId) {
        throw new Error('DIFFERENTIAL_REVERSAL refund requires a valid paymentId.');
      }
      if (allocations.length > 0 || shippingRefund > 0) {
        throw new Error('DIFFERENTIAL_REVERSAL refund must have zero line allocations and zero shipping refund.');
      }

      const diffPayment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!diffPayment) throw new Error(`Differential Payment '${paymentId}' not found.`);

      const alreadyReserved = await calculateAlreadyReservedOrDisbursed(tx, paymentId);
      const remainingCapacity = Number(diffPayment.amount) - alreadyReserved;

      if (amount > remainingCapacity + 0.01) {
        throw new Error(
          `DIFFERENTIAL_CAP_EXCEEDED: Reversal amount (${amount}) exceeds remaining capacity (${remainingCapacity}) for differential payment.`
        );
      }
    }

    // Generate refundNumber REF-YYYYMMDD-XXXX
    const nextVal = seq.nextValue;
    await tx.documentSequence.update({
      where: { code: 'REFUND' },
      data: { nextValue: { increment: 1 } },
    });
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const refundNumber = `REF-${datePrefix}-${String(nextVal).padStart(4, '0')}`;

    // Create Refund header
    const refund = await tx.refund.create({
      data: {
        refundNumber,
        returnRequestId: returnRequestId || null,
        orderId,
        paymentId: paymentId || null,
        purpose,
        provider: PaymentProvider.MOCK,
        method,
        status: RefundStatus.PENDING,
        amount: new Prisma.Decimal(amount),
        shippingRefund: new Prisma.Decimal(shippingRefund),
        currency: 'INR',
        idempotencyKey,
        replacesRefundId: replacesRefundId || null,
        allocations: {
          create: lineAllocationsData,
        },
      },
      include: { allocations: true },
    });

    return { refund, isDuplicate: false };
  });
}

/**
 * Phase 2: Dispatches gateway refund API request outside DB transaction.
 * Holds ZERO DB locks during HTTP network call.
 */
export async function dispatchGatewayRefund(refundId: string) {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { order: true, payment: true },
  });

  if (!refund) throw new Error(`Refund '${refundId}' not found.`);

  if (
    refund.method === RefundMethod.CASH ||
    refund.method === RefundMethod.BANK_TRANSFER ||
    refund.order.salesChannel === 'WHATSAPP' ||
    refund.order.salesChannel === 'DIRECT'
  ) {
    throw new Error(
      `GATEWAY_REFUND_NOT_SUPPORTED: ${refund.order.salesChannel} or offline (${refund.method}) refunds must be executed via manual offline settlement, not payment gateway.`
    );
  }

  if (refund.status !== RefundStatus.PENDING && refund.status !== RefundStatus.PROCESSING) {
    throw new Error(`Cannot dispatch refund in state '${refund.status}'. Must be PENDING or PROCESSING.`);
  }

  // Update DB status to PROCESSING
  await prisma.refund.update({
    where: { id: refundId },
    data: { status: RefundStatus.PROCESSING },
  });

  try {
    // MOCK Gateway Disbursal API Simulation
    const mockProviderRefundId = `rfnd_mock_${Date.now()}`;
    
    // Call Phase 3 finalization inside DB transaction
    return await finalizeRefund(refundId, mockProviderRefundId);
  } catch (error: any) {
    // Network / Gateway failure transition to FAILED or REQUIRES_RECONCILIATION
    const isTimeout = error.message?.includes('TIMEOUT') || error.message?.includes('NETWORK');
    const newStatus = isTimeout ? RefundStatus.REQUIRES_RECONCILIATION : RefundStatus.FAILED;

    await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: newStatus,
        failureReason: error.message || 'Gateway refund execution failed',
      },
    });

    throw error;
  }
}

/**
 * Phase 3: Finalizes completed refund inside DB transaction.
 * Lock order: Order (#4) -> Payment (#5) -> ReturnRequest (#6) -> Refund (#8) -> evaluateReturnResolution.
 */
export async function finalizeRefund(refundId: string, providerRefundId: string) {
  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({
      where: { id: refundId },
      include: { order: true },
    });

    if (!refund) throw new Error(`Refund '${refundId}' not found.`);

    // Lock Order -> Payment -> ReturnRequest -> Refund
    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${refund.orderId} FOR UPDATE;`;
    if (refund.paymentId) {
      await tx.$executeRaw`SELECT * FROM payments WHERE id = ${refund.paymentId} FOR UPDATE;`;
    }
    if (refund.returnRequestId) {
      await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${refund.returnRequestId} FOR UPDATE;`;
    }
    await tx.$executeRaw`SELECT * FROM refunds WHERE id = ${refundId} FOR UPDATE;`;

    // Mark Refund COMPLETED
    const updatedRefund = await tx.refund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.COMPLETED,
        providerRefundId,
        processedAt: new Date(),
      },
    });

    // Update Order.paymentStatus
    const newPaymentStatus = await deriveOrderPaymentStatus(tx, refund.orderId);
    await tx.order.update({
      where: { id: refund.orderId },
      data: { paymentStatus: newPaymentStatus },
    });

    // Invoke evaluateReturnResolution if linked to return request
    if (refund.returnRequestId) {
      await evaluateReturnResolution(tx, refund.returnRequestId);
    }

    return updatedRefund;
  });
}

/**
 * Same-Refund Retry for a FAILED refund attempt.
 * Lock order: Order (#4) -> Payment (#5) -> ReturnRequest (#6) -> Refund (#8).
 * Reuses existing Refund record & refundNumber (DocumentSequence not locked).
 */
export async function retryRefundAction(refundId: string) {
  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({
      where: { id: refundId },
      include: { replacedByRefund: true },
    });

    if (!refund) throw new Error(`Refund '${refundId}' not found.`);

    if (refund.status !== RefundStatus.FAILED) {
      throw new Error(`Cannot retry refund in state '${refund.status}'. Must be FAILED.`);
    }

    if (refund.replacedByRefund !== null && refund.replacedByRefund !== undefined) {
      throw new Error('CANNOT_RETRY_REPLACED_REFUND: This failed refund has already been replaced by a new refund.');
    }

    if (refund.resolvedByAdminId !== null) {
      throw new Error('CANNOT_RETRY_RESOLVED_REFUND: This failed refund has already been manually resolved.');
    }

    // Lock Order -> Payment -> ReturnRequest -> Refund
    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${refund.orderId} FOR UPDATE;`;
    if (refund.paymentId) {
      await tx.$executeRaw`SELECT * FROM payments WHERE id = ${refund.paymentId} FOR UPDATE;`;
    }
    if (refund.returnRequestId) {
      await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${refund.returnRequestId} FOR UPDATE;`;
    }
    await tx.$executeRaw`SELECT * FROM refunds WHERE id = ${refundId} FOR UPDATE;`;

    // Transition back to PROCESSING for gateway retry
    const updatedRefund = await tx.refund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.PROCESSING,
        failureReason: null,
      },
    });

    return updatedRefund;
  });
}

/**
 * Audited Manual Resolution of a FAILED refund (MANUALLY_RESOLVED).
 * Lock order: Order (#4) -> ReturnRequest (#6) -> Refund (#8) -> evaluateReturnResolution.
 */
export async function resolveFailedRefundAction(input: ResolveFailedRefundInput) {
  const { refundId, adminId, resolutionType, notes } = input;

  if (!notes || notes.trim() === '') {
    throw new Error('Manual refund resolution requires explanatory admin notes.');
  }

  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({
      where: { id: refundId },
      include: {
        order: { include: { payments: true } },
        allocations: true,
        replacedByRefund: true,
      },
    });

    if (!refund) throw new Error(`Refund '${refundId}' not found.`);

    if (refund.status !== RefundStatus.FAILED) {
      throw new Error(`Cannot manually resolve refund in state '${refund.status}'. Must be FAILED.`);
    }

    if (refund.replacedByRefund !== null && refund.replacedByRefund !== undefined) {
      throw new Error('CANNOT_RESOLVE_REPLACED_REFUND: This failed refund has already been replaced.');
    }

    // Payment-Path Restriction Validation for Razorpay prepaid orders
    if (refund.order.salesChannel === 'ONLINE') {
      const successPayment = refund.order.payments.find((p) => p.status === 'SUCCESS');
      if (successPayment && successPayment.provider === 'RAZORPAY') {
        if (resolutionType !== ManualRefundResolutionType.ADMINISTRATIVE_WRITEOFF) {
          throw new Error('PAYMENT_PATH_RESTRICTION_VIOLATION: Razorpay prepaid orders do not permit offline cash or bank settlements. Permitted resolution is strictly ADMINISTRATIVE_WRITEOFF.');
        }
      }
    }

    // Lock Order -> ReturnRequest -> Refund
    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${refund.orderId} FOR UPDATE;`;
    if (refund.returnRequestId) {
      await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${refund.returnRequestId} FOR UPDATE;`;
    }
    await tx.$executeRaw`SELECT * FROM refunds WHERE id = ${refundId} FOR UPDATE;`;

    // Handle ADMINISTRATIVE_WRITEOFF tax & line allocations
    if (resolutionType === ManualRefundResolutionType.ADMINISTRATIVE_WRITEOFF) {
      await tx.refundLineAllocation.updateMany({
        where: { refundId },
        data: { taxRefund: new Prisma.Decimal(0) },
      });
    }

    const updatedRefund = await tx.refund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.MANUALLY_RESOLVED,
        resolvedByAdminId: adminId,
        resolvedAt: new Date(),
        manualResolutionType: resolutionType,
        manualResolutionNotes: notes,
      },
      include: { allocations: true },
    });

    // Update Order.paymentStatus
    const newPaymentStatus = await deriveOrderPaymentStatus(tx, refund.orderId);
    await tx.order.update({
      where: { id: refund.orderId },
      data: { paymentStatus: newPaymentStatus },
    });

    // Invoke evaluateReturnResolution if linked to return request
    if (refund.returnRequestId) {
      await evaluateReturnResolution(tx, refund.returnRequestId);
    }

    return updatedRefund;
  });
}

export interface ExecuteManualOfflineRefundInput {
  refundId: string;
  adminId?: string;
  referenceId?: string;
  notes?: string;
}

/**
 * Executes and settles an offline refund for WhatsApp or Direct orders (or manual cash/bank transfers).
 * Zero gateway / network calls.
 * Canonical lock order: Order (#4) -> ReturnRequest (#6) -> Refund (#8) -> evaluateReturnResolution.
 */
export async function executeManualOfflineRefund(input: ExecuteManualOfflineRefundInput) {
  const { refundId, adminId, referenceId, notes } = input;

  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({
      where: { id: refundId },
      include: { order: true },
    });

    if (!refund) throw new Error(`Refund '${refundId}' not found.`);

    if (refund.status !== RefundStatus.PENDING && refund.status !== RefundStatus.PROCESSING) {
      throw new Error(`Cannot execute offline refund in state '${refund.status}'. Must be PENDING or PROCESSING.`);
    }

    if (refund.method === RefundMethod.ORIGINAL_PAYMENT_GATEWAY && refund.order.salesChannel === 'ONLINE') {
      throw new Error('INVALID_OFFLINE_REFUND: Online orders with ORIGINAL_PAYMENT_GATEWAY must be processed via gateway.');
    }

    // Canonical lock hierarchy
    await tx.$executeRaw`SELECT * FROM orders WHERE id = ${refund.orderId} FOR UPDATE;`;
    if (refund.returnRequestId) {
      await tx.$executeRaw`SELECT * FROM return_requests WHERE id = ${refund.returnRequestId} FOR UPDATE;`;
    }
    await tx.$executeRaw`SELECT * FROM refunds WHERE id = ${refundId} FOR UPDATE;`;

    // Re-verify authoritative status under lock to prevent race conditions
    const lockedRefund = await tx.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: { order: true },
    });

    if (lockedRefund.status !== RefundStatus.PENDING && lockedRefund.status !== RefundStatus.PROCESSING) {
      throw new Error(`Cannot execute offline refund in state '${lockedRefund.status}'. Must be PENDING or PROCESSING.`);
    }

    const resolutionType =
      lockedRefund.method === RefundMethod.CASH
        ? ManualRefundResolutionType.OFFLINE_SETTLED_CASH
        : ManualRefundResolutionType.OFFLINE_SETTLED_BANK;

    const providerRefundId =
      referenceId || (refund.method === RefundMethod.CASH ? 'OFFLINE_CASH' : 'OFFLINE_BANK_TRANSFER');

    const updatedRefund = await tx.refund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.COMPLETED,
        providerRefundId,
        processedAt: new Date(),
        resolvedByAdminId: adminId || null,
        resolvedAt: new Date(),
        manualResolutionType: resolutionType,
        manualResolutionNotes: notes || null,
      },
      include: { allocations: true },
    });

    // Update Order.paymentStatus based on cumulativeRefundedMoney
    const newPaymentStatus = await deriveOrderPaymentStatus(tx, refund.orderId);
    await tx.order.update({
      where: { id: refund.orderId },
      data: { paymentStatus: newPaymentStatus },
    });

    // Evaluate return resolution if linked to a return request
    if (refund.returnRequestId) {
      await evaluateReturnResolution(tx, refund.returnRequestId);
    }

    return updatedRefund;
  });
}
