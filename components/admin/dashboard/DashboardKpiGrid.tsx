import React from 'react';
import { ExecutiveFinancialSummary } from '@/lib/reports/report-service';
import { DollarSign, ShoppingCart, TrendingUp, Layers, PieChart, Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface DashboardKpiGridProps {
  summary: ExecutiveFinancialSummary;
}

export function DashboardKpiGrid({ summary }: DashboardKpiGridProps) {
  const formatCurrency = (val: number) =>
    `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const totalExpenses = summary.totalExpenses ?? 0;
  const netProfit = summary.netProfit ?? (summary.grossMargin - totalExpenses);

  return (
    <div className="space-y-6">
      {/* 1. PRIMARY HERO KPI CARD: NET REVENUE */}
      <div className="bg-neutral-900 border border-neutral-800 p-6 sm:p-8 rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-emerald-950 border border-emerald-800 text-emerald-400 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-mono text-neutral-400 uppercase tracking-widest block">
                Primary Executive Metric
              </span>
              <h2 className="text-lg font-medium text-white tracking-tight">NET REVENUE</h2>
            </div>
          </div>
          <span className="px-3 py-1 text-[11px] font-mono rounded bg-emerald-950 border border-emerald-800 text-emerald-300">
            Attributed Realized
          </span>
        </div>

        <div className="pt-2">
          <div className="text-4xl sm:text-5xl font-mono font-bold text-white tracking-tight">
            {formatCurrency(summary.netRevenue)}
          </div>
        </div>

        {/* Supporting Breakdown Line Items: Full 7-Step Waterfall Flow */}
        <div className="pt-4 border-t border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider">
              Profit Waterfall & Calculation Flow
            </span>
            <span className="text-[11px] font-mono text-neutral-500 hidden md:inline">
              Net Revenue → Gross Profit → Net Profit
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs font-mono">
            {/* 1. Gross Sales */}
            <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                <span className="truncate">Gross Sales</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-800 shrink-0 ml-1">
                  1. Base
                </span>
              </div>
              <div className="mt-2 text-sm font-semibold text-white truncate">
                {formatCurrency(summary.grossSales)}
              </div>
              <div className="mt-1 text-[10px] text-neutral-500 truncate">Total sales billed</div>
            </div>

            {/* 2. Refunds Deducted */}
            <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                <span className="truncate">Refunds</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-900/60 shrink-0 ml-1">
                  − Deduct
                </span>
              </div>
              <div className="mt-2 text-sm font-semibold text-rose-400 truncate">
                -{formatCurrency(summary.refunds)}
              </div>
              <div className="mt-1 text-[10px] text-neutral-500 truncate">Returns & refunds</div>
            </div>

            {/* 3. Net Revenue */}
            <div className="bg-neutral-950 p-3 rounded-lg border border-emerald-900/50 bg-emerald-950/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                <span className="text-emerald-300 font-medium truncate">Net Revenue</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0 ml-1">
                  = Subtotal
                </span>
              </div>
              <div className="mt-2 text-sm font-semibold text-emerald-300 truncate">
                {formatCurrency(summary.netRevenue)}
              </div>
              <div className="mt-1 text-[10px] text-neutral-500 truncate">Sales − Refunds</div>
            </div>

            {/* 4. FIFO COGS */}
            <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                <span className="truncate">FIFO COGS</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-900/60 shrink-0 ml-1">
                  − Cost
                </span>
              </div>
              <div className="mt-2 text-sm font-semibold text-purple-400 truncate">
                -{formatCurrency(summary.fifoCogs)}
              </div>
              <div className="mt-1 text-[10px] text-neutral-500 truncate">Acquisition cost</div>
            </div>

            {/* 5. Gross Profit */}
            <div className="bg-neutral-950 p-3 rounded-lg border border-emerald-900/50 bg-emerald-950/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                <span className="text-emerald-300 font-medium truncate">Gross Profit</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0 ml-1">
                  = Gross
                </span>
              </div>
              <div className="mt-2 text-sm font-semibold text-emerald-300 truncate">
                {formatCurrency(summary.grossMargin)}
              </div>
              <div className="mt-1 text-[10px] text-neutral-500 truncate">Revenue − COGS</div>
            </div>

            {/* 6. Operating Expenses */}
            <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                <span className="truncate">Expenses</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-900/60 shrink-0 ml-1">
                  − Overheads
                </span>
              </div>
              <div className="mt-2 text-sm font-semibold text-amber-400 truncate">
                -{formatCurrency(totalExpenses)}
              </div>
              <div className="mt-1 text-[10px] text-neutral-500 truncate">Operating expenses</div>
            </div>

            {/* 7. Net Profit */}
            <div
              className={`p-3 rounded-lg border flex flex-col justify-between ${
                netProfit >= 0
                  ? 'bg-emerald-950/20 border-emerald-700/60'
                  : 'bg-rose-950/20 border-rose-700/60'
              }`}
            >
              <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                <span
                  className={`truncate ${
                    netProfit >= 0 ? 'text-emerald-300 font-semibold' : 'text-rose-300 font-semibold'
                  }`}
                >
                  Net Profit
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ml-1 ${
                    netProfit >= 0
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : 'bg-rose-950 text-rose-300 border-rose-800'
                  }`}
                >
                  = Net
                </span>
              </div>
              <div
                className={`mt-2 text-sm font-bold truncate ${
                  netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatCurrency(netProfit)}
              </div>
              <div className="mt-1 text-[10px] text-neutral-500 truncate">Gross Profit − Expenses</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. SUPPORTING KPI GRID CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Total Orders */}
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-mono uppercase tracking-wider">Total Orders</span>
            <ShoppingCart className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-white">
            {summary.totalOrders.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-neutral-500 font-sans">Non-cancelled orders</div>
        </div>

        {/* Average Order Value (AOV) */}
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-mono uppercase tracking-wider">AOV</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-white">
            {formatCurrency(summary.aov)}
          </div>
          <div className="text-[11px] text-neutral-500 font-sans">Net revenue / Order</div>
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

        {/* Gross Profit */}
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-mono uppercase tracking-wider">Gross Profit</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-white">
            {formatCurrency(summary.grossMargin)}
          </div>
          <div className="text-[11px] text-neutral-500 font-sans">
            Margin: {summary.grossMarginPercent.toFixed(1)}%
          </div>
        </div>

        {/* Operating Expenses */}
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-mono uppercase tracking-wider">Expenses</span>
            <Wallet className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-amber-300">
            {formatCurrency(totalExpenses)}
          </div>
          <div className="text-[11px] text-neutral-500 font-sans">Operating expenses</div>
        </div>

        {/* Net Profit */}
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-mono uppercase tracking-wider">Net Profit</span>
            {netProfit >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <div
            className={`text-2xl font-mono font-semibold ${
              netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatCurrency(netProfit)}
          </div>
          <div className="text-[11px] text-neutral-500 font-sans">Gross Profit - Expenses</div>
        </div>
      </div>
    </div>
  );
}
