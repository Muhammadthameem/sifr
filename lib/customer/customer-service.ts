import { prisma } from '@/lib/db/prisma';
import { OrderStatus, Prisma } from '@prisma/client';
import { normalizeIndiaMobile } from '@/lib/validation/mobile';

/**
 * Qualifying SIFR Sales Order Statuses.
 * Strictly CONFIRMED, DISPATCHED, and DELIVERED.
 * CONTACTED and CANCELLED are NOT sales.
 */
export const QUALIFYING_SALES_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.DISPATCHED,
  OrderStatus.DELIVERED,
];

export interface ParsedAddress {
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

/**
 * Parses multi-line formatted address or returns raw address with fallback nulls.
 * Standard SIFR address snapshot format:
 * "{address}\nCity: {city}\nState: {state}\nPincode: {pincode}"
 */
export function parseCustomerAddress(rawAddress?: string | null): ParsedAddress {
  if (!rawAddress || !rawAddress.trim()) {
    return {
      addressLine: null,
      city: null,
      state: null,
      pincode: null,
    };
  }

  const cityMatch = rawAddress.match(/City:\s*([^\n\r]+)/i);
  const stateMatch = rawAddress.match(/State:\s*([^\n\r]+)/i);
  const pincodeMatch = rawAddress.match(/Pincode:\s*([^\n\r]+)/i);

  let addressLine = rawAddress;
  const firstMarker = rawAddress.search(/\n(City|State|Pincode):/i);
  if (firstMarker !== -1) {
    addressLine = rawAddress.substring(0, firstMarker).trim();
  }

  return {
    addressLine: addressLine.trim() || null,
    city: cityMatch ? cityMatch[1].trim() : null,
    state: stateMatch ? stateMatch[1].trim() : null,
    pincode: pincodeMatch ? pincodeMatch[1].trim() : null,
  };
}

/**
 * Formats address components into the standard SIFR stored address string.
 */
export function formatCustomerAddress(components: {
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}): string | null {
  const line = (components.addressLine || '').trim();
  const city = (components.city || '').trim();
  const state = (components.state || '').trim();
  const pincode = (components.pincode || '').trim();

  if (!line && !city && !state && !pincode) {
    return null;
  }

  const parts: string[] = [];
  if (line) parts.push(line);
  if (city) parts.push(`City: ${city}`);
  if (state) parts.push(`State: ${state}`);
  if (pincode) parts.push(`Pincode: ${pincode}`);

  return parts.join('\n');
}

export type CustomerSortBy =
  | 'newest'
  | 'oldest'
  | 'total_spend'
  | 'most_orders'
  | 'last_order';

export interface GetCustomersParams {
  search?: string;
  sortBy?: CustomerSortBy;
  page?: number;
  limit?: number;
}

export interface AdminCustomerRowItem {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  rawAddress: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  ordersCount: number; // Qualifying sales count (CONFIRMED, DISPATCHED, DELIVERED)
  allOrdersCount: number; // Total order requests placed
  totalPurchaseValue: number; // Sum of qualifying sales
  lastOrderDate: string | null;
  createdAt: string;
}

export interface GetCustomersResult {
  customers: AdminCustomerRowItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

/**
 * Pure database-backed query service for Admin Customers list.
 * Supports server-side search, sorting, and pagination.
 */
export async function queryAdminCustomers(
  params?: GetCustomersParams
): Promise<GetCustomersResult> {
  const page = Math.max(1, params?.page || 1);
  const limit = Math.max(1, Math.min(100, params?.limit || 15));
  const sortBy = params?.sortBy || 'newest';

  // Build where clause for search
  const where: Prisma.CustomerWhereInput = {};

  if (params?.search && params.search.trim()) {
    const rawSearch = params.search.trim();
    const searchConditions: Prisma.CustomerWhereInput[] = [
      { name: { contains: rawSearch, mode: 'insensitive' } },
      { email: { contains: rawSearch, mode: 'insensitive' } },
      { mobile: { contains: rawSearch, mode: 'insensitive' } },
    ];

    // Try normalized mobile search if digits exist
    try {
      const normalizedSearch = normalizeIndiaMobile(rawSearch);
      searchConditions.push({ mobile: { equals: normalizedSearch } });
    } catch {
      // Non-standard phone search string - already covered by contains
    }

    where.OR = searchConditions;
  }

  // Pre-calculate aggregate spend & counts for all matching customers to enable accurate sorting
  const total = await prisma.customer.count({ where });
  const totalPages = Math.ceil(total / limit) || 1;

  if (sortBy === 'total_spend' || sortBy === 'most_orders' || sortBy === 'last_order') {
    // Fetch all customer IDs matching where filter
    const matchingCustomers = await prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        mobile: true,
        email: true,
        address: true,
        createdAt: true,
        orders: {
          select: {
            status: true,
            grandTotal: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const enriched = matchingCustomers.map((c) => {
      const parsedAddr = parseCustomerAddress(c.address);
      const qualifyingOrders = c.orders.filter((o) =>
        QUALIFYING_SALES_STATUSES.includes(o.status)
      );
      const ordersCount = qualifyingOrders.length;
      const allOrdersCount = c.orders.length;
      const totalPurchaseValue = qualifyingOrders.reduce(
        (sum, o) => sum + Number(o.grandTotal),
        0
      );
      const lastOrderDate = c.orders.length > 0 ? c.orders[0].createdAt.toISOString() : null;

      return {
        id: c.id,
        name: c.name,
        mobile: c.mobile,
        email: c.email,
        rawAddress: c.address,
        addressLine: parsedAddr.addressLine,
        city: parsedAddr.city,
        state: parsedAddr.state,
        pincode: parsedAddr.pincode,
        ordersCount,
        allOrdersCount,
        totalPurchaseValue,
        lastOrderDate,
        createdAt: c.createdAt.toISOString(),
        _lastOrderTimestamp: c.orders.length > 0 ? c.orders[0].createdAt.getTime() : 0,
      };
    });

    // In-memory sort by aggregate
    if (sortBy === 'total_spend') {
      enriched.sort((a, b) => b.totalPurchaseValue - a.totalPurchaseValue || b.createdAt.localeCompare(a.createdAt));
    } else if (sortBy === 'most_orders') {
      enriched.sort((a, b) => b.ordersCount - a.ordersCount || b.createdAt.localeCompare(a.createdAt));
    } else if (sortBy === 'last_order') {
      enriched.sort((a, b) => b._lastOrderTimestamp - a._lastOrderTimestamp || b.createdAt.localeCompare(a.createdAt));
    }

    const startIndex = (page - 1) * limit;
    const paginated = enriched.slice(startIndex, startIndex + limit).map(({ _lastOrderTimestamp, ...rest }) => rest);

    return {
      customers: paginated,
      total,
      page,
      totalPages,
      limit,
    };
  }

  // Standard database-side ordering for newest / oldest
  const orderBy: Prisma.CustomerOrderByWithRelationInput =
    sortBy === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

  const dbCustomers = await prisma.customer.findMany({
    where,
    orderBy,
    skip: (page - 1) * limit,
    take: limit,
    include: {
      orders: {
        select: {
          status: true,
          grandTotal: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  const customers: AdminCustomerRowItem[] = dbCustomers.map((c) => {
    const parsedAddr = parseCustomerAddress(c.address);
    const qualifyingOrders = c.orders.filter((o) =>
      QUALIFYING_SALES_STATUSES.includes(o.status)
    );
    const ordersCount = qualifyingOrders.length;
    const allOrdersCount = c.orders.length;
    const totalPurchaseValue = qualifyingOrders.reduce(
      (sum, o) => sum + Number(o.grandTotal),
      0
    );
    const lastOrderDate = c.orders.length > 0 ? c.orders[0].createdAt.toISOString() : null;

    return {
      id: c.id,
      name: c.name,
      mobile: c.mobile,
      email: c.email,
      rawAddress: c.address,
      addressLine: parsedAddr.addressLine,
      city: parsedAddr.city,
      state: parsedAddr.state,
      pincode: parsedAddr.pincode,
      ordersCount,
      allOrdersCount,
      totalPurchaseValue,
      lastOrderDate,
      createdAt: c.createdAt.toISOString(),
    };
  });

  return {
    customers,
    total,
    page,
    totalPages,
    limit,
  };
}

export interface AdminCustomerDetailOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  grandTotal: number;
  paymentStatus: string;
  salesChannel: string;
  isSale: boolean;
}

export interface AdminCustomerDetail {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  rawAddress: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  createdAt: string;
  updatedAt: string;
  // Purchase Summary
  totalSalesCount: number; // Strictly CONFIRMED, DISPATCHED, DELIVERED
  totalOrdersCount: number; // All requests
  totalPurchaseValue: number; // Sum of qualifying sales
  firstOrderDate: string | null;
  lastOrderDate: string | null;
  // Order History
  orders: AdminCustomerDetailOrder[];
}

/**
 * Fetches full customer details and order history for `/admin/customers/[id]`.
 */
export async function getAdminCustomerDetails(
  customerId: string
): Promise<AdminCustomerDetail | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      orders: {
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          status: true,
          grandTotal: true,
          paymentStatus: true,
          salesChannel: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!customer) {
    return null;
  }

  const parsedAddr = parseCustomerAddress(customer.address);

  const qualifyingOrders = customer.orders.filter((o) =>
    QUALIFYING_SALES_STATUSES.includes(o.status)
  );

  const totalSalesCount = qualifyingOrders.length;
  const totalOrdersCount = customer.orders.length;
  const totalPurchaseValue = qualifyingOrders.reduce(
    (sum, o) => sum + Number(o.grandTotal),
    0
  );

  const chronologicalOrders = [...customer.orders].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const firstOrderDate =
    chronologicalOrders.length > 0 ? chronologicalOrders[0].createdAt.toISOString() : null;
  const lastOrderDate =
    chronologicalOrders.length > 0
      ? chronologicalOrders[chronologicalOrders.length - 1].createdAt.toISOString()
      : null;

  const orders: AdminCustomerDetailOrder[] = customer.orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt.toISOString(),
    status: o.status,
    grandTotal: Number(o.grandTotal),
    paymentStatus: o.paymentStatus,
    salesChannel: o.salesChannel,
    isSale: QUALIFYING_SALES_STATUSES.includes(o.status),
  }));

  return {
    id: customer.id,
    name: customer.name,
    mobile: customer.mobile,
    email: customer.email,
    rawAddress: customer.address,
    addressLine: parsedAddr.addressLine,
    city: parsedAddr.city,
    state: parsedAddr.state,
    pincode: parsedAddr.pincode,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
    totalSalesCount,
    totalOrdersCount,
    totalPurchaseValue,
    firstOrderDate,
    lastOrderDate,
    orders,
  };
}

export interface UpdateCustomerInput {
  customerId: string;
  name: string;
  email?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

/**
 * Updates customer master profile safely.
 * Phone is strictly omitted to preserve primary customer identity and uniqueness.
 * Historical order snapshots remain completely untouched.
 */
export async function updateCustomerProfile(input: UpdateCustomerInput) {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
  });

  if (!customer) {
    throw new Error('Customer not found.');
  }

  const trimmedName = input.name.trim();
  if (!trimmedName || trimmedName.length < 2) {
    throw new Error('Customer name must be at least 2 characters.');
  }

  const formattedAddress = formatCustomerAddress({
    addressLine: input.addressLine,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
  });

  const updated = await prisma.customer.update({
    where: { id: input.customerId },
    data: {
      name: trimmedName,
      email: input.email ? input.email.trim() : null,
      address: formattedAddress,
    },
  });

  return updated;
}
