'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';

interface PlpEmptyStateProps {
  onResetFilters?: () => void;
}

export function PlpEmptyState({ onResetFilters }: PlpEmptyStateProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleReset = () => {
    if (onResetFilters) {
      onResetFilters();
    } else {
      router.push(pathname);
    }
  };

  return (
    <div className="py-24 px-4 text-center border border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50 my-8 flex flex-col items-center justify-center space-y-4">
      <div className="p-3 bg-white border border-neutral-200 rounded-full text-neutral-400">
        <SlidersHorizontal className="w-6 h-6" />
      </div>

      <div className="space-y-1">
        <h3 className="font-serif text-xl font-normal text-neutral-900">
          No matching products found
        </h3>
        <p className="text-xs font-light text-neutral-500 max-w-md mx-auto">
          We couldn&apos;t find any items matching your selected criteria. Try adjusting your filters or search terms.
        </p>
      </div>

      <button
        onClick={handleReset}
        className="inline-flex items-center space-x-2 px-5 py-2.5 bg-neutral-900 text-white rounded text-xs font-mono tracking-widest uppercase hover:bg-neutral-800 transition-colors shadow-sm"
        id="btn-reset-filters"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Reset All Filters</span>
      </button>
    </div>
  );
}
