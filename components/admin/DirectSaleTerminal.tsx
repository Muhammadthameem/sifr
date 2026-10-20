'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createDirectSaleAction } from '@/lib/actions/order-actions';
import { lookupCustomerByMobile } from '@/lib/actions/customer-actions';
import { Store, Search, Plus, Trash2, CheckCircle2, AlertCircle, ShoppingCart } from 'lucide-react';

export function DirectSaleTerminal() {
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerMobile, setCustomerMobile] = useState('9876543210');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const [cartItems, setCartItems] = useState<{ variant: any; quantity: number }[]>([]);
  const [creationIdempotencyKey, setCreationIdempotencyKey] = useState(
    `ds_pos_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<any | null>(null);

  // Search sellable variants
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/variants/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Variant search error:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleLookupMobile = async () => {
    if (!customerMobile.trim()) return;
    const res = await lookupCustomerByMobile(customerMobile);
    if (res.success && res.customer) {
      setCustomerName(res.customer.name);
      setCustomerEmail(res.customer.email || '');
      setCustomerAddress(res.customer.address || '');
    }
  };

  const addToCart = (variant: any) => {
    const available = (variant.inventoryItem?.physicalStock || 0) - (variant.inventoryItem?.reservedStock || 0);
    if (available <= 0) {
      alert('No available stock for this variant');
      return;
    }

    setCartItems((prev) => {
      const existing = prev.find((item) => item.variant.id === variant.id);
      if (existing) {
        if (existing.quantity >= available) {
          alert(`Cannot add more. Available stock is ${available}`);
          return prev;
        }
        return prev.map((item) =>
          item.variant.id === variant.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { variant, quantity: 1 }];
    });
  };

  const updateQuantity = (variantId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(variantId);
      return;
    }

    setCartItems((prev) =>
      prev.map((item) => {
        if (item.variant.id === variantId) {
          const available = (item.variant.inventoryItem?.physicalStock || 0) - (item.variant.inventoryItem?.reservedStock || 0);
          if (quantity > available) {
            alert(`Quantity exceeds available stock (${available})`);
            return item;
          }
          return { ...item, quantity };
        }
        return item;
      })
    );
  };

  const removeFromCart = (variantId: string) => {
    setCartItems((prev) => prev.filter((item) => item.variant.id !== variantId));
  };

  const calculateSubtotal = () => {
    return cartItems.reduce((acc, item) => acc + Number(item.variant.sellingPrice) * item.quantity, 0);
  };

  const handleSubmitDirectSale = async () => {
    if (cartItems.length === 0) {
      setError('Cart is empty. Add at least one variant.');
      return;
    }

    if (!customerName || !customerMobile) {
      setError('Customer name and mobile are required.');
      return;
    }

    if (!creationIdempotencyKey.trim()) {
      setError('creationIdempotencyKey is mandatory.');
      return;
    }

    setLoading(true);
    setError(null);
    setCreatedOrder(null);

    try {
      const res = await createDirectSaleAction({
        creationIdempotencyKey: creationIdempotencyKey.trim(),
        customer: {
          name: customerName,
          mobile: customerMobile,
          email: customerEmail || undefined,
          address: customerAddress || undefined,
        },
        items: cartItems.map((item) => ({
          variantId: item.variant.id,
          quantity: item.quantity,
        })),
      });

      if (res.success) {
        setCreatedOrder(res.order);
        setCartItems([]);
        setCreationIdempotencyKey(`ds_pos_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
      } else {
        setError(res.error || 'Failed to complete direct sale');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during direct sale submission');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-serif tracking-wide font-semibold text-white">
            Direct Sale POS Terminal
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Over-the-counter sales terminal with immediate stock reduction and FIFO costing.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Link
            href="/admin/orders"
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition"
          >
            View All Orders
          </Link>
        </div>
      </div>

      {createdOrder && (
        <div className="p-4 bg-emerald-950/80 border border-emerald-700/80 text-emerald-200 rounded-xl space-y-2">
          <div className="flex items-center space-x-2 font-semibold">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>Direct Sale Created Successfully!</span>
          </div>
          <p className="text-xs text-emerald-300">
            Order Number: <strong className="font-mono text-white">{createdOrder.orderNumber}</strong> |
            Grand Total: <strong className="font-mono text-white">₹{Number(createdOrder.grandTotal).toFixed(2)}</strong>
          </p>
          <div className="pt-2">
            <Link
              href={`/admin/orders/${createdOrder.id}`}
              className="text-xs text-white underline hover:text-emerald-300"
            >
              View Order Details & Audit Trail →
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 rounded-lg text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Variant Search & Item Selection */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Input Card */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Customer Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-neutral-400 mb-1">Mobile Number (India E.164)</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={customerMobile}
                    onChange={(e) => setCustomerMobile(e.target.value)}
                    onBlur={handleLookupMobile}
                    placeholder="9876543210"
                    className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-neutral-600"
                  />
                  <button
                    onClick={handleLookupMobile}
                    type="button"
                    className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded-lg border border-neutral-700"
                  >
                    Lookup
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer Name"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-white text-xs focus:outline-none focus:border-neutral-600"
                />
              </div>
            </div>
          </div>

          {/* Product / Variant Search Card */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Product Variant Search</h2>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
              <input
                type="text"
                placeholder="Search variants by SKU, product name, or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
              />
            </div>

            {/* Search Results */}
            {searching && <div className="text-xs text-neutral-500">Searching inventory...</div>}

            {searchResults.length > 0 && (
              <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-lg overflow-hidden bg-neutral-950">
                {searchResults.map((variant) => {
                  const phys = variant.inventoryItem?.physicalStock || 0;
                  const res = variant.inventoryItem?.reservedStock || 0;
                  const avail = phys - res;

                  return (
                    <div
                      key={variant.id}
                      className="p-3 flex items-center justify-between hover:bg-neutral-900/50 transition text-xs"
                    >
                      <div>
                        <div className="font-medium text-white">{variant.product?.name}</div>
                        <div className="text-neutral-400 font-mono text-[11px]">
                          {variant.title} | SKU: {variant.sku}
                        </div>
                        <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
                          Physical: {phys} | Reserved: {res} | Available:{' '}
                          <strong className={avail > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {avail}
                          </strong>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <span className="font-mono text-white font-medium">
                          ₹{Number(variant.sellingPrice).toFixed(2)}
                        </span>
                        <button
                          disabled={avail <= 0}
                          onClick={() => addToCart(variant)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded text-xs font-medium transition flex items-center space-x-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: POS Cart & Checkout */}
        <div className="space-y-6">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-neutral-800">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">POS Cart</h2>
              </div>
              <span className="text-xs font-mono text-neutral-400">
                {cartItems.length} line items
              </span>
            </div>

            {/* Cart Items List */}
            {cartItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-500">
                Cart is empty. Search and add product variants.
              </div>
            ) : (
              <div className="space-y-3">
                {cartItems.map((item) => {
                  const avail =
                    (item.variant.inventoryItem?.physicalStock || 0) -
                    (item.variant.inventoryItem?.reservedStock || 0);

                  return (
                    <div
                      key={item.variant.id}
                      className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg text-xs space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-white">{item.variant.product?.name}</div>
                          <div className="text-[11px] text-neutral-400 font-mono">
                            {item.variant.title} (Available: {avail})
                          </div>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.variant.id)}
                          className="text-neutral-500 hover:text-rose-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex justify-between items-center font-mono">
                        <div className="flex items-center space-x-2">
                          <label className="text-[11px] text-neutral-500">Qty:</label>
                          <input
                            type="number"
                            min="1"
                            max={avail}
                            value={item.quantity}
                            onChange={(e) =>
                              updateQuantity(item.variant.id, parseInt(e.target.value) || 1)
                            }
                            className="w-16 px-2 py-1 bg-neutral-900 border border-neutral-700 rounded text-center text-xs text-white"
                          />
                        </div>
                        <div className="font-medium text-white">
                          ₹{(Number(item.variant.sellingPrice) * item.quantity).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Idempotency Key Input */}
            <div className="pt-3 border-t border-neutral-800 space-y-1">
              <label className="block text-[11px] text-neutral-400 font-mono">
                Mandatory Idempotency Key:
              </label>
              <input
                type="text"
                value={creationIdempotencyKey}
                onChange={(e) => setCreationIdempotencyKey(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-[11px] font-mono text-neutral-300 focus:outline-none focus:border-neutral-600"
              />
            </div>

            {/* Subtotal & Action */}
            <div className="pt-3 border-t border-neutral-800 space-y-3">
              <div className="flex justify-between items-center text-sm font-semibold font-mono text-white">
                <span>Grand Total</span>
                <span>₹{calculateSubtotal().toFixed(2)}</span>
              </div>

              <button
                disabled={loading || cartItems.length === 0}
                onClick={handleSubmitDirectSale}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold tracking-wide transition shadow-sm"
              >
                {loading ? 'Processing Sale...' : 'Complete Direct Sale (POS)'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
