'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search, X, ArrowRight, Loader2 } from 'lucide-react';
import { searchSuggestionsAction } from '@/lib/actions/product-actions';
import { StorefrontSearchResult } from '@/lib/catalog/search-service';

export interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StorefrontSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Focus input when opened & clear query
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSearched(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Global Keyboard listener: "/" to open, "Escape" to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key closes overlay
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced search query execution (200ms)
  useEffect(() => {
    if (!isOpen) return;

    const clean = query.trim();
    if (!clean) {
      setResults([]);
      setLoading(false);
      setSearched(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const timer = setTimeout(async () => {
      const res = await searchSuggestionsAction(clean, 8);
      if (isMounted) {
        if (res.success && res.results) {
          setResults(res.results);
        } else {
          setResults([]);
        }
        setLoading(false);
        setSearched(true);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  if (!isOpen) return null;

  const handleResultClick = (slug: string) => {
    onClose();
    router.push(`/products/${slug}`);
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (clean) {
      onClose();
      router.push(`/search?q=${encodeURIComponent(clean)}`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-900/40 backdrop-blur-md flex flex-col justify-start animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Product Search"
    >
      {/* Top Search Bar Panel (Phase 12A Light Editorial Design System: White Canvas, Subtle Borders, Near-Black Text) */}
      <div className="w-full bg-white border-b border-neutral-200 shadow-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="flex items-center justify-between gap-4">
            {/* Search Input Container */}
            <form onSubmit={handleSearchSubmit} className="relative flex-1 flex items-center">
              <Search className="w-5 h-5 text-neutral-400 absolute left-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products by name, category, or SKU..."
                className="w-full pl-8 pr-10 py-2 bg-transparent text-base sm:text-lg font-serif tracking-wide text-neutral-900 placeholder-neutral-400 focus:outline-none"
                aria-label="Search Input"
                id="header-search-input"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-0 p-1 text-neutral-400 hover:text-neutral-900 transition-colors"
                  aria-label="Clear Search Query"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </form>

            {/* Close Button & ESC Hint */}
            <div className="flex items-center space-x-3 flex-shrink-0">
              <span className="hidden sm:inline-block text-[10px] font-mono tracking-widest text-neutral-400 uppercase border border-neutral-200 px-2 py-1 rounded">
                ESC TO CLOSE
              </span>
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-neutral-600 hover:text-neutral-900 rounded-full hover:bg-neutral-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Close Search"
                id="btn-close-search"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results Body Area */}
      <div className="flex-1 overflow-y-auto max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        {/* Loading Indicator */}
        {loading && (
          <div className="flex items-center justify-center py-12 text-neutral-500 space-x-2 text-xs font-medium tracking-wider uppercase">
            <Loader2 className="w-4 h-4 animate-spin text-neutral-900" />
            <span>Searching SIFR Catalog...</span>
          </div>
        )}

        {/* Empty Query Prompt State */}
        {!loading && !query.trim() && (
          <div className="py-12 text-center space-y-3">
            <p className="text-xs tracking-widest text-neutral-400 uppercase font-mono">
              POPULAR CATEGORIES
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => setQuery('Men')}
                className="px-4 py-2 bg-white border border-neutral-200 hover:border-neutral-900 text-xs font-medium text-neutral-800 rounded-full transition-colors"
              >
                Men&apos;s Collection
              </button>
              <button
                onClick={() => setQuery('Women')}
                className="px-4 py-2 bg-white border border-neutral-200 hover:border-neutral-900 text-xs font-medium text-neutral-800 rounded-full transition-colors"
              >
                Women&apos;s Collection
              </button>
              <button
                onClick={() => setQuery('Tees')}
                className="px-4 py-2 bg-white border border-neutral-200 hover:border-neutral-900 text-xs font-medium text-neutral-800 rounded-full transition-colors"
              >
                Oversized Tees
              </button>
              <button
                onClick={() => setQuery('Hoodies')}
                className="px-4 py-2 bg-white border border-neutral-200 hover:border-neutral-900 text-xs font-medium text-neutral-800 rounded-full transition-colors"
              >
                Hoodies & Sweats
              </button>
            </div>
          </div>
        )}

        {/* No Results State */}
        {!loading && searched && query.trim() !== '' && results.length === 0 && (
          <div className="py-12 text-center bg-white border border-neutral-200 rounded-2xl p-8 space-y-2">
            <p className="font-serif text-lg font-semibold text-neutral-900">
              No products found for &quot;{query.trim()}&quot;
            </p>
            <p className="text-xs text-neutral-500">
              Try searching with a different term, category name, or product style.
            </p>
          </div>
        )}

        {/* Results Grid */}
        {!loading && results.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200 text-xs text-neutral-500 font-mono uppercase tracking-wider">
              <span>Matching Products ({results.length})</span>
              <span>Select to view details</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {results.map((product) => (
                <div
                  key={product.id}
                  onClick={() => handleResultClick(product.slug)}
                  className="group bg-white border border-neutral-200 hover:border-neutral-900 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md flex flex-col justify-between"
                >
                  {/* Product Image Thumbnail (4:5 Aspect Ratio) */}
                  <div className="relative aspect-[4/5] bg-neutral-100 overflow-hidden">
                    {product.primaryImage ? (
                      <Image
                        src={product.primaryImage.url}
                        alt={product.primaryImage.altText || product.name}
                        fill
                        sizes="(max-width: 640px) 50vw, 25vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-300 font-mono text-[10px]">
                        NO IMAGE
                      </div>
                    )}

                    {product.hasDiscount && (
                      <span className="absolute top-2 left-2 bg-neutral-900 text-white text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded">
                        -{product.maxDiscountPercent}%
                      </span>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="p-3 space-y-1">
                    <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block truncate">
                      {product.category.name}
                    </span>

                    <h4 className="font-serif text-sm font-semibold text-neutral-900 group-hover:text-neutral-600 transition-colors line-clamp-1">
                      {product.name}
                    </h4>

                    {/* Price Range */}
                    <div className="flex items-center space-x-2 text-xs pt-1">
                      <span className="font-semibold text-neutral-900 font-mono">
                        {formatCurrency(product.minSellingPrice)}
                      </span>
                      {product.hasDiscount && product.minMrp > product.minSellingPrice && (
                        <span className="text-neutral-400 line-through text-[11px] font-mono">
                          {formatCurrency(product.minMrp)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
