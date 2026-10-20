import { z } from 'zod';
import { CmsSectionType } from '@prisma/client';

export const cmsButtonInputSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1, 'Button label is required'),
  url: z.string().min(1, 'Button URL is required'),
  style: z.enum(['PRIMARY', 'SECONDARY']).optional().default('PRIMARY'),
  sortOrder: z.number().int().optional().default(0),
});

export const cmsFeatureCardInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Feature card title is required'),
  imageUrl: z.string().min(1, 'Feature card image URL is required'),
  imageStorageKey: z.string().optional().nullable(),
  buttonLabel: z.string().min(1, 'Button label is required'),
  buttonUrl: z.string().min(1, 'Button URL is required'),
  sortOrder: z.number().int().optional().default(0),
});

export const upsertCmsSectionSchema = z.object({
  id: z.string().optional(),
  type: z.nativeEnum(CmsSectionType),
  internalTitle: z.string().min(1, 'Internal title is required for identification'),
  heading: z.string().optional().nullable(),
  subheading: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  imageStorageKey: z.string().optional().nullable(),
  altText: z.string().optional().nullable(),
  viewAllUrl: z.string().optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),

  buttons: z.array(cmsButtonInputSchema).optional().default([]),
  productIds: z.array(z.string()).optional().default([]),
  featureCards: z.array(cmsFeatureCardInputSchema).optional().default([]),
});

export type CmsButtonInput = z.infer<typeof cmsButtonInputSchema>;
export type CmsFeatureCardInput = z.infer<typeof cmsFeatureCardInputSchema>;
export type UpsertCmsSectionInput = z.input<typeof upsertCmsSectionSchema>;
