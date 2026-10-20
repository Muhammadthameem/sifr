'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag, X, Plus, Minus, Trash2, ArrowRight, ArrowLeft, ShieldCheck, Tag, MessageCircle } from 'lucide-react';
import {
  fetchCartAction,
  updateCartItemAction,
  removeFromCartAction,
  applyCartCouponAction,
  removeCartCouponAction,
} from '@/lib/actions/cart-actions';

export default function FullPageCart() {
  const [cartData, setCartData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadCart = async () => {
    try {
      setLoading(true);
      const data = await fetchCartAction();
      setCartData(data);
    } catch {
      setErrorMsg('Failed to load cart');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCart();
  }, []);

  const handleUpdateQty = async (variantId: string, currentQty: number, delta: number) => {
    const newQty = currentQty + delta;
    setErrorMsg(null);
    const res = await updateCartItemAction({ variantId, quantity: newQty });
    if (!res.success) {
      if (res.code === 'EXCEEDS_AVAILABLE_STOCK') {
        setErrorMsg(`Only ${res.availableQuantity} unit(s) available in stock.`);
      } else {
        setErrorMsg(res.message || 'Could not update quantity');
      }
    } else {
      await loadCart();
    }
  };

  const handleRemoveItem = async (variantId: string) => {
    setErrorMsg(null);
    await removeFromCartAction(variantId);
    await loadCart();
  };

  if (loading && !cartData) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <div className="inline-block w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">Loading Shopping Cart...</p>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen text-neutral-900 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
        
        {/* Header & Breadcrumb */}
        <div className="mb-10 pb-6 border-b border-neutral-200 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <nav className="flex items-center space-x-2 text-xs font-mono text-neutral-500 uppercase tracking-widest mb-3">
              <Link href="/" className="hover:text-neutral-900 transition-colors">Home</Link>
              <span>/</span>
              <span className="text-neutral-900 font-bold">Shopping Cart</span>
            </nav>
            <h1 className="font-serif text-3xl md:text-4xl font-normal text-neutral-900 tracking-tight">
              Shopping Cart {cartData?.itemCount ? `(${cartData.itemCount})` : ''}
            </h1>
          </div>
          <Link
            href="/men"
            className="inline-flex items-center space-x-2 text-xs font-mono uppercase tracking-widest text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Continue Shopping</span>
          </Link>
        </div>

        {/* Error Toast */}
        {errorMsg && (
          <div className="mb-8 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono rounded-lg">
            {errorMsg}
          </div>
        )}

        {/* Empty State */}
        {!cartData || cartData.items.length === 0 ? (
          <div className="py-20 text-center space-y-6 max-w-md mx-auto">
            <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto text-neutral-400">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h2 className="font-serif text-2xl font-normal text-neutral-900">Your cart is currently empty</h2>
            <p className="text-xs text-neutral-600 font-light leading-relaxed">
              Explore our minimalist collection of timeless luxury garments and elevate your wardrobe.
            </p>
            <div className="pt-4 flex items-center justify-center space-x-4">
              <Link
                href="/men"
                className="px-6 py-3 bg-neutral-900 text-white text-xs font-mono tracking-widest uppercase rounded hover:bg-neutral-800 transition-colors"
              >
                Shop Men
              </Link>
              <Link
                href="/women"
                className="px-6 py-3 border border-neutral-300 text-neutral-900 text-xs font-mono tracking-widest uppercase rounded hover:bg-neutral-50 transition-colors"
              >
                Shop Women
              </Link>
            </div>
          </div>
        ) : (
          /* Main Cart Content — 65% items / 35% summary split on desktop */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            
            {/* Left Column: Cart Items (~65%) */}
            <div className="lg:col-span-7 space-y-6">
              <div className="divide-y divide-neutral-200 border-t border-b border-neutral-200">
                {cartData.items.map((item: any) => (
                  <div key={item.id} className="py-6 flex space-x-4 md:space-x-6">
                    {/* Item Image with 4:5 aspect ratio */}
                    <div className="w-24 md:w-32 aspect-[4/5] bg-neutral-100 border border-neutral-200 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.productName}
                          fill
                          sizes="(max-width: 768px) 96px, 128px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">SIFR</span>
                      )}
                    </div>

                    {/* Item Details */}
                    <div className="flex-1 flex flex-col justify-between py-1">
                      <div>
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-serif text-lg font-normal text-neutral-900 tracking-tight leading-tight">
                              {item.productName}
                            </h3>
                            <p className="text-xs font-mono text-neutral-500 mt-1">
                              Option: <span className="text-neutral-800 font-medium">{item.variantTitle}</span>
                            </p>
                            <p className="text-[11px] font-mono text-neutral-400 mt-0.5">SKU: {item.sku}</p>
                          </div>
                          <span className="font-mono text-sm font-bold text-neutral-900">
                            ₹{item.unitPrice.toLocaleString('en-IN')}
                          </span>
                        </div>

                        {item.isOutOfStock && (
                          <p className="mt-2 text-xs font-mono text-rose-600 font-medium">
                            Stock alert: Only {item.availableStock} unit(s) available
                          </p>
                        )}
                      </div>

                      {/* Quantity Controls & Remove */}
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-100">
                        <div className="flex items-center space-x-3">
                          <div className="inline-flex items-center border border-neutral-300 rounded-md bg-neutral-50 px-2 py-1">
                            <button
                              onClick={() => handleUpdateQty(item.variantId, item.quantity, -1)}
                              className="p-1 text-neutral-600 hover:text-neutral-900 transition-colors"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-mono text-xs font-bold text-neutral-900 px-3">{item.quantity}</span>
                            <button
                              onClick={() => handleUpdateQty(item.variantId, item.quantity, 1)}
                              className="p-1 text-neutral-600 hover:text-neutral-900 transition-colors"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            onClick={() => handleRemoveItem(item.variantId)}
                            className="inline-flex items-center space-x-1 text-xs font-mono text-neutral-400 hover:text-rose-600 transition-colors p-1"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Remove</span>
                          </button>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] font-mono text-neutral-400 block uppercase">Subtotal</span>
                          <span className="font-mono text-sm font-bold text-neutral-900">
                            ₹{item.lineTotal.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Order Summary (~35%) */}
            <div className="lg:col-span-5">
              <div className="bg-neutral-50 border border-neutral-200 p-6 md:p-8 rounded-2xl space-y-6 sticky top-24 shadow-sm">
                <h2 className="font-serif text-2xl font-normal text-neutral-900 border-b border-neutral-200 pb-4 tracking-tight">
                  Order Summary
                </h2>

                {/* Coupon Code Form */}
                <div className="pb-4 border-b border-neutral-200">
                  {cartData.appliedCouponCode ? (
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <Tag className="w-4 h-4 text-emerald-600" />
                        <span className="font-mono font-bold text-emerald-900 text-xs">
                          {cartData.appliedCouponCode}
                        </span>
                        {cartData.appliedCoupon?.isValid ? (
                          <span className="text-[11px] font-mono text-emerald-700">
                            (-₹{cartData.discountTotal.toLocaleString('en-IN')})
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-rose-600">
                            Invalid: {cartData.appliedCoupon?.reason}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          await removeCartCouponAction();
                          await loadCart();
                        }}
                        className="text-neutral-400 hover:text-neutral-900 p-1"
                        aria-label="Remove coupon"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        const inputEl = form.elements.namedItem('couponCode') as HTMLInputElement;
                        const codeVal = inputEl?.value?.trim();
                        if (!codeVal) return;

                        setErrorMsg(null);
                        const res = await applyCartCouponAction(codeVal);
                        if (!res.success) {
                          setErrorMsg(res.reason || 'Invalid promo code');
                        } else {
                          inputEl.value = '';
                          await loadCart();
                        }
                      }}
                      className="flex space-x-2"
                    >
                      <input
                        type="text"
                        name="couponCode"
                        placeholder="PROMO CODE"
                        className="flex-1 bg-white border border-neutral-300 rounded px-3 py-2 text-xs font-mono uppercase focus:outline-none focus:border-neutral-900 placeholder-neutral-400"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest rounded hover:bg-neutral-800 transition-colors"
                      >
                        Apply
                      </button>
                    </form>
                  )}
                </div>

                {/* Totals Breakdown */}
                <div className="space-y-3 text-xs font-mono">
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

                  <div className="pt-3 border-t border-neutral-200 flex justify-between items-baseline text-sm">
                    <span className="font-sans font-bold text-neutral-900 uppercase tracking-wider text-xs">Total</span>
                    <span className="font-mono text-xl font-bold text-neutral-900">
                      ₹{cartData.grandTotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Order on WhatsApp CTA */}
                <Link
                  href="/whatsapp-order?from=cart"
                  className={`w-full py-4 bg-neutral-900 text-white font-mono text-xs uppercase tracking-widest rounded flex items-center justify-center space-x-2 hover:bg-neutral-800 transition-colors shadow-sm ${
                    cartData.hasUnavailableItems ? 'opacity-50 pointer-events-none' : ''
                  }`}
                  id="fullpage-cart-whatsapp-order-btn"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-400" />
                  <span>Order on WhatsApp</span>
                </Link>

                {/* Legacy Checkout CTA */}
                <Link
                  href="/checkout"
                  className={`w-full py-3 border border-neutral-300 text-neutral-700 font-mono text-xs uppercase tracking-widest rounded flex items-center justify-center space-x-2 hover:bg-neutral-100 transition-colors ${
                    cartData.hasUnavailableItems ? 'opacity-50 pointer-events-none' : ''
                  }`}
                  id="fullpage-cart-checkout-btn"
                >
                  <span>Proceed to Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                {/* Security Note */}
                <div className="pt-2 flex items-center justify-center space-x-2 text-[11px] font-mono text-neutral-500">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Authoritative Secure Checkout</span>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
