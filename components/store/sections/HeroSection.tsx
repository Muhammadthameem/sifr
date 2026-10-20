import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CompiledSectionPayload } from '@/lib/cms/cms-service';

interface HeroSectionProps {
  payload: CompiledSectionPayload;
  priority?: boolean;
}

export function HeroSection({ payload, priority = true }: HeroSectionProps) {
  const { heading, subheading, imageUrl, altText, buttons } = payload;
  const activeButtons = buttons || [];

  return (
    <section className="relative w-full overflow-hidden bg-neutral-900 text-white">
      {/* Editorial Image Background / Container (16:7 Desktop Aspect Ratio) */}
      <div className="relative min-h-[500px] sm:min-h-[600px] lg:min-h-[700px] w-full flex items-center justify-center">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={altText || heading || 'Hero image'}
            priority={priority}
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
        ) : (
          <div className="absolute inset-0 bg-neutral-900 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.2),rgba(255,255,255,0))]" />
        )}

        {/* Overlay Darkening Gradient for Text Contrast */}
        {imageUrl && (
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-neutral-950/40 to-neutral-950/20" />
        )}

        {/* Hero Overlay Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 py-20 text-center flex flex-col items-center">
          {heading && (
            <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl font-light tracking-tight text-white leading-tight max-w-4xl drop-shadow-sm">
              {heading}
            </h1>
          )}

          {subheading && (
            <p className="mt-4 sm:mt-6 text-sm sm:text-base lg:text-lg text-neutral-200 font-light tracking-wide max-w-2xl drop-shadow-sm">
              {subheading}
            </p>
          )}

          {/* Configurable Buttons (Up to 2) */}
          {activeButtons.length > 0 && (
            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
              {activeButtons.slice(0, 2).map((btn, idx) => {
                const isSecondary = btn.style === 'SECONDARY';
                return (
                  <Link
                    key={idx}
                    href={btn.url || '#'}
                    className={`w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 text-xs font-mono tracking-widest uppercase rounded transition-all duration-300 ${
                      isSecondary
                        ? 'bg-transparent text-white border border-white/80 hover:bg-white/10 hover:border-white'
                        : 'bg-white text-neutral-900 hover:bg-neutral-100 shadow-lg shadow-black/20'
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
