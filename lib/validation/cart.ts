import { z } from 'zod';
import { normalizeIndiaMobile } from './mobile';

export const indiaMobileSchema = z
  .string()
  .min(1, 'Customer mobile is required')
  .refine((val) => {
    try {
      normalizeIndiaMobile(val);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid Indian mobile number');

export const addToCartSchema = z.object({
  variantId: z.string().uuid({ message: 'Valid variant ID is required' }),
  quantity: z.number().int().min(1, { message: 'Quantity must be at least 1' }),
});

export const updateCartItemSchema = z.object({
  variantId: z.string().uuid({ message: 'Valid variant ID is required' }),
  quantity: z.number().int().min(0, { message: 'Quantity cannot be negative' }),
});

export const removeFromCartSchema = z.object({
  variantId: z.string().uuid({ message: 'Valid variant ID is required' }),
});

export const guestCheckoutSchema = z.object({
  creationIdempotencyKey: z.string().min(1, { message: 'Creation idempotency key is required' }),
  customer: z.object({
    name: z.string().min(2, { message: 'Full name is required (min 2 characters)' }),
    mobile: indiaMobileSchema,
    email: z.string().email({ message: 'Invalid email address' }).optional().or(z.literal('')),
    shippingAddress: z.string().min(5, { message: 'Shipping address is required (min 5 characters)' }),
    billingAddress: z.string().optional().or(z.literal('')),
  }),
  notes: z.string().optional().or(z.literal('')),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type RemoveFromCartInput = z.infer<typeof removeFromCartSchema>;
export type GuestCheckoutInput = z.infer<typeof guestCheckoutSchema>;
