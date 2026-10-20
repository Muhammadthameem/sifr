import { z } from 'zod';

export const productGenderSchema = z.enum(['MEN', 'WOMEN', 'BOTH']);
export const productStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);

export const productImageInputSchema = z.object({
  id: z.string().optional(),
  url: z.string().min(1, 'Image URL is required'),
  storageKey: z.string().optional().nullable(),
  altText: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

export const productOptionInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Option name is required'), // e.g. "Size"
  position: z.number().int().default(0),
  values: z.array(z.string().min(1, 'Value cannot be empty')).min(1, 'Option must have at least one value'),
});

export const productVariantInputSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().min(1, 'Variant title is required'), // e.g. "S" or "M / Regular"
    sku: z.string().min(1, 'SKU is required'),
    costPrice: z.number().positive('Cost price must be positive').optional().nullable(),
    mrp: z.number().positive('MRP must be a positive number'),
    sellingPrice: z.number().positive('Selling price must be a positive number'),
    isAvailable: z.boolean().default(true),
  })
  .refine((data) => data.sellingPrice <= data.mrp, {
    message: 'Selling Price cannot be greater than MRP',
    path: ['sellingPrice'],
  });

export const productButtonInputSchema = z.object({
  id: z.string().optional(),
  targetProductId: z.string().min(1, 'Target product is required'),
  label: z.string().min(1, 'Button text label is required'),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const createProductSchema = z.object({
  name: z.string().min(2, 'Product name must be at least 2 characters'),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().optional().nullable(),
  gender: productGenderSchema.default('BOTH'),
  categoryId: z.string().min(1, 'Category is required'),
  status: productStatusSchema.default('DRAFT'),
  shippingCharge: z
    .number()
    .min(0, 'Shipping charge cannot be negative')
    .default(0),
  images: z.array(productImageInputSchema).default([]),
  options: z.array(productOptionInputSchema).default([]),
  variants: z.array(productVariantInputSchema).min(1, 'At least one variant combination is required'),
  buttons: z.array(productButtonInputSchema).default([]),
});

export const updateProductSchema = createProductSchema.extend({
  id: z.string().min(1, 'Product ID is required'),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;
export type ProductButtonInput = z.infer<typeof productButtonInputSchema>;
export type ProductOptionInput = z.infer<typeof productOptionInputSchema>;
