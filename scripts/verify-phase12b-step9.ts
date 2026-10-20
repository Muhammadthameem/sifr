import { prisma } from '../lib/db/prisma';
import { searchStorefrontProducts } from '../lib/catalog/search-service';

async function main() {
  console.log('=== PHASE 12B STEP 9 VERIFICATION: FULL-PAGE SEARCH RESULTS ===\n');

  const runId = Date.now();

  try {
    // 1. Setup Test Master Data
    console.log('1. Setting up test catalog for search verification...');
    const category = await prisma.category.create({
      data: {
        name: `Step 9 Apparel Category ${runId}`,
        slug: `step9-cat-${runId}`,
      },
    });

    const activeProduct = await prisma.product.create({
      data: {
        name: `Step 9 Classic White Oxford Shirt ${runId}`,
        slug: `step9-oxford-${runId}`,
        description: 'Premium tailored cotton oxford shirt',
        status: 'ACTIVE',
        gender: 'MEN',
        categoryId: category.id,
        images: {
          create: [{ url: 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10', sortOrder: 0 }],
        },
      },
    });

    const draftProduct = await prisma.product.create({
      data: {
        name: `Step 9 Draft Secret Oxford ${runId}`,
        slug: `step9-draft-${runId}`,
        status: 'DRAFT',
        gender: 'MEN',
        categoryId: category.id,
      },
    });

    const archivedProduct = await prisma.product.create({
      data: {
        name: `Step 9 Archived Old Oxford ${runId}`,
        slug: `step9-archived-${runId}`,
        status: 'ARCHIVED',
        gender: 'MEN',
        categoryId: category.id,
      },
    });

    // Create variants with costPrice
    await prisma.productVariant.create({
      data: {
        productId: activeProduct.id,
        title: 'M',
        sku: `SKU-STEP9-OXFORD-${runId}`,
        costPrice: 800.0,
        mrp: 2999.0,
        sellingPrice: 1999.0,
        isAvailable: true,
      },
    });

    await prisma.productVariant.create({
      data: {
        productId: draftProduct.id,
        title: 'M',
        sku: `SKU-STEP9-DRAFT-${runId}`,
        costPrice: 800.0,
        mrp: 2999.0,
        sellingPrice: 1999.0,
        isAvailable: true,
      },
    });

    console.log('✓ Master dataset setup completed.');

    // TEST 1: Blank Query Execution (Returns empty array cleanly)
    console.log('\n--- TEST 1: Blank Query Guard ---');
    const emptyResults = await searchStorefrontProducts('', 24);
    if (emptyResults.length !== 0) throw new Error('Blank query should return empty array []');
    console.log('✓ TEST 1 PASSED: Blank query handled cleanly');

    // TEST 2: Active Product Search Matching
    console.log('\n--- TEST 2: Active Product Search Matching ---');
    const searchResults = await searchStorefrontProducts(`Classic White Oxford Shirt ${runId}`, 24);
    if (searchResults.length !== 1) {
      throw new Error(`Expected 1 matching active product, got ${searchResults.length}`);
    }
    const matched = searchResults[0];
    if (matched.id !== activeProduct.id) throw new Error(`Matched wrong product ID: ${matched.id}`);
    if (matched.name !== activeProduct.name) throw new Error(`Matched wrong product name: ${matched.name}`);
    console.log('✓ TEST 2 PASSED: Active product matched cleanly by title query');

    // TEST 3: Exclusion of DRAFT & ARCHIVED Products
    console.log('\n--- TEST 3: Strict Exclusion of DRAFT & ARCHIVED Catalog Items ---');
    const draftResults = await searchStorefrontProducts(`Draft Secret Oxford ${runId}`, 24);
    if (draftResults.length !== 0) {
      throw new Error('DRAFT product was returned in storefront search results!');
    }

    const archivedResults = await searchStorefrontProducts(`Archived Old Oxford ${runId}`, 24);
    if (archivedResults.length !== 0) {
      throw new Error('ARCHIVED product was returned in storefront search results!');
    }
    console.log('✓ TEST 3 PASSED: DRAFT and ARCHIVED products strictly excluded');

    // TEST 4: Security Audit — Non-Exposure of costPrice
    console.log('\n--- TEST 4: Security Audit — Non-Exposure of costPrice ---');
    const resultObj: any = matched;
    if (resultObj.costPrice !== undefined) {
      throw new Error('SECURITY VIOLATION: costPrice exposed in search result payload');
    }
    console.log('✓ TEST 4 PASSED: costPrice non-exposure verified');

    // TEST 5: Price & Discount Calculation
    console.log('\n--- TEST 5: Price & Discount Calculation ---');
    if (matched.minSellingPrice !== 1999) throw new Error(`Expected minSellingPrice 1999, got ${matched.minSellingPrice}`);
    if (matched.minMrp !== 2999) throw new Error(`Expected minMrp 2999, got ${matched.minMrp}`);
    if (!matched.hasDiscount) throw new Error('Expected hasDiscount to be true');
    if (matched.maxDiscountPercent !== 33) throw new Error(`Expected discount 33%, got ${matched.maxDiscountPercent}%`);
    console.log('✓ TEST 5 PASSED: Pricing and discount calculations verified');

    // Clean up test data
    console.log('\n--- Cleaning up Step 9 Test Data ---');
    await prisma.productVariant.deleteMany({
      where: { productId: { in: [activeProduct.id, draftProduct.id, archivedProduct.id] } },
    });
    await prisma.productImage.deleteMany({
      where: { productId: { in: [activeProduct.id, draftProduct.id, archivedProduct.id] } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: [activeProduct.id, draftProduct.id, archivedProduct.id] } },
    });
    await prisma.category.delete({ where: { id: category.id } });

    console.log('===========================================================');
    console.log('  ALL PHASE 12B STEP 9 VERIFICATION TESTS PASSED! 🎉');
    console.log('===========================================================');
  } catch (err: any) {
    console.error('\n❌ STEP 9 VERIFICATION FAILURE:', err.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
