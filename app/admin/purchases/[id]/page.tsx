import React from 'react';
import { notFound } from 'next/navigation';
import { getPurchaseDetail } from '@/lib/actions/purchase-actions';
import { PurchaseDetailView } from '@/components/admin/PurchaseDetailView';

export const revalidate = 0;

interface PurchaseDetailPageProps {
  params: { id: string };
}

export default async function PurchaseDetailPage({ params }: PurchaseDetailPageProps) {
  const purchase = await getPurchaseDetail(params.id);

  if (!purchase) {
    notFound();
  }

  return <PurchaseDetailView purchase={purchase as any} />;
}
