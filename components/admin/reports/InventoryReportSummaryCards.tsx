'use client';

import React from 'react';
import { InventoryReportSummary } from '@/lib/reports/report-service';
import { Layers, Package, Lock, CheckCircle2, AlertTriangle, AlertCircle, DollarSign } from 'lucide-react';

interface InventoryReportSummaryCardsProps {
  summary: InventoryReportSummary;
}

export function InventoryReportSummaryCards({ summary }: InventoryReportSummaryCardsProps) {
  const formatCurrency = (val: number) =>
    `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      {/* 1. Total SKUs */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[11px] font-mono uppercase tracking-wider">Total SKUs</span>
          <Layers className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="text-xl font-bold font-mono text-white">{summary.totalSkus}</div>
        <p className="text-[10px] text-neutral-500 font-mono">Catalog Variants</p>
      </div>

      {/* 2. Physical Stock */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[11px] font-mono uppercase tracking-wider">Physical</span>
          <Package className="w-4 h-4 text-neutral-300" />
        </div>
        <div className="text-xl font-bold font-mono text-white">{summary.totalPhysicalUnits}</div>
        <p className="text-[10px] text-neutral-500 font-mono">Units On Hand</p>
      </div>

      {/* 3. Reserved Stock */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[11px] font-mono uppercase tracking-wider">Reserved</span>
          <Lock className="w-4 h-4 text-purple-400" />
        </div>
        <div className="text-xl font-bold font-mono text-purple-300">{summary.totalReservedUnits}</div>
        <p className="text-[10px] text-neutral-500 font-mono">Pending Dispatch</p>
      </div>

      {/* 4. Available Stock */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[11px] font-mono uppercase tracking-wider">Available</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="text-xl font-bold font-mono text-emerald-400">{summary.totalAvailableUnits}</div>
        <p className="text-[10px] text-neutral-500 font-mono">Ready to Sell</p>
      </div>

      {/* 5. Out of Stock */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[11px] font-mono uppercase tracking-wider">Out of Stock</span>
          <AlertCircle className="w-4 h-4 text-rose-400" />
        </div>
        <div className="text-xl font-bold font-mono text-rose-400">{summary.outOfStockCount}</div>
        <p className="text-[10px] text-neutral-500 font-mono">0 Units Left</p>
      </div>

      {/* 6. Low Stock */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[11px] font-mono uppercase tracking-wider">Low Stock</span>
          <AlertTriangle className="w-4 h-4 text-amber-400" />
        </div>
        <div className="text-xl font-bold font-mono text-amber-400">{summary.lowStockCount}</div>
        <p className="text-[10px] text-neutral-500 font-mono">&le; 5 Units Remaining</p>
      </div>

      {/* 7. FIFO Valuation */}
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-2 col-span-2 md:col-span-4 lg:col-span-1">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[11px] font-mono uppercase tracking-wider">FIFO Value</span>
          <DollarSign className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="text-xl font-bold font-mono text-cyan-400">
          {formatCurrency(summary.inventoryFifoValuation)}
        </div>
        <p className="text-[10px] text-neutral-500 font-mono">Active Layer Cost</p>
      </div>
    </div>
  );
}
