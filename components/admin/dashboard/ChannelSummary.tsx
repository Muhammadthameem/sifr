import React from 'react';
import { ChannelSummaryItem } from '@/lib/reports/report-service';
import { Globe, Store } from 'lucide-react';

interface ChannelSummaryProps {
  channels: ChannelSummaryItem[];
}

export function ChannelSummary({ channels }: ChannelSummaryProps) {
  const online = channels.find((c) => c.channel === 'ONLINE') || { orderCount: 0, grossSales: 0, netRevenue: 0 };
  const direct = channels.find((c) => c.channel === 'DIRECT') || { orderCount: 0, grossSales: 0, netRevenue: 0 };

  const formatCurrency = (val: number) =>
    `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl space-y-4">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
        <h3 className="text-sm font-medium text-white tracking-wide">Channel Revenue Breakdown</h3>
        <span className="text-xs font-mono text-neutral-400">Online vs Direct POS</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
        {/* Online Storefront */}
        <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-white tracking-wider">ONLINE STOREFRONT</span>
            </div>
            <span className="px-2 py-0.5 text-[10px] rounded bg-neutral-800 text-neutral-300">
              {online.orderCount} Orders
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-neutral-400">
              <span>Gross Sales:</span>
              <span className="text-white">{formatCurrency(online.grossSales)}</span>
            </div>
            <div className="flex justify-between text-neutral-400 pt-1 border-t border-neutral-900">
              <span className="font-semibold text-white">Net Revenue:</span>
              <span className="font-semibold text-emerald-400">{formatCurrency(online.netRevenue)}</span>
            </div>
          </div>
        </div>

        {/* Direct Sales (POS) */}
        <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Store className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-white tracking-wider">DIRECT SALES (POS)</span>
            </div>
            <span className="px-2 py-0.5 text-[10px] rounded bg-neutral-800 text-neutral-300">
              {direct.orderCount} Orders
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-neutral-400">
              <span>Gross Sales:</span>
              <span className="text-white">{formatCurrency(direct.grossSales)}</span>
            </div>
            <div className="flex justify-between text-neutral-400 pt-1 border-t border-neutral-900">
              <span className="font-semibold text-white">Net Revenue:</span>
              <span className="font-semibold text-emerald-400">{formatCurrency(direct.netRevenue)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
