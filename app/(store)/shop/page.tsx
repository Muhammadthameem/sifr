import React from 'react';
import { Metadata } from 'next';
import { getPlpProducts, getPlpFilterOptions } from '@/lib/catalog/plp-service';
import { getActiveCategoryTree } from '@/lib/actions/category-actions';
import { ShopContainer } from '@/components/store/shop/ShopContainer';

export const revalidate = 0; // Dynamic server rendering for query params

export const metadata: Metadata = {
  title: 'All Products | SIFR',
  description: 'Explore the complete SIFR collection of contemporary minimalist luxury fashion and accessories.',
};

function parseCategoryParam(param: string | string[] | undefined): string[] {
  if (!param) return [];
  if (Array.isArray(param)) {
    return param.flatMap((p) => p.split(',').map((s) => s.trim())).filter(Boolean);
  }
  return param
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const page = searchParams.page ? parseInt(String(searchParams.page), 10) : 1;
  const categorySlugs = parseCategoryParam(searchParams.category);
  const minPrice = searchParams.minPrice ? parseFloat(String(searchParams.minPrice)) : undefined;
  const maxPrice = searchParams.maxPrice ? parseFloat(String(searchParams.maxPrice)) : undefined;

  const filters = {
    categorySlugs: categorySlugs.length > 0 ? categorySlugs : undefined,
    size: typeof searchParams.size === 'string' ? searchParams.size : undefined,
    color: typeof searchParams.color === 'string' ? searchParams.color : undefined,
    minPrice: !minPrice || isNaN(minPrice) ? undefined : minPrice,
    maxPrice: !maxPrice || isNaN(maxPrice) ? undefined : maxPrice,
    availability: typeof searchParams.availability === 'string' ? searchParams.availability : undefined,
    sort: typeof searchParams.sort === 'string' ? (searchParams.sort as any) : undefined,
    page: isNaN(page) ? 1 : page,
    pageSize: 24,
    mode: 'initial-render' as const,
  };

  const [plpResult, filterOptions, categoryTree] = await Promise.all([
    getPlpProducts(filters),
    getPlpFilterOptions(),
    getActiveCategoryTree(),
  ]);

  return (
    <ShopContainer
      initialProducts={plpResult.products}
      initialTotalCount={plpResult.totalCount}
      initialHasMore={plpResult.hasMore}
      initialPage={plpResult.page}
      filterOptions={filterOptions}
      categoryTree={categoryTree}
    />
  );
}
