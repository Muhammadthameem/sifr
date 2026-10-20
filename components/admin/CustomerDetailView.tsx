'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminCustomerDetail } from '@/lib/customer/customer-service';
import { updateCustomerAction } from '@/lib/actions/customer-actions';
import {
  Users,
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  ShoppingBag,
  CreditCard,
  Edit3,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Truck,
  RotateCcw,
  X,
  Save,
  Clock,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface CustomerDetailViewProps {
  initialCustomer: AdminCustomerDetail;
}

export function CustomerDetailView({ initialCustomer }: CustomerDetailViewProps) {
  const router = useRouter();
  const [customer, setCustomer] = useState<AdminCustomerDetail>(initialCustomer);

  // Edit modal state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [name, setName] = useState<string>(customer.name);
  const [email, setEmail] = useState<string>(customer.email || '');
  const [addressLine, setAddressLine] = useState<string>(customer.addressLine || '');
  const [city, setCity] = useState<string>(customer.city || '');
  const [state, setState] = useState<string>(customer.state || '');
  const [pincode, setPincode] = useState<string>(customer.pincode || '');

  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  const handleOpenEdit = () => {
    setName(customer.name);
    setEmail(customer.email || '');
    setAddressLine(customer.addressLine || '');
    setCity(customer.city || '');
    setState(customer.state || '');
    setPincode(customer.pincode || '');
    setSaveError(null);
    setIsEditing(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);

    try {
      const res = await updateCustomerAction({
        customerId: customer.id,
        name,
        email: email.trim() || null,
        addressLine: addressLine.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        pincode: pincode.trim() || null,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to update customer profile');
      }

      setCustomer((prev) => ({
        ...prev,
        name: name.trim(),
        email: email.trim() || null,
        addressLine: addressLine.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        pincode: pincode.trim() || null,
      }));

      setIsEditing(false);
      router.refresh();
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-sky-950/60 border border-sky-800 text-sky-300">
            <CheckCircle2 className="w-3 h-3 text-sky-400" />
            <span>CONFIRMED</span>
          </span>
        );
      case 'DISPATCHED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-indigo-950/60 border border-indigo-800 text-indigo-300">
            <Truck className="w-3 h-3 text-indigo-400" />
            <span>DISPATCHED</span>
          </span>
        );
      case 'DELIVERED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-emerald-950/60 border border-emerald-800 text-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>DELIVERED</span>
          </span>
        );
      case 'CONTACTED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-amber-950/60 border border-amber-800 text-amber-300">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>CONTACTED</span>
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-neutral-800 border border-neutral-700 text-neutral-400">
            <RotateCcw className="w-3 h-3 text-neutral-400" />
            <span>CANCELLED</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-neutral-900 border border-neutral-800 text-neutral-300">
            {status}
          </span>
        );
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-[10px] font-mono uppercase">
            PAID
          </span>
        );
      case 'DUE':
        return (
          <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800 text-amber-300 text-[10px] font-mono uppercase">
            DUE
          </span>
        );
      case 'REFUNDED':
        return (
          <span className="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-800 text-purple-300 text-[10px] font-mono uppercase">
            REFUNDED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 text-[10px] font-mono uppercase">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <Link
            href="/admin/customers"
            className="inline-flex items-center space-x-1.5 text-xs text-neutral-400 hover:text-white font-mono uppercase tracking-wider mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Customers</span>
          </Link>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-sm font-mono font-medium text-white flex-shrink-0">
              {customer.name ? customer.name.charAt(0).toUpperCase() : '?'}
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white tracking-tight">
                {customer.name}
              </h1>
              <div className="flex items-center space-x-2 mt-0.5">
                <span className="text-xs font-mono text-neutral-400 flex items-center space-x-1">
                  <Phone className="w-3 h-3 text-neutral-500" />
                  <span>{customer.mobile}</span>
                </span>
                <span className="text-neutral-600">•</span>
                <span className="text-[11px] font-mono text-neutral-500">
                  Customer since {formatDate(customer.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenEdit}
          className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-xs font-medium text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors self-start sm:self-auto font-mono"
        >
          <Edit3 className="w-3.5 h-3.5 text-neutral-400" />
          <span>Edit Profile</span>
        </button>
      </div>

      {/* Profile & Purchase Summary 2-Col Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer Information Card */}
        <div className="bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-semibold flex items-center space-x-2">
              <Users className="w-4 h-4 text-neutral-400" />
              <span>Customer Information</span>
            </h2>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-full flex items-center space-x-1">
              <ShieldCheck className="w-3 h-3" />
              <span>Guest Profile</span>
            </span>
          </div>

          <div className="space-y-3.5 text-xs">
            <div className="flex items-start justify-between">
              <span className="text-neutral-500 font-mono">Full Name</span>
              <span className="text-white font-medium text-right">{customer.name}</span>
            </div>

            <div className="flex items-start justify-between">
              <span className="text-neutral-500 font-mono">Mobile Number</span>
              <span className="text-neutral-200 font-mono text-right">{customer.mobile}</span>
            </div>

            <div className="flex items-start justify-between">
              <span className="text-neutral-500 font-mono">Email Address</span>
              <span className="text-neutral-300 font-mono text-right">
                {customer.email || '—'}
              </span>
            </div>

            <div className="flex items-start justify-between">
              <span className="text-neutral-500 font-mono">Delivery Address</span>
              <span className="text-neutral-300 text-right max-w-[260px]">
                {customer.addressLine || '—'}
              </span>
            </div>

            <div className="flex items-start justify-between">
              <span className="text-neutral-500 font-mono">City</span>
              <span className="text-neutral-300 text-right">{customer.city || '—'}</span>
            </div>

            <div className="flex items-start justify-between">
              <span className="text-neutral-500 font-mono">State</span>
              <span className="text-neutral-300 text-right">{customer.state || '—'}</span>
            </div>

            <div className="flex items-start justify-between">
              <span className="text-neutral-500 font-mono">Pincode</span>
              <span className="text-neutral-300 font-mono text-right">{customer.pincode || '—'}</span>
            </div>
          </div>
        </div>

        {/* Customer Purchase Summary Card */}
        <div className="bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-semibold flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-neutral-400" />
              <span>Purchase Summary</span>
            </h2>
            <span className="text-[10px] font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded">
              SIFR Sales Standard
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="bg-neutral-950/80 p-3.5 rounded-xl border border-neutral-800/80">
              <span className="text-[10px] font-mono text-neutral-500 uppercase block mb-1">
                Total Purchase Value
              </span>
              <span className="text-lg font-mono font-semibold text-white">
                {formatCurrency(customer.totalPurchaseValue)}
              </span>
              <span className="text-[10px] text-neutral-500 block mt-1">
                From confirmed sales
              </span>
            </div>

            <div className="bg-neutral-950/80 p-3.5 rounded-xl border border-neutral-800/80">
              <span className="text-[10px] font-mono text-neutral-500 uppercase block mb-1">
                Confirmed Sales
              </span>
              <span className="text-lg font-mono font-semibold text-white">
                {customer.totalSalesCount}
              </span>
              <span className="text-[10px] text-neutral-500 block mt-1">
                {customer.totalOrdersCount} total requests
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-2 text-xs border-t border-neutral-800/60">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 font-mono">First Order Date</span>
              <span className="text-neutral-300 font-mono">{formatDate(customer.firstOrderDate)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-500 font-mono">Last Order Date</span>
              <span className="text-neutral-300 font-mono">{formatDate(customer.lastOrderDate)}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-400 leading-relaxed font-light">
              <strong className="text-neutral-300 font-medium">Sales Rule:</strong> Only{' '}
              <span className="text-sky-300 font-mono">CONFIRMED</span>,{' '}
              <span className="text-indigo-300 font-mono">DISPATCHED</span>, and{' '}
              <span className="text-emerald-300 font-mono">DELIVERED</span> orders contribute to
              purchase value. Contacted requests and cancelled orders are excluded.
            </div>
          </div>
        </div>
      </div>

      {/* Customer Order History Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white tracking-wider uppercase flex items-center space-x-2">
              <ShoppingBag className="w-4 h-4 text-neutral-400" />
              <span>Order History</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Complete chronological audit of order requests and purchases placed by this customer
            </p>
          </div>
          <span className="text-xs font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 px-2.5 py-1 rounded-lg">
            {customer.orders.length} Orders
          </span>
        </div>

        <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-neutral-900/80 text-neutral-400 font-mono uppercase text-[10px] tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Order Number</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-center">Payment Status</th>
                  <th className="py-3 px-4 text-center">Sales Channel</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 font-light">
                {customer.orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-neutral-500 font-mono">
                      No order records found for this customer.
                    </td>
                  </tr>
                ) : (
                  customer.orders.map((o) => (
                    <tr
                      key={o.id}
                      className="hover:bg-neutral-800/30 transition-colors"
                    >
                      {/* Order Number */}
                      <td className="py-3.5 px-4 font-mono font-medium text-white">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="hover:underline transition-colors text-white"
                        >
                          {o.orderNumber}
                        </Link>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 font-mono text-neutral-400">
                        {formatDate(o.createdAt)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        {getStatusBadge(o.status)}
                      </td>

                      {/* Total */}
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-white">
                        {formatCurrency(o.grandTotal)}
                        {!o.isSale && (
                          <span className="block text-[9px] font-mono text-neutral-500 uppercase">
                            Non-sale
                          </span>
                        )}
                      </td>

                      {/* Payment Status */}
                      <td className="py-3.5 px-4 text-center">
                        {getPaymentStatusBadge(o.paymentStatus)}
                      </td>

                      {/* Channel */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-neutral-900 border border-neutral-800 text-neutral-300">
                          {o.salesChannel}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors text-xs font-mono"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>View Order</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-semibold text-white tracking-tight">
                  Edit Customer Profile
                </h3>
                <p className="text-xs text-neutral-500 font-mono mt-0.5">
                  Update customer master record details
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-neutral-500 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {saveError && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs">
                {saveError}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-neutral-600 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-1.5">
                  Mobile Number (Read-Only)
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={customer.mobile}
                  className="w-full bg-neutral-950/50 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-neutral-500 font-mono cursor-not-allowed"
                />
                <span className="text-[10px] text-neutral-500 font-mono mt-1 block">
                  Primary Customer Identifier — Non-editable to preserve order integrity.
                </span>
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Optional email address..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-neutral-600 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-1.5">
                  Delivery Address Line
                </label>
                <input
                  type="text"
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  placeholder="Street / Building / Area..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-neutral-600"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-1.5">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-1.5">
                    State
                  </label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="State"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-1.5">
                    Pincode
                  </label>
                  <input
                    type="text"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    placeholder="Pincode"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-600 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-300 hover:text-white text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-mono font-medium disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : 'Save Profile'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
