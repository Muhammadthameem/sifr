'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import {
  CreateWhatsAppOrderInput,
  CreateOnlineOrderInput,
  CreateDirectSaleInput,
  TransitionOrderStatusInput,
  ConfirmWhatsAppOrderSaleInput,
  DispatchOrderInput,
  MarkOrderDeliveredInput,
  CancelConfirmedOrderInput,
} from '@/lib/validation/ordering';
import {
  createWhatsAppOrder,
  createOnlineOrder,
  createDirectSale,
  transitionOrderStatus,
  deleteContactedOrder,
  confirmWhatsAppOrderSale,
  dispatchOrder,
  markOrderDelivered,
  cancelConfirmedOrder,
  updateOrderPaymentAdmin,
  UpdateOrderPaymentAdminInput,
} from '@/lib/ordering/order-engine';
import { SalesChannel, OrderStatus, PaymentStatus, PaymentMethod, Prisma } from '@prisma/client';
import {
  buildWhatsAppOrderMessage,
  buildWhatsAppUrl,
  getProductUrl,
  getBusinessWhatsAppNumber,
  WhatsAppOrderSnapshot,
  buildConfirmedOrderWhatsAppMessage,
  buildDispatchedOrderWhatsAppMessage,
  buildCustomerWhatsAppUrl,
} from '@/lib/ordering/whatsapp';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore when executed outside Next.js request context (e.g. CLI/tests)
  }
}

export async function createWhatsAppOrderAction(input: CreateWhatsAppOrderInput) {
  try {
    // 1. Final stock availability check at submission
    let variants: Array<any> = [];
    if (input.items && input.items.length > 0) {
      const variantIds = input.items.map((i) => i.variantId);
      variants = await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: {
          product: { select: { name: true, slug: true } },
          inventoryItem: { select: { physicalStock: true, reservedStock: true } },
        },
      });

      const varMap = new Map(variants.map((v) => [v.id, v]));

      for (const item of input.items) {
        const v = varMap.get(item.variantId);
        if (!v) {
          return { success: false, error: `Product variant not found: ${item.variantId}` };
        }
        const availableStock = Math.max(
          0,
          (v.inventoryItem?.physicalStock ?? 0) - (v.inventoryItem?.reservedStock ?? 0)
        );
        if (availableStock < item.quantity) {
          return {
            success: false,
            code: 'INSUFFICIENT_STOCK',
            error:
              'Some items are no longer available in the requested quantity. Please adjust your order and try again.',
          };
        }
      }
    }

    const order = await createWhatsAppOrder(input);
    safeRevalidatePath('/admin/orders');

    // Build authoritative slug lookup
    const slugMap = new Map(variants.map((v) => [v.id, v.product?.slug]));

    // If order already existed or variants weren't queried (empty input fallback), ensure slugs are retrieved
    const missingSlugVariantIds = order.items
      .map((i) => i.variantId)
      .filter((vId) => !slugMap.has(vId));

    if (missingSlugVariantIds.length > 0) {
      const extraVariants = await prisma.productVariant.findMany({
        where: { id: { in: missingSlugVariantIds } },
        include: { product: { select: { slug: true } } },
      });
      for (const ev of extraVariants) {
        slugMap.set(ev.id, ev.product?.slug);
      }
    }

    const orderSnapshotForMessage: WhatsAppOrderSnapshot = {
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      customerNameSnapshot: order.customerNameSnapshot,
      customerMobileSnapshot: order.customerMobileSnapshot,
      customerEmailSnapshot: order.customerEmailSnapshot,
      shippingAddressSnapshot: order.shippingAddressSnapshot,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      discountTotal: order.discountTotal,
      couponCodeSnapshot: order.couponCodeSnapshot,
      grandTotal: order.grandTotal,
      paymentStatus: order.paymentStatus,
      items: order.items.map((i) => {
        const slug = slugMap.get(i.variantId);
        return {
          productNameSnapshot: i.productNameSnapshot,
          variantTitleSnapshot: i.variantTitleSnapshot,
          skuSnapshot: i.skuSnapshot,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
          productSlug: slug || null,
          productUrl: slug ? getProductUrl(slug) : null,
        };
      }),
    };

    const storeSettingsRecord = await prisma.storeSettings.findFirst({
      select: { businessName: true, whatsAppNumber: true },
    });
    const businessName = storeSettingsRecord?.businessName || undefined;
    const businessPhone = storeSettingsRecord?.whatsAppNumber
      ? storeSettingsRecord.whatsAppNumber.replace(/[^0-9]/g, '')
      : getBusinessWhatsAppNumber();

    const whatsAppMessage = buildWhatsAppOrderMessage(orderSnapshotForMessage, businessName);
    const whatsAppUrl = buildWhatsAppUrl(businessPhone, whatsAppMessage);

    return {
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        salesChannel: order.salesChannel,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        subtotal: Number(order.subtotal),
        shippingFee: Number(order.shippingFee),
        discountTotal: Number(order.discountTotal),
        grandTotal: Number(order.grandTotal),
        customerName: order.customerNameSnapshot,
        customerMobile: order.customerMobileSnapshot,
        customerEmail: order.customerEmailSnapshot,
        shippingAddress: order.shippingAddressSnapshot,
        billingAddress: order.billingAddressSnapshot,
        creationIdempotencyKey: order.creationIdempotencyKey,
        createdAt: order.createdAt.toISOString(),
        items: order.items.map((i) => ({
          id: i.id,
          variantId: i.variantId,
          productNameSnapshot: i.productNameSnapshot,
          variantTitleSnapshot: i.variantTitleSnapshot,
          skuSnapshot: i.skuSnapshot,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
          mrp: Number(i.mrp),
          discountAmount: Number(i.discountAmount),
          lineTotal: Number(i.lineTotal),
          productSlug: slugMap.get(i.variantId) || null,
          productUrl: slugMap.get(i.variantId) ? getProductUrl(slugMap.get(i.variantId)!) : null,
        })),
      },
      whatsAppMessage,
      whatsAppUrl,
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create WhatsApp order' };
  }
}

export async function deleteContactedOrderAction(orderId: string) {
  try {
    await requireAdminAuth();
    const result = await deleteContactedOrder(orderId);
    revalidatePath('/admin/orders');
    return { success: true, deletedOrderId: result.deletedOrderId };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete contacted order' };
  }
}

export async function createOnlineOrderAction(input: CreateOnlineOrderInput) {
  try {
    const order = await createOnlineOrder(input);
    revalidatePath('/admin/orders');
    return { success: true, order };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create online order' };
  }
}

export async function createDirectSaleAction(input: CreateDirectSaleInput) {
  try {
    await requireAdminAuth();
    const order = await createDirectSale(input);
    revalidatePath('/admin/orders');
    revalidatePath('/admin/direct-sales');
    return { success: true, order };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create direct sale' };
  }
}

export async function transitionOrderStatusAction(input: TransitionOrderStatusInput) {
  try {
    await requireAdminAuth();
    const order = await transitionOrderStatus(input);
    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${input.orderId}`);
    return { success: true, order };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to transition order status' };
  }
}

export type {
  GetOrdersParams,
  GetOrdersResult,
  AdminOrderDetailResult,
  AdminOrderDetailItem,
} from '@/lib/ordering/order-query';
import { queryAdminOrders, getAdminOrderDetails, GetOrdersParams } from '@/lib/ordering/order-query';

export async function getOrders(params?: GetOrdersParams) {
  await requireAdminAuth();
  return queryAdminOrders(params);
}

export async function getOrderById(id: string) {
  await requireAdminAuth();
  return getAdminOrderDetails(id);
}

export async function getAdminOrderDetailsAction(id: string) {
  await requireAdminAuth();
  return getAdminOrderDetails(id);
}

export async function updateOrderPaymentAction(input: UpdateOrderPaymentAdminInput) {
  try {
    await requireAdminAuth();
    const order = await updateOrderPaymentAdmin(input);
    safeRevalidatePath('/admin/orders');
    safeRevalidatePath(`/admin/orders/${input.orderId}`);
    return { success: true, order };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update order payment' };
  }
}

export async function confirmWhatsAppOrderSaleAction(
  orderIdOrInput: string | ConfirmWhatsAppOrderSaleInput,
  paymentMethod?: any,
  paymentStatus?: any
) {
  try {
    await requireAdminAuth();
    let input: ConfirmWhatsAppOrderSaleInput;
    if (typeof orderIdOrInput === 'string') {
      input = {
        orderId: orderIdOrInput,
        paymentMethod: paymentMethod,
        paymentStatus: paymentStatus,
      };
    } else {
      input = orderIdOrInput;
    }

    const order = await confirmWhatsAppOrderSale(input);
    safeRevalidatePath('/admin/orders');
    safeRevalidatePath(`/admin/orders/${input.orderId}`);
    return { success: true, order };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to confirm WhatsApp order sale' };
  }
}

export async function dispatchOrderAction(
  orderIdOrInput: string | DispatchOrderInput,
  courierName?: string,
  trackingId?: string,
  trackingUrl?: string | null
) {
  try {
    await requireAdminAuth();
    let input: DispatchOrderInput;
    if (typeof orderIdOrInput === 'string') {
      input = {
        orderId: orderIdOrInput,
        courierName: courierName as string,
        trackingId: trackingId as string,
        trackingUrl: trackingUrl,
      };
    } else {
      input = orderIdOrInput;
    }

    const order = await dispatchOrder(input);
    safeRevalidatePath('/admin/orders');
    safeRevalidatePath(`/admin/orders/${input.orderId}`);
    return { success: true, order };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to dispatch order' };
  }
}

export async function markOrderDeliveredAction(
  orderIdOrInput: string | MarkOrderDeliveredInput,
  notes?: string | null
) {
  try {
    await requireAdminAuth();
    let input: MarkOrderDeliveredInput;
    if (typeof orderIdOrInput === 'string') {
      input = {
        orderId: orderIdOrInput,
        notes: notes,
      };
    } else {
      input = orderIdOrInput;
    }

    const order = await markOrderDelivered(input);
    safeRevalidatePath('/admin/orders');
    safeRevalidatePath(`/admin/orders/${input.orderId}`);
    return { success: true, order };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to mark order as delivered' };
  }
}

export async function cancelConfirmedOrderAction(
  orderIdOrInput: string | CancelConfirmedOrderInput,
  refundMethod?: 'CASH' | 'BANK_TRANSFER' | 'UPI',
  notes?: string | null
) {
  try {
    await requireAdminAuth();
    let input: CancelConfirmedOrderInput;
    if (typeof orderIdOrInput === 'string') {
      input = {
        orderId: orderIdOrInput,
        refundMethod: refundMethod,
        notes: notes,
      };
    } else {
      input = orderIdOrInput;
    }

    const order = await cancelConfirmedOrder(input);
    safeRevalidatePath('/admin/orders');
    safeRevalidatePath(`/admin/orders/${input.orderId}`);
    return { success: true, order };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to cancel order' };
  }
}

/**
 * Generates customer WhatsApp confirmation communication message & wa.me URL for CONFIRMED orders.
 * Admin manually attaches the generated bill PDF and sends it in WhatsApp.
 */
export async function getConfirmedOrderWhatsAppCommunicationAction(orderId: string) {
  try {
    await requireAdminAuth();
    const order = await getAdminOrderDetails(orderId);
    if (!order) {
      return { success: false, error: 'Order not found' };
    }
    if (order.status !== 'CONFIRMED' && order.status !== 'DISPATCHED' && order.status !== 'DELIVERED') {
      return {
        success: false,
        error: 'Order must be confirmed to generate bill WhatsApp communication',
      };
    }

    const message = buildConfirmedOrderWhatsAppMessage({
      customerNameSnapshot: order.customerNameSnapshot,
      orderNumber: order.orderNumber,
      grandTotal: order.grandTotal,
      paymentStatus: order.paymentStatus,
    });

    const url = buildCustomerWhatsAppUrl(order.customerMobileSnapshot, message);

    return {
      success: true,
      data: {
        message,
        url,
        customerPhone: order.customerMobileSnapshot,
        orderNumber: order.orderNumber,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to generate WhatsApp bill communication',
    };
  }
}

/**
 * Generates customer dispatch update message & wa.me URL for DISPATCHED orders.
 */
export async function getDispatchedOrderWhatsAppCommunicationAction(orderId: string) {
  try {
    await requireAdminAuth();
    const order = await getAdminOrderDetails(orderId);
    if (!order) {
      return { success: false, error: 'Order not found' };
    }
    if (order.status !== 'DISPATCHED' && order.status !== 'DELIVERED') {
      return {
        success: false,
        error: 'Order must be dispatched to generate dispatch WhatsApp update',
      };
    }

    const message = buildDispatchedOrderWhatsAppMessage({
      customerNameSnapshot: order.customerNameSnapshot,
      orderNumber: order.orderNumber,
      shipment: order.shipment,
    });

    const url = buildCustomerWhatsAppUrl(order.customerMobileSnapshot, message);

    return {
      success: true,
      data: {
        message,
        url,
        customerPhone: order.customerMobileSnapshot,
        orderNumber: order.orderNumber,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to generate dispatch WhatsApp update',
    };
  }
}

