'use server';

import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import {
  getCartDetails,
  addItemToCart,
  updateCartItemQuantity,
  removeItemFromCart,
  removeItemsFromCart,
  clearCart,
  applyCartCoupon,
  removeCartCoupon,
} from '@/lib/cart/cart-service';
import { addToCartSchema, updateCartItemSchema, guestCheckoutSchema, GuestCheckoutInput } from '@/lib/validation/cart';
import { createOnlineOrder } from '@/lib/ordering/order-engine';
import { calculateOrderShipping } from '@/lib/ordering/shipping';
import { prisma } from '@/lib/db/prisma';

const CART_COOKIE_NAME = 'sifr_cart_id';

/**
 * Gets or initializes the session ID token stored in sifr_cart_id cookie.
 */
async function getCartSessionId(explicitSessionId?: string): Promise<string> {
  if (explicitSessionId) return explicitSessionId;
  try {
    const cookieStore = cookies();
    let sessionId = cookieStore.get(CART_COOKIE_NAME)?.value;

    if (!sessionId) {
      sessionId = randomUUID();
      cookieStore.set(CART_COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
      });
    }

    return sessionId;
  } catch {
    return randomUUID();
  }
}

export async function fetchCartAction() {
  const sessionId = await getCartSessionId();
  return getCartDetails(sessionId);
}

export async function addToCartAction(input: { variantId: string; quantity: number }) {
  const parsed = addToCartSchema.parse(input);
  const sessionId = await getCartSessionId();
  return addItemToCart(sessionId, parsed.variantId, parsed.quantity);
}

export async function updateCartItemAction(input: { variantId: string; quantity: number }) {
  const parsed = updateCartItemSchema.parse(input);
  const sessionId = await getCartSessionId();
  return updateCartItemQuantity(sessionId, parsed.variantId, parsed.quantity);
}

export async function removeFromCartAction(variantId: string) {
  const sessionId = await getCartSessionId();
  return removeItemFromCart(sessionId, variantId);
}

export async function removeSubmittedCartItemsAction(variantIds: string[], explicitSessionId?: string) {
  const sessionId = await getCartSessionId(explicitSessionId);
  return removeItemsFromCart(sessionId, variantIds);
}

export async function clearCartAction() {
  const sessionId = await getCartSessionId();
  return clearCart(sessionId);
}

export async function applyCartCouponAction(code: string) {
  const sessionId = await getCartSessionId();
  return applyCartCoupon(sessionId, code);
}

export async function removeCartCouponAction() {
  const sessionId = await getCartSessionId();
  return removeCartCoupon(sessionId);
}

/**
 * Guest Checkout Action
 * Loads cart, validates stock & pricing, calculates authoritative shipping fee,
 * and calls Phase 5/7 createOnlineOrder().
 */
export async function processGuestCheckoutAction(input: GuestCheckoutInput, explicitSessionId?: string) {
  const parsed = guestCheckoutSchema.parse(input);
  const sessionId = await getCartSessionId(explicitSessionId);
  const cartDetails = await getCartDetails(sessionId);

  if (cartDetails.items.length === 0) {
    return { success: false, code: 'EMPTY_CART', message: 'Your shopping cart is empty' };
  }

  if (cartDetails.hasUnavailableItems) {
    return {
      success: false,
      code: 'UNAVAILABLE_ITEMS',
      message: 'Some items in your cart are no longer available or out of stock',
    };
  }

  // Calculate authoritative server shipping fee using ProductVariant shippingCosts
  const variantIds = cartDetails.items.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
  });
  const varMap = new Map(variants.map((v) => [v.id, v]));

  const shippingItems = cartDetails.items.map((item) => ({
    shippingCost: varMap.get(item.variantId)?.shippingCost,
    quantity: item.quantity,
  }));
  const authoritativeShippingDecimal = calculateOrderShipping(shippingItems);
  const authoritativeShippingNum = Number(authoritativeShippingDecimal);

  // Invoke Phase 5/7 createOnlineOrder engine cleanly
  try {
    const order = await createOnlineOrder({
      creationIdempotencyKey: parsed.creationIdempotencyKey,
      customer: {
        name: parsed.customer.name,
        mobile: parsed.customer.mobile,
        email: parsed.customer.email || null,
        shippingAddress: parsed.customer.shippingAddress,
        billingAddress: parsed.customer.billingAddress || parsed.customer.shippingAddress,
      },
      items: cartDetails.items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
      })),
      shippingFee: authoritativeShippingNum,
      couponCode: cartDetails.appliedCouponCode || null,
      notes: parsed.notes || null,
    });

    // Clear cart upon successful order creation
    await clearCart(sessionId);

    return {
      success: true,
      orderNumber: order.orderNumber,
      guestAccessToken: order.guestAccessToken,
      guestAccessTokenExpiresAt: order.guestAccessTokenExpiresAt,
    };
  } catch (err: any) {
    return {
      success: false,
      code: 'CHECKOUT_FAILED',
      message: err.message || 'Failed to place order',
    };
  }
}
