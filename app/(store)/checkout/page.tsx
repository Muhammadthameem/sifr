'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCartAction, processGuestCheckoutAction } from '@/lib/actions/cart-actions';
import { ShoppingBag, ShieldCheck, Truck, ArrowLeft, AlertCircle, CreditCard, Banknote } from 'lucide-react';
import Link from 'next/link';

export default function GuestCheckoutPage() {
  const router = useRouter();
  const [cartData, setCartData] = useState<any>(null);
  const [loadingCart, setLoadingCart] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Client holds ONE UUIDv4 idempotency key for this checkout attempt session
  const [idempotencyKey] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `checkout-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  });

  const [paymentMethod, setPaymentMethod] = useState<'ONLINE' | 'COD'>('ONLINE');

  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    addressLine1: '',
    aptBuilding: '',
    locality: '',
    city: '',
    state: '',
    pincode: '',
    notes: '',
  });

  useEffect(() => {
    async function init() {
      try {
        const data = await fetchCartAction();
        setCartData(data);
      } catch {
        setErrorMsg('Failed to load cart for checkout');
      } finally {
        setLoadingCart(false);
      }
    }
    init();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    // Compose structured address into full snapshot string expected by backend
    const composedAddress = [
      formData.addressLine1.trim(),
      formData.aptBuilding?.trim(),
      formData.locality.trim(),
      formData.city.trim(),
      formData.state?.trim() && formData.pincode?.trim()
        ? `${formData.state.trim()} - ${formData.pincode.trim()}`
        : `${formData.state?.trim() || ''} ${formData.pincode?.trim() || ''}`.trim(),
    ]
      .filter(Boolean)
      .join(', ');

    const composedNotes = [
      formData.notes?.trim(),
      `Payment Preference: ${paymentMethod === 'COD' ? 'Cash on Delivery (COD)' : 'Online Payment'}`,
    ]
      .filter(Boolean)
      .join(' | ');

    try {
      const res = await processGuestCheckoutAction({
        creationIdempotencyKey: idempotencyKey,
        customer: {
          name: formData.name,
          mobile: formData.mobile,
          email: formData.email || undefined,
          shippingAddress: composedAddress,
        },
        notes: composedNotes || undefined,
      });

      if (!res.success) {
        setErrorMsg(res.message || 'Checkout failed. Please try again.');
        setSubmitting(false);
      } else {
        router.push(`/order-confirmation/${res.orderNumber}?token=${res.guestAccessToken}`);
      }
    } catch {
      setErrorMsg('An unexpected error occurred during checkout.');
      setSubmitting(false);
    }
  };

  if (loadingCart) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <div className="inline-block w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">Loading checkout details...</p>
      </div>
    );
  }

  if (!cartData || cartData.items.length === 0) {
    return (
      <div className="bg-white min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-24 text-center space-y-6">
          <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto text-neutral-400">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h1 className="font-serif text-3xl font-normal text-neutral-900">Your Cart is Empty</h1>
          <p className="text-xs font-mono text-neutral-500">Please add items to your shopping cart before proceeding to checkout.</p>
          <Link
            href="/men"
            className="inline-flex items-center space-x-2 px-8 py-3 bg-neutral-900 text-white font-mono text-xs uppercase tracking-widest rounded hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Collection</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen text-neutral-900 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
        
        {/* Header */}
        <div className="mb-10 pb-6 border-b border-neutral-200 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <Link href="/cart" className="inline-flex items-center space-x-2 text-xs font-mono text-neutral-500 hover:text-neutral-900 uppercase tracking-widest transition-colors mb-2">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Cart</span>
            </Link>
            <h1 className="font-serif text-3xl md:text-4xl font-normal text-neutral-900 tracking-tight">
              Guest Checkout
            </h1>
          </div>
          <div className="flex items-center space-x-2 text-xs font-mono text-neutral-600 bg-neutral-50 border border-neutral-200 px-3 py-1.5 rounded-full">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Encrypted Guest Session</span>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-8 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono rounded-lg flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left Column: Form & Address Details (~60%) */}
          <div className="lg:col-span-7 space-y-8">
            
            {/* Customer & Address Details */}
            <div className="bg-neutral-50 border border-neutral-200 p-6 md:p-8 rounded-2xl space-y-6">
              <h2 className="font-serif text-xl font-normal text-neutral-900 border-b border-neutral-200 pb-3 flex items-center space-x-2">
                <Truck className="w-5 h-5 text-neutral-700" />
                <span>Shipping & Delivery Details</span>
              </h2>

              <div className="space-y-4 text-xs font-mono">
                <div>
                  <label className="block text-neutral-700 uppercase tracking-wider mb-1">
                    Full Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g. Rahul Sharma"
                    id="checkout-customer-name"
                    className="w-full bg-white border border-neutral-300 rounded px-3 py-2 text-neutral-900 focus:outline-none focus:border-neutral-900"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-neutral-700 uppercase tracking-wider mb-1">
                      Mobile Number (India E.164) <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="tel"
                      name="mobile"
                      required
                      value={formData.mobile}
                      onChange={handleChange}
                      placeholder="e.g. 9876543210"
                      id="checkout-customer-mobile"
                      className="w-full bg-white border border-neutral-300 rounded px-3 py-2 text-neutral-900 focus:outline-none focus:border-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-700 uppercase tracking-wider mb-1">
                      Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="rahul@example.com"
                      id="checkout-customer-email"
                      className="w-full bg-white border border-neutral-300 rounded px-3 py-2 text-neutral-900 focus:outline-none focus:border-neutral-900"
                    />
                  </div>
                </div>

                {/* Structured Address Fields */}
                <div>
                  <label className="block text-neutral-700 uppercase tracking-wider mb-1">
                    Address Line 1 <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    name="addressLine1"
                    required
                    value={formData.addressLine1}
                    onChange={handleChange}
                    placeholder="House / Flat No., Building Name, Street"
                    id="checkout-address-line1"
                    className="w-full bg-white border border-neutral-300 rounded px-3 py-2 text-neutral-900 focus:outline-none focus:border-neutral-900"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-neutral-700 uppercase tracking-wider mb-1">
                      Apartment / Suite (Optional)
                    </label>
                    <input
                      type="text"
                      name="aptBuilding"
                      value={formData.aptBuilding}
                      onChange={handleChange}
                      placeholder="Apt, Suite, Floor"
                      id="checkout-apt-building"
                      className="w-full bg-white border border-neutral-300 rounded px-3 py-2 text-neutral-900 focus:outline-none focus:border-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-700 uppercase tracking-wider mb-1">
                      Locality / Area <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      name="locality"
                      required
                      value={formData.locality}
                      onChange={handleChange}
                      placeholder="Locality, Sector, Landmark"
                      id="checkout-locality"
                      className="w-full bg-white border border-neutral-300 rounded px-3 py-2 text-neutral-900 focus:outline-none focus:border-neutral-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-neutral-700 uppercase tracking-wider mb-1">
                      City <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      name="city"
                      required
                      value={formData.city}
                      onChange={handleChange}
                      placeholder="City"
                      id="checkout-city"
                      className="w-full bg-white border border-neutral-300 rounded px-3 py-2 text-neutral-900 focus:outline-none focus:border-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-700 uppercase tracking-wider mb-1">
                      State <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      name="state"
                      required
                      value={formData.state}
                      onChange={handleChange}
                      placeholder="State"
                      id="checkout-state"
                      className="w-full bg-white border border-neutral-300 rounded px-3 py-2 text-neutral-900 focus:outline-none focus:border-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-700 uppercase tracking-wider mb-1">
                      PIN Code <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      name="pincode"
                      required
                      value={formData.pincode}
                      onChange={handleChange}
                      placeholder="6-digit PIN"
                      id="checkout-pincode"
                      className="w-full bg-white border border-neutral-300 rounded px-3 py-2 text-neutral-900 focus:outline-none focus:border-neutral-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-neutral-700 uppercase tracking-wider mb-1">
                    Delivery Notes (Optional)
                  </label>
                  <input
                    type="text"
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    placeholder="Special instructions for courier"
                    id="checkout-notes"
                    className="w-full bg-white border border-neutral-300 rounded px-3 py-2 text-neutral-900 focus:outline-none focus:border-neutral-900"
                  />
                </div>
              </div>
            </div>

            {/* Payment Method Selection */}
            <div className="bg-neutral-50 border border-neutral-200 p-6 md:p-8 rounded-2xl space-y-6">
              <h2 className="font-serif text-xl font-normal text-neutral-900 border-b border-neutral-200 pb-3 flex items-center space-x-2">
                <CreditCard className="w-5 h-5 text-neutral-700" />
                <span>Payment Method</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('ONLINE')}
                  className={`p-4 border rounded-xl flex items-start space-x-3 text-left transition-all ${
                    paymentMethod === 'ONLINE'
                      ? 'bg-white border-neutral-900 ring-1 ring-neutral-900 shadow-sm'
                      : 'bg-white border-neutral-200 hover:border-neutral-400'
                  }`}
                  id="checkout-payment-online-btn"
                >
                  <CreditCard className={`w-5 h-5 mt-0.5 ${paymentMethod === 'ONLINE' ? 'text-neutral-900' : 'text-neutral-400'}`} />
                  <div>
                    <span className="font-mono text-xs font-bold text-neutral-900 block">Online Payment</span>
                    <span className="text-[11px] font-mono text-neutral-500">Credit/Debit Card, UPI, NetBanking</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('COD')}
                  className={`p-4 border rounded-xl flex items-start space-x-3 text-left transition-all ${
                    paymentMethod === 'COD'
                      ? 'bg-white border-neutral-900 ring-1 ring-neutral-900 shadow-sm'
                      : 'bg-white border-neutral-200 hover:border-neutral-400'
                  }`}
                  id="checkout-payment-cod-btn"
                >
                  <Banknote className={`w-5 h-5 mt-0.5 ${paymentMethod === 'COD' ? 'text-neutral-900' : 'text-neutral-400'}`} />
                  <div>
                    <span className="font-mono text-xs font-bold text-neutral-900 block">Cash on Delivery</span>
                    <span className="text-[11px] font-mono text-neutral-500">Pay cash upon parcel arrival</span>
                  </div>
                </button>
              </div>
            </div>

          </div>

          {/* Right Column: Server-Authoritative Order Summary (~40%) */}
          <div className="lg:col-span-5">
            <div className="bg-neutral-50 border border-neutral-200 p-6 md:p-8 rounded-2xl space-y-6 sticky top-24 shadow-sm">
              <h2 className="font-serif text-2xl font-normal text-neutral-900 border-b border-neutral-200 pb-4 tracking-tight">
                Order Summary
              </h2>

              {/* Item List */}
              <div className="space-y-3 max-h-72 overflow-y-auto pr-2 divide-y divide-neutral-200 font-mono text-xs">
                {cartData.items.map((item: any) => (
                  <div key={item.id} className="pt-3 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-neutral-900">{item.productName}</p>
                      <p className="text-neutral-500 text-[11px]">{item.variantTitle} × {item.quantity}</p>
                    </div>
                    <span className="font-bold text-neutral-900">₹{item.lineTotal.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>

              {/* Authoritative Financial Breakdown */}
              <div className="pt-4 border-t border-neutral-200 space-y-3 text-xs font-mono">
                <div className="flex justify-between text-neutral-600">
                  <span>Subtotal</span>
                  <span className="font-bold text-neutral-900">₹{cartData.subtotal.toLocaleString('en-IN')}</span>
                </div>

                {cartData.discountTotal > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Discount ({cartData.appliedCouponCode})</span>
                    <span>-₹{cartData.discountTotal.toLocaleString('en-IN')}</span>
                  </div>
                )}

                <div className="flex justify-between text-neutral-600">
                  <span>Shipping Fee</span>
                  <span className="font-bold text-neutral-900">
                    {cartData.shippingFee === 0 ? 'FREE' : `₹${cartData.shippingFee.toLocaleString('en-IN')}`}
                  </span>
                </div>

                <div className="pt-3 border-t border-neutral-200 flex justify-between items-baseline">
                  <span className="font-sans font-bold text-neutral-900 uppercase tracking-wider text-xs">Grand Total</span>
                  <span className="font-mono text-xl font-bold text-neutral-900">
                    ₹{cartData.grandTotal.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Place Order CTA */}
              <button
                type="submit"
                disabled={submitting || cartData.hasUnavailableItems}
                id="place-order-submit-btn"
                className="w-full py-4 bg-neutral-900 text-white font-mono text-xs uppercase tracking-widest rounded hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Processing Order...' : paymentMethod === 'COD' ? 'Place Cash on Delivery Order' : 'Place Guest Order'}
              </button>

              <p className="text-[11px] text-center font-mono text-neutral-500">
                By placing your order, you agree to SIFR Terms of Sale. Payment status will be set to PENDING.
              </p>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
}

