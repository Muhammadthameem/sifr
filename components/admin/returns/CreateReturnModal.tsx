'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  findOrderByNumberAction,
  findOrdersByPhoneAction,
  createAdminFullReturnAction,
} from '@/lib/actions/return-actions';
import { ReturnReason } from '@prisma/client';
import { Search, X, AlertCircle, CheckCircle, Package, ArrowRight, RotateCcw } from 'lucide-react';

interface CreateReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateReturnModal({ isOpen, onClose }: CreateReturnModalProps) {
  const router = useRouter();

  // Search States
  const [searchType, setSearchType] = useState<'ORDER_NUMBER' | 'PHONE'>('ORDER_NUMBER');
  const [orderNumberInput, setOrderNumberInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Phone search results list
  const [phoneOrders, setPhoneOrders] = useState<any[]>([]);

  // Selected Order & Details
  const [selectedOrderData, setSelectedOrderData] = useState<{
    order: any;
    isEligible: boolean;
    ineligibilityReason: string | null;
    hasActiveReturn: boolean;
    activeReturn: { id: string; returnNumber: string; status: string } | null;
  } | null>(null);

  // Form Fields
  const [reason, setReason] = useState<ReturnReason>(ReturnReason.CHANGE_OF_MIND);
  const [reasonDetails, setReasonDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Handle Order Number Search
  const handleOrderSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!orderNumberInput.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setPhoneOrders([]);

    const res = await findOrderByNumberAction(orderNumberInput.trim());
    setIsSearching(false);

    if (!res.success) {
      setSearchError(res.error || 'Failed to search order.');
      setSelectedOrderData(null);
      return;
    }

    if (!res.data || !res.data.order) {
      setSearchError('Order not found.');
      setSelectedOrderData(null);
      return;
    }

    setSelectedOrderData(res.data);
  };

  // Handle Phone Search
  const handlePhoneSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!phoneInput.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setSelectedOrderData(null);

    const res = await findOrdersByPhoneAction(phoneInput.trim());
    setIsSearching(false);

    if (!res.success) {
      setSearchError(res.error || 'Failed to search orders by phone.');
      setPhoneOrders([]);
      return;
    }

    const orders = res.data || [];
    if (orders.length === 0) {
      setSearchError('No orders found for this phone number.');
      setPhoneOrders([]);
      return;
    }

    if (orders.length === 1) {
      // Auto fetch the full details of this single order
      const fullRes = await findOrderByNumberAction(orders[0].orderNumber);
      if (fullRes.success && fullRes.data) {
        setSelectedOrderData(fullRes.data);
        setPhoneOrders([]);
        return;
      }
    }

    setPhoneOrders(orders);
  };

  // Select an order from phone list
  const handleSelectPhoneOrder = async (orderNumber: string) => {
    setIsSearching(true);
    setSearchError(null);
    const fullRes = await findOrderByNumberAction(orderNumber);
    setIsSearching(false);

    if (fullRes.success && fullRes.data) {
      setSelectedOrderData(fullRes.data);
      setPhoneOrders([]);
    } else {
      setSearchError(fullRes.error || 'Failed to load selected order details.');
    }
  };

  // Change / Clear Selected Order
  const handleChangeOrder = () => {
    setSelectedOrderData(null);
    setPhoneOrders([]);
    setSearchError(null);
    setSubmitError(null);
  };

  // Submit Create Return
  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderData || !selectedOrderData.isEligible || selectedOrderData.hasActiveReturn) return;

    if (reason === ReturnReason.OTHER && !reasonDetails.trim()) {
      setSubmitError('Please provide an explanation for reason "Other".');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const res = await createAdminFullReturnAction({
      orderId: selectedOrderData.order.id,
      reason,
      reasonDetails: reason === ReturnReason.OTHER ? reasonDetails.trim() : reasonDetails.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    setIsSubmitting(false);

    if (!res.success) {
      setSubmitError(res.error || 'Failed to create return.');
      return;
    }

    onClose();
    if (res.returnRequest?.id) {
      router.push(`/admin/returns/${res.returnRequest.id}`);
    } else {
      router.refresh();
    }
  };

  const order = selectedOrderData?.order;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl my-8 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/50">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-400" />
              Create Customer Return
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Locate order, verify return eligibility, and initiate a return request.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* STEP 1: FIND ORDER (if no order selected) */}
          {!selectedOrderData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Step 1: Find Order
                </span>
                <div className="flex bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchType('ORDER_NUMBER');
                      setSearchError(null);
                    }}
                    className={`px-3 py-1 rounded-md font-medium transition-colors ${
                      searchType === 'ORDER_NUMBER'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Order Number
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchType('PHONE');
                      setSearchError(null);
                    }}
                    className={`px-3 py-1 rounded-md font-medium transition-colors ${
                      searchType === 'PHONE'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Customer Phone
                  </button>
                </div>
              </div>

              {/* Order Number Form */}
              {searchType === 'ORDER_NUMBER' && (
                <form onSubmit={handleOrderSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Enter Order Number (e.g. WA-20261014-0001)"
                      value={orderNumberInput}
                      onChange={(e) => setOrderNumberInput(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching || !orderNumberInput.trim()}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-xl text-sm transition-colors flex items-center gap-2"
                  >
                    <Search className="w-4 h-4" />
                    {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </form>
              )}

              {/* Customer Phone Form */}
              {searchType === 'PHONE' && (
                <form onSubmit={handlePhoneSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Enter Customer Mobile Phone (e.g. 9876543210)"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching || !phoneInput.trim()}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-xl text-sm transition-colors flex items-center gap-2"
                  >
                    <Search className="w-4 h-4" />
                    {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </form>
              )}

              {/* Search Error Message */}
              {searchError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{searchError}</span>
                </div>
              )}

              {/* Multiple Orders Result List */}
              {phoneOrders.length > 0 && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs font-semibold text-zinc-400">
                    Found {phoneOrders.length} orders for this customer phone. Please select one:
                  </p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {phoneOrders.map((po) => (
                      <div
                        key={po.id}
                        className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-4 text-xs hover:border-zinc-700 transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-amber-400">{po.orderNumber}</span>
                            <span className="text-zinc-500">•</span>
                            <span className="text-zinc-400">
                              {new Date(po.createdAt).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-zinc-400">
                            <span>{po.customerName}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-medium">
                              {po.status}
                            </span>
                            <span className="font-mono text-white font-medium">₹{po.grandTotal.toFixed(2)}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectPhoneOrder(po.orderNumber)}
                          className="px-3 py-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-xs font-medium transition-colors shrink-0"
                        >
                          Select
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: SELECTED ORDER DISPLAY */}
          {selectedOrderData && order && (
            <div className="space-y-6">
              {/* Selected Order Header Bar */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono uppercase text-zinc-500 block">Selected Order</span>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-base font-bold font-mono text-amber-400">{order.orderNumber}</span>
                    <span className="text-xs text-zinc-400">({order.salesChannel})</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleChangeOrder}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
                >
                  Change Order
                </button>
              </div>

              {/* Eligibility Warning / Blockers */}
              {!selectedOrderData.isEligible && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-rose-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Ineligible for Return
                  </div>
                  <p>{selectedOrderData.ineligibilityReason}</p>
                </div>
              )}

              {/* Duplicate Return Warning */}
              {selectedOrderData.hasActiveReturn && selectedOrderData.activeReturn && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-amber-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    A return already exists for this order.
                  </div>
                  <p>
                    Existing Return:{' '}
                    <span className="font-mono font-semibold">{selectedOrderData.activeReturn.returnNumber}</span> (Status:{' '}
                    <span className="font-semibold">{selectedOrderData.activeReturn.status}</span>)
                  </p>
                </div>
              )}

              {/* Order Information Snapshot Card */}
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Order Details
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-zinc-500 block">Customer</span>
                    <span className="text-zinc-200 font-medium">{order.customerNameSnapshot}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Phone</span>
                    <span className="text-zinc-200 font-mono">{order.customerMobileSnapshot}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Order Status</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-medium">
                      {order.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Payment Status</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-medium font-mono">
                      {order.paymentStatus}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-zinc-500 block">Delivery Address</span>
                    <span className="text-zinc-300 text-[11px] line-clamp-1">{order.shippingAddressSnapshot || '—'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Payment Method</span>
                    <span className="text-zinc-300 font-medium">{order.paymentMethod || '—'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Order Total</span>
                    <span className="text-white font-mono font-bold">₹{Number(order.grandTotal).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Order Items Snapshot Table (Full Return) */}
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950 flex justify-between items-center">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Full Order Items ({order.items.length})
                  </span>
                  <span className="text-[11px] text-amber-400 font-mono">Entire order will be returned</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-zinc-950/80 text-zinc-500 border-b border-zinc-800 uppercase text-[10px]">
                      <tr>
                        <th className="px-4 py-2.5">Product</th>
                        <th className="px-4 py-2.5">SKU</th>
                        <th className="px-4 py-2.5">Variant</th>
                        <th className="px-4 py-2.5 text-center">Qty</th>
                        <th className="px-4 py-2.5 text-right">Unit Price</th>
                        <th className="px-4 py-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {order.items.map((it: any) => (
                        <tr key={it.id}>
                          <td className="px-4 py-2.5 font-medium text-white">{it.productNameSnapshot}</td>
                          <td className="px-4 py-2.5 font-mono text-zinc-400">{it.skuSnapshot}</td>
                          <td className="px-4 py-2.5 text-zinc-400">{it.variantTitleSnapshot}</td>
                          <td className="px-4 py-2.5 text-center font-semibold text-white">{it.quantity}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-zinc-300">
                            ₹{Number(it.unitPrice).toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold text-white">
                            ₹{Number(it.lineTotal).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Return Form Details (Only if Eligible and No Active Return) */}
              {selectedOrderData.isEligible && !selectedOrderData.hasActiveReturn && (
                <form id="create-return-form" onSubmit={handleSubmitReturn} className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1">
                        Return Reason <span className="text-amber-400">*</span>
                      </label>
                      <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value as ReturnReason)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value={ReturnReason.CHANGE_OF_MIND}>Customer changed mind</option>
                        <option value={ReturnReason.WRONG_ITEM}>Wrong product/variant</option>
                        <option value={ReturnReason.DAMAGED}>Damaged product</option>
                        <option value={ReturnReason.DEFECTIVE}>Defective product</option>
                        <option value={ReturnReason.OTHER}>Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1">
                        Refund Amount (System-Calculated)
                      </label>
                      <div className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-400 font-mono font-semibold">
                        ₹{Number(order.grandTotal).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Explanation required for OTHER */}
                  {reason === ReturnReason.OTHER && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1">
                        Explanation <span className="text-rose-400">* (Required for &quot;Other&quot;)</span>
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Explain the reason for this return..."
                        value={reasonDetails}
                        onChange={(e) => setReasonDetails(e.target.value)}
                        required
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  )}

                  {/* Optional Notes */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Notes (Optional)</label>
                    <textarea
                      rows={2}
                      placeholder="Additional internal notes..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {submitError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}
                </form>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 bg-zinc-950/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          {selectedOrderData && selectedOrderData.isEligible && !selectedOrderData.hasActiveReturn && (
            <button
              type="submit"
              form="create-return-form"
              disabled={isSubmitting}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-xl text-xs transition-colors flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              {isSubmitting ? 'Creating Return...' : 'Create Return'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
