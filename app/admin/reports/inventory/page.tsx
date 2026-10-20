import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import {
  getInventoryReportRows,
  getInventoryReportSummary,
  InventoryReportFilterOptions,
} from '@/lib/reports/report-service';
import { Layers, FileText } from 'lucide-react';
import { InventoryReportFilterBar } from '@/components/admin/reports/InventoryReportFilterBar';
import { InventoryReportSummaryCards } from '@/components/admin/reports/InventoryReportSummaryCards';
import { InventoryReportTable } from '@/components/admin/reports/InventoryReportTable';

interface InventoryReportPageProps {
  searchParams: {
    search?: string;
    category?: string;
    stockStatus?: string;
    page?: string;
  };
}

export default async function InventoryReportPage({ searchParams }: InventoryReportPageProps) {
  const session = await requireAdminAuth();

  const searchStr = searchParams.search || '';
  const categoryParam = searchParams.category || 'ALL';
  const stockStatusParam = (searchParams.stockStatus || 'ALL') as 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  const pageNum = parseInt(searchParams.page || '1', 10) || 1;

  const filterOptions: InventoryReportFilterOptions = {
    search: searchStr,
    category: categoryParam,
    stockStatus: stockStatusParam,
    page: pageNum,
    pageSize: 25,
  };

  // Fetch inventory summary & paginated rows concurrently using report-service
  const [summary, reportData] = await Promise.all([
    getInventoryReportSummary(),
    getInventoryReportRows(filterOptions),
  ]);

  return (
    <div className="space-y-8 pb-12">
      {/* Page Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-3">
            <Layers className="w-6 h-6 text-cyan-400" />
            <span>Inventory Valuation & Health Report</span>
          </h1>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            Current Stock Snapshot • Physical, Reserved & FIFO Layer Valuation ({session.email})
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <InventoryReportFilterBar
        currentSearch={searchStr}
        currentStockStatus={stockStatusParam}
      />

      {/* Overview KPI Cards */}
      <div className="space-y-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400 flex items-center space-x-2">
          <FileText className="w-4 h-4 text-cyan-400" />
          <span>Current Inventory Health & Valuation</span>
        </h2>
        <InventoryReportSummaryCards summary={summary} />
      </div>

      {/* Detailed SKU Inventory Ledger Table */}
      <div className="space-y-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400">
          SKU Inventory Ledger ({reportData.totalCount} Variants)
        </h2>
        <InventoryReportTable data={reportData} />
      </div>
    </div>
  );
}
