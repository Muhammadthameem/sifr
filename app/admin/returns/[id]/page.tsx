import React from 'react';
import { notFound } from 'next/navigation';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getAdminReturnDetails } from '@/lib/returns/return-engine';
import { ReturnDetailView } from '@/components/admin/returns/ReturnDetailView';

export const dynamic = 'force-dynamic';

export default async function ReturnDetailAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminAuth();
  const { id: returnRequestId } = await params;

  const returnReq = await getAdminReturnDetails(returnRequestId);

  if (!returnReq) {
    notFound();
  }

  // Serialize Decimals for Client Component
  const serializedReturnReq = {
    ...returnReq,
    subtotalRefund: Number(returnReq.subtotalRefund),
    shippingRefund: Number(returnReq.shippingRefund),
    taxRefund: Number(returnReq.taxRefund),
    totalRefundAmount: Number(returnReq.totalRefundAmount),
    createdAt: returnReq.createdAt.toISOString(),
    updatedAt: returnReq.updatedAt.toISOString(),
    acceptedAt: returnReq.acceptedAt ? returnReq.acceptedAt.toISOString() : null,
    rejectedAt: returnReq.rejectedAt ? returnReq.rejectedAt.toISOString() : null,
    receivedAt: returnReq.receivedAt ? returnReq.receivedAt.toISOString() : null,
    inspectedAt: returnReq.inspectedAt ? returnReq.inspectedAt.toISOString() : null,
    resolvedAt: returnReq.resolvedAt ? returnReq.resolvedAt.toISOString() : null,
    order: {
      ...returnReq.order,
      subtotal: Number(returnReq.order.subtotal),
      shippingFee: Number(returnReq.order.shippingFee),
      discountTotal: Number(returnReq.order.discountTotal),
      taxTotal: Number(returnReq.order.taxTotal),
      grandTotal: Number(returnReq.order.grandTotal),
      totalFifoCogs: Number(returnReq.order.totalFifoCogs),
      createdAt: returnReq.order.createdAt.toISOString(),
      updatedAt: returnReq.order.updatedAt.toISOString(),
    },
    items: returnReq.items.map((item) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      proRataDiscount: Number(item.proRataDiscount),
      netRefundAmount: Number(item.netRefundAmount),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    refunds: returnReq.refunds.map((ref) => ({
      ...ref,
      amount: Number(ref.amount),
      shippingRefund: Number(ref.shippingRefund),
      createdAt: ref.createdAt.toISOString(),
      updatedAt: ref.updatedAt.toISOString(),
      processedAt: ref.processedAt ? ref.processedAt.toISOString() : null,
      resolvedAt: ref.resolvedAt ? ref.resolvedAt.toISOString() : null,
    })),
  };

  return <ReturnDetailView returnReq={serializedReturnReq} />;
}
