'use client';

import React from 'react';
import { SlidersHorizontal, ChevronDown, X } from 'lucide-react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

interface PlpFilterBarProps {
  onOpenFilterDrawer: () => void;
  activeFilterCount: number;
}

export function PlpFilterBar({ onOpenFilterDrawer, activeFilterCount }: PlpFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const currentSort = searchParams.get('sort') || 'recommended';

  const handleSortChange = (newSort: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newSort === 'recommended') {
      params.delete('sort');
    } else {
      params.set('sort', newSort);
    }
    const newUrl = `${pathname}?${params.toString()}`;
    router.push(newUrl, { scroll: false });
  };

  const removeFilterParam = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Collect active filters for visual chip display
  const activeChips: { key: string; label: string }[] = [];
  if (searchParams.get('category')) activeChips.push({ key: 'category', label: `Category: ${searchParams.get('category')}` });
  if (searchParams.get('size')) activeChips.push({ key: 'size', label: `Size: ${searchParams.get('size')}` });
  if (searchParams.get('color')) activeChips.push({ key: 'color', label: `Color: ${searchParams.get('color')}` });
  if (searchParams.get('minPrice')) activeChips.push({ key: 'minPrice', label: `Min ₹${searchParams.get('minPrice')}` });
  if (searchParams.get('maxPrice')) activeChips.push({ key: 'maxPrice', label: `Max ₹${searchParams.get('maxPrice')}` });
  if (searchParams.get('availability') === 'in-stock') activeChips.push({ key: 'availability', label: 'In Stock Only' });

  return (
    <div className="py-4 border-b border-neutral-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      {/* Left: Filter Toggle Button & Active Filter Chips */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onOpenFilterDrawer}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-neutral-200 hover:border-neutral-900 rounded text-xs font-mono tracking-wider uppercase text-neutral-800 transition-colors shadow-2xs"
          id="btn-open-filter-drawer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-700" />
          <span>Filter</span>
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] font-mono flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Active Filter Chips */}
        {activeChips.map((chip) => (
          <button
            key={chip.key}
            onClick={() => removeFilterParam(chip.key)}
            className="inline-flex items-center space-x-1.5 px-3 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded text-[11px] font-mono transition-colors"
          >
            <span>{chip.label}</span>
            <X className="w-3 h-3 text-neutral-500" />
          </button>
        ))}

        {activeChips.length > 0 && (
          <button
            onClick={() => router.push(pathname, { scroll: false })}
            className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 hover:text-neutral-900 underline ml-1"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Right: Sort Control Dropdown */}
      <div className="flex items-center space-x-2 text-xs font-mono">
        <span className="text-neutral-400 uppercase tracking-widest text-[10px]">SORT BY:</span>
        <div className="relative inline-block text-left">
          <select
            value={currentSort}
            onChange={(e) => handleSortChange(e.target.value)}
            className="appearance-none bg-white border border-neutral-200 hover:border-neutral-900 rounded px-3 py-2 pr-8 text-neutral-900 font-mono text-xs focus:outline-none cursor-pointer transition-colors"
            id="plp-sort-select"
          >
            <option value="recommended">Recommended</option>
            <option value="newest">Newest</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
