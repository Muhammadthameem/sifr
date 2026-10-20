import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { CompiledSectionPayload } from '@/lib/cms/cms-service';

interface FeatureCardsSectionProps {
  payload: CompiledSectionPayload;
}

export function FeatureCardsSection({ payload }: FeatureCardsSectionProps) {
  const { heading, subheading, featureCards } = payload;
  const cards = (featureCards || []).slice(0, 3);

  if (cards.length === 0) {
    return null;
  }

  return (
    <section className="py-12 sm:py-16 bg-white border-b border-neutral-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        {(heading || subheading) && (
          <div className="mb-10 text-center max-w-2xl mx-auto">
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

        {/* 3 Cards Container */}
        {/* Desktop: Three equal cards side-by-side (grid-cols-3) */}
        {/* Mobile: Responsive stacked presentation */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {cards.map((card, idx) => (
            <div
              key={card.id || idx}
              className="group relative flex flex-col bg-neutral-50 rounded-xl overflow-hidden border border-neutral-200/70 hover:border-neutral-900/30 transition-all duration-300"
            >
              {/* 3:4 Aspect Ratio Image Thumbnail Container */}
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-200">
                {card.imageUrl ? (
                  <Image
                    src={card.imageUrl}
                    alt={card.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-serif text-neutral-400 text-sm tracking-widest uppercase">
                    FEATURE {idx + 1}
                  </div>
                )}

                {/* Dark Overlay Gradient at Bottom */}
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/70 via-neutral-950/10 to-transparent" />

                {/* Card Floating Content */}
                <div className="absolute bottom-0 inset-x-0 p-6 flex flex-col items-start justify-end text-white">
                  <h3 className="font-serif text-xl sm:text-2xl font-normal leading-snug mb-3 drop-shadow-sm">
                    {card.title}
                  </h3>

                  {card.buttonLabel && card.buttonUrl && (
                    <Link
                      href={card.buttonUrl}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 rounded bg-white text-neutral-900 text-xs font-mono tracking-widest uppercase hover:bg-neutral-100 transition-colors shadow-sm"
                    >
                      <span>{card.buttonLabel}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
