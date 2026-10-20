import { prisma } from '../lib/db/prisma';
import { searchStorefrontProducts } from '../lib/catalog/search-service';
import { searchSuggestionsAction } from '../lib/actions/product-actions';

async function runStep3Verification() {
  console.log('===========================================================');
  console.log('  SIFR PHASE 12B — STEP 3: SEARCH SERVICE VERIFICATION TEST');
  console.log('===========================================================');

  // 1. Setup Master Data
  console.log('\n--- 1. Setting up Search Master Data ---');

  let categoryApparel = await prisma.category.findFirst({ where: { slug: 'apparel-search-test' } });
  if (!categoryApparel) {
    categoryApparel = await prisma.category.create({
      data: {
        name: 'Apparel Test Category',
        slug: 'apparel-search-test',
      },
    });
  }

  // Create ACTIVE Product 1
  const prod1 = await prisma.product.create({
    data: {
      name: 'Oversized Vintage Cotton Tee',
      slug: `oversized-vintage-tee-${Date.now()}`,
      description: 'Heavyweight premium organic cotton T-shirt.',
      gender: 'MEN',
      status: 'ACTIVE',
      categoryId: categoryApparel.id,
      images: {
        create: [
          { url: '/uploads/products/tee-front.jpg', sortOrder: 0 },
          { url: '/uploads/products/tee-back.jpg', sortOrder: 1 },
        ],
      },
      variants: {
        create: [
          {
            title: 'M',
            sku: `SKU-TEE-VINTAGE-M-${Date.now()}`,
            mrp: 2999,
            sellingPrice: 1999,
            isAvailable: true,
          },
        ],
      },
    },
  });

  // Create ACTIVE Product 2
  const prod2 = await prisma.product.create({
    data: {
      name: 'Minimalist Linen Trousers',
      slug: `minimalist-linen-trousers-${Date.now()}`,
      description: 'Tailored breathable linen trousers.',
      gender: 'BOTH',
      status: 'ACTIVE',
      categoryId: categoryApparel.id,
      images: {
        create: [{ url: '/uploads/products/trouser.jpg', sortOrder: 0 }],
      },
      variants: {
        create: [
          {
            title: '32',
            sku: `SKU-TROUSER-LINEN-32-${Date.now()}`,
            mrp: 3999,
            sellingPrice: 3999,
            isAvailable: true,
          },
        ],
      },
    },
  });

  // Create DRAFT Product (Should NEVER be returned in search)
  const draftProd = await prisma.product.create({
    data: {
      name: 'Oversized Secret Hoodie',
      slug: `oversized-secret-hoodie-${Date.now()}`,
      description: 'Draft unreleased hoodie.',
      gender: 'BOTH',
      status: 'DRAFT',
      categoryId: categoryApparel.id,
      variants: {
        create: [
          {
            title: 'L',
            sku: `SKU-HOODIE-DRAFT-${Date.now()}`,
            mrp: 4999,
            sellingPrice: 4999,
            isAvailable: true,
          },
        ],
      },
    },
  });

  // Create ARCHIVED Product (Should NEVER be returned in search)
  const archivedProd = await prisma.product.create({
    data: {
      name: 'Oversized Old Collection Jacket',
      slug: `oversized-old-jacket-${Date.now()}`,
      description: 'Archived legacy jacket.',
      gender: 'BOTH',
      status: 'ARCHIVED',
      categoryId: categoryApparel.id,
      variants: {
        create: [
          {
            title: 'L',
            sku: `SKU-JACKET-ARCHIVED-${Date.now()}`,
            mrp: 5999,
            sellingPrice: 5999,
            isAvailable: true,
          },
        ],
      },
    },
  });

  console.log(`✓ Created ACTIVE Product 1: ${prod1.name}`);
  console.log(`✓ Created ACTIVE Product 2: ${prod2.name}`);
  console.log(`✓ Created DRAFT Product: ${draftProd.name}`);
  console.log(`✓ Created ARCHIVED Product: ${archivedProd.name}`);

  // TEST 1: Case-Insensitive Product Name Matching
  console.log('\n--- TEST 1: Case-Insensitive Product Name Matching ---');
  const resultsName = await searchStorefrontProducts('oversized');
  const foundProd1 = resultsName.find((r) => r.id === prod1.id);
  const foundDraft = resultsName.find((r) => r.id === draftProd.id);
  const foundArchived = resultsName.find((r) => r.id === archivedProd.id);

  if (!foundProd1) {
    throw new Error('TEST 1 FAILED: Could not find active product matching "oversized"');
  }
  if (foundDraft || foundArchived) {
    throw new Error('TEST 1 FAILED: DRAFT or ARCHIVED products were returned in search!');
  }
  console.log('✓ TEST 1 PASSED: Found active product "Oversized Vintage Cotton Tee"; draft/archived excluded');

  // TEST 2: Category Name Matching
  console.log('\n--- TEST 2: Category Name Matching ---');
  const resultsCategory = await searchStorefrontProducts('Apparel Test');
  if (resultsCategory.length < 2) {
    throw new Error(`TEST 2 FAILED: Expected at least 2 active products for category search, got ${resultsCategory.length}`);
  }
  console.log(`✓ TEST 2 PASSED: Category search "Apparel Test" returned ${resultsCategory.length} active products`);

  // TEST 3: Variant SKU Matching
  console.log('\n--- TEST 3: Variant SKU Matching ---');
  const resultsSku = await searchStorefrontProducts('SKU-TROUSER-LINEN');
  if (resultsSku.length !== 1 || resultsSku[0].id !== prod2.id) {
    throw new Error('TEST 3 FAILED: Variant SKU matching failed');
  }
  console.log('✓ TEST 3 PASSED: SKU search "SKU-TROUSER-LINEN" returned exact matching product');

  // TEST 4: DRAFT & ARCHIVED Exclusion Verification
  console.log('\n--- TEST 4: DRAFT & ARCHIVED Exclusion Verification ---');
  const draftSearch = await searchStorefrontProducts('Secret Hoodie');
  const archivedSearch = await searchStorefrontProducts('Old Collection Jacket');

  if (draftSearch.length !== 0 || archivedSearch.length !== 0) {
    throw new Error('TEST 4 FAILED: Search leaked DRAFT or ARCHIVED products!');
  }
  console.log('✓ TEST 4 PASSED: Direct search for DRAFT/ARCHIVED titles returned 0 results');

  // TEST 5: Empty Query Guard
  console.log('\n--- TEST 5: Empty Query Guard ---');
  const emptyResults = await searchStorefrontProducts('   ');
  if (emptyResults.length !== 0) {
    throw new Error('TEST 5 FAILED: Empty query returned non-empty results');
  }
  console.log('✓ TEST 5 PASSED: Empty query returned [] cleanly');

  // TEST 6: Result Limit Enforcement
  console.log('\n--- TEST 6: Result Limit Enforcement ---');
  const limitedResults = await searchStorefrontProducts('Apparel Test', 1);
  if (limitedResults.length !== 1) {
    throw new Error(`TEST 6 FAILED: Expected max 1 result, got ${limitedResults.length}`);
  }
  console.log('✓ TEST 6 PASSED: Limit parameter enforced (take: 1)');

  // TEST 7: Result Data Structure & Discount Calculations
  console.log('\n--- TEST 7: Result Data Structure & Discount Calculations ---');
  const item = resultsName.find((r) => r.id === prod1.id)!;
  if (
    !item.primaryImage ||
    !item.secondaryImage ||
    item.minSellingPrice !== 1999 ||
    item.minMrp !== 2999 ||
    !item.hasDiscount ||
    item.maxDiscountPercent !== 33
  ) {
    throw new Error('TEST 7 FAILED: Result data structure or discount calculations invalid');
  }
  console.log(`✓ TEST 7 PASSED: Price range (₹1,999 / ₹2,999 MRP) and discount (-33%) verified`);

  // TEST 8: Server Action Wrapper Verification
  console.log('\n--- TEST 8: Server Action Wrapper Verification ---');
  const actionRes = await searchSuggestionsAction('Linen', 5);
  if (!actionRes.success || actionRes.results.length === 0) {
    throw new Error('TEST 8 FAILED: searchSuggestionsAction failed');
  }
  console.log('✓ TEST 8 PASSED: searchSuggestionsAction returned success with matching results');

  // Cleanup Test Data
  console.log('\n--- Cleaning up Search Test Data ---');
  await prisma.product.delete({ where: { id: prod1.id } });
  await prisma.product.delete({ where: { id: prod2.id } });
  await prisma.product.delete({ where: { id: draftProd.id } });
  await prisma.product.delete({ where: { id: archivedProd.id } });

  console.log('===========================================================');
  console.log('  ALL PHASE 12B STEP 3 VERIFICATION TESTS PASSED! 🎉');
  console.log('===========================================================');
}

runStep3Verification().catch((e) => {
  console.error('STEP 3 VERIFICATION FAILED:', e);
  process.exit(1);
});
