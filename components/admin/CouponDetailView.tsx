'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toggleCouponStatusAction } from '@/lib/actions/coupon-actions';
import { Tag, ArrowLeft, Edit, Calendar, Users, ShoppingBag, Layers } from 'lucide-react';

interface CouponDetailViewProps {
  coupon: any;
}

export function CouponDetailView({ coupon }: CouponDetailViewProps) {
  const router = useRouter();

  const handleToggleStatus = async () => {
    const newStatus = coupon.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const res = await toggleCouponStatusAction(coupon.id, newStatus);
    if (res.success) {
      router.refresh();
    }
  };

  const formatDate = (dateStr: any) => {
    if (!dateStr) return 'No Limit';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => router.back()}
            className="p-2 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono font-bold text-lg text-amber-400 bg-amber-950/50 border border-amber-800/40 px-2.5 py-0.5 rounded">
                {coupon.code}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-wider font-semibold border ${
                  coupon.status === 'ACTIVE'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                }`}
              >
                {coupon.status}
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white mt-1">{coupon.name}</h1>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleToggleStatus}
            className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 text-xs font-medium text-neutral-300 rounded-lg border border-neutral-800"
          >
            {coupon.status === 'ACTIVE' ? 'Deactivate Coupon' : 'Activate Coupon'}
          </button>

          <Link
            href={`/admin/coupons/${coupon.id}/edit`}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-neutral-950 font-medium text-xs rounded-lg transition-colors shadow-sm"
          >
            <Edit className="w-3.5 h-3.5" />
            <span>Edit Coupon</span>
          </Link>
        </div>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl">
          <p className="text-[10px] font-mono uppercase text-neutral-500">Discount</p>
          <p className="text-lg font-bold text-white mt-1">
            {coupon.discountType === 'PERCENTAGE'
              ? `${Number(coupon.discountValue)}% OFF`
              : `₹${Number(coupon.discountValue)} OFF`}
          </p>
          {coupon.maxDiscountAmount && coupon.discountType === 'PERCENTAGE' && (
            <p className="text-[11px] text-neutral-400 mt-0.5">Cap: ₹{Number(coupon.maxDiscountAmount)}</p>
          )}
        </div>

        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl">
          <p className="text-[10px] font-mono uppercase text-neutral-500">Min Order Value</p>
          <p className="text-lg font-bold text-white mt-1">
            {coupon.minOrderValue ? `₹${Number(coupon.minOrderValue)}` : 'No Minimum'}
          </p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl">
          <p className="text-[10px] font-mono uppercase text-neutral-500">Global Redemptions</p>
          <p className="text-lg font-bold text-white mt-1">
            {coupon.usageCountGlobal}
            <span className="text-xs font-normal text-neutral-500">
              {coupon.usageLimitGlobal ? ` / ${coupon.usageLimitGlobal}` : ' (Unlimited)'}
            </span>
          </p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl">
          <p className="text-[10px] font-mono uppercase text-neutral-500">Per-Customer Limit</p>
          <p className="text-lg font-bold text-white mt-1">
            {coupon.usageLimitPerCustomer ? `${coupon.usageLimitPerCustomer} per customer` : 'Unlimited'}
          </p>
        </div>
      </div>

      {/* Validity Window & Restrictions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-3">
          <h2 className="text-xs font-semibold text-neutral-400 font-mono uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-500" />
            Validity Window
          </h2>
          <div className="text-xs space-y-1 text-neutral-300">
            <p>
              <strong className="text-neutral-400">Start:</strong> {formatDate(coupon.startDate)}
            </p>
            <p>
              <strong className="text-neutral-400">End:</strong> {formatDate(coupon.endDate)}
            </p>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-3">
          <h2 className="text-xs font-semibold text-neutral-400 font-mono uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-500" />
            Target Applicability
          </h2>
          <div className="text-xs text-neutral-300 space-y-1">
            {coupon.applicableCategories.length === 0 && coupon.applicableProducts.length === 0 ? (
              <p className="text-emerald-400 font-medium">Unrestricted (Applies to all products in catalog)</p>
            ) : (
              <>
                {coupon.applicableCategories.length > 0 && (
                  <p>
                    <strong className="text-neutral-400">Categories:</strong>{' '}
                    {coupon.applicableCategories.map((ac: any) => ac.category.name).join(', ')}
                  </p>
                )}
                {coupon.applicableProducts.length > 0 && (
                  <p>
                    <strong className="text-neutral-400">Products:</strong>{' '}
                    {coupon.applicableProducts.map((ap: any) => ap.product.name).join(', ')}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Historical Redemptions Ledger */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm space-y-4 p-5">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-amber-500" />
          Redemption History ({coupon.usages.length})
        </h2>

        {coupon.usages.length === 0 ? (
          <p className="text-xs text-neutral-500 py-6 text-center">No order redemptions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950/60 border-b border-neutral-800 text-neutral-400 font-mono text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">Order Number</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Mobile</th>
                  <th className="px-4 py-2.5">Order Total</th>
                  <th className="px-4 py-2.5">Discount Applied</th>
                  <th className="px-4 py-2.5 text-right">Redemption Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 text-neutral-300">
                {coupon.usages.map((usage: any) => (
                  <tr key={usage.id} className="hover:bg-neutral-800/40">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/orders/${usage.orderId}`}
                        className="font-mono text-amber-400 hover:underline font-semibold"
                      >
                        {usage.order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{usage.order.customerNameSnapshot}</td>
                    <td className="px-4 py-2.5 font-mono">{usage.customerMobile}</td>
                    <td className="px-4 py-2.5 font-mono">₹{Number(usage.order.grandTotal).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5 font-mono text-emerald-400 font-semibold">
                      -₹{Number(usage.discountAmount).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[11px] text-neutral-400">
                      {new Date(usage.createdAt).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
