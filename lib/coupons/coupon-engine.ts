import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { normalizeIndiaMobile } from '@/lib/validation/mobile';

/**
 * Normalizes a coupon code to canonical uppercase trimmed format.
 * Example: " save20 " -> "SAVE20"
 */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export interface CouponItemInput {
  variantId: string;
  productId: string;
  categoryId: string;
  sellingPrice: number | Prisma.Decimal;
  quantity: number;
}

export interface CouponValidationResult {
  valid: boolean;
  code?: string;
  couponId?: string;
  discountTotal: Prisma.Decimal;
  eligibleSubtotal: Prisma.Decimal;
  reason?: string;
  lineDiscounts: Map<string, Prisma.Decimal>; // variantId -> line discount amount
  recordUsage?: () => Promise<void>;
}

/**
 * Recursively resolves all ancestor category IDs for a given category ID (including itself).
 */
export async function getCategoryHierarchySet(
  categoryId: string,
  tx?: Prisma.TransactionClient
): Promise<Set<string>> {
  const db = tx || prisma;
  const categoryIds = new Set<string>();
  let currentId: string | null = categoryId;

  while (currentId) {
    categoryIds.add(currentId);
    const cat: { parentId: string | null } | null = await db.category.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    currentId = cat?.parentId || null;
  }

  return categoryIds;
}

/**
 * Computes coupon discount and pro-rata line item allocation with ROUND_HALF_UP
 * and deterministic remainder tie-breaking.
 */
export async function calculateCouponDiscount(
  coupon: {
    id: string;
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
    discountValue: Prisma.Decimal;
    maxDiscountAmount: Prisma.Decimal | null;
    applicableProducts: Array<{ productId: string }>;
    applicableCategories: Array<{ categoryId: string }>;
  },
  items: CouponItemInput[],
  tx?: Prisma.TransactionClient
): Promise<{
  eligibleSubtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  lineDiscounts: Map<string, Prisma.Decimal>;
  eligibleItems: CouponItemInput[];
}> {
  const isUnrestricted =
    coupon.applicableProducts.length === 0 && coupon.applicableCategories.length === 0;

  const targetProductIds = new Set(coupon.applicableProducts.map((p) => p.productId));
  const targetCategoryIds = new Set(coupon.applicableCategories.map((c) => c.categoryId));

  const eligibleItems: CouponItemInput[] = [];

  for (const item of items) {
    if (isUnrestricted) {
      eligibleItems.push(item);
    } else {
      let isEligible = targetProductIds.has(item.productId);
      if (!isEligible && targetCategoryIds.size > 0) {
        const itemCategoryHierarchy = await getCategoryHierarchySet(item.categoryId, tx);
        for (const catId of Array.from(itemCategoryHierarchy)) {
          if (targetCategoryIds.has(catId)) {
            isEligible = true;
            break;
          }
        }
      }
      if (isEligible) {
        eligibleItems.push(item);
      }
    }
  }

  let eligibleSubtotalNum = 0;
  const lineSubtotals = new Map<string, number>();

  for (const item of eligibleItems) {
    const priceNum = Number(item.sellingPrice);
    const lineSubtotal = priceNum * item.quantity;
    lineSubtotals.set(item.variantId, lineSubtotal);
    eligibleSubtotalNum += lineSubtotal;
  }

  const eligibleSubtotal = new Prisma.Decimal(eligibleSubtotalNum.toFixed(2));

  if (eligibleItems.length === 0 || eligibleSubtotalNum <= 0) {
    return {
      eligibleSubtotal: new Prisma.Decimal('0.00'),
      discountTotal: new Prisma.Decimal('0.00'),
      lineDiscounts: new Map(),
      eligibleItems: [],
    };
  }

  let discountTotalDecimal: Prisma.Decimal;

  if (coupon.discountType === 'PERCENTAGE') {
    const rawDiscount = eligibleSubtotal.mul(coupon.discountValue).div(100);
    // ROUND_HALF_UP to 2 decimal places
    let rounded = new Prisma.Decimal(rawDiscount.toFixed(2, Prisma.Decimal.ROUND_HALF_UP));

    if (coupon.maxDiscountAmount && rounded.greaterThan(coupon.maxDiscountAmount)) {
      rounded = coupon.maxDiscountAmount;
    }

    discountTotalDecimal = Prisma.Decimal.min(rounded, eligibleSubtotal);
  } else {
    // FIXED_AMOUNT
    discountTotalDecimal = Prisma.Decimal.min(coupon.discountValue, eligibleSubtotal);
  }

  // Calculate pro-rata line item discounts
  const lineDiscounts = new Map<string, Prisma.Decimal>();
  let totalAllocatedNum = 0;

  for (const item of eligibleItems) {
    const itemSubtotal = lineSubtotals.get(item.variantId) || 0;
    const itemProRata = discountTotalDecimal.mul(itemSubtotal).div(eligibleSubtotal);
    const lineDiscount = new Prisma.Decimal(itemProRata.toFixed(2, Prisma.Decimal.ROUND_HALF_UP));
    lineDiscounts.set(item.variantId, lineDiscount);
    totalAllocatedNum += Number(lineDiscount);
  }

  // Deterministic Remainder Allocation Rule:
  // If sum of lineDiscounts != discountTotalDecimal, add remainder to:
  // 1. Line item with highest merchandise subtotal (sellingPrice * quantity)
  // 2. Tie-breaker: Alphabetically lowest variantId string ASC
  const totalAllocatedDecimal = new Prisma.Decimal(totalAllocatedNum.toFixed(2));
  const remainder = discountTotalDecimal.sub(totalAllocatedDecimal);

  if (!remainder.equals(0) && eligibleItems.length > 0) {
    const sortedEligible = [...eligibleItems].sort((a, b) => {
      const subA = lineSubtotals.get(a.variantId) || 0;
      const subB = lineSubtotals.get(b.variantId) || 0;
      if (subB !== subA) {
        return subB - subA; // Descending merchandise subtotal
      }
      return a.variantId.localeCompare(b.variantId); // Ascending variantId tie-breaker
    });

    const recipientVariantId = sortedEligible[0].variantId;
    const currentLineDiscount = lineDiscounts.get(recipientVariantId) || new Prisma.Decimal('0.00');
    lineDiscounts.set(recipientVariantId, currentLineDiscount.add(remainder));
  }

  return {
    eligibleSubtotal,
    discountTotal: discountTotalDecimal,
    lineDiscounts,
    eligibleItems,
  };
}

/**
 * Mode 1: Storefront Preview / Cart Validation
 * READ-ONLY query used by getCartDetails() and cart UI preview actions.
 * - Does NOT consume usage
 * - Does NOT insert CouponUsage
 * - Does NOT increment usageCountGlobal
 */
export async function previewCouponEligibility(
  code: string,
  items: CouponItemInput[],
  customerMobile?: string | null
): Promise<CouponValidationResult> {
  const canonicalCode = normalizeCouponCode(code);

  const coupon = await prisma.coupon.findUnique({
    where: { code: canonicalCode },
    include: {
      applicableProducts: true,
      applicableCategories: true,
    },
  });

  if (!coupon) {
    return {
      valid: false,
      reason: `Coupon code '${canonicalCode}' does not exist`,
      discountTotal: new Prisma.Decimal('0.00'),
      eligibleSubtotal: new Prisma.Decimal('0.00'),
      lineDiscounts: new Map(),
    };
  }

  if (coupon.status !== 'ACTIVE') {
    return {
      valid: false,
      code: canonicalCode,
      couponId: coupon.id,
      reason: `Coupon '${canonicalCode}' is inactive or archived`,
      discountTotal: new Prisma.Decimal('0.00'),
      eligibleSubtotal: new Prisma.Decimal('0.00'),
      lineDiscounts: new Map(),
    };
  }

  const now = new Date();
  if (coupon.startDate && now < coupon.startDate) {
    return {
      valid: false,
      code: canonicalCode,
      couponId: coupon.id,
      reason: `Coupon '${canonicalCode}' is not active yet`,
      discountTotal: new Prisma.Decimal('0.00'),
      eligibleSubtotal: new Prisma.Decimal('0.00'),
      lineDiscounts: new Map(),
    };
  }

  if (coupon.endDate && now > coupon.endDate) {
    return {
      valid: false,
      code: canonicalCode,
      couponId: coupon.id,
      reason: `Coupon '${canonicalCode}' has expired`,
      discountTotal: new Prisma.Decimal('0.00'),
      eligibleSubtotal: new Prisma.Decimal('0.00'),
      lineDiscounts: new Map(),
    };
  }

  if (coupon.usageLimitGlobal !== null && coupon.usageCountGlobal >= coupon.usageLimitGlobal) {
    return {
      valid: false,
      code: canonicalCode,
      couponId: coupon.id,
      reason: `Coupon '${canonicalCode}' has reached its total usage limit`,
      discountTotal: new Prisma.Decimal('0.00'),
      eligibleSubtotal: new Prisma.Decimal('0.00'),
      lineDiscounts: new Map(),
    };
  }

  if (customerMobile && coupon.usageLimitPerCustomer !== null) {
    const normalizedMobile = normalizeIndiaMobile(customerMobile);
    const customerUsageCount = await prisma.couponUsage.count({
      where: {
        couponId: coupon.id,
        customerMobile: normalizedMobile,
      },
    });

    if (customerUsageCount >= coupon.usageLimitPerCustomer) {
      return {
        valid: false,
        code: canonicalCode,
        couponId: coupon.id,
        reason: `You have reached the maximum usage limit for coupon '${canonicalCode}'`,
        discountTotal: new Prisma.Decimal('0.00'),
        eligibleSubtotal: new Prisma.Decimal('0.00'),
        lineDiscounts: new Map(),
      };
    }
  }

  const { eligibleSubtotal, discountTotal, lineDiscounts, eligibleItems } =
    await calculateCouponDiscount(coupon, items);

  if (eligibleItems.length === 0) {
    return {
      valid: false,
      code: canonicalCode,
      couponId: coupon.id,
      reason: `Coupon '${canonicalCode}' is not applicable to any items in your cart`,
      discountTotal: new Prisma.Decimal('0.00'),
      eligibleSubtotal: new Prisma.Decimal('0.00'),
      lineDiscounts: new Map(),
    };
  }

  if (coupon.minOrderValue && eligibleSubtotal.lessThan(coupon.minOrderValue)) {
    return {
      valid: false,
      code: canonicalCode,
      couponId: coupon.id,
      reason: `Minimum eligible order value of ₹${coupon.minOrderValue} required for coupon '${canonicalCode}'`,
      discountTotal: new Prisma.Decimal('0.00'),
      eligibleSubtotal,
      lineDiscounts: new Map(),
    };
  }

  return {
    valid: true,
    code: canonicalCode,
    couponId: coupon.id,
    discountTotal,
    eligibleSubtotal,
    lineDiscounts,
  };
}

/**
 * Mode 2: Final Checkout Validation & Consumption
 * TRANSACTION-BOUND execution inside createOnlineOrder().
 * - MUST run inside the SAME Prisma transaction as Order creation
 * - MUST acquire Coupon row lock using SELECT FOR UPDATE
 * - MUST validate status, dates, applicability, min order value, global & customer usage limits
 * - MUST increment usageCountGlobal inside transaction
 * - MUST insert CouponUsage inside transaction
 */
export async function validateAndConsumeCouponInTransaction(
  tx: Prisma.TransactionClient,
  code: string,
  orderId: string,
  customerId: string | null,
  customerMobile: string,
  items: CouponItemInput[]
): Promise<CouponValidationResult> {
  const canonicalCode = normalizeCouponCode(code);

  // Lock Coupon row using SELECT FOR UPDATE
  const lockedCoupons = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM coupons WHERE code = ${canonicalCode} FOR UPDATE
  `;

  if (!lockedCoupons || lockedCoupons.length === 0) {
    throw new Error(`INVALID_COUPON: Coupon code '${canonicalCode}' does not exist`);
  }

  const couponId = lockedCoupons[0].id;

  const coupon = await tx.coupon.findUniqueOrThrow({
    where: { id: couponId },
    include: {
      applicableProducts: true,
      applicableCategories: true,
    },
  });

  if (coupon.status !== 'ACTIVE') {
    throw new Error(`INVALID_COUPON: Coupon '${canonicalCode}' is inactive or archived`);
  }

  const now = new Date();
  if (coupon.startDate && now < coupon.startDate) {
    throw new Error(`INVALID_COUPON: Coupon '${canonicalCode}' is not active yet`);
  }

  if (coupon.endDate && now > coupon.endDate) {
    throw new Error(`INVALID_COUPON: Coupon '${canonicalCode}' has expired`);
  }

  if (coupon.usageLimitGlobal !== null && coupon.usageCountGlobal >= coupon.usageLimitGlobal) {
    throw new Error(`INVALID_COUPON: Coupon '${canonicalCode}' has reached its total usage limit`);
  }

  const normalizedMobile = normalizeIndiaMobile(customerMobile);
  if (coupon.usageLimitPerCustomer !== null) {
    const customerUsageCount = await tx.couponUsage.count({
      where: {
        couponId: coupon.id,
        customerMobile: normalizedMobile,
        status: 'ACTIVE',
      },
    });

    if (customerUsageCount >= coupon.usageLimitPerCustomer) {
      throw new Error(`INVALID_COUPON: Maximum per-customer usage limit reached for coupon '${canonicalCode}'`);
    }
  }

  const { eligibleSubtotal, discountTotal, lineDiscounts, eligibleItems } =
    await calculateCouponDiscount(coupon, items, tx);

  if (eligibleItems.length === 0) {
    throw new Error(`INVALID_COUPON: Coupon '${canonicalCode}' is not applicable to any items in order`);
  }

  if (coupon.minOrderValue && eligibleSubtotal.lessThan(coupon.minOrderValue)) {
    throw new Error(
      `INVALID_COUPON: Minimum eligible order value of ₹${coupon.minOrderValue} required for coupon '${canonicalCode}'`
    );
  }

  // Increment usageCountGlobal inside transaction
  await tx.coupon.update({
    where: { id: coupon.id },
    data: { usageCountGlobal: { increment: 1 } },
  });

  return {
    valid: true,
    code: canonicalCode,
    couponId: coupon.id,
    discountTotal,
    eligibleSubtotal,
    lineDiscounts,
    recordUsage: async () => {
      await tx.couponUsage.create({
        data: {
          couponId: coupon.id,
          orderId,
          customerId,
          customerMobile: normalizedMobile,
          discountAmount: discountTotal,
        },
      });
    },
  };
}
