import { z } from 'zod';

export const vendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required').max(100),
  contactPerson: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email('Invalid email address').nullable().optional().or(z.literal('')),
  address: z.string().nullable().optional(),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format')
    .nullable()
    .optional()
    .or(z.literal('')),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const purchaseLineSchema = z.object({
  variantId: z.string().uuid('Invalid variant ID'),
  quantity: z.number().int().gt(0, 'Quantity must be greater than zero'),
  unitPurchasePrice: z.number().gte(0, 'Unit purchase price cannot be negative'),
});

export const purchaseSchema = z.object({
  vendorId: z.string().uuid('Invalid vendor ID'),
  purchaseDate: z.string().or(z.date()).optional(),
  freight: z.number().gte(0, 'Freight cannot be negative').default(0),
  notes: z.string().nullable().optional(),
  lines: z
    .array(purchaseLineSchema)
    .min(1, 'Purchase must contain at least one line item')
    .refine(
      (lines) => {
        const variantIds = lines.map((l) => l.variantId);
        const uniqueIds = new Set(variantIds);
        return uniqueIds.size === variantIds.length;
      },
      { message: 'A purchase document cannot contain duplicate product variants.' }
    ),
});
