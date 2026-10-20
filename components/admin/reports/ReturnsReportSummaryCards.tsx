'use client';

import React from 'react';
import { ReturnsReportSummary } from '@/lib/reports/report-service';
import { RotateCcw, PackageCheck, RefreshCw, AlertTriangle, DollarSign, Layers } from 'lucide-react';

interface ReturnsReportSummaryCardsProps {
  summary: ReturnsReportSummary;
}

export function ReturnsReportSummaryCards({ summary }: ReturnsReportSummaryCardsProps) {
  const formatCurrency = (val: number) =>
    `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      {/* 1. Return Requests */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[11px] font-mono uppercase tracking-wider">Requests</span>
          <RotateCcw className="w-4 h-4 text-amber-400" />
        </div>
        <div className="text-xl font-bold font-mono text-white">{summary.totalReturnRequests}</div>
        <p className="text-[10px] text-neutral-500 font-mono">Total Submitted</p>
      </div>

      {/* 2. Units Requested */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[11px] font-mono uppercase tracking-wider">Requested Qty</span>
          <Layers className="w-4 h-4 text-neutral-300" />
        </div>
        <div className="text-xl font-bold font-mono text-white">{summary.totalUnitsRequested}</div>
        <p className="text-[10px] text-neutral-500 font-mono">Item Units</p>
      </div>

      {/* 3. Units Received */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[11px] font-mono uppercase tracking-wider">Received Qty</span>
          <PackageCheck className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="text-xl font-bold font-mono text-cyan-300">{summary.totalUnitsReceived}</div>
        <p className="text-[10px] text-neutral-500 font-mono">In Warehouse</p>
      </div>

      {/* 4. Units Restocked */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[11px] font-mono uppercase tracking-wider">Restocked</span>
          <RefreshCw className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="text-xl font-bold font-mono text-emerald-400">{summary.totalUnitsRestocked}</div>
        <p className="text-[10px] text-neutral-500 font-mono">LIFO Restored</p>
      </div>

      {/* 5. Units Damaged */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[11px] font-mono uppercase tracking-wider">Damaged</span>
          <AlertTriangle className="w-4 h-4 text-rose-400" />
        </div>
        <div className="text-xl font-bold font-mono text-rose-400">{summary.totalUnitsDamaged}</div>
        <p className="text-[10px] text-neutral-500 font-mono">Scrapped / Written Off</p>
      </div>

      {/* 6. Total Exchanges */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[11px] font-mono uppercase tracking-wider">Exchanges</span>
          <RefreshCw className="w-4 h-4 text-purple-400" />
        </div>
        <div className="text-xl font-bold font-mono text-purple-300">{summary.totalExchanges}</div>
        <p className="text-[10px] text-neutral-500 font-mono">Variant Swaps</p>
      </div>

      {/* 7. Total Refund Amount */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-2 col-span-2 md:col-span-4 lg:col-span-1">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[11px] font-mono uppercase tracking-wider">Refunds Paid</span>
          <DollarSign className="w-4 h-4 text-rose-400" />
        </div>
        <div className="text-xl font-bold font-mono text-rose-400">
          {formatCurrency(summary.totalRefundAmount)}
        </div>
        <p className="text-[10px] text-neutral-500 font-mono">Qualifying Refunds</p>
      </div>
    </div>
  );
}
