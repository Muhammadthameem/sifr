'use server';

import { requireAdminAuth } from '@/lib/auth/admin-auth';
import {
  getCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  toggleCouponStatus,
  CouponInput,
} from '@/lib/coupons/coupon-admin';
import { CouponStatus } from '@prisma/client';

export async function fetchCouponsAction(search?: string, status?: CouponStatus) {
  try {
    await requireAdminAuth();
    const coupons = await getCoupons({ search, status });
    return { success: true, coupons };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchCouponByIdAction(id: string) {
  try {
    await requireAdminAuth();
    const coupon = await getCouponById(id);
    if (!coupon) return { success: false, error: 'Coupon not found' };
    return { success: true, coupon };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createCouponAction(input: CouponInput) {
  try {
    await requireAdminAuth();
    const coupon = await createCoupon(input);
    return { success: true, coupon };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create coupon' };
  }
}

export async function updateCouponAction(id: string, input: Partial<CouponInput>) {
  try {
    await requireAdminAuth();
    const coupon = await updateCoupon(id, input);
    return { success: true, coupon };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update coupon' };
  }
}

export async function toggleCouponStatusAction(id: string, status: CouponStatus) {
  try {
    await requireAdminAuth();
    const coupon = await toggleCouponStatus(id, status);
    return { success: true, coupon };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to toggle status' };
  }
}
