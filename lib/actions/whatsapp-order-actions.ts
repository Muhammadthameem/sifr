'use server';

import { prisma } from '@/lib/db/prisma';
import { calculateWhatsAppOrderShipping } from '@/lib/ordering/shipping';
import { previewCouponEligibility, CouponItemInput, normalizeCouponCode } from '@/lib/coupons/coupon-engine';
import { fetchCartAction } from '@/lib/actions/cart-actions';
import { Prisma } from '@prisma/client';

export interface WhatsAppOrderItemData {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantTitle: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  mrp: number;
  lineTotal: number;
  shippingCharge: number;
  availableStock: number;
  isAvailable: boolean;
  isOutOfStock: boolean;
}

export interface WhatsAppOrderDetailsResult {
  success: boolean;
  error?: string;
  mode: 'product' | 'cart';
  items: WhatsAppOrderItemData[];
  subtotal: number;
  shippingFee: number;
  discountTotal: number;
  appliedCouponCode: string | null;
  appliedCoupon?: {
    code: string;
    isValid: boolean;
    discountTotal?: number;
    reason?: string;
  } | null;
  grandTotal: number;
  hasUnavailableItems: boolean;
}

/**
 * Loads authoritative product & variant details for Product Mode WhatsApp order.
 * Validates product is ACTIVE and variant belongs to product and isAvailable.
 * Calculates authoritative WhatsApp shipping fee and subtotal.
 */
export async function getWhatsAppProductOrderDetails({
  slug,
  variantId,
  quantity,
}: {
  slug: string;
  variantId: string;
  quantity: number;
}): Promise<WhatsAppOrderDetailsResult> {
  try {
    const safeQty = Math.max(1, Math.min(99, Math.floor(quantity || 1)));

    const product = await prisma.product.findFirst({
      where: {
        slug,
        status: 'ACTIVE',
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        variants: {
          where: { id: variantId, isAvailable: true },
          include: {
            inventoryItem: {
              select: { physicalStock: true, reservedStock: true },
            },
          },
        },
      },
    });

    if (!product || product.variants.length === 0) {
      return {
        success: false,
        error: 'The requested product or variant is currently not available.',
        mode: 'product',
        items: [],
        subtotal: 0,
        shippingFee: 0,
        discountTotal: 0,
        appliedCouponCode: null,
        grandTotal: 0,
        hasUnavailableItems: true,
      };
    }

    const variant = product.variants[0];
    const physicalStock = variant.inventoryItem?.physicalStock ?? 0;
    const reservedStock = variant.inventoryItem?.reservedStock ?? 0;
    const availableStock = Math.max(0, physicalStock - reservedStock);

    const unitPrice = Number(variant.sellingPrice);
    const mrp = Number(variant.mrp);
    const lineTotal = unitPrice * safeQty;
    const shippingChargeNum = Number(product.shippingCharge);

    const shippingDecimal = await calculateWhatsAppOrderShipping([
      { shippingCharge: product.shippingCharge, quantity: safeQty },
    ]);
    const shippingFee = Number(shippingDecimal);

    const imageUrl = product.images[0]?.url || null;

    const item: WhatsAppOrderItemData = {
      variantId: variant.id,
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      variantTitle: variant.title,
      sku: variant.sku,
      imageUrl,
      quantity: safeQty,
      unitPrice,
      mrp,
      lineTotal,
      shippingCharge: shippingChargeNum,
      availableStock,
      isAvailable: variant.isAvailable,
      isOutOfStock: availableStock < safeQty,
    };

    const subtotal = lineTotal;
    const discountTotal = 0;
    const grandTotal = Math.max(0, subtotal - discountTotal) + shippingFee;

    return {
      success: true,
      mode: 'product',
      items: [item],
      subtotal,
      shippingFee,
      discountTotal,
      appliedCouponCode: null,
      appliedCoupon: null,
      grandTotal,
      hasUnavailableItems: item.isOutOfStock || !item.isAvailable,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to load product details for WhatsApp order',
      mode: 'product',
      items: [],
      subtotal: 0,
      shippingFee: 0,
      discountTotal: 0,
      appliedCouponCode: null,
      grandTotal: 0,
      hasUnavailableItems: true,
    };
  }
}

/**
 * Loads authoritative cart items and computes WhatsApp-specific shipping and totals.
 */
export async function getWhatsAppCartOrderDetails(): Promise<WhatsAppOrderDetailsResult> {
  try {
    const cartData = await fetchCartAction();

    if (!cartData || cartData.items.length === 0) {
      return {
        success: true,
        mode: 'cart',
        items: [],
        subtotal: 0,
        shippingFee: 0,
        discountTotal: 0,
        appliedCouponCode: null,
        appliedCoupon: null,
        grandTotal: 0,
        hasUnavailableItems: false,
      };
    }

    // Query authoritative products for slug and shippingCharge
    const productIds = Array.from(new Set(cartData.items.map((i: any) => i.productId)));
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        slug: true,
        shippingCharge: true,
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const items: WhatsAppOrderItemData[] = cartData.items.map((item: any) => {
      const p = productMap.get(item.productId);
      const shippingChargeNum = Number(p?.shippingCharge ?? 0);

      return {
        variantId: item.variantId,
        productId: item.productId,
        productName: item.productName,
        productSlug: p?.slug || '',
        variantTitle: item.variantTitle,
        sku: item.sku,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        mrp: item.mrp,
        lineTotal: item.lineTotal,
        shippingCharge: shippingChargeNum,
        availableStock: item.availableStock,
        isAvailable: item.isAvailable,
        isOutOfStock: item.isOutOfStock,
      };
    });

    // Authoritative WhatsApp shipping: SUM(Product.shippingCharge * quantity) capped by StoreSettings.globalShippingCap
    const shippingItems = items.map((i) => ({
      shippingCharge: i.shippingCharge,
      quantity: i.quantity,
    }));
    const shippingDecimal = await calculateWhatsAppOrderShipping(shippingItems);
    const shippingFee = Number(shippingDecimal);

    const subtotal = cartData.subtotal;
    const discountTotal = cartData.discountTotal || 0;
    const grandTotal = Math.max(0, subtotal - discountTotal) + shippingFee;

    return {
      success: true,
      mode: 'cart',
      items,
      subtotal,
      shippingFee,
      discountTotal,
      appliedCouponCode: cartData.appliedCouponCode,
      appliedCoupon: cartData.appliedCoupon,
      grandTotal,
      hasUnavailableItems: cartData.hasUnavailableItems,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to load cart for WhatsApp order',
      mode: 'cart',
      items: [],
      subtotal: 0,
      shippingFee: 0,
      discountTotal: 0,
      appliedCouponCode: null,
      grandTotal: 0,
      hasUnavailableItems: true,
    };
  }
}

/**
 * Calculates authoritative WhatsApp shipping fee for an arbitrary set of variants and quantities.
 */
export async function calculateWhatsAppShippingAction(
  items: Array<{ variantId: string; quantity: number }>
): Promise<{ success: boolean; shippingFee: number; error?: string }> {
  try {
    if (items.length === 0) {
      return { success: true, shippingFee: 0 };
    }

    const variantIds = items.map((i) => i.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: { select: { shippingCharge: true } },
      },
    });

    const varMap = new Map(variants.map((v) => [v.id, v]));

    const shippingItems = items.map((item) => {
      const v = varMap.get(item.variantId);
      return {
        shippingCharge: v?.product.shippingCharge ?? 0,
        quantity: item.quantity,
      };
    });

    const shippingDecimal = await calculateWhatsAppOrderShipping(shippingItems);
    return { success: true, shippingFee: Number(shippingDecimal) };
  } catch (error: any) {
    return { success: false, shippingFee: 0, error: error.message };
  }
}

/**
 * Preview/validates coupon eligibility for a list of items without recording usage.
 */
export async function previewWhatsAppCouponAction({
  couponCode,
  items,
  customerMobile,
}: {
  couponCode: string;
  items: Array<{ variantId: string; quantity: number }>;
  customerMobile?: string | null;
}): Promise<{
  success: boolean;
  valid: boolean;
  code?: string;
  discountTotal: number;
  reason?: string;
}> {
  try {
    if (!couponCode || couponCode.trim() === '') {
      return { success: false, valid: false, discountTotal: 0, reason: 'Coupon code cannot be empty' };
    }

    if (items.length === 0) {
      return { success: false, valid: false, discountTotal: 0, reason: 'Order has no items' };
    }

    const variantIds = items.map((i) => i.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: { select: { id: true, categoryId: true } },
      },
    });

    const varMap = new Map(variants.map((v) => [v.id, v]));

    const couponInputs: CouponItemInput[] = [];
    for (const item of items) {
      const v = varMap.get(item.variantId);
      if (!v) continue;
      couponInputs.push({
        variantId: v.id,
        productId: v.product.id,
        categoryId: v.product.categoryId,
        sellingPrice: v.sellingPrice,
        quantity: item.quantity,
      });
    }

    const preview = await previewCouponEligibility(
      normalizeCouponCode(couponCode),
      couponInputs,
      customerMobile
    );

    return {
      success: true,
      valid: preview.valid,
      code: preview.code,
      discountTotal: Number(preview.discountTotal),
      reason: preview.reason,
    };
  } catch (error: any) {
    return {
      success: false,
      valid: false,
      discountTotal: 0,
      reason: error.message || 'Failed to validate coupon',
    };
  }
}
