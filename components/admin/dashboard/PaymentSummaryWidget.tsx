import React from 'react';
import { PaymentSummary } from '@/lib/reports/report-service';
import { CreditCard, CheckCircle, AlertTriangle, Clock, XCircle } from 'lucide-react';

interface PaymentSummaryWidgetProps {
  payment: PaymentSummary;
}

export function PaymentSummaryWidget({ payment }: PaymentSummaryWidgetProps) {
  const statuses = [
    { key: 'SUCCESS', label: 'Success', count: payment.statusCounts.SUCCESS || 0, icon: CheckCircle, color: 'text-emerald-400' },
    { key: 'FAILED', label: 'Failed', count: payment.statusCounts.FAILED || 0, icon: XCircle, color: 'text-rose-400' },
    { key: 'INITIATED', label: 'Initiated', count: payment.statusCounts.INITIATED || 0, icon: Clock, color: 'text-amber-400' },
    { key: 'PROCESSING', label: 'Processing', count: payment.statusCounts.PROCESSING || 0, icon: Clock, color: 'text-blue-400' },
    { key: 'EXPIRED', label: 'Expired', count: payment.statusCounts.EXPIRED || 0, icon: Clock, color: 'text-neutral-400' },
    { key: 'REQUIRES_RECONCILIATION', label: 'Reconcile Needed', count: payment.statusCounts.REQUIRES_RECONCILIATION || 0, icon: AlertTriangle, color: 'text-purple-400' },
  ];

  return (
    <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl space-y-4">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
        <h3 className="text-sm font-medium text-white tracking-wide flex items-center space-x-2">
          <CreditCard className="w-4 h-4 text-neutral-400" />
          <span>Payment Gateway Status</span>
        </h3>
        <span className="text-xs font-mono text-neutral-400">Total Attempts: {payment.totalAttempts}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
        {statuses.map((st) => {
          const Icon = st.icon;

          return (
            <div key={st.key} className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider">{st.label}</span>
                <Icon className={`w-3.5 h-3.5 ${st.color}`} />
              </div>
              <span className={`text-lg font-semibold block ${st.color}`}>{st.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
