'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ProductCard } from '@/components/store/ProductCard';
import { PlpHeader } from './PlpHeader';
import { CategoryTabs } from './CategoryTabs';
import { PlpFilterBar } from './PlpFilterBar';
import { PlpFilterDrawer } from './PlpFilterDrawer';
import { PlpEmptyState } from './PlpEmptyState';
import { loadMoreProductsAction } from '@/lib/actions/plp-actions';
import { PlpProduct, PlpFilterOptions } from '@/lib/catalog/plp-service';
import { Loader2 } from 'lucide-react';

interface PlpContainerProps {
  title: string;
  subtitle?: string;
  initialProducts: PlpProduct[];
  initialTotalCount: number;
  initialHasMore: boolean;
  initialPage: number;
  gender?: 'MEN' | 'WOMEN';
  filterOptions: PlpFilterOptions;
  baseCategorySlug?: string;
}

export function PlpContainer({
  title,
  subtitle,
  initialProducts,
  initialTotalCount,
  initialHasMore,
  initialPage,
  gender,
  filterOptions,
  baseCategorySlug,
}: PlpContainerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Local state for products (supports appending on Load More)
  const [products, setProducts] = useState<PlpProduct[]>(initialProducts);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState<boolean>(false);

  // Sync state when initialProps change (e.g., when URL params change via navigation/refresh)
  useEffect(() => {
    setProducts(initialProducts);
    setHasMore(initialHasMore);
    setCurrentPage(initialPage);
  }, [initialProducts, initialHasMore, initialPage]);

  // Extract current URL filter params
  const rawCategoryParam = searchParams.get('category');
  const activeChildCategory =
    rawCategoryParam && rawCategoryParam.toLowerCase() !== 'all'
      ? rawCategoryParam
      : undefined;

  const currentFilters = {
    gender,
    categorySlug: activeChildCategory || baseCategorySlug,
    categorySlugs: activeChildCategory
      ? activeChildCategory.split(',').map((s) => s.trim()).filter(Boolean)
      : (baseCategorySlug ? [baseCategorySlug] : undefined),
    size: searchParams.get('size') || undefined,
    color: searchParams.get('color') || undefined,
    minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
    maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
    availability: searchParams.get('availability') || undefined,
    sort: (searchParams.get('sort') as any) || 'recommended',
  };

  // Count active filters for badge
  const activeFilterCount = [
    activeChildCategory,
    currentFilters.size,
    gender ? undefined : currentFilters.color,
    currentFilters.minPrice,
    currentFilters.maxPrice,
    currentFilters.availability,
  ].filter(Boolean).length;

  const handleApplyFilters = (newFilters: {
    categorySlug?: string;
    size?: string;
    color?: string;
    minPrice?: number;
    maxPrice?: number;
    availability?: string;
  }) => {
    const params = new URLSearchParams();

    // Preserve existing sort
    if (currentFilters.sort && currentFilters.sort !== 'recommended') {
      params.set('sort', currentFilters.sort);
    }

    if (newFilters.categorySlug) params.set('category', newFilters.categorySlug);
    if (newFilters.size) params.set('size', newFilters.size);
    if (newFilters.color) params.set('color', newFilters.color);
    if (newFilters.minPrice) params.set('minPrice', newFilters.minPrice.toString());
    if (newFilters.maxPrice) params.set('maxPrice', newFilters.maxPrice.toString());
    if (newFilters.availability) params.set('availability', newFilters.availability);

    // Reset to page 1 on filter change
    params.delete('page');

    const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    router.push(newUrl);
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    const nextPage = currentPage + 1;

    const res = await loadMoreProductsAction({
      ...currentFilters,
      page: nextPage,
      pageSize: 24,
    });

    if (res.success && res.products) {
      setProducts((prev) => [...prev, ...res.products]);
      setHasMore(res.hasMore);
      setCurrentPage(nextPage);

      // Update URL with page=nextPage without triggering full server re-render
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', nextPage.toString());
      const newUrl = `${pathname}?${params.toString()}`;
      window.history.replaceState(null, '', newUrl);
    }

    setLoadingMore(false);
  };

  return (
    <div className="w-full bg-white text-neutral-900 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Page Title & Count Header */}
        <PlpHeader
          title={title}
          subtitle={subtitle}
          totalCount={initialTotalCount}
        />

        {/* Dynamic Category Tabs */}
        <CategoryTabs
          categories={filterOptions.categories}
          activeCategorySlug={activeChildCategory || 'all'}
        />

        {/* Filter Bar & Sort Controls */}
        <PlpFilterBar
          onOpenFilterDrawer={() => setFilterDrawerOpen(true)}
          activeFilterCount={activeFilterCount}
        />

        {/* Product Grid Area */}
        {products.length === 0 ? (
          <PlpEmptyState onResetFilters={() => router.push(pathname)} />
        ) : (
          <div className="pt-8 space-y-12">
            
            {/* 4-Column Desktop / 3-Column Tablet / 2-Column Mobile Product Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {products.map((prod) => (
                <ProductCard key={prod.id} product={prod as any} />
              ))}
            </div>

            {/* Load More Pagination Button */}
            {hasMore && (
              <div className="pt-8 flex flex-col items-center justify-center space-y-3">
                <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-widest">
                  Showing {products.length} of {initialTotalCount} Products
                </span>

                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center space-x-2 px-8 py-3 bg-white border border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-900 font-mono text-xs tracking-widest uppercase transition-all duration-300 shadow-sm disabled:opacity-50"
                  id="btn-load-more"
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

      </div>

      {/* Filter Drawer Component */}
      <PlpFilterDrawer
        isOpen={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        options={filterOptions}
        currentFilters={currentFilters}
        onApplyFilters={handleApplyFilters}
        hideColorFilter={Boolean(gender)}
      />
    </div>
  );
}
