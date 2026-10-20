import { prisma } from '@/lib/db/prisma';

export interface StorefrontSearchResult {
  id: string;
  name: string;
  slug: string;
  gender: string;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  primaryImage: {
    url: string;
    altText?: string | null;
  } | null;
  secondaryImage: {
    url: string;
    altText?: string | null;
  } | null;
  minSellingPrice: number;
  maxSellingPrice: number;
  minMrp: number;
  maxMrp: number;
  hasDiscount: boolean;
  maxDiscountPercent: number;
  availableStock: number;
}

/**
 * Centralized server-side product search service for SIFR storefront.
 * Consumed by both Header Search Overlay and full-page /search results page.
 * Strictly searches ACTIVE catalog products using PostgreSQL case-insensitive substring matching.
 */
export async function searchStorefrontProducts(
  query: string,
  limit = 24
): Promise<StorefrontSearchResult[]> {
  const cleanQuery = query.trim();

  // Empty query guard — avoid unnecessary DB load
  if (!cleanQuery) {
    return [];
  }

  const products = await prisma.product.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { name: { contains: cleanQuery, mode: 'insensitive' } },
        { description: { contains: cleanQuery, mode: 'insensitive' } },
        { category: { name: { contains: cleanQuery, mode: 'insensitive' } } },
        { variants: { some: { sku: { contains: cleanQuery, mode: 'insensitive' } } } },
      ],
    },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      images: {
        orderBy: { sortOrder: 'asc' },
        take: 2,
        select: {
          url: true,
          altText: true,
        },
      },
      variants: {
        where: { isAvailable: true },
        select: {
          mrp: true,
          sellingPrice: true,
          inventoryItem: {
            select: { physicalStock: true, reservedStock: true },
          },
        },
      },
    },
    take: limit,
  });

  return products.map((product) => {
    let minSellingPrice = 0;
    let maxSellingPrice = 0;
    let minMrp = 0;
    let maxMrp = 0;
    let hasDiscount = false;
    let maxDiscountPercent = 0;
    let availableStock = 0;

    if (product.variants.length > 0) {
      const sellingPrices = product.variants.map((v) => Number(v.sellingPrice));
      const mrps = product.variants.map((v) => Number(v.mrp));

      minSellingPrice = Math.min(...sellingPrices);
      maxSellingPrice = Math.max(...sellingPrices);
      minMrp = Math.min(...mrps);
      maxMrp = Math.max(...mrps);

      product.variants.forEach((v) => {
        const mrp = Number(v.mrp);
        const sp = Number(v.sellingPrice);
        if (mrp > sp) {
          hasDiscount = true;
          const pct = Math.round(((mrp - sp) / mrp) * 100);
          if (pct > maxDiscountPercent) maxDiscountPercent = pct;
        }

        const physicalStock = v.inventoryItem?.physicalStock ?? 0;
        const reservedStock = v.inventoryItem?.reservedStock ?? 0;
        availableStock += Math.max(0, physicalStock - reservedStock);
      });
    }

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      gender: product.gender,
      category: {
        id: product.category.id,
        name: product.category.name,
        slug: product.category.slug,
      },
      primaryImage: product.images[0] ? { url: product.images[0].url, altText: product.images[0].altText } : null,
      secondaryImage: product.images[1] ? { url: product.images[1].url, altText: product.images[1].altText } : null,
      minSellingPrice,
      maxSellingPrice,
      minMrp,
      maxMrp,
      hasDiscount,
      maxDiscountPercent,
      availableStock,
    };
  });
}
