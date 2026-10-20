'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { RotateCcw, Clock, CheckCircle, XCircle, Search, Plus, ArrowRight, FileText } from 'lucide-react';
import { CreateReturnModal } from './CreateReturnModal';

interface ReturnsListManagerProps {
  initialData: {
    returnRequests: any[];
    totalCount: number;
    requestedCount: number;
    acceptedCount: number;
    rejectedCount: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  currentStatus: string;
  currentSearch: string;
}

export function ReturnsListManager({
  initialData,
  currentStatus,
  currentSearch,
}: ReturnsListManagerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(currentSearch);

  const handleStatusChange = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === 'ALL') {
      params.delete('status');
    } else {
      params.set('status', status);
    }
    params.set('page', '1');
    router.push(`/admin/returns?${params.toString()}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (searchInput.trim()) {
      params.set('search', searchInput.trim());
    } else {
      params.delete('search');
    }
    params.set('page', '1');
    router.push(`/admin/returns?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    router.push(`/admin/returns?${params.toString()}`);
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

  const getRefundStatusBadge = (req: any) => {
    if (req.refunds && req.refunds.length > 0) {
      const ref = req.refunds[0];
      if (ref.status === 'COMPLETED') {
        return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">REFUNDED ({ref.method})</span>;
      }
      if (ref.status === 'PENDING') {
        return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">PENDING REFUND</span>;
      }
      return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-400">{ref.status}</span>;
    }

    if (req.status === 'ACCEPTED' && req.order?.paymentStatus === 'DUE') {
      return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-400">UNPAID (NO REFUND)</span>;
    }

    if (req.status === 'REJECTED') {
      return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-500">NONE</span>;
    }

    return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-500">—</span>;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <RotateCcw className="w-6 h-6 text-amber-400" />
            Customer Returns
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage customer return requests, accepted returns and refunds.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl text-sm transition-colors shadow-lg shadow-amber-500/10 shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          Create Return
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Total Returns</span>
            <FileText className="w-4 h-4 text-zinc-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-white mt-2">{initialData.totalCount}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">Pending Requests</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-amber-400 mt-2">{initialData.requestedCount}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Accepted</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-400 mt-2">{initialData.acceptedCount}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-rose-400 uppercase tracking-wider">Rejected</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-rose-400 mt-2">{initialData.rejectedCount}</p>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        {/* Status Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {['ALL', 'REQUESTED', 'ACCEPTED', 'REJECTED'].map((st) => (
            <button
              key={st}
              onClick={() => handleStatusChange(st)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                currentStatus === st
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Search return #, order #, phone..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2 pointer-events-none" />
        </form>
      </div>

      {/* Returns Data Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950/60 text-xs font-semibold uppercase text-zinc-400 border-b border-zinc-800">
              <tr>
                <th className="px-4 py-3">Return #</th>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Refund Amount</th>
                <th className="px-4 py-3">Refund Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {initialData.returnRequests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-zinc-500">
                    No return records found.
                  </td>
                </tr>
              ) : (
                initialData.returnRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-amber-400">
                      {req.returnNumber}
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-300">
                      {req.order.orderNumber}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-white">{req.order.customerNameSnapshot}</div>
                      <div className="text-[11px] font-mono text-zinc-500">{req.customerMobile}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-300">
                      {req.reason.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border ${getStatusBadge(req.status)}`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-white">
                      ₹{Number(req.totalRefundAmount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      {getRefundStatusBadge(req)}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {new Date(req.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/returns/${req.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-xs font-medium transition-colors"
                      >
                        View
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {initialData.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950/40 flex items-center justify-between text-xs text-zinc-400">
            <span>
              Page {initialData.page} of {initialData.totalPages} ({initialData.totalCount} returns)
            </span>
            <div className="flex gap-2">
              <button
                disabled={initialData.page <= 1}
                onClick={() => handlePageChange(initialData.page - 1)}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white rounded-lg transition-colors"
              >
                Previous
              </button>
              <button
                disabled={initialData.page >= initialData.totalPages}
                onClick={() => handlePageChange(initialData.page + 1)}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white rounded-lg transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Return Modal */}
      <CreateReturnModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}
