'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { CompiledSectionPayload } from '@/lib/cms/cms-service';
import { ProductCard } from '@/components/store/ProductCard';

interface ProductCarouselSectionProps {
  payload: CompiledSectionPayload;
  products: any[];
}

export function ProductCarouselSection({ payload, products }: ProductCarouselSectionProps) {
  const { heading, subheading, viewAllUrl } = payload;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Maximum 10 products
  const displayProducts = (products || []).slice(0, 10);

  if (displayProducts.length === 0) {
    return null;
  }

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = scrollContainerRef.current.clientWidth * 0.75;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <section
      className="py-12 sm:py-16 bg-white border-b border-neutral-100"
      aria-label={heading || 'Product carousel'}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 pb-4 border-b border-neutral-200/60 gap-4">
          <div>
            {subheading && (
              <span className="text-[10px] font-mono tracking-widest uppercase text-neutral-400 block mb-1">
                {subheading}
              </span>
            )}
            {heading && (
              <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl text-neutral-900 font-normal">
                {heading}
              </h2>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {viewAllUrl && (
              <Link
                href={viewAllUrl}
                className="inline-flex items-center space-x-1 text-xs font-mono tracking-wider uppercase text-neutral-900 hover:text-neutral-600 transition-colors group"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            )}

            {/* Desktop Navigation Arrows */}
            <div className="hidden sm:flex items-center space-x-1.5 pl-2 border-l border-neutral-200">
              <button
                onClick={() => scroll('left')}
                className="p-2 rounded-full border border-neutral-200 hover:border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-700 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-900"
                aria-label="Previous products"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scroll('right')}
                className="p-2 rounded-full border border-neutral-200 hover:border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-700 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-900"
                aria-label="Next products"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Carousel Scroll Area */}
        {/* Desktop: ~4 products visible (w-[24%] or min-w-[260px]) */}
        {/* Mobile: ~1.5 - 2 products visible (w-[65vw] sm:w-[40vw]) */}
        <div
          ref={scrollContainerRef}
          className="flex space-x-4 sm:space-x-6 overflow-x-auto pb-4 scrollbar-none snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          role="region"
          aria-roledescription="carousel"
        >
          {displayProducts.map((prod) => (
            <div
              key={prod.id}
              className="w-[68vw] sm:w-[42vw] md:w-[30vw] lg:w-[23%] flex-shrink-0 snap-start"
            >
              <ProductCard product={prod} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
