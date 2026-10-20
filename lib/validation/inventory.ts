import { z } from 'zod';

export const adjustmentReasonSchema = z.enum([
  'DAMAGED',
  'MISHANDLING',
  'SPOILAGE',
  'PHYSICAL_CORRECTION',
  'OTHER',
]);

export const stockAdjustmentInputSchema = z
  .object({
    variantId: z.string().min(1, 'Product variant is required'),
    direction: z.enum(['IN', 'OUT']),
    quantity: z.number().int().positive('Quantity must be a positive integer'),
    unitCost: z.number().nonnegative('Unit cost cannot be negative').optional().nullable(),
    reason: adjustmentReasonSchema,
    notes: z.string().min(1, 'Notes/reason explanation is required'),
    idempotencyKey: z.string().min(1, 'Idempotency key is required'),
  })
  .refine(
    (data) => {
      if (data.direction === 'IN') {
        return data.unitCost !== undefined && data.unitCost !== null && data.unitCost >= 0;
      }
      return true;
    },
    {
      message: 'Unit acquisition cost is required for Adjustment IN.',
      path: ['unitCost'],
    }
  );

export const receiveStockInputSchema = z.object({
  variantId: z.string().min(1, 'Product variant is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  unitCost: z.number().nonnegative('Unit cost must be non-negative'),
  referenceId: z.string().optional().nullable(),
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
  notes: z.string().optional().nullable(),
});

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentInputSchema>;
export type ReceiveStockInput = z.infer<typeof receiveStockInputSchema>;
