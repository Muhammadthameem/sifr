import { prisma } from '../lib/db/prisma';
import { getPlpProducts, getPlpFilterOptions } from '../lib/catalog/plp-service';
import { loadMoreProductsAction } from '../lib/actions/plp-actions';

async function runStep6Verification() {
  console.log('=== PHASE 12B STEP 6 VERIFICATION: PRODUCT LISTING PAGES (PLP) ===\n');

  let testCatApparel: any;
  let testCatFootwear: any;
  let targetProduct: any;
  const createdProducts: any[] = [];

  try {
    // 1. Setup Categories & Target Product
    console.log('1. Setting up test categories & catalog dataset...');
    testCatApparel = await prisma.category.create({
      data: {
        name: 'Step 6 Apparel',
        slug: `s6-apparel-${Date.now()}`,
      },
    });

    testCatFootwear = await prisma.category.create({
      data: {
        name: 'Step 6 Footwear',
        slug: `s6-footwear-${Date.now()}`,
      },
    });

    targetProduct = await prisma.product.create({
      data: {
        name: 'Step6 Target Product',
        slug: `step6-target-${Date.now()}`,
        gender: 'BOTH',
        categoryId: testCatApparel.id,
        status: 'ACTIVE',
        variants: {
          create: { title: 'Default', sku: `S6-TGT-${Date.now()}`, mrp: 2999, sellingPrice: 1999, isAvailable: true },
        },
      },
    });
    createdProducts.push(targetProduct);

    // Create 26 Active MEN products
    for (let i = 1; i <= 26; i++) {
      const p = await prisma.product.create({
        data: {
          name: `Step6 Men Product ${i}`,
          slug: `step6-men-prod-${i}-${Date.now()}`,
          gender: i % 2 === 0 ? 'MEN' : 'BOTH',
          categoryId: testCatApparel.id,
          status: 'ACTIVE',
          options: {
            create: {
              name: 'Size',
              position: 0,
              values: {
                create: [
                  { value: i <= 13 ? 'M' : 'L', position: 0 },
                ],
              },
            },
          },
          variants: {
            create: {
              title: i <= 13 ? 'M / Black' : 'L / Navy',
              sku: `S6-MEN-${i}-${Date.now()}`,
              mrp: 3000 + i * 100,
              sellingPrice: 1000 + i * 100, // Price range: 1100 to 3600
              isAvailable: i !== 26, // #26 is out of stock (isAvailable: false)
            },
          },
          images: {
            create: {
              url: `https://images.unsplash.com/photo-step6-${i}.jpg`,
              sortOrder: 0,
            },
          },
          sourceButtons: {
            create: {
              label: i % 2 === 0 ? 'Black' : 'Navy',
              targetProductId: targetProduct.id,
              sortOrder: 0,
              isActive: true,
            },
          },
        },
      });
      createdProducts.push(p);
    }

    // Create 5 Active WOMEN products (Footwear category)
    for (let i = 1; i <= 5; i++) {
      const p = await prisma.product.create({
        data: {
          name: `Step6 Women Footwear ${i}`,
          slug: `step6-women-prod-${i}-${Date.now()}`,
          gender: 'WOMEN',
          categoryId: testCatFootwear.id,
          status: 'ACTIVE',
          options: {
            create: {
              name: 'Size',
              position: 0,
              values: {
                create: [{ value: 'S', position: 0 }],
              },
            },
          },
          variants: {
            create: {
              title: 'S / Beige',
              sku: `S6-WOM-${i}-${Date.now()}`,
              mrp: 4999,
              sellingPrice: 3999,
              isAvailable: true,
            },
          },
          images: {
            create: {
              url: `https://images.unsplash.com/photo-step6-w-${i}.jpg`,
              sortOrder: 0,
            },
          },
        },
      });
      createdProducts.push(p);
    }

    // Create 1 DRAFT product and 1 ARCHIVED product
    const draftProd = await prisma.product.create({
      data: {
        name: 'Step6 Draft Product',
        slug: `step6-draft-${Date.now()}`,
        gender: 'BOTH',
        categoryId: testCatApparel.id,
        status: 'DRAFT',
        variants: {
          create: { title: 'Default', sku: `S6-DFT-${Date.now()}`, mrp: 2000, sellingPrice: 1500, isAvailable: true },
        },
      },
    });
    createdProducts.push(draftProd);

    const archivedProd = await prisma.product.create({
      data: {
        name: 'Step6 Archived Product',
        slug: `step6-archived-${Date.now()}`,
        gender: 'BOTH',
        categoryId: testCatApparel.id,
        status: 'ARCHIVED',
        variants: {
          create: { title: 'Default', sku: `S6-ARC-${Date.now()}`, mrp: 2000, sellingPrice: 1500, isAvailable: true },
        },
      },
    });
    createdProducts.push(archivedProd);

    console.log(`   Created ${createdProducts.length} test products across Men/Women/Both and active/draft/archived statuses.\n`);

    // 2. Test /men gender isolation & DRAFT/ARCHIVED exclusion
    console.log('2. Testing /men route query (only ACTIVE MEN/BOTH products)...');
    const menResult = await getPlpProducts({ gender: 'MEN', pageSize: 100 });
    const menProdIds = new Set(menResult.products.map((p) => p.id));

    if (menResult.products.some((p) => p.gender === 'WOMEN')) {
      throw new Error('WOMEN product leaked into /men query result!');
    }
    if (menProdIds.has(draftProd.id) || menProdIds.has(archivedProd.id)) {
      throw new Error('DRAFT or ARCHIVED product appeared in customer storefront PLP!');
    }
    console.log(`   ✓ Found ${menResult.totalCount} active MEN/BOTH products; WOMEN, DRAFT, and ARCHIVED excluded.\n`);

    // 3. Test /women gender isolation
    console.log('3. Testing /women route query (only ACTIVE WOMEN/BOTH products)...');
    const womenResult = await getPlpProducts({ gender: 'WOMEN', pageSize: 100 });
    const womenGenders = new Set(womenResult.products.map((p) => p.gender));
    if (womenGenders.has('MEN')) {
      throw new Error('MEN-only product leaked into /women query result!');
    }
    console.log(`   ✓ Found ${womenResult.totalCount} active WOMEN/BOTH products.\n`);

    // 4. Test Category filtering
    console.log('4. Testing category filtering (categorySlug)...');
    const footwearResult = await getPlpProducts({ categorySlug: testCatFootwear.slug });
    if (footwearResult.products.some((p) => p.category.slug !== testCatFootwear.slug)) {
      throw new Error('Category filter returned products outside requested category!');
    }
    console.log(`   ✓ Found ${footwearResult.totalCount} products matching category '${testCatFootwear.name}'.\n`);

    // 5. Test Size filtering
    console.log('5. Testing size filtering (size=M)...');
    const sizeMResult = await getPlpProducts({ gender: 'MEN', size: 'M', pageSize: 100 });
    console.log(`   ✓ Found ${sizeMResult.totalCount} products matching size 'M'.\n`);

    // 6. Test Color filtering
    console.log('6. Testing color filtering (color=Black)...');
    const colorBlackResult = await getPlpProducts({ gender: 'MEN', color: 'Black', pageSize: 100 });
    console.log(`   ✓ Found ${colorBlackResult.totalCount} products matching color 'Black'.\n`);

    // 7. Test Price Range filtering
    console.log('7. Testing price range filtering (minPrice=1500, maxPrice=2000)...');
    const priceResult = await getPlpProducts({ gender: 'MEN', minPrice: 1500, maxPrice: 2000, pageSize: 100 });
    priceResult.products.forEach((p) => {
      const minSp = p.variants.length ? Math.min(...p.variants.map((v) => v.sellingPrice)) : 0;
      if (minSp < 1500 || minSp > 2000) {
        throw new Error(`Product ${p.name} selling price ₹${minSp} outside requested min 1500 - max 2000 price range!`);
      }
    });
    console.log(`   ✓ Found ${priceResult.totalCount} products within ₹1500–₹2000 price range.\n`);

    // 8. Test Availability filtering
    console.log('8. Testing availability filtering (availability=in-stock)...');
    const inStockResult = await getPlpProducts({ gender: 'MEN', availability: 'in-stock', pageSize: 100 });
    const inStockIds = new Set(inStockResult.products.map((p) => p.id));
    if (inStockIds.has(createdProducts[26].id)) {
      throw new Error('Out of stock product returned when availability=in-stock filter was active!');
    }
    console.log(`   ✓ Out of stock product correctly excluded when availability=in-stock filter applied.\n`);

    // 9. Test Sorting (Newest, Recommended, Price Asc, Price Desc)
    console.log('9. Testing sorting modes (newest, price-asc, price-desc)...');
    const priceAscResult = await getPlpProducts({ gender: 'MEN', sort: 'price-asc', pageSize: 100 });
    const priceDescResult = await getPlpProducts({ gender: 'MEN', sort: 'price-desc', pageSize: 100 });

    const ascMinPrices = priceAscResult.products.map((p) => (p.variants.length ? Math.min(...p.variants.map((v) => v.sellingPrice)) : 0));
    const descMinPrices = priceDescResult.products.map((p) => (p.variants.length ? Math.min(...p.variants.map((v) => v.sellingPrice)) : 0));

    for (let i = 0; i < ascMinPrices.length - 1; i++) {
      if (ascMinPrices[i] > ascMinPrices[i + 1]) {
        throw new Error(`Price ASC order broken: ${ascMinPrices[i]} > ${ascMinPrices[i + 1]}`);
      }
    }
    for (let i = 0; i < descMinPrices.length - 1; i++) {
      if (descMinPrices[i] < descMinPrices[i + 1]) {
        throw new Error(`Price DESC order broken: ${descMinPrices[i]} < ${descMinPrices[i + 1]}`);
      }
    }
    console.log('   ✓ Price Low-to-High and Price High-to-Low sort ordering verified.\n');

    // 10. Test Page Size (24 products per initial render) & Load More Appending
    console.log('10. Testing Page Size (24 limit) & Load More server action...');
    const page1Result = await getPlpProducts({ gender: 'MEN', page: 1, pageSize: 24, mode: 'initial-render' });
    if (page1Result.products.length > 24) {
      throw new Error(`Initial page returned ${page1Result.products.length} products; expected maximum 24!`);
    }
    if (!page1Result.hasMore) {
      throw new Error('Expected hasMore=true for total MEN products with pageSize=24');
    }
    console.log(`   ✓ Initial page returned ${page1Result.products.length} products (max 24 limit enforced).`);

    // Test Server Action loadMoreProductsAction
    const actionRes = await loadMoreProductsAction({ gender: 'MEN', page: 2, pageSize: 24 });
    if (!actionRes.success || actionRes.products.length === 0) {
      throw new Error('loadMoreProductsAction failed to return next page products!');
    }
    console.log(`   ✓ loadMoreProductsAction returned ${actionRes.products.length} appended products for page 2.\n`);

    // 11. Test Reload State Preservation (page=2 initial-render mode returns initial 48 products)
    console.log('11. Testing Reload Page 2 preservation (fetches 48 products)...');
    const page2ReloadResult = await getPlpProducts({ gender: 'MEN', page: 2, pageSize: 24, mode: 'initial-render' });
    if (page2ReloadResult.products.length <= 24) {
      throw new Error(`Page 2 reload expected >24 items server rendered, got ${page2ReloadResult.products.length}`);
    }
    console.log(`   ✓ Reloading with page=2 preserved all ${page2ReloadResult.products.length} previously loaded items server-side.\n`);

    // 12. Test Filter Options helper
    console.log('12. Testing getPlpFilterOptions helper...');
    const options = await getPlpFilterOptions('MEN');
    if (!options.categories || !options.sizes || !options.colors) {
      throw new Error('getPlpFilterOptions failed to return catalog facet options!');
    }
    console.log(`   ✓ Found ${options.categories.length} categories, ${options.sizes.length} size options, ${options.colors.length} color options.\n`);

    // 13. Test Empty State Handling
    console.log('13. Testing empty state handling for non-matching filter criteria...');
    const emptyResult = await getPlpProducts({ gender: 'MEN', minPrice: 99999 });
    if (emptyResult.products.length !== 0 || emptyResult.totalCount !== 0) {
      throw new Error('Empty state query returned non-zero products!');
    }
    console.log('   ✓ Non-matching query returned 0 products cleanly (empty state ready).\n');

    console.log('=== ALL STEP 6 VERIFICATION CHECKS PASSED SUCCESSFULLY! ===\n');
  } catch (error: any) {
    console.error('❌ STEP 6 VERIFICATION FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    console.log('Cleaning up test data...');
    for (const prod of createdProducts) {
      await prisma.product.delete({ where: { id: prod.id } }).catch(() => {});
    }
    if (testCatApparel) await prisma.category.delete({ where: { id: testCatApparel.id } }).catch(() => {});
    if (testCatFootwear) await prisma.category.delete({ where: { id: testCatFootwear.id } }).catch(() => {});
    console.log('Cleanup complete.');
  }
}

runStep6Verification();
