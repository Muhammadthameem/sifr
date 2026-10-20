import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import {
  getRefundReportRows,
  getReturnRequestRows,
  getReturnsReportSummary,
  parseDateRangePreset,
  ReturnsReportFilterOptions,
} from '@/lib/reports/report-service';
import { OrderStatus, RefundStatus, ReturnStatus } from '@prisma/client';
import { RotateCcw, FileText } from 'lucide-react';
import { ReturnsReportFilterBar } from '@/components/admin/reports/ReturnsReportFilterBar';
import { ReturnsReportSummaryCards } from '@/components/admin/reports/ReturnsReportSummaryCards';
import { ReturnsReportTables } from '@/components/admin/reports/ReturnsReportTables';

interface ReturnsReportPageProps {
  searchParams: {
    range?: string;
    status?: string;
    refundStatus?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
  };
}

export default async function ReturnsReportPage({ searchParams }: ReturnsReportPageProps) {
  const session = await requireAdminAuth();

  const rangePreset = searchParams.range || '30d';
  const statusParam = searchParams.status || 'ALL';
  const refundStatusParam = searchParams.refundStatus || 'ALL';
  const searchStr = searchParams.search || '';
  const startDateStr = searchParams.startDate || '';
  const endDateStr = searchParams.endDate || '';
  const pageNum = parseInt(searchParams.page || '1', 10) || 1;

  const dateRange = parseDateRangePreset(rangePreset, startDateStr, endDateStr);

  const filterOptions: ReturnsReportFilterOptions = {
    dateRange,
    status: statusParam as ReturnStatus | 'ALL',
    refundStatus: refundStatusParam as RefundStatus | 'ALL',
    search: searchStr,
    page: pageNum,
    pageSize: 25,
  };

  // Fetch summary KPI metrics, paginated return requests, and paginated refunds concurrently
  const [summary, returnRequestsData, refundsData] = await Promise.all([
    getReturnsReportSummary(filterOptions),
    getReturnRequestRows(filterOptions),
    getRefundReportRows(filterOptions),
  ]);

  return (
    <div className="space-y-8 pb-12">
      {/* Page Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-3">
            <RotateCcw className="w-6 h-6 text-amber-400" />
            <span>Returns & Refunds Report</span>
          </h1>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            Customer Return Requests • Inspection Restocking • Financial Refund Ledger ({session.email})
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <ReturnsReportFilterBar
        currentPreset={rangePreset}
        currentStatus={statusParam}
        currentRefundStatus={refundStatusParam}
        currentSearch={searchStr}
        currentStartDate={startDateStr}
        currentEndDate={endDateStr}
      />

      {/* Overview KPI Cards */}
      <div className="space-y-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400 flex items-center space-x-2">
          <FileText className="w-4 h-4 text-cyan-400" />
          <span>Filtered Returns & Refunds Summary</span>
        </h2>
        <ReturnsReportSummaryCards summary={summary} />
      </div>

      {/* Tabbed Returns & Refunds Ledgers */}
      <ReturnsReportTables returnRequests={returnRequestsData} refunds={refundsData} />
    </div>
  );
}
