import { prisma } from '@/lib/db/prisma';
import { Prisma, CouponStatus, CouponDiscountType } from '@prisma/client';
import { normalizeCouponCode } from './coupon-engine';
import { z } from 'zod';

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .transform((val) => normalizeCouponCode(val))
      .pipe(
        z
          .string()
          .min(3, 'Code must be at least 3 characters')
          .max(30, 'Code cannot exceed 30 characters')
          .regex(/^[A-Z0-9_-]+$/, 'Code can only contain letters, numbers, hyphens, and underscores')
      ),
    name: z.string().min(1, 'Name is required').max(100),
    description: z.string().max(500).nullable().optional(),
    discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
    discountValue: z.number().positive('Discount value must be positive'),
    minOrderValue: z.number().min(0).nullable().optional(),
    maxDiscountAmount: z.number().min(0).nullable().optional(),
    startDate: z.string().datetime().nullable().optional(),
    endDate: z.string().datetime().nullable().optional(),
    usageLimitGlobal: z.number().int().positive().nullable().optional(),
    usageLimitPerCustomer: z.number().int().positive().nullable().optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']).default('ACTIVE'),
    productIds: z.array(z.string().uuid()).default([]),
    categoryIds: z.array(z.string().uuid()).default([]),
  })
  .refine(
    (data) => {
      if (data.discountType === 'PERCENTAGE') {
        return data.discountValue <= 100;
      }
      return true;
    },
    { message: 'Percentage discount cannot exceed 100%' }
  )
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    { message: 'Start date cannot be after end date' }
  );

export type CouponInput = z.infer<typeof couponInputSchema>;

export async function getCoupons(options?: { search?: string; status?: CouponStatus }) {
  const where: Prisma.CouponWhereInput = {};

  if (options?.status) {
    where.status = options.status;
  }

  if (options?.search && options.search.trim() !== '') {
    const term = options.search.trim();
    where.OR = [
      { code: { contains: term, mode: 'insensitive' } },
      { name: { contains: term, mode: 'insensitive' } },
    ];
  }

  return await prisma.coupon.findMany({
    where,
    include: {
      applicableProducts: { include: { product: true } },
      applicableCategories: { include: { category: true } },
      _count: { select: { usages: true, orders: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getCouponById(id: string) {
  return await prisma.coupon.findUnique({
    where: { id },
    include: {
      applicableProducts: { include: { product: true } },
      applicableCategories: { include: { category: true } },
      usages: {
        include: {
          order: true,
          customer: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function createCoupon(input: CouponInput) {
  const parsed = couponInputSchema.parse(input);
  const canonicalCode = normalizeCouponCode(parsed.code);

  const existing = await prisma.coupon.findUnique({ where: { code: canonicalCode } });
  if (existing) {
    throw new Error(`COUPON_EXISTS: Coupon code '${canonicalCode}' already exists`);
  }

  return await prisma.coupon.create({
    data: {
      code: canonicalCode,
      name: parsed.name,
      description: parsed.description || null,
      discountType: parsed.discountType as CouponDiscountType,
      discountValue: new Prisma.Decimal(parsed.discountValue),
      minOrderValue: parsed.minOrderValue != null ? new Prisma.Decimal(parsed.minOrderValue) : null,
      maxDiscountAmount: parsed.maxDiscountAmount != null ? new Prisma.Decimal(parsed.maxDiscountAmount) : null,
      startDate: parsed.startDate ? new Date(parsed.startDate) : null,
      endDate: parsed.endDate ? new Date(parsed.endDate) : null,
      usageLimitGlobal: parsed.usageLimitGlobal || null,
      usageLimitPerCustomer: parsed.usageLimitPerCustomer || null,
      status: parsed.status as CouponStatus,
      applicableProducts: {
        create: parsed.productIds.map((productId) => ({ productId })),
      },
      applicableCategories: {
        create: parsed.categoryIds.map((categoryId) => ({ categoryId })),
      },
    },
    include: {
      applicableProducts: true,
      applicableCategories: true,
    },
  });
}

export async function updateCoupon(id: string, input: Partial<CouponInput>) {
  const existing = await prisma.coupon.findUniqueOrThrow({
    where: { id },
    include: { applicableProducts: true, applicableCategories: true },
  });

  // Check core field immutability if redemptions have occurred
  if (existing.usageCountGlobal > 0) {
    const hasCodeChange = input.code && normalizeCouponCode(input.code) !== existing.code;
    const hasDiscountTypeChange = input.discountType && input.discountType !== existing.discountType;
    const hasDiscountValueChange =
      input.discountValue !== undefined && Number(existing.discountValue) !== input.discountValue;
    const hasMinOrderChange =
      input.minOrderValue !== undefined &&
      (existing.minOrderValue === null ? input.minOrderValue !== null : Number(existing.minOrderValue) !== input.minOrderValue);
    const hasMaxDiscountChange =
      input.maxDiscountAmount !== undefined &&
      (existing.maxDiscountAmount === null ? input.maxDiscountAmount !== null : Number(existing.maxDiscountAmount) !== input.maxDiscountAmount);

    if (hasCodeChange || hasDiscountTypeChange || hasDiscountValueChange || hasMinOrderChange || hasMaxDiscountChange) {
      throw new Error(
        `COUPON_IN_USE_IMMUTABLE_FIELD: Core financial and code fields cannot be modified after redemptions have occurred`
      );
    }
  }

  const updateData: Prisma.CouponUpdateInput = {};

  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description || null;
  if (input.status !== undefined) updateData.status = input.status as CouponStatus;
  if (input.endDate !== undefined) updateData.endDate = input.endDate ? new Date(input.endDate) : null;
  if (input.usageLimitGlobal !== undefined) updateData.usageLimitGlobal = input.usageLimitGlobal || null;
  if (input.usageLimitPerCustomer !== undefined) updateData.usageLimitPerCustomer = input.usageLimitPerCustomer || null;

  if (existing.usageCountGlobal === 0) {
    if (input.code) updateData.code = normalizeCouponCode(input.code);
    if (input.discountType) updateData.discountType = input.discountType as CouponDiscountType;
    if (input.discountValue !== undefined) updateData.discountValue = new Prisma.Decimal(input.discountValue);
    if (input.minOrderValue !== undefined)
      updateData.minOrderValue = input.minOrderValue != null ? new Prisma.Decimal(input.minOrderValue) : null;
    if (input.maxDiscountAmount !== undefined)
      updateData.maxDiscountAmount = input.maxDiscountAmount != null ? new Prisma.Decimal(input.maxDiscountAmount) : null;
    if (input.startDate !== undefined) updateData.startDate = input.startDate ? new Date(input.startDate) : null;

    if (input.productIds !== undefined) {
      await prisma.couponProduct.deleteMany({ where: { couponId: id } });
      updateData.applicableProducts = {
        create: input.productIds.map((productId) => ({ productId })),
      };
    }

    if (input.categoryIds !== undefined) {
      await prisma.couponCategory.deleteMany({ where: { couponId: id } });
      updateData.applicableCategories = {
        create: input.categoryIds.map((categoryId) => ({ categoryId })),
      };
    }
  }

  return await prisma.coupon.update({
    where: { id },
    data: updateData,
    include: { applicableProducts: true, applicableCategories: true },
  });
}

export async function toggleCouponStatus(id: string, status: CouponStatus) {
  return await prisma.coupon.update({
    where: { id },
    data: { status },
  });
}
