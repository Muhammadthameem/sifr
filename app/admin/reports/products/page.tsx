import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import {
  getProductReportRows,
  getProductReportSummary,
  parseDateRangePreset,
  ProductReportFilterOptions,
} from '@/lib/reports/report-service';
import { PackageCheck, FileText } from 'lucide-react';
import { ProductReportSummaryCards } from '@/components/admin/reports/ProductReportSummaryCards';
import { ProductReportFilterBar } from '@/components/admin/reports/ProductReportFilterBar';
import { ProductReportTable } from '@/components/admin/reports/ProductReportTable';

interface ProductReportPageProps {
  searchParams: {
    range?: string;
    search?: string;
    category?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
  };
}

export default async function ProductReportPage({ searchParams }: ProductReportPageProps) {
  const session = await requireAdminAuth();

  const rangePreset = searchParams.range || '30d';
  const searchStr = searchParams.search || '';
  const categoryParam = searchParams.category || 'ALL';
  const startDateStr = searchParams.startDate || '';
  const endDateStr = searchParams.endDate || '';
  const pageNum = parseInt(searchParams.page || '1', 10) || 1;

  const dateRange = parseDateRangePreset(rangePreset, startDateStr, endDateStr);

  const filterOptions: ProductReportFilterOptions = {
    dateRange,
    search: searchStr,
    category: categoryParam,
    page: pageNum,
    pageSize: 25,
  };

  // Fetch summary KPI metrics & paginated product performance rows concurrently
  const [summary, reportData] = await Promise.all([
    getProductReportSummary(filterOptions),
    getProductReportRows(filterOptions),
  ]);

  return (
    <div className="space-y-8 pb-12">
      {/* Page Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-3">
            <PackageCheck className="w-6 h-6 text-purple-400" />
            <span>Product Performance Report</span>
          </h1>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            SKU Sales Velocity • Product Net Revenue & FIFO Margins ({session.email})
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <ProductReportFilterBar
        currentPreset={rangePreset}
        currentSearch={searchStr}
        currentStartDate={startDateStr}
        currentEndDate={endDateStr}
      />

      {/* Summary KPI Grid */}
      <div className="space-y-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400 flex items-center space-x-2">
          <FileText className="w-4 h-4 text-cyan-400" />
          <span>Filtered Product Performance Summary ({summary.totalProducts} Unique Products Sold)</span>
        </h2>
        <ProductReportSummaryCards summary={summary} />
      </div>

      {/* Product Performance Table */}
      <div className="space-y-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400">
          Product Performance Ledger ({reportData.totalCount} Products)
        </h2>
        <ProductReportTable data={reportData} />
      </div>
    </div>
  );
}
