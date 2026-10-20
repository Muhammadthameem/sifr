import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import {
  getSalesReportRows,
  getSalesReportSummary,
  parseDateRangePreset,
  SalesReportFilterOptions,
} from '@/lib/reports/report-service';
import { OrderStatus, PaymentStatus, SalesChannel } from '@prisma/client';
import { TrendingUp, FileText } from 'lucide-react';
import { DashboardKpiGrid } from '@/components/admin/dashboard/DashboardKpiGrid';
import { SalesReportFilterBar } from '@/components/admin/reports/SalesReportFilterBar';
import { SalesReportTable } from '@/components/admin/reports/SalesReportTable';

interface SalesReportPageProps {
  searchParams: {
    range?: string;
    channel?: string;
    orderStatus?: string;
    paymentStatus?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
  };
}

export default async function SalesReportPage({ searchParams }: SalesReportPageProps) {
  const session = await requireAdminAuth();

  const rangePreset = searchParams.range || '30d';
  const channelParam = searchParams.channel || 'ALL';
  const orderStatusParam = searchParams.orderStatus || 'ALL';
  const paymentStatusParam = searchParams.paymentStatus || 'ALL';
  const startDateStr = searchParams.startDate || '';
  const endDateStr = searchParams.endDate || '';
  const pageNum = parseInt(searchParams.page || '1', 10) || 1;

  const dateRange = parseDateRangePreset(rangePreset, startDateStr, endDateStr);

  const filterOptions: SalesReportFilterOptions = {
    dateRange,
    channel: channelParam as SalesChannel | 'ALL',
    orderStatus: orderStatusParam as OrderStatus | 'ALL',
    paymentStatus: paymentStatusParam as PaymentStatus | 'ALL',
    page: pageNum,
    pageSize: 25,
  };

  // Fetch report summary metrics & row-level paginated data concurrently
  const [summary, reportData] = await Promise.all([
    getSalesReportSummary(filterOptions),
    getSalesReportRows(filterOptions),
  ]);

  return (
    <div className="space-y-8 pb-12">
      {/* Page Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-3">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            <span>Sales & Revenue Report</span>
          </h1>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            Authoritative Sales Cohorts • Net Revenue & FIFO Margins ({session.email})
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <SalesReportFilterBar
        currentPreset={rangePreset}
        currentChannel={channelParam}
        currentOrderStatus={orderStatusParam}
        currentPaymentStatus={paymentStatusParam}
        currentStartDate={startDateStr}
        currentEndDate={endDateStr}
      />

      {/* Summary KPI Grid (using exact authoritative formulas from report-service) */}
      <div className="space-y-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400 flex items-center space-x-2">
          <FileText className="w-4 h-4 text-cyan-400" />
          <span>Filtered Sales Summary</span>
        </h2>
        <DashboardKpiGrid summary={summary} />
      </div>

      {/* Detailed Order Sales Table */}
      <div className="space-y-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400">
          Order Sales Ledger ({reportData.totalCount} Qualifying Orders)
        </h2>
        <SalesReportTable data={reportData} />
      </div>
    </div>
  );
}
