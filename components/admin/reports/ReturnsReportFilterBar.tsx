'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, Search, Filter, X } from 'lucide-react';

interface ReturnsReportFilterBarProps {
  currentPreset?: string;
  currentStatus?: string;
  currentRefundStatus?: string;
  currentSearch?: string;
  currentStartDate?: string;
  currentEndDate?: string;
}

export function ReturnsReportFilterBar({
  currentPreset = '30d',
  currentStatus = 'ALL',
  currentRefundStatus = 'ALL',
  currentSearch = '',
  currentStartDate = '',
  currentEndDate = '',
}: ReturnsReportFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [preset, setPreset] = useState(currentPreset);
  const [status, setStatus] = useState(currentStatus);
  const [refundStatus, setRefundStatus] = useState(currentRefundStatus);
  const [search, setSearch] = useState(currentSearch);
  const [startDate, setStartDate] = useState(currentStartDate);
  const [endDate, setEndDate] = useState(currentEndDate);

  const applyFilters = (
    newPreset = preset,
    newStatus = status,
    newRefundStatus = refundStatus,
    newSearch = search,
    start = startDate,
    end = endDate
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', newPreset);
    params.set('status', newStatus);
    params.set('refundStatus', newRefundStatus);

    if (newSearch.trim()) {
      params.set('search', newSearch.trim());
    } else {
      params.delete('search');
    }

    params.set('page', '1');

    if (newPreset === 'custom') {
      if (start) params.set('startDate', start);
      else params.delete('startDate');

      if (end) params.set('endDate', end);
      else params.delete('endDate');
    } else {
      params.delete('startDate');
      params.delete('endDate');
    }

    router.push(`/admin/reports/returns?${params.toString()}`);
  };

  const clearFilters = () => {
    setPreset('30d');
    setStatus('ALL');
    setRefundStatus('ALL');
    setSearch('');
    setStartDate('');
    setEndDate('');
    router.push('/admin/reports/returns');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters(preset, status, refundStatus, search, startDate, endDate);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 flex-1 min-w-[240px]">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Return #, Order #, or Customer Mobile..."
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

        {/* Date Preset */}
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-neutral-400" />
          <span className="text-neutral-400 font-medium">Date Range:</span>
          <select
            value={preset}
            onChange={(e) => {
              const val = e.target.value;
              setPreset(val);
              applyFilters(val, status, refundStatus, search, startDate, endDate);
            }}
            className="bg-neutral-950 border border-neutral-800 text-white rounded px-3 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-neutral-700"
            aria-label="Date Range Preset"
          >
            <option value="30d">Last 30 Days</option>
            <option value="7d">Last 7 Days</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Previous Month</option>
            <option value="this_year">This Year</option>
            <option value="all">All Time</option>
            <option value="custom">Custom Range...</option>
          </select>
        </div>

        {/* Return Status Filter */}
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-neutral-400" />
          <span className="text-neutral-400 font-medium">Return Status:</span>
          <select
            value={status}
            onChange={(e) => {
              const val = e.target.value;
              setStatus(val);
              applyFilters(preset, val, refundStatus, search, startDate, endDate);
            }}
            className="bg-neutral-950 border border-neutral-800 text-white rounded px-3 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-neutral-700"
            aria-label="Return Status Filter"
          >
            <option value="ALL">All Return Statuses</option>
            <option value="REQUESTED">REQUESTED</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="RECEIVED">RECEIVED</option>
            <option value="INSPECTED">INSPECTED</option>
            <option value="RESOLVED">RESOLVED</option>
          </select>
        </div>

        {/* Refund Status Filter */}
        <div className="flex items-center space-x-2">
          <span className="text-neutral-400 font-medium">Refund Status:</span>
          <select
            value={refundStatus}
            onChange={(e) => {
              const val = e.target.value;
              setRefundStatus(val);
              applyFilters(preset, status, val, search, startDate, endDate);
            }}
            className="bg-neutral-950 border border-neutral-800 text-white rounded px-3 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-neutral-700"
            aria-label="Refund Status Filter"
          >
            <option value="ALL">All Refund Statuses</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="MANUALLY_RESOLVED">MANUALLY_RESOLVED</option>
            <option value="PENDING">PENDING</option>
            <option value="FAILED">FAILED</option>
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

      {/* Custom Date Inputs */}
      {preset === 'custom' && (
        <div className="flex items-center space-x-3 pt-2 border-t border-neutral-800">
          <span className="text-neutral-400">Custom Dates:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 text-white rounded px-3 py-1"
          />
          <span className="text-neutral-500">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 text-white rounded px-3 py-1"
          />
          <button
            type="button"
            onClick={() => applyFilters('custom', status, refundStatus, search, startDate, endDate)}
            className="px-3 py-1 bg-neutral-800 text-white rounded font-mono font-medium hover:bg-neutral-700"
          >
            Apply Range
          </button>
        </div>
      )}
    </div>
  );
}
