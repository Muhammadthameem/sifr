import React from 'react';
import Link from 'next/link';
import { Search, ArrowLeft } from 'lucide-react';
import { searchStorefrontProducts, StorefrontSearchResult } from '@/lib/catalog/search-service';
import { ProductCard } from '@/components/store/ProductCard';

export const revalidate = 0; // Dynamic server rendering for search query

interface SearchPageProps {
  searchParams: { q?: string };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = typeof searchParams.q === 'string' ? searchParams.q.trim() : '';

  // Reuse centralized searchStorefrontProducts service (max 48 items)
  const results: StorefrontSearchResult[] = query ? await searchStorefrontProducts(query, 48) : [];

  return (
    <div className="bg-white min-h-screen text-neutral-900 font-sans pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
        
        {/* Header & Search Form */}
        <div className="mb-10 pb-6 border-b border-neutral-200">
          <nav className="flex items-center space-x-2 text-xs font-mono text-neutral-500 uppercase tracking-widest mb-4">
            <Link href="/" className="hover:text-neutral-900 transition-colors">Home</Link>
            <span>/</span>
            <span className="text-neutral-900 font-bold">Search</span>
          </nav>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="font-serif text-3xl md:text-4xl font-normal text-neutral-900 tracking-tight">
                {query ? `Search Results` : 'Search Collection'}
              </h1>
              {query && (
                <p className="text-xs font-mono text-neutral-500 mt-2">
                  Found <span className="text-neutral-900 font-bold">{results.length}</span> {results.length === 1 ? 'product' : 'products'} for &quot;<span className="text-neutral-900 font-semibold">{query}</span>&quot;
                </p>
              )}
            </div>

            {/* In-Page Refine Search Form */}
            <form action="/search" method="GET" className="w-full md:w-96 flex space-x-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  name="q"
                  defaultValue={query}
                  placeholder="Search products..."
                  id="search-page-input"
                  className="w-full bg-neutral-50 border border-neutral-300 rounded pl-9 pr-3 py-2 text-xs font-mono text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-neutral-900 text-white text-xs font-mono uppercase tracking-widest rounded hover:bg-neutral-800 transition-colors flex-shrink-0"
              >
                Search
              </button>
            </form>
          </div>
        </div>

        {/* Blank Query State */}
        {!query && (
          <div className="py-20 text-center space-y-6 max-w-md mx-auto">
            <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto text-neutral-400">
              <Search className="w-8 h-8" />
            </div>
            <h2 className="font-serif text-2xl font-normal text-neutral-900">Explore SIFR Collection</h2>
            <p className="text-xs text-neutral-600 font-light leading-relaxed">
              Type a search query above to discover our minimal, high-grade linen, cotton tees, and luxury apparel.
            </p>
            <div className="pt-4 flex items-center justify-center space-x-4">
              <Link
                href="/men"
                className="px-6 py-3 bg-neutral-900 text-white text-xs font-mono tracking-widest uppercase rounded hover:bg-neutral-800 transition-colors"
              >
                Explore Men
              </Link>
              <Link
                href="/women"
                className="px-6 py-3 border border-neutral-300 text-neutral-900 text-xs font-mono tracking-widest uppercase rounded hover:bg-neutral-50 transition-colors"
              >
                Explore Women
              </Link>
            </div>
          </div>
        )}

        {/* Empty Search Results State */}
        {query && results.length === 0 && (
          <div className="py-20 text-center space-y-6 max-w-md mx-auto">
            <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto text-neutral-400">
              <Search className="w-8 h-8" />
            </div>
            <h2 className="font-serif text-2xl font-normal text-neutral-900">
              No results for &quot;{query}&quot;
            </h2>
            <p className="text-xs text-neutral-600 font-light leading-relaxed">
              We couldn&apos;t find any matching active products. Please try another search term or browse our core collections.
            </p>
            <div className="pt-4 flex items-center justify-center space-x-4">
              <Link
                href="/men"
                className="inline-flex items-center space-x-2 px-6 py-3 bg-neutral-900 text-white text-xs font-mono tracking-widest uppercase rounded hover:bg-neutral-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Browse Men</span>
              </Link>
              <Link
                href="/women"
                className="px-6 py-3 border border-neutral-300 text-neutral-900 text-xs font-mono tracking-widest uppercase rounded hover:bg-neutral-50 transition-colors"
              >
                Browse Women
              </Link>
            </div>
          </div>
        )}

        {/* Results Grid: Responsive 4-col desktop / 3-col tablet / 2-col mobile */}
        {results.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {results.map((item) => {
              const cardProduct = {
                id: item.id,
                name: item.name,
                slug: item.slug,
                category: item.category,
                images: [
                  ...(item.primaryImage ? [{ url: item.primaryImage.url, altText: item.primaryImage.altText ?? null }] : []),
                  ...(item.secondaryImage ? [{ url: item.secondaryImage.url, altText: item.secondaryImage.altText ?? null }] : []),
                ],
                variants: [
                  { mrp: item.minMrp, sellingPrice: item.minSellingPrice, availableStock: item.availableStock },
                ],
                availableStock: item.availableStock,
              };

              return <ProductCard key={item.id} product={cardProduct} />;
            })}
          </div>
        )}

      </div>
    </div>
  );
}
