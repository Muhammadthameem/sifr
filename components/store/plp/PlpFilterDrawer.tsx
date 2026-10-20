'use client';

import React, { useState, useEffect } from 'react';
import { X, Check, RotateCcw } from 'lucide-react';
import { PlpFilterOptions } from '@/lib/catalog/plp-service';

interface PlpFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  options: PlpFilterOptions;
  currentFilters: {
    categorySlug?: string;
    size?: string;
    color?: string;
    minPrice?: number;
    maxPrice?: number;
    availability?: string;
    sort?: string;
  };
  onApplyFilters: (filters: {
    categorySlug?: string;
    size?: string;
    color?: string;
    minPrice?: number;
    maxPrice?: number;
    availability?: string;
  }) => void;
  hideColorFilter?: boolean;
}

export function PlpFilterDrawer({
  isOpen,
  onClose,
  options,
  currentFilters,
  onApplyFilters,
  hideColorFilter,
}: PlpFilterDrawerProps) {
  const [categorySlug, setCategorySlug] = useState(currentFilters.categorySlug || '');
  const [selectedSize, setSelectedSize] = useState(currentFilters.size || '');
  const [selectedColor, setSelectedColor] = useState(currentFilters.color || '');
  const [minPrice, setMinPrice] = useState<number | undefined>(currentFilters.minPrice);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(currentFilters.maxPrice);
  const [availability, setAvailability] = useState(currentFilters.availability || 'all');

  // Sync state when drawer opens or currentFilters change
  useEffect(() => {
    if (isOpen) {
      setCategorySlug(currentFilters.categorySlug || '');
      setSelectedSize(currentFilters.size || '');
      setSelectedColor(currentFilters.color || '');
      setMinPrice(currentFilters.minPrice);
      setMaxPrice(currentFilters.maxPrice);
      setAvailability(currentFilters.availability || 'all');
    }
  }, [isOpen, currentFilters]);

  if (!isOpen) return null;

  const handleApply = () => {
    onApplyFilters({
      categorySlug: categorySlug || undefined,
      size: selectedSize || undefined,
      color: selectedColor || undefined,
      minPrice: minPrice && minPrice > 0 ? minPrice : undefined,
      maxPrice: maxPrice && maxPrice > 0 ? maxPrice : undefined,
      availability: availability === 'in-stock' ? 'in-stock' : undefined,
    });
    onClose();
  };

  const handleClearAll = () => {
    setCategorySlug('');
    setSelectedSize('');
    setSelectedColor('');
    setMinPrice(undefined);
    setMaxPrice(undefined);
    setAvailability('all');
    onApplyFilters({});
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Filter Products"
    >
      <div className="bg-white w-full max-w-md h-full flex flex-col justify-between shadow-2xl overflow-hidden border-l border-neutral-200">
        
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="font-serif text-xl font-normal text-neutral-900 tracking-tight">
            Filters
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-900 rounded-full hover:bg-neutral-100 transition-colors"
            aria-label="Close Filter Drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body (Scrollable) */}
        <div className="p-6 overflow-y-auto space-y-8 flex-1 text-xs font-sans">
          
          {/* Category Section */}
          <div className="space-y-3">
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-neutral-400 font-semibold">
              Category
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCategorySlug('')}
                className={`px-3 py-1.5 rounded border transition-colors ${
                  !categorySlug
                    ? 'bg-neutral-900 text-white border-neutral-900 font-semibold'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-900'
                }`}
              >
                All Categories
              </button>
              {options.categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategorySlug(cat.slug)}
                  className={`px-3 py-1.5 rounded border transition-colors ${
                    categorySlug === cat.slug
                      ? 'bg-neutral-900 text-white border-neutral-900 font-semibold'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-900'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Size Section */}
          <div className="space-y-3 pt-4 border-t border-neutral-100">
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-neutral-400 font-semibold">
              Size
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {options.sizes.map((sz) => {
                const isSelected = selectedSize.toLowerCase() === sz.toLowerCase();
                return (
                  <button
                    key={sz}
                    onClick={() => setSelectedSize(isSelected ? '' : sz)}
                    className={`py-2 text-center rounded font-mono text-xs border transition-colors ${
                      isSelected
                        ? 'bg-neutral-900 text-white border-neutral-900 font-bold'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-900'
                    }`}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Section */}
          {!hideColorFilter && options.colors && options.colors.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-neutral-100">
              <h3 className="font-mono text-[11px] uppercase tracking-widest text-neutral-400 font-semibold">
                Color
              </h3>
              <div className="flex flex-wrap gap-2">
                {options.colors.map((clr) => {
                  const isSelected = selectedColor.toLowerCase() === clr.toLowerCase();
                  return (
                    <button
                      key={clr}
                      onClick={() => setSelectedColor(isSelected ? '' : clr)}
                      className={`px-3 py-1.5 rounded border flex items-center space-x-1.5 transition-colors ${
                        isSelected
                          ? 'bg-neutral-900 text-white border-neutral-900 font-semibold'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-900'
                      }`}
                    >
                      <span>{clr}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Price Range Section */}
          <div className="space-y-3 pt-4 border-t border-neutral-100">
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-neutral-400 font-semibold">
              Price Range (₹)
            </h3>
            <div className="grid grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-[10px] text-neutral-400 font-mono mb-1">MIN PRICE</label>
                <input
                  type="number"
                  placeholder={`₹${options.minPriceBound}`}
                  value={minPrice !== undefined ? minPrice : ''}
                  onChange={(e) => setMinPrice(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded text-neutral-900 focus:outline-none focus:border-neutral-900 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] text-neutral-400 font-mono mb-1">MAX PRICE</label>
                <input
                  type="number"
                  placeholder={`₹${options.maxPriceBound}`}
                  value={maxPrice !== undefined ? maxPrice : ''}
                  onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded text-neutral-900 focus:outline-none focus:border-neutral-900 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Availability Section */}
          <div className="space-y-3 pt-4 border-t border-neutral-100">
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-neutral-400 font-semibold">
              Availability
            </h3>
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="availability"
                  checked={availability === 'all'}
                  onChange={() => setAvailability('all')}
                  className="text-neutral-900 focus:ring-neutral-900"
                />
                <span className="text-neutral-800">All Products</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="availability"
                  checked={availability === 'in-stock'}
                  onChange={() => setAvailability('in-stock')}
                  className="text-neutral-900 focus:ring-neutral-900"
                />
                <span className="text-neutral-800">In Stock Only</span>
              </label>
            </div>
          </div>

        </div>

        {/* Drawer Footer Actions */}
        <div className="p-6 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between gap-3">
          <button
            onClick={handleClearAll}
            className="inline-flex items-center space-x-1 px-4 py-2.5 text-neutral-600 hover:text-neutral-900 text-xs font-mono tracking-wider uppercase transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            <span>Clear All</span>
          </button>

          <button
            onClick={handleApply}
            className="px-6 py-2.5 bg-neutral-900 text-white rounded text-xs font-mono tracking-widest uppercase hover:bg-neutral-800 transition-colors shadow-sm"
          >
            Apply Filters
          </button>
        </div>

      </div>
    </div>
  );
}
