import React from 'react';
import { notFound } from 'next/navigation';
import { getCouponById } from '@/lib/coupons/coupon-admin';
import { CouponDetailView } from '@/components/admin/CouponDetailView';

export const metadata = {
  title: 'Coupon Details | SIFR Admin',
};

export default async function CouponDetailPage({ params }: { params: { id: string } }) {
  const coupon = await getCouponById(params.id);

  if (!coupon) {
    notFound();
  }

  return <CouponDetailView coupon={coupon} />;
}
