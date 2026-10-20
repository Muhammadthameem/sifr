'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  CreditCard,
  Search,
  Filter,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Receipt,
  RotateCcw,
  Clock,
  ShieldAlert,
  ArrowUpDown,
  Building2,
  DollarSign,
  User,
  Phone,
  Calendar,
  Layers,
  Check,
} from 'lucide-react';
import {
  AdminPaymentListItem,
  AdminRefundListItem,
  AdminPaymentDetailResult,
} from '@/lib/payments/payment-query';
import {
  updateOrderPaymentAdminAction,
  executeManualOfflineRefundPaymentAction,
  getAdminPaymentDetailAction,
} from '@/lib/actions/payment-actions';
import { PaymentStatus, OrderStatus, SalesChannel, RefundStatus, RefundMethod } from '@prisma/client';

interface PaymentsManagementViewProps {
  initialPayments: AdminPaymentListItem[];
  paymentsTotal: number;
  paymentsPage: number;
  paymentsTotalPages: number;
  initialRefunds: AdminRefundListItem[];
  refundsTotal: number;
  refundsPage: number;
  refundsTotalPages: number;
  pendingRefundsCount: number;
  currentTab: 'payments' | 'pending-refunds' | 'refund-history';
}

export function PaymentsManagementView({
  initialPayments,
  paymentsTotal,
  paymentsPage,
  paymentsTotalPages,
  initialRefunds,
  refundsTotal,
  refundsPage,
  refundsTotalPages,
  pendingRefundsCount,
  currentTab: defaultTab,
}: PaymentsManagementViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<'payments' | 'pending-refunds' | 'refund-history'>(defaultTab);

  // Search & Filter state for Payments tab
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('paymentStatus') || 'ALL');
  const [methodFilter, setMethodFilter] = useState(searchParams.get('paymentMethod') || 'ALL');
  const [channelFilter, setChannelFilter] = useState(searchParams.get('salesChannel') || 'ALL');
  const [orderStatusFilter, setOrderStatusFilter] = useState(searchParams.get('orderStatus') || 'ALL');

  // Detail Modal State
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [paymentDetail, setPaymentDetail] = useState<AdminPaymentDetailResult | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Payment Edit State
  const [editMethod, setEditMethod] = useState<'COD' | 'UPI' | 'CASH' | ''>('');
  const [editStatus, setEditStatus] = useState<'DUE' | 'PAID' | ''>('');
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  // Complete Refund Modal State
  const [selectedRefundToComplete, setSelectedRefundToComplete] = useState<AdminRefundListItem | null>(null);
  const [completeReferenceId, setCompleteReferenceId] = useState('');
  const [completeNotes, setCompleteNotes] = useState('');
  const [isCompletingRefund, setIsCompletingRefund] = useState(false);
  const [completeRefundError, setCompleteRefundError] = useState<string | null>(null);

  // Global notice banner
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // Helper to push URL query updates
  const updateUrlParams = (newParams: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v === null || v === 'ALL' || v === '') {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    });
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleTabChange = (tab: 'payments' | 'pending-refunds' | 'refund-history') => {
    setActiveTab(tab);
    updateUrlParams({ tab: tab === 'payments' ? null : tab, page: '1' });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUrlParams({ search: search.trim() || null, page: '1' });
  };

  const handleFilterChange = (key: string, value: string) => {
    updateUrlParams({ [key]: value, page: '1' });
  };

  const handlePageChange = (newPage: number) => {
    updateUrlParams({ page: newPage.toString() });
  };

  // Open Payment Detail
  const openPaymentDetail = async (orderId: string) => {
    setSelectedOrderId(orderId);
    setIsLoadingDetail(true);
    setDetailError(null);
    setUpdateError(null);
    setUpdateSuccess(null);

    try {
      const detail = await getAdminPaymentDetailAction(orderId);
      if (detail) {
        setPaymentDetail(detail);
        setEditMethod((detail.paymentMethod as any) || '');
        setEditStatus((detail.paymentStatus as any) || '');
      } else {
        setDetailError('Payment details not found for this order.');
      }
    } catch (err: any) {
      setDetailError(err.message || 'Failed to load payment detail.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const closePaymentDetail = () => {
    setSelectedOrderId(null);
    setPaymentDetail(null);
    setDetailError(null);
    setUpdateError(null);
    setUpdateSuccess(null);
  };

  // Handle Update Payment Submit
  const handleUpdatePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentDetail) return;

    if (editStatus === 'PAID' && !editMethod) {
      setUpdateError('A valid payment method (COD, UPI, or CASH) is required when marking an order as PAID.');
      return;
    }

    setIsUpdatingPayment(true);
    setUpdateError(null);
    setUpdateSuccess(null);

    try {
      const res = await updateOrderPaymentAdminAction({
        orderId: paymentDetail.orderId,
        paymentMethod: editMethod ? (editMethod as any) : null,
        paymentStatus: editStatus ? (editStatus as any) : undefined,
      });

      if (res.success) {
        setUpdateSuccess('Payment updated successfully!');
        setBannerNotice(`Order #${paymentDetail.orderNumber} payment updated successfully.`);
        // Reload details
        const updated = await getAdminPaymentDetailAction(paymentDetail.orderId);
        if (updated) setPaymentDetail(updated);
        router.refresh();
      } else {
        setUpdateError(res.error || 'Failed to update payment.');
      }
    } catch (err: any) {
      setUpdateError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsUpdatingPayment(false);
    }
  };

  // Handle Complete Offline Refund
  const handleCompleteRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRefundToComplete) return;

    setIsCompletingRefund(true);
    setCompleteRefundError(null);

    try {
      const res = await executeManualOfflineRefundPaymentAction({
        refundId: selectedRefundToComplete.id,
        referenceId: completeReferenceId.trim() || undefined,
        notes: completeNotes.trim() || undefined,
      });

      if (res.success) {
        setSelectedRefundToComplete(null);
        setCompleteReferenceId('');
        setCompleteNotes('');
        setBannerNotice(`Refund ${selectedRefundToComplete.refundNumber} completed successfully!`);
        router.refresh();
      } else {
        setCompleteRefundError(res.error || 'Failed to complete refund.');
      }
    } catch (err: any) {
      setCompleteRefundError(err.message || 'An unexpected error occurred during refund completion.');
    } finally {
      setIsCompletingRefund(false);
    }
  };

  const getPaymentStatusBadge = (status: PaymentStatus | string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            PAID
          </span>
        );
      case 'DUE':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            DUE
          </span>
        );
      case 'PARTIALLY_REFUNDED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
            PARTIALLY REFUNDED
          </span>
        );
      case 'REFUNDED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
            REFUNDED
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30">
            FAILED
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700">
            {status}
          </span>
        );
    }
  };

  const getOrderStatusBadge = (status: OrderStatus | string) => {
    switch (status) {
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            CONFIRMED
          </span>
        );
      case 'DISPATCHED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            DISPATCHED
          </span>
        );
      case 'DELIVERED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            DELIVERED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
            CANCELLED
          </span>
        );
      case 'CONTACTED':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
            {status}
          </span>
        );
    }
  };

  const getChannelBadge = (channel: SalesChannel) => {
    switch (channel) {
      case 'WHATSAPP':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
            WA
          </span>
        );
      case 'DIRECT':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950/60 text-amber-400 border border-amber-800/60">
            DIR
          </span>
        );
      case 'ONLINE':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-blue-950/60 text-blue-400 border border-blue-800/60">
            WEB
          </span>
        );
    }
  };

  const getRefundStatusBadge = (status: RefundStatus | string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            COMPLETED
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            PENDING
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/30">
            PROCESSING
          </span>
        );
      case 'MANUALLY_RESOLVED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/30">
            MANUALLY RESOLVED
          </span>
        );
      case 'FAILED':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Notice */}
      {bannerNotice && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{bannerNotice}</span>
          </div>
          <button onClick={() => setBannerNotice(null)} className="text-neutral-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <CreditCard className="w-7 h-7 text-emerald-400" />
            Payments & Refunds
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Authoritative financial ledger, offline payment administration, and refund reconciliation
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 bg-neutral-900 border border-neutral-800 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => handleTabChange('payments')}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === 'payments'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Payments</span>
            <span className="ml-1 text-[11px] font-mono px-1.5 py-0.2 rounded bg-neutral-950 text-neutral-400">
              {paymentsTotal}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('pending-refunds')}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === 'pending-refunds'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Pending Refunds</span>
            {pendingRefundsCount > 0 && (
              <span className="ml-1 text-[11px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                {pendingRefundsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('refund-history')}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === 'refund-history'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <RotateCcw className="w-4 h-4 text-purple-400" />
            <span>Refund History</span>
            <span className="ml-1 text-[11px] font-mono px-1.5 py-0.2 rounded bg-neutral-950 text-neutral-400">
              {refundsTotal}
            </span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: PAYMENTS LIST */}
      {/* ============================================================== */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3 shadow-sm">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search Form */}
              <form onSubmit={handleSearchSubmit} className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by Order #, Customer Name, or Phone..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-20 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-medium rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                >
                  Search
                </button>
              </form>

              {/* Status & Method Dropdowns */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    handleFilterChange('paymentStatus', e.target.value);
                  }}
                  className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="ALL">Payment Status: All</option>
                  <option value="DUE">DUE</option>
                  <option value="PAID">PAID</option>
                  <option value="PENDING">PENDING</option>
                  <option value="FAILED">FAILED</option>
                  <option value="PARTIALLY_REFUNDED">PARTIALLY REFUNDED</option>
                  <option value="REFUNDED">REFUNDED</option>
                </select>

                <select
                  value={methodFilter}
                  onChange={(e) => {
                    setMethodFilter(e.target.value);
                    handleFilterChange('paymentMethod', e.target.value);
                  }}
                  className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="ALL">Method: All</option>
                  <option value="COD">COD</option>
                  <option value="UPI">UPI</option>
                  <option value="CASH">CASH</option>
                </select>

                <select
                  value={channelFilter}
                  onChange={(e) => {
                    setChannelFilter(e.target.value);
                    handleFilterChange('salesChannel', e.target.value);
                  }}
                  className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="ALL">Channel: All</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="ONLINE">Online</option>
                  <option value="DIRECT">Direct</option>
                </select>

                <select
                  value={orderStatusFilter}
                  onChange={(e) => {
                    setOrderStatusFilter(e.target.value);
                    handleFilterChange('orderStatus', e.target.value);
                  }}
                  className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="ALL">Order Status: All</option>
                  <option value="CONTACTED">CONTACTED</option>
                  <option value="RECEIVED">RECEIVED</option>
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="DISPATCHED">DISPATCHED</option>
                  <option value="DELIVERED">DELIVERED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>

                {(search || statusFilter !== 'ALL' || methodFilter !== 'ALL' || channelFilter !== 'ALL' || orderStatusFilter !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setStatusFilter('ALL');
                      setMethodFilter('ALL');
                      setChannelFilter('ALL');
                      setOrderStatusFilter('ALL');
                      updateUrlParams({
                        search: null,
                        paymentStatus: null,
                        paymentMethod: null,
                        salesChannel: null,
                        orderStatus: null,
                        page: '1',
                      });
                    }}
                    className="p-2 text-xs text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
                    title="Reset all filters"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Payments Table */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-neutral-950/60 text-neutral-400 border-b border-neutral-800 font-mono uppercase tracking-wider">
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-3 text-center">Channel</th>
                    <th className="py-3 px-3 text-center">Order Status</th>
                    <th className="py-3 px-4 text-right">Order Total</th>
                    <th className="py-3 px-4 text-right">Paid / Due</th>
                    <th className="py-3 px-3 text-center">Method</th>
                    <th className="py-3 px-4 text-center">Payment Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {initialPayments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-neutral-500">
                        No payment records found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    initialPayments.map((p) => (
                      <tr key={p.orderId} className="hover:bg-neutral-800/25 transition-colors">
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => openPaymentDetail(p.orderId)}
                            className="font-mono font-semibold text-white hover:text-emerald-400 transition-colors"
                          >
                            {p.orderNumber}
                          </button>
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            {formatDate(p.orderDate)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-white">{p.customerName}</div>
                          <div className="text-[11px] font-mono text-neutral-400 mt-0.5">{p.customerMobile}</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {getChannelBadge(p.salesChannel)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {getOrderStatusBadge(p.orderStatus)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-white">
                          {formatCurrency(p.orderTotal)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {p.paymentStatus === 'PAID' ? (
                            <span className="text-emerald-400">{formatCurrency(p.amountPaid)}</span>
                          ) : p.paymentStatus === 'DUE' ? (
                            <span className="text-amber-400">{formatCurrency(p.remainingDue)} due</span>
                          ) : p.paymentStatus === 'REFUNDED' ? (
                            <span className="text-purple-400">{formatCurrency(p.refundedAmount)} ref</span>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {p.paymentMethod ? (
                            <span className="inline-flex px-2 py-0.5 text-[11px] font-semibold rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                              {p.paymentMethod}
                            </span>
                          ) : (
                            <span className="text-neutral-500 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {getPaymentStatusBadge(p.paymentStatus)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openPaymentDetail(p.orderId)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Manage</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {paymentsTotalPages > 1 && (
              <div className="px-4 py-3 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
                <span>
                  Showing page <strong className="text-white">{paymentsPage}</strong> of{' '}
                  <strong className="text-white">{paymentsTotalPages}</strong> ({paymentsTotal} orders)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePageChange(paymentsPage - 1)}
                    disabled={paymentsPage <= 1}
                    className="p-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePageChange(paymentsPage + 1)}
                    disabled={paymentsPage >= paymentsTotalPages}
                    className="p-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed text-white"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2 & 3: REFUNDS LIST (PENDING / HISTORY) */}
      {/* ============================================================== */}
      {(activeTab === 'pending-refunds' || activeTab === 'refund-history') && (
        <div className="space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-neutral-950/60 text-neutral-400 border-b border-neutral-800 font-mono uppercase tracking-wider">
                    <th className="py-3 px-4">Refund #</th>
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-3 text-center">Source</th>
                    <th className="py-3 px-4 text-right">Refund Amount</th>
                    <th className="py-3 px-3 text-center">Method</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Created / Processed</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {initialRefunds.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-neutral-500">
                        {activeTab === 'pending-refunds'
                          ? 'No pending refunds requiring attention.'
                          : 'No refund history records found.'}
                      </td>
                    </tr>
                  ) : (
                    initialRefunds.map((r) => (
                      <tr key={r.id} className="hover:bg-neutral-800/25 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-white">
                          {r.refundNumber}
                        </td>
                        <td className="py-3 px-4 font-mono text-neutral-300">
                          <Link
                            href={`/admin/orders/${r.orderId}`}
                            className="hover:text-emerald-400 transition-colors inline-flex items-center gap-1"
                          >
                            {r.orderNumber}
                            <ExternalLink className="w-3 h-3 text-neutral-500" />
                          </Link>
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            Status: {r.orderStatus}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-white">{r.customerName}</div>
                          <div className="text-[11px] font-mono text-neutral-400 mt-0.5">{r.customerMobile}</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex px-2 py-0.5 text-[11px] font-mono rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                            {r.source}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-purple-300">
                          {formatCurrency(r.amount)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex px-2 py-0.5 text-[11px] font-semibold rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                            {r.method}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {getRefundStatusBadge(r.status)}
                        </td>
                        <td className="py-3 px-4 text-neutral-400 text-[11px]">
                          <div>Created: {formatDate(r.createdAt)}</div>
                          {r.processedAt && (
                            <div className="text-emerald-400 mt-0.5">Processed: {formatDate(r.processedAt)}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {activeTab === 'pending-refunds' && (r.status === 'PENDING' || r.status === 'REQUIRES_RECONCILIATION') ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRefundToComplete(r);
                                setCompleteReferenceId(r.providerRefundId || '');
                                setCompleteNotes('');
                                setCompleteRefundError(null);
                              }}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                            >
                              Complete Refund
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openPaymentDetail(r.orderId)}
                              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                            >
                              View Order
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination for Refunds */}
            {refundsTotalPages > 1 && (
              <div className="px-4 py-3 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
                <span>
                  Showing page <strong className="text-white">{refundsPage}</strong> of{' '}
                  <strong className="text-white">{refundsTotalPages}</strong> ({refundsTotal} refunds)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePageChange(refundsPage - 1)}
                    disabled={refundsPage <= 1}
                    className="p-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePageChange(refundsPage + 1)}
                    disabled={refundsPage >= refundsTotalPages}
                    className="p-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed text-white"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* DETAIL & PAYMENT UPDATE MODAL */}
      {/* ============================================================== */}
      {selectedOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-start justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-base">Payment & Refund Details</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Order #{paymentDetail?.orderNumber || '...'}
                  </p>
                </div>
              </div>
              <button onClick={closePaymentDetail} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {isLoadingDetail ? (
              <div className="py-12 flex flex-col items-center justify-center text-neutral-400 space-y-2">
                <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                <span className="text-xs">Loading payment records...</span>
              </div>
            ) : detailError ? (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300">
                {detailError}
              </div>
            ) : paymentDetail ? (
              <div className="space-y-5 text-xs">
                {/* Financial Overview Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-xl">
                    <span className="text-neutral-500 block mb-1">Order Grand Total</span>
                    <span className="font-mono font-bold text-white text-sm">
                      {formatCurrency(paymentDetail.grandTotal)}
                    </span>
                  </div>

                  <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-xl">
                    <span className="text-neutral-500 block mb-1">Amount Paid</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {formatCurrency(paymentDetail.amountPaid)}
                    </span>
                  </div>

                  <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-xl">
                    <span className="text-neutral-500 block mb-1">Refunded Amount</span>
                    <span className="font-mono font-bold text-purple-400 text-sm">
                      {formatCurrency(paymentDetail.refundedAmount)}
                    </span>
                  </div>

                  <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-xl">
                    <span className="text-neutral-500 block mb-1">Remaining Due</span>
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      {formatCurrency(paymentDetail.remainingDue)}
                    </span>
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="bg-neutral-950/50 border border-neutral-800/80 rounded-xl p-3.5 space-y-2 text-neutral-300">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div>
                      <span className="text-neutral-500">Customer:</span>{' '}
                      <span className="font-medium text-white">{paymentDetail.customerName}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Phone:</span>{' '}
                      <span className="font-mono text-white">{paymentDetail.customerMobile}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Channel:</span>{' '}
                      <span className="font-mono text-white">{paymentDetail.salesChannel}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Order Status:</span>{' '}
                      <span className="font-medium text-white">{paymentDetail.orderStatus}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Payment Status:</span>{' '}
                      <span className="font-medium text-white">{paymentDetail.paymentStatus}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Payment Method:</span>{' '}
                      <span className="font-medium text-white">{paymentDetail.paymentMethod || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Linked Refunds Section */}
                {paymentDetail.refunds.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-white flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
                      Associated Refunds ({paymentDetail.refunds.length})
                    </h4>
                    <div className="space-y-2 max-h-36 overflow-y-auto">
                      {paymentDetail.refunds.map((ref) => (
                        <div
                          key={ref.id}
                          className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-between text-neutral-300"
                        >
                          <div>
                            <div className="font-mono font-semibold text-white flex items-center gap-2">
                              <span>{ref.refundNumber}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-sans">
                                {ref.source}
                              </span>
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-0.5">
                              Method: {ref.method} • Created: {formatDate(ref.createdAt)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-purple-400">
                              {formatCurrency(ref.amount)}
                            </div>
                            <div>{getRefundStatusBadge(ref.status)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment Update Administration Section */}
                <div className="pt-3 border-t border-neutral-800 space-y-3">
                  <h4 className="font-semibold text-white flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    Update Payment Method & Status
                  </h4>

                  <form onSubmit={handleUpdatePaymentSubmit} className="space-y-3 bg-neutral-950/70 p-3.5 rounded-xl border border-neutral-800">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-neutral-400 text-[11px] mb-1 font-medium">
                          Payment Method
                        </label>
                        <select
                          value={editMethod}
                          onChange={(e) => setEditMethod(e.target.value as any)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="">Select Method (None)</option>
                          <option value="COD">COD</option>
                          <option value="UPI">UPI</option>
                          <option value="CASH">CASH</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-neutral-400 text-[11px] mb-1 font-medium">
                          Payment Status
                        </label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as any)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="DUE">DUE</option>
                          <option value="PAID">PAID</option>
                        </select>
                      </div>
                    </div>

                    {updateError && (
                      <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
                        <span>{updateError}</span>
                      </div>
                    )}

                    {updateSuccess && (
                      <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                        <span>{updateSuccess}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={isUpdatingPayment}
                        className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-emerald-950/40"
                      >
                        {isUpdatingPayment ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            <span>Updating...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Save Payment Changes</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Footer Modal Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
                  <Link
                    href={`/admin/orders/${paymentDetail.orderId}`}
                    className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition-colors"
                  >
                    <span>Go to Order Details</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>

                  <button
                    type="button"
                    onClick={closePaymentDetail}
                    className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* COMPLETE OFFLINE REFUND MODAL */}
      {/* ============================================================== */}
      {selectedRefundToComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-base">Complete Offline Refund</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {selectedRefundToComplete.refundNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRefundToComplete(null)}
                disabled={isCompletingRefund}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCompleteRefundSubmit} className="space-y-4 text-xs">
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2 text-neutral-300">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Order:</span>
                  <span className="font-mono font-medium text-white">{selectedRefundToComplete.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Customer:</span>
                  <span className="font-medium text-white">{selectedRefundToComplete.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Refund Method:</span>
                  <span className="font-semibold text-emerald-400">{selectedRefundToComplete.method}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-neutral-800/80">
                  <span className="text-neutral-500">System-Calculated Amount:</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {formatCurrency(selectedRefundToComplete.amount)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-neutral-400 text-[11px] mb-1 font-medium">
                  Reference ID / UTR / Note (Optional)
                </label>
                <input
                  type="text"
                  value={completeReferenceId}
                  onChange={(e) => setCompleteReferenceId(e.target.value)}
                  placeholder="e.g. UPI-98371923 or Bank Ref..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-neutral-400 text-[11px] mb-1 font-medium">
                  Resolution Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={completeNotes}
                  onChange={(e) => setCompleteNotes(e.target.value)}
                  placeholder="Optional audit notes regarding this refund settlement..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {completeRefundError && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{completeRefundError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setSelectedRefundToComplete(null)}
                  disabled={isCompletingRefund}
                  className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCompletingRefund}
                  className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isCompletingRefund ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Completing...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm Settlement</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
