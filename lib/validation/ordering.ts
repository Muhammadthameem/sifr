import { z } from 'zod';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { normalizeIndiaMobile } from './mobile';

export const whatsappCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required').max(100),
  mobile: z
    .string()
    .min(1, 'Customer phone number is required')
    .refine((val) => {
      try {
        normalizeIndiaMobile(val);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid Indian mobile number'),
  address: z.string().min(1, 'Delivery address is required').max(500),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  pincode: z
    .string()
    .min(1, 'Pincode is required')
    .trim()
    .regex(/^[1-9][0-9]{5}$/, 'Invalid 6-digit Indian PIN code'),
  email: z.string().email('Invalid email address').nullable().optional(),
});

export const orderCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required').max(100),
  mobile: z
    .string()
    .min(1, 'Customer mobile is required')
    .refine((val) => {
      try {
        normalizeIndiaMobile(val);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid Indian mobile number'),
  email: z.string().email('Invalid email address').nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  shippingAddress: z.string().max(500).nullable().optional(),
  billingAddress: z.string().max(500).nullable().optional(),
});

export const orderItemInputSchema = z.object({
  variantId: z.string().uuid('Invalid variant ID'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
});

export const createOnlineOrderSchema = z
  .object({
    creationIdempotencyKey: z
      .string()
      .min(1, 'creationIdempotencyKey is mandatory for all order creation requests'),
    customer: orderCustomerSchema,
    items: z.array(orderItemInputSchema).min(1, 'At least one item is required'),
    shippingFee: z.number().min(0, 'Shipping fee must be a non-negative number'),
    couponCode: z.string().trim().max(50).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine(
    (data) => {
      const variantIds = data.items.map((i) => i.variantId);
      return new Set(variantIds).size === variantIds.length;
    },
    { message: 'Duplicate variants in the same order are not allowed' }
  );

export const createDirectSaleSchema = z
  .object({
    creationIdempotencyKey: z
      .string()
      .min(1, 'creationIdempotencyKey is mandatory for all direct sale creation requests'),
    customer: orderCustomerSchema,
    items: z.array(orderItemInputSchema).min(1, 'At least one item is required'),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine(
    (data) => {
      const variantIds = data.items.map((i) => i.variantId);
      return new Set(variantIds).size === variantIds.length;
    },
    { message: 'Duplicate variants in the same order are not allowed' }
  );

export const createWhatsAppOrderSchema = z
  .object({
    creationIdempotencyKey: z
      .string()
      .min(1, 'creationIdempotencyKey is mandatory for all WhatsApp order creation requests'),
    customer: whatsappCustomerSchema,
    items: z
      .array(
        z.object({
          variantId: z.string().uuid('Invalid variant ID'),
          quantity: z
            .number()
            .int('Quantity must be an integer')
            .positive('Quantity must be a positive integer')
            .max(99, 'Quantity cannot exceed 99 units per item'),
        })
      )
      .min(1, 'At least one item is required'),
    couponCode: z.string().trim().max(50).nullable().optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine(
    (data) => {
      const variantIds = data.items.map((i) => i.variantId);
      return new Set(variantIds).size === variantIds.length;
    },
    { message: 'Duplicate variants in the same order are not allowed' }
  );

export const shipmentInputSchema = z.object({
  courierName: z.string().trim().min(1, 'Courier name is required').max(100, 'Courier name maximum 100 characters'),
  trackingId: z.string().trim().min(1, 'Tracking ID is required').max(100, 'Tracking ID maximum 100 characters'),
  trackingUrl: z.string().trim().url('Invalid tracking URL').nullable().optional().or(z.literal('')),
});

export const transitionOrderStatusSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  idempotencyKey: z.string().min(1, 'Transition idempotency key is required'),
  targetStatus: z.nativeEnum(OrderStatus),
  shipment: shipmentInputSchema.optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  refundMethod: z.enum(['CASH', 'BANK_TRANSFER', 'UPI']).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const confirmWhatsAppOrderSaleSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  paymentMethod: z.enum(['COD', 'UPI', 'CASH']),
  paymentStatus: z.enum(['DUE', 'PAID']),
  idempotencyKey: z.string().min(1).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const dispatchOrderSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  courierName: z.string().trim().min(1, 'Courier name is required').max(100, 'Courier name maximum 100 characters'),
  trackingId: z.string().trim().min(1, 'Tracking ID is required').max(100, 'Tracking ID maximum 100 characters'),
  trackingUrl: z.string().trim().url('Invalid tracking URL').nullable().optional().or(z.literal('')),
  idempotencyKey: z.string().min(1).optional(),
});

export const markOrderDeliveredSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  idempotencyKey: z.string().min(1).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const cancelConfirmedOrderSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  refundMethod: z.enum(['CASH', 'BANK_TRANSFER', 'UPI']).optional(),
  notes: z.string().max(500).nullable().optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export type CreateWhatsAppOrderInput = z.infer<typeof createWhatsAppOrderSchema>;
export type WhatsAppCustomerInput = z.infer<typeof whatsappCustomerSchema>;
export type CreateOnlineOrderInput = z.infer<typeof createOnlineOrderSchema>;
export type CreateDirectSaleInput = z.infer<typeof createDirectSaleSchema>;
export type ShipmentInput = z.infer<typeof shipmentInputSchema>;
export type TransitionOrderStatusInput = z.infer<typeof transitionOrderStatusSchema>;
export type ConfirmWhatsAppOrderSaleInput = z.infer<typeof confirmWhatsAppOrderSaleSchema>;
export type DispatchOrderInput = z.infer<typeof dispatchOrderSchema>;
export type MarkOrderDeliveredInput = z.infer<typeof markOrderDeliveredSchema>;
export type CancelConfirmedOrderInput = z.infer<typeof cancelConfirmedOrderSchema>;

export type OrderNotificationEventType = 'ORDER_RECEIVED' | 'ORDER_CONFIRMED' | 'ORDER_DISPATCHED';

export interface OrderDispatchedEventPayload {
  eventType: 'ORDER_DISPATCHED';
  orderId: string;
  orderNumber: string;
  customerMobile: string;
  customerName: string;
  courierName: string;
  trackingId: string;
  trackingUrl?: string | null;
  dispatchedAt: Date;
}

