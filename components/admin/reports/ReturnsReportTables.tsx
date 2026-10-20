'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ReturnRequestsPaginatedResult,
  RefundsPaginatedResult,
} from '@/lib/reports/report-service';
import { ChevronLeft, ChevronRight, ExternalLink, RotateCcw, DollarSign } from 'lucide-react';

interface ReturnsReportTablesProps {
  returnRequests: ReturnRequestsPaginatedResult;
  refunds: RefundsPaginatedResult;
}

export function ReturnsReportTables({ returnRequests, refunds }: ReturnsReportTablesProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'returns' | 'refunds'>('returns');

  const formatCurrency = (val: number) =>
    `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const goToPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`/admin/reports/returns?${params.toString()}`);
  };

  const activeData = activeTab === 'returns' ? returnRequests : refunds;

  return (
    <div className="space-y-4">
      {/* Tab Controls */}
      <div className="flex items-center space-x-2 border-b border-neutral-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('returns')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-mono text-xs transition-colors ${
            activeTab === 'returns'
              ? 'bg-neutral-800 text-white font-semibold border border-neutral-700'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
          <span>Return Requests Ledger ({returnRequests.totalCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('refunds')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-mono text-xs transition-colors ${
            activeTab === 'refunds'
              ? 'bg-neutral-800 text-white font-semibold border border-neutral-700'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5 text-rose-400" />
          <span>Financial Refunds Ledger ({refunds.totalCount})</span>
        </button>
      </div>

      {/* Tab 1: Return Requests Table */}
      {activeTab === 'returns' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300 font-sans border-collapse">
              <thead className="bg-neutral-950 text-neutral-400 font-mono text-[11px] uppercase tracking-wider border-b border-neutral-800 sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4 whitespace-nowrap">Return #</th>
                  <th className="py-3 px-4 whitespace-nowrap">Order #</th>
                  <th className="py-3 px-4 whitespace-nowrap">Customer</th>
                  <th className="py-3 px-4 whitespace-nowrap">Date</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
                  <th className="py-3 px-4 whitespace-nowrap">Resolution</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Req / Rec / Rest / Dam</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Merchant Error</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap font-bold text-rose-400">Total Refund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80">
                {returnRequests.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-neutral-500 font-mono">
                      No return requests found matching the filter criteria.
                    </td>
                  </tr>
                ) : (
                  returnRequests.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-neutral-800/50 transition-colors font-mono text-xs">
                      <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                        {row.returnNumber}
                      </td>
                      <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                        <Link
                          href={`/admin/orders/${row.orderId}`}
                          className="inline-flex items-center space-x-1 text-white hover:text-cyan-400 underline decoration-neutral-700 transition-colors"
                        >
                          <span>{row.orderNumber}</span>
                          <ExternalLink className="w-3 h-3 text-neutral-500" />
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-neutral-300 font-sans truncate max-w-[150px]">
                        {row.customerName}
                      </td>
                      <td className="py-3 px-4 text-neutral-400 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono ${
                            row.status === 'RESOLVED' || row.status === 'INSPECTED'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : row.status === 'REJECTED'
                              ? 'bg-rose-950 text-rose-400 border border-rose-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-neutral-300 font-sans">{row.resolutionType || row.reason}</td>
                      <td className="py-3 px-4 text-center whitespace-nowrap text-neutral-200 font-mono">
                        {row.quantityRequested} / {row.quantityReceived} /{' '}
                        <span className="text-emerald-400">{row.quantityRestocked}</span> /{' '}
                        <span className="text-rose-400">{row.quantityDamaged}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {row.isMerchantError ? (
                          <span className="px-2 py-0.5 rounded text-[10px] uppercase bg-rose-950 text-rose-300 border border-rose-800 font-mono">
                            YES
                          </span>
                        ) : (
                          <span className="text-neutral-500 font-mono">NO</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-rose-400">
                        {formatCurrency(row.totalRefundAmount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Refunds Table */}
      {activeTab === 'refunds' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300 font-sans border-collapse">
              <thead className="bg-neutral-950 text-neutral-400 font-mono text-[11px] uppercase tracking-wider border-b border-neutral-800 sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4 whitespace-nowrap">Refund #</th>
                  <th className="py-3 px-4 whitespace-nowrap">Order #</th>
                  <th className="py-3 px-4 whitespace-nowrap">Return #</th>
                  <th className="py-3 px-4 whitespace-nowrap">Date</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap font-bold text-rose-400">Amount</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap text-neutral-400">Shipping Refund</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Method</th>
                  <th className="py-3 px-4 whitespace-nowrap">Manual Resolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80">
                {refunds.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-neutral-500 font-mono">
                      No financial refunds found matching the filter criteria.
                    </td>
                  </tr>
                ) : (
                  refunds.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-neutral-800/50 transition-colors font-mono text-xs">
                      <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                        {row.refundNumber}
                      </td>
                      <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                        <Link
                          href={`/admin/orders/${row.orderId}`}
                          className="inline-flex items-center space-x-1 text-white hover:text-cyan-400 underline decoration-neutral-700 transition-colors"
                        >
                          <span>{row.orderNumber}</span>
                          <ExternalLink className="w-3 h-3 text-neutral-500" />
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-neutral-300 whitespace-nowrap">
                        {row.returnNumber || <span className="text-neutral-600">N/A</span>}
                      </td>
                      <td className="py-3 px-4 text-neutral-400 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-rose-400">
                        {formatCurrency(row.amount)}
                      </td>
                      <td className="py-3 px-4 text-right text-neutral-400">
                        {formatCurrency(row.shippingRefund)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono ${
                            row.status === 'COMPLETED' || row.status === 'MANUALLY_RESOLVED'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : row.status === 'FAILED'
                              ? 'bg-rose-950 text-rose-400 border border-rose-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-neutral-300 uppercase">{row.method}</td>
                      <td className="py-3 px-4 text-neutral-400">
                        {row.manualResolutionType || <span className="text-neutral-600">None</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Bar */}
      <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center justify-between text-xs font-mono">
        <div className="text-neutral-400">
          Showing page <span className="text-white font-semibold">{activeData.page}</span> of{' '}
          <span className="text-white font-semibold">{activeData.totalPages}</span> ({activeData.totalCount} total entries)
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => goToPage(activeData.page - 1)}
            disabled={activeData.page <= 1}
            className="px-3 py-1.5 bg-neutral-950 border border-neutral-800 text-white rounded disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1 hover:bg-neutral-800 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <button
            type="button"
            onClick={() => goToPage(activeData.page + 1)}
            disabled={activeData.page >= activeData.totalPages}
            className="px-3 py-1.5 bg-neutral-950 border border-neutral-800 text-white rounded disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1 hover:bg-neutral-800 transition-colors"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
