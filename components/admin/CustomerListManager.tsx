'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getCustomersAction } from '@/lib/actions/customer-actions';
import {
  AdminCustomerRowItem,
  CustomerSortBy,
} from '@/lib/customer/customer-service';
import {
  Search,
  Users,
  Eye,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Calendar,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function CustomerListManager() {
  const [customers, setCustomers] = useState<AdminCustomerRowItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<CustomerSortBy>('newest');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const limit = 15;

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getCustomersAction({
        search: search.trim() || undefined,
        sortBy,
        page,
        limit,
      });

      setCustomers(result.customers);
      setTotalPages(result.totalPages);
      setTotalCount(result.total);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch customers.');
    } finally {
      setLoading(false);
    }
  }, [search, sortBy, page, limit]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Handle Search submit / debounce
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1); // Reset to page 1 on new search
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value as CustomerSortBy);
    setPage(1);
  };

  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-2.5">
            <Users className="w-6 h-6 text-neutral-400" />
            <span>Customers</span>
          </h1>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            GUEST CHECKOUT PROFILES AND PURCHASE HISTORIES
          </p>
        </div>

        <button
          onClick={fetchCustomers}
          disabled={loading}
          className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors self-start sm:self-auto"
          title="Refresh Customer List"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search by customer name, phone, or email..."
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 font-mono"
          />
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 text-xs text-neutral-400 font-mono flex-shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-neutral-500" />
            <span className="hidden md:inline">Sort:</span>
          </div>
          <select
            value={sortBy}
            onChange={handleSortChange}
            className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-600 font-mono"
          >
            <option value="newest">Newest Customer</option>
            <option value="oldest">Oldest Customer</option>
            <option value="total_spend">Highest Total Purchase Value</option>
            <option value="most_orders">Most Orders</option>
            <option value="last_order">Last Order Date</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Table Container */}
      <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-neutral-900/80 text-neutral-400 font-mono uppercase text-[10px] tracking-wider border-b border-neutral-800">
              <tr>
                <th className="py-3 px-4">Customer Name</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">City / State</th>
                <th className="py-3 px-4 text-center">Number of Orders</th>
                <th className="py-3 px-4 text-right">Total Purchase Value</th>
                <th className="py-3 px-4 text-center">Last Order Date</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-light">
              {loading && customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-neutral-500 font-mono">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-neutral-400" />
                      <span>Loading customers...</span>
                    </div>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500">
                        <Users className="w-6 h-6" />
                      </div>
                      <div className="text-white font-medium text-sm">No customers yet</div>
                      <p className="text-xs text-neutral-500 max-w-sm">
                        Customers will appear here after customers place orders.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const locationText =
                    c.city && c.state
                      ? `${c.city}, ${c.state}`
                      : c.city || c.state || '—';

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-neutral-800/30 transition-colors group"
                    >
                      {/* Customer Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-[11px] font-mono font-medium text-neutral-300 flex-shrink-0">
                            {c.name ? c.name.charAt(0).toUpperCase() : '?'}
                          </div>
                          <div>
                            <Link
                              href={`/admin/customers/${c.id}`}
                              className="font-medium text-white hover:underline transition-colors block text-xs"
                            >
                              {c.name}
                            </Link>
                            <span className="text-[10px] font-mono text-neutral-500 block">
                              Guest Customer
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3.5 px-4 font-mono text-neutral-300">
                        <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-[11px]">
                          <Phone className="w-3 h-3 text-neutral-500" />
                          <span>{c.mobile}</span>
                        </span>
                      </td>

                      {/* Email */}
                      <td className="py-3.5 px-4 font-mono text-neutral-400">
                        {c.email ? (
                          <span className="truncate max-w-[160px] inline-block" title={c.email}>
                            {c.email}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>

                      {/* City / State */}
                      <td className="py-3.5 px-4 text-neutral-300">
                        <span className="truncate max-w-[150px] inline-block" title={locationText}>
                          {locationText}
                        </span>
                      </td>

                      {/* Number of Orders */}
                      <td className="py-3.5 px-4 text-center font-mono text-neutral-300">
                        <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-xs">
                          {c.ordersCount}
                        </span>
                        {c.allOrdersCount > c.ordersCount && (
                          <span className="text-[10px] text-neutral-500 ml-1.5" title={`${c.allOrdersCount} total requests including contacted/cancelled`}>
                            ({c.allOrdersCount} total)
                          </span>
                        )}
                      </td>

                      {/* Total Purchase Value */}
                      <td className="py-3.5 px-4 text-right font-mono text-white font-medium">
                        {formatCurrency(c.totalPurchaseValue)}
                      </td>

                      {/* Last Order Date */}
                      <td className="py-3.5 px-4 text-center font-mono text-neutral-400">
                        {formatDate(c.lastOrderDate)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/admin/customers/${c.id}`}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors text-xs font-mono"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-neutral-950/60 border-t border-neutral-800 text-xs font-mono text-neutral-400">
            <div>
              Showing {Math.min(totalCount, (page - 1) * limit + 1)} to{' '}
              {Math.min(totalCount, page * limit)} of {totalCount} customers
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1 || loading}
                className="p-1.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-2">
                Page {page} of {totalPages}
              </span>

              <button
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages || loading}
                className="p-1.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
