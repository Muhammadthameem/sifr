/**
 * Shared Inventory Availability Rules & Display Utility for SIFR Storefront.
 *
 * Source of truth: AVAILABLE STOCK = Physical Stock - Reserved Stock
 *
 * Display Rules:
 * - Available stock <= 0 -> "OUT OF STOCK"
 * - Available stock = 1  -> "1 LEFT"
 * - Available stock = 2  -> "2 LEFT"
 * - Available stock = 3  -> "3 LEFT"
 * - Available stock = 4  -> "4 LEFT"
 * - Available stock = 5  -> "5 LEFT"
 * - Available stock >= 6 -> "IN STOCK"
 */

export type StockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

export interface AvailabilityResult {
  availableStock: number;
  status: StockStatus;
  badgeText: string;
  isAvailable: boolean;
  maxPurchasable: number;
}

/**
 * Calculates Available Stock strictly adhering to:
 * Available Stock = Physical Stock - Reserved Stock
 */
export function calculateAvailableStock(
  physicalStock: number | null | undefined,
  reservedStock: number | null | undefined
): number {
  const physical = Math.max(0, Number(physicalStock) || 0);
  const reserved = Math.max(0, Number(reservedStock) || 0);
  return Math.max(0, physical - reserved);
}

/**
 * Maps available stock number to the exact SIFR display rules.
 */
export function getAvailabilityDisplay(availableStock: number): AvailabilityResult {
  const stock = Math.max(0, Math.floor(Number(availableStock) || 0));

  if (stock <= 0) {
    return {
      availableStock: 0,
      status: 'OUT_OF_STOCK',
      badgeText: 'OUT OF STOCK',
      isAvailable: false,
      maxPurchasable: 0,
    };
  }

  if (stock >= 1 && stock <= 5) {
    return {
      availableStock: stock,
      status: 'LOW_STOCK',
      badgeText: `${stock} LEFT`,
      isAvailable: true,
      maxPurchasable: stock,
    };
  }

  return {
    availableStock: stock,
    status: 'IN_STOCK',
    badgeText: 'IN STOCK',
    isAvailable: true,
    maxPurchasable: stock,
  };
}

/**
 * Helper to compute availability from a variant containing inventoryItem or precomputed availableStock
 */
export function getVariantAvailability(variant: {
  inventoryItem?: { physicalStock?: number | null; reservedStock?: number | null } | null;
  availableStock?: number;
}): AvailabilityResult {
  if (typeof variant.availableStock === 'number') {
    return getAvailabilityDisplay(variant.availableStock);
  }
  const stock = calculateAvailableStock(
    variant.inventoryItem?.physicalStock,
    variant.inventoryItem?.reservedStock
  );
  return getAvailabilityDisplay(stock);
}

/**
 * Helper to compute product-level availability across its variants
 */
export function getProductAvailability(product: {
  availableStock?: number;
  variants?: Array<{
    availableStock?: number;
    inventoryItem?: { physicalStock?: number | null; reservedStock?: number | null } | null;
  }>;
}): AvailabilityResult {
  if (typeof product.availableStock === 'number') {
    return getAvailabilityDisplay(product.availableStock);
  }

  if (!product.variants || product.variants.length === 0) {
    return getAvailabilityDisplay(0);
  }

  const totalStock = product.variants.reduce((sum, v) => {
    if (typeof v.availableStock === 'number') {
      return sum + v.availableStock;
    }
    return sum + calculateAvailableStock(v.inventoryItem?.physicalStock, v.inventoryItem?.reservedStock);
  }, 0);

  return getAvailabilityDisplay(totalStock);
}
