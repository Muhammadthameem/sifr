import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getAdminOrderDetails } from '@/lib/ordering/order-query';
import { OrderDetailView } from '@/components/admin/OrderDetailView';
import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Order Details | SIFR Admin',
  description: 'View order details, customer snapshots, items, and status history',
};

export default async function AdminOrderDetailPage({ params }: { params: { id: string } }) {
  await requireAdminAuth();
  const order = await getAdminOrderDetails(params.id);

  if (!order) {
    notFound();
  }

  return <OrderDetailView order={order} />;
}
