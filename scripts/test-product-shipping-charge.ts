import { prisma } from '../lib/db/prisma';
import { createProductSchema, updateProductSchema } from '../lib/validation/product';
import { calculateWhatsAppOrderShipping, getGlobalShippingCap, getStoreGlobalShippingCap } from '../lib/ordering/shipping';
import { Prisma } from '@prisma/client';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}`);
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

async function runProductShippingChargeTests() {
  console.log('================================================================');
  console.log(' SIFR — PRODUCT SHIPPING CHARGE INPUT & CALCULATION TESTS');
  console.log('================================================================\n');

  const runId = Math.floor(100000 + Math.random() * 900000).toString();

  // 1. Setup clean test category
  const category = await prisma.category.create({
    data: {
      name: `Test Cat ${runId}`,
      slug: `test-cat-${runId}`,
    },
  });

  let createdProduct50Id: string | null = null;
  let createdProduct0Id: string | null = null;

  try {
    // -------------------------------------------------------------
    // TEST 1: Create product with shippingCharge = 50
    // Expected: Product.shippingCharge = 50
    // -------------------------------------------------------------
    console.log('--- TEST 1: Create product with shippingCharge = 50 ---');
    const validProductInput1 = {
      name: `Shipping Test Shirt ${runId}`,
      slug: `shipping-test-shirt-${runId}`,
      categoryId: category.id,
      gender: 'MEN' as const,
      status: 'DRAFT' as const,
      shippingCharge: 50,
      options: [{ name: 'Size', values: ['M'] }],
      variants: [
        {
          title: 'M',
          sku: `SKU-SHIP-50-${runId}`,
          mrp: 1999,
          sellingPrice: 1999,
          isAvailable: true,
        },
      ],
      images: [],
      buttons: [],
    };

    const parsed1 = createProductSchema.parse(validProductInput1);
    assert(parsed1.shippingCharge === 50, 'Parsed shippingCharge must be 50');

    const createdProduct1 = await prisma.product.create({
      data: {
        name: parsed1.name,
        slug: parsed1.slug,
        categoryId: parsed1.categoryId,
        gender: parsed1.gender,
        status: parsed1.status,
        shippingCharge: parsed1.shippingCharge,
        variants: {
          create: parsed1.variants.map((v) => ({
            title: v.title,
            sku: v.sku,
            mrp: v.mrp,
            sellingPrice: v.sellingPrice,
            isAvailable: v.isAvailable,
          })),
        },
      },
    });
    createdProduct50Id = createdProduct1.id;

    const fetchedProduct1 = await prisma.product.findUnique({
      where: { id: createdProduct1.id },
    });
    assert(fetchedProduct1 !== null, 'Product must exist in DB');
    assert(
      Number(fetchedProduct1!.shippingCharge) === 50,
      `Expected Product.shippingCharge to be 50, got ${fetchedProduct1!.shippingCharge}`
    );
    console.log(`  ✓ TEST 1 passed: Product.shippingCharge = ${fetchedProduct1!.shippingCharge}`);

    // -------------------------------------------------------------
    // TEST 2: Create product with shippingCharge = 0
    // Expected: Allowed and saved as 0
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Create product with shippingCharge = 0 ---');
    const validProductInput2 = {
      name: `Zero Shipping Shirt ${runId}`,
      slug: `zero-shipping-shirt-${runId}`,
      categoryId: category.id,
      gender: 'BOTH' as const,
      status: 'DRAFT' as const,
      shippingCharge: 0,
      options: [{ name: 'Size', values: ['L'] }],
      variants: [
        {
          title: 'L',
          sku: `SKU-SHIP-0-${runId}`,
          mrp: 1499,
          sellingPrice: 1499,
          isAvailable: true,
        },
      ],
      images: [],
      buttons: [],
    };

    const parsed2 = createProductSchema.parse(validProductInput2);
    assert(parsed2.shippingCharge === 0, 'Parsed shippingCharge must be 0');

    const createdProduct2 = await prisma.product.create({
      data: {
        name: parsed2.name,
        slug: parsed2.slug,
        categoryId: parsed2.categoryId,
        gender: parsed2.gender,
        status: parsed2.status,
        shippingCharge: parsed2.shippingCharge,
        variants: {
          create: parsed2.variants.map((v) => ({
            title: v.title,
            sku: v.sku,
            mrp: v.mrp,
            sellingPrice: v.sellingPrice,
            isAvailable: v.isAvailable,
          })),
        },
      },
    });
    createdProduct0Id = createdProduct2.id;

    const fetchedProduct2 = await prisma.product.findUnique({
      where: { id: createdProduct2.id },
    });
    assert(fetchedProduct2 !== null, 'Product must exist in DB');
    assert(
      Number(fetchedProduct2!.shippingCharge) === 0,
      `Expected Product.shippingCharge to be 0, got ${fetchedProduct2!.shippingCharge}`
    );
    console.log(`  ✓ TEST 2 passed: Product.shippingCharge = ${fetchedProduct2!.shippingCharge}`);

    // -------------------------------------------------------------
    // TEST 2B: Omitted shippingCharge defaults to 0
    // -------------------------------------------------------------
    console.log('\n--- TEST 2B: Omitted shippingCharge defaults to 0 ---');
    const inputWithoutShipping = {
      name: `Default Shipping Shirt ${runId}`,
      slug: `default-shipping-shirt-${runId}`,
      categoryId: category.id,
      gender: 'BOTH' as const,
      status: 'DRAFT' as const,
      options: [{ name: 'Size', values: ['S'] }],
      variants: [
        {
          title: 'S',
          sku: `SKU-SHIP-DEF-${runId}`,
          mrp: 999,
          sellingPrice: 999,
          isAvailable: true,
        },
      ],
      images: [],
      buttons: [],
    };
    const parsedDefault = createProductSchema.parse(inputWithoutShipping);
    assert(parsedDefault.shippingCharge === 0, 'Omitted shippingCharge must default to 0');
    console.log('  ✓ TEST 2B passed: Omitted shippingCharge defaults to 0');

    // -------------------------------------------------------------
    // TEST 3: Attempt negative shippingCharge
    // Expected: Validation failure
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Attempt negative shippingCharge ---');
    let validationFailed = false;
    try {
      createProductSchema.parse({
        ...validProductInput1,
        slug: `neg-shipping-${runId}`,
        shippingCharge: -25,
      });
    } catch (err: any) {
      validationFailed = true;
      const issues = err.issues || err.errors || [];
      const hasExpectedMessage = issues.some((e: any) => e.message.includes('Shipping charge cannot be negative')) || err.message.includes('Shipping charge cannot be negative');
      assert(
        hasExpectedMessage,
        `Expected negative shipping error, got: ${err.message}`
      );
      console.log(`  ✓ Validation successfully rejected negative value: ${issues[0]?.message || err.message}`);
    }
    assert(validationFailed, 'Validation must fail for negative shippingCharge');
    console.log('  ✓ TEST 3 passed: Negative shipping charge is strictly rejected');

    // -------------------------------------------------------------
    // TEST 4: Edit existing product from 50 → 75
    // Expected: Product.shippingCharge = 75
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Edit existing product from 50 → 75 ---');
    const updateInput = {
      id: createdProduct1.id,
      name: parsed1.name,
      slug: parsed1.slug,
      categoryId: parsed1.categoryId,
      gender: parsed1.gender,
      status: parsed1.status,
      shippingCharge: 75,
      options: parsed1.options,
      variants: parsed1.variants,
      images: parsed1.images,
      buttons: parsed1.buttons,
    };

    const parsedUpdate = updateProductSchema.parse(updateInput);
    assert(parsedUpdate.shippingCharge === 75, 'Parsed update shippingCharge must be 75');

    const updatedProduct = await prisma.product.update({
      where: { id: createdProduct1.id },
      data: {
        shippingCharge: parsedUpdate.shippingCharge,
      },
    });

    assert(
      Number(updatedProduct.shippingCharge) === 75,
      `Expected updated Product.shippingCharge to be 75, got ${updatedProduct.shippingCharge}`
    );

    const refetchedProduct = await prisma.product.findUnique({
      where: { id: createdProduct1.id },
    });
    assert(
      Number(refetchedProduct!.shippingCharge) === 75,
      `Expected refetched Product.shippingCharge to be 75, got ${refetchedProduct!.shippingCharge}`
    );
    console.log(`  ✓ TEST 4 passed: Product.shippingCharge successfully updated to ${refetchedProduct!.shippingCharge}`);

    // -------------------------------------------------------------
    // TEST 5: Verify WhatsApp order shipping still uses:
    // Product.shippingCharge × quantity
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Verify WhatsApp order shipping calculation (Product.shippingCharge × quantity) ---');
    const product50Charge = new Prisma.Decimal('50.00');
    const shipping5 = await calculateWhatsAppOrderShipping([
      {
        shippingCharge: product50Charge,
        quantity: 2,
      },
    ]);
    assert(
      shipping5.equals(new Prisma.Decimal('100.00')),
      `Expected shipping to be 100.00 (50 * 2), got ${shipping5.toString()}`
    );
    console.log(`  ✓ TEST 5 passed: ₹50 × 2 units = ₹${shipping5.toString()}`);

    // -------------------------------------------------------------
    // TEST 6: Verify global shipping cap still applies
    // Example: Raw shipping exceeds cap -> capped at store globalShippingCap
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Verify global shipping cap still applies ---');
    const storeCap = await getStoreGlobalShippingCap();
    console.log(`  Active Store Global Shipping Cap: ₹${storeCap.toString()}`);

    // Create item where raw shipping exceeds storeCap (storeCap + 100)
    const rawAboveCap = storeCap.plus(new Prisma.Decimal('100.00'));
    const itemChargeAboveCap = rawAboveCap.dividedBy(2);
    const shippingAboveCap = await calculateWhatsAppOrderShipping([
      {
        shippingCharge: itemChargeAboveCap,
        quantity: 2,
      },
    ]);
    assert(
      shippingAboveCap.equals(storeCap),
      `Expected shipping to be capped at ${storeCap.toString()}, got ${shippingAboveCap.toString()}`
    );
    console.log(`  ✓ TEST 6 passed: Raw ₹${rawAboveCap.toString()} capped at store global cap ₹${shippingAboveCap.toString()}`);

    // Also verify when raw shipping is below storeCap
    const rawBelowCap = storeCap.minus(new Prisma.Decimal('100.00'));
    const itemChargeBelowCap = rawBelowCap.dividedBy(2);
    const shippingBelowCap = await calculateWhatsAppOrderShipping([
      {
        shippingCharge: itemChargeBelowCap,
        quantity: 2,
      },
    ]);
    assert(
      shippingBelowCap.equals(rawBelowCap),
      `Expected shipping to equal raw amount ${rawBelowCap.toString()}, got ${shippingBelowCap.toString()}`
    );
    console.log(`  ✓ TEST 6 passed: Raw ₹${rawBelowCap.toString()} (below cap) retains ₹${shippingBelowCap.toString()}`);

    // -------------------------------------------------------------
    // TEST 7: Verify multiple products
    // Product A = ₹50 × 2
    // Product B = ₹75 × 1
    // Expected raw shipping = ₹175
    // With cap ₹200: Expected final shipping = ₹175
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Verify multiple products calculation ---');
    const productACharge = new Prisma.Decimal('50.00');
    const productBCharge = new Prisma.Decimal('75.00');
    const shipping7 = await calculateWhatsAppOrderShipping([
      {
        shippingCharge: productACharge,
        quantity: 2, // 100
      },
      {
        shippingCharge: productBCharge,
        quantity: 1, // 75
      },
    ]);
    assert(
      shipping7.equals(new Prisma.Decimal('175.00')),
      `Expected final shipping to be 175.00 (100 + 75), got ${shipping7.toString()}`
    );
    console.log(`  ✓ TEST 7 passed: Product A (₹50 × 2) + Product B (₹75 × 1) = ₹${shipping7.toString()}`);

    console.log('\n================================================================');
    console.log('🎉 ALL 7/7 PRODUCT SHIPPING CHARGE TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    // Clean up test products and category to maintain clean baseline
    console.log('\n--- Cleaning up test fixtures ---');
    if (createdProduct50Id) {
      await prisma.productVariant.deleteMany({ where: { productId: createdProduct50Id } });
      await prisma.product.delete({ where: { id: createdProduct50Id } });
    }
    if (createdProduct0Id) {
      await prisma.productVariant.deleteMany({ where: { productId: createdProduct0Id } });
      await prisma.product.delete({ where: { id: createdProduct0Id } });
    }
    await prisma.category.delete({ where: { id: category.id } });
    console.log('✓ Test fixtures cleaned up successfully.');
  }
}

runProductShippingChargeTests()
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
