import React from 'react';
import { notFound } from 'next/navigation';
import { getCouponById } from '@/lib/coupons/coupon-admin';
import { CouponForm } from '@/components/admin/CouponForm';

export const metadata = {
  title: 'Edit Coupon | SIFR Admin',
};

export default async function EditCouponPage({ params }: { params: { id: string } }) {
  const coupon = await getCouponById(params.id);

  if (!coupon) {
    notFound();
  }

  return <CouponForm initialData={coupon} isEdit={true} />;
}
