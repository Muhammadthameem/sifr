'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, Filter } from 'lucide-react';

interface DashboardDateFilterProps {
  currentPreset?: string;
  currentChannel?: string;
  currentStartDate?: string;
  currentEndDate?: string;
}

export function DashboardDateFilter({
  currentPreset = '30d',
  currentChannel = 'ALL',
  currentStartDate = '',
  currentEndDate = '',
}: DashboardDateFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [preset, setPreset] = useState(currentPreset);
  const [channel, setChannel] = useState(currentChannel);
  const [startDate, setStartDate] = useState(currentStartDate);
  const [endDate, setEndDate] = useState(currentEndDate);

  const applyFilters = (newPreset = preset, newChannel = channel, start = startDate, end = endDate) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', newPreset);
    params.set('channel', newChannel);

    if (newPreset === 'custom') {
      if (start) params.set('startDate', start);
      else params.delete('startDate');

      if (end) params.set('endDate', end);
      else params.delete('endDate');
    } else {
      params.delete('startDate');
      params.delete('endDate');
    }

    router.push(`/admin/dashboard?${params.toString()}`);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        {/* Date Preset Dropdown */}
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-neutral-400" />
          <span className="text-neutral-400 font-medium">Date Range:</span>
          <select
            value={preset}
            onChange={(e) => {
              const val = e.target.value;
              setPreset(val);
              applyFilters(val, channel, startDate, endDate);
            }}
            className="bg-neutral-950 border border-neutral-800 text-white rounded px-3 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-neutral-700"
            aria-label="Select Date Range Preset"
          >
            <option value="30d">Last 30 Days</option>
            <option value="7d">Last 7 Days</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Previous Month</option>
            <option value="this_year">This Year</option>
            <option value="all">All Time</option>
            <option value="custom">Custom Date Range...</option>
          </select>
        </div>

        {/* Custom Date Inputs (only if custom is selected) */}
        {preset === 'custom' && (
          <div className="flex items-center space-x-2 bg-neutral-950 border border-neutral-800 px-3 py-1 rounded">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-white focus:outline-none"
            />
            <span className="text-neutral-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => applyFilters('custom', channel, startDate, endDate)}
              className="px-2 py-0.5 bg-neutral-800 text-white rounded font-mono text-[11px] hover:bg-neutral-700"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Channel Filter Dropdown */}
      <div className="flex items-center space-x-2">
        <Filter className="w-4 h-4 text-neutral-400" />
        <span className="text-neutral-400 font-medium">Channel:</span>
        <select
          value={channel}
          onChange={(e) => {
            const val = e.target.value;
            setChannel(val);
            applyFilters(preset, val, startDate, endDate);
          }}
          className="bg-neutral-950 border border-neutral-800 text-white rounded px-3 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-neutral-700"
          aria-label="Select Sales Channel Filter"
        >
          <option value="ALL">All Channels</option>
          <option value="ONLINE">Online Storefront</option>
          <option value="DIRECT">Direct Sales (POS)</option>
        </select>
      </div>
    </div>
  );
}
