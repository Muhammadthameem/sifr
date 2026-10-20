import React from 'react';
import { NotificationSummary } from '@/lib/reports/report-service';
import { MessageSquare, CheckCircle, AlertTriangle, Clock, XCircle } from 'lucide-react';

interface NotificationHealthWidgetProps {
  notification: NotificationSummary;
}

export function NotificationHealthWidget({ notification }: NotificationHealthWidgetProps) {
  const statuses = [
    { key: 'SENT', label: 'Sent', count: notification.statusCounts.SENT || 0, icon: CheckCircle, color: 'text-emerald-400' },
    { key: 'PENDING', label: 'Pending', count: notification.statusCounts.PENDING || 0, icon: Clock, color: 'text-amber-400' },
    { key: 'PROCESSING', label: 'Processing', count: notification.statusCounts.PROCESSING || 0, icon: Clock, color: 'text-blue-400' },
    { key: 'FAILED', label: 'Failed', count: notification.statusCounts.FAILED || 0, icon: XCircle, color: 'text-rose-400' },
    { key: 'REQUIRES_RECONCILIATION', label: 'Reconcile Needed', count: notification.statusCounts.REQUIRES_RECONCILIATION || 0, icon: AlertTriangle, color: 'text-purple-400' },
  ];

  return (
    <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl space-y-4">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
        <h3 className="text-sm font-medium text-white tracking-wide flex items-center space-x-2">
          <MessageSquare className="w-4 h-4 text-neutral-400" />
          <span>Notification Outbox Health</span>
        </h3>
        <span className="text-xs font-mono text-neutral-400">Total Notifications: {notification.totalNotifications}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
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
