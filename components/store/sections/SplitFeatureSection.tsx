import React from 'react';
import Image from 'next/image';
import { CompiledSectionPayload } from '@/lib/cms/cms-service';
import { ProductCard } from '@/components/store/ProductCard';

interface SplitFeatureSectionProps {
  payload: CompiledSectionPayload;
  products: any[];
}

export function SplitFeatureSection({ payload, products }: SplitFeatureSectionProps) {
  const { heading, subheading, imageUrl, altText } = payload;
  // Exactly 4 products
  const gridProducts = (products || []).slice(0, 4);

  return (
    <section className="py-12 sm:py-16 bg-white border-b border-neutral-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        {(heading || subheading) && (
          <div className="mb-8 text-center max-w-2xl mx-auto">
            {subheading && (
              <span className="text-[10px] font-mono tracking-widest uppercase text-neutral-400 block mb-1">
                {subheading}
              </span>
            )}
            {heading && (
              <h2 className="font-serif text-2xl sm:text-4xl text-neutral-900 font-normal">
                {heading}
              </h2>
            )}
          </div>
        )}

        {/* 50/50 Desktop Grid / Image First Mobile Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-stretch">
          
          {/* Feature Image Column (Desktop 50%, Mobile First) */}
          <div className="relative aspect-[4/5] lg:aspect-auto w-full lg:h-full min-h-0 rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200/60 shadow-sm">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={altText || heading || 'Feature Spotlight'}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover object-center hover:scale-102 transition-transform duration-700"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-serif text-neutral-300 text-2xl tracking-widest uppercase bg-neutral-900 text-white">
                SIFR EDITORIAL
              </div>
            )}
          </div>

          {/* 4 Products in a 2x2 Grid */}
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            {gridProducts.map((prod) => (
              <ProductCard key={prod.id} product={prod} />
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
