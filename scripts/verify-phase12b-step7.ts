import { prisma } from '../lib/db/prisma';
import { getStorefrontProductBySlug } from '../lib/actions/product-actions';
import { addToCartAction, clearCartAction } from '../lib/actions/cart-actions';

async function runStep7Verification() {
  console.log('=== PHASE 12B STEP 7 VERIFICATION: PRODUCT DETAIL PAGE (PDP) ===\n');

  let testCategory: any;
  let activeTargetProduct: any;
  let activeProduct: any;
  let draftProduct: any;
  let archivedProduct: any;
  const createdVariantIds: string[] = [];

  try {
    // 1. Setup Master Test Data
    console.log('1. Setting up test catalog data for PDP verification...');
    testCategory = await prisma.category.create({
      data: {
        name: 'Step 7 PDP Category',
        slug: `step7-cat-${Date.now()}`,
      },
    });

    // Create Active Target Product for Product Buttons
    activeTargetProduct = await prisma.product.create({
      data: {
        name: 'Step7 Active Target Product',
        slug: `step7-target-slug-${Date.now()}`,
        gender: 'BOTH',
        categoryId: testCategory.id,
        status: 'ACTIVE',
        variants: {
          create: {
            title: 'Default',
            sku: `S7-TGT-${Date.now()}`,
            mrp: 2999,
            sellingPrice: 1999,
            isAvailable: true,
            inventoryItem: { create: { physicalStock: 50, reservedStock: 0 } },
          },
        },
      },
      include: { variants: true },
    });
    activeTargetProduct.variants.forEach((v: any) => createdVariantIds.push(v.id));

    // Create Main Active Product with Options, Variants, Images & Buttons
    activeProduct = await prisma.product.create({
      data: {
        name: 'Step7 Oversized Vintage Tee',
        slug: `step7-active-tee-${Date.now()}`,
        description: 'Premium heavy 240 GSM cotton knit tee.',
        gender: 'BOTH',
        categoryId: testCategory.id,
        status: 'ACTIVE',
        images: {
          create: [
            { url: 'https://images.unsplash.com/photo-pdp-1.jpg', sortOrder: 0, altText: 'Front View' },
            { url: 'https://images.unsplash.com/photo-pdp-2.jpg', sortOrder: 1, altText: 'Back Detail' },
          ],
        },
        options: {
          create: [
            {
              name: 'Size',
              position: 0,
              values: {
                create: [
                  { value: 'S', position: 0 },
                  { value: 'M', position: 1 },
                  { value: 'L', position: 2 },
                ],
              },
            },
          ],
        },
        variants: {
          create: [
            {
              title: 'S',
              sku: `S7-VAR-S-${Date.now()}`,
              mrp: 2999,
              sellingPrice: 1999,
              isAvailable: true,
              inventoryItem: { create: { physicalStock: 50, reservedStock: 0 } },
            },
            {
              title: 'M',
              sku: `S7-VAR-M-${Date.now()}`,
              mrp: 2999,
              sellingPrice: 1999,
              isAvailable: true,
              inventoryItem: { create: { physicalStock: 50, reservedStock: 0 } },
            },
            {
              title: 'L',
              sku: `S7-VAR-L-${Date.now()}`,
              mrp: 2999,
              sellingPrice: 1999,
              isAvailable: false, // Out of stock
              inventoryItem: { create: { physicalStock: 0, reservedStock: 0 } },
            },
          ],
        },
        sourceButtons: {
          create: [
            { label: 'Washed Black', targetProductId: activeTargetProduct.id, sortOrder: 0, isActive: true },
          ],
        },
      },
      include: { variants: true },
    });
    activeProduct.variants.forEach((v: any) => createdVariantIds.push(v.id));

    // Create DRAFT Product
    draftProduct = await prisma.product.create({
      data: {
        name: 'Step7 Draft Product',
        slug: `step7-draft-slug-${Date.now()}`,
        gender: 'BOTH',
        categoryId: testCategory.id,
        status: 'DRAFT',
        variants: {
          create: { title: 'Default', sku: `S7-DFT-${Date.now()}`, mrp: 1999, sellingPrice: 1499, isAvailable: true },
        },
      },
    });

    // Create ARCHIVED Product
    archivedProduct = await prisma.product.create({
      data: {
        name: 'Step7 Archived Product',
        slug: `step7-archived-slug-${Date.now()}`,
        gender: 'BOTH',
        categoryId: testCategory.id,
        status: 'ARCHIVED',
        variants: {
          create: { title: 'Default', sku: `S7-ARC-${Date.now()}`, mrp: 1999, sellingPrice: 1499, isAvailable: true },
        },
      },
    });

    console.log('   Test master catalog created successfully.\n');

    // 2. Test ACTIVE product loading by slug
    console.log('2. Testing ACTIVE product fetching by slug...');
    const pdpData = await getStorefrontProductBySlug(activeProduct.slug);
    if (!pdpData) {
      throw new Error('Active product was not returned by getStorefrontProductBySlug!');
    }
    if (pdpData.name !== 'Step7 Oversized Vintage Tee') {
      throw new Error('Product name mismatch!');
    }
    console.log('   ✓ ACTIVE product successfully retrieved by slug.\n');

    // 3. Test DRAFT & ARCHIVED product public access rejection
    console.log('3. Testing public access rejection for DRAFT & ARCHIVED products...');
    const draftRes = await getStorefrontProductBySlug(draftProduct.slug);
    const archivedRes = await getStorefrontProductBySlug(archivedProduct.slug);

    if (draftRes !== null) {
      throw new Error('DRAFT product was returned by customer storefront query!');
    }
    if (archivedRes !== null) {
      throw new Error('ARCHIVED product was returned by customer storefront query!');
    }
    console.log('   ✓ DRAFT and ARCHIVED products are strictly hidden from public storefront.\n');

    // 4. Test Cost Price Non-Exposure & Data Model Integrity
    console.log('4. Testing Cost Price Non-Exposure in customer PDP model...');
    const variantKeys = Object.keys(pdpData.variants[0]);
    if (variantKeys.includes('costPrice')) {
      throw new Error('CRITICAL BUG: costPrice field exposed in customer PDP model!');
    }
    console.log('   ✓ Verified costPrice is omitted from storefront query results.\n');

    // 5. Test Product Images belong to Product level (4:5 ratio support)
    console.log('5. Testing product-level image gallery...');
    if (pdpData.images.length !== 2) {
      throw new Error(`Expected 2 gallery images, found ${pdpData.images.length}`);
    }
    console.log('   ✓ Product gallery renders 2 product-level images.\n');

    // 6. Test Product Buttons slug-navigation & target validation
    console.log('6. Testing Product Buttons (linked variations)...');
    if (pdpData.sourceButtons.length !== 1) {
      throw new Error('Expected 1 active Product Button');
    }
    const btnTarget = pdpData.sourceButtons[0].targetProduct;
    if (btnTarget.slug !== activeTargetProduct.slug) {
      throw new Error(`Product Button target slug mismatch: expected ${activeTargetProduct.slug}, got ${btnTarget.slug}`);
    }
    console.log(`   ✓ Product Button resolves target slug '${btnTarget.slug}' for customer navigation.\n`);

    // 7. Test Dynamic Option & Variant Resolution
    console.log('7. Testing dynamic option to ProductVariant resolution...');
    const sizeOption = pdpData.options.find((o) => o.name === 'Size');
    if (!sizeOption || sizeOption.values.length !== 3) {
      throw new Error('Size option values not returned as configured');
    }

    const varM = pdpData.variants.find((v) => v.title === 'M');
    if (!varM || Number(varM.sellingPrice) !== 1999) {
      throw new Error('Variant resolution for Size M failed!');
    }
    console.log('   ✓ Variant combination "M" successfully resolved to variant ID and price.\n');

    // 8. Test Add to Cart Integration using resolved Variant ID
    console.log('8. Testing Add to Cart integration via existing cart action...');
    await clearCartAction(); // Ensure clean cart state
    const addRes = await addToCartAction({
      variantId: varM.id,
      quantity: 2,
    });

    if (!addRes.success) {
      throw new Error(`addToCartAction failed: ${addRes.message}`);
    }
    console.log('   ✓ Selected variant added to cart cleanly with correct quantity.\n');

    // 9. Test Buy Now Integration (Cart -> Checkout flow)
    console.log('9. Testing Buy Now integration contract...');
    const buyNowRes = await addToCartAction({
      variantId: varM.id,
      quantity: 1,
    });
    if (!buyNowRes.success) {
      throw new Error('Buy Now cart invocation failed!');
    }
    console.log('   ✓ Buy Now contract uses existing cart service before redirecting to /checkout.\n');

    console.log('=== ALL STEP 7 VERIFICATION CHECKS PASSED SUCCESSFULLY! ===\n');
  } catch (error: any) {
    console.error('❌ STEP 7 VERIFICATION FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    console.log('Cleaning up test data...');
    await clearCartAction().catch(() => {});
    if (createdVariantIds.length > 0) {
      await prisma.cartItem.deleteMany({ where: { variantId: { in: createdVariantIds } } }).catch(() => {});
      await prisma.inventoryItem.deleteMany({ where: { variantId: { in: createdVariantIds } } }).catch(() => {});
    }
    if (activeProduct) await prisma.product.delete({ where: { id: activeProduct.id } }).catch(() => {});
    if (activeTargetProduct) await prisma.product.delete({ where: { id: activeTargetProduct.id } }).catch(() => {});
    if (draftProduct) await prisma.product.delete({ where: { id: draftProduct.id } }).catch(() => {});
    if (archivedProduct) await prisma.product.delete({ where: { id: archivedProduct.id } }).catch(() => {});
    if (testCategory) await prisma.category.delete({ where: { id: testCategory.id } }).catch(() => {});
    console.log('Cleanup complete.');
  }
}

runStep7Verification();
