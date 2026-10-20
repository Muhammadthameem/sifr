'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Filter, X } from 'lucide-react';

interface InventoryReportFilterBarProps {
  currentSearch?: string;
  currentStockStatus?: string;
}

export function InventoryReportFilterBar({
  currentSearch = '',
  currentStockStatus = 'ALL',
}: InventoryReportFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(currentSearch);
  const [stockStatus, setStockStatus] = useState(currentStockStatus);

  const applyFilters = (newSearch = search, newStatus = stockStatus) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (newSearch.trim()) {
      params.set('search', newSearch.trim());
    } else {
      params.delete('search');
    }

    params.set('stockStatus', newStatus);
    params.set('page', '1'); // Reset to page 1 on filter change

    router.push(`/admin/reports/inventory?${params.toString()}`);
  };

  const clearFilters = () => {
    setSearch('');
    setStockStatus('ALL');
    router.push('/admin/reports/inventory');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters(search, stockStatus);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 flex-1 min-w-[240px]">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by SKU, Product name, or Variant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 text-white rounded pl-9 pr-3 py-1.5 font-sans focus:outline-none focus:ring-1 focus:ring-neutral-700"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded font-mono font-medium transition-colors"
          >
            Search
          </button>
        </form>

        {/* Stock Status Filter */}
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-neutral-400" />
          <span className="text-neutral-400 font-medium">Stock Status:</span>
          <select
            value={stockStatus}
            onChange={(e) => {
              const val = e.target.value;
              setStockStatus(val);
              applyFilters(search, val);
            }}
            className="bg-neutral-950 border border-neutral-800 text-white rounded px-3 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-neutral-700"
            aria-label="Stock Status Filter"
          >
            <option value="ALL">All Stock Levels</option>
            <option value="IN_STOCK">In Stock (&gt; 5)</option>
            <option value="LOW_STOCK">Low Stock (&le; 5)</option>
            <option value="OUT_OF_STOCK">Out of Stock (0)</option>
          </select>
        </div>

        {/* Clear Filters CTA */}
        <button
          type="button"
          onClick={clearFilters}
          className="flex items-center space-x-1 px-3 py-1.5 bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white rounded font-mono text-[11px] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
}
