import { prisma } from '@/lib/db/prisma';
import {
  Prisma,
  SalesChannel,
  OrderStatus,
  PaymentStatus,
  RefundStatus,
  RefundMethod,
  ManualRefundResolutionType,
} from '@prisma/client';

export interface GetPaymentsParams {
  search?: string;
  paymentStatus?: PaymentStatus | 'ALL';
  paymentMethod?: string | 'ALL';
  salesChannel?: SalesChannel | 'ALL';
  orderStatus?: OrderStatus | 'ALL';
  startDate?: string;
  endDate?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'grandTotal';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface AdminPaymentListItem {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  customerName: string;
  customerMobile: string;
  orderTotal: number;
  paymentMethod: string | null;
  paymentStatus: PaymentStatus;
  salesChannel: SalesChannel;
  orderStatus: OrderStatus;
  amountPaid: number;
  refundedAmount: number;
  remainingDue: number;
  latestRefund: {
    id: string;
    refundNumber: string;
    status: RefundStatus;
    method: RefundMethod;
    amount: number;
    createdAt: string;
  } | null;
  updatedAt: string;
}

export interface GetPaymentsResult {
  payments: AdminPaymentListItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface GetRefundsParams {
  statusTab?: 'PENDING' | 'HISTORY' | 'ALL';
  search?: string;
  method?: RefundMethod | 'ALL';
  page?: number;
  limit?: number;
}

export interface AdminRefundListItem {
  id: string;
  refundNumber: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerMobile: string;
  amount: number;
  shippingRefund: number;
  method: RefundMethod;
  status: RefundStatus;
  source: 'ORDER_CANCELLATION' | 'RETURN' | 'MANUAL';
  originalPaymentMethod: string | null;
  orderStatus: OrderStatus;
  manualResolutionType: ManualRefundResolutionType | null;
  manualResolutionNotes: string | null;
  providerRefundId: string | null;
  createdAt: string;
  processedAt: string | null;
  resolvedAt: string | null;
}

export interface GetRefundsResult {
  refunds: AdminRefundListItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface AdminPaymentDetailResult {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  customerName: string;
  customerMobile: string;
  customerAddress: string | null;
  salesChannel: SalesChannel;
  orderStatus: OrderStatus;
  paymentMethod: string | null;
  paymentStatus: PaymentStatus;
  subtotal: number;
  shippingFee: number;
  discountTotal: number;
  grandTotal: number;
  amountPaid: number;
  refundedAmount: number;
  remainingDue: number;
  items: Array<{
    id: string;
    productName: string;
    variantTitle: string | null;
    sku: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  payments: Array<{
    id: string;
    paymentNumber: string;
    provider: string;
    method: string | null;
    status: string;
    amount: number;
    initiatedAt: string;
    completedAt: string | null;
    errorMessage: string | null;
  }>;
  refunds: Array<{
    id: string;
    refundNumber: string;
    method: RefundMethod;
    status: RefundStatus;
    amount: number;
    shippingRefund: number;
    source: 'ORDER_CANCELLATION' | 'RETURN' | 'MANUAL';
    providerRefundId: string | null;
    manualResolutionType: ManualRefundResolutionType | null;
    manualResolutionNotes: string | null;
    createdAt: string;
    processedAt: string | null;
    allocations: Array<{
      orderItemId: string;
      merchandiseRefund: number;
      taxRefund: number;
      lineRefundTotal: number;
    }>;
  }>;
}

/**
 * Server-side database query service for Admin Payments.
 * Aggregates order payment information, refund metrics, and supports multi-attribute filtering.
 */
export async function queryAdminPayments(params?: GetPaymentsParams): Promise<GetPaymentsResult> {
  const where: Prisma.OrderWhereInput = {};

  if (params?.salesChannel && params.salesChannel !== 'ALL') {
    where.salesChannel = params.salesChannel as SalesChannel;
  }

  if (params?.orderStatus && params.orderStatus !== 'ALL') {
    where.status = params.orderStatus as OrderStatus;
  }

  if (params?.paymentStatus && params.paymentStatus !== 'ALL') {
    where.paymentStatus = params.paymentStatus as PaymentStatus;
  }

  if (params?.paymentMethod && params.paymentMethod !== 'ALL') {
    where.paymentMethod = params.paymentMethod as any;
  }

  if (params?.startDate || params?.endDate) {
    where.createdAt = {};
    if (params.startDate) {
      const start = new Date(params.startDate);
      if (!isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        where.createdAt.gte = start;
      }
    }
    if (params.endDate) {
      const end = new Date(params.endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
  }

  if (params?.search) {
    const query = params.search.trim();
    if (query) {
      where.OR = [
        { orderNumber: { contains: query, mode: 'insensitive' } },
        { customerNameSnapshot: { contains: query, mode: 'insensitive' } },
        { customerMobileSnapshot: { contains: query, mode: 'insensitive' } },
      ];
    }
  }

  const limit = Math.max(1, Math.min(params?.limit || 20, 100));
  const page = Math.max(1, params?.page || 1);
  const skip = (page - 1) * limit;

  const orderByField = params?.sortBy || 'updatedAt';
  const orderDirection = params?.sortOrder || 'desc';

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [orderByField]: orderDirection },
      include: {
        payments: {
          where: { status: 'SUCCESS' },
          select: { amount: true },
        },
        refunds: {
          select: {
            id: true,
            refundNumber: true,
            status: true,
            method: true,
            amount: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
  ]);

  const payments: AdminPaymentListItem[] = orders.map((order) => {
    const grandTotal = Number(order.grandTotal);

    // Calculate cumulative refunded amount
    const completedRefunds = order.refunds.filter(
      (r) => r.status === 'COMPLETED' || r.status === 'MANUALLY_RESOLVED'
    );
    const refundedAmount = completedRefunds.reduce((sum, r) => sum + Number(r.amount), 0);

    // Calculate amount paid based on status and payment records
    let amountPaid = 0;
    if (order.payments.length > 0) {
      amountPaid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    } else if (order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED' || order.paymentStatus === 'PARTIALLY_REFUNDED') {
      amountPaid = grandTotal;
    }

    // Remaining due
    let remainingDue = 0;
    if (order.paymentStatus === 'DUE') {
      remainingDue = grandTotal;
    }

    const latestRefund =
      order.refunds.length > 0
        ? {
            id: order.refunds[0].id,
            refundNumber: order.refunds[0].refundNumber,
            status: order.refunds[0].status,
            method: order.refunds[0].method,
            amount: Number(order.refunds[0].amount),
            createdAt: order.refunds[0].createdAt.toISOString(),
          }
        : null;

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderDate: order.createdAt.toISOString(),
      customerName: order.customerNameSnapshot,
      customerMobile: order.customerMobileSnapshot,
      orderTotal: grandTotal,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      salesChannel: order.salesChannel,
      orderStatus: order.status,
      amountPaid,
      refundedAmount,
      remainingDue,
      latestRefund,
      updatedAt: order.updatedAt.toISOString(),
    };
  });

  return {
    payments,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
    limit,
  };
}

/**
 * Server-side database query service for Admin Refunds.
 * Supports pending vs history views, multi-attribute search, and pagination.
 */
export async function queryAdminRefunds(params?: GetRefundsParams): Promise<GetRefundsResult> {
  const where: Prisma.RefundWhereInput = {};

  if (params?.statusTab === 'PENDING') {
    where.status = {
      in: [RefundStatus.PENDING, RefundStatus.PROCESSING, RefundStatus.REQUIRES_RECONCILIATION],
    };
  } else if (params?.statusTab === 'HISTORY') {
    where.status = {
      in: [RefundStatus.COMPLETED, RefundStatus.FAILED, RefundStatus.MANUALLY_RESOLVED],
    };
  }

  if (params?.method && params.method !== 'ALL') {
    where.method = params.method as RefundMethod;
  }

  if (params?.search) {
    const query = params.search.trim();
    if (query) {
      where.OR = [
        { refundNumber: { contains: query, mode: 'insensitive' } },
        { providerRefundId: { contains: query, mode: 'insensitive' } },
        { order: { orderNumber: { contains: query, mode: 'insensitive' } } },
        { order: { customerNameSnapshot: { contains: query, mode: 'insensitive' } } },
        { order: { customerMobileSnapshot: { contains: query, mode: 'insensitive' } } },
      ];
    }
  }

  const limit = Math.max(1, Math.min(params?.limit || 20, 100));
  const page = Math.max(1, params?.page || 1);
  const skip = (page - 1) * limit;

  const [total, records] = await Promise.all([
    prisma.refund.count({ where }),
    prisma.refund.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            customerNameSnapshot: true,
            customerMobileSnapshot: true,
          },
        },
        returnRequest: {
          select: { id: true, returnNumber: true },
        },
      },
    }),
  ]);

  const refunds: AdminRefundListItem[] = records.map((r) => {
    let source: 'ORDER_CANCELLATION' | 'RETURN' | 'MANUAL' = 'MANUAL';
    if (r.returnRequestId) {
      source = 'RETURN';
    } else if (r.order.status === OrderStatus.CANCELLED) {
      source = 'ORDER_CANCELLATION';
    }

    return {
      id: r.id,
      refundNumber: r.refundNumber,
      orderId: r.orderId,
      orderNumber: r.order.orderNumber,
      customerName: r.order.customerNameSnapshot,
      customerMobile: r.order.customerMobileSnapshot,
      amount: Number(r.amount),
      shippingRefund: Number(r.shippingRefund),
      method: r.method,
      status: r.status,
      source,
      originalPaymentMethod: r.order.paymentMethod,
      orderStatus: r.order.status,
      manualResolutionType: r.manualResolutionType,
      manualResolutionNotes: r.manualResolutionNotes,
      providerRefundId: r.providerRefundId,
      createdAt: r.createdAt.toISOString(),
      processedAt: r.processedAt ? r.processedAt.toISOString() : null,
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    };
  });

  return {
    refunds,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
    limit,
  };
}

/**
 * Loads detailed payment and refund state for a single order.
 */
export async function getAdminPaymentDetail(orderId: string): Promise<AdminPaymentDetailResult | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      payments: {
        orderBy: { createdAt: 'desc' },
      },
      refunds: {
        include: {
          allocations: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!order) return null;

  const grandTotal = Number(order.grandTotal);
  const completedRefunds = order.refunds.filter(
    (r) => r.status === 'COMPLETED' || r.status === 'MANUALLY_RESOLVED'
  );
  const refundedAmount = completedRefunds.reduce((sum, r) => sum + Number(r.amount), 0);

  let amountPaid = 0;
  const successfulPayments = order.payments.filter((p) => p.status === 'SUCCESS');
  if (successfulPayments.length > 0) {
    amountPaid = successfulPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  } else if (order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED' || order.paymentStatus === 'PARTIALLY_REFUNDED') {
    amountPaid = grandTotal;
  }

  let remainingDue = 0;
  if (order.paymentStatus === 'DUE') {
    remainingDue = grandTotal;
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderDate: order.createdAt.toISOString(),
    customerName: order.customerNameSnapshot,
    customerMobile: order.customerMobileSnapshot,
    customerAddress: order.shippingAddressSnapshot,
    salesChannel: order.salesChannel,
    orderStatus: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    subtotal: Number(order.subtotal),
    shippingFee: Number(order.shippingFee),
    discountTotal: Number(order.discountTotal),
    grandTotal,
    amountPaid,
    refundedAmount,
    remainingDue,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productNameSnapshot,
      variantTitle: item.variantTitleSnapshot,
      sku: item.skuSnapshot,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
    })),
    payments: order.payments.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      provider: p.provider,
      method: p.paymentMethod,
      status: p.status,
      amount: Number(p.amount),
      initiatedAt: p.initiatedAt.toISOString(),
      completedAt: p.completedAt ? p.completedAt.toISOString() : null,
      errorMessage: p.errorMessage,
    })),
    refunds: order.refunds.map((r) => {
      let source: 'ORDER_CANCELLATION' | 'RETURN' | 'MANUAL' = 'MANUAL';
      if (r.returnRequestId) {
        source = 'RETURN';
      } else if (order.status === OrderStatus.CANCELLED) {
        source = 'ORDER_CANCELLATION';
      }

      return {
        id: r.id,
        refundNumber: r.refundNumber,
        method: r.method,
        status: r.status,
        amount: Number(r.amount),
        shippingRefund: Number(r.shippingRefund),
        source,
        providerRefundId: r.providerRefundId,
        manualResolutionType: r.manualResolutionType,
        manualResolutionNotes: r.manualResolutionNotes,
        createdAt: r.createdAt.toISOString(),
        processedAt: r.processedAt ? r.processedAt.toISOString() : null,
        allocations: r.allocations.map((a) => ({
          orderItemId: a.orderItemId,
          merchandiseRefund: Number(a.merchandiseRefund),
          taxRefund: Number(a.taxRefund),
          lineRefundTotal: Number(a.lineRefundTotal),
        })),
      };
    }),
  };
}
