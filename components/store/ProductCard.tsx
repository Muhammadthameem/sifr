import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { getProductAvailability } from '@/lib/inventory/availability';

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    slug: string;
    category: { name: string; slug: string };
    images: { url: string; altText: string | null }[];
    variants: { mrp: any; sellingPrice: any; availableStock?: number }[];
    sourceButtons?: { label: string; targetProduct: { id: string; name: string; slug: string } }[];
    availableStock?: number;
  };
}

export function ProductCard({ product }: ProductCardProps) {
  const prices = product.variants.map((v) => Number(v.sellingPrice));
  const mrps = product.variants.map((v) => Number(v.mrp));

  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const correspondingMrp = mrps.length ? Math.max(...mrps) : 0;

  const priceDisplay =
    minPrice === maxPrice
      ? `₹${minPrice.toLocaleString('en-IN')}`
      : `₹${minPrice.toLocaleString('en-IN')} - ₹${maxPrice.toLocaleString('en-IN')}`;

  const hasDiscount = correspondingMrp > minPrice;
  const discountPct = hasDiscount ? Math.round(((correspondingMrp - minPrice) / correspondingMrp) * 100) : 0;

  const availability = getProductAvailability(product);

  const primaryImage = product.images[0]?.url;
  const secondaryImage = product.images[1]?.url;

  return (
    <div className="group relative flex flex-col bg-white overflow-hidden transition-all duration-300">
      {/* 4:5 Aspect Ratio Image Thumbnail Container */}
      <Link
        href={`/products/${product.slug}`}
        className="relative aspect-[4/5] bg-neutral-100 rounded-lg overflow-hidden block border border-neutral-200/60"
      >
        {primaryImage ? (
          <>
            <Image
              src={primaryImage}
              alt={product.images[0]?.altText || product.name}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              className={`object-cover transition-all duration-500 ${
                secondaryImage ? 'group-hover:opacity-0' : 'group-hover:scale-105'
              }`}
            />
            {secondaryImage && (
              <Image
                src={secondaryImage}
                alt={product.images[1]?.altText || product.name}
                fill
                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                className="object-cover opacity-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
              />
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center font-serif text-neutral-300 text-sm tracking-widest uppercase">
            SIFR
          </div>
        )}

        {/* Discount Badge */}
        {hasDiscount && (
          <div className="absolute top-3 left-3 bg-neutral-900 text-white font-mono text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wider rounded">
            -{discountPct}%
          </div>
        )}

        {/* Availability Badge */}
        <div
          className={`absolute top-3 right-3 font-mono text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wider rounded shadow-xs backdrop-blur-xs ${
            availability.status === 'OUT_OF_STOCK'
              ? 'bg-rose-950/80 text-rose-200 border border-rose-800/40'
              : availability.status === 'LOW_STOCK'
              ? 'bg-amber-950/80 text-amber-200 border border-amber-800/40'
              : 'bg-neutral-900/80 text-white border border-neutral-700/40'
          }`}
        >
          {availability.badgeText}
        </div>
      </Link>

      {/* Product Details Area */}
      <div className="pt-3 pb-1 flex flex-col flex-1 justify-between space-y-2">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 block truncate mb-0.5">
            {product.category.name}
          </span>
          <Link
            href={`/products/${product.slug}`}
            className="font-serif text-base font-medium text-neutral-900 hover:text-neutral-600 transition-colors line-clamp-1"
          >
            {product.name}
          </Link>
        </div>

        {/* Product Buttons (Visually linked color variations) */}
        {product.sourceButtons && product.sourceButtons.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest mr-1">
              Colors:
            </span>
            {product.sourceButtons.map((btn, idx) => (
              <Link
                key={idx}
                href={`/products/${btn.targetProduct.slug}`}
                className="inline-flex items-center space-x-0.5 text-[10px] font-mono px-2 py-0.5 rounded border border-neutral-200 bg-neutral-50 text-neutral-700 hover:text-neutral-900 hover:border-neutral-900 transition-colors"
              >
                <span>{btn.label}</span>
                <ArrowUpRight className="w-2.5 h-2.5 opacity-60" />
              </Link>
            ))}
          </div>
        )}

        {/* Price & Availability Row */}
        <div className="flex items-center justify-between pt-1 font-mono text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-neutral-900">{priceDisplay}</span>
            {hasDiscount && (
              <span className="text-neutral-400 line-through text-[11px]">
                ₹{correspondingMrp.toLocaleString('en-IN')}
              </span>
            )}
          </div>
          <span
            className={`text-[10px] uppercase tracking-wider font-medium ${
              availability.status === 'OUT_OF_STOCK'
                ? 'text-rose-600 font-semibold'
                : availability.status === 'LOW_STOCK'
                ? 'text-amber-700 font-semibold'
                : 'text-neutral-500'
            }`}
          >
            {availability.badgeText}
          </span>
        </div>
      </div>
    </div>
  );
}
