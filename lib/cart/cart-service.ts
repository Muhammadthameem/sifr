import { prisma } from '@/lib/db/prisma';
import { calculateOrderShipping } from '@/lib/ordering/shipping';
import { Prisma } from '@prisma/client';

const CART_TTL_DAYS = 30;

/**
 * Ensures a valid guest Cart header exists for the given sessionId token.
 * Extends 30-day sliding TTL on fetch/update.
 */
export async function getOrCreateCart(sessionId: string) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CART_TTL_DAYS * 24 * 60 * 60 * 1000);

  let cart = await prisma.cart.findUnique({
    where: { sessionId },
    include: {
      items: {
        include: {
          variant: {
            include: {
              product: {
                include: {
                  images: {
                    orderBy: { sortOrder: 'asc' },
                    take: 1,
                  },
                },
              },
              inventoryItem: true,
            },
          },
        },
      },
    },
  });

  if (!cart || cart.expiresAt < now) {
    if (cart) {
      // Clean up expired cart items
      await prisma.cart.delete({ where: { id: cart.id } }).catch(() => {});
    }
    cart = await prisma.cart.create({
      data: {
        sessionId,
        expiresAt,
      },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    images: {
                      orderBy: { sortOrder: 'asc' },
                      take: 1,
                    },
                  },
                },
                inventoryItem: true,
              },
            },
          },
        },
      },
    });
  } else {
    // Refresh sliding expiration
    await prisma.cart.update({
      where: { id: cart.id },
      data: { expiresAt },
    });
  }

  return cart;
}

import { previewCouponEligibility, normalizeCouponCode, CouponItemInput } from '@/lib/coupons/coupon-engine';

/**
 * Returns structured, server-authoritative Cart details including live catalog prices,
 * calculated subtotals, revalidated coupon discounts, and calculated shipping fee.
 * Strictly excludes costPrice.
 */
export async function getCartDetails(sessionId: string) {
  const cart = await getOrCreateCart(sessionId);

  let subtotalNum = 0;
  const couponItems: CouponItemInput[] = [];

  const items = cart.items.map((item) => {
    const variant = item.variant;
    const product = variant.product;
    const inv = variant.inventoryItem;
    const availableStock = Math.max(0, (inv?.physicalStock ?? 0) - (inv?.reservedStock ?? 0));

    const unitPriceNum = Number(variant.sellingPrice);
    const mrpNum = Number(variant.mrp);
    const lineTotalNum = unitPriceNum * item.quantity;
    subtotalNum += lineTotalNum;

    couponItems.push({
      variantId: variant.id,
      productId: product.id,
      categoryId: product.categoryId,
      sellingPrice: variant.sellingPrice,
      quantity: item.quantity,
    });

    const imageUrl = product.images[0]?.url || null;

    return {
      id: item.id,
      variantId: variant.id,
      productId: product.id,
      productName: product.name,
      variantTitle: variant.title,
      sku: variant.sku,
      imageUrl,
      quantity: item.quantity,
      unitPrice: unitPriceNum,
      mrp: mrpNum,
      lineTotal: lineTotalNum,
      shippingCost: Number(variant.shippingCost),
      isAvailable: variant.isAvailable && product.status === 'ACTIVE',
      availableStock,
      isOutOfStock: availableStock < item.quantity,
    };
  });

  const shippingFeeDecimal = calculateOrderShipping(
    items.map((i) => ({ shippingCost: i.shippingCost, quantity: i.quantity }))
  );
  const shippingFeeNum = Number(shippingFeeDecimal);

  let discountTotalNum = 0;
  let appliedCoupon: {
    code: string;
    isValid: boolean;
    reason?: string;
    discountTotal?: number;
  } | null = null;

  if (cart.appliedCouponCode && items.length > 0) {
    const preview = await previewCouponEligibility(cart.appliedCouponCode, couponItems);
    if (preview.valid) {
      discountTotalNum = Number(preview.discountTotal);
      appliedCoupon = {
        code: preview.code!,
        isValid: true,
        discountTotal: discountTotalNum,
      };
    } else {
      appliedCoupon = {
        code: cart.appliedCouponCode,
        isValid: false,
        reason: preview.reason,
      };
    }
  }

  const taxTotalNum = 0;
  const grandTotalNum = Math.max(0, subtotalNum - discountTotalNum) + shippingFeeNum + taxTotalNum;

  return {
    cartId: cart.id,
    sessionId: cart.sessionId,
    appliedCouponCode: cart.appliedCouponCode,
    appliedCoupon,
    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal: subtotalNum,
    discountTotal: discountTotalNum,
    shippingFee: shippingFeeNum,
    taxTotal: taxTotalNum,
    grandTotal: grandTotalNum,
    hasUnavailableItems: items.some((i) => !i.isAvailable || i.isOutOfStock),
  };
}

/**
 * Applies a coupon code to the user's cart session after preview validation.
 */
export async function applyCartCoupon(sessionId: string, code: string) {
  const canonicalCode = normalizeCouponCode(code);
  const cartDetails = await getCartDetails(sessionId);

  if (cartDetails.items.length === 0) {
    return { success: false, reason: 'Cannot apply coupon to an empty cart' };
  }

  const preview = await previewCouponEligibility(
    canonicalCode,
    cartDetails.items.map((i) => ({
      variantId: i.variantId,
      productId: i.productId,
      categoryId: i.productId, // Will be fetched via DB inside coupon engine
      sellingPrice: new Prisma.Decimal(i.unitPrice),
      quantity: i.quantity,
    }))
  );

  // We fetch actual items directly from DB to get categoryId accurately
  const cart = await getOrCreateCart(sessionId);
  const fullCouponItems: CouponItemInput[] = cart.items.map((i) => ({
    variantId: i.variant.id,
    productId: i.variant.product.id,
    categoryId: i.variant.product.categoryId,
    sellingPrice: i.variant.sellingPrice,
    quantity: i.quantity,
  }));

  const fullPreview = await previewCouponEligibility(canonicalCode, fullCouponItems);

  if (!fullPreview.valid) {
    return { success: false, reason: fullPreview.reason };
  }

  await prisma.cart.update({
    where: { id: cart.id },
    data: { appliedCouponCode: canonicalCode },
  });

  return {
    success: true,
    code: canonicalCode,
    discountTotal: Number(fullPreview.discountTotal),
  };
}

/**
 * Removes the applied coupon code from the user's cart session.
 */
export async function removeCartCoupon(sessionId: string) {
  const cart = await getOrCreateCart(sessionId);
  await prisma.cart.update({
    where: { id: cart.id },
    data: { appliedCouponCode: null },
  });
  return { success: true };
}

/**
 * Adds a variant to cart with explicit stock validation.
 * Returns EXCEEDS_AVAILABLE_STOCK if requested quantity exceeds available stock.
 */
export async function addItemToCart(sessionId: string, variantId: string, quantity: number) {
  if (quantity <= 0) {
    throw new Error('Quantity must be a positive integer');
  }

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true, inventoryItem: true },
  });

  if (!variant || !variant.isAvailable || variant.product.status !== 'ACTIVE') {
    return { success: false, code: 'VARIANT_UNAVAILABLE', message: 'Product variant is unavailable' };
  }

  const inv = variant.inventoryItem;
  const availableStock = Math.max(0, (inv?.physicalStock ?? 0) - (inv?.reservedStock ?? 0));

  const cart = await getOrCreateCart(sessionId);
  const existingItem = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
  });

  const currentQty = existingItem ? existingItem.quantity : 0;
  const targetQty = currentQty + quantity;

  if (targetQty > availableStock) {
    return {
      success: false,
      code: 'EXCEEDS_AVAILABLE_STOCK',
      availableQuantity: availableStock,
      message: `Only ${availableStock} units available in stock`,
    };
  }

  if (existingItem) {
    await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: targetQty },
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        variantId,
        quantity: targetQty,
      },
    });
  }

  return { success: true, message: 'Item added to cart successfully' };
}

/**
 * Updates cart item quantity with explicit stock validation.
 */
export async function updateCartItemQuantity(sessionId: string, variantId: string, quantity: number) {
  const cart = await getOrCreateCart(sessionId);
  const existingItem = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
  });

  if (!existingItem) {
    return { success: false, code: 'ITEM_NOT_FOUND', message: 'Cart item not found' };
  }

  if (quantity <= 0) {
    await prisma.cartItem.delete({ where: { id: existingItem.id } });
    return { success: true, message: 'Item removed from cart' };
  }

  const inv = await prisma.inventoryItem.findUnique({ where: { variantId } });
  const availableStock = Math.max(0, (inv?.physicalStock ?? 0) - (inv?.reservedStock ?? 0));

  if (quantity > availableStock) {
    return {
      success: false,
      code: 'EXCEEDS_AVAILABLE_STOCK',
      availableQuantity: availableStock,
      message: `Only ${availableStock} units available in stock`,
    };
  }

  await prisma.cartItem.update({
    where: { id: existingItem.id },
    data: { quantity },
  });

  return { success: true, message: 'Cart updated successfully' };
}

/**
 * Removes an item from the cart.
 */
export async function removeItemFromCart(sessionId: string, variantId: string) {
  const cart = await getOrCreateCart(sessionId);
  await prisma.cartItem.deleteMany({
    where: { cartId: cart.id, variantId },
  });
  return { success: true, message: 'Item removed from cart' };
}

/**
 * Clears all items in the cart.
 */
export async function clearCart(sessionId: string) {
  const cart = await getOrCreateCart(sessionId);
  await prisma.cartItem.deleteMany({
    where: { cartId: cart.id },
  });
  return { success: true, message: 'Cart cleared' };
}

/**
 * Removes specific items from the cart by variant IDs, preserving any unsubmitted items.
 */
export async function removeItemsFromCart(sessionId: string, variantIds: string[]) {
  if (!variantIds || variantIds.length === 0) {
    return { success: true, message: 'No items to remove' };
  }
  const cart = await getOrCreateCart(sessionId);
  await prisma.cartItem.deleteMany({
    where: {
      cartId: cart.id,
      variantId: { in: variantIds },
    },
  });
  return { success: true, message: 'Selected items removed from cart' };
}
