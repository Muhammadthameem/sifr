'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ProductCard } from '@/components/store/ProductCard';
import { loadMoreProductsAction } from '@/lib/actions/plp-actions';
import { PlpProduct, PlpFilterOptions } from '@/lib/catalog/plp-service';
import { ActiveCategoryNode } from '@/lib/actions/category-actions';
import { SlidersHorizontal, ChevronDown, X, Loader2 } from 'lucide-react';

interface ShopContainerProps {
  initialProducts: PlpProduct[];
  initialTotalCount: number;
  initialHasMore: boolean;
  initialPage: number;
  filterOptions: PlpFilterOptions;
  categoryTree: ActiveCategoryNode[];
}

function parseCategoryParam(param: string | null): string[] {
  if (!param) return [];
  return param
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ShopContainer({
  initialProducts,
  initialTotalCount,
  initialHasMore,
  initialPage,
  filterOptions,
  categoryTree,
}: ShopContainerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [products, setProducts] = useState<PlpProduct[]>(initialProducts);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState<boolean>(false);

  // Sync state when server props update (on navigation / query param change)
  useEffect(() => {
    setProducts(initialProducts);
    setHasMore(initialHasMore);
    setCurrentPage(initialPage);
  }, [initialProducts, initialHasMore, initialPage]);

  // Parse active category slugs from URL query param
  const activeCategorySlugs = useMemo(
    () => parseCategoryParam(searchParams.get('category')),
    [searchParams]
  );

  const currentSort = searchParams.get('sort') || 'recommended';

  // Toggle category checkbox (handles parent and child categories)
  const handleToggleCategory = (slug: string) => {
    let nextSlugs: string[];
    if (activeCategorySlugs.includes(slug)) {
      nextSlugs = activeCategorySlugs.filter((s) => s !== slug);
    } else {
      nextSlugs = [...activeCategorySlugs, slug];
    }

    const params = new URLSearchParams(searchParams.toString());
    if (nextSlugs.length > 0) {
      params.set('category', nextSlugs.join(','));
    } else {
      params.delete('category');
    }
    params.delete('page');

    const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    router.push(newUrl, { scroll: false });
  };

  // Clear all category filters
  const handleClearCategories = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('category');
    params.delete('page');
    const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    router.push(newUrl, { scroll: false });
  };

  // Handle Sort Change
  const handleSortChange = (newSort: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newSort === 'recommended') {
      params.delete('sort');
    } else {
      params.set('sort', newSort);
    }
    params.delete('page');
    const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    router.push(newUrl, { scroll: false });
  };

  // Load More Products (Server Action Pagination)
  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    const nextPage = currentPage + 1;
    const res = await loadMoreProductsAction({
      categorySlugs: activeCategorySlugs,
      sort: currentSort,
      page: nextPage,
      pageSize: 24,
    });

    if (res.success && res.products) {
      setProducts((prev) => [...prev, ...res.products]);
      setHasMore(res.hasMore);
      setCurrentPage(nextPage);

      const params = new URLSearchParams(searchParams.toString());
      params.set('page', nextPage.toString());
      window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    }

    setLoadingMore(false);
  };

  // Category Filter Component (used in both desktop sidebar & mobile drawer)
  const renderCategoryHierarchy = () => (
    <div className="space-y-4">
      <div className="space-y-3">
        {categoryTree.map((parent) => {
          const isParentChecked = activeCategorySlugs.includes(parent.slug);
          return (
            <div key={parent.id} className="space-y-2">
              {/* Parent Category Checkbox */}
              <label className="flex items-center space-x-2.5 cursor-pointer group select-none">
                <input
                  type="checkbox"
                  checked={isParentChecked}
                  onChange={() => handleToggleCategory(parent.slug)}
                  className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer accent-neutral-900"
                />
                <span
                  className={`text-xs font-mono tracking-wider uppercase transition-colors ${
                    isParentChecked
                      ? 'font-semibold text-neutral-950'
                      : 'text-neutral-700 group-hover:text-neutral-950'
                  }`}
                >
                  {parent.name}
                </span>
                {typeof parent.count === 'number' && parent.count > 0 && (
                  <span className="text-[10px] font-mono text-neutral-400 ml-auto">
                    ({parent.count})
                  </span>
                )}
              </label>

              {/* Child Subcategories (Indented under Parent) */}
              {parent.children && parent.children.length > 0 && (
                <div className="ml-6 pl-2.5 border-l border-neutral-200/80 space-y-2">
                  {parent.children.map((child) => {
                    const isChildChecked = activeCategorySlugs.includes(child.slug);
                    return (
                      <label
                        key={child.id}
                        className="flex items-center space-x-2.5 cursor-pointer group select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChildChecked}
                          onChange={() => handleToggleCategory(child.slug)}
                          className="w-3.5 h-3.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer accent-neutral-900"
                        />
                        <span
                          className={`text-[11px] font-mono tracking-wide transition-colors ${
                            isChildChecked
                              ? 'font-semibold text-neutral-950'
                              : 'text-neutral-600 group-hover:text-neutral-950'
                          }`}
                        >
                          {child.name}
                        </span>
                        {typeof child.count === 'number' && child.count > 0 && (
                          <span className="text-[10px] font-mono text-neutral-400 ml-auto">
                            ({child.count})
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="w-full bg-white text-neutral-900 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12">
        {/* Page Top Heading */}
        <div className="pb-8 border-b border-neutral-200/60 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <span className="text-xs font-mono tracking-[0.2em] uppercase text-neutral-400 block mb-2">
              SIFR Catalog
            </span>
            <h1 className="font-serif text-3xl sm:text-5xl font-normal text-neutral-900 tracking-tight">
              ALL PRODUCTS
            </h1>
            <p className="mt-2 text-xs sm:text-sm font-light text-neutral-600 max-w-xl">
              Minimalist luxury, contemporary silhouettes &amp; accessories crafted in India.
            </p>
          </div>

          <div className="flex items-center space-x-4">
            {/* Mobile Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileFilterOpen(true)}
              className="lg:hidden inline-flex items-center space-x-2 px-4 py-2 border border-neutral-300 rounded text-xs font-mono uppercase tracking-wider text-neutral-800 hover:border-neutral-900 transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeCategorySlugs.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] flex items-center justify-center font-bold">
                  {activeCategorySlugs.length}
                </span>
              )}
            </button>

            {/* Sort Control */}
            <div className="flex items-center space-x-2 text-xs font-mono">
              <span className="text-neutral-400 uppercase tracking-widest text-[10px]">SORT BY:</span>
              <div className="relative inline-block text-left">
                <select
                  value={currentSort}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="appearance-none bg-white border border-neutral-200 hover:border-neutral-900 rounded px-3 py-2 pr-8 text-neutral-900 font-mono text-xs focus:outline-none cursor-pointer transition-colors"
                  id="shop-sort-select"
                >
                  <option value="recommended">Recommended</option>
                  <option value="newest">Newest</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Active Filter Chips */}
        {activeCategorySlugs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-4 pb-2">
            <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest mr-1">
              Active Filters:
            </span>
            {activeCategorySlugs.map((slug) => {
              let label = slug;
              for (const parent of categoryTree) {
                if (parent.slug === slug) label = parent.name;
                for (const child of parent.children || []) {
                  if (child.slug === slug) label = `${parent.name} › ${child.name}`;
                }
              }
              return (
                <button
                  key={slug}
                  onClick={() => handleToggleCategory(slug)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded text-[11px] font-mono transition-colors"
                >
                  <span>{label}</span>
                  <X className="w-3 h-3 text-neutral-500" />
                </button>
              );
            })}
            <button
              onClick={handleClearCategories}
              className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 hover:text-neutral-900 underline ml-2"
            >
              Clear All
            </button>
          </div>
        )}

        {/* Main 2-Column Layout: Left Filter Panel + Right Product Grid */}
        <div className="pt-8 flex flex-col lg:flex-row gap-8 lg:gap-12 items-start">
          {/* Left Filter Panel (Desktop) */}
          <aside className="hidden lg:block w-64 xl:w-72 flex-shrink-0">
            <div className="sticky top-28 bg-white border border-neutral-200/80 rounded-xl p-6 space-y-6 shadow-2xs">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
                <div className="flex items-center space-x-2">
                  <SlidersHorizontal className="w-4 h-4 text-neutral-800" />
                  <h2 className="font-mono text-xs tracking-[0.2em] font-semibold uppercase text-neutral-900">
                    FILTERS
                  </h2>
                </div>
                {activeCategorySlugs.length > 0 && (
                  <button
                    onClick={handleClearCategories}
                    className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 hover:text-neutral-950 underline transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>

              {renderCategoryHierarchy()}
            </div>
          </aside>

          {/* Right Product Grid Area */}
          <main className="flex-1 w-full min-w-0">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono text-neutral-500 uppercase tracking-widest">
                Showing {products.length} of {initialTotalCount} Products
              </span>
            </div>

            {products.length === 0 ? (
              <div className="py-24 text-center border border-dashed border-neutral-200 rounded-xl p-8">
                <p className="font-serif text-2xl text-neutral-800 mb-2">No Products Found</p>
                <p className="text-xs font-mono text-neutral-400 uppercase tracking-wider mb-6">
                  No active designs match your current filter selection.
                </p>
                <button
                  type="button"
                  onClick={handleClearCategories}
                  className="px-6 py-2.5 rounded bg-neutral-900 text-white text-xs font-mono tracking-widest uppercase hover:bg-neutral-800 transition-colors"
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              <div className="space-y-12">
                {/* Product Grid */}
                <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                  {products.map((prod) => (
                    <ProductCard key={prod.id} product={prod as any} />
                  ))}
                </div>

                {/* Load More Pagination */}
                {hasMore && (
                  <div className="pt-8 flex flex-col items-center justify-center space-y-3">
                    <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-widest">
                      Showing {products.length} of {initialTotalCount} Products
                    </span>
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="inline-flex items-center space-x-2 px-8 py-3 bg-white border border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-900 font-mono text-xs tracking-widest uppercase transition-all duration-300 shadow-sm disabled:opacity-50"
                      id="btn-load-more-shop"
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Loading...</span>
                        </>
                      ) : (
                        <span>Load More Products</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Mobile Filters Drawer */}
      {mobileFilterOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-neutral-950/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileFilterOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative ml-auto w-full max-w-xs bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <SlidersHorizontal className="w-4 h-4 text-neutral-800" />
                <h3 className="font-mono text-xs tracking-[0.2em] font-semibold uppercase text-neutral-900">
                  FILTERS
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              {renderCategoryHierarchy()}
            </div>

            <div className="p-4 border-t border-neutral-200 flex space-x-3">
              <button
                type="button"
                onClick={handleClearCategories}
                className="flex-1 py-2.5 border border-neutral-300 rounded text-xs font-mono uppercase tracking-wider text-neutral-700 hover:border-neutral-900 transition-colors"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="flex-1 py-2.5 bg-neutral-900 text-white rounded text-xs font-mono uppercase tracking-wider hover:bg-neutral-800 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
