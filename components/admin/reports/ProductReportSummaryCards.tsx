'use client';

import React from 'react';
import { ProductReportSummary } from '@/lib/reports/report-service';
import { PackageCheck, Layers, DollarSign, TrendingUp, PieChart, ShoppingBag, RotateCcw } from 'lucide-react';

interface ProductReportSummaryCardsProps {
  summary: ProductReportSummary;
}

export function ProductReportSummaryCards({ summary }: ProductReportSummaryCardsProps) {
  const formatCurrency = (val: number) =>
    `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      {/* Primary Net Revenue Hero Card */}
      <div className="bg-neutral-900 border border-neutral-800 p-6 sm:p-8 rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-950 border border-purple-800 text-purple-400 rounded-lg flex items-center justify-center">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-mono text-neutral-400 uppercase tracking-widest block">
                Product Performance Metric
              </span>
              <h2 className="text-lg font-medium text-white tracking-tight">PRODUCT NET REVENUE</h2>
            </div>
          </div>
          <span className="px-3 py-1 text-[11px] font-mono rounded bg-purple-950 border border-purple-800 text-purple-300">
            Realized SKU Sales
          </span>
        </div>

        <div className="pt-2">
          <div className="text-4xl sm:text-5xl font-mono font-bold text-white tracking-tight">
            {formatCurrency(summary.netRevenue)}
          </div>
        </div>

        {/* Supporting Breakdown Line Items */}
        <div className="pt-4 border-t border-neutral-800 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          <div className="flex justify-between sm:justify-start sm:space-x-4 bg-neutral-950 p-3 rounded border border-neutral-800">
            <span className="text-neutral-400">Gross Sales:</span>
            <span className="text-white font-semibold">{formatCurrency(summary.grossSales)}</span>
          </div>
          <div className="flex justify-between sm:justify-start sm:space-x-4 bg-neutral-950 p-3 rounded border border-neutral-800">
            <span className="text-neutral-400">Line Refunds Deducted:</span>
            <span className="text-rose-400 font-semibold">-{formatCurrency(summary.refunds)}</span>
          </div>
        </div>
      </div>

      {/* Supporting KPI Grid Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Products */}
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-mono uppercase tracking-wider">Products Sold</span>
            <ShoppingBag className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-white">
            {summary.totalProducts.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-neutral-500 font-sans">Unique products</div>
        </div>

        {/* Total Units Sold */}
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-mono uppercase tracking-wider">Units Sold</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-white">
            {summary.totalUnitsSold.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-neutral-500 font-sans">Total item volume</div>
        </div>

        {/* FIFO COGS */}
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-mono uppercase tracking-wider">FIFO COGS</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-white">
            {formatCurrency(summary.fifoCogs)}
          </div>
          <div className="text-[11px] text-neutral-500 font-sans">Acquisition cost</div>
        </div>

        {/* Gross Margin ($) */}
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-mono uppercase tracking-wider">Gross Margin ($)</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-white">
            {formatCurrency(summary.grossMargin)}
          </div>
          <div className="text-[11px] text-neutral-500 font-sans">Net Rev - FIFO COGS</div>
        </div>

        {/* Gross Margin (%) */}
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-mono uppercase tracking-wider">Gross Margin (%)</span>
            <PieChart className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-white">
            {summary.grossMarginPercent.toFixed(1)}%
          </div>
          <div className="text-[11px] text-neutral-500 font-sans">Profitability ratio</div>
        </div>
      </div>
    </div>
  );
}
