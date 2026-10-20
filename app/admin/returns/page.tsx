import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { queryAdminReturns } from '@/lib/returns/return-engine';
import { ReturnsListManager } from '@/components/admin/returns/ReturnsListManager';

export const dynamic = 'force-dynamic';

export default async function AdminReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  await requireAdminAuth();
  const params = await searchParams;

  const currentStatus = params.status || 'ALL';
  const currentSearch = params.search || '';
  const currentPage = parseInt(params.page || '1', 10) || 1;

  const data = await queryAdminReturns({
    status: currentStatus,
    search: currentSearch,
    page: currentPage,
    limit: 20,
  });

  // Serialize Decimals for Client Component
  const serializedRequests = data.returnRequests.map((req) => ({
    ...req,
    subtotalRefund: Number(req.subtotalRefund),
    shippingRefund: Number(req.shippingRefund),
    taxRefund: Number(req.taxRefund),
    totalRefundAmount: Number(req.totalRefundAmount),
    createdAt: req.createdAt.toISOString(),
    updatedAt: req.updatedAt.toISOString(),
    acceptedAt: req.acceptedAt ? req.acceptedAt.toISOString() : null,
    rejectedAt: req.rejectedAt ? req.rejectedAt.toISOString() : null,
    order: {
      ...req.order,
      grandTotal: Number(req.order.grandTotal),
    },
    refunds: req.refunds.map((ref) => ({
      ...ref,
      amount: Number(ref.amount),
      shippingRefund: Number(ref.shippingRefund),
      createdAt: ref.createdAt.toISOString(),
    })),
  }));

  return (
    <ReturnsListManager
      initialData={{
        ...data,
        returnRequests: serializedRequests,
      }}
      currentStatus={currentStatus}
      currentSearch={currentSearch}
    />
  );
}
