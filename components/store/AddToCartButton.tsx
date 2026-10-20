'use client';

import React, { useState } from 'react';
import { ShoppingBag, Check, AlertCircle } from 'lucide-react';
import { addToCartAction } from '@/lib/actions/cart-actions';

interface AddToCartButtonProps {
  variantId: string;
  isAvailable: boolean;
  availableStock: number;
  onSuccess?: () => void;
  className?: string;
}

export function AddToCartButton({
  variantId,
  isAvailable,
  availableStock,
  onSuccess,
  className = '',
}: AddToCartButtonProps) {
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddToCart = async () => {
    if (!isAvailable || availableStock <= 0) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await addToCartAction({ variantId, quantity: 1 });
      if (!res.success) {
        if (res.code === 'EXCEEDS_AVAILABLE_STOCK') {
          setErrorMsg(`Only ${res.availableQuantity} unit(s) available in stock.`);
        } else {
          setErrorMsg(res.message || 'Failed to add item to cart');
        }
      } else {
        setAdded(true);
        setTimeout(() => setAdded(false), 2000);
        if (onSuccess) onSuccess();
      }
    } catch {
      setErrorMsg('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const isOutOfStock = !isAvailable || availableStock <= 0;

  return (
    <div className="space-y-2 w-full">
      <button
        type="button"
        onClick={handleAddToCart}
        disabled={isOutOfStock || loading}
        id={`add-to-cart-btn-${variantId}`}
        className={`w-full flex items-center justify-center space-x-2 py-3.5 px-6 text-xs font-semibold uppercase tracking-widest transition-all ${
          isOutOfStock
            ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700'
            : added
            ? 'bg-emerald-600 text-white'
            : 'bg-white text-black hover:bg-neutral-200 active:scale-[0.99]'
        } ${className}`}
      >
        {loading ? (
          <span>Adding...</span>
        ) : added ? (
          <>
            <Check className="w-4 h-4" />
            <span>Added to Cart</span>
          </>
        ) : isOutOfStock ? (
          <span>Out of Stock</span>
        ) : (
          <>
            <ShoppingBag className="w-4 h-4" />
            <span>Add to Cart</span>
          </>
        )}
      </button>

      {errorMsg && (
        <div className="flex items-center space-x-1.5 text-xs text-red-400 bg-red-950/60 border border-red-800/80 p-2 rounded">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
