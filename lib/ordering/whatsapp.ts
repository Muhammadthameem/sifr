import { Prisma } from '@prisma/client';

export interface WhatsAppOrderItemSnapshot {
  productNameSnapshot: string;
  variantTitleSnapshot?: string | null;
  skuSnapshot: string;
  quantity: number;
  unitPrice: Prisma.Decimal | number | string;
  lineTotal: Prisma.Decimal | number | string;
  productSlug?: string | null;
  productUrl?: string | null;
}

export interface WhatsAppOrderSnapshot {
  orderNumber: string;
  createdAt?: Date | string | null;
  customerNameSnapshot: string;
  customerMobileSnapshot: string;
  customerEmailSnapshot?: string | null;
  shippingAddressSnapshot: string | null;
  subtotal: Prisma.Decimal | number | string;
  shippingFee: Prisma.Decimal | number | string;
  discountTotal?: Prisma.Decimal | number | string | null;
  couponCodeSnapshot?: string | null;
  grandTotal: Prisma.Decimal | number | string;
  paymentStatus?: string | null;
  items: WhatsAppOrderItemSnapshot[];
}

/**
 * Gets the canonical storefront base URL for product links.
 * Always resolves to a public production/canonical URL (never localhost).
 */
export function getSiteBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envUrl && !envUrl.includes('localhost')) {
    return envUrl.replace(/\/+$/, '');
  }
  return 'https://sifr.in';
}

/**
 * Builds canonical product URL for an item.
 */
export function getProductUrl(slug: string): string {
  const base = getSiteBaseUrl();
  return `${base}/products/${slug}`;
}

/**
 * Retrieves the configured business WhatsApp phone number (numeric digits only).
 */
export function getBusinessWhatsAppNumber(): string {
  const phone =
    process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_PHONE ||
    process.env.WHATSAPP_BUSINESS_PHONE ||
    '919876543210';
  return phone.replace(/[^0-9]/g, '');
}

/**
 * Authoritatively retrieves the business WhatsApp number from persisted StoreSettings,
 * falling back to getBusinessWhatsAppNumber() if none exists or query fails.
 */
export async function getBusinessWhatsAppNumberAsync(): Promise<string> {
  try {
    const { prisma } = await import('@/lib/db/prisma');
    const settings = await prisma.storeSettings.findFirst({
      select: { whatsAppNumber: true },
    });
    if (settings?.whatsAppNumber) {
      const clean = settings.whatsAppNumber.replace(/[^0-9]/g, '');
      if (clean) return clean;
    }
  } catch {
    // Graceful fallback to env/default
  }
  return getBusinessWhatsAppNumber();
}

/**
 * Formats date and time in Indian Standard Time format.
 */
function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Parses address components from stored shippingAddressSnapshot if structured,
 * or returns raw address lines.
 */
function parseAddressSnapshot(raw: string | null): {
  address: string;
  city: string;
  state: string;
  pincode: string;
} {
  if (!raw) {
    return { address: 'N/A', city: 'N/A', state: 'N/A', pincode: 'N/A' };
  }

  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  let address = '';
  let city = '';
  let state = '';
  let pincode = '';

  for (const line of lines) {
    if (/^City:\s*(.+)$/i.test(line)) {
      city = line.replace(/^City:\s*/i, '').trim();
    } else if (/^State:\s*(.+)$/i.test(line)) {
      state = line.replace(/^State:\s*/i, '').trim();
    } else if (/^Pincode:\s*(.+)$/i.test(line)) {
      pincode = line.replace(/^Pincode:\s*/i, '').trim();
    } else {
      address = address ? `${address}, ${line}` : line;
    }
  }

  // Fallback if address was stored as a single comma-delimited string
  if (!city && !state && !pincode) {
    address = raw;
  }

  return {
    address: address || raw,
    city: city || 'N/A',
    state: state || 'N/A',
    pincode: pincode || 'N/A',
  };
}

function formatCurrency(amount: Prisma.Decimal | number | string): string {
  const num = typeof amount === 'number' ? amount : Number(amount);
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Builds the pure text WhatsApp order message from persisted Order & OrderItem snapshots.
 */
export function buildWhatsAppOrderMessage(
  order: WhatsAppOrderSnapshot,
  storeName?: string
): string {
  const addr = parseAddressSnapshot(order.shippingAddressSnapshot);
  const brandName = storeName || 'SIFR';

  const lines: string[] = [
    `*${brandName} — Order Request*`,
    `Order Number: ${order.orderNumber}`,
  ];

  if (order.createdAt) {
    const formattedDate = formatDateTime(order.createdAt);
    if (formattedDate) {
      lines.push(`Date: ${formattedDate}`);
    }
  }

  lines.push(
    '',
    '*Customer Details*',
    `Name: ${order.customerNameSnapshot}`,
    `Phone: ${order.customerMobileSnapshot}`,
    `Address: ${addr.address}`
  );

  if (addr.city !== 'N/A') lines.push(`City: ${addr.city}`);
  if (addr.state !== 'N/A') lines.push(`State: ${addr.state}`);
  if (addr.pincode !== 'N/A') lines.push(`Pincode: ${addr.pincode}`);
  if (order.customerEmailSnapshot) lines.push(`Email: ${order.customerEmailSnapshot}`);

  lines.push('', '*Ordered Items*');

  order.items.forEach((item, index) => {
    const variantInfo = item.variantTitleSnapshot ? ` (${item.variantTitleSnapshot})` : '';
    lines.push(
      `${index + 1}. ${item.productNameSnapshot}${variantInfo}`,
      `   SKU: ${item.skuSnapshot}`,
      `   Qty: ${item.quantity} × ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.lineTotal)}`
    );
    const link = item.productUrl || (item.productSlug ? getProductUrl(item.productSlug) : null);
    if (link) {
      lines.push(`   Link: ${link}`);
    }
  });

  lines.push('', '*Order Summary*');
  lines.push(`Subtotal: ${formatCurrency(order.subtotal)}`);

  if (order.discountTotal && Number(order.discountTotal) > 0) {
    const couponLabel = order.couponCodeSnapshot ? ` (${order.couponCodeSnapshot})` : '';
    lines.push(`Discount${couponLabel}: -${formatCurrency(order.discountTotal)}`);
  }

  lines.push(`Shipping: ${formatCurrency(order.shippingFee)}`);
  lines.push(`Grand Total: ${formatCurrency(order.grandTotal)}`);
  lines.push(`Payment Status: ${order.paymentStatus || 'DUE'}`);
  lines.push('', 'Please confirm my order. Thank you!');

  return lines.join('\n');
}

/**
 * Encodes the drafted WhatsApp message into a wa.me URL for the business phone number.
 */
export function buildWhatsAppUrl(businessPhone: string, message: string): string {
  const cleanPhone = businessPhone.replace(/[^0-9]/g, '');
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

/**
 * Normalizes customer phone numbers to a valid wa.me recipient format (e.g. 919876543210).
 */
export function normalizePhoneForWhatsApp(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  return digits;
}

/**
 * Builds a direct wa.me link to message the customer with a prefilled message.
 */
export function buildCustomerWhatsAppUrl(customerPhone: string, message: string): string {
  const cleanPhone = normalizePhoneForWhatsApp(customerPhone);
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

export interface ConfirmedOrderWhatsAppInput {
  customerNameSnapshot: string;
  orderNumber: string;
  grandTotal: number | string;
  paymentStatus: string;
}

/**
 * Builds the customer communication message for CONFIRMED orders.
 * Admin manually attaches the generated PDF bill before sending.
 */
export function buildConfirmedOrderWhatsAppMessage(order: ConfirmedOrderWhatsAppInput): string {
  const numTotal =
    typeof order.grandTotal === 'string'
      ? parseFloat(order.grandTotal) || 0
      : order.grandTotal;

  const formattedTotal = numTotal.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });

  const paymentText = order.paymentStatus === 'PAID' ? 'PAID' : 'DUE';

  return [
    `Hello ${order.customerNameSnapshot},`,
    '',
    'Thank you for your order with SIFR.',
    '',
    `Order: ${order.orderNumber}`,
    `Total: ₹${formattedTotal}`,
    `Payment: ${paymentText}`,
    '',
    'Your order has been confirmed and is being prepared.',
    '',
    'Thank you for shopping with SIFR.',
  ].join('\n');
}

export interface DispatchedOrderWhatsAppInput {
  customerNameSnapshot: string;
  orderNumber: string;
  shipment?: {
    courierName: string;
    trackingId: string;
    trackingUrl?: string | null;
  } | null;
}

/**
 * Builds the customer dispatch update message for DISPATCHED orders.
 * Handles missing optional tracking URL gracefully.
 */
export function buildDispatchedOrderWhatsAppMessage(order: DispatchedOrderWhatsAppInput): string {
  const courier = order.shipment?.courierName || 'Delivery Partner';
  const trackingId = order.shipment?.trackingId || '—';
  const trackingUrl = order.shipment?.trackingUrl?.trim();

  const lines = [
    `Hello ${order.customerNameSnapshot},`,
    '',
    `Your SIFR order ${order.orderNumber} has been dispatched. 📦`,
    '',
    `Delivery Partner: ${courier}`,
    `Tracking ID: ${trackingId}`,
  ];

  if (trackingUrl) {
    lines.push(`Tracking Link: ${trackingUrl}`);
  }

  lines.push('', 'Thank you for shopping with SIFR.');

  return lines.join('\n');
}

