'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, Filter, X } from 'lucide-react';

interface SalesReportFilterBarProps {
  currentPreset?: string;
  currentChannel?: string;
  currentOrderStatus?: string;
  currentPaymentStatus?: string;
  currentStartDate?: string;
  currentEndDate?: string;
}

export function SalesReportFilterBar({
  currentPreset = '30d',
  currentChannel = 'ALL',
  currentOrderStatus = 'ALL',
  currentPaymentStatus = 'ALL',
  currentStartDate = '',
  currentEndDate = '',
}: SalesReportFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [preset, setPreset] = useState(currentPreset);
  const [channel, setChannel] = useState(currentChannel);
  const [orderStatus, setOrderStatus] = useState(currentOrderStatus);
  const [paymentStatus, setPaymentStatus] = useState(currentPaymentStatus);
  const [startDate, setStartDate] = useState(currentStartDate);
  const [endDate, setEndDate] = useState(currentEndDate);

  const applyFilters = (
    newPreset = preset,
    newChannel = channel,
    newOrderStatus = orderStatus,
    newPaymentStatus = paymentStatus,
    start = startDate,
    end = endDate
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', newPreset);
    params.set('channel', newChannel);
    params.set('orderStatus', newOrderStatus);
    params.set('paymentStatus', newPaymentStatus);
    params.set('page', '1'); // Reset to page 1 on filter change

    if (newPreset === 'custom') {
      if (start) params.set('startDate', start);
      else params.delete('startDate');

      if (end) params.set('endDate', end);
      else params.delete('endDate');
    } else {
      params.delete('startDate');
      params.delete('endDate');
    }

    router.push(`/admin/reports/sales?${params.toString()}`);
  };

  const clearFilters = () => {
    setPreset('30d');
    setChannel('ALL');
    setOrderStatus('ALL');
    setPaymentStatus('ALL');
    setStartDate('');
    setEndDate('');
    router.push('/admin/reports/sales');
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Date Preset */}
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-neutral-400" />
          <span className="text-neutral-400 font-medium">Date Range:</span>
          <select
            value={preset}
            onChange={(e) => {
              const val = e.target.value;
              setPreset(val);
              applyFilters(val, channel, orderStatus, paymentStatus, startDate, endDate);
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

        {/* Sales Channel */}
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-neutral-400" />
          <span className="text-neutral-400 font-medium">Channel:</span>
          <select
            value={channel}
            onChange={(e) => {
              const val = e.target.value;
              setChannel(val);
              applyFilters(preset, val, orderStatus, paymentStatus, startDate, endDate);
            }}
            className="bg-neutral-950 border border-neutral-800 text-white rounded px-3 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-neutral-700"
            aria-label="Sales Channel Filter"
          >
            <option value="ALL">All Channels</option>
            <option value="ONLINE">Online Storefront</option>
            <option value="DIRECT">Direct Sales (POS)</option>
          </select>
        </div>

        {/* Order Status */}
        <div className="flex items-center space-x-2">
          <span className="text-neutral-400 font-medium">Order Status:</span>
          <select
            value={orderStatus}
            onChange={(e) => {
              const val = e.target.value;
              setOrderStatus(val);
              applyFilters(preset, channel, val, paymentStatus, startDate, endDate);
            }}
            className="bg-neutral-950 border border-neutral-800 text-white rounded px-3 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-neutral-700"
            aria-label="Order Status Filter"
          >
            <option value="ALL">Excl. Cancelled (Default)</option>
            <option value="RECEIVED">RECEIVED</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="DISPATCHED">DISPATCHED</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        {/* Payment Status */}
        <div className="flex items-center space-x-2">
          <span className="text-neutral-400 font-medium">Payment:</span>
          <select
            value={paymentStatus}
            onChange={(e) => {
              const val = e.target.value;
              setPaymentStatus(val);
              applyFilters(preset, channel, orderStatus, val, startDate, endDate);
            }}
            className="bg-neutral-950 border border-neutral-800 text-white rounded px-3 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-neutral-700"
            aria-label="Payment Status Filter"
          >
            <option value="ALL">All Payment Statuses</option>
            <option value="PAID">PAID</option>
            <option value="PENDING">PENDING</option>
            <option value="PARTIALLY_REFUNDED">PARTIALLY_REFUNDED</option>
            <option value="REFUNDED">REFUNDED</option>
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

      {/* Custom Date Picker Inputs */}
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
            onClick={() => applyFilters('custom', channel, orderStatus, paymentStatus, startDate, endDate)}
            className="px-3 py-1 bg-neutral-800 text-white rounded font-mono font-medium hover:bg-neutral-700"
          >
            Apply Range
          </button>
        </div>
      )}
    </div>
  );
}
