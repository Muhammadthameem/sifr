import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import {
  getExecutiveFinancialSummary,
  getOrderFunnelSummary,
  getChannelSummary,
  getInventoryHealthSummary,
  getPaymentSummary,
  getNotificationSummary,
  parseDateRangePreset,
  DEFAULT_LOW_STOCK_THRESHOLD,
} from '@/lib/reports/report-service';
import { SalesChannel } from '@prisma/client';
import { LayoutDashboard } from 'lucide-react';
import { DashboardDateFilter } from '@/components/admin/dashboard/DashboardDateFilter';
import { DashboardKpiGrid } from '@/components/admin/dashboard/DashboardKpiGrid';
import { OrderFunnel } from '@/components/admin/dashboard/OrderFunnel';
import { ChannelSummary } from '@/components/admin/dashboard/ChannelSummary';
import { InventoryHealth } from '@/components/admin/dashboard/InventoryHealth';
import { PaymentSummaryWidget } from '@/components/admin/dashboard/PaymentSummaryWidget';
import { NotificationHealthWidget } from '@/components/admin/dashboard/NotificationHealthWidget';

interface AdminDashboardPageProps {
  searchParams: {
    range?: string;
    channel?: string;
    startDate?: string;
    endDate?: string;
  };
}

export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  const session = await requireAdminAuth();

  const rangePreset = searchParams.range || '30d';
  const channelParam = searchParams.channel || 'ALL';
  const startDateStr = searchParams.startDate || '';
  const endDateStr = searchParams.endDate || '';

  const dateRange = parseDateRangePreset(rangePreset, startDateStr, endDateStr);
  const selectedChannel = channelParam !== 'ALL' ? (channelParam as SalesChannel) : undefined;

  // Execute server-side queries concurrently using centralized report-service
  const [
    financialSummary,
    orderFunnel,
    channelSummary,
    inventoryHealth,
    paymentSummary,
    notificationSummary,
  ] = await Promise.all([
    getExecutiveFinancialSummary(dateRange, selectedChannel),
    getOrderFunnelSummary(dateRange, selectedChannel),
    getChannelSummary(dateRange),
    getInventoryHealthSummary(DEFAULT_LOW_STOCK_THRESHOLD),
    getPaymentSummary(dateRange),
    getNotificationSummary(dateRange),
  ]);

  return (
    <div className="space-y-8 pb-12">
      {/* Top Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-3">
            <LayoutDashboard className="w-6 h-6 text-neutral-400" />
            <span>Executive Dashboard</span>
          </h1>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            Owner Operations • Live Database Snapshot ({session.email})
          </p>
        </div>
      </div>

      {/* Global Date & Channel Filters */}
      <DashboardDateFilter
        currentPreset={rangePreset}
        currentChannel={channelParam}
        currentStartDate={startDateStr}
        currentEndDate={endDateStr}
      />

      {/* 1. Primary Executive KPI Hero & Supporting KPI Grid */}
      <DashboardKpiGrid summary={financialSummary} />

      {/* 2. Order Funnel & Channel Breakdown Grid */}
      <div className="space-y-6">
        <OrderFunnel funnel={orderFunnel} />
        <ChannelSummary channels={channelSummary} />
      </div>

      {/* 3. Inventory Health & Reorder Warning Grid */}
      <InventoryHealth inventory={inventoryHealth} />

      {/* 4. Payment Gateway & Notification Outbox Widgets */}
      <div className="grid grid-cols-1 gap-6">
        <PaymentSummaryWidget payment={paymentSummary} />
        <NotificationHealthWidget notification={notificationSummary} />
      </div>
    </div>
  );
}
