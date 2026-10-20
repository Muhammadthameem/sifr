import React from 'react';
import { CouponListManager } from '@/components/admin/CouponListManager';

export const metadata = {
  title: 'Discounts & Coupons | SIFR Admin',
};

export default function AdminDiscountsPage() {
  return <CouponListManager />;
}
