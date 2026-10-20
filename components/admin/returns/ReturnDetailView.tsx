'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  acceptAdminReturnAction,
  rejectAdminReturnAction,
} from '@/lib/actions/return-actions';
import { RefundMethod } from '@prisma/client';
import {
  ArrowLeft,
  RotateCcw,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  DollarSign,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface ReturnDetailViewProps {
  returnReq: any;
}

export function ReturnDetailView({ returnReq }: ReturnDetailViewProps) {
  const router = useRouter();

  // Modal States
  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);

  // Accept Form States
  const [refundMethod, setRefundMethod] = useState<RefundMethod>(RefundMethod.BANK_TRANSFER);
  const [acceptNotes, setAcceptNotes] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // Reject Form States
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectNotes, setRejectNotes] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const order = returnReq.order;
  const isPaid = order?.paymentStatus === 'PAID';
  const isDue = order?.paymentStatus === 'DUE';
  const refundAmount = Number(returnReq.totalRefundAmount);

  // Handle Accept Submit
  const handleAcceptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAccepting(true);
    setAcceptError(null);

    const res = await acceptAdminReturnAction({
      returnRequestId: returnReq.id,
      refundMethod: isPaid ? refundMethod : undefined,
      notes: acceptNotes.trim() || undefined,
    });

    setIsAccepting(false);

    if (!res.success) {
      setAcceptError(res.error || 'Failed to accept return.');
      return;
    }

    setIsAcceptModalOpen(false);
    router.refresh();
  };

  // Handle Reject Submit
  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionReason.trim()) {
      setRejectError('Rejection reason is required.');
      return;
    }

    setIsRejecting(true);
    setRejectError(null);

    const res = await rejectAdminReturnAction({
      returnRequestId: returnReq.id,
      rejectionReason: rejectionReason.trim(),
      adminNotes: rejectNotes.trim() || undefined,
    });

    setIsRejecting(false);

    if (!res.success) {
      setRejectError(res.error || 'Failed to reject return.');
      return;
    }

    setIsRejectModalOpen(false);
    router.refresh();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'REQUESTED':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'ACCEPTED':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'REJECTED':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default:
        return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/returns"
            className="p-2 text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono tracking-tight text-white">
                {returnReq.returnNumber}
              </h1>
              <span
                className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadge(
                  returnReq.status
                )}`}
              >
                {returnReq.status}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Created on{' '}
              {new Date(returnReq.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>

        {/* Action Buttons for REQUESTED state */}
        {returnReq.status === 'REQUESTED' && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsRejectModalOpen(true)}
              className="px-4 py-2 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 font-medium rounded-xl text-xs transition-colors"
            >
              Reject Return
            </button>
            <button
              onClick={() => setIsAcceptModalOpen(true)}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition-colors flex items-center gap-2 shadow-lg shadow-emerald-600/10"
            >
              <CheckCircle className="w-4 h-4" />
              Accept Return
            </button>
          </div>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Columns (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Return Request Details Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                Return Details
              </h2>
              <span className="text-xs font-mono text-zinc-400">
                Full Order Return
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-zinc-500 block">Reason</span>
                <span className="text-white font-medium mt-0.5 block">
                  {returnReq.reason.replace(/_/g, ' ')}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block">Return Value</span>
                <span className="text-white font-mono font-bold mt-0.5 block text-sm">
                  ₹{refundAmount.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block">Status</span>
                <span className="text-zinc-300 font-medium mt-0.5 block">
                  {returnReq.status}
                </span>
              </div>
              {returnReq.acceptedAt && (
                <div>
                  <span className="text-zinc-500 block">Accepted At</span>
                  <span className="text-emerald-400 font-mono mt-0.5 block">
                    {new Date(returnReq.acceptedAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
              {returnReq.rejectedAt && (
                <div>
                  <span className="text-zinc-500 block">Rejected At</span>
                  <span className="text-rose-400 font-mono mt-0.5 block">
                    {new Date(returnReq.rejectedAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
            </div>

            {returnReq.reasonDetails && (
              <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-lg text-xs space-y-1">
                <span className="text-zinc-400 font-semibold block">Reason Explanation:</span>
                <p className="text-zinc-300">{returnReq.reasonDetails}</p>
              </div>
            )}

            {returnReq.adminNotes && (
              <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-lg text-xs space-y-1">
                <span className="text-zinc-400 font-semibold block">Admin Notes:</span>
                <p className="text-zinc-300">{returnReq.adminNotes}</p>
              </div>
            )}
          </div>

          {/* Returned Items Table Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-400" />
                Returned Items ({returnReq.items.length})
              </h2>
              <span className="text-xs text-zinc-500 font-mono">
                {returnReq.status === 'ACCEPTED' ? 'Physically Restocked into Inventory' : 'Pending Receipt'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-950/50 text-zinc-400 border-b border-zinc-800 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Product</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Variant</th>
                    <th className="p-3 text-center">Qty</th>
                    <th className="p-3 text-right">Unit Price</th>
                    <th className="p-3 text-right">Net Refund</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {returnReq.items.map((item: any) => (
                    <tr key={item.id}>
                      <td className="p-3 font-medium text-white">
                        {item.variant?.product?.name || 'Product'}
                      </td>
                      <td className="p-3 font-mono text-zinc-400">
                        {item.variant?.sku}
                      </td>
                      <td className="p-3 text-zinc-400">
                        {item.variant?.title}
                      </td>
                      <td className="p-3 text-center font-semibold text-white">
                        {item.quantityRequested}
                      </td>
                      <td className="p-3 text-right font-mono text-zinc-300">
                        ₹{Number(item.unitPrice).toFixed(2)}
                      </td>
                      <td className="p-3 text-right font-mono font-semibold text-white">
                        ₹{Number(item.netRefundAmount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Refund Ledger / Settlement Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Refund Status
            </h2>

            {returnReq.refunds && returnReq.refunds.length > 0 ? (
              <div className="space-y-3">
                {returnReq.refunds.map((ref: any) => (
                  <div
                    key={ref.id}
                    className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400">{ref.refundNumber}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {ref.status}
                        </span>
                      </div>
                      <div className="text-zinc-400 mt-1 flex gap-4">
                        <span>Method: <span className="text-white font-medium">{ref.method}</span></span>
                        <span>Processed: <span className="text-zinc-300 font-mono">{ref.processedAt ? new Date(ref.processedAt).toLocaleDateString('en-IN') : '—'}</span></span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-zinc-500 block text-[10px] uppercase">Refund Disbursed</span>
                      <span className="text-base font-bold font-mono text-white">₹{Number(ref.amount).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : isDue && returnReq.status === 'ACCEPTED' ? (
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-400">
                <p className="font-medium text-zinc-300">No refund is due because the order was unpaid (DUE).</p>
                <p className="mt-1 text-zinc-500">Inventory and revenue adjustments have been recorded without creating a refund.</p>
              </div>
            ) : returnReq.status === 'REJECTED' ? (
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-500">
                Return request was rejected. No refund initiated.
              </div>
            ) : (
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-400">
                Refund will be calculated and processed upon return acceptance.
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 col): Order Summary Snapshot */}
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Original Order
              </h2>
              <Link
                href={`/admin/orders/${order.id}`}
                className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors font-medium"
              >
                View Order
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-zinc-500 block">Order Number</span>
                <span className="font-mono font-semibold text-white text-sm">{order.orderNumber}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Order Date</span>
                <span className="text-zinc-300">
                  {new Date(order.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block">Sales Channel</span>
                <span className="text-zinc-300">{order.salesChannel}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800/60">
                <div>
                  <span className="text-zinc-500 block">Order Status</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-medium">
                    {order.status}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Payment Status</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-medium font-mono">
                    {order.paymentStatus}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800 space-y-2 text-xs">
              <span className="text-zinc-400 font-semibold block">Customer</span>
              <div>
                <p className="font-medium text-white">{order.customerNameSnapshot}</p>
                <p className="font-mono text-zinc-400 text-[11px]">{order.customerMobileSnapshot}</p>
                {order.customerEmailSnapshot && (
                  <p className="text-zinc-500 text-[11px]">{order.customerEmailSnapshot}</p>
                )}
              </div>
              {order.shippingAddressSnapshot && (
                <div className="pt-2">
                  <span className="text-zinc-500 block text-[10px] uppercase">Shipping Address</span>
                  <p className="text-zinc-400 text-[11px] mt-0.5 whitespace-pre-line leading-relaxed">
                    {order.shippingAddressSnapshot}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-zinc-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal:</span>
                <span className="font-mono text-zinc-300">₹{Number(order.subtotal).toFixed(2)}</span>
              </div>
              {Number(order.discountTotal) > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount:</span>
                  <span className="font-mono">-₹{Number(order.discountTotal).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-zinc-400">
                <span>Shipping:</span>
                <span className="font-mono text-zinc-300">₹{Number(order.shippingFee).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-white pt-2 border-t border-zinc-800 text-sm">
                <span>Order Total:</span>
                <span className="font-mono font-bold text-amber-400">₹{Number(order.grandTotal).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * ACCEPT RETURN MODAL
       * ========================================================================= */}
      {isAcceptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                Confirm Accept Return
              </h3>
              <button
                onClick={() => setIsAcceptModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAcceptSubmit} className="p-6 space-y-4 text-xs">
              <p className="text-zinc-300">
                Accepting this return confirms that the returned products have physically arrived at SIFR and passed inspection.
              </p>

              {/* Summary Review */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
                <div className="flex justify-between text-zinc-400">
                  <span>Return Number:</span>
                  <span className="font-mono font-semibold text-amber-400">{returnReq.returnNumber}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Order Number:</span>
                  <span className="font-mono text-white">{order.orderNumber}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Customer:</span>
                  <span className="text-zinc-200">{order.customerNameSnapshot}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Total Items Restocked:</span>
                  <span className="font-semibold text-white">
                    {returnReq.items.reduce((s: number, i: any) => s + i.quantityRequested, 0)} units
                  </span>
                </div>
              </div>

              {/* Refund Calculation & Method */}
              <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-300">Refund Amount:</span>
                  <span className="font-mono font-bold text-base text-white">
                    {isPaid ? `₹${refundAmount.toFixed(2)}` : '₹0.00'}
                  </span>
                </div>

                {isDue ? (
                  <p className="text-zinc-400 text-[11px] bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
                    No refund is due because the order was unpaid.
                  </p>
                ) : (
                  <div>
                    <label className="block text-zinc-400 font-medium mb-1">
                      Refund Method <span className="text-amber-400">*</span>
                    </label>
                    <select
                      value={refundMethod}
                      onChange={(e) => setRefundMethod(e.target.value as RefundMethod)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value={RefundMethod.BANK_TRANSFER}>BANK TRANSFER</option>
                      <option value={RefundMethod.CASH}>CASH</option>
                      <option value={RefundMethod.UPI}>UPI</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-zinc-400 font-medium mb-1">Acceptance Notes (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Notes regarding physical condition or inspection..."
                  value={acceptNotes}
                  onChange={(e) => setAcceptNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {acceptError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{acceptError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAcceptModalOpen(false)}
                  disabled={isAccepting}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors font-medium"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isAccepting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  {isAccepting ? 'Accepting Return...' : 'Accept Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
       * REJECT RETURN MODAL
       * ========================================================================= */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950">
              <h3 className="text-base font-semibold text-rose-400 flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                Reject Return Request
              </h3>
              <button
                onClick={() => setIsRejectModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRejectSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-zinc-300 font-medium mb-1">
                  Rejection Reason <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why this return request is being rejected..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">Internal Notes (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Additional internal audit notes..."
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                />
              </div>

              {rejectError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{rejectError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsRejectModalOpen(false)}
                  disabled={isRejecting}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors font-medium"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isRejecting || !rejectionReason.trim()}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  {isRejecting ? 'Rejecting Return...' : 'Reject Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
