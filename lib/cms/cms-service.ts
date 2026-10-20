import { prisma } from '@/lib/db/prisma';
import { CmsSectionType, CmsSectionStatus } from '@prisma/client';
import {
  upsertCmsSectionSchema,
  UpsertCmsSectionInput,
} from '@/lib/validation/cms';

export interface CompiledSectionPayload {
  id: string;
  type: CmsSectionType;
  internalTitle: string;
  heading: string | null;
  subheading: string | null;
  imageUrl: string | null;
  imageStorageKey: string | null;
  altText: string | null;
  viewAllUrl: string | null;
  sortOrder: number;
  buttons: {
    id?: string;
    label: string;
    url: string;
    style: string;
    sortOrder: number;
  }[];
  productIds: string[];
  featureCards: {
    id?: string;
    title: string;
    imageUrl: string;
    imageStorageKey?: string | null;
    buttonLabel: string;
    buttonUrl: string;
    sortOrder: number;
  }[];
  publishedAt: string;
}

/**
 * Section-specific validation logic for draft saving and publishing.
 */
export function validateCmsSectionRules(input: UpsertCmsSectionInput, isPublish = false): void {
  const { type, heading, imageUrl } = input;
  const buttons = input.buttons || [];
  const productIds = input.productIds || [];
  const featureCards = input.featureCards || [];

  // HERO validation
  if (type === 'HERO') {
    if (buttons.length > 2) {
      throw new Error('HERO section cannot have more than 2 buttons.');
    }
    if (isPublish && !heading && !imageUrl) {
      throw new Error('HERO section requires at least a heading or a background image to publish.');
    }
  }

  // IMAGE_BANNER validation
  if (type === 'IMAGE_BANNER') {
    if (buttons.length > 2) {
      throw new Error('IMAGE_BANNER section cannot have more than 2 buttons.');
    }
    if (isPublish && (!imageUrl || imageUrl.trim() === '')) {
      throw new Error('IMAGE_BANNER section requires an image URL to publish.');
    }
  }

  // PRODUCT_CAROUSEL validation
  if (type === 'PRODUCT_CAROUSEL') {
    if (isPublish && (!heading || heading.trim() === '')) {
      throw new Error('PRODUCT_CAROUSEL section requires a section heading to publish.');
    }
    if (productIds.length > 10) {
      throw new Error('PRODUCT_CAROUSEL section cannot exceed 10 products.');
    }
    if (isPublish && productIds.length === 0) {
      throw new Error('PRODUCT_CAROUSEL section requires at least 1 product link to publish.');
    }
  }

  // SPLIT_FEATURE validation
  if (type === 'SPLIT_FEATURE') {
    if (isPublish && (!imageUrl || imageUrl.trim() === '')) {
      throw new Error('SPLIT_FEATURE section requires a feature image URL to publish.');
    }
    if (productIds.length > 4) {
      throw new Error('SPLIT_FEATURE section cannot have more than 4 products.');
    }
    if (isPublish && productIds.length !== 4) {
      throw new Error('SPLIT_FEATURE section requires exactly 4 products to publish.');
    }
  }

  // FEATURE_CARDS validation
  if (type === 'FEATURE_CARDS') {
    if (featureCards.length > 3) {
      throw new Error('FEATURE_CARDS section cannot have more than 3 cards.');
    }
    if (isPublish && featureCards.length !== 3) {
      throw new Error('FEATURE_CARDS section requires exactly 3 promotional cards to publish.');
    }
    featureCards.forEach((card, idx) => {
      if (!card.title || card.title.trim() === '') {
        throw new Error(`Feature card #${idx + 1} requires a title.`);
      }
      if (!card.imageUrl || card.imageUrl.trim() === '') {
        throw new Error(`Feature card #${idx + 1} requires an image URL.`);
      }
      if (!card.buttonLabel || card.buttonLabel.trim() === '') {
        throw new Error(`Feature card #${idx + 1} requires a button label.`);
      }
      if (!card.buttonUrl || card.buttonUrl.trim() === '') {
        throw new Error(`Feature card #${idx + 1} requires a button URL.`);
      }
    });
  }
}

/**
 * Fetches all CMS sections for admin view (including draft data & relations).
 */
export async function getAdminSections() {
  return prisma.cmsSection.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      buttons: { orderBy: { sortOrder: 'asc' } },
      productLinks: {
        orderBy: { sortOrder: 'asc' },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              category: { select: { id: true, name: true } },
              images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
            },
          },
        },
      },
      featureCards: { orderBy: { sortOrder: 'asc' } },
    },
  });
}

/**
 * Fetches a single CMS section by ID for admin editor / preview.
 */
export async function getAdminSectionById(id: string) {
  return prisma.cmsSection.findUnique({
    where: { id },
    include: {
      buttons: { orderBy: { sortOrder: 'asc' } },
      productLinks: {
        orderBy: { sortOrder: 'asc' },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              category: { select: { id: true, name: true } },
              images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
            },
          },
        },
      },
      featureCards: { orderBy: { sortOrder: 'asc' } },
    },
  });
}

/**
 * Fetches active published section snapshots for live customer storefront requests.
 * Dynamically verifies linked product status (only active products included).
 */
export async function getPublishedSections() {
  const sections = await prisma.cmsSection.findMany({
    where: {
      status: CmsSectionStatus.PUBLISHED,
      isActive: true,
      publishedPayloadJson: { not: null },
    },
    orderBy: { sortOrder: 'asc' },
  });

  const parsedSections = [];

  for (const sec of sections) {
    if (!sec.publishedPayloadJson) continue;

    try {
      const payload: CompiledSectionPayload = JSON.parse(sec.publishedPayloadJson);

      // If payload has product links, dynamically filter out non-ACTIVE products
      if (payload.productIds && payload.productIds.length > 0) {
        const activeProducts = await prisma.product.findMany({
          where: {
            id: { in: payload.productIds },
            status: 'ACTIVE',
          },
          select: { id: true },
        });

        const activeProductIds = new Set(activeProducts.map((p) => p.id));
        payload.productIds = payload.productIds.filter((pid) => activeProductIds.has(pid));
      }

      parsedSections.push({
        ...sec,
        publishedPayload: payload,
      });
    } catch {
      // Ignore corrupted payload
    }
  }

  return parsedSections;
}

/**
 * Helper to fetch active product details for storefront section rendering, maintaining ID order.
 */
export async function getStorefrontProductsByIds(productIds: string[]) {
  if (!productIds || productIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      status: 'ACTIVE',
    },
    include: {
      category: { select: { name: true, slug: true } },
      images: { orderBy: { sortOrder: 'asc' }, select: { url: true, altText: true } },
      variants: {
        where: { isAvailable: true },
        select: {
          id: true,
          mrp: true,
          sellingPrice: true,
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
  });

  const formattedProducts = products.map((p) => {
    const variants = p.variants.map((v) => {
      const physicalStock = v.inventoryItem?.physicalStock ?? 0;
      const reservedStock = v.inventoryItem?.reservedStock ?? 0;
      const availableStock = Math.max(0, physicalStock - reservedStock);
      return {
        id: v.id,
        mrp: v.mrp,
        sellingPrice: v.sellingPrice,
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

  const productMap = new Map(formattedProducts.map((p) => [p.id, p]));
  return productIds.map((id) => productMap.get(id)).filter(Boolean) as typeof formattedProducts;
}

/**
 * Upserts a CMS section draft (Create or Update).
 * Live Published Snapshot (publishedPayloadJson) is isolated and NOT altered during draft edits.
 */
export async function upsertCmsSection(input: UpsertCmsSectionInput) {
  const validated = upsertCmsSectionSchema.parse(input);
  validateCmsSectionRules(validated, false);

  const buttons = validated.buttons || [];
  const productIds = validated.productIds || [];
  const featureCards = validated.featureCards || [];

  return prisma.$transaction(async (tx) => {
    let sectionId = validated.id;

    if (sectionId) {
      // Update existing section metadata
      await tx.cmsSection.update({
        where: { id: sectionId },
        data: {
          type: validated.type,
          internalTitle: validated.internalTitle,
          heading: validated.heading,
          subheading: validated.subheading,
          imageUrl: validated.imageUrl,
          imageStorageKey: validated.imageStorageKey,
          altText: validated.altText,
          viewAllUrl: validated.viewAllUrl,
          sortOrder: validated.sortOrder ?? 0,
          isActive: validated.isActive ?? true,
        },
      });

      // Clear existing relations for clean replacement
      await tx.cmsButton.deleteMany({ where: { sectionId } });
      await tx.cmsSectionProduct.deleteMany({ where: { sectionId } });
      await tx.cmsFeatureCard.deleteMany({ where: { sectionId } });
    } else {
      // Create new section
      const created = await tx.cmsSection.create({
        data: {
          type: validated.type,
          internalTitle: validated.internalTitle,
          heading: validated.heading,
          subheading: validated.subheading,
          imageUrl: validated.imageUrl,
          imageStorageKey: validated.imageStorageKey,
          altText: validated.altText,
          viewAllUrl: validated.viewAllUrl,
          sortOrder: validated.sortOrder ?? 0,
          isActive: validated.isActive ?? true,
          status: CmsSectionStatus.DRAFT,
        },
      });
      sectionId = created.id;
    }

    // Re-create buttons
    if (buttons.length > 0) {
      await tx.cmsButton.createMany({
        data: buttons.map((btn, idx) => ({
          sectionId: sectionId!,
          label: btn.label,
          url: btn.url,
          style: btn.style || 'PRIMARY',
          sortOrder: btn.sortOrder ?? idx,
        })),
      });
    }

    // Re-create product links
    if (productIds.length > 0) {
      await tx.cmsSectionProduct.createMany({
        data: productIds.map((pid, idx) => ({
          sectionId: sectionId!,
          productId: pid,
          sortOrder: idx,
        })),
      });
    }

    // Re-create feature cards
    if (featureCards.length > 0) {
      await tx.cmsFeatureCard.createMany({
        data: featureCards.map((card, idx) => ({
          sectionId: sectionId!,
          title: card.title,
          imageUrl: card.imageUrl,
          imageStorageKey: card.imageStorageKey,
          buttonLabel: card.buttonLabel,
          buttonUrl: card.buttonUrl,
          sortOrder: card.sortOrder ?? idx,
        })),
      });
    }

    return tx.cmsSection.findUnique({
      where: { id: sectionId! },
      include: {
        buttons: { orderBy: { sortOrder: 'asc' } },
        productLinks: {
          orderBy: { sortOrder: 'asc' },
          include: { product: true },
        },
        featureCards: { orderBy: { sortOrder: 'asc' } },
      },
    });
  });
}

/**
 * Publishes a CMS section.
 * Validates section rules, checks linked product active statuses, compiles payload into publishedPayloadJson,
 * and updates status to PUBLISHED and publishedAt to now.
 */
export async function publishCmsSection(sectionId: string) {
  const section = await getAdminSectionById(sectionId);
  if (!section) {
    throw new Error(`CMS Section not found: ${sectionId}`);
  }

  const inputShape: UpsertCmsSectionInput = {
    id: section.id,
    type: section.type,
    internalTitle: section.internalTitle,
    heading: section.heading,
    subheading: section.subheading,
    imageUrl: section.imageUrl,
    imageStorageKey: section.imageStorageKey,
    altText: section.altText,
    viewAllUrl: section.viewAllUrl,
    sortOrder: section.sortOrder,
    isActive: section.isActive,
    buttons: section.buttons.map((b) => ({
      id: b.id,
      label: b.label,
      url: b.url,
      style: b.style as 'PRIMARY' | 'SECONDARY',
      sortOrder: b.sortOrder,
    })),
    productIds: section.productLinks.map((pl) => pl.productId),
    featureCards: section.featureCards.map((fc) => ({
      id: fc.id,
      title: fc.title,
      imageUrl: fc.imageUrl,
      imageStorageKey: fc.imageStorageKey,
      buttonLabel: fc.buttonLabel,
      buttonUrl: fc.buttonUrl,
      sortOrder: fc.sortOrder,
    })),
  };

  // Validate publish criteria
  validateCmsSectionRules(inputShape, true);

  const productIds = inputShape.productIds || [];

  // Validate active product statuses
  if (productIds.length > 0) {
    const activeProducts = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        status: 'ACTIVE',
      },
      select: { id: true, name: true, status: true },
    });

    if (activeProducts.length !== productIds.length) {
      const activeSet = new Set(activeProducts.map((p) => p.id));
      const invalidIds = productIds.filter((id) => !activeSet.has(id));
      throw new Error(`Cannot publish section: Contains inactive/archived products (IDs: ${invalidIds.join(', ')}).`);
    }
  }

  // Compile JSON payload snapshot
  const compiledPayload: CompiledSectionPayload = {
    id: section.id,
    type: section.type,
    internalTitle: section.internalTitle,
    heading: section.heading,
    subheading: section.subheading,
    imageUrl: section.imageUrl,
    imageStorageKey: section.imageStorageKey,
    altText: section.altText,
    viewAllUrl: section.viewAllUrl,
    sortOrder: section.sortOrder,
    buttons: (inputShape.buttons || []).map((b, idx) => ({
      id: b.id,
      label: b.label,
      url: b.url,
      style: b.style || 'PRIMARY',
      sortOrder: b.sortOrder ?? idx,
    })),
    productIds,
    featureCards: (inputShape.featureCards || []).map((fc, idx) => ({
      id: fc.id,
      title: fc.title,
      imageUrl: fc.imageUrl,
      imageStorageKey: fc.imageStorageKey,
      buttonLabel: fc.buttonLabel,
      buttonUrl: fc.buttonUrl,
      sortOrder: fc.sortOrder ?? idx,
    })),
    publishedAt: new Date().toISOString(),
  };

  return prisma.cmsSection.update({
    where: { id: sectionId },
    data: {
      status: CmsSectionStatus.PUBLISHED,
      publishedPayloadJson: JSON.stringify(compiledPayload),
      publishedAt: new Date(),
    },
    include: {
      buttons: { orderBy: { sortOrder: 'asc' } },
      productLinks: { orderBy: { sortOrder: 'asc' }, include: { product: true } },
      featureCards: { orderBy: { sortOrder: 'asc' } },
    },
  });
}

/**
 * Updates section sort orders.
 */
export async function reorderCmsSections(orderedIds: string[]) {
  return prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.cmsSection.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );
}

/**
 * Toggles a section's isActive flag.
 */
export async function toggleCmsSectionActive(sectionId: string, isActive: boolean) {
  return prisma.cmsSection.update({
    where: { id: sectionId },
    data: { isActive },
  });
}

/**
 * Deletes a CMS section.
 */
export async function deleteCmsSection(sectionId: string) {
  return prisma.cmsSection.delete({
    where: { id: sectionId },
  });
}
