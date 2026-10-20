'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { SalesReportPaginatedResult } from '@/lib/reports/report-service';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';

interface SalesReportTableProps {
  data: SalesReportPaginatedResult;
}

export function SalesReportTable({ data }: SalesReportTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const formatCurrency = (val: number) =>
    `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const goToPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`/admin/reports/sales?${params.toString()}`);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden space-y-4">
      {/* Table Container with Horizontal Scroll */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-neutral-300 font-sans border-collapse">
          <thead className="bg-neutral-950 text-neutral-400 font-mono text-[11px] uppercase tracking-wider border-b border-neutral-800 sticky top-0 z-10">
            <tr>
              <th className="py-3 px-4 whitespace-nowrap">Date</th>
              <th className="py-3 px-4 whitespace-nowrap">Order Number</th>
              <th className="py-3 px-4 whitespace-nowrap">Channel</th>
              <th className="py-3 px-4 whitespace-nowrap">Customer</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Items Qty</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Subtotal</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Discount</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Shipping</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Tax</th>
              <th className="py-3 px-4 text-right whitespace-nowrap font-bold text-white">Gross Sales</th>
              <th className="py-3 px-4 text-right whitespace-nowrap text-rose-400">Refund</th>
              <th className="py-3 px-4 text-right whitespace-nowrap font-bold text-emerald-400">Net Revenue</th>
              <th className="py-3 px-4 text-right whitespace-nowrap text-purple-400">FIFO COGS</th>
              <th className="py-3 px-4 text-right whitespace-nowrap text-cyan-400">Gross Margin</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Payment</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Order Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/80">
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={16} className="py-12 text-center text-neutral-500 font-mono">
                  No sales orders found matching the selected filter criteria.
                </td>
              </tr>
            ) : (
              data.rows.map((row) => (
                <tr key={row.id} className="hover:bg-neutral-800/50 transition-colors font-mono text-xs">
                  <td className="py-3 px-4 text-neutral-400 whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                    <Link
                      href={`/admin/orders/${row.id}`}
                      className="inline-flex items-center space-x-1 text-white hover:text-cyan-400 underline decoration-neutral-700 transition-colors"
                    >
                      <span>{row.orderNumber}</span>
                      <ExternalLink className="w-3 h-3 text-neutral-500" />
                    </Link>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono ${
                        row.salesChannel === 'ONLINE'
                          ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-800/50'
                          : 'bg-amber-950/60 text-amber-300 border border-amber-800/50'
                      }`}
                    >
                      {row.salesChannel}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-neutral-300 font-sans truncate max-w-[150px]">
                    {row.customerName}
                  </td>
                  <td className="py-3 px-4 text-center text-white">{row.itemsQuantity}</td>
                  <td className="py-3 px-4 text-right text-neutral-300">{formatCurrency(row.subtotal)}</td>
                  <td className="py-3 px-4 text-right text-neutral-400">
                    {row.discountTotal > 0 ? `-${formatCurrency(row.discountTotal)}` : '₹0'}
                  </td>
                  <td className="py-3 px-4 text-right text-neutral-400">{formatCurrency(row.shippingFee)}</td>
                  <td className="py-3 px-4 text-right text-neutral-400">{formatCurrency(row.taxTotal)}</td>
                  <td className="py-3 px-4 text-right font-bold text-white">{formatCurrency(row.grandTotal)}</td>
                  <td className="py-3 px-4 text-right text-rose-400">
                    {row.attributedRefund > 0 ? `-${formatCurrency(row.attributedRefund)}` : '₹0'}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-400">
                    {formatCurrency(row.netRevenue)}
                  </td>
                  <td className="py-3 px-4 text-right text-purple-400">{formatCurrency(row.fifoCogs)}</td>
                  <td className="py-3 px-4 text-right font-medium text-cyan-400">
                    {formatCurrency(row.grossMargin)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] uppercase ${
                        row.paymentStatus === 'PAID'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : row.paymentStatus === 'PARTIALLY_REFUNDED' || row.paymentStatus === 'REFUNDED'
                          ? 'bg-purple-950 text-purple-300 border border-purple-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {row.paymentStatus}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] uppercase ${
                        row.orderStatus === 'DELIVERED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : row.orderStatus === 'CANCELLED'
                          ? 'bg-rose-950 text-rose-400 border border-rose-800'
                          : 'bg-neutral-800 text-neutral-200'
                      }`}
                    >
                      {row.orderStatus}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="p-4 border-t border-neutral-800 flex items-center justify-between text-xs font-mono">
        <div className="text-neutral-400">
          Showing page <span className="text-white font-semibold">{data.page}</span> of{' '}
          <span className="text-white font-semibold">{data.totalPages}</span> ({data.totalCount} total orders)
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => goToPage(data.page - 1)}
            disabled={data.page <= 1}
            className="px-3 py-1.5 bg-neutral-950 border border-neutral-800 text-white rounded disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1 hover:bg-neutral-800 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <button
            type="button"
            onClick={() => goToPage(data.page + 1)}
            disabled={data.page >= data.totalPages}
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
