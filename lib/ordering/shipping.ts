import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export const DEFAULT_GLOBAL_SHIPPING_CAP = new Prisma.Decimal('200.00');

/**
 * Returns the authoritative server-side global shipping cap.
 * Reads from process.env.GLOBAL_SHIPPING_CAP if valid, otherwise falls back to DEFAULT_GLOBAL_SHIPPING_CAP.
 */
export function getGlobalShippingCap(): Prisma.Decimal {
  const envCap = process.env.GLOBAL_SHIPPING_CAP;
  if (envCap && !isNaN(Number(envCap)) && Number(envCap) >= 0) {
    return new Prisma.Decimal(envCap);
  }
  return DEFAULT_GLOBAL_SHIPPING_CAP;
}

/**
 * Returns the authoritative global shipping cap from StoreSettings.
 * If no StoreSettings record exists, falls back to getGlobalShippingCap() (default 200.00).
 */
export async function getStoreGlobalShippingCap(
  tx?: Prisma.TransactionClient
): Promise<Prisma.Decimal> {
  try {
    const client = tx || prisma;
    const settings = await client.storeSettings.findFirst({
      select: { globalShippingCap: true },
    });
    if (settings?.globalShippingCap != null) {
      return new Prisma.Decimal(settings.globalShippingCap);
    }
  } catch {
    // Graceful fallback to default/env cap
  }
  return getGlobalShippingCap();
}

/**
 * Calculates authoritative shipping fee for WhatsApp orders:
 * Raw Shipping = SUM(Product.shippingCharge * quantity)
 * Final Shipping = MIN(Raw Shipping, globalShippingCap)
 */
export async function calculateWhatsAppOrderShipping(
  items: Array<{
    shippingCharge?: number | Prisma.Decimal | null;
    quantity: number;
  }>,
  tx?: Prisma.TransactionClient
): Promise<Prisma.Decimal> {
  let rawShippingNum = 0;

  for (const item of items) {
    const chargeNum = Number(item.shippingCharge ?? 0);
    if (chargeNum < 0) {
      throw new Error(`INVALID_SHIPPING_CHARGE: Shipping charge cannot be negative (${chargeNum})`);
    }
    rawShippingNum += chargeNum * item.quantity;
  }

  const rawShippingDecimal = new Prisma.Decimal(rawShippingNum);
  const capDecimal = await getStoreGlobalShippingCap(tx);

  if (rawShippingDecimal.greaterThan(capDecimal)) {
    return capDecimal;
  }

  return rawShippingDecimal;
}

/**
 * Calculates authoritative order shipping fee according to locked SIFR shipping rule:
 * Raw Shipping = SUM(ProductVariant.shippingCost * quantity)
 * Final Shipping = MIN(Raw Shipping, GLOBAL_SHIPPING_CAP)
 */
export function calculateOrderShipping(
  items: Array<{
    shippingCost?: number | Prisma.Decimal | null;
    quantity: number;
  }>
): Prisma.Decimal {
  let rawShippingNum = 0;

  for (const item of items) {
    const costNum = Number(item.shippingCost ?? 0);
    if (costNum < 0) {
      throw new Error(`INVALID_SHIPPING_COST: Shipping cost cannot be negative (${costNum})`);
    }
    rawShippingNum += costNum * item.quantity;
  }

  const rawShippingDecimal = new Prisma.Decimal(rawShippingNum);
  const capDecimal = getGlobalShippingCap();

  if (rawShippingDecimal.greaterThan(capDecimal)) {
    return capDecimal;
  }

  return rawShippingDecimal;
}
