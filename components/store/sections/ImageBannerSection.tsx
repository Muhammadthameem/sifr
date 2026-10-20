import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CompiledSectionPayload } from '@/lib/cms/cms-service';

interface ImageBannerSectionProps {
  payload: CompiledSectionPayload;
}

export function ImageBannerSection({ payload }: ImageBannerSectionProps) {
  const { heading, subheading, imageUrl, altText, buttons } = payload;
  const activeButtons = buttons || [];

  return (
    <section className="relative w-full overflow-hidden bg-neutral-900 text-white">
      <div className="relative w-full aspect-[2/1] min-h-[360px] sm:min-h-[440px] flex items-center justify-center">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={altText || heading || 'Promotional Banner'}
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
        ) : (
          <div className="absolute inset-0 bg-neutral-900 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.2),rgba(255,255,255,0))]" />
        )}

        {/* Dark Overlay for Text Visibility */}
        <div className="absolute inset-0 bg-neutral-950/40 backdrop-brightness-90" />

        {/* Banner Content */}
        <div className="relative z-10 p-6 sm:p-12 text-center max-w-3xl flex flex-col items-center">
          {heading && (
            <h2 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-normal text-white leading-tight drop-shadow-sm">
              {heading}
            </h2>
          )}

          {subheading && (
            <p className="mt-3 sm:mt-4 text-xs sm:text-sm lg:text-base text-neutral-200 font-light tracking-wide max-w-xl drop-shadow-sm">
              {subheading}
            </p>
          )}

          {/* Configurable Buttons (Up to 2) */}
          {activeButtons.length > 0 && (
            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto">
              {activeButtons.slice(0, 2).map((btn, idx) => {
                const isSecondary = btn.style === 'SECONDARY';
                return (
                  <Link
                    key={idx}
                    href={btn.url || '#'}
                    className={`w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 text-xs font-mono tracking-widest uppercase rounded transition-all duration-300 ${
                      isSecondary
                        ? 'bg-transparent text-white border border-white/80 hover:bg-white/10 hover:border-white'
                        : 'bg-white text-neutral-900 hover:bg-neutral-100 shadow-md shadow-black/20'
                    }`}
                  >
                    {btn.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
