'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  deleteContactedOrderAction,
  confirmWhatsAppOrderSaleAction,
  dispatchOrderAction,
  markOrderDeliveredAction,
  cancelConfirmedOrderAction,
  getConfirmedOrderWhatsAppCommunicationAction,
  getDispatchedOrderWhatsAppCommunicationAction,
} from '@/lib/actions/order-actions';
import { AdminOrderDetailResult } from '@/lib/ordering/order-query';
import {
  ArrowLeft,
  ShoppingBag,
  User,
  MapPin,
  Receipt,
  CreditCard,
  Truck,
  History,
  Trash2,
  AlertTriangle,
  ExternalLink,
  MessageCircle,
  Copy,
  Check,
  Package,
  Calendar,
  Clock,
  Tag,
  Phone,
  Mail,
  X,
  ShieldAlert,
  CheckCircle2,
  Layers,
  AlertCircle,
  XCircle,
  FileText,
  Download,
} from 'lucide-react';

interface OrderDetailViewProps {
  order: AdminOrderDetailResult;
}

export function OrderDetailView({ order }: OrderDetailViewProps) {
  const router = useRouter();

  // Deletion modal state for CONTACTED orders
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Confirm Sale modal state for CONTACTED WhatsApp orders
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'UPI' | 'CASH' | ''>('');
  const [paymentStatus, setPaymentStatus] = useState<'DUE' | 'PAID' | ''>('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccessNotice, setConfirmSuccessNotice] = useState<string | null>(null);

  // Dispatch Order modal state for CONFIRMED orders (Phase D)
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [dispatchCourierName, setDispatchCourierName] = useState('');
  const [dispatchTrackingId, setDispatchTrackingId] = useState('');
  const [dispatchTrackingUrl, setDispatchTrackingUrl] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchSuccessNotice, setDispatchSuccessNotice] = useState<string | null>(null);

  // Mark Delivered modal state for DISPATCHED orders (Phase E)
  const [isDeliverModalOpen, setIsDeliverModalOpen] = useState(false);
  const [isDelivering, setIsDelivering] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [deliverSuccessNotice, setDeliverSuccessNotice] = useState<string | null>(null);

  // Cancel Order modal state for CONFIRMED orders (Phase F)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccessNotice, setCancelSuccessNotice] = useState<string | null>(null);
  const [cancelRefundMethod, setCancelRefundMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'UPI' | ''>('CASH');
  const [cancelNotes, setCancelNotes] = useState('');

  // WhatsApp Bill modal state for CONFIRMED orders
  const [isSendBillModalOpen, setIsSendBillModalOpen] = useState(false);
  const [billWhatsAppMessage, setBillWhatsAppMessage] = useState('');
  const [billWhatsAppUrl, setBillWhatsAppUrl] = useState('');
  const [isLoadingBillWhatsApp, setIsLoadingBillWhatsApp] = useState(false);
  const [billWhatsAppError, setBillWhatsAppError] = useState<string | null>(null);

  // WhatsApp Dispatch Update modal state for DISPATCHED orders
  const [isDispatchWhatsAppModalOpen, setIsDispatchWhatsAppModalOpen] = useState(false);
  const [dispatchWhatsAppMessage, setDispatchWhatsAppMessage] = useState('');
  const [dispatchWhatsAppUrl, setDispatchWhatsAppUrl] = useState('');
  const [isLoadingDispatchWhatsApp, setIsLoadingDispatchWhatsApp] = useState(false);
  const [dispatchWhatsAppError, setDispatchWhatsAppError] = useState<string | null>(null);

  const handleOpenSendBillModal = async () => {
    setIsSendBillModalOpen(true);
    setIsLoadingBillWhatsApp(true);
    setBillWhatsAppError(null);
    try {
      const res = await getConfirmedOrderWhatsAppCommunicationAction(order.id);
      if (res.success && res.data) {
        setBillWhatsAppMessage(res.data.message);
        setBillWhatsAppUrl(res.data.url);
      } else {
        setBillWhatsAppError(res.error || 'Failed to prepare WhatsApp message');
      }
    } catch (err: any) {
      setBillWhatsAppError(err.message || 'Error preparing WhatsApp message');
    } finally {
      setIsLoadingBillWhatsApp(false);
    }
  };

  const handleOpenDispatchWhatsAppModal = async () => {
    setIsDispatchWhatsAppModalOpen(true);
    setIsLoadingDispatchWhatsApp(true);
    setDispatchWhatsAppError(null);
    try {
      const res = await getDispatchedOrderWhatsAppCommunicationAction(order.id);
      if (res.success && res.data) {
        setDispatchWhatsAppMessage(res.data.message);
        setDispatchWhatsAppUrl(res.data.url);
      } else {
        setDispatchWhatsAppError(res.error || 'Failed to prepare dispatch update message');
      }
    } catch (err: any) {
      setDispatchWhatsAppError(err.message || 'Error preparing dispatch update message');
    } finally {
      setIsLoadingDispatchWhatsApp(false);
    }
  };

  // Copied toast helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDeleteContacted = async () => {
    if (order.status !== 'CONTACTED') return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await deleteContactedOrderAction(order.id);
      if (res.success) {
        setIsDeleteModalOpen(false);
        router.push('/admin/orders');
        router.refresh();
      } else {
        setDeleteError(res.error || 'Failed to delete contacted order request');
      }
    } catch (err: any) {
      setDeleteError(err.message || 'An error occurred during deletion');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentMethod) {
      setConfirmError('Please select a Payment Method (COD, UPI, or CASH).');
      return;
    }
    if (!paymentStatus) {
      setConfirmError('Please select a Payment Status (DUE or PAID).');
      return;
    }

    setIsConfirming(true);
    setConfirmError(null);

    try {
      const res = await confirmWhatsAppOrderSaleAction({
        orderId: order.id,
        paymentMethod: paymentMethod as any,
        paymentStatus: paymentStatus as any,
      });

      if (res.success) {
        setIsConfirmModalOpen(false);
        setConfirmSuccessNotice('Sale confirmed successfully! Inventory has been deducted.');
        router.refresh();
      } else {
        setConfirmError(res.error || 'Failed to confirm sale.');
      }
    } catch (err: any) {
      setConfirmError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDispatchOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCourier = dispatchCourierName.trim();
    const trimmedTracking = dispatchTrackingId.trim();

    if (!trimmedCourier) {
      setDispatchError('Courier / Delivery Partner name is required.');
      return;
    }
    if (!trimmedTracking) {
      setDispatchError('Tracking ID is required.');
      return;
    }

    setIsDispatching(true);
    setDispatchError(null);

    try {
      const res = await dispatchOrderAction({
        orderId: order.id,
        courierName: trimmedCourier,
        trackingId: trimmedTracking,
        trackingUrl: dispatchTrackingUrl.trim() || undefined,
      });

      if (res.success) {
        setIsDispatchModalOpen(false);
        setDispatchSuccessNotice(
          `Order #${order.orderNumber} dispatched successfully via ${trimmedCourier} (${trimmedTracking})!`
        );
        router.refresh();
      } else {
        setDispatchError(res.error || 'Failed to dispatch order.');
      }
    } catch (err: any) {
      setDispatchError(err.message || 'An unexpected error occurred during dispatch.');
    } finally {
      setIsDispatching(false);
    }
  };

  const handleMarkDeliveredSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (order.status !== 'DISPATCHED') {
      setDeliverError('Only DISPATCHED orders can be marked as delivered.');
      return;
    }

    setIsDelivering(true);
    setDeliverError(null);

    try {
      const res = await markOrderDeliveredAction(order.id);

      if (res.success) {
        setIsDeliverModalOpen(false);
        setDeliverSuccessNotice(
          `Order #${order.orderNumber} marked as DELIVERED successfully!`
        );
        router.refresh();
      } else {
        setDeliverError(res.error || 'Failed to mark order as delivered.');
      }
    } catch (err: any) {
      setDeliverError(err.message || 'An unexpected error occurred while marking delivered.');
    } finally {
      setIsDelivering(false);
    }
  };

  const handleCancelOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (order.status !== 'CONFIRMED') {
      setCancelError('Only CONFIRMED orders can be cancelled.');
      return;
    }

    if (order.paymentStatus === 'PAID' && !cancelRefundMethod) {
      setCancelError('Select a refund method before cancelling this paid order.');
      return;
    }

    setIsCancelling(true);
    setCancelError(null);

    try {
      const res = await cancelConfirmedOrderAction({
        orderId: order.id,
        refundMethod: order.paymentStatus === 'PAID' ? (cancelRefundMethod as any) : undefined,
        notes: cancelNotes.trim() || undefined,
      });

      if (res.success) {
        setIsCancelModalOpen(false);
        setCancelSuccessNotice(
          `Order #${order.orderNumber} cancelled successfully! Inventory restored.`
        );
        router.refresh();
      } else {
        setCancelError(res.error || 'Failed to cancel order.');
      }
    } catch (err: any) {
      setCancelError(err.message || 'An unexpected error occurred during cancellation.');
    } finally {
      setIsCancelling(false);
    }
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

  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getChannelBadge = (channel: string) => {
    switch (channel) {
      case 'WHATSAPP':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <MessageCircle className="w-3.5 h-3.5" />
            WhatsApp
          </span>
        );
      case 'ONLINE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
            Online Store
          </span>
        );
      case 'DIRECT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
            Direct Sale
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700">
            {channel}
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONTACTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            CONTACTED (Request)
          </span>
        );
      case 'RECEIVED':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30">
            RECEIVED
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            CONFIRMED
          </span>
        );
      case 'DISPATCHED':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30">
            DISPATCHED
          </span>
        );
      case 'DELIVERED':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            DELIVERED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30">
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700">
            {status}
          </span>
        );
    }
  };

  const getPaymentStatusBadge = (status: string) => {
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

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Success Notification Banner */}
      {confirmSuccessNotice && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{confirmSuccessNotice}</span>
          </div>
          <button
            onClick={() => setConfirmSuccessNotice(null)}
            className="text-neutral-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {dispatchSuccessNotice && (
        <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-sm text-indigo-300 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Truck className="w-5 h-5 text-indigo-400 shrink-0" />
            <span>{dispatchSuccessNotice}</span>
          </div>
          <button
            onClick={() => setDispatchSuccessNotice(null)}
            className="text-neutral-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {deliverSuccessNotice && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{deliverSuccessNotice}</span>
          </div>
          <button
            onClick={() => setDeliverSuccessNotice(null)}
            className="text-neutral-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {cancelSuccessNotice && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-red-400 shrink-0" />
            <span>{cancelSuccessNotice}</span>
          </div>
          <button
            onClick={() => setCancelSuccessNotice(null)}
            className="text-neutral-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Header & Navigation */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Orders</span>
          </Link>

          {/* Quick Copy Link */}
          <button
            onClick={() => copyToClipboard(order.orderNumber, 'orderNum')}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            {copiedKey === 'orderNum' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Order Number Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Order #</span>
              </>
            )}
          </button>
        </div>

        {/* Title and Badge Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white">
                {order.orderNumber}
              </h1>
              {getChannelBadge(order.salesChannel)}
            </div>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />
              Placed on {formatDate(order.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {getStatusBadge(order.status)}
            {getPaymentStatusBadge(order.paymentStatus)}
            {order.paymentMethod && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-800 text-neutral-300 border border-neutral-700">
                Method: {order.paymentMethod}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Responsive 2-Column on LG, 1-Column on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (Main): Items, Financials, Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items Card */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-4 h-4 text-neutral-400" />
                <h2 className="font-semibold text-white text-base">Order Items</h2>
                <span className="text-xs text-neutral-500 font-mono">({order.items.length})</span>
              </div>
              <span className="text-xs text-neutral-400">Read-only Snapshot</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-neutral-950/50 text-neutral-400 text-xs uppercase tracking-wider border-b border-neutral-800">
                    <th className="py-3 px-5">Item</th>
                    <th className="py-3 px-4 text-center">SKU</th>
                    <th className="py-3 px-4 text-right">Unit Price</th>
                    <th className="py-3 px-4 text-center">Qty</th>
                    <th className="py-3 px-5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {order.items.map((item) => (
                    <tr key={item.id} className="hover:bg-neutral-800/20 transition-colors">
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-14 bg-neutral-800 rounded flex items-center justify-center overflow-hidden shrink-0 border border-neutral-700">
                            {item.productImageUrl ? (
                              <img
                                src={item.productImageUrl}
                                alt={item.productNameSnapshot}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="w-5 h-5 text-neutral-500" />
                            )}
                          </div>
                          <div>
                            {item.productSlug ? (
                              <Link
                                href={`/products/${item.productSlug}`}
                                target="_blank"
                                className="font-medium text-white hover:text-emerald-400 transition-colors inline-flex items-center gap-1 group"
                              >
                                {item.productNameSnapshot}
                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </Link>
                            ) : (
                              <p className="font-medium text-white">{item.productNameSnapshot}</p>
                            )}
                            {item.variantTitleSnapshot && (
                              <p className="text-xs text-neutral-400 mt-0.5">
                                Variant: {item.variantTitleSnapshot}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="font-mono text-xs text-neutral-300 bg-neutral-800/80 px-2 py-0.5 rounded border border-neutral-700/60">
                          {item.skuSnapshot}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-neutral-300">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-medium text-white">
                        {item.quantity}
                      </td>
                      <td className="py-4 px-5 text-right font-mono font-semibold text-white">
                        {formatCurrency(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial Summary Card */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-neutral-800">
              <Receipt className="w-4 h-4 text-neutral-400" />
              <h2 className="font-semibold text-white text-base">Financial Summary</h2>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between text-neutral-300">
                <span>Subtotal</span>
                <span className="font-mono">{formatCurrency(order.subtotal)}</span>
              </div>

              <div className="flex justify-between text-neutral-300">
                <span>Shipping Fee</span>
                <span className="font-mono">
                  {order.shippingFee > 0 ? formatCurrency(order.shippingFee) : 'Free / ₹0.00'}
                </span>
              </div>

              {order.discountTotal > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" />
                    Discount {order.couponCodeSnapshot ? `(${order.couponCodeSnapshot})` : ''}
                  </span>
                  <span className="font-mono">-{formatCurrency(order.discountTotal)}</span>
                </div>
              )}

              {order.taxTotal > 0 && (
                <div className="flex justify-between text-neutral-300">
                  <span>Taxes</span>
                  <span className="font-mono">{formatCurrency(order.taxTotal)}</span>
                </div>
              )}

              <div className="pt-3 border-t border-neutral-800 flex justify-between items-baseline">
                <span className="font-semibold text-white text-base">Grand Total</span>
                <span className="font-bold text-xl font-mono text-white">
                  {formatCurrency(order.grandTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Order Timeline / History Card */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-neutral-800">
              <History className="w-4 h-4 text-neutral-400" />
              <h2 className="font-semibold text-white text-base">Order Timeline</h2>
            </div>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-800">
              {/* Initial Creation Event */}
              <div className="relative">
                <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-neutral-900" />
                <div className="text-sm">
                  <p className="font-medium text-white">
                    Order Placed via {order.salesChannel}
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {formatDate(order.createdAt)}
                  </p>
                </div>
              </div>

              {/* Status Transitions */}
              {order.statusTransitions.map((t) => (
                <div key={t.id} className="relative">
                  <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-neutral-900" />
                  <div className="text-sm">
                    <p className="font-medium text-white">
                      Status transitioned from <span className="font-mono text-xs text-neutral-400">{t.fromStatus}</span> to <span className="font-mono text-xs text-white">{t.toStatus}</span>
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {formatDate(t.createdAt)}
                    </p>
                    {t.notes && (
                      <p className="text-xs text-neutral-300 mt-1 bg-neutral-950 p-2 rounded border border-neutral-800">
                        {t.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column (Sidebar): Status/Action, Customer, Shipping, Payment */}
        <div className="space-y-6">
          {/* Status & Actions Card */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold text-white text-sm uppercase tracking-wider text-neutral-400">
              Order Lifecycle & Actions
            </h3>

            {/* Informational State Banner */}
            {order.status === 'CONTACTED' && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3.5 space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-200">
                    <p className="font-semibold text-amber-300">Customer Order Request</p>
                    <p className="mt-0.5 text-amber-200/80 leading-relaxed">
                      This order was captured via WhatsApp. Inventory is NOT deducted and this is not counted as a sale until confirmed.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {order.status === 'CONFIRMED' && (
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3.5 space-y-1 text-xs text-indigo-300">
                <p className="font-semibold text-indigo-200">Order Confirmed</p>
                <p className="text-indigo-300/80">Inventory has been deducted. Order is queued for courier dispatch.</p>
              </div>
            )}

            {order.status === 'DISPATCHED' && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3.5 space-y-1 text-xs text-orange-300">
                <p className="font-semibold text-orange-200">Order Dispatched</p>
                <p className="text-orange-300/80">Package handed over to courier and in transit.</p>
              </div>
            )}

            {order.status === 'DELIVERED' && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3.5 space-y-1 text-xs text-emerald-300">
                <p className="font-semibold text-emerald-200">Delivered</p>
                <p className="text-emerald-300/80">Customer received the shipment.</p>
              </div>
            )}

            {order.status === 'CANCELLED' && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3.5 space-y-1 text-xs text-red-300">
                <p className="font-semibold text-red-200">Order Cancelled</p>
                <p className="text-red-300/80">This order is cancelled and closed permanently.</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 space-y-2.5">
              {/* CONTACTED: Confirm Sale CTA & Delete Request Action */}
              {order.status === 'CONTACTED' && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('');
                      setPaymentStatus('');
                      setConfirmError(null);
                      setIsConfirmModalOpen(true);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/40 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirm Sale
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Order Request
                  </button>
                </div>
              )}

              {/* CONFIRMED: Dispatch Order Action (Phase D), Generate Bill, Send Bill on WhatsApp, Cancel Order (Phase F) */}
              {order.status === 'CONFIRMED' && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDispatchCourierName('');
                      setDispatchTrackingId('');
                      setDispatchTrackingUrl('');
                      setDispatchError(null);
                      setIsDispatchModalOpen(true);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950/40 transition-colors"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    Dispatch Order
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => window.open(`/api/admin/orders/${order.id}/bill`, '_blank')}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors"
                      title="Generate and view SIFR Bill PDF"
                    >
                      <FileText className="w-3.5 h-3.5 text-neutral-400" />
                      Generate Bill
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenSendBillModal}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
                      title="Send Bill to customer via WhatsApp"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Send Bill
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCancelRefundMethod(order.paymentStatus === 'PAID' ? 'CASH' : '');
                      setCancelNotes('');
                      setCancelError(null);
                      setIsCancelModalOpen(true);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancel Order
                  </button>
                </div>
              )}

              {/* DISPATCHED: Mark Delivered Action (Phase E) & Send Dispatch Update on WhatsApp */}
              {order.status === 'DISPATCHED' && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeliverError(null);
                      setIsDeliverModalOpen(true);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/40 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Delivered
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenDispatchWhatsAppModal}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-white border border-emerald-600/40 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Send Dispatch Update on WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={() => window.open(`/api/admin/orders/${order.id}/bill`, '_blank')}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-800 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    View Bill (PDF)
                  </button>
                </div>
              )}

              {/* DELIVERED: Historical Communication Actions */}
              {order.status === 'DELIVERED' && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleOpenDispatchWhatsAppModal}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                    Send Dispatch Update on WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={() => window.open(`/api/admin/orders/${order.id}/bill`, '_blank')}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-neutral-400" />
                    View Bill (PDF)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Customer Snapshot Card */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-neutral-400" />
                <h3 className="font-semibold text-white text-base">Customer Details</h3>
              </div>
              <span className="text-[11px] text-neutral-500 font-mono">Snapshot</span>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-neutral-400">Name</p>
                <p className="font-medium text-white">{order.customerNameSnapshot}</p>
              </div>

              <div>
                <p className="text-xs text-neutral-400">Mobile Number</p>
                <div className="flex items-center justify-between mt-0.5">
                  <a
                    href={`tel:${order.customerMobileSnapshot}`}
                    className="font-mono text-emerald-400 hover:underline flex items-center gap-1.5"
                  >
                    <Phone className="w-3 h-3" />
                    {order.customerMobileSnapshot}
                  </a>
                  <button
                    onClick={() => copyToClipboard(order.customerMobileSnapshot, 'mobile')}
                    className="text-xs text-neutral-400 hover:text-white"
                  >
                    {copiedKey === 'mobile' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {order.customerEmailSnapshot && (
                <div>
                  <p className="text-xs text-neutral-400">Email</p>
                  <a
                    href={`mailto:${order.customerEmailSnapshot}`}
                    className="text-neutral-300 hover:underline flex items-center gap-1.5 mt-0.5"
                  >
                    <Mail className="w-3 h-3 text-neutral-500" />
                    {order.customerEmailSnapshot}
                  </a>
                </div>
              )}

              <div className="pt-2 border-t border-neutral-800">
                <div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Delivery Address</span>
                </div>
                <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-1 text-xs">
                  <p className="text-neutral-200">{order.customerAddress.address}</p>
                  <p className="text-neutral-400">
                    {order.customerAddress.city}, {order.customerAddress.state} —{' '}
                    <span className="font-mono text-neutral-300">
                      {order.customerAddress.pincode}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Shipping Information Card */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-neutral-800">
              <Truck className="w-4 h-4 text-neutral-400" />
              <h3 className="font-semibold text-white text-base">Shipping & Tracking</h3>
            </div>

            {order.shipment ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-neutral-400">Courier Partner</p>
                  <p className="font-medium text-white">{order.shipment.courierName}</p>
                </div>

                <div>
                  <p className="text-xs text-neutral-400">Tracking Number</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="font-mono text-white bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">
                      {order.shipment.trackingId}
                    </span>
                    <button
                      onClick={() => copyToClipboard(order.shipment!.trackingId, 'tracking')}
                      className="text-xs text-neutral-400 hover:text-white"
                    >
                      {copiedKey === 'tracking' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {order.shipment.trackingUrl && (
                  <div>
                    <a
                      href={order.shipment.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:underline"
                    >
                      Track Package Online
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                <div className="pt-2 border-t border-neutral-800 text-xs text-neutral-400 space-y-1">
                  <p>Status: <span className="text-white font-medium">{order.shipment.status}</span></p>
                  <p>Dispatched: {formatDate(order.shipment.dispatchedAt)}</p>
                  {order.shipment.deliveredAt && (
                    <p className="text-emerald-400 font-medium">Delivered: {formatDate(order.shipment.deliveredAt)}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-neutral-500 text-xs space-y-1">
                <Truck className="w-8 h-8 mx-auto text-neutral-600 mb-2 stroke-[1.5]" />
                <p className="font-medium text-neutral-400">No shipment created yet.</p>
                <p>Courier tracking details will appear once the order is dispatched.</p>
              </div>
            )}
          </div>

          {/* Payment Information Card (Display Only) */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-neutral-400" />
                <h3 className="font-semibold text-white text-base">Payment Details</h3>
              </div>
              <span className="text-[11px] text-neutral-500">Display Only</span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-xs text-neutral-400">Status</span>
                {getPaymentStatusBadge(order.paymentStatus)}
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs text-neutral-400">Method</span>
                <span className="text-xs font-mono text-white">
                  {order.paymentMethod || '— (Unspecified)'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs text-neutral-400">Payable Amount</span>
                <span className="font-mono font-medium text-white">
                  {formatCurrency(order.grandTotal)}
                </span>
              </div>

              {/* Historical Payment Attempts */}
              {order.payments && order.payments.length > 0 && (
                <div className="pt-2 border-t border-neutral-800 space-y-2">
                  <p className="text-xs font-semibold text-neutral-400">Transactions ({order.payments.length})</p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {order.payments.map((p) => (
                      <div key={p.id} className="bg-neutral-950 p-2 rounded border border-neutral-800 text-xs flex justify-between items-center">
                        <div>
                          <p className="font-mono text-white">{p.paymentNumber}</p>
                          <p className="text-[10px] text-neutral-500">{p.provider} • {formatDate(p.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-medium text-white">{formatCurrency(p.amount)}</p>
                          <p className="text-[10px] text-emerald-400">{p.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Historical Refunds */}
              {order.refunds && order.refunds.length > 0 && (
                <div className="pt-2 border-t border-neutral-800 space-y-2">
                  <p className="text-xs font-semibold text-neutral-400">Refunds ({order.refunds.length})</p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {order.refunds.map((r) => (
                      <div key={r.id} className="bg-neutral-950 p-2 rounded border border-neutral-800 text-xs flex justify-between items-center">
                        <div>
                          <p className="font-mono text-white">{r.refundNumber}</p>
                          <p className="text-[10px] text-neutral-500">{r.method} • {formatDate(r.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-medium text-purple-400">-{formatCurrency(r.amount)}</p>
                          <p className="text-[10px] text-purple-300">{r.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(!order.payments || order.payments.length === 0) && (!order.refunds || order.refunds.length === 0) && (
                <p className="text-[11px] text-neutral-500 pt-2 border-t border-neutral-800">
                  No electronic payment gateway transactions. Payments are handled via direct customer interaction.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CONFIRM SALE MODAL (Phase C) */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-lg">Confirm Sale</h3>
                  <p className="text-xs text-neutral-400 mt-0.5 font-mono">
                    Order #{order.orderNumber} • Placed {formatDate(order.createdAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => !isConfirming && setIsConfirmModalOpen(false)}
                disabled={isConfirming}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmSaleSubmit} className="space-y-5">
              {/* 1. Read-Only Customer & Order Info */}
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80">
                  <span className="font-semibold text-neutral-300 uppercase tracking-wider text-[11px]">
                    Customer & Destination Snapshot
                  </span>
                  <span className="font-mono text-neutral-500">Read-Only</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-neutral-300">
                  <div>
                    <span className="text-neutral-500">Customer:</span>{' '}
                    <span className="font-medium text-white">{order.customerNameSnapshot}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Phone:</span>{' '}
                    <span className="font-mono text-emerald-400">{order.customerMobileSnapshot}</span>
                  </div>
                  {order.customerEmailSnapshot && (
                    <div className="sm:col-span-2">
                      <span className="text-neutral-500">Email:</span>{' '}
                      <span className="text-white">{order.customerEmailSnapshot}</span>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <span className="text-neutral-500">Address:</span>{' '}
                    <span className="text-neutral-200">
                      {order.customerAddress.address}, {order.customerAddress.city},{' '}
                      {order.customerAddress.state} — {order.customerAddress.pincode}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Read-Only Order Items & Financials */}
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80">
                  <span className="font-semibold text-neutral-300 uppercase tracking-wider text-[11px]">
                    Order Items ({order.items.length})
                  </span>
                  <span className="font-mono text-white font-semibold">
                    Grand Total: {formatCurrency(order.grandTotal)}
                  </span>
                </div>

                <div className="space-y-2 divide-y divide-neutral-900">
                  {order.items.map((i) => (
                    <div key={i.id} className="pt-2 first:pt-0 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded bg-neutral-900 border border-neutral-800 overflow-hidden shrink-0 flex items-center justify-center">
                          {i.productImageUrl ? (
                            <img src={i.productImageUrl} alt={i.productNameSnapshot} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-4 h-4 text-neutral-600" />
                          )}
                        </div>
                        <div>
                          <p className="text-white font-medium">{i.productNameSnapshot}</p>
                          <p className="text-[11px] text-neutral-500 font-mono">
                            {i.skuSnapshot} {i.variantTitleSnapshot ? `• ${i.variantTitleSnapshot}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <p className="text-white">{i.quantity} × {formatCurrency(i.unitPrice)}</p>
                        <p className="text-neutral-400 font-semibold">{formatCurrency(i.lineTotal)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-neutral-800 flex justify-between text-neutral-400 text-[11px]">
                  <span>Subtotal: {formatCurrency(order.subtotal)}</span>
                  <span>Shipping: {formatCurrency(order.shippingFee)}</span>
                  {order.discountTotal > 0 && (
                    <span className="text-emerald-400">Discount: -{formatCurrency(order.discountTotal)}</span>
                  )}
                </div>
              </div>

              {/* 3. Informational Stock Availability Check */}
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-neutral-400" />
                    <span className="font-semibold text-neutral-300 uppercase tracking-wider text-[11px]">
                      Stock Availability Check
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-500">Authoritative server recheck on submission</span>
                </div>

                <div className="space-y-1.5">
                  {order.items.map((i) => {
                    const isSufficient = i.currentStock >= i.quantity;
                    return (
                      <div
                        key={i.id}
                        className="flex items-center justify-between p-2 rounded bg-neutral-900 border border-neutral-800 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{i.productNameSnapshot}</span>
                          <span className="text-neutral-500 text-[11px] font-mono">({i.skuSnapshot})</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-neutral-400">
                            Required: <strong className="text-white">{i.quantity}</strong>
                          </span>
                          <span className="text-neutral-400">
                            In Stock: <strong className="text-white">{i.currentStock}</strong>
                          </span>
                          {isSufficient ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Available
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                              Insufficient stock
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. Payment Selection (Required) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Payment Method */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-200">
                    Payment Method <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    required
                    disabled={isConfirming}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="" disabled>Select Payment Method</option>
                    <option value="COD">COD (Cash on Delivery)</option>
                    <option value="UPI">UPI (Unified Payments Interface)</option>
                    <option value="CASH">CASH (Physical Cash)</option>
                  </select>
                </div>

                {/* Payment Status */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-200">
                    Payment Status <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as any)}
                    required
                    disabled={isConfirming}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="" disabled>Select Payment Status</option>
                    <option value="DUE">DUE (Payment Pending / Collect Later)</option>
                    <option value="PAID">PAID (Payment Received in Full)</option>
                  </select>
                </div>
              </div>

              {/* 5. Warning Callout */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 space-y-1.5 text-xs text-amber-200">
                <div className="flex items-center gap-2 font-semibold text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Important Commercial & Inventory Warning</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-amber-200/90 text-[11px] leading-relaxed">
                  <li>Physical inventory stock will be deducted immediately.</li>
                  <li>Oldest FIFO acquisition layers will be consumed to calculate COGS.</li>
                  <li>Permanent SALE_OUT ledger movements will be created.</li>
                  <li>Coupon usage limits will be consumed (if a coupon was applied).</li>
                  <li>Order status will officially transition from CONTACTED to CONFIRMED.</li>
                </ul>
              </div>

              {/* Error Banner */}
              {confirmError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  <span className="leading-relaxed">{confirmError}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsConfirmModalOpen(false)}
                  disabled={isConfirming}
                  className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isConfirming || !paymentMethod || !paymentStatus}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-950/40"
                >
                  {isConfirming ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Confirming Sale...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm Sale</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DISPATCH ORDER MODAL (Phase D) */}
      {isDispatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-lg">Dispatch Order</h3>
                  <p className="text-xs text-neutral-400 mt-0.5 font-mono">
                    Order #{order.orderNumber} • Placed {formatDate(order.createdAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => !isDispatching && setIsDispatchModalOpen(false)}
                disabled={isDispatching}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDispatchOrderSubmit} className="space-y-5">
              {/* 1. Read-Only Order & Customer Summary */}
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80">
                  <span className="font-semibold text-neutral-300 uppercase tracking-wider text-[11px]">
                    Read-Only Order Summary
                  </span>
                  <span className="font-mono text-neutral-500">Logistics Reference</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-neutral-300">
                  <div>
                    <span className="text-neutral-500">Order Number:</span>{' '}
                    <span className="font-mono font-medium text-white">{order.orderNumber}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Order Date:</span>{' '}
                    <span className="text-white">{formatDate(order.createdAt)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Customer:</span>{' '}
                    <span className="font-medium text-white">{order.customerNameSnapshot}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Phone:</span>{' '}
                    <span className="font-mono text-emerald-400">{order.customerMobileSnapshot}</span>
                  </div>
                  {order.customerEmailSnapshot && (
                    <div className="sm:col-span-2">
                      <span className="text-neutral-500">Email:</span>{' '}
                      <span className="text-white">{order.customerEmailSnapshot}</span>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <span className="text-neutral-500">Delivery Address:</span>{' '}
                    <span className="text-neutral-200">
                      {order.customerAddress.address}, {order.customerAddress.city},{' '}
                      {order.customerAddress.state} — {order.customerAddress.pincode}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Sales Channel:</span>{' '}
                    <span className="text-white font-medium">{order.salesChannel}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Current Status:</span>{' '}
                    <span className="text-indigo-400 font-semibold">{order.status}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Items:</span>{' '}
                    <span className="text-white font-medium">{order.items.length} line item(s)</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Grand Total:</span>{' '}
                    <span className="font-mono font-semibold text-white">
                      {formatCurrency(order.grandTotal)}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Payment Status:</span>{' '}
                    <span className="font-medium text-white">{order.paymentStatus}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Payment Method:</span>{' '}
                    <span className="font-mono text-white">{order.paymentMethod || '—'}</span>
                  </div>
                </div>
              </div>

              {/* 2. Shipment Inputs */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-neutral-800">
                  <Truck className="w-4 h-4 text-indigo-400" />
                  <h4 className="font-semibold text-white text-sm">Shipment & Courier Information</h4>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                      Courier / Delivery Partner <span className="text-indigo-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      disabled={isDispatching}
                      value={dispatchCourierName}
                      onChange={(e) => setDispatchCourierName(e.target.value)}
                      placeholder="e.g. BlueDart, Delhivery, DTDC, India Post"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                      Tracking ID / AWB Number <span className="text-indigo-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      disabled={isDispatching}
                      value={dispatchTrackingId}
                      onChange={(e) => setDispatchTrackingId(e.target.value)}
                      placeholder="e.g. BD-98234821 or 1489201938"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-xs text-white font-mono placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                      Tracking URL <span className="text-neutral-500">(Optional)</span>
                    </label>
                    <input
                      type="url"
                      disabled={isDispatching}
                      value={dispatchTrackingUrl}
                      onChange={(e) => setDispatchTrackingUrl(e.target.value)}
                      placeholder="https://track.courier.com/..."
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              {/* Prominent Warning Callout */}
              <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-start gap-3 text-xs text-indigo-300">
                <AlertCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-indigo-200">Logistics Status Mutation</p>
                  <p className="text-indigo-300/80 leading-relaxed">
                    Dispatching creates the shipment record, transitions the order status to{' '}
                    <span className="font-semibold text-white">DISPATCHED</span>, and queues an outbox notification.
                    Physical inventory, FIFO acquisition COGS, and payment statuses remain untouched.
                  </p>
                </div>
              </div>

              {/* Error Callout */}
              {dispatchError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2.5 animate-in fade-in">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{dispatchError}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsDispatchModalOpen(false)}
                  disabled={isDispatching}
                  className="px-4 py-2.5 text-xs font-medium text-neutral-300 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDispatching || !dispatchCourierName.trim() || !dispatchTrackingId.trim()}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-950/40"
                >
                  {isDispatching ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Dispatching...</span>
                    </>
                  ) : (
                    <>
                      <Truck className="w-4 h-4" />
                      <span>Dispatch Order</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MARK AS DELIVERED MODAL (Phase E) */}
      {isDeliverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-xl w-full p-6 space-y-5 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-lg">Mark as Delivered</h3>
                  <p className="text-xs text-neutral-400 mt-0.5 font-mono">
                    Order #{order.orderNumber} • Placed {formatDate(order.createdAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => !isDelivering && setIsDeliverModalOpen(false)}
                disabled={isDelivering}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleMarkDeliveredSubmit} className="space-y-5">
              {/* Read-Only Order, Customer, Courier, & Financial Summary */}
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80">
                  <span className="font-semibold text-neutral-300 uppercase tracking-wider text-[11px]">
                    Delivery Confirmation Summary
                  </span>
                  <span className="font-mono text-neutral-500">Order Verification</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-neutral-300">
                  <div>
                    <span className="text-neutral-500">Order Number:</span>{' '}
                    <span className="font-mono font-medium text-white">{order.orderNumber}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Dispatched Date:</span>{' '}
                    <span className="text-white">
                      {order.shipment ? formatDate(order.shipment.dispatchedAt) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Customer:</span>{' '}
                    <span className="font-medium text-white">{order.customerNameSnapshot}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Phone:</span>{' '}
                    <span className="font-mono text-emerald-400">{order.customerMobileSnapshot}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-neutral-500">Delivery Address:</span>{' '}
                    <span className="text-neutral-200">
                      {order.customerAddress.address}, {order.customerAddress.city},{' '}
                      {order.customerAddress.state} — {order.customerAddress.pincode}
                    </span>
                  </div>
                  {order.shipment && (
                    <>
                      <div>
                        <span className="text-neutral-500">Courier:</span>{' '}
                        <span className="font-medium text-white">{order.shipment.courierName}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500">Tracking ID:</span>{' '}
                        <span className="font-mono text-white">{order.shipment.trackingId}</span>
                      </div>
                    </>
                  )}
                  <div>
                    <span className="text-neutral-500">Payment Status:</span>{' '}
                    <span className="font-medium text-white">{order.paymentStatus}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Total Amount:</span>{' '}
                    <span className="font-mono font-bold text-emerald-400">
                      {formatCurrency(order.grandTotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Informational Callout */}
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3 text-xs text-emerald-300">
                <AlertCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-emerald-200">Final Order Lifecycle Transition</p>
                  <p className="text-emerald-300/80 leading-relaxed">
                    Confirming delivery marks both the order and shipment as{' '}
                    <span className="font-semibold text-white">DELIVERED</span>.
                    Inventory stock, FIFO COGS, and payment statuses remain completely unchanged.
                  </p>
                </div>
              </div>

              {/* Error Callout */}
              {deliverError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2.5 animate-in fade-in">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{deliverError}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsDeliverModalOpen(false)}
                  disabled={isDelivering}
                  className="px-4 py-2.5 text-xs font-medium text-neutral-300 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDelivering}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-950/40"
                >
                  {isDelivering ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Marking as Delivered...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Mark as Delivered</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Order Confirmation Modal (Strictly for CONFIRMED Orders - Phase F) */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-start justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-base">Cancel Order</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">Order #{order.orderNumber}</p>
                </div>
              </div>
              <button
                onClick={() => !isCancelling && setIsCancelModalOpen(false)}
                disabled={isCancelling}
                className="text-neutral-400 hover:text-white disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCancelOrderSubmit} className="space-y-4">
              {/* Permanent Warning */}
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2.5 text-xs text-red-300">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <span className="font-semibold text-red-200">This action permanently cancels the order.</span>{' '}
                  Physical stock will be restored to inventory and FIFO layers will be reconstructed.
                </p>
              </div>

              {/* Order Summary Details */}
              <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-3.5 space-y-2.5 text-xs">
                <div className="grid grid-cols-2 gap-2 text-neutral-300">
                  <div>
                    <span className="text-neutral-500">Order Date:</span>{' '}
                    <span className="font-medium text-white">{formatDate(order.createdAt)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Order Total:</span>{' '}
                    <span className="font-mono font-bold text-emerald-400">
                      {formatCurrency(order.grandTotal)}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Customer:</span>{' '}
                    <span className="font-medium text-white">{order.customerNameSnapshot}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Phone:</span>{' '}
                    <span className="font-mono font-medium text-white">{order.customerMobileSnapshot}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Payment Method:</span>{' '}
                    <span className="font-medium text-white">{order.paymentMethod || '—'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Payment Status:</span>{' '}
                    <span className="font-medium text-white">{order.paymentStatus}</span>
                  </div>
                </div>

                {/* Items & Quantities */}
                <div className="pt-2 border-t border-neutral-800/60">
                  <span className="text-neutral-500 block mb-1">Items & Quantities:</span>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-neutral-300">
                        <span className="truncate pr-2">
                          {item.productNameSnapshot}
                          {item.variantTitleSnapshot ? ` (${item.variantTitleSnapshot})` : ''}
                        </span>
                        <span className="font-mono shrink-0">× {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Financial Consequences Section */}
              {order.paymentStatus === 'DUE' ? (
                <div className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-xl flex items-start gap-2.5 text-xs text-neutral-300">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <span className="font-semibold text-white">Payment Status: DUE.</span>{' '}
                    No refund is required because no payment has been received.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3 text-xs">
                  <div className="flex items-start gap-2.5 text-amber-300">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-200">
                        This order has been paid. A refund is required to complete the cancellation.
                      </p>
                      <p className="text-amber-300/80 mt-0.5">
                        Original payment was {order.paymentMethod || 'PAID'}. Full amount including shipping must be refunded offline.
                      </p>
                    </div>
                  </div>

                  <div className="bg-neutral-900/80 p-3 rounded-lg border border-neutral-800 space-y-1.5 text-neutral-300">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Original Amount Paid:</span>
                      <span className="font-mono font-medium text-white">{formatCurrency(order.grandTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Calculated Refund Amount (Read-only):</span>
                      <span className="font-mono font-bold text-emerald-400">{formatCurrency(order.grandTotal)}</span>
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      (Includes ₹{Number(order.shippingFee).toFixed(2)} shipping fee)
                    </div>
                  </div>

                  {/* Refund Method Selector */}
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-xs font-medium text-white">
                      Select Refund Method <span className="text-red-400">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['CASH', 'BANK_TRANSFER', 'UPI'] as const).map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setCancelRefundMethod(method)}
                          className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all text-center ${
                            cancelRefundMethod === method
                              ? 'bg-red-500/20 border-red-500 text-red-300'
                              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
                          }`}
                        >
                          {method === 'BANK_TRANSFER' ? 'BANK' : method}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Optional Reason / Notes */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-300">
                  Cancellation Reason / Notes <span className="text-neutral-500">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={cancelNotes}
                  onChange={(e) => setCancelNotes(e.target.value)}
                  placeholder="Optional reason for cancellation (e.g. Customer requested cancellation before dispatch)..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              {/* Error Callout */}
              {cancelError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2.5 animate-in fade-in">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{cancelError}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(false)}
                  disabled={isCancelling}
                  className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isCancelling || (order.paymentStatus === 'PAID' && !cancelRefundMethod)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-red-950/40"
                >
                  {isCancelling ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Cancelling...</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Confirm Cancellation</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Strictly for CONTACTED Orders) */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-base">Delete Order Request</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">Order #{order.orderNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-neutral-300 leading-relaxed">
              Are you sure you want to permanently delete this WhatsApp order request? Because this order is in{' '}
              <span className="text-amber-300 font-medium">CONTACTED</span> status, no inventory was deducted or reserved.
            </p>

            {deleteError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteContacted}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Bill on WhatsApp Modal (CONFIRMED / DELIVERED orders) */}
      {isSendBillModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-base">Send Bill on WhatsApp</h3>
                  <p className="text-xs text-neutral-400">Order #{order.orderNumber} • {order.customerNameSnapshot}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSendBillModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isLoadingBillWhatsApp ? (
              <div className="py-8 text-center text-sm text-neutral-400 flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span>Preparing WhatsApp message and bill details...</span>
              </div>
            ) : billWhatsAppError ? (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
                {billWhatsAppError}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs text-neutral-400 mb-1.5">
                    <span>Recipient</span>
                    <span className="font-mono text-emerald-400">{order.customerMobileSnapshot}</span>
                  </div>
                  <div className="relative">
                    <pre className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-300 font-sans whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                      {billWhatsAppMessage}
                    </pre>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(billWhatsAppMessage, 'bill_msg')}
                      className="absolute top-2 right-2 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-[11px] text-neutral-300 rounded border border-neutral-700 flex items-center gap-1"
                    >
                      {copiedKey === 'bill_msg' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-200/90 leading-relaxed space-y-1">
                  <p className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    How to send:
                  </p>
                  <p>
                    1. Click &quot;Download PDF&quot; to save the official SIFR Bill.
                    <br />
                    2. Click &quot;Open WhatsApp&quot; to open the chat with prefilled text.
                    <br />
                    3. Attach the downloaded PDF in WhatsApp and press Send.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <a
                    href={`/api/admin/orders/${order.id}/bill?download=1`}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-neutral-400" />
                    Download PDF
                  </a>

                  <a
                    href={billWhatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/40 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Open WhatsApp
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Send Dispatch Update on WhatsApp Modal (DISPATCHED / DELIVERED orders) */}
      {isDispatchWhatsAppModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-base">Send Dispatch Update on WhatsApp</h3>
                  <p className="text-xs text-neutral-400">Order #{order.orderNumber} • {order.customerNameSnapshot}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDispatchWhatsAppModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isLoadingDispatchWhatsApp ? (
              <div className="py-8 text-center text-sm text-neutral-400 flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span>Preparing dispatch update message...</span>
              </div>
            ) : dispatchWhatsAppError ? (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
                {dispatchWhatsAppError}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs text-neutral-400 mb-1.5">
                    <span>Recipient</span>
                    <span className="font-mono text-emerald-400">{order.customerMobileSnapshot}</span>
                  </div>
                  <div className="relative">
                    <pre className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-300 font-sans whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                      {dispatchWhatsAppMessage}
                    </pre>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(dispatchWhatsAppMessage, 'dispatch_msg')}
                      className="absolute top-2 right-2 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-[11px] text-neutral-300 rounded border border-neutral-700 flex items-center gap-1"
                    >
                      {copiedKey === 'dispatch_msg' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsDispatchWhatsAppModalOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
                  >
                    Close
                  </button>
                  <a
                    href={dispatchWhatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/40 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Open WhatsApp
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
