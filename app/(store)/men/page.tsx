import React from 'react';
import { getPlpProducts, getPlpFilterOptions } from '@/lib/catalog/plp-service';
import { PlpContainer } from '@/components/store/plp/PlpContainer';

export const revalidate = 0; // Dynamic server rendering for query params

export default async function MenStorefrontPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const page = searchParams.page ? parseInt(String(searchParams.page), 10) : 1;
  const minPrice = searchParams.minPrice ? parseFloat(String(searchParams.minPrice)) : undefined;
  const maxPrice = searchParams.maxPrice ? parseFloat(String(searchParams.maxPrice)) : undefined;

  const filters = {
    gender: 'MEN' as const,
    categorySlug: typeof searchParams.category === 'string' ? searchParams.category : undefined,
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

  const plpResult = await getPlpProducts(filters);
  const filterOptions = await getPlpFilterOptions('MEN');

  return (
    <PlpContainer
      title="MEN"
      subtitle="Contemporary Indian Fashion & Tailored Apparel for Men"
      initialProducts={plpResult.products}
      initialTotalCount={plpResult.totalCount}
      initialHasMore={plpResult.hasMore}
      initialPage={plpResult.page}
      gender="MEN"
      filterOptions={filterOptions}
    />
  );
}
