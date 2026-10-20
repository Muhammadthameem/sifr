import React from 'react';
import { OrderFunnelSummary } from '@/lib/reports/report-service';
import { Package, Clock, Truck, CheckCircle, XCircle } from 'lucide-react';

interface OrderFunnelProps {
  funnel: OrderFunnelSummary;
}

export function OrderFunnel({ funnel }: OrderFunnelProps) {
  const statuses = [
    { key: 'RECEIVED', label: 'Received', count: funnel.received, icon: Clock, color: 'text-amber-400 bg-amber-950/40 border-amber-800/60' },
    { key: 'CONFIRMED', label: 'Confirmed', count: funnel.confirmed, icon: Package, color: 'text-blue-400 bg-blue-950/40 border-blue-800/60' },
    { key: 'DISPATCHED', label: 'Dispatched', count: funnel.dispatched, icon: Truck, color: 'text-purple-400 bg-purple-950/40 border-purple-800/60' },
    { key: 'DELIVERED', label: 'Delivered', count: funnel.delivered, icon: CheckCircle, color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60' },
    { key: 'CANCELLED', label: 'Cancelled', count: funnel.cancelled, icon: XCircle, color: 'text-rose-400 bg-rose-950/40 border-rose-800/60' },
  ];

  return (
    <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl space-y-4">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
        <h3 className="text-sm font-medium text-white tracking-wide flex items-center space-x-2">
          <Package className="w-4 h-4 text-neutral-400" />
          <span>Order Lifecycle & Status Distribution</span>
        </h3>
        <span className="text-xs font-mono text-neutral-400">Total: {funnel.total}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {statuses.map((st) => {
          const Icon = st.icon;
          const pct = funnel.total > 0 ? (st.count / funnel.total) * 100 : 0;

          return (
            <div key={st.key} className={`p-4 rounded-lg border ${st.color} space-y-2`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-300">{st.label}</span>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-2xl font-mono font-semibold text-white">{st.count}</div>
              <div className="w-full bg-neutral-950 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-current h-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </div>
              <div className="text-[10px] font-mono text-neutral-400 text-right">{pct.toFixed(0)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
