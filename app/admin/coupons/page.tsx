import React from 'react';
import { CouponListManager } from '@/components/admin/CouponListManager';

export const metadata = {
  title: 'Coupons & Discounts | SIFR Admin',
};

export default function AdminCouponsPage() {
  return <CouponListManager />;
}
