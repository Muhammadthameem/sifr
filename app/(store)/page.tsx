import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { getPublishedSections, getStorefrontProductsByIds } from '@/lib/cms/cms-service';
import { getStorefrontProducts } from '@/lib/actions/product-actions';
import { HeroSection } from '@/components/store/sections/HeroSection';
import { ProductCarouselSection } from '@/components/store/sections/ProductCarouselSection';
import { ImageBannerSection } from '@/components/store/sections/ImageBannerSection';
import { SplitFeatureSection } from '@/components/store/sections/SplitFeatureSection';
import { FeatureCardsSection } from '@/components/store/sections/FeatureCardsSection';
import { ProductCard } from '@/components/store/ProductCard';

export const revalidate = 0; // Dynamic server rendering for CMS snapshot sync

export default async function StoreHomePage() {
  const publishedSections = await getPublishedSections();

  // If no published CMS content exists, render clean fallback homepage state
  if (!publishedSections || publishedSections.length === 0) {
    const fallbackProducts = await getStorefrontProducts();

    return (
      <div className="w-full bg-white">
        {/* Fallback Editorial Hero */}
        <section className="relative w-full bg-neutral-900 text-white py-24 sm:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.25),rgba(255,255,255,0))]" />
          
          <div className="relative z-10 max-w-5xl mx-auto px-6 text-center flex flex-col items-center">
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full border border-neutral-700 bg-neutral-800/60 backdrop-blur-sm text-xs font-mono tracking-wider text-neutral-300 mb-8">
              <Sparkles className="w-3.5 h-3.5 text-neutral-300" />
              <span>SIFR LUXURY ESSENTIALS</span>
            </div>

            <h1 className="font-serif text-5xl sm:text-7xl lg:text-8xl tracking-tight font-light uppercase text-white mb-6">
              SIFR
            </h1>

            <p className="max-w-2xl text-sm sm:text-base lg:text-lg font-light text-neutral-300 tracking-wide mb-10">
              Timeless fashion, refined silhouettes, and uncompromising quality.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
              <Link
                href="/women"
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-8 py-3.5 rounded bg-white text-neutral-900 font-mono text-xs tracking-widest uppercase hover:bg-neutral-100 transition-colors shadow-lg"
              >
                <span>Shop Women</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/men"
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-8 py-3.5 rounded border border-white/80 text-white font-mono text-xs tracking-widest uppercase hover:bg-white/10 transition-colors"
              >
                <span>Shop Men</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Fallback Active Products Preview */}
        {fallbackProducts.length > 0 && (
          <section className="py-16 sm:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-8 text-center">
              <span className="text-xs font-mono tracking-widest uppercase text-neutral-400 block mb-1">
                Featured Collection
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl text-neutral-900 font-normal">
                Curated Designs
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {fallbackProducts.slice(0, 8).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // Gather all unique product IDs across published sections
  const allProductIdsSet = new Set<string>();
  for (const sec of publishedSections) {
    const payload = sec.publishedPayload;
    if (payload?.productIds && payload.productIds.length > 0) {
      payload.productIds.forEach((id) => allProductIdsSet.add(id));
    }
  }

  // Fetch product models for all referenced products
  const products = await getStorefrontProductsByIds(Array.from(allProductIdsSet));
  const productMap = new Map(products.map((p) => [p.id, p]));

  return (
    <div className="w-full bg-white flex flex-col min-h-screen">
      {publishedSections.map((sec, idx) => {
        const payload = sec.publishedPayload;
        if (!payload) return null;

        // Map section productIds to full Product objects
        const sectionProducts = (payload.productIds || [])
          .map((id) => productMap.get(id))
          .filter(Boolean);

        switch (sec.type) {
          case 'HERO':
            return (
              <HeroSection
                key={sec.id}
                payload={payload}
                priority={idx === 0}
              />
            );

          case 'PRODUCT_CAROUSEL':
            return (
              <ProductCarouselSection
                key={sec.id}
                payload={payload}
                products={sectionProducts}
              />
            );

          case 'IMAGE_BANNER':
            return (
              <ImageBannerSection
                key={sec.id}
                payload={payload}
              />
            );

          case 'SPLIT_FEATURE':
            return (
              <SplitFeatureSection
                key={sec.id}
                payload={payload}
                products={sectionProducts}
              />
            );

          case 'FEATURE_CARDS':
            return (
              <FeatureCardsSection
                key={sec.id}
                payload={payload}
              />
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
