'use server';

import { prisma } from '@/lib/db/prisma';
import { createProductSchema, updateProductSchema, CreateProductInput, UpdateProductInput } from '@/lib/validation/product';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { revalidatePath } from 'next/cache';
import { normalizeSkuPart } from '@/lib/utils/sku';
import crypto from 'crypto';

export interface GeneratedVariant {
  title: string;
  sku: string;
  costPrice?: number | null;
  mrp: number;
  sellingPrice: number;
  isAvailable: boolean;
}

export interface PricingWarning {
  variantTitle: string;
  warningMessage: string;
}

/**
 * Generates Cartesian product combinations for dynamic product options
 * incorporating Product identity and collision-safe unique SKUs.
 */
export async function generateVariantCombinations(
  options: { name: string; values: string[] }[],
  productRef: string = 'PRODUCT',
  defaultMrp = 1999,
  defaultSellingPrice = 1999,
  excludeVariantIds: string[] = []
): Promise<GeneratedVariant[]> {
  const activeOptions = options.filter(
    (o) => o.name.trim() !== '' && o.values.some((v) => v.trim() !== '')
  );

  const basePrefix = normalizeSkuPart(productRef) || 'PRODUCT';

  // Query existing SKUs in DB to prevent collisions
  const existingVariantsInDb = await prisma.productVariant.findMany({
    where: excludeVariantIds.length > 0 ? { id: { notIn: excludeVariantIds } } : undefined,
    select: { sku: true },
  });
  const takenSkus = new Set<string>(existingVariantsInDb.map((v) => v.sku.toUpperCase()));

  const resolveUniqueSku = (candidateBase: string): string => {
    let candidate = candidateBase;
    let counter = 2;
    while (takenSkus.has(candidate)) {
      candidate = `${candidateBase}-${counter}`;
      counter++;
    }
    takenSkus.add(candidate);
    return candidate;
  };

  if (activeOptions.length === 0) {
    const candidateBase = `${basePrefix}-DEFAULT`;
    const finalSku = resolveUniqueSku(candidateBase);
    return [
      {
        title: 'Default Variant',
        sku: finalSku,
        costPrice: null,
        mrp: defaultMrp,
        sellingPrice: defaultSellingPrice,
        isAvailable: true,
      },
    ];
  }

  // Cartesian Product Helper
  const cartesian = (args: string[][]): string[][] => {
    const r: string[][] = [];
    const max = args.length - 1;
    function helper(arr: string[], i: number) {
      for (let j = 0, l = args[i].length; j < l; j++) {
        const a = [...arr, args[i][j]];
        if (i === max) r.push(a);
        else helper(a, i + 1);
      }
    }
    helper([], 0);
    return r;
  };

  const optionValuesArray = activeOptions.map((o) => o.values.filter((v) => v.trim() !== ''));
  const rawCombinations = cartesian(optionValuesArray);

  return rawCombinations.map((combo) => {
    const title = combo.join(' / ');
    const comboSuffix = combo.map(normalizeSkuPart).filter(Boolean).join('-');
    const candidateBase = comboSuffix ? `${basePrefix}-${comboSuffix}` : basePrefix;
    const finalSku = resolveUniqueSku(candidateBase);

    return {
      title,
      sku: finalSku,
      costPrice: null,
      mrp: defaultMrp,
      sellingPrice: defaultSellingPrice,
      isAvailable: true,
    };
  });
}

/**
 * Validates Product Button rules (self-linking, duplicate links, archived target).
 */
async function validateProductButtons(
  sourceProductId: string | null,
  buttons: { targetProductId: string; label: string }[]
) {
  const targetIdsSeen = new Set<string>();

  for (const button of buttons) {
    // 1. Self-linking check
    if (sourceProductId && button.targetProductId === sourceProductId) {
      throw new Error(`Product Button Error: A product cannot link to itself.`);
    }

    // 2. Duplicate target link check
    if (targetIdsSeen.has(button.targetProductId)) {
      throw new Error(`Product Button Error: Duplicate active button to the same target product is not allowed.`);
    }
    targetIdsSeen.add(button.targetProductId);

    // 3. Target product existence & status check
    const targetProduct = await prisma.product.findUnique({
      where: { id: button.targetProductId },
      select: { id: true, status: true, name: true },
    });

    if (!targetProduct) {
      throw new Error(`Product Button Error: Target product does not exist.`);
    }

    if (targetProduct.status === 'ARCHIVED') {
      throw new Error(
        `Product Button Error: Cannot link to archived product '${targetProduct.name}'.`
      );
    }
  }
}

/**
 * Validates pricing rules and returns non-blocking warnings.
 */
function checkPricingWarnings(variants: { title: string; costPrice?: number | null; mrp: number; sellingPrice: number }[]): PricingWarning[] {
  const warnings: PricingWarning[] = [];

  for (const v of variants) {
    if (v.sellingPrice > v.mrp) {
      throw new Error(`Pricing Error on variant '${v.title}': Selling Price (${v.sellingPrice}) cannot be greater than MRP (${v.mrp}).`);
    }

    if (v.costPrice !== undefined && v.costPrice !== null) {
      if (v.sellingPrice < v.costPrice) {
        warnings.push({
          variantTitle: v.title,
          warningMessage: `Selling Price (₹${v.sellingPrice}) is less than Cost Price (₹${v.costPrice}).`,
        });
      } else if (v.sellingPrice === v.costPrice) {
        warnings.push({
          variantTitle: v.title,
          warningMessage: `Selling Price is equal to Cost Price (₹${v.sellingPrice}). Zero profit margin.`,
        });
      }

      if (v.costPrice > v.mrp) {
        warnings.push({
          variantTitle: v.title,
          warningMessage: `Cost Price (₹${v.costPrice}) exceeds MRP (₹${v.mrp}).`,
        });
      }
    }
  }

  return warnings;
}

/**
 * Validates that a category assigned to a product exists, is active, and is a leaf category (no child categories).
 */
async function validateProductCategoryAssignment(categoryId: string) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: {
      _count: {
        select: { children: true },
      },
    },
  });

  if (!category) {
    throw new Error('Selected category does not exist.');
  }

  if (!category.isActive) {
    throw new Error(`Category '${category.name}' is inactive and cannot be assigned to products.`);
  }

  if (category._count.children > 0) {
    throw new Error(
      `Products must be assigned to a subcategory. '${category.name}' is a parent category and cannot be assigned directly to a product.`
    );
  }
}

/**
 * Create a new Product with options, variants, images, and buttons in a transaction.
 */
export async function createProduct(input: CreateProductInput) {
  await requireAdminAuth();

  const validated = createProductSchema.parse(input);

  // Validate category assignment (leaf only & active)
  await validateProductCategoryAssignment(validated.categoryId);

  // Check unique slug
  const existingSlug = await prisma.product.findUnique({
    where: { slug: validated.slug },
  });
  if (existingSlug) {
    throw new Error(`Product slug '${validated.slug}' is already in use.`);
  }

  // Check unique SKUs within variants and against DB
  const skusInInput = validated.variants.map((v) => v.sku.trim().toUpperCase());
  if (new Set(skusInInput).size !== skusInInput.length) {
    throw new Error('Duplicate SKUs found within variant list.');
  }

  const existingSkusInDb = await prisma.productVariant.findMany({
    where: { sku: { in: skusInInput } },
    select: { sku: true },
  });
  if (existingSkusInDb.length > 0) {
    throw new Error(`SKU '${existingSkusInDb[0].sku}' is already taken by another product variant.`);
  }

  // Check pricing rules & warnings
  const warnings = checkPricingWarnings(validated.variants);

  // Check Product Button relationships
  await validateProductButtons(null, validated.buttons);

  // Execute database insertion inside transaction
  const product = await prisma.$transaction(async (tx) => {
    const createdProduct = await tx.product.create({
      data: {
        name: validated.name,
        slug: validated.slug,
        description: validated.description,
        gender: validated.gender,
        categoryId: validated.categoryId,
        status: validated.status,
        shippingCharge: validated.shippingCharge,
      },
    });

    // Create Options & Option Values
    for (let i = 0; i < validated.options.length; i++) {
      const opt = validated.options[i];
      const createdOpt = await tx.productOption.create({
        data: {
          productId: createdProduct.id,
          name: opt.name,
          position: i,
        },
      });

      for (let j = 0; j < opt.values.length; j++) {
        await tx.productOptionValue.create({
          data: {
            optionId: createdOpt.id,
            value: opt.values[j],
            position: j,
          },
        });
      }
    }

    // Create Variants
    for (const v of validated.variants) {
      await tx.productVariant.create({
        data: {
          productId: createdProduct.id,
          title: v.title,
          sku: v.sku.trim().toUpperCase(),
          costPrice: v.costPrice ?? null,
          mrp: v.mrp,
          sellingPrice: v.sellingPrice,
          isAvailable: v.isAvailable,
        },
      });
    }

    // Create Product Images
    for (let i = 0; i < validated.images.length; i++) {
      const img = validated.images[i];
      await tx.productImage.create({
        data: {
          productId: createdProduct.id,
          url: img.url,
          storageKey: img.storageKey,
          altText: img.altText,
          sortOrder: i,
        },
      });
    }

    // Create Product Buttons
    for (let i = 0; i < validated.buttons.length; i++) {
      const btn = validated.buttons[i];
      await tx.productButton.create({
        data: {
          sourceProductId: createdProduct.id,
          targetProductId: btn.targetProductId,
          label: btn.label,
          sortOrder: i,
          isActive: btn.isActive,
        },
      });
    }

    return createdProduct;
  });

  revalidatePath('/admin/products');
  revalidatePath('/men');
  revalidatePath('/women');
  return { product, warnings };
}

/**
 * Update existing Product preserving permanent IDs and SKUs.
 */
export async function updateProduct(input: UpdateProductInput) {
  await requireAdminAuth();

  const validated = updateProductSchema.parse(input);

  // Validate category assignment (leaf only & active)
  await validateProductCategoryAssignment(validated.categoryId);

  const existing = await prisma.product.findUnique({
    where: { id: validated.id },
  });
  if (!existing) {
    throw new Error('Product not found.');
  }

  // Check unique slug if changed
  if (validated.slug !== existing.slug) {
    const slugConflict = await prisma.product.findUnique({
      where: { slug: validated.slug },
    });
    if (slugConflict) {
      throw new Error(`Product slug '${validated.slug}' is already taken.`);
    }
  }

  // Check unique SKUs
  const skusInInput = validated.variants.map((v) => v.sku.trim().toUpperCase());
  if (new Set(skusInInput).size !== skusInInput.length) {
    throw new Error('Duplicate SKUs found within variant list.');
  }

  const existingOtherSkus = await prisma.productVariant.findMany({
    where: {
      sku: { in: skusInInput },
      productId: { not: validated.id },
    },
    select: { sku: true },
  });
  if (existingOtherSkus.length > 0) {
    throw new Error(`SKU '${existingOtherSkus[0].sku}' is already taken by another product.`);
  }

  // Check pricing rules & warnings
  const warnings = checkPricingWarnings(validated.variants);

  // Check Product Buttons
  await validateProductButtons(validated.id, validated.buttons);

  // Update in Transaction
  const updatedProduct = await prisma.$transaction(async (tx) => {
    // 1. Update basic fields
    const p = await tx.product.update({
      where: { id: validated.id },
      data: {
        name: validated.name,
        slug: validated.slug,
        description: validated.description,
        gender: validated.gender,
        categoryId: validated.categoryId,
        status: validated.status,
        shippingCharge: validated.shippingCharge,
      },
    });

    // 2. Replace Options & Option Values
    await tx.productOption.deleteMany({ where: { productId: validated.id } });
    for (let i = 0; i < validated.options.length; i++) {
      const opt = validated.options[i];
      const createdOpt = await tx.productOption.create({
        data: {
          productId: validated.id,
          name: opt.name,
          position: i,
        },
      });
      for (let j = 0; j < opt.values.length; j++) {
        await tx.productOptionValue.create({
          data: {
            optionId: createdOpt.id,
            value: opt.values[j],
            position: j,
          },
        });
      }
    }

    // 3. Upsert Variants (preserve existing variant IDs when provided)
    const currentVariantIds = validated.variants.filter((v) => v.id).map((v) => v.id as string);
    await tx.productVariant.deleteMany({
      where: {
        productId: validated.id,
        id: { notIn: currentVariantIds },
      },
    });

    for (const v of validated.variants) {
      if (v.id) {
        await tx.productVariant.update({
          where: { id: v.id },
          data: {
            title: v.title,
            sku: v.sku.trim().toUpperCase(),
            costPrice: v.costPrice ?? null,
            mrp: v.mrp,
            sellingPrice: v.sellingPrice,
            isAvailable: v.isAvailable,
          },
        });
      } else {
        await tx.productVariant.create({
          data: {
            productId: validated.id,
            title: v.title,
            sku: v.sku.trim().toUpperCase(),
            costPrice: v.costPrice ?? null,
            mrp: v.mrp,
            sellingPrice: v.sellingPrice,
            isAvailable: v.isAvailable,
          },
        });
      }
    }

    // 4. Replace Product Images
    await tx.productImage.deleteMany({ where: { productId: validated.id } });
    for (let i = 0; i < validated.images.length; i++) {
      const img = validated.images[i];
      await tx.productImage.create({
        data: {
          productId: validated.id,
          url: img.url,
          storageKey: img.storageKey,
          altText: img.altText,
          sortOrder: i,
        },
      });
    }

    // 5. Replace Product Buttons
    await tx.productButton.deleteMany({ where: { sourceProductId: validated.id } });
    for (let i = 0; i < validated.buttons.length; i++) {
      const btn = validated.buttons[i];
      await tx.productButton.create({
        data: {
          sourceProductId: validated.id,
          targetProductId: btn.targetProductId,
          label: btn.label,
          sortOrder: i,
          isActive: btn.isActive,
        },
      });
    }

    return p;
  });

  revalidatePath('/admin/products');
  revalidatePath(`/products/${validated.slug}`);
  return { product: updatedProduct, warnings };
}

/**
 * Duplicate a product creating new Product ID, new Variant IDs, new SKUs.
 * Does NOT copy inventory/history or Product Buttons.
 */
export async function duplicateProduct(productId: string) {
  await requireAdminAuth();

  const sourceProduct = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      options: { include: { values: true } },
      variants: true,
      images: true,
    },
  });

  if (!sourceProduct) {
    throw new Error('Source product not found.');
  }

  const randomHash = crypto.randomBytes(3).toString('hex');
  const newName = `${sourceProduct.name} (Copy)`;
  const newSlug = `${sourceProduct.slug}-copy-${randomHash}`;

  const duplicatedProduct = await prisma.$transaction(async (tx) => {
    const createdProduct = await tx.product.create({
      data: {
        name: newName,
        slug: newSlug,
        description: sourceProduct.description,
        gender: sourceProduct.gender,
        categoryId: sourceProduct.categoryId,
        status: 'DRAFT', // Duplicated product defaults to DRAFT
        shippingCharge: sourceProduct.shippingCharge,
      },
    });

    // Copy Options & Values
    for (const opt of sourceProduct.options) {
      const createdOpt = await tx.productOption.create({
        data: {
          productId: createdProduct.id,
          name: opt.name,
          position: opt.position,
        },
      });

      for (const val of opt.values) {
        await tx.productOptionValue.create({
          data: {
            optionId: createdOpt.id,
            value: val.value,
            position: val.position,
          },
        });
      }
    }

    // Copy Variants with new unique SKUs
    for (const v of sourceProduct.variants) {
      const newSku = `${v.sku}-COPY-${randomHash.toUpperCase()}`;
      await tx.productVariant.create({
        data: {
          productId: createdProduct.id,
          title: v.title,
          sku: newSku,
          costPrice: v.costPrice,
          mrp: v.mrp,
          sellingPrice: v.sellingPrice,
          isAvailable: v.isAvailable,
        },
      });
    }

    // Copy Product Images
    for (const img of sourceProduct.images) {
      await tx.productImage.create({
        data: {
          productId: createdProduct.id,
          url: img.url,
          storageKey: img.storageKey,
          altText: img.altText,
          sortOrder: img.sortOrder,
        },
      });
    }

    return createdProduct;
  });

  revalidatePath('/admin/products');
  return duplicatedProduct;
}

/**
 * Soft archive product.
 */
export async function archiveProduct(productId: string) {
  await requireAdminAuth();

  const product = await prisma.product.update({
    where: { id: productId },
    data: { status: 'ARCHIVED' },
  });

  revalidatePath('/admin/products');
  revalidatePath('/men');
  revalidatePath('/women');
  return product;
}

/**
 * Unarchive / reactivate product.
 */
export async function unarchiveProduct(productId: string) {
  await requireAdminAuth();

  const product = await prisma.product.update({
    where: { id: productId },
    data: { status: 'ACTIVE' },
  });

  revalidatePath('/admin/products');
  revalidatePath('/men');
  revalidatePath('/women');
  return product;
}

/**
 * Permanently deletes a Product ONLY if it has no historical business references
 * (orders, inventory movements, FIFO cost layers, purchase lines, return/exchange history).
 */
export async function deleteProduct(productId: string) {
  await requireAdminAuth();

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: {
        include: {
          inventoryItem: true,
          _count: {
            select: {
              fifoLayers: true,
              inventoryMovements: true,
              purchaseLines: true,
              orderItems: true,
              returnItems: true,
              originalVariantExchanges: true,
              replacementVariantExchanges: true,
            },
          },
        },
      },
    },
  });

  if (!product) {
    throw new Error('Product not found.');
  }

  // Safety checks across all variants
  let hasOrderHistory = false;
  let hasInventoryHistory = false;
  let hasReturnHistory = false;
  let hasActiveStock = false;

  for (const variant of product.variants) {
    if (variant._count.orderItems > 0) {
      hasOrderHistory = true;
    }
    if (
      variant._count.fifoLayers > 0 ||
      variant._count.inventoryMovements > 0 ||
      variant._count.purchaseLines > 0
    ) {
      hasInventoryHistory = true;
    }
    if (
      variant._count.returnItems > 0 ||
      variant._count.originalVariantExchanges > 0 ||
      variant._count.replacementVariantExchanges > 0
    ) {
      hasReturnHistory = true;
    }
    if (
      variant.inventoryItem &&
      (variant.inventoryItem.physicalStock > 0 || variant.inventoryItem.reservedStock > 0)
    ) {
      hasActiveStock = true;
    }
  }

  if (hasOrderHistory) {
    throw new Error(
      `Cannot permanently delete "${product.name}" because it has order history. Archive the product instead.`
    );
  }

  if (hasInventoryHistory) {
    throw new Error(
      `Cannot permanently delete "${product.name}" because it has inventory or purchasing history. Archive the product instead.`
    );
  }

  if (hasReturnHistory) {
    throw new Error(
      `Cannot permanently delete "${product.name}" because it has return or exchange history. Archive the product instead.`
    );
  }

  if (hasActiveStock) {
    throw new Error(
      `Cannot permanently delete "${product.name}" because it has active inventory stock. Adjust stock to zero or archive the product instead.`
    );
  }

  // Atomic deletion of safely removable records
  const variantIds = product.variants.map((v) => v.id);

  await prisma.$transaction(async (tx) => {
    if (variantIds.length > 0) {
      // Delete associated inventory items (0 physical & 0 reserved stock)
      await tx.inventoryItem.deleteMany({
        where: { variantId: { in: variantIds } },
      });
    }

    // Delete Product (Prisma cascades variants, images, options, ProductButtons, CmsSectionProducts, CouponProducts)
    await tx.product.delete({
      where: { id: productId },
    });
  });

  revalidatePath('/admin/products');
  revalidatePath('/men');
  revalidatePath('/women');
  return { success: true, id: productId };
}

/**
 * Query products for Admin list view.
 */
export async function getAdminProducts(filters?: {
  search?: string;
  status?: string;
  categoryId?: string;
  gender?: string;
}) {
  await requireAdminAuth();

  const where: any = {};

  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
      { variants: { some: { sku: { contains: filters.search, mode: 'insensitive' } } } },
    ];
  }

  if (filters?.status && filters.status !== 'ALL') {
    where.status = filters.status;
  }

  if (filters?.categoryId && filters.categoryId !== 'ALL') {
    where.categoryId = filters.categoryId;
  }

  if (filters?.gender && filters.gender !== 'ALL') {
    where.gender = filters.gender;
  }

  return prisma.product.findMany({
    where,
    include: {
      category: true,
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      variants: { select: { id: true, sellingPrice: true, mrp: true } },
      _count: { select: { variants: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

/**
 * Query product by ID for admin editor.
 */
export async function getProductById(id: string) {
  await requireAdminAuth();

  return prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      options: { include: { values: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } },
      variants: { orderBy: { sku: 'asc' } },
      images: { orderBy: { sortOrder: 'asc' } },
      sourceButtons: {
        include: { targetProduct: { select: { id: true, name: true, slug: true, status: true } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
}

/**
 * Query active products by gender for customer storefront.
 */
export async function getStorefrontProducts(gender?: 'MEN' | 'WOMEN', categorySlug?: string) {
  const where: any = {
    status: 'ACTIVE',
  };

  if (gender) {
    where.gender = { in: [gender, 'BOTH'] };
  }

  if (categorySlug) {
    const cat = await prisma.category.findUnique({
      where: { slug: categorySlug },
      select: { id: true, children: { select: { id: true } } },
    });
    if (cat) {
      const categoryIds = [cat.id, ...cat.children.map((c) => c.id)];
      where.categoryId = { in: categoryIds };
    }
  }

  const products = await prisma.product.findMany({
    where,
    include: {
      category: true,
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
    orderBy: { updatedAt: 'desc' },
  });

  return products.map((p) => {
    const variants = p.variants.map((v) => {
      const physicalStock = v.inventoryItem?.physicalStock ?? 0;
      const reservedStock = v.inventoryItem?.reservedStock ?? 0;
      const availableStock = Math.max(0, physicalStock - reservedStock);
      return {
        id: v.id,
        mrp: v.mrp,
        sellingPrice: v.sellingPrice,
        isAvailable: v.isAvailable,
        availableStock,
      };
    });
    const productAvailableStock = variants.reduce((sum, v) => sum + v.availableStock, 0);

    return {
      ...p,
      variants,
      availableStock: productAvailableStock,
    };
  });
}

/**
 * Query active product detail by slug for customer storefront.
 * (Omits costPrice to ensure no internal cost info is sent to customers).
 */
export async function getStorefrontProductBySlug(slug: string) {
  const product = await prisma.product.findFirst({
    where: {
      slug,
      status: 'ACTIVE',
    },
    include: {
      category: true,
      images: { orderBy: { sortOrder: 'asc' } },
      options: {
        include: { values: { orderBy: { position: 'asc' } } },
        orderBy: { position: 'asc' },
      },
      variants: {
        where: { isAvailable: true },
        select: {
          id: true,
          title: true,
          sku: true,
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
        include: {
          targetProduct: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!product) return null;

  const variants = product.variants.map((v) => {
    const physicalStock = v.inventoryItem?.physicalStock ?? 0;
    const reservedStock = v.inventoryItem?.reservedStock ?? 0;
    const availableStock = Math.max(0, physicalStock - reservedStock);
    return {
      id: v.id,
      title: v.title,
      sku: v.sku,
      mrp: v.mrp,
      sellingPrice: v.sellingPrice,
      isAvailable: v.isAvailable,
      availableStock,
    };
  });
  const productAvailableStock = variants.reduce((sum, v) => sum + v.availableStock, 0);

  return {
    ...product,
    variants,
    availableStock: productAvailableStock,
  };
}

/**
 * Server action for storefront product search suggestions (consumed by Header Search Overlay).
 */
export async function searchSuggestionsAction(query: string, limit = 8) {
  try {
    const { searchStorefrontProducts } = await import('@/lib/catalog/search-service');
    const results = await searchStorefrontProducts(query, limit);
    return { success: true, results };
  } catch (error: any) {
    return { success: false, results: [], error: error.message || 'Search failed' };
  }
}

