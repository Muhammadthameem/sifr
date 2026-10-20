'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProductReportPaginatedResult } from '@/lib/reports/report-service';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ProductReportTableProps {
  data: ProductReportPaginatedResult;
}

export function ProductReportTable({ data }: ProductReportTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const formatCurrency = (val: number) =>
    `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const goToPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`/admin/reports/products?${params.toString()}`);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-neutral-300 font-sans border-collapse">
          <thead className="bg-neutral-950 text-neutral-400 font-mono text-[11px] uppercase tracking-wider border-b border-neutral-800 sticky top-0 z-10">
            <tr>
              <th className="py-3 px-4 whitespace-nowrap">Product Name</th>
              <th className="py-3 px-4 whitespace-nowrap">Category</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Units Sold</th>
              <th className="py-3 px-4 text-right whitespace-nowrap font-bold text-white">Gross Sales</th>
              <th className="py-3 px-4 text-right whitespace-nowrap text-rose-400">Refunds</th>
              <th className="py-3 px-4 text-right whitespace-nowrap font-bold text-emerald-400">Net Revenue</th>
              <th className="py-3 px-4 text-right whitespace-nowrap text-purple-400">FIFO COGS</th>
              <th className="py-3 px-4 text-right whitespace-nowrap text-cyan-400">Gross Margin</th>
              <th className="py-3 px-4 text-right whitespace-nowrap text-neutral-300">Gross Margin %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/80">
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-neutral-500 font-mono">
                  No products found matching the selected search or date criteria.
                </td>
              </tr>
            ) : (
              data.rows.map((row) => (
                <tr key={row.productId} className="hover:bg-neutral-800/50 transition-colors font-mono text-xs">
                  <td className="py-3 px-4 text-white font-sans font-medium">{row.productName}</td>
                  <td className="py-3 px-4 text-neutral-400 font-sans">{row.categoryName}</td>
                  <td className="py-3 px-4 text-center text-white">{row.unitsSold}</td>
                  <td className="py-3 px-4 text-right font-bold text-white">{formatCurrency(row.grossSales)}</td>
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
                  <td className="py-3 px-4 text-right text-neutral-300">
                    {row.grossMarginPercent.toFixed(1)}%
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
          <span className="text-white font-semibold">{data.totalPages}</span> ({data.totalCount} products)
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
