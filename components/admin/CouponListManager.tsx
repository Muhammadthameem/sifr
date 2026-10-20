'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchCouponsAction, toggleCouponStatusAction } from '@/lib/actions/coupon-actions';
import { CouponStatus } from '@prisma/client';
import { Tag, Plus, Search, Filter, Calendar, Users, Eye, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

export function CouponListManager() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      const filterStatus = statusFilter === 'ALL' ? undefined : (statusFilter as CouponStatus);
      const res = await fetchCouponsAction(search, filterStatus);
      if (isMounted && res.success && res.coupons) {
        setCoupons(res.coupons);
      }
      if (isMounted) setLoading(false);
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [search, statusFilter]);

  const loadCoupons = async () => {
    setLoading(true);
    const filterStatus = statusFilter === 'ALL' ? undefined : (statusFilter as CouponStatus);
    const res = await fetchCouponsAction(search, filterStatus);
    if (res.success && res.coupons) {
      setCoupons(res.coupons);
    }
    setLoading(false);
  };

  const handleToggleStatus = async (id: string, currentStatus: CouponStatus) => {
    const newStatus: CouponStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const res = await toggleCouponStatusAction(id, newStatus);
    if (res.success) {
      setMessage({ type: 'success', text: `Coupon status updated to ${newStatus}` });
      loadCoupons();
    } else {
      setMessage({ type: 'error', text: res.error || 'Failed to update status' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const formatCurrency = (val: any) => {
    if (!val) return '—';
    return `₹${Number(val).toLocaleString('en-IN')}`;
  };

  const formatDate = (dateStr: any) => {
    if (!dateStr) return 'No Limit';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900/60 p-6 rounded-xl border border-neutral-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Tag className="w-5 h-5 text-amber-500" />
            Coupons & Discounts
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Manage promotional coupon codes, applicability rules, usage limits, and redemption history.
          </p>
        </div>

        <Link
          href="/admin/coupons/new"
          className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-neutral-950 font-medium text-xs rounded-lg transition-colors shadow-sm"
          id="btn-create-coupon"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Coupon</span>
        </Link>
      </div>

      {/* Notifications */}
      {message && (
        <div
          className={`p-4 rounded-lg border text-xs flex items-center space-x-2 ${
            message.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Search by code or coupon name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-700"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-neutral-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-neutral-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="DRAFT">DRAFT</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-xs text-neutral-500">Loading coupon catalog...</div>
        ) : coupons.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500 space-y-2">
            <p className="font-medium text-neutral-400">No coupons found</p>
            <p>Create your first promotional coupon to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950/60 border-b border-neutral-800 text-neutral-400 font-mono text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Coupon Name</th>
                  <th className="px-4 py-3">Discount</th>
                  <th className="px-4 py-3">Min Order</th>
                  <th className="px-4 py-3">Validity</th>
                  <th className="px-4 py-3">Redemptions</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 text-neutral-300">
                {coupons.map((coupon) => {
                  const usageLimitText =
                    coupon.usageLimitGlobal !== null
                      ? `${coupon.usageCountGlobal} / ${coupon.usageLimitGlobal}`
                      : `${coupon.usageCountGlobal} (Unlimited)`;

                  return (
                    <tr key={coupon.id} className="hover:bg-neutral-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-amber-400 bg-amber-950/50 border border-amber-800/40 px-2 py-0.5 rounded">
                          {coupon.code}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{coupon.name}</div>
                        {coupon.description && (
                          <div className="text-[11px] text-neutral-400 truncate max-w-xs">
                            {coupon.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-white">
                          {coupon.discountType === 'PERCENTAGE'
                            ? `${Number(coupon.discountValue)}% OFF`
                            : `₹${Number(coupon.discountValue)} OFF`}
                        </span>
                        {coupon.maxDiscountAmount && coupon.discountType === 'PERCENTAGE' && (
                          <span className="block text-[10px] text-neutral-400">
                            Cap: ₹{Number(coupon.maxDiscountAmount)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">{formatCurrency(coupon.minOrderValue)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-1 text-[11px] text-neutral-300">
                          <Calendar className="w-3 h-3 text-neutral-500" />
                          <span>
                            {formatDate(coupon.startDate)} – {formatDate(coupon.endDate)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px]">
                        <div className="flex items-center space-x-1">
                          <Users className="w-3 h-3 text-neutral-500" />
                          <span>{usageLimitText}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono tracking-wider font-semibold border ${
                            coupon.status === 'ACTIVE'
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : coupon.status === 'INACTIVE'
                              ? 'bg-neutral-800 text-neutral-400 border-neutral-700'
                              : coupon.status === 'DRAFT'
                              ? 'bg-amber-950 text-amber-300 border-amber-800'
                              : 'bg-rose-950 text-rose-300 border-rose-800'
                          }`}
                        >
                          {coupon.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => handleToggleStatus(coupon.id, coupon.status)}
                          className="px-2 py-1 text-[11px] font-medium rounded border border-neutral-700 hover:bg-neutral-800 text-neutral-300"
                        >
                          {coupon.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>

                        <Link
                          href={`/admin/coupons/${coupon.id}`}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] bg-neutral-800 hover:bg-neutral-700 text-white rounded border border-neutral-700"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
