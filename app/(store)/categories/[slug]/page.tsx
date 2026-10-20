import React from 'react';
import { prisma } from '@/lib/db/prisma';
import { notFound } from 'next/navigation';
import { getPlpProducts, getPlpFilterOptions } from '@/lib/catalog/plp-service';
import { PlpContainer } from '@/components/store/plp/PlpContainer';

export const revalidate = 0; // Dynamic server rendering for query params

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

export default async function CategoryStorefrontPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const category = await prisma.category.findUnique({
    where: { slug: params.slug },
    include: {
      children: {
        where: { isActive: true },
        select: { id: true, name: true, slug: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      },
    },
  });

  if (!category || !category.isActive) {
    notFound();
  }

  const page = searchParams.page ? parseInt(String(searchParams.page), 10) : 1;
  const minPrice = searchParams.minPrice ? parseFloat(String(searchParams.minPrice)) : undefined;
  const maxPrice = searchParams.maxPrice ? parseFloat(String(searchParams.maxPrice)) : undefined;

  // Resolve child category filter within current parent collection
  const requestedSlugs = parseCategoryParam(searchParams.category).filter(
    (s) => s.toLowerCase() !== 'all'
  );

  let targetCategorySlugs: string[] | undefined;
  let targetCategorySlug: string | undefined;

  if (requestedSlugs.length > 0) {
    const validChildSlugs = new Set(category.children.map((c) => c.slug));
    validChildSlugs.add(category.slug);

    const matchingSlugs = requestedSlugs.filter((s) => validChildSlugs.has(s));

    if (matchingSlugs.length === 0) {
      // Requested category is outside this collection — never show products outside this parent
      targetCategorySlugs = ['__unmatched_category_in_collection__'];
    } else {
      targetCategorySlugs = matchingSlugs;
    }
  } else {
    // No child filter requested: show all active products belonging to this parent collection and its descendants
    targetCategorySlug = category.slug;
  }

  const filters = {
    categorySlug: targetCategorySlug,
    categorySlugs: targetCategorySlugs,
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

  const [plpResult, baseFilterOptions] = await Promise.all([
    getPlpProducts(filters),
    getPlpFilterOptions(),
  ]);

  // For category collections with active children, scope CategoryTabs to this collection's children
  const filterOptions = {
    ...baseFilterOptions,
    categories:
      category.children.length > 0 ? category.children : baseFilterOptions.categories,
  };

  return (
    <PlpContainer
      title={category.name.toUpperCase()}
      subtitle={category.description || `Curated ${category.name} collection`}
      initialProducts={plpResult.products}
      initialTotalCount={plpResult.totalCount}
      initialHasMore={plpResult.hasMore}
      initialPage={plpResult.page}
      filterOptions={filterOptions}
      baseCategorySlug={category.slug}
    />
  );
}
