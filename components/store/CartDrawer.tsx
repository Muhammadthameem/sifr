'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag, X, Plus, Minus, Trash2, ArrowRight, MessageCircle } from 'lucide-react';
import {
  fetchCartAction,
  updateCartItemAction,
  removeFromCartAction,
  applyCartCouponAction,
  removeCartCouponAction,
} from '@/lib/actions/cart-actions';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCartChange?: () => void;
}

export function CartDrawer({ isOpen, onClose, onCartChange }: CartDrawerProps) {
  const [cartData, setCartData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
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
    if (isOpen) {
      loadCart();
    }
  }, [isOpen]);

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
      if (onCartChange) onCartChange();
    }
  };

  const handleRemoveItem = async (variantId: string) => {
    setErrorMsg(null);
    await removeFromCartAction(variantId);
    await loadCart();
    if (onCartChange) onCartChange();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-neutral-200 text-neutral-900 flex flex-col shadow-2xl">
          
          {/* Drawer Header */}
          <div className="p-6 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
            <div className="flex items-center space-x-3">
              <ShoppingBag className="w-5 h-5 text-neutral-900" />
              <h2 className="text-lg font-serif tracking-tight font-normal text-neutral-900">Shopping Cart</h2>
              {cartData && (
                <span className="text-xs bg-neutral-200 text-neutral-800 px-2 py-0.5 rounded-full font-mono font-medium">
                  {cartData.itemCount}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-neutral-900 transition-colors rounded-full hover:bg-neutral-100"
              id="close-cart-drawer-btn"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Error Message Toast */}
          {errorMsg && (
            <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono rounded-md">
              {errorMsg}
            </div>
          )}

          {/* Drawer Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading && !cartData ? (
              <div className="flex items-center justify-center py-20 text-neutral-400 font-mono text-xs uppercase tracking-widest">
                Loading cart...
              </div>
            ) : !cartData || cartData.items.length === 0 ? (
              <div className="text-center py-20 space-y-4">
                <ShoppingBag className="w-12 h-12 text-neutral-300 mx-auto" />
                <p className="text-neutral-500 text-xs font-mono">Your shopping cart is currently empty.</p>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-xs font-mono uppercase tracking-widest text-white transition-colors rounded"
                >
                  Explore Collection
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {cartData.items.map((item: any) => (
                  <div key={item.id} className="flex space-x-4 p-3.5 bg-neutral-50 border border-neutral-200/80 rounded-lg">
                    {/* Item Thumbnail */}
                    <div className="w-20 aspect-[4/5] bg-neutral-100 rounded overflow-hidden flex-shrink-0 flex items-center justify-center border border-neutral-200 relative">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.productName} fill sizes="80px" className="object-cover" />
                      ) : (
                        <span className="text-[10px] text-neutral-400 font-mono uppercase">SIFR</span>
                      )}
                    </div>

                    {/* Item Info */}
                    <div className="flex-1 flex flex-col justify-between py-0.5">
                      <div>
                        <div className="flex justify-between items-start">
                          <h3 className="text-sm font-serif font-normal text-neutral-900 line-clamp-1">{item.productName}</h3>
                          <button
                            onClick={() => handleRemoveItem(item.variantId)}
                            className="text-neutral-400 hover:text-rose-600 transition-colors p-1"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-neutral-500 font-mono mt-0.5">{item.variantTitle} <span className="text-neutral-400 font-mono">({item.sku})</span></p>
                        <p className="text-xs font-bold font-mono text-neutral-900 mt-1">₹{item.unitPrice.toLocaleString('en-IN')}</p>
                      </div>

                      {/* Stock Warning */}
                      {item.isOutOfStock && (
                        <p className="text-[10px] text-rose-600 font-mono font-medium">Only {item.availableStock} available</p>
                      )}

                      {/* Quantity Controls */}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-neutral-200/60">
                        <div className="flex items-center space-x-2 border border-neutral-300 rounded bg-white px-2 py-0.5">
                          <button
                            onClick={() => handleUpdateQty(item.variantId, item.quantity, -1)}
                            className="text-neutral-600 hover:text-neutral-900 transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-mono font-bold text-neutral-900 px-1">{item.quantity}</span>
                          <button
                            onClick={() => handleUpdateQty(item.variantId, item.quantity, 1)}
                            className="text-neutral-600 hover:text-neutral-900 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-xs font-bold font-mono text-neutral-900">
                          ₹{item.lineTotal.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Drawer Footer Financial Totals & Navigation CTAs */}
          {cartData && cartData.items.length > 0 && (
            <div className="p-6 border-t border-neutral-200 bg-neutral-50 space-y-4">
              {/* Coupon Code Input & Applied Pill */}
              <div className="pt-1 pb-1 border-b border-neutral-200">
                {cartData.appliedCouponCode ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg text-xs font-mono">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded text-[11px]">
                        {cartData.appliedCouponCode}
                      </span>
                      {cartData.appliedCoupon?.isValid ? (
                        <span className="text-[11px] text-emerald-700 font-medium">(-₹{cartData.discountTotal.toLocaleString('en-IN')})</span>
                      ) : (
                        <span className="text-[11px] text-rose-600 font-medium">Invalid: {cartData.appliedCoupon?.reason}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await removeCartCouponAction();
                        await loadCart();
                        if (onCartChange) onCartChange();
                      }}
                      className="text-neutral-400 hover:text-neutral-900 p-1"
                      title="Remove coupon"
                    >
                      <X className="w-3.5 h-3.5" />
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
                        setErrorMsg(res.reason || 'Invalid coupon code');
                      } else {
                        inputEl.value = '';
                        await loadCart();
                        if (onCartChange) onCartChange();
                      }
                    }}
                    className="flex space-x-2"
                  >
                    <input
                      type="text"
                      name="couponCode"
                      placeholder="PROMO CODE"
                      className="flex-1 bg-white border border-neutral-300 rounded px-3 py-1.5 text-xs font-mono uppercase focus:outline-none focus:border-neutral-900 placeholder-neutral-400 text-neutral-900"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-xs text-white font-mono rounded uppercase tracking-wider transition-colors"
                    >
                      Apply
                    </button>
                  </form>
                )}
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between text-neutral-600">
                  <span>Subtotal</span>
                  <span className="font-bold text-neutral-900">₹{cartData.subtotal.toLocaleString('en-IN')}</span>
                </div>
                {cartData.discountTotal > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Coupon Discount ({cartData.appliedCouponCode})</span>
                    <span>-₹{cartData.discountTotal.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="flex justify-between text-neutral-600">
                  <span>Shipping Fee</span>
                  <span className="font-bold text-neutral-900">
                    {cartData.shippingFee === 0 ? 'FREE' : `₹${cartData.shippingFee.toLocaleString('en-IN')}`}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold text-neutral-900 pt-2 border-t border-neutral-200">
                  <span>Grand Total</span>
                  <span>₹{cartData.grandTotal.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <Link
                  href="/whatsapp-order?from=cart"
                  onClick={onClose}
                  className={`w-full flex items-center justify-center space-x-2 py-3.5 bg-neutral-900 text-white font-mono font-medium text-xs uppercase tracking-widest rounded hover:bg-neutral-800 transition-colors shadow-sm ${
                    cartData.hasUnavailableItems ? 'opacity-50 pointer-events-none' : ''
                  }`}
                  id="cart-drawer-whatsapp-order-btn"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-400" />
                  <span>Order on WhatsApp</span>
                </Link>

                <Link
                  href="/checkout"
                  onClick={onClose}
                  className={`w-full flex items-center justify-center space-x-2 py-2.5 border border-neutral-300 text-neutral-700 font-mono text-xs uppercase tracking-widest rounded hover:bg-neutral-50 transition-colors ${
                    cartData.hasUnavailableItems ? 'opacity-50 pointer-events-none' : ''
                  }`}
                  id="cart-drawer-checkout-btn"
                >
                  <span>Proceed to Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <Link
                  href="/cart"
                  onClick={onClose}
                  className="w-full flex items-center justify-center py-2.5 border border-neutral-300 text-neutral-900 font-mono text-xs uppercase tracking-widest rounded hover:bg-neutral-100 transition-colors"
                  id="cart-drawer-view-full-cart-btn"
                >
                  View Full Cart
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
