import { prisma } from '@/lib/db/prisma';
import { SalesChannel, OrderStatus, PaymentStatus, Prisma } from '@prisma/client';

export interface GetOrdersParams {
  salesChannel?: SalesChannel | 'ALL';
  status?: OrderStatus | 'ALL';
  paymentStatus?: PaymentStatus | 'ALL';
  search?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: 'createdAt' | 'grandTotal';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  offset?: number;
}

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  salesChannel: SalesChannel;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  customerNameSnapshot: string;
  customerMobileSnapshot: string;
  customerEmailSnapshot: string | null;
  subtotal: number;
  shippingFee: number;
  discountTotal: number;
  grandTotal: number;
  createdAt: string;
  itemsCount: number;
  linesCount: number;
  items: Array<{
    id: string;
    skuSnapshot: string;
    productNameSnapshot: string;
    variantTitleSnapshot?: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  shipment: {
    courierName: string;
    trackingId: string;
    trackingUrl: string | null;
    status: string;
  } | null;
}

export interface GetOrdersResult {
  orders: AdminOrderListItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

/**
 * Pure database-backed query service for Admin Orders.
 * Supports multi-attribute search, faceted filtering, date range filtering,
 * server-side sorting, and pagination with client-safe plain object serialization.
 */
export async function queryAdminOrders(params?: GetOrdersParams): Promise<GetOrdersResult> {
  const where: Prisma.OrderWhereInput = {};

  if (params?.salesChannel && params.salesChannel !== 'ALL') {
    where.salesChannel = params.salesChannel as SalesChannel;
  }

  if (params?.status && params.status !== 'ALL') {
    where.status = params.status as OrderStatus;
  }

  if (params?.paymentStatus && params.paymentStatus !== 'ALL') {
    where.paymentStatus = params.paymentStatus as PaymentStatus;
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
        { shipment: { trackingId: { contains: query, mode: 'insensitive' } } },
        { items: { some: { skuSnapshot: { contains: query, mode: 'insensitive' } } } },
      ];
    }
  }

  const sortBy = params?.sortBy === 'grandTotal' ? 'grandTotal' : 'createdAt';
  const sortOrder = params?.sortOrder === 'asc' ? 'asc' : 'desc';
  const orderBy: Prisma.OrderOrderByWithRelationInput = { [sortBy]: sortOrder };

  const limit = params?.limit ? Math.min(Math.max(1, params.limit), 100) : 25;
  const page = params?.page && params.page > 0 ? params.page : 1;
  const offset = params?.offset !== undefined ? params.offset : (page - 1) * limit;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      include: {
        customer: true,
        items: true,
        shipment: true,
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      salesChannel: o.salesChannel,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      customerNameSnapshot: o.customerNameSnapshot,
      customerMobileSnapshot: o.customerMobileSnapshot,
      customerEmailSnapshot: o.customerEmailSnapshot,
      subtotal: Number(o.subtotal),
      shippingFee: Number(o.shippingFee),
      discountTotal: Number(o.discountTotal),
      grandTotal: Number(o.grandTotal),
      createdAt: o.createdAt.toISOString(),
      itemsCount: o.items.reduce((acc, i) => acc + i.quantity, 0),
      linesCount: o.items.length,
      items: o.items.map((i) => ({
        id: i.id,
        skuSnapshot: i.skuSnapshot,
        productNameSnapshot: i.productNameSnapshot,
        variantTitleSnapshot: i.variantTitleSnapshot,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        lineTotal: Number(i.lineTotal),
      })),
      shipment: o.shipment
        ? {
            courierName: o.shipment.courierName,
            trackingId: o.shipment.trackingId,
            trackingUrl: o.shipment.trackingUrl,
            status: o.shipment.status,
          }
        : null,
    })),
    total,
    page: Math.floor(offset / limit) + 1,
    totalPages: Math.ceil(total / limit) || 1,
    limit,
  };
}

export interface ParsedAddress {
  raw: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

export function parseCustomerAddress(snapshot: string | null): ParsedAddress {
  if (!snapshot || !snapshot.trim()) {
    return { raw: '', address: '—', city: '—', state: '—', pincode: '—' };
  }
  const raw = snapshot.trim();
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        raw,
        address: parsed.addressLine1 || parsed.address || '—',
        city: parsed.city || '—',
        state: parsed.state || '—',
        pincode: parsed.postalCode || parsed.pincode || '—',
      };
    }
  } catch {
    // plain string or newline separated
  }

  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  let city = '';
  let state = '';
  let pincode = '';
  const streetParts: string[] = [];

  for (const line of lines) {
    if (line.toLowerCase().startsWith('city:')) {
      city = line.slice(5).trim();
    } else if (line.toLowerCase().startsWith('state:')) {
      state = line.slice(6).trim();
    } else if (line.toLowerCase().startsWith('pincode:')) {
      pincode = line.slice(8).trim();
    } else {
      streetParts.push(line);
    }
  }

  const address = streetParts.join(', ') || raw;
  return {
    raw,
    address: address || '—',
    city: city || '—',
    state: state || '—',
    pincode: pincode || '—',
  };
}

export interface AdminOrderDetailItem {
  id: string;
  variantId: string;
  skuSnapshot: string;
  productNameSnapshot: string;
  variantTitleSnapshot?: string | null;
  quantity: number;
  unitPrice: number;
  mrp: number;
  discountAmount: number;
  lineTotal: number;
  fifoCogs: number;
  productSlug?: string | null;
  productImageUrl?: string | null;
  currentStock: number;
}

export interface AdminOrderStatusTransition {
  id: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  notes?: string | null;
  createdAt: string;
}

export interface AdminOrderPaymentItem {
  id: string;
  paymentNumber: string;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  paymentMethod?: string | null;
  createdAt: string;
}

export interface AdminOrderRefundItem {
  id: string;
  refundNumber: string;
  method: string;
  status: string;
  amount: number;
  createdAt: string;
}

export interface AdminOrderDetailResult {
  id: string;
  orderNumber: string;
  salesChannel: SalesChannel;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  createdAt: string;
  confirmedAt?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  notes?: string | null;

  // Customer Snapshot
  customerNameSnapshot: string;
  customerMobileSnapshot: string;
  customerEmailSnapshot: string | null;
  shippingAddressSnapshot: string | null;
  billingAddressSnapshot: string | null;
  customerAddress: ParsedAddress;

  // Financial Totals
  subtotal: number;
  shippingFee: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  totalFifoCogs: number;

  // Coupon Snapshot
  couponCodeSnapshot: string | null;

  // Items
  items: AdminOrderDetailItem[];

  // Shipment
  shipment: {
    id: string;
    courierName: string;
    trackingId: string;
    trackingUrl: string | null;
    status: string;
    dispatchedAt: string;
    deliveredAt?: string | null;
  } | null;

  // History & Transitions
  statusTransitions: AdminOrderStatusTransition[];

  // Payments & Refunds
  payments: AdminOrderPaymentItem[];
  refunds: AdminOrderRefundItem[];
}

/**
 * Pure database-backed query service for a single Admin Order Detail.
 * Retrieves all frozen snapshots, items, transitions, shipment, payments, and refunds.
 * Serializes all Decimals to numbers and Dates to ISO strings for client-safe consumption.
 */
export async function getAdminOrderDetails(id: string): Promise<AdminOrderDetailResult | null> {
  if (!id || typeof id !== 'string') return null;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        include: {
          variant: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  images: {
                    orderBy: { sortOrder: 'asc' },
                    take: 1,
                    select: { url: true },
                  },
                },
              },
              inventoryItem: {
                select: {
                  physicalStock: true,
                  reservedStock: true,
                },
              },
            },
          },
        },
      },
      shipment: true,
      statusTransitions: {
        orderBy: { createdAt: 'asc' },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
      },
      refunds: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!order) return null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    salesChannel: order.salesChannel,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod ? String(order.paymentMethod) : null,
    createdAt: order.createdAt.toISOString(),
    confirmedAt: order.confirmedAt ? order.confirmedAt.toISOString() : null,
    dispatchedAt: order.dispatchedAt ? order.dispatchedAt.toISOString() : null,
    deliveredAt: order.deliveredAt ? order.deliveredAt.toISOString() : null,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    notes: order.notes,

    customerNameSnapshot: order.customerNameSnapshot,
    customerMobileSnapshot: order.customerMobileSnapshot,
    customerEmailSnapshot: order.customerEmailSnapshot,
    shippingAddressSnapshot: order.shippingAddressSnapshot,
    billingAddressSnapshot: order.billingAddressSnapshot,
    customerAddress: parseCustomerAddress(order.shippingAddressSnapshot),

    subtotal: Number(order.subtotal),
    shippingFee: Number(order.shippingFee),
    discountTotal: Number(order.discountTotal),
    taxTotal: Number(order.taxTotal),
    grandTotal: Number(order.grandTotal),
    totalFifoCogs: Number(order.totalFifoCogs),

    couponCodeSnapshot: order.couponCodeSnapshot,

    items: order.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      skuSnapshot: item.skuSnapshot,
      productNameSnapshot: item.productNameSnapshot,
      variantTitleSnapshot: item.variantTitleSnapshot,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      mrp: Number(item.mrp),
      discountAmount: Number(item.discountAmount),
      lineTotal: Number(item.lineTotal),
      fifoCogs: Number(item.fifoCogs),
      productSlug: item.variant?.product?.slug || null,
      productImageUrl: item.variant?.product?.images?.[0]?.url || null,
      currentStock: item.variant?.inventoryItem?.physicalStock ?? 0,
    })),

    shipment: order.shipment
      ? {
          id: order.shipment.id,
          courierName: order.shipment.courierName,
          trackingId: order.shipment.trackingId,
          trackingUrl: order.shipment.trackingUrl,
          status: String(order.shipment.status),
          dispatchedAt: order.shipment.dispatchedAt.toISOString(),
          deliveredAt: order.shipment.deliveredAt ? order.shipment.deliveredAt.toISOString() : null,
        }
      : null,

    statusTransitions: order.statusTransitions.map((t) => ({
      id: t.id,
      fromStatus: t.fromStatus,
      toStatus: t.toStatus,
      notes: t.notes,
      createdAt: t.createdAt.toISOString(),
    })),

    payments: order.payments.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      provider: String(p.provider),
      status: String(p.status),
      amount: Number(p.amount),
      currency: p.currency,
      paymentMethod: p.paymentMethod,
      createdAt: p.createdAt.toISOString(),
    })),

    refunds: order.refunds.map((r) => ({
      id: r.id,
      refundNumber: r.refundNumber,
      method: String(r.method),
      status: String(r.status),
      amount: Number(r.amount),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

