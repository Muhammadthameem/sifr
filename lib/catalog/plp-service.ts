import { prisma } from '@/lib/db/prisma';
import { ActiveCategoryNode, getActiveCategoryTree } from '@/lib/actions/category-actions';

export interface PlpFilterInput {
  gender?: 'MEN' | 'WOMEN';
  categorySlug?: string;
  categorySlugs?: string[];
  size?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  availability?: string;
  sort?: 'recommended' | 'newest' | 'price-asc' | 'price-desc' | string;
  page?: number;
  pageSize?: number;
  mode?: 'initial-render' | 'append';
}

export interface PlpProduct {
  id: string;
  name: string;
  slug: string;
  gender: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  images: {
    url: string;
    altText: string | null;
  }[];
  variants: {
    id: string;
    mrp: any;
    sellingPrice: any;
    isAvailable: boolean;
    availableStock?: number;
  }[];
  availableStock?: number;
  sourceButtons?: {
    label: string;
    targetProduct: {
      id: string;
      name: string;
      slug: string;
    };
  }[];
}

export interface PlpResult {
  products: PlpProduct[];
  totalCount: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PlpFilterOptions {
  categories: { id: string; name: string; slug: string; count?: number }[];
  categoryTree?: ActiveCategoryNode[];
  sizes: string[];
  colors: string[];
  minPriceBound: number;
  maxPriceBound: number;
}

/**
 * Builds Prisma `where` clause for PLP queries based on user filters.
 */
async function buildPlpWhereClause(input: PlpFilterInput) {
  const where: any = {
    status: 'ACTIVE',
  };

  // Gender Filter
  if (input.gender === 'MEN') {
    where.gender = { in: ['MEN', 'BOTH'] };
  } else if (input.gender === 'WOMEN') {
    where.gender = { in: ['WOMEN', 'BOTH'] };
  }

  // Category Filter (supports single categorySlug or multiple categorySlugs)
  const requestedCategorySlugs: string[] = [];
  if (input.categorySlugs && Array.isArray(input.categorySlugs)) {
    for (const slug of input.categorySlugs) {
      if (typeof slug === 'string' && slug.trim().toLowerCase() !== 'all') {
        const clean = slug.trim();
        if (!requestedCategorySlugs.includes(clean)) {
          requestedCategorySlugs.push(clean);
        }
      }
    }
  }
  if (input.categorySlug && input.categorySlug.trim().toLowerCase() !== 'all') {
    const clean = input.categorySlug.trim();
    if (!requestedCategorySlugs.includes(clean)) {
      requestedCategorySlugs.push(clean);
    }
  }

  if (requestedCategorySlugs.length > 0) {
    const matchedCategories = await prisma.category.findMany({
      where: {
        slug: { in: requestedCategorySlugs },
        isActive: true,
      },
      select: {
        id: true,
        children: {
          where: { isActive: true },
          select: { id: true },
        },
      },
    });

    if (matchedCategories.length === 0) {
      // Non-existent or inactive categories requested
      return null;
    }

    const categoryIdSet = new Set<string>();
    for (const cat of matchedCategories) {
      categoryIdSet.add(cat.id);
      for (const child of cat.children) {
        categoryIdSet.add(child.id);
      }
    }

    where.categoryId = { in: Array.from(categoryIdSet) };
  }

  const andConditions: any[] = [];

  // Price Range Filter
  if (input.minPrice !== undefined || input.maxPrice !== undefined) {
    const priceConditions: any = {};
    if (input.minPrice !== undefined && input.minPrice > 0) {
      priceConditions.gte = input.minPrice;
    }
    if (input.maxPrice !== undefined && input.maxPrice > 0) {
      priceConditions.lte = input.maxPrice;
    }

    andConditions.push({
      variants: {
        some: {
          isAvailable: true,
          sellingPrice: priceConditions,
        },
      },
    });
  }

  // Availability & Size Filters
  const hasSizeFilter = Boolean(input.size && input.size.trim() !== '');
  const cleanSize = hasSizeFilter ? input.size!.trim() : '';
  const isInStockFilter = input.availability === 'in-stock';

  if (isInStockFilter) {
    if (hasSizeFilter) {
      // Must have at least one variant matching size that has Available Stock > 0 (physicalStock > reservedStock)
      andConditions.push({
        variants: {
          some: {
            isAvailable: true,
            title: { contains: cleanSize, mode: 'insensitive' },
            inventoryItem: {
              physicalStock: {
                gt: (prisma as any).inventoryItem.fields.reservedStock,
              },
            },
          },
        },
      });
    } else {
      // Must have at least one variant that has Available Stock > 0 (physicalStock > reservedStock)
      andConditions.push({
        variants: {
          some: {
            isAvailable: true,
            inventoryItem: {
              physicalStock: {
                gt: (prisma as any).inventoryItem.fields.reservedStock,
              },
            },
          },
        },
      });
    }
  } else if (hasSizeFilter) {
    // Only size filter, no in-stock restriction
    andConditions.push({
      OR: [
        { options: { some: { values: { some: { value: { equals: cleanSize, mode: 'insensitive' } } } } } },
        { variants: { some: { title: { contains: cleanSize, mode: 'insensitive' } } } },
      ],
    });
  }

  // Color Filter (for other contexts such as /shop if provided)
  if (input.color && input.color.trim() !== '') {
    const cleanColor = input.color.trim();
    andConditions.push({
      OR: [
        { options: { some: { values: { some: { value: { equals: cleanColor, mode: 'insensitive' } } } } } },
        { sourceButtons: { some: { label: { equals: cleanColor, mode: 'insensitive' } } } },
        { variants: { some: { title: { contains: cleanColor, mode: 'insensitive' } } } },
        { name: { contains: cleanColor, mode: 'insensitive' } },
      ],
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

/**
 * Server-side PLP query service for catalog product listing.
 * Supports gender, dynamic categories, size, color, price range, availability, sorting, and pagination.
 */
export async function getPlpProducts(input: PlpFilterInput): Promise<PlpResult> {
  const page = Math.max(1, input.page || 1);
  const pageSize = Math.max(1, input.pageSize || 24);
  const mode = input.mode || 'initial-render';

  const where = await buildPlpWhereClause(input);

  if (where === null) {
    return {
      products: [],
      totalCount: 0,
      hasMore: false,
      page,
      pageSize,
      totalPages: 0,
    };
  }

  const totalCount = await prisma.product.count({ where });
  const totalPages = Math.ceil(totalCount / pageSize);

  // Sorting setup
  let orderBy: any = { updatedAt: 'desc' };
  if (input.sort === 'newest') {
    orderBy = { createdAt: 'desc' };
  } else if (input.sort === 'recommended') {
    orderBy = { updatedAt: 'desc' };
  }

  // Database-level price sorting via groupBy on ProductVariant minimum sellingPrice
  const isPriceSort = input.sort === 'price-asc' || input.sort === 'price-desc';
  let pageProductIds: string[] = [];

  if (isPriceSort) {
    const sortOrder = input.sort === 'price-asc' ? 'asc' : 'desc';
    const skip = mode === 'initial-render' ? 0 : (page - 1) * pageSize;
    const take = mode === 'initial-render' ? page * pageSize : pageSize;

    const groupedVariants = await prisma.productVariant.groupBy({
      by: ['productId'],
      where: {
        isAvailable: true,
        product: where,
      },
      _min: {
        sellingPrice: true,
      },
      orderBy: {
        _min: {
          sellingPrice: sortOrder,
        },
      },
      skip,
      take,
    });

    pageProductIds = groupedVariants.map((g) => g.productId);
  }

  let rawProducts = await prisma.product.findMany({
    where: isPriceSort ? { id: { in: pageProductIds } } : where,
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { orderBy: { sortOrder: 'asc' } },
      variants: {
        where: { isAvailable: true },
        select: {
          id: true,
          mrp: true,
          sellingPrice: true,
          isAvailable: true,
          inventoryItem: {
            select: { physicalStock: true, reservedStock: true },
          },
        },
      },
      sourceButtons: {
        where: { isActive: true, targetProduct: { status: 'ACTIVE' } },
        include: { targetProduct: { select: { id: true, name: true, slug: true } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: isPriceSort ? undefined : orderBy,
    ...(isPriceSort
      ? {}
      : mode === 'initial-render'
      ? { take: page * pageSize }
      : { skip: (page - 1) * pageSize, take: pageSize }),
  });

  // Preserve DB-sorted order when using price-sort
  let orderedRawProducts = rawProducts;
  if (isPriceSort) {
    const productMap = new Map(rawProducts.map((p) => [p.id, p]));
    orderedRawProducts = pageProductIds
      .map((id) => productMap.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
  }

  // Calculate price boundaries & format product
  const formattedProducts = orderedRawProducts.map((p) => {
    const variants = p.variants.map((v) => {
      const physicalStock = v.inventoryItem?.physicalStock ?? 0;
      const reservedStock = v.inventoryItem?.reservedStock ?? 0;
      const availableStock = Math.max(0, physicalStock - reservedStock);
      return {
        id: v.id,
        mrp: Number(v.mrp),
        sellingPrice: Number(v.sellingPrice),
        isAvailable: v.isAvailable,
        availableStock,
      };
    });
    const productAvailableStock = variants.reduce((sum, v) => sum + v.availableStock, 0);

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      gender: p.gender,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      category: p.category,
      images: p.images.map((img) => ({ url: img.url, altText: img.altText })),
      variants,
      availableStock: productAvailableStock,
      sourceButtons: p.sourceButtons.map((btn) => ({
        label: btn.label,
        targetProduct: btn.targetProduct,
      })),
    };
  });

  const hasMore = page * pageSize < totalCount;

  return {
    products: formattedProducts,
    totalCount,
    hasMore,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Returns available filter options (categories, sizes, colors, price boundaries) for PLP filter UI.
 */
export async function getPlpFilterOptions(gender?: 'MEN' | 'WOMEN'): Promise<PlpFilterOptions> {
  const where: any = { status: 'ACTIVE' };
  if (gender === 'MEN') {
    where.gender = { in: ['MEN', 'BOTH'] };
  } else if (gender === 'WOMEN') {
    where.gender = { in: ['WOMEN', 'BOTH'] };
  }

  const categoryTree = await getActiveCategoryTree(gender);

  // Derive categories strictly from the gender-scoped category tree to guarantee consistency
  const categories = categoryTree.flatMap((parent) => [
    { id: parent.id, name: parent.name, slug: parent.slug },
    ...parent.children.map((child) => ({
      id: child.id,
      name: child.name,
      slug: child.slug,
    })),
  ]);

  // Size & Color options from database ProductOptionValues
  const optionValues = await prisma.productOptionValue.findMany({
    where: {
      option: {
        product: where,
      },
    },
    select: {
      value: true,
      option: { select: { name: true } },
    },
  });

  const sizeSet = new Set<string>();
  const colorSet = new Set<string>();

  optionValues.forEach((ov) => {
    const optName = ov.option.name.toLowerCase();
    if (optName.includes('size') || optName.includes('fit')) {
      sizeSet.add(ov.value);
    } else if (!gender && (optName.includes('color') || optName.includes('colour') || optName.includes('shade'))) {
      colorSet.add(ov.value);
    }
  });

  // Only collect ProductButton labels as color options for non-gender storefront pages
  if (!gender) {
    const productButtons = await prisma.productButton.findMany({
      where: {
        isActive: true,
        sourceProduct: where,
      },
      select: { label: true },
    });
    productButtons.forEach((pb) => colorSet.add(pb.label));
  }

  // Defaults if DB is empty
  if (sizeSet.size === 0) {
    ['XS', 'S', 'M', 'L', 'XL', 'XXL'].forEach((s) => sizeSet.add(s));
  }
  if (!gender && colorSet.size === 0) {
    ['Black', 'White', 'Beige', 'Navy', 'Grey', 'Olive'].forEach((c) => colorSet.add(c));
  }

  // Price boundaries via database aggregate query
  const priceAggregate = await prisma.productVariant.aggregate({
    where: {
      isAvailable: true,
      product: where,
    },
    _min: { sellingPrice: true },
    _max: { sellingPrice: true },
  });

  let minPriceBound = 0;
  let maxPriceBound = 10000;

  if (priceAggregate._min.sellingPrice !== null && priceAggregate._max.sellingPrice !== null) {
    minPriceBound = Math.floor(Number(priceAggregate._min.sellingPrice));
    maxPriceBound = Math.ceil(Number(priceAggregate._max.sellingPrice));
  }

  return {
    categories,
    categoryTree,
    sizes: Array.from(sizeSet),
    colors: Array.from(colorSet),
    minPriceBound,
    maxPriceBound,
  };
}
