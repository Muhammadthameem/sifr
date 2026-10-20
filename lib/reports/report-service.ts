import { prisma } from '@/lib/db/prisma';
import { OrderStatus, SalesChannel, PaymentStatus, RefundStatus, ReturnStatus, PaymentAttemptStatus, NotificationStatus } from '@prisma/client';

export interface ReportDateRange {
  startDate?: Date;
  endDate?: Date;
}

/**
 * Builds a Prisma date filter condition enforcing half-open interval [startDate, endDate).
 * Date boundary convention: gte startDate, lt endDate.
 */
function buildDateFilter(dateRange?: ReportDateRange) {
  if (!dateRange) return undefined;
  const filter: { gte?: Date; lt?: Date } = {};
  if (dateRange.startDate) filter.gte = dateRange.startDate;
  if (dateRange.endDate) filter.lt = dateRange.endDate;
  return Object.keys(filter).length > 0 ? filter : undefined;
}

/**
 * Helper to compute startDate and endDate based on date range preset string.
 */
export function parseDateRangePreset(
  preset?: string,
  customStart?: string,
  customEnd?: string
): ReportDateRange | undefined {
  if (!preset || preset === 'all') return undefined;

  const now = new Date();

  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { startDate: start, endDate: end };
  }

  if (preset === 'yesterday') {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { startDate: start, endDate: end };
  }

  if (preset === '7d') {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { startDate: start };
  }

  if (preset === '30d') {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { startDate: start };
  }

  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: start };
  }

  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: start, endDate: end };
  }

  if (preset === 'this_year') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { startDate: start };
  }

  if (preset === 'custom' && customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      return { startDate: start, endDate: end };
    }
  }

  // Default fallback if unknown preset passed
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { startDate: start };
}

export const SALE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.DISPATCHED,
  OrderStatus.DELIVERED,
];

export interface ExecutiveFinancialSummary {
  grossSales: number;
  returns: number;
  refunds: number;
  netRevenue: number;
  totalOrders: number;
  aov: number;
  fifoCogs: number;
  grossMargin: number;
  grossMarginPercent: number;
  totalExpenses: number;
  netProfit: number;
}

/**
 * Calculates executive financial summary for qualifying sale orders created within dateRange.
 * Strictly excludes CONTACTED and CANCELLED orders. Qualifying statuses: CONFIRMED, DISPATCHED, DELIVERED.
 * Properly accounts for accepted returns (reversing revenue and COGS) without double-counting refunds.
 */
export async function getExecutiveFinancialSummary(
  dateRange?: ReportDateRange,
  channel?: SalesChannel
): Promise<ExecutiveFinancialSummary> {
  const dateFilter = buildDateFilter(dateRange);
  const channelFilter = channel && (channel as string) !== 'ALL' ? channel : undefined;

  const orderWhere: any = {
    status: { in: SALE_ORDER_STATUSES },
    ...(dateFilter ? { createdAt: dateFilter } : {}),
    ...(channelFilter ? { salesChannel: channelFilter } : {}),
  };

  // 1. Aggregate Qualifying Sale Orders (Gross Sales, Order Count, FIFO COGS)
  const orderAggregate = await prisma.order.aggregate({
    where: orderWhere,
    _sum: {
      grandTotal: true,
      totalFifoCogs: true,
    },
    _count: {
      id: true,
    },
  });

  const grossSales = Number(orderAggregate._sum.grandTotal ?? 0);
  const rawFifoCogs = Number(orderAggregate._sum.totalFifoCogs ?? 0);
  const totalOrders = orderAggregate._count.id;

  // 2. Aggregate Accepted Returns for qualifying orders created in dateRange
  const acceptedReturns = await prisma.returnRequest.findMany({
    where: {
      status: ReturnStatus.ACCEPTED,
      order: orderWhere,
    },
    include: {
      order: { select: { totalFifoCogs: true } },
    },
  });

  let acceptedReturnsValue = 0;
  let returnedFifoCogs = 0;
  const returnedOrderIds = new Set<string>();

  for (const ret of acceptedReturns) {
    acceptedReturnsValue += Number(ret.totalRefundAmount);
    returnedFifoCogs += Number(ret.order.totalFifoCogs);
    returnedOrderIds.add(ret.orderId);
  }

  // 3. Aggregate Completed/Manually Resolved Refunds not already part of acceptedReturns
  const refundAggregate = await prisma.refund.aggregate({
    where: {
      status: {
        in: [RefundStatus.COMPLETED, RefundStatus.MANUALLY_RESOLVED],
      },
      orderId: { notIn: Array.from(returnedOrderIds) },
      order: orderWhere,
    },
    _sum: {
      amount: true,
    },
  });

  const standaloneRefunds = Number(refundAggregate._sum.amount ?? 0);
  const totalDeductions = acceptedReturnsValue + standaloneRefunds;
  const netRevenue = grossSales - totalDeductions;
  const netFifoCogs = Math.max(0, rawFifoCogs - returnedFifoCogs);

  // Zero-safety math calculations
  const aov = totalOrders > 0 ? netRevenue / totalOrders : 0;
  const grossMargin = netRevenue - netFifoCogs;
  const grossMarginPercent = netRevenue > 0 ? (grossMargin / netRevenue) * 100 : 0;

  // 4. Aggregate Operating Expenses
  const expenseDateFilter = buildDateFilter(dateRange);
  const expenseAggregate = await prisma.expense.aggregate({
    where: {
      ...(expenseDateFilter ? { expenseDate: expenseDateFilter } : {}),
    },
    _sum: {
      amount: true,
    },
  });

  const totalExpenses = Number(expenseAggregate._sum.amount ?? 0);
  const netProfit = grossMargin - totalExpenses;

  return {
    grossSales,
    returns: acceptedReturnsValue,
    refunds: totalDeductions,
    netRevenue,
    totalOrders,
    aov,
    fifoCogs: netFifoCogs,
    grossMargin,
    grossMarginPercent,
    totalExpenses,
    netProfit,
  };
}

export interface OrderFunnelSummary {
  contacted?: number;
  received: number;
  confirmed: number;
  dispatched: number;
  delivered: number;
  cancelled: number;
  total: number;
}

/**
 * Returns order count grouped by order status for orders created within dateRange.
 */
export async function getOrderFunnelSummary(
  dateRange?: ReportDateRange,
  channel?: SalesChannel
): Promise<OrderFunnelSummary> {
  const dateFilter = buildDateFilter(dateRange);
  const channelFilter = channel && (channel as string) !== 'ALL' ? channel : undefined;

  const statusGroups = await prisma.order.groupBy({
    by: ['status'],
    where: {
      ...(dateFilter ? { createdAt: dateFilter } : {}),
      ...(channelFilter ? { salesChannel: channelFilter } : {}),
    },
    _count: {
      id: true,
    },
  });

  const counts: Record<string, number> = {
    CONTACTED: 0,
    RECEIVED: 0,
    CONFIRMED: 0,
    DISPATCHED: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  };

  let total = 0;
  for (const group of statusGroups) {
    counts[group.status] = group._count.id;
    total += group._count.id;
  }

  return {
    contacted: counts.CONTACTED || 0,
    received: counts.RECEIVED || 0,
    confirmed: counts.CONFIRMED || 0,
    dispatched: counts.DISPATCHED || 0,
    delivered: counts.DELIVERED || 0,
    cancelled: counts.CANCELLED || 0,
    total,
  };
}

export interface ChannelSummaryItem {
  channel: SalesChannel;
  orderCount: number;
  grossSales: number;
  netRevenue: number;
}

/**
 * Returns sales & order count breakdown grouped by sales channel for qualifying sale orders.
 */
export async function getChannelSummary(
  dateRange?: ReportDateRange
): Promise<ChannelSummaryItem[]> {
  const dateFilter = buildDateFilter(dateRange);

  const channelGroups = await prisma.order.groupBy({
    by: ['salesChannel'],
    where: {
      status: { in: SALE_ORDER_STATUSES },
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    _sum: {
      grandTotal: true,
    },
    _count: {
      id: true,
    },
  });

  const result: ChannelSummaryItem[] = [];

  for (const group of channelGroups) {
    const grossSales = Number(group._sum.grandTotal ?? 0);

    // Get accepted returns for this channel
    const acceptedReturns = await prisma.returnRequest.findMany({
      where: {
        status: ReturnStatus.ACCEPTED,
        order: {
          salesChannel: group.salesChannel,
          status: { in: SALE_ORDER_STATUSES },
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      },
      select: { orderId: true, totalRefundAmount: true },
    });

    const channelReturnedOrderIds = new Set(acceptedReturns.map((r) => r.orderId));
    const channelReturnsValue = acceptedReturns.reduce((sum, r) => sum + Number(r.totalRefundAmount), 0);

    // Get standalone refunds for this channel
    const refundAggregate = await prisma.refund.aggregate({
      where: {
        status: { in: [RefundStatus.COMPLETED, RefundStatus.MANUALLY_RESOLVED] },
        orderId: { notIn: Array.from(channelReturnedOrderIds) },
        order: {
          salesChannel: group.salesChannel,
          status: { in: SALE_ORDER_STATUSES },
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      },
      _sum: {
        amount: true,
      },
    });

    const refunds = channelReturnsValue + Number(refundAggregate._sum.amount ?? 0);
    const netRevenue = grossSales - refunds;

    result.push({
      channel: group.salesChannel,
      orderCount: group._count.id,
      grossSales,
      netRevenue,
    });
  }

  return result;
}

export interface InventoryHealthSummary {
  totalPhysicalUnits: number;
  totalReservedUnits: number;
  totalAvailableUnits: number;
  inventoryFifoValuation: number;
  outOfStockCount: number;
  lowStockCount: number;
}

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/**
 * Returns current snapshot of physical/reserved/available stock and FIFO valuation.
 */
export async function getInventoryHealthSummary(
  lowStockThreshold = DEFAULT_LOW_STOCK_THRESHOLD
): Promise<InventoryHealthSummary> {
  const inventoryItems = await prisma.inventoryItem.findMany({
    select: {
      physicalStock: true,
      reservedStock: true,
    },
  });

  let totalPhysicalUnits = 0;
  let totalReservedUnits = 0;
  let outOfStockCount = 0;
  let lowStockCount = 0;

  for (const item of inventoryItems) {
    totalPhysicalUnits += item.physicalStock;
    totalReservedUnits += item.reservedStock;
    const available = Math.max(0, item.physicalStock - item.reservedStock);

    if (available === 0) {
      outOfStockCount++;
    } else if (available <= lowStockThreshold) {
      lowStockCount++;
    }
  }

  const totalAvailableUnits = Math.max(0, totalPhysicalUnits - totalReservedUnits);

  // FIFO Cost Valuation aggregate across active layers
  const fifoLayers = await prisma.fifoLayer.findMany({
    where: {
      remainingQuantity: { gt: 0 },
    },
    select: {
      remainingQuantity: true,
      unitCost: true,
    },
  });

  let inventoryFifoValuation = 0;
  for (const layer of fifoLayers) {
    inventoryFifoValuation += layer.remainingQuantity * Number(layer.unitCost);
  }

  return {
    totalPhysicalUnits,
    totalReservedUnits,
    totalAvailableUnits,
    inventoryFifoValuation,
    outOfStockCount,
    lowStockCount,
  };
}

export interface ProductPerformanceItem {
  productId: string;
  productName: string;
  categoryName: string;
  unitsSold: number;
  grossRevenue: number;
  fifoCogs: number;
  grossMargin: number;
}

/**
 * Returns product performance metrics (units sold, gross revenue, FIFO COGS) for qualifying sale orders created within dateRange.
 */
export async function getProductPerformanceSummary(
  dateRange?: ReportDateRange,
  limit = 50
): Promise<ProductPerformanceItem[]> {
  const dateFilter = buildDateFilter(dateRange);

  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        status: { in: SALE_ORDER_STATUSES },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
    },
    include: {
      variant: {
        include: {
          product: {
            include: {
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const productMap = new Map<
    string,
    {
      productId: string;
      productName: string;
      categoryName: string;
      unitsSold: number;
      grossRevenue: number;
      fifoCogs: number;
    }
  >();

  for (const item of orderItems) {
    const product = item.variant.product;
    const pid = product.id;
    const lineRevenue = Number(item.lineTotal);
    const lineCogs = Number(item.fifoCogs);

    const existing = productMap.get(pid);
    if (existing) {
      existing.unitsSold += item.quantity;
      existing.grossRevenue += lineRevenue;
      existing.fifoCogs += lineCogs;
    } else {
      productMap.set(pid, {
        productId: pid,
        productName: product.name,
        categoryName: product.category.name,
        unitsSold: item.quantity,
        grossRevenue: lineRevenue,
        fifoCogs: lineCogs,
      });
    }
  }

  const performanceList: ProductPerformanceItem[] = Array.from(productMap.values()).map(
    (p) => ({
      ...p,
      grossMargin: p.grossRevenue - p.fifoCogs,
    })
  );

  performanceList.sort((a, b) => b.grossRevenue - a.grossRevenue);
  return performanceList.slice(0, limit);
}

export interface ReturnsSummary {
  statusCounts: Record<ReturnStatus, number>;
  totalRequests: number;
  totalRefundAmount: number;
}

/**
 * Returns summary of return requests created within ReturnRequest.createdAt dateRange.
 */
export async function getReturnsSummary(
  dateRange?: ReportDateRange
): Promise<ReturnsSummary> {
  const dateFilter = buildDateFilter(dateRange);

  const returnGroups = await prisma.returnRequest.groupBy({
    by: ['status'],
    where: {
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    _count: {
      id: true,
    },
  });

  const statusCounts: Record<ReturnStatus, number> = {
    REQUESTED: 0,
    ACCEPTED: 0,
    APPROVED: 0,
    REJECTED: 0,
    RECEIVED: 0,
    INSPECTED: 0,
    RESOLVED: 0,
  };

  let totalRequests = 0;
  for (const group of returnGroups) {
    statusCounts[group.status] = group._count.id;
    totalRequests += group._count.id;
  }

  const refundAggregate = await prisma.refund.aggregate({
    where: {
      status: { in: [RefundStatus.COMPLETED, RefundStatus.MANUALLY_RESOLVED] },
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    _sum: {
      amount: true,
    },
  });

  const totalRefundAmount = Number(refundAggregate._sum.amount ?? 0);

  return {
    statusCounts,
    totalRequests,
    totalRefundAmount,
  };
}

export interface PaymentSummary {
  statusCounts: Record<PaymentAttemptStatus, number>;
  totalAttempts: number;
}

/**
 * Returns payment summary counts by PaymentAttemptStatus for payments initiated within Payment.createdAt dateRange.
 */
export async function getPaymentSummary(
  dateRange?: ReportDateRange
): Promise<PaymentSummary> {
  const dateFilter = buildDateFilter(dateRange);

  const paymentGroups = await prisma.payment.groupBy({
    by: ['status'],
    where: {
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    _count: {
      id: true,
    },
  });

  const statusCounts: Record<PaymentAttemptStatus, number> = {
    INITIATED: 0,
    PROCESSING: 0,
    SUCCESS: 0,
    FAILED: 0,
    CANCELLED: 0,
    EXPIRED: 0,
    REQUIRES_RECONCILIATION: 0,
  };

  let totalAttempts = 0;
  for (const group of paymentGroups) {
    statusCounts[group.status] = group._count.id;
    totalAttempts += group._count.id;
  }

  return {
    statusCounts,
    totalAttempts,
  };
}

export interface NotificationSummary {
  statusCounts: Record<NotificationStatus, number>;
  totalNotifications: number;
}

/**
 * Returns notification outbox status counts for notifications created within Notification.createdAt dateRange.
 */
export async function getNotificationSummary(
  dateRange?: ReportDateRange
): Promise<NotificationSummary> {
  const dateFilter = buildDateFilter(dateRange);

  const notifGroups = await prisma.notification.groupBy({
    by: ['status'],
    where: {
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    _count: {
      id: true,
    },
  });

  const statusCounts: Record<NotificationStatus, number> = {
    PENDING: 0,
    PROCESSING: 0,
    SENT: 0,
    FAILED: 0,
    REQUIRES_RECONCILIATION: 0,
  };

  let totalNotifications = 0;
  for (const group of notifGroups) {
    statusCounts[group.status] = group._count.id;
    totalNotifications += group._count.id;
  }

  return {
    statusCounts,
    totalNotifications,
  };
}

export interface SalesReportFilterOptions {
  dateRange?: ReportDateRange;
  channel?: SalesChannel | 'ALL';
  orderStatus?: OrderStatus | 'ALL';
  paymentStatus?: PaymentStatus | 'ALL';
  page?: number;
  pageSize?: number;
}

export interface SalesReportRow {
  id: string;
  orderNumber: string;
  createdAt: Date;
  salesChannel: SalesChannel;
  customerName: string;
  itemsQuantity: number;
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  taxTotal: number;
  grandTotal: number; // Gross Sales
  attributedRefund: number;
  netRevenue: number;
  fifoCogs: number;
  grossMargin: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
}

export interface SalesReportPaginatedResult {
  rows: SalesReportRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Returns paginated sales report rows for /admin/reports/sales.
 * 
 * Enforces:
 * - Order.createdAt date filtering [startDate, endDate)
 * - Default population: Order.status in SALE_ORDER_STATUSES (CONFIRMED, DISPATCHED, DELIVERED)
 * - Attributed refund from qualifying refunds (COMPLETED, MANUALLY_RESOLVED)
 * - Server-side pagination
 */
export async function getSalesReportRows(
  options: SalesReportFilterOptions
): Promise<SalesReportPaginatedResult> {
  const dateFilter = buildDateFilter(options.dateRange);
  const page = options.page && options.page > 0 ? options.page : 1;
  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 25;
  const skip = (page - 1) * pageSize;

  const whereClause: any = {
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };

  if (options.channel && options.channel !== 'ALL') {
    whereClause.salesChannel = options.channel;
  }

  if (options.orderStatus && (options.orderStatus as string) !== 'ALL') {
    whereClause.status = options.orderStatus;
  } else {
    // Default population: qualifying sale orders only
    whereClause.status = { in: SALE_ORDER_STATUSES };
  }

  if (options.paymentStatus && (options.paymentStatus as string) !== 'ALL') {
    whereClause.paymentStatus = options.paymentStatus;
  }

  const [totalCount, orders] = await Promise.all([
    prisma.order.count({ where: whereClause }),
    prisma.order.findMany({
      where: whereClause,
      include: {
        items: {
          select: { quantity: true },
        },
        returnRequests: {
          where: { status: ReturnStatus.ACCEPTED },
          select: { totalRefundAmount: true },
        },
        refunds: {
          where: {
            status: { in: [RefundStatus.COMPLETED, RefundStatus.MANUALLY_RESOLVED] },
          },
          select: { amount: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
  ]);

  const rows: SalesReportRow[] = orders.map((order) => {
    const itemsQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const acceptedReturn = order.returnRequests[0];
    const returnedAmount = acceptedReturn ? Number(acceptedReturn.totalRefundAmount) : 0;
    const refundsAmount = order.refunds.reduce((sum, ref) => sum + Number(ref.amount), 0);
    const attributedRefund = Math.max(returnedAmount, refundsAmount);
    const grandTotalNum = Number(order.grandTotal);
    const netRevenueNum = grandTotalNum - attributedRefund;
    const returnedCogs = acceptedReturn ? Number(order.totalFifoCogs) : 0;
    const fifoCogsNum = Math.max(0, Number(order.totalFifoCogs) - returnedCogs);
    const grossMarginNum = netRevenueNum - fifoCogsNum;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      salesChannel: order.salesChannel,
      customerName: order.customerNameSnapshot,
      itemsQuantity,
      subtotal: Number(order.subtotal),
      discountTotal: Number(order.discountTotal),
      shippingFee: Number(order.shippingFee),
      taxTotal: Number(order.taxTotal),
      grandTotal: grandTotalNum,
      attributedRefund,
      netRevenue: netRevenueNum,
      fifoCogs: fifoCogsNum,
      grossMargin: grossMarginNum,
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
    };
  });

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return {
    rows,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Returns filtered sales report summary totals matching applied filter criteria.
 */
export async function getSalesReportSummary(
  options: SalesReportFilterOptions
): Promise<ExecutiveFinancialSummary> {
  const dateFilter = buildDateFilter(options.dateRange);

  const whereClause: any = {
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };

  if (options.channel && options.channel !== 'ALL') {
    whereClause.salesChannel = options.channel;
  }

  if (options.orderStatus && (options.orderStatus as string) !== 'ALL') {
    whereClause.status = options.orderStatus;
  } else {
    whereClause.status = { in: SALE_ORDER_STATUSES };
  }

  if (options.paymentStatus && (options.paymentStatus as string) !== 'ALL') {
    whereClause.paymentStatus = options.paymentStatus;
  }

  const orderAggregate = await prisma.order.aggregate({
    where: whereClause,
    _sum: {
      grandTotal: true,
      totalFifoCogs: true,
    },
    _count: {
      id: true,
    },
  });

  const grossSales = Number(orderAggregate._sum.grandTotal ?? 0);
  const rawFifoCogs = Number(orderAggregate._sum.totalFifoCogs ?? 0);
  const totalOrders = orderAggregate._count.id;

  // Aggregate Accepted Returns
  const acceptedReturns = await prisma.returnRequest.findMany({
    where: {
      status: ReturnStatus.ACCEPTED,
      order: whereClause,
    },
    include: {
      order: { select: { totalFifoCogs: true } },
    },
  });

  let acceptedReturnsValue = 0;
  let returnedFifoCogs = 0;
  const returnedOrderIds = new Set<string>();

  for (const ret of acceptedReturns) {
    acceptedReturnsValue += Number(ret.totalRefundAmount);
    returnedFifoCogs += Number(ret.order.totalFifoCogs);
    returnedOrderIds.add(ret.orderId);
  }

  const refundAggregate = await prisma.refund.aggregate({
    where: {
      status: { in: [RefundStatus.COMPLETED, RefundStatus.MANUALLY_RESOLVED] },
      orderId: { notIn: Array.from(returnedOrderIds) },
      order: whereClause,
    },
    _sum: {
      amount: true,
    },
  });

  const standaloneRefunds = Number(refundAggregate._sum.amount ?? 0);
  const totalDeductions = acceptedReturnsValue + standaloneRefunds;
  const netRevenue = grossSales - totalDeductions;
  const netFifoCogs = Math.max(0, rawFifoCogs - returnedFifoCogs);

  const aov = totalOrders > 0 ? netRevenue / totalOrders : 0;
  const grossMargin = netRevenue - netFifoCogs;
  const grossMarginPercent = netRevenue > 0 ? (grossMargin / netRevenue) * 100 : 0;

  // Aggregate Operating Expenses
  const expenseDateFilter = buildDateFilter(options.dateRange);
  const expenseAggregate = await prisma.expense.aggregate({
    where: {
      ...(expenseDateFilter ? { expenseDate: expenseDateFilter } : {}),
    },
    _sum: {
      amount: true,
    },
  });

  const totalExpenses = Number(expenseAggregate._sum.amount ?? 0);
  const netProfit = grossMargin - totalExpenses;

  return {
    grossSales,
    returns: acceptedReturnsValue,
    refunds: totalDeductions,
    netRevenue,
    totalOrders,
    aov,
    fifoCogs: netFifoCogs,
    grossMargin,
    grossMarginPercent,
    totalExpenses,
    netProfit,
  };
}

export interface InventoryReportFilterOptions {
  search?: string;
  category?: string;
  stockStatus?: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  lowStockThreshold?: number;
  page?: number;
  pageSize?: number;
}

export interface InventoryReportSummary {
  totalSkus: number;
  totalPhysicalUnits: number;
  totalReservedUnits: number;
  totalAvailableUnits: number;
  outOfStockCount: number;
  lowStockCount: number;
  inventoryFifoValuation: number;
}

export interface InventoryReportRow {
  variantId: string;
  sku: string;
  productName: string;
  variantTitle: string;
  categoryName: string;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  fifoValuation: number;
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export interface InventoryReportPaginatedResult {
  rows: InventoryReportRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Returns overall inventory report summary metrics (total SKUs, units, valuation, low/out-of-stock counts).
 */
export async function getInventoryReportSummary(
  lowStockThreshold = DEFAULT_LOW_STOCK_THRESHOLD
): Promise<InventoryReportSummary> {
  const [totalSkus, inventoryItems, fifoLayers] = await Promise.all([
    prisma.productVariant.count(),
    prisma.inventoryItem.findMany({
      select: {
        physicalStock: true,
        reservedStock: true,
      },
    }),
    prisma.fifoLayer.findMany({
      where: { remainingQuantity: { gt: 0 } },
      select: {
        remainingQuantity: true,
        unitCost: true,
      },
    }),
  ]);

  let totalPhysicalUnits = 0;
  let totalReservedUnits = 0;
  let outOfStockCount = 0;
  let lowStockCount = 0;

  for (const item of inventoryItems) {
    totalPhysicalUnits += item.physicalStock;
    totalReservedUnits += item.reservedStock;
    const available = Math.max(0, item.physicalStock - item.reservedStock);

    if (available === 0) {
      outOfStockCount++;
    } else if (available <= lowStockThreshold) {
      lowStockCount++;
    }
  }

  // Account for SKUs that have no InventoryItem record (treated as Out of Stock)
  const itemsCount = inventoryItems.length;
  if (totalSkus > itemsCount) {
    outOfStockCount += totalSkus - itemsCount;
  }

  const totalAvailableUnits = Math.max(0, totalPhysicalUnits - totalReservedUnits);

  let inventoryFifoValuation = 0;
  for (const layer of fifoLayers) {
    inventoryFifoValuation += layer.remainingQuantity * Number(layer.unitCost);
  }

  return {
    totalSkus,
    totalPhysicalUnits,
    totalReservedUnits,
    totalAvailableUnits,
    outOfStockCount,
    lowStockCount,
    inventoryFifoValuation,
  };
}

/**
 * Returns paginated inventory report rows with status and FIFO valuation for /admin/reports/inventory.
 */
export async function getInventoryReportRows(
  options: InventoryReportFilterOptions
): Promise<InventoryReportPaginatedResult> {
  const lowStockThreshold = options.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
  const page = options.page && options.page > 0 ? options.page : 1;
  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 25;

  const whereClause: any = {};

  if (options.search && options.search.trim()) {
    const query = options.search.trim();
    whereClause.OR = [
      { sku: { contains: query, mode: 'insensitive' } },
      { title: { contains: query, mode: 'insensitive' } },
      { product: { name: { contains: query, mode: 'insensitive' } } },
    ];
  }

  if (options.category && options.category !== 'ALL') {
    whereClause.product = {
      ...whereClause.product,
      OR: [{ categoryId: options.category }, { category: { slug: options.category } }],
    };
  }

  const variants = await prisma.productVariant.findMany({
    where: whereClause,
    include: {
      product: {
        include: {
          category: { select: { name: true } },
        },
      },
      inventoryItem: {
        select: { physicalStock: true, reservedStock: true },
      },
      fifoLayers: {
        where: { remainingQuantity: { gt: 0 } },
        select: { remainingQuantity: true, unitCost: true },
      },
    },
    orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
  });

  const allRows: InventoryReportRow[] = variants.map((variant) => {
    const physicalStock = variant.inventoryItem?.physicalStock ?? 0;
    const reservedStock = variant.inventoryItem?.reservedStock ?? 0;
    const availableStock = Math.max(0, physicalStock - reservedStock);

    let stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
    if (availableStock === 0) {
      stockStatus = 'OUT_OF_STOCK';
    } else if (availableStock <= lowStockThreshold) {
      stockStatus = 'LOW_STOCK';
    } else {
      stockStatus = 'IN_STOCK';
    }

    let fifoValuation = 0;
    if (variant.fifoLayers) {
      for (const layer of variant.fifoLayers) {
        fifoValuation += layer.remainingQuantity * Number(layer.unitCost);
      }
    }

    return {
      variantId: variant.id,
      sku: variant.sku,
      productName: variant.product.name,
      variantTitle: variant.title,
      categoryName: variant.product.category.name,
      physicalStock,
      reservedStock,
      availableStock,
      fifoValuation,
      stockStatus,
    };
  });

  // Apply stockStatus filter if provided
  let filteredRows = allRows;
  if (options.stockStatus && options.stockStatus !== 'ALL') {
    filteredRows = allRows.filter((r) => r.stockStatus === options.stockStatus);
  }

  const totalCount = filteredRows.length;
  const skip = (page - 1) * pageSize;
  const paginatedRows = filteredRows.slice(skip, skip + pageSize);
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return {
    rows: paginatedRows,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

/* ============================================================================
 * PHASE 13 STEP 5: PRODUCT PERFORMANCE REPORT SERVICE
 * ============================================================================ */

export interface ProductReportFilterOptions {
  dateRange?: ReportDateRange;
  search?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

export interface ProductReportSummary {
  totalProducts: number;
  totalUnitsSold: number;
  grossSales: number;
  refunds: number;
  netRevenue: number;
  fifoCogs: number;
  grossMargin: number;
  grossMarginPercent: number;
}

export interface ProductReportRow {
  productId: string;
  productName: string;
  categoryName: string;
  unitsSold: number;
  grossSales: number;
  attributedRefund: number;
  netRevenue: number;
  fifoCogs: number;
  grossMargin: number;
  grossMarginPercent: number;
}

export interface ProductReportPaginatedResult {
  rows: ProductReportRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Returns summary KPI metrics for Product Performance Report across qualifying sale orders created within dateRange.
 */
export async function getProductReportSummary(
  options?: ProductReportFilterOptions
): Promise<ProductReportSummary> {
  const dateFilter = buildDateFilter(options?.dateRange);

  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        status: { in: SALE_ORDER_STATUSES },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
    },
    include: {
      variant: {
        select: { productId: true },
      },
      returnItems: {
        where: { returnRequest: { status: ReturnStatus.ACCEPTED } },
        select: { quantityRestocked: true, netRefundAmount: true },
      },
      refundAllocations: {
        where: {
          refund: {
            status: { in: [RefundStatus.COMPLETED, RefundStatus.MANUALLY_RESOLVED] },
          },
        },
        select: { lineRefundTotal: true },
      },
    },
  });

  const productSet = new Set<string>();
  let totalUnitsSold = 0;
  let grossSales = 0;
  let fifoCogs = 0;
  let refunds = 0;

  for (const item of orderItems) {
    productSet.add(item.variant.productId);
    totalUnitsSold += item.quantity;
    grossSales += Number(item.lineTotal);

    const returnedAlloc = item.returnItems[0];
    const returnedRefund = returnedAlloc ? Number(returnedAlloc.netRefundAmount) : 0;
    const refundAllocTotal = item.refundAllocations.reduce((sum, alloc) => sum + Number(alloc.lineRefundTotal), 0);
    const itemRefund = Math.max(returnedRefund, refundAllocTotal);
    refunds += itemRefund;

    const itemReturnedCogs = returnedAlloc ? Number(item.fifoCogs) : 0;
    fifoCogs += Math.max(0, Number(item.fifoCogs) - itemReturnedCogs);
  }

  const netRevenue = grossSales - refunds;
  const grossMargin = netRevenue - fifoCogs;
  const grossMarginPercent = netRevenue > 0 ? (grossMargin / netRevenue) * 100 : 0;

  return {
    totalProducts: productSet.size,
    totalUnitsSold,
    grossSales,
    refunds,
    netRevenue,
    fifoCogs,
    grossMargin,
    grossMarginPercent,
  };
}

/**
 * Returns paginated product performance rows for /admin/reports/products.
 */
export async function getProductReportRows(
  options: ProductReportFilterOptions
): Promise<ProductReportPaginatedResult> {
  const dateFilter = buildDateFilter(options.dateRange);
  const page = options.page && options.page > 0 ? options.page : 1;
  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 25;

  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        status: { in: SALE_ORDER_STATUSES },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      ...(options.search && options.search.trim()
        ? {
            OR: [
              { productNameSnapshot: { contains: options.search.trim(), mode: 'insensitive' } },
              { skuSnapshot: { contains: options.search.trim(), mode: 'insensitive' } },
              { variant: { product: { name: { contains: options.search.trim(), mode: 'insensitive' } } } },
            ],
          }
        : {}),
      ...(options.category && options.category !== 'ALL'
        ? {
            variant: {
              product: {
                OR: [{ categoryId: options.category }, { category: { slug: options.category } }],
              },
            },
          }
        : {}),
    },
    include: {
      variant: {
        include: {
          product: {
            include: {
              category: { select: { name: true } },
            },
          },
        },
      },
      returnItems: {
        where: { returnRequest: { status: ReturnStatus.ACCEPTED } },
        select: { quantityRestocked: true, netRefundAmount: true },
      },
      refundAllocations: {
        where: {
          refund: {
            status: { in: [RefundStatus.COMPLETED, RefundStatus.MANUALLY_RESOLVED] },
          },
        },
        select: { lineRefundTotal: true },
      },
    },
  });

  const productMap = new Map<
    string,
    {
      productId: string;
      productName: string;
      categoryName: string;
      unitsSold: number;
      grossSales: number;
      attributedRefund: number;
      fifoCogs: number;
    }
  >();

  for (const item of orderItems) {
    const product = item.variant.product;
    const pid = product.id;
    const lineRevenue = Number(item.lineTotal);

    const returnedAlloc = item.returnItems[0];
    const returnedRefund = returnedAlloc ? Number(returnedAlloc.netRefundAmount) : 0;
    const refundAllocTotal = item.refundAllocations.reduce((sum, alloc) => sum + Number(alloc.lineRefundTotal), 0);
    const itemRefund = Math.max(returnedRefund, refundAllocTotal);

    const itemReturnedCogs = returnedAlloc ? Number(item.fifoCogs) : 0;
    const lineCogs = Math.max(0, Number(item.fifoCogs) - itemReturnedCogs);

    const existing = productMap.get(pid);
    if (existing) {
      existing.unitsSold += item.quantity;
      existing.grossSales += lineRevenue;
      existing.fifoCogs += lineCogs;
      existing.attributedRefund += itemRefund;
    } else {
      productMap.set(pid, {
        productId: pid,
        productName: product.name,
        categoryName: product.category.name,
        unitsSold: item.quantity,
        grossSales: lineRevenue,
        attributedRefund: itemRefund,
        fifoCogs: lineCogs,
      });
    }
  }

  const allRows: ProductReportRow[] = Array.from(productMap.values()).map((p) => {
    const netRevenue = p.grossSales - p.attributedRefund;
    const grossMargin = netRevenue - p.fifoCogs;
    const grossMarginPercent = netRevenue > 0 ? (grossMargin / netRevenue) * 100 : 0;

    return {
      ...p,
      netRevenue,
      grossMargin,
      grossMarginPercent,
    };
  });

  allRows.sort((a, b) => b.grossSales - a.grossSales);

  const totalCount = allRows.length;
  const skip = (page - 1) * pageSize;
  const paginatedRows = allRows.slice(skip, skip + pageSize);
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return {
    rows: paginatedRows,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

/* ============================================================================
 * PHASE 13 STEP 5: RETURNS & REFUNDS REPORT SERVICE
 * ============================================================================ */

export interface ReturnsReportFilterOptions {
  dateRange?: ReportDateRange;
  status?: ReturnStatus | 'ALL';
  refundStatus?: RefundStatus | 'ALL';
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ReturnsReportSummary {
  totalReturnRequests: number;
  totalUnitsRequested: number;
  totalUnitsReceived: number;
  totalUnitsRestocked: number;
  totalUnitsDamaged: number;
  totalRefundAmount: number;
  totalExchanges: number;
  statusCounts: Record<ReturnStatus, number>;
}

export interface ReturnRequestReportRow {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  createdAt: Date;
  status: ReturnStatus;
  resolutionType: string | null;
  reason: string;
  isMerchantError: boolean;
  quantityRequested: number;
  quantityReceived: number;
  quantityRestocked: number;
  quantityDamaged: number;
  totalRefundAmount: number;
}

export interface RefundReportRow {
  id: string;
  refundNumber: string;
  orderId: string;
  orderNumber: string;
  returnNumber: string | null;
  createdAt: Date;
  amount: number;
  shippingRefund: number;
  status: RefundStatus;
  method: string;
  manualResolutionType: string | null;
}

export interface ReturnRequestsPaginatedResult {
  rows: ReturnRequestReportRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface RefundsPaginatedResult {
  rows: RefundReportRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Returns overall summary KPI metrics for Returns & Refunds Report.
 */
export async function getReturnsReportSummary(
  options?: ReturnsReportFilterOptions
): Promise<ReturnsReportSummary> {
  const dateFilter = buildDateFilter(options?.dateRange);

  const [returnGroups, returnItems, exchangeCount, refundAggregate] = await Promise.all([
    prisma.returnRequest.groupBy({
      by: ['status'],
      where: {
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      _count: { id: true },
    }),
    prisma.returnItem.aggregate({
      where: {
        returnRequest: {
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      },
      _sum: {
        quantityRequested: true,
        quantityReceived: true,
        quantityRestocked: true,
        quantityDamaged: true,
      },
    }),
    prisma.exchangeItem.count({
      where: {
        returnRequest: {
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      },
    }),
    prisma.refund.aggregate({
      where: {
        status: { in: [RefundStatus.COMPLETED, RefundStatus.MANUALLY_RESOLVED] },
        order: {
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      },
      _sum: { amount: true },
    }),
  ]);

  const statusCounts: Record<ReturnStatus, number> = {
    REQUESTED: 0,
    ACCEPTED: 0,
    APPROVED: 0,
    REJECTED: 0,
    RECEIVED: 0,
    INSPECTED: 0,
    RESOLVED: 0,
  };

  let totalReturnRequests = 0;
  for (const group of returnGroups) {
    statusCounts[group.status] = group._count.id;
    totalReturnRequests += group._count.id;
  }

  return {
    totalReturnRequests,
    totalUnitsRequested: returnItems._sum.quantityRequested ?? 0,
    totalUnitsReceived: returnItems._sum.quantityReceived ?? 0,
    totalUnitsRestocked: returnItems._sum.quantityRestocked ?? 0,
    totalUnitsDamaged: returnItems._sum.quantityDamaged ?? 0,
    totalRefundAmount: Number(refundAggregate._sum.amount ?? 0),
    totalExchanges: exchangeCount,
    statusCounts,
  };
}

/**
 * Returns paginated ReturnRequest rows for /admin/reports/returns.
 */
export async function getReturnRequestRows(
  options: ReturnsReportFilterOptions
): Promise<ReturnRequestsPaginatedResult> {
  const dateFilter = buildDateFilter(options.dateRange);
  const page = options.page && options.page > 0 ? options.page : 1;
  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 25;
  const skip = (page - 1) * pageSize;

  const whereClause: any = {
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };

  if (options.status && options.status !== 'ALL') {
    whereClause.status = options.status;
  }

  if (options.search && options.search.trim()) {
    const q = options.search.trim();
    whereClause.OR = [
      { returnNumber: { contains: q, mode: 'insensitive' } },
      { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
      { customerMobile: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [totalCount, requests] = await Promise.all([
    prisma.returnRequest.count({ where: whereClause }),
    prisma.returnRequest.findMany({
      where: whereClause,
      include: {
        order: { select: { orderNumber: true, customerNameSnapshot: true } },
        items: {
          select: {
            quantityRequested: true,
            quantityReceived: true,
            quantityRestocked: true,
            quantityDamaged: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
  ]);

  const rows: ReturnRequestReportRow[] = requests.map((req) => {
    let quantityRequested = 0;
    let quantityReceived = 0;
    let quantityRestocked = 0;
    let quantityDamaged = 0;

    for (const item of req.items) {
      quantityRequested += item.quantityRequested;
      quantityReceived += item.quantityReceived;
      quantityRestocked += item.quantityRestocked;
      quantityDamaged += item.quantityDamaged;
    }

    return {
      id: req.id,
      returnNumber: req.returnNumber,
      orderId: req.orderId,
      orderNumber: req.order.orderNumber,
      customerName: req.order.customerNameSnapshot,
      createdAt: req.createdAt,
      status: req.status,
      resolutionType: req.resolutionType,
      reason: req.reason,
      isMerchantError: req.isMerchantError,
      quantityRequested,
      quantityReceived,
      quantityRestocked,
      quantityDamaged,
      totalRefundAmount: Number(req.totalRefundAmount),
    };
  });

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return {
    rows,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Returns paginated Refund ledger rows for /admin/reports/returns.
 */
export async function getRefundReportRows(
  options: ReturnsReportFilterOptions
): Promise<RefundsPaginatedResult> {
  const dateFilter = buildDateFilter(options.dateRange);
  const page = options.page && options.page > 0 ? options.page : 1;
  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 25;
  const skip = (page - 1) * pageSize;

  const whereClause: any = {
    order: {
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
  };

  if (options.refundStatus && options.refundStatus !== 'ALL') {
    whereClause.status = options.refundStatus;
  }

  if (options.search && options.search.trim()) {
    const q = options.search.trim();
    whereClause.OR = [
      { refundNumber: { contains: q, mode: 'insensitive' } },
      { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
      { returnRequest: { returnNumber: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const [totalCount, refunds] = await Promise.all([
    prisma.refund.count({ where: whereClause }),
    prisma.refund.findMany({
      where: whereClause,
      include: {
        order: { select: { orderNumber: true } },
        returnRequest: { select: { returnNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
  ]);

  const rows: RefundReportRow[] = refunds.map((ref) => ({
    id: ref.id,
    refundNumber: ref.refundNumber,
    orderId: ref.orderId,
    orderNumber: ref.order.orderNumber,
    returnNumber: ref.returnRequest?.returnNumber ?? null,
    createdAt: ref.createdAt,
    amount: Number(ref.amount),
    shippingRefund: Number(ref.shippingRefund),
    status: ref.status,
    method: ref.method,
    manualResolutionType: ref.manualResolutionType,
  }));

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return {
    rows,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}


