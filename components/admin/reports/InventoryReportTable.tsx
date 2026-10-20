'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { InventoryReportPaginatedResult } from '@/lib/reports/report-service';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface InventoryReportTableProps {
  data: InventoryReportPaginatedResult;
}

export function InventoryReportTable({ data }: InventoryReportTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const formatCurrency = (val: number) =>
    `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const goToPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`/admin/reports/inventory?${params.toString()}`);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden space-y-4">
      {/* Table Container with Horizontal Scroll */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-neutral-300 font-sans border-collapse">
          <thead className="bg-neutral-950 text-neutral-400 font-mono text-[11px] uppercase tracking-wider border-b border-neutral-800 sticky top-0 z-10">
            <tr>
              <th className="py-3 px-4 whitespace-nowrap">SKU</th>
              <th className="py-3 px-4 whitespace-nowrap">Product Name</th>
              <th className="py-3 px-4 whitespace-nowrap">Variant Title</th>
              <th className="py-3 px-4 whitespace-nowrap">Category</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Physical Stock</th>
              <th className="py-3 px-4 text-center whitespace-nowrap text-purple-400">Reserved</th>
              <th className="py-3 px-4 text-center whitespace-nowrap font-bold text-white">Available</th>
              <th className="py-3 px-4 text-right whitespace-nowrap text-cyan-400">FIFO Valuation</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Stock Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/80">
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-neutral-500 font-mono">
                  No inventory variants found matching the selected search or status criteria.
                </td>
              </tr>
            ) : (
              data.rows.map((row) => (
                <tr key={row.variantId} className="hover:bg-neutral-800/50 transition-colors font-mono text-xs">
                  <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">{row.sku}</td>
                  <td className="py-3 px-4 text-neutral-200 font-sans truncate max-w-[200px]">
                    {row.productName}
                  </td>
                  <td className="py-3 px-4 text-neutral-300 whitespace-nowrap">{row.variantTitle}</td>
                  <td className="py-3 px-4 text-neutral-400 whitespace-nowrap">{row.categoryName}</td>
                  <td className="py-3 px-4 text-center text-neutral-300">{row.physicalStock}</td>
                  <td className="py-3 px-4 text-center text-purple-400">{row.reservedStock}</td>
                  <td className="py-3 px-4 text-center font-bold text-white">{row.availableStock}</td>
                  <td className="py-3 px-4 text-right font-medium text-cyan-400">
                    {formatCurrency(row.fifoValuation)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`px-2.5 py-0.5 rounded text-[10px] uppercase font-mono font-medium ${
                        row.stockStatus === 'IN_STOCK'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : row.stockStatus === 'LOW_STOCK'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}
                    >
                      {row.stockStatus === 'IN_STOCK'
                        ? 'IN STOCK'
                        : row.stockStatus === 'LOW_STOCK'
                        ? 'LOW STOCK'
                        : 'OUT OF STOCK'}
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
          <span className="text-white font-semibold">{data.totalPages}</span> ({data.totalCount} total SKUs)
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
