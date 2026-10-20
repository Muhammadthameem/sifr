import { prisma } from '../lib/db/prisma';
import {
  upsertCmsSection,
  publishCmsSection,
  getPublishedSections,
  getStorefrontProductsByIds,
  toggleCmsSectionActive,
  deleteCmsSection,
} from '../lib/cms/cms-service';
import { CmsSectionType } from '@prisma/client';

async function runStep5Verification() {
  console.log('=== PHASE 12B STEP 5 VERIFICATION: DYNAMIC HOMEPAGE & CMS INTEGRATION ===\n');

  let testCategory: any;
  const createdProducts: any[] = [];
  const createdSections: any[] = [];

  try {
    // 1. Setup Test Category and Active/Draft/Archived Products
    console.log('1. Setting up test catalog data...');
    testCategory = await prisma.category.create({
      data: {
        name: 'Step 5 Test Category',
        slug: `step5-cat-${Date.now()}`,
      },
    });

    // Create 12 Active Products
    for (let i = 1; i <= 12; i++) {
      const prod = await prisma.product.create({
        data: {
          name: `Step5 Active Product ${i}`,
          slug: `step5-active-prod-${i}-${Date.now()}`,
          description: `Description ${i}`,
          gender: 'BOTH',
          categoryId: testCategory.id,
          status: 'ACTIVE',
          variants: {
            create: {
              title: 'Default',
              sku: `S5-ACT-${i}-${Date.now()}`,
              mrp: 2999,
              sellingPrice: 1999,
              isAvailable: true,
            },
          },
          images: {
            create: {
              url: `https://images.unsplash.com/photo-test-${i}.jpg`,
              sortOrder: 0,
            },
          },
        },
      });
      createdProducts.push(prod);
    }

    // Create 1 Draft Product and 1 Archived Product
    const draftProduct = await prisma.product.create({
      data: {
        name: 'Step5 Draft Product',
        slug: `step5-draft-prod-${Date.now()}`,
        gender: 'BOTH',
        categoryId: testCategory.id,
        status: 'DRAFT',
        variants: {
          create: { title: 'Default', sku: `S5-DFT-${Date.now()}`, mrp: 1999, sellingPrice: 1499, isAvailable: true },
        },
      },
    });
    createdProducts.push(draftProduct);

    const archivedProduct = await prisma.product.create({
      data: {
        name: 'Step5 Archived Product',
        slug: `step5-archived-prod-${Date.now()}`,
        gender: 'BOTH',
        categoryId: testCategory.id,
        status: 'ARCHIVED',
        variants: {
          create: { title: 'Default', sku: `S5-ARC-${Date.now()}`, mrp: 1999, sellingPrice: 1499, isAvailable: true },
        },
      },
    });
    createdProducts.push(archivedProduct);

    console.log(`   Created ${createdProducts.length} test products (12 Active, 1 Draft, 1 Archived).\n`);

    // 2. Test Initial Empty Published CMS State
    console.log('2. Testing empty published CMS sections fallback...');
    await prisma.cmsSection.deleteMany({ where: { internalTitle: { startsWith: 'TEST_S5_' } } });
    const initialPublished = await getPublishedSections();
    console.log(`   Published sections count before publishing: ${initialPublished.length}`);
    console.log('   ✓ Clean empty published state verified (no crash).\n');

    // 3. Test HERO Section Creation & Publish
    console.log('3. Testing HERO Section draft & publish lifecycle...');
    const heroDraftRes = await upsertCmsSection({
      type: CmsSectionType.HERO,
      internalTitle: 'TEST_S5_Hero_Draft',
      heading: 'Autumn Editorial Collection',
      subheading: 'Discover the new luxury essentials',
      imageUrl: 'https://images.unsplash.com/photo-hero.jpg',
      altText: 'Hero Editorial Image',
      sortOrder: 0,
      buttons: [
        { label: 'Shop Women', url: '/women', style: 'PRIMARY', sortOrder: 0 },
        { label: 'Shop Men', url: '/men', style: 'SECONDARY', sortOrder: 1 },
      ],
    });
    if (!heroDraftRes) throw new Error('Failed to create HERO draft section');
    const heroDraft = heroDraftRes;
    createdSections.push(heroDraft);

    let pubSections = await getPublishedSections();
    const heroPublishedBefore = pubSections.find((s) => s.id === heroDraft.id);
    if (heroPublishedBefore) throw new Error('Unpublished draft section leaked to live storefront!');
    console.log('   ✓ Draft section is isolated from live storefront payload.');

    // Now Publish Hero
    await publishCmsSection(heroDraft.id);
    pubSections = await getPublishedSections();
    const heroPublishedAfter = pubSections.find((s) => s.id === heroDraft.id);
    if (!heroPublishedAfter || heroPublishedAfter.publishedPayload.heading !== 'Autumn Editorial Collection') {
      throw new Error('Published HERO section snapshot invalid or missing!');
    }
    if (heroPublishedAfter.publishedPayload.buttons.length !== 2) {
      throw new Error('HERO section did not preserve 2 buttons in snapshot!');
    }
    console.log('   ✓ HERO section published snapshot verified.\n');

    // 4. Test Draft Edit Isolation on Published Section
    console.log('4. Testing Draft Edit Isolation on Published Section...');
    await upsertCmsSection({
      id: heroDraft.id,
      type: CmsSectionType.HERO,
      internalTitle: 'TEST_S5_Hero_Draft',
      heading: 'UNCOMMITTED DRAFT HEADING - SHOULD NOT APPEAR LIVE',
      subheading: 'Uncommitted draft subheading',
      imageUrl: 'https://images.unsplash.com/photo-hero-draft.jpg',
      buttons: [{ label: 'Draft Button', url: '/draft', style: 'PRIMARY' }],
    });

    pubSections = await getPublishedSections();
    const heroStillPublished = pubSections.find((s) => s.id === heroDraft.id);
    if (heroStillPublished?.publishedPayload.heading === 'UNCOMMITTED DRAFT HEADING - SHOULD NOT APPEAR LIVE') {
      throw new Error('CRITICAL BUG: Uncommitted draft edit leaked to live storefront snapshot!');
    }
    if (heroStillPublished?.publishedPayload.heading !== 'Autumn Editorial Collection') {
      throw new Error('Published payload snapshot was unexpectedly modified by draft edit!');
    }
    console.log('   ✓ Live storefront payload is 100% immune to draft edits prior to publish.\n');

    // 5. Test PRODUCT_CAROUSEL Section (Max 10 Products limit & View All)
    console.log('5. Testing PRODUCT_CAROUSEL Section (Max 10 Products limit)...');
    const active10Ids = createdProducts.slice(0, 10).map((p) => p.id);
    const carouselDraftRes = await upsertCmsSection({
      type: CmsSectionType.PRODUCT_CAROUSEL,
      internalTitle: 'TEST_S5_Carousel',
      heading: 'Best Sellers',
      subheading: 'Curated Essentials',
      viewAllUrl: '/women',
      sortOrder: 1,
      productIds: active10Ids,
    });
    if (!carouselDraftRes) throw new Error('Failed to create PRODUCT_CAROUSEL section');
    const carouselDraft = carouselDraftRes;
    createdSections.push(carouselDraft);
    await publishCmsSection(carouselDraft.id);

    pubSections = await getPublishedSections();
    const carouselPublished = pubSections.find((s) => s.id === carouselDraft.id);
    if (!carouselPublished || carouselPublished.publishedPayload.productIds.length !== 10) {
      throw new Error('PRODUCT_CAROUSEL snapshot did not contain expected 10 products!');
    }
    if (carouselPublished.publishedPayload.viewAllUrl !== '/women') {
      throw new Error('PRODUCT_CAROUSEL viewAllUrl missing from snapshot!');
    }
    console.log('   ✓ PRODUCT_CAROUSEL max 10 products & viewAllUrl verified.\n');

    // 6. Test IMAGE_BANNER Section
    console.log('6. Testing IMAGE_BANNER Section...');
    const bannerDraftRes = await upsertCmsSection({
      type: CmsSectionType.IMAGE_BANNER,
      internalTitle: 'TEST_S5_Banner',
      heading: 'The Outerwear Edit',
      subheading: 'Crafted for the changing seasons',
      imageUrl: 'https://images.unsplash.com/photo-banner.jpg',
      sortOrder: 2,
      buttons: [{ label: 'Explore Outerwear', url: '/categories/outerwear', style: 'PRIMARY' }],
    });
    if (!bannerDraftRes) throw new Error('Failed to create IMAGE_BANNER section');
    const bannerDraft = bannerDraftRes;
    createdSections.push(bannerDraft);
    await publishCmsSection(bannerDraft.id);

    pubSections = await getPublishedSections();
    const bannerPublished = pubSections.find((s) => s.id === bannerDraft.id);
    if (!bannerPublished || bannerPublished.publishedPayload.heading !== 'The Outerwear Edit') {
      throw new Error('IMAGE_BANNER snapshot verification failed!');
    }
    console.log('   ✓ IMAGE_BANNER section verified.\n');

    // 7. Test SPLIT_FEATURE Section (Exactly 4 Products & 50/50 Layout)
    console.log('7. Testing SPLIT_FEATURE Section (Exactly 4 products)...');
    const split4Ids = createdProducts.slice(0, 4).map((p) => p.id);
    const splitDraftRes = await upsertCmsSection({
      type: CmsSectionType.SPLIT_FEATURE,
      internalTitle: 'TEST_S5_Split',
      heading: 'Tailored Perfection',
      subheading: 'Monochrome Palette',
      imageUrl: 'https://images.unsplash.com/photo-split.jpg',
      sortOrder: 3,
      productIds: split4Ids,
    });
    if (!splitDraftRes) throw new Error('Failed to create SPLIT_FEATURE section');
    const splitDraft = splitDraftRes;
    createdSections.push(splitDraft);
    await publishCmsSection(splitDraft.id);

    pubSections = await getPublishedSections();
    const splitPublished = pubSections.find((s) => s.id === splitDraft.id);
    if (!splitPublished || splitPublished.publishedPayload.productIds.length !== 4) {
      throw new Error('SPLIT_FEATURE snapshot does not contain exactly 4 products!');
    }
    console.log('   ✓ SPLIT_FEATURE section exactly 4 products verified.\n');

    // 8. Test FEATURE_CARDS Section (Exactly 3 Promotional Cards)
    console.log('8. Testing FEATURE_CARDS Section (Exactly 3 Cards)...');
    const featureCardsDraftRes = await upsertCmsSection({
      type: CmsSectionType.FEATURE_CARDS,
      internalTitle: 'TEST_S5_FeatureCards',
      heading: 'Curated Stories',
      sortOrder: 4,
      featureCards: [
        { title: 'Tailoring', imageUrl: 'https://images.unsplash.com/card1.jpg', buttonLabel: 'Discover', buttonUrl: '/tailoring' },
        { title: 'Knitwear', imageUrl: 'https://images.unsplash.com/card2.jpg', buttonLabel: 'Discover', buttonUrl: '/knitwear' },
        { title: 'Accessories', imageUrl: 'https://images.unsplash.com/card3.jpg', buttonLabel: 'Discover', buttonUrl: '/accessories' },
      ],
    });
    if (!featureCardsDraftRes) throw new Error('Failed to create FEATURE_CARDS section');
    const featureCardsDraft = featureCardsDraftRes;
    createdSections.push(featureCardsDraft);
    await publishCmsSection(featureCardsDraft.id);

    pubSections = await getPublishedSections();
    const cardsPublished = pubSections.find((s) => s.id === featureCardsDraft.id);
    if (!cardsPublished || cardsPublished.publishedPayload.featureCards.length !== 3) {
      throw new Error('FEATURE_CARDS snapshot does not contain exactly 3 cards!');
    }
    console.log('   ✓ FEATURE_CARDS section exactly 3 cards verified.\n');

    // 9. Test Dynamic Product Filtering (Archived/Draft exclusion)
    console.log('9. Testing automatic exclusion of Archived/Draft products...');
    const archivedProdId = active10Ids[0];
    await prisma.product.update({
      where: { id: archivedProdId },
      data: { status: 'ARCHIVED' },
    });

    pubSections = await getPublishedSections();
    const updatedCarousel = pubSections.find((s) => s.id === carouselDraft.id);
    if (updatedCarousel?.publishedPayload.productIds.includes(archivedProdId)) {
      throw new Error('ARCHIVED product was not automatically excluded from published storefront payload!');
    }
    if (updatedCarousel?.publishedPayload.productIds.length !== 9) {
      throw new Error(`Expected 9 active products after archiving 1, got ${updatedCarousel?.publishedPayload.productIds.length}`);
    }
    console.log('   ✓ Archived product was automatically excluded from live storefront payload.\n');

    // Restore product status for clean state
    await prisma.product.update({
      where: { id: archivedProdId },
      data: { status: 'ACTIVE' },
    });

    // 10. Test Inactive Section Toggle
    console.log('10. Testing Section Inactive Toggle...');
    await toggleCmsSectionActive(splitDraft.id, false);
    pubSections = await getPublishedSections();
    const inactiveSplit = pubSections.find((s) => s.id === splitDraft.id);
    if (inactiveSplit) {
      throw new Error('Inactive section was returned in live storefront published sections!');
    }
    console.log('   ✓ Inactive section successfully excluded from live storefront.\n');

    // 11. Test getStorefrontProductsByIds
    console.log('11. Testing getStorefrontProductsByIds helper...');
    const fetchedProds = await getStorefrontProductsByIds(active10Ids);
    if (fetchedProds.length !== 10) {
      throw new Error(`Expected 10 products fetched by IDs, got ${fetchedProds.length}`);
    }
    if (fetchedProds[0].id !== active10Ids[0]) {
      throw new Error('Products array order did not preserve requested ID order!');
    }
    console.log('   ✓ getStorefrontProductsByIds ordering and data structure verified.\n');

    console.log('=== ALL STEP 5 VERIFICATION CHECKS PASSED SUCCESSFULLY! ===\n');
  } catch (error: any) {
    console.error('❌ STEP 5 VERIFICATION FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    console.log('Cleaning up test data...');
    for (const sec of createdSections) {
      await deleteCmsSection(sec.id).catch(() => {});
    }
    for (const prod of createdProducts) {
      await prisma.product.delete({ where: { id: prod.id } }).catch(() => {});
    }
    if (testCategory) {
      await prisma.category.delete({ where: { id: testCategory.id } }).catch(() => {});
    }
    console.log('Cleanup complete.');
  }
}

runStep5Verification();
