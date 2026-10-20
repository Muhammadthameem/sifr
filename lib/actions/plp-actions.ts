'use server';

import { getPlpProducts, PlpFilterInput } from '@/lib/catalog/plp-service';

/**
 * Server action to fetch next page batch of PLP products for "Load More" button.
 */
export async function loadMoreProductsAction(filters: PlpFilterInput) {
  try {
    const result = await getPlpProducts({
      ...filters,
      mode: 'append', // Fetch only the single page batch for appending
    });

    return {
      success: true,
      products: result.products,
      hasMore: result.hasMore,
      page: result.page,
      totalCount: result.totalCount,
    };
  } catch (error: any) {
    return {
      success: false,
      products: [],
      hasMore: false,
      error: error.message || 'Failed to load more products',
    };
  }
}
