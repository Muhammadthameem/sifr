import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { queryAdminPayments, queryAdminRefunds } from '@/lib/payments/payment-query';
import { PaymentsManagementView } from '@/components/admin/PaymentsManagementView';
import { PaymentStatus, SalesChannel, OrderStatus, RefundMethod } from '@prisma/client';

export const metadata = {
  title: 'Payments & Refunds | SIFR Admin',
  description: 'Manage order payments, offline refunds, and reconciliation.',
};

interface AdminPaymentsPageProps {
  searchParams: {
    tab?: string;
    search?: string;
    paymentStatus?: string;
    paymentMethod?: string;
    salesChannel?: string;
    orderStatus?: string;
    method?: string;
    page?: string;
  };
}

export default async function AdminPaymentsPage({ searchParams }: AdminPaymentsPageProps) {
  await requireAdminAuth();

  const tabParam = searchParams.tab;
  let currentTab: 'payments' | 'pending-refunds' | 'refund-history' = 'payments';
  if (tabParam === 'pending-refunds') {
    currentTab = 'pending-refunds';
  } else if (tabParam === 'refund-history') {
    currentTab = 'refund-history';
  }

  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const search = searchParams.search?.trim() || undefined;

  // Payments filter params
  const paymentStatus = (searchParams.paymentStatus as PaymentStatus | 'ALL') || undefined;
  const paymentMethod = searchParams.paymentMethod || undefined;
  const salesChannel = (searchParams.salesChannel as SalesChannel | 'ALL') || undefined;
  const orderStatus = (searchParams.orderStatus as OrderStatus | 'ALL') || undefined;

  // Refund filter params
  const refundMethod = (searchParams.method as RefundMethod | 'ALL') || undefined;

  // Fetch payments list
  const paymentsResult = await queryAdminPayments({
    search: currentTab === 'payments' ? search : undefined,
    paymentStatus: currentTab === 'payments' ? paymentStatus : undefined,
    paymentMethod: currentTab === 'payments' ? paymentMethod : undefined,
    salesChannel: currentTab === 'payments' ? salesChannel : undefined,
    orderStatus: currentTab === 'payments' ? orderStatus : undefined,
    page: currentTab === 'payments' ? page : 1,
    limit: 15,
  });

  // Fetch refunds list based on active tab
  const refundStatusTab = currentTab === 'refund-history' ? 'HISTORY' : 'PENDING';
  const refundsResult = await queryAdminRefunds({
    statusTab: refundStatusTab,
    search: currentTab !== 'payments' ? search : undefined,
    method: currentTab !== 'payments' ? refundMethod : undefined,
    page: currentTab !== 'payments' ? page : 1,
    limit: 15,
  });

  // Fetch count of pending refunds for badge
  let pendingCount = 0;
  if (refundStatusTab === 'PENDING') {
    pendingCount = refundsResult.total;
  } else {
    const pendingCheck = await queryAdminRefunds({
      statusTab: 'PENDING',
      limit: 1,
    });
    pendingCount = pendingCheck.total;
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PaymentsManagementView
        initialPayments={paymentsResult.payments}
        paymentsTotal={paymentsResult.total}
        paymentsPage={paymentsResult.page}
        paymentsTotalPages={paymentsResult.totalPages}
        initialRefunds={refundsResult.refunds}
        refundsTotal={refundsResult.total}
        refundsPage={refundsResult.page}
        refundsTotalPages={refundsResult.totalPages}
        pendingRefundsCount={pendingCount}
        currentTab={currentTab}
      />
    </div>
  );
}
