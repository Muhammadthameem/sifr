'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getOrders, deleteContactedOrderAction } from '@/lib/actions/order-actions';
import { SalesChannel, OrderStatus, PaymentStatus } from '@prisma/client';
import {
  Search,
  ShoppingBag,
  Eye,
  RefreshCw,
  Store,
  Calendar,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
  AlertTriangle,
  X,
  ExternalLink,
  MessageCircle,
  Truck,
  RotateCcw,
} from 'lucide-react';

interface OrderItemSummary {
  id: string;
  skuSnapshot: string;
  productNameSnapshot: string;
  variantTitleSnapshot?: string | null;
  quantity: number;
}

interface OrderShipmentSummary {
  courierName: string;
  trackingId: string;
  trackingUrl: string | null;
  status: string;
}

interface AdminOrderRow {
  id: string;
  orderNumber: string;
  salesChannel: SalesChannel;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  customerNameSnapshot: string;
  customerMobileSnapshot: string;
  customerEmailSnapshot: string | null;
  subtotal: number;
  shippingFee: number;
  discountTotal: number;
  grandTotal: number;
  createdAt: string;
  itemsCount: number;
  linesCount: number;
  items: OrderItemSummary[];
  shipment: OrderShipmentSummary | null;
}

export function OrderListManager() {
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortOption, setSortOption] = useState<'date_desc' | 'date_asc' | 'total_desc' | 'total_asc'>('date_desc');

  // Delete Modal State (CONTACTED orders only)
  const [deleteModalOrder, setDeleteModalOrder] = useState<AdminOrderRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      let sortBy: 'createdAt' | 'grandTotal' = 'createdAt';
      let sortOrder: 'asc' | 'desc' = 'desc';

      if (sortOption === 'date_asc') {
        sortBy = 'createdAt';
        sortOrder = 'asc';
      } else if (sortOption === 'total_desc') {
        sortBy = 'grandTotal';
        sortOrder = 'desc';
      } else if (sortOption === 'total_asc') {
        sortBy = 'grandTotal';
        sortOrder = 'asc';
      }

      const res = await getOrders({
        salesChannel: channelFilter !== 'ALL' ? (channelFilter as SalesChannel) : undefined,
        status: statusFilter !== 'ALL' ? (statusFilter as OrderStatus) : undefined,
        paymentStatus: paymentStatusFilter !== 'ALL' ? (paymentStatusFilter as PaymentStatus) : undefined,
        search: search.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sortBy,
        sortOrder,
        page,
        limit: 25,
      });

      setOrders(res.orders as AdminOrderRow[]);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  }, [channelFilter, statusFilter, paymentStatusFilter, search, startDate, endDate, sortOption, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrders();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchOrders]);

  // Reset page when filters change
  const handleFilterChange = (setter: (val: any) => void, val: any) => {
    setter(val);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setChannelFilter('ALL');
    setStatusFilter('ALL');
    setPaymentStatusFilter('ALL');
    setStartDate('');
    setEndDate('');
    setSortOption('date_desc');
    setPage(1);
  };

  const hasActiveFilters =
    Boolean(search) ||
    channelFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    paymentStatusFilter !== 'ALL' ||
    Boolean(startDate) ||
    Boolean(endDate) ||
    sortOption !== 'date_desc';

  // Delete Action for CONTACTED orders
  const handleDeleteOrder = async () => {
    if (!deleteModalOrder) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      const res = await deleteContactedOrderAction(deleteModalOrder.id);
      if (res.success) {
        setSuccessNotice(`Order #${deleteModalOrder.orderNumber} deleted successfully.`);
        setDeleteModalOrder(null);
        setTimeout(() => setSuccessNotice(null), 4000);
        await fetchOrders();
      } else {
        setDeleteError(res.error || 'Failed to delete contacted order.');
      }
    } catch (err: any) {
      setDeleteError(err.message || 'An error occurred during order deletion.');
    } finally {
      setDeleting(false);
    }
  };

  // Badge Helpers
  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'CONTACTED':
        return {
          className: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
          label: 'CONTACTED (Request)',
        };
      case 'CONFIRMED':
        return {
          className: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
          label: 'CONFIRMED',
        };
      case 'DISPATCHED':
        return {
          className: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
          label: 'DISPATCHED',
        };
      case 'DELIVERED':
        return {
          className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
          label: 'DELIVERED',
        };
      case 'CANCELLED':
        return {
          className: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
          label: 'CANCELLED',
        };
      case 'RECEIVED':
        return {
          className: 'bg-neutral-800 text-neutral-300 border-neutral-700',
          label: 'RECEIVED',
        };
      default:
        return {
          className: 'bg-neutral-800 text-neutral-300 border-neutral-700',
          label: status,
        };
    }
  };

  const getPaymentBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'PAID':
        return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
      case 'DUE':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
      case 'REFUNDED':
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
      case 'PARTIALLY_REFUNDED':
        return 'bg-orange-500/10 text-orange-300 border-orange-500/30';
      case 'PENDING':
        return 'bg-neutral-800 text-neutral-400 border-neutral-700';
      case 'FAILED':
        return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
      default:
        return 'bg-neutral-800 text-neutral-300 border-neutral-700';
    }
  };

  const getChannelBadge = (channel: SalesChannel) => {
    switch (channel) {
      case 'WHATSAPP':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60';
      case 'DIRECT':
        return 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60';
      case 'ONLINE':
        return 'bg-sky-950/60 text-sky-300 border-sky-800/60';
      default:
        return 'bg-neutral-800 text-neutral-300 border-neutral-700';
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-serif tracking-wide font-semibold text-white">Orders</h1>
          <p className="text-xs text-neutral-400 mt-1">
            Manage customer orders, payments, shipments and order status.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            href="/admin/direct-sales"
            className="flex items-center space-x-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-medium tracking-wide transition border border-neutral-700"
          >
            <Store className="w-4 h-4 text-emerald-400" />
            <span>New Direct Sale (POS)</span>
          </Link>
          <button
            onClick={fetchOrders}
            className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs border border-neutral-700 transition"
            title="Refresh Orders"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successNotice && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs rounded-lg flex items-center justify-between">
          <span>✓ {successNotice}</span>
          <button onClick={() => setSuccessNotice(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800 space-y-3">
        {/* Row 1: Search & Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-500" />
            <input
              type="text"
              placeholder="Search order #, customer, phone, SKU, tracking ID..."
              value={search}
              onChange={(e) => handleFilterChange(setSearch, e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
              id="admin-orders-search-input"
            />
            {search && (
              <button
                onClick={() => handleFilterChange(setSearch, '')}
                className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-neutral-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sales Channel Filter */}
          <div>
            <select
              value={channelFilter}
              onChange={(e) => handleFilterChange(setChannelFilter, e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-neutral-600"
              id="admin-orders-channel-filter"
            >
              <option value="ALL">All Sales Channels</option>
              <option value="WHATSAPP">WHATSAPP</option>
              <option value="ONLINE">ONLINE (Legacy)</option>
              <option value="DIRECT">DIRECT (POS)</option>
            </select>
          </div>

          {/* Order Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-neutral-600"
              id="admin-orders-status-filter"
            >
              <option value="ALL">All Order Statuses</option>
              <option value="CONTACTED">CONTACTED (Order Request)</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="DISPATCHED">DISPATCHED</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="RECEIVED">RECEIVED (Legacy)</option>
            </select>
          </div>

          {/* Payment Status Filter */}
          <div>
            <select
              value={paymentStatusFilter}
              onChange={(e) => handleFilterChange(setPaymentStatusFilter, e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-neutral-600"
              id="admin-orders-payment-filter"
            >
              <option value="ALL">All Payment Statuses</option>
              <option value="DUE">DUE</option>
              <option value="PAID">PAID</option>
              <option value="REFUNDED">REFUNDED</option>
              <option value="PARTIALLY_REFUNDED">PARTIALLY REFUNDED</option>
              <option value="PENDING">PENDING</option>
              <option value="FAILED">FAILED</option>
            </select>
          </div>
        </div>

        {/* Row 2: Date Range, Sort & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-neutral-800/60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-neutral-500 uppercase flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-neutral-500" />
              <span>Date:</span>
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleFilterChange(setStartDate, e.target.value)}
              className="px-2.5 py-1 bg-neutral-950 border border-neutral-800 rounded text-[11px] font-mono text-neutral-300 focus:outline-none focus:border-neutral-600"
              title="Start Date"
            />
            <span className="text-neutral-500 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleFilterChange(setEndDate, e.target.value)}
              className="px-2.5 py-1 bg-neutral-950 border border-neutral-800 rounded text-[11px] font-mono text-neutral-300 focus:outline-none focus:border-neutral-600"
              title="End Date"
            />
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1 text-[11px] text-neutral-400 font-mono">
              <ArrowUpDown className="w-3 h-3 text-neutral-500" />
              <span>Sort:</span>
              <select
                value={sortOption}
                onChange={(e) => handleFilterChange(setSortOption, e.target.value as any)}
                className="px-2 py-1 bg-neutral-950 border border-neutral-800 rounded text-[11px] text-neutral-300 focus:outline-none focus:border-neutral-600"
              >
                <option value="date_desc">Newest First</option>
                <option value="date_asc">Oldest First</option>
                <option value="total_desc">Total: High to Low</option>
                <option value="total_asc">Total: Low to High</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px] font-mono flex items-center space-x-1 border border-neutral-700 transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
        {loading && orders.length === 0 ? (
          <div className="p-16 text-center text-xs font-mono text-neutral-500">
            <div className="w-6 h-6 border-2 border-neutral-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading orders from database...
          </div>
        ) : orders.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <ShoppingBag className="w-10 h-10 text-neutral-600 mx-auto" />
            <div className="text-sm font-medium text-neutral-300">
              {hasActiveFilters ? 'No matching orders found' : 'No orders yet'}
            </div>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'Try adjusting your search query, status filters, or date range.'
                : 'Customer orders placed through WhatsApp or other channels will appear here.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="mt-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs font-mono transition"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-neutral-950/80 text-neutral-400 font-mono text-[11px] uppercase tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Order #</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium">Order Status</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Courier / Tracking</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {orders.map((order) => {
                  const statusBadge = getStatusBadge(order.status);
                  const isContacted = order.status === 'CONTACTED';

                  return (
                    <tr key={order.id} className="hover:bg-neutral-800/30 transition">
                      {/* 1. Order Number */}
                      <td className="px-4 py-3 font-mono">
                        <div className="font-semibold text-white tracking-wide">{order.orderNumber}</div>
                        <div className="text-[10px] text-neutral-500">
                          {order.itemsCount} {order.itemsCount === 1 ? 'item' : 'items'}
                        </div>
                      </td>

                      {/* 2. Order Date */}
                      <td className="px-4 py-3 text-neutral-400 font-mono text-[11px] whitespace-nowrap">
                        {formatDate(order.createdAt)}
                      </td>

                      {/* 3. Customer */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{order.customerNameSnapshot}</div>
                        <div className="text-[11px] text-neutral-400 font-mono">
                          {order.customerMobileSnapshot}
                        </div>
                      </td>

                      {/* 4. Sales Channel */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono border ${getChannelBadge(
                            order.salesChannel
                          )}`}
                        >
                          {order.salesChannel === 'WHATSAPP' && (
                            <MessageCircle className="w-3 h-3 text-emerald-400 inline-block mr-0.5" />
                          )}
                          <span>{order.salesChannel}</span>
                        </span>
                      </td>

                      {/* 5. Order Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono border font-medium ${statusBadge.className}`}
                        >
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* 6. Payment Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono border ${getPaymentBadge(
                            order.paymentStatus
                          )}`}
                        >
                          {order.paymentStatus}
                        </span>
                      </td>

                      {/* 7. Payment Method */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {order.paymentMethod ? (
                          <span className="px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 text-[10px] font-mono">
                            {order.paymentMethod}
                          </span>
                        ) : (
                          <span className="text-neutral-500 font-mono text-xs">—</span>
                        )}
                      </td>

                      {/* 8. Courier / Tracking */}
                      <td className="px-4 py-3">
                        {order.shipment ? (
                          <div className="font-mono text-[11px] text-neutral-300">
                            <span className="text-neutral-400">{order.shipment.courierName}: </span>
                            {order.shipment.trackingUrl ? (
                              <a
                                href={order.shipment.trackingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sky-400 hover:underline inline-flex items-center space-x-0.5"
                              >
                                <span>{order.shipment.trackingId}</span>
                                <ExternalLink className="w-3 h-3 ml-0.5" />
                              </a>
                            ) : (
                              <span className="text-white font-medium">{order.shipment.trackingId}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-neutral-500 font-mono text-xs">—</span>
                        )}
                      </td>

                      {/* 9. Grand Total */}
                      <td className="px-4 py-3 text-right font-mono font-medium text-white whitespace-nowrap">
                        ₹{Number(order.grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* 10. Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1.5">
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 text-[11px] font-mono transition"
                            title="View Order Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </Link>

                          {/* Delete Action: EXCLUSIVELY for CONTACTED orders */}
                          {isContacted && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteModalOrder(order);
                                setDeleteError(null);
                              }}
                              className="inline-flex items-center space-x-1 px-2 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 rounded border border-rose-800/60 text-[11px] font-mono transition"
                              title="Delete Contacted Order Request"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer & Pagination */}
        <div className="px-4 py-3 bg-neutral-950/60 border-t border-neutral-800 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-neutral-400 font-mono">
          <div>
            Showing {orders.length > 0 ? (page - 1) * 25 + 1 : 0} –{' '}
            {Math.min(page * 25, total)} of {total} orders
          </div>

          {totalPages > 1 && (
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed rounded border border-neutral-800 text-neutral-300 text-xs flex items-center transition"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
                <span>Prev</span>
              </button>

              <span className="px-2 text-neutral-400">
                Page {page} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed rounded border border-neutral-800 text-neutral-300 text-xs flex items-center transition"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal (CONTACTED orders ONLY) */}
      {deleteModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-neutral-900 border border-neutral-800 max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-400 flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-lg font-normal text-white">
                  Delete Contacted Order?
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Are you sure you want to delete order request{' '}
                  <span className="font-mono text-white font-semibold">
                    #{deleteModalOrder.orderNumber}
                  </span>
                  ? This will permanently delete the unconfirmed order record.
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-950/80 border border-neutral-800/80 rounded-lg text-[11px] font-mono text-neutral-400 space-y-1">
              <div>Customer: <span className="text-white">{deleteModalOrder.customerNameSnapshot}</span> ({deleteModalOrder.customerMobileSnapshot})</div>
              <div>Status: <span className="text-amber-400">CONTACTED</span> (Zero stock was reserved or deducted)</div>
              <div>Total: <span className="text-white">₹{Number(deleteModalOrder.grandTotal).toFixed(2)}</span></div>
            </div>

            {deleteError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-lg">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOrder(null);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-mono transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteOrder}
                disabled={deleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-800 text-white rounded-lg text-xs font-mono font-medium flex items-center space-x-1.5 transition shadow-sm"
              >
                {deleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Order</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
