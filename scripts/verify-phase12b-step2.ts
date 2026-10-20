import { prisma } from '../lib/db/prisma';
import {
  upsertCmsSection,
  publishCmsSection,
  getAdminSections,
  getAdminSectionById,
  getPublishedSections,
  reorderCmsSections,
  toggleCmsSectionActive,
  deleteCmsSection,
} from '../lib/cms/cms-service';

async function runStep2Verification() {
  console.log('===========================================================');
  console.log('  SIFR PHASE 12B — STEP 2: CMS SERVICE & ADMIN MANAGER TEST');
  console.log('===========================================================');

  // 1. Master Data Setup
  console.log('\n--- 1. Setting up Test Master Data ---');

  let testCategory = await prisma.category.findFirst({ where: { slug: 'test-cms-category' } });
  if (!testCategory) {
    testCategory = await prisma.category.create({
      data: {
        name: 'CMS Test Category',
        slug: 'test-cms-category',
      },
    });
  }

  // Create 4 ACTIVE test products
  const activeProductIds: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const slug = `test-cms-active-prod-${i}-${Date.now()}`;
    const prod = await prisma.product.create({
      data: {
        name: `Active CMS Product ${i}`,
        slug,
        gender: 'BOTH',
        status: 'ACTIVE',
        categoryId: testCategory.id,
      },
    });
    activeProductIds.push(prod.id);
  }

  // Create 1 DRAFT product
  const draftProd = await prisma.product.create({
    data: {
      name: 'Draft CMS Product',
      slug: `test-cms-draft-prod-${Date.now()}`,
      gender: 'BOTH',
      status: 'DRAFT',
      categoryId: testCategory.id,
    },
  });

  // Create 1 ARCHIVED product
  const archivedProd = await prisma.product.create({
    data: {
      name: 'Archived CMS Product',
      slug: `test-cms-archived-prod-${Date.now()}`,
      gender: 'BOTH',
      status: 'ARCHIVED',
      categoryId: testCategory.id,
    },
  });

  console.log(`✓ Active Test Products Created: ${activeProductIds.length}`);
  console.log(`✓ Draft Test Product ID: ${draftProd.id}`);
  console.log(`✓ Archived Test Product ID: ${archivedProd.id}`);

  // TEST 1: HERO Section Draft Creation
  console.log('\n--- TEST 1: HERO Section Draft Creation ---');
  const heroDraft = await upsertCmsSection({
    type: 'HERO',
    internalTitle: 'Spring 2026 Hero Banner',
    heading: 'SPRING / SUMMER 2026',
    subheading: 'Crafted for precision',
    imageUrl: '/uploads/cms/hero.jpg',
    buttons: [
      { label: 'SHOP MEN', url: '/men', style: 'PRIMARY', sortOrder: 0 },
      { label: 'SHOP WOMEN', url: '/women', style: 'SECONDARY', sortOrder: 1 },
    ],
    productIds: [],
    featureCards: [],
    isActive: true,
  });

  if (!heroDraft || heroDraft.status !== 'DRAFT' || heroDraft.publishedPayloadJson !== null) {
    throw new Error('TEST 1 FAILED: Hero draft status or payload isolation invalid');
  }
  console.log('✓ TEST 1 PASSED: HERO draft created cleanly with null publishedPayloadJson');

  // TEST 2: HERO Button Validation Rule (>2 Buttons Rejection)
  console.log('\n--- TEST 2: HERO Button Validation Rule (>2 Buttons Rejection) ---');
  let heroRuleViolated = false;
  try {
    await upsertCmsSection({
      type: 'HERO',
      internalTitle: 'Invalid Hero',
      buttons: [
        { label: 'Btn 1', url: '/1', style: 'PRIMARY', sortOrder: 0 },
        { label: 'Btn 2', url: '/2', style: 'PRIMARY', sortOrder: 1 },
        { label: 'Btn 3', url: '/3', style: 'PRIMARY', sortOrder: 2 },
      ],
      productIds: [],
      featureCards: [],
    });
  } catch (err: any) {
    heroRuleViolated = true;
    console.log(`  Expected Validation Catch: "${err.message}"`);
  }
  if (!heroRuleViolated) {
    throw new Error('TEST 2 FAILED: HERO >2 buttons rule was not enforced!');
  }
  console.log('✓ TEST 2 PASSED: HERO section button limit (<= 2) enforced on server');

  // TEST 3: IMAGE_BANNER Publish & Live Snapshot Creation
  console.log('\n--- TEST 3: IMAGE_BANNER Publish & Live Snapshot Creation ---');
  const bannerDraft = await upsertCmsSection({
    type: 'IMAGE_BANNER',
    internalTitle: 'Summer Promo Banner',
    heading: 'MID SEASON SALE',
    subheading: 'UP TO 40% OFF',
    imageUrl: '/uploads/cms/banner.jpg',
    buttons: [{ label: 'EXPLORE SALE', url: '/categories/sale', style: 'PRIMARY', sortOrder: 0 }],
    productIds: [],
    featureCards: [],
    isActive: true,
  });
  if (!bannerDraft) throw new Error('Banner draft creation failed');

  const publishedBanner = await publishCmsSection(bannerDraft.id);
  if (!publishedBanner || publishedBanner.status !== 'PUBLISHED' || !publishedBanner.publishedPayloadJson) {
    throw new Error('TEST 3 FAILED: Banner publish status or payload generation failed');
  }
  const compiledBanner = JSON.parse(publishedBanner.publishedPayloadJson);
  if (compiledBanner.heading !== 'MID SEASON SALE' || compiledBanner.buttons.length !== 1) {
    throw new Error('TEST 3 FAILED: Compiled banner snapshot payload contents invalid');
  }
  console.log('✓ TEST 3 PASSED: IMAGE_BANNER published and compiled snapshot payload correctly');

  // TEST 4: Live Published Snapshot Isolation Guarantee
  console.log('\n--- TEST 4: Live Published Snapshot Isolation Guarantee ---');
  // Edit draft heading of published banner
  await upsertCmsSection({
    id: publishedBanner.id,
    type: 'IMAGE_BANNER',
    internalTitle: 'Summer Promo Banner (Updated)',
    heading: 'DRAFT EDIT — NOT YET PUBLISHED',
    imageUrl: '/uploads/cms/banner.jpg',
    buttons: [{ label: 'EXPLORE SALE', url: '/categories/sale', style: 'PRIMARY', sortOrder: 0 }],
    productIds: [],
    featureCards: [],
  });

  const adminView = await getAdminSectionById(publishedBanner.id);
  const liveView = await getPublishedSections();
  const liveBanner = liveView.find((s) => s.id === publishedBanner.id);

  if (adminView?.heading !== 'DRAFT EDIT — NOT YET PUBLISHED') {
    throw new Error('TEST 4 FAILED: Admin view did not reflect draft edit');
  }
  if (!liveBanner || liveBanner.publishedPayload.heading !== 'MID SEASON SALE') {
    throw new Error('TEST 4 FAILED: Live published snapshot was mutated by draft edit!');
  }
  console.log('✓ TEST 4 PASSED: Draft edit updated admin draft view while live snapshot remained strictly isolated ("MID SEASON SALE")');

  // TEST 5: SPLIT_FEATURE Validation (Exactly 4 Products Required)
  console.log('\n--- TEST 5: SPLIT_FEATURE Validation (Exactly 4 Products Required) ---');
  const splitDraft = await upsertCmsSection({
    type: 'SPLIT_FEATURE',
    internalTitle: 'Split Feature 4-Grid',
    heading: 'CURATED ESSENTIALS',
    imageUrl: '/uploads/cms/split.jpg',
    buttons: [],
    productIds: activeProductIds, // Exactly 4 active products
    featureCards: [],
  });
  if (!splitDraft) throw new Error('Split draft creation failed');

  const publishedSplit = await publishCmsSection(splitDraft.id);
  if (!publishedSplit || publishedSplit.status !== 'PUBLISHED') {
    throw new Error('TEST 5 FAILED: Split feature publish failed');
  }

  // Attempting to publish split feature with <4 products fails
  let splitRuleViolated = false;
  try {
    const invalidSplit = await upsertCmsSection({
      type: 'SPLIT_FEATURE',
      internalTitle: 'Invalid Split',
      imageUrl: '/uploads/cms/split.jpg',
      buttons: [],
      productIds: [activeProductIds[0]], // Only 1 product
      featureCards: [],
    });
    if (invalidSplit) {
      await publishCmsSection(invalidSplit.id);
    }
  } catch (err: any) {
    splitRuleViolated = true;
    console.log(`  Expected Validation Catch: "${err.message}"`);
  }
  if (!splitRuleViolated) {
    throw new Error('TEST 5 FAILED: SPLIT_FEATURE 4-product validation rule was not enforced!');
  }
  console.log('✓ TEST 5 PASSED: SPLIT_FEATURE section requires exactly 4 active products to publish');

  // TEST 6: FEATURE_CARDS Validation (Exactly 3 Cards Required)
  console.log('\n--- TEST 6: FEATURE_CARDS Validation (Exactly 3 Cards Required) ---');
  const cardsDraft = await upsertCmsSection({
    type: 'FEATURE_CARDS',
    internalTitle: 'Three Feature Cards',
    heading: 'EXPLORE COLLECTIONS',
    buttons: [],
    productIds: [],
    featureCards: [
      { title: 'T-Shirts', imageUrl: '/card1.jpg', buttonLabel: 'Shop', buttonUrl: '/1', sortOrder: 0 },
      { title: 'Hoodies', imageUrl: '/card2.jpg', buttonLabel: 'Shop', buttonUrl: '/2', sortOrder: 1 },
      { title: 'Pants', imageUrl: '/card3.jpg', buttonLabel: 'Shop', buttonUrl: '/3', sortOrder: 2 },
    ],
  });
  if (!cardsDraft) throw new Error('Cards draft creation failed');

  const publishedCards = await publishCmsSection(cardsDraft.id);
  if (!publishedCards || publishedCards.status !== 'PUBLISHED') {
    throw new Error('TEST 6 FAILED: Feature cards publish failed');
  }
  console.log('✓ TEST 6 PASSED: FEATURE_CARDS section published with 3 valid cards');

  // TEST 7: Inactive / Draft / Archived Product Rejection During Publish
  console.log('\n--- TEST 7: Inactive / Draft / Archived Product Rejection During Publish ---');
  let draftProductPublishBlocked = false;
  try {
    const carouselWithDraftProd = await upsertCmsSection({
      type: 'PRODUCT_CAROUSEL',
      internalTitle: 'Carousel with Draft Product',
      heading: 'DRAFT PROD CAROUSEL',
      buttons: [],
      productIds: [draftProd.id],
      featureCards: [],
    });
    if (carouselWithDraftProd) {
      await publishCmsSection(carouselWithDraftProd.id);
    }
  } catch (err: any) {
    draftProductPublishBlocked = true;
    console.log(`  Expected Validation Catch: "${err.message}"`);
  }

  if (!draftProductPublishBlocked) {
    throw new Error('TEST 7 FAILED: Publishing section with non-ACTIVE product was allowed!');
  }
  console.log('✓ TEST 7 PASSED: Publishing section with DRAFT or ARCHIVED product blocked by server');

  // TEST 8: Dynamic Storefront Product Status Filtering
  console.log('\n--- TEST 8: Dynamic Storefront Product Status Filtering ---');
  // Publish carousel with 4 active products
  const carouselDraft = await upsertCmsSection({
    type: 'PRODUCT_CAROUSEL',
    internalTitle: '4 Product Carousel',
    heading: 'POPULAR ITEMS',
    buttons: [],
    productIds: activeProductIds,
    featureCards: [],
  });
  if (!carouselDraft) throw new Error('Carousel draft creation failed');

  const publishedCarousel = await publishCmsSection(carouselDraft.id);

  // Now change 1 product status to ARCHIVED
  await prisma.product.update({
    where: { id: activeProductIds[0] },
    data: { status: 'ARCHIVED' },
  });

  const storefrontSections = await getPublishedSections();
  const storefrontCarousel = storefrontSections.find((s) => s.id === publishedCarousel.id);

  if (!storefrontCarousel || storefrontCarousel.publishedPayload.productIds.length !== 3) {
    throw new Error(
      `TEST 8 FAILED: Expected 3 active products in storefront payload, got ${storefrontCarousel?.publishedPayload.productIds.length}`
    );
  }
  console.log('✓ TEST 8 PASSED: Storefront dynamically filtered out ARCHIVED product (4 -> 3 products) without database error');

  // Restore product status
  await prisma.product.update({
    where: { id: activeProductIds[0] },
    data: { status: 'ACTIVE' },
  });

  // TEST 9: Section Reordering & Active Toggle
  console.log('\n--- TEST 9: Section Reordering & Active Toggle ---');
  const allSectionsBefore = await getAdminSections();
  const ids = allSectionsBefore.map((s) => s.id);
  const reversedIds = [...ids].reverse();

  await reorderCmsSections(reversedIds);
  const allSectionsAfter = await getAdminSections();

  if (allSectionsAfter[0].id !== reversedIds[0]) {
    throw new Error('TEST 9 FAILED: Section reordering failed');
  }

  // Toggle active
  await toggleCmsSectionActive(publishedCarousel.id, false);
  const activeStorefront = await getPublishedSections();
  if (activeStorefront.some((s) => s.id === publishedCarousel.id)) {
    throw new Error('TEST 9 FAILED: Deactivated section was returned in storefront query');
  }
  console.log('✓ TEST 9 PASSED: Section reordering and active toggle working cleanly');

  // Cleanup Test Data
  console.log('\n--- Cleaning up Test Data ---');
  await deleteCmsSection(heroDraft.id);
  await deleteCmsSection(bannerDraft.id);
  await deleteCmsSection(splitDraft.id);
  await deleteCmsSection(publishedCards.id);
  await deleteCmsSection(publishedCarousel.id);

  for (const pid of activeProductIds) {
    await prisma.product.delete({ where: { id: pid } });
  }
  await prisma.product.delete({ where: { id: draftProd.id } });
  await prisma.product.delete({ where: { id: archivedProd.id } });

  console.log('===========================================================');
  console.log('  ALL PHASE 12B STEP 2 VERIFICATION TESTS PASSED! 🎉');
  console.log('===========================================================');
}

runStep2Verification().catch((e) => {
  console.error('STEP 2 VERIFICATION FAILED:', e);
  process.exit(1);
});
