import React from 'react';

interface PlpHeaderProps {
  title: string;
  subtitle?: string;
  totalCount: number;
}

export function PlpHeader({ title, subtitle, totalCount }: PlpHeaderProps) {
  return (
    <div className="border-b border-neutral-200/80 pb-6 sm:pb-8 pt-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="text-[10px] font-mono tracking-widest text-neutral-400 uppercase block mb-1">
            COLLECTION — {totalCount} {totalCount === 1 ? 'ITEM' : 'ITEMS'}
          </span>
          <h1 className="font-serif text-3xl sm:text-5xl font-light text-neutral-900 tracking-tight uppercase leading-none">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 text-xs sm:text-sm font-light text-neutral-500 max-w-2xl tracking-wide">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
