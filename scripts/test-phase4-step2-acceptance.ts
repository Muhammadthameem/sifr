import { prisma } from '../lib/db/prisma';
import {
  getWhatsAppProductOrderDetails,
  getWhatsAppCartOrderDetails,
  calculateWhatsAppShippingAction,
  previewWhatsAppCouponAction,
} from '../lib/actions/whatsapp-order-actions';
import { INDIAN_STATES_AND_UTS, isValidIndianState } from '../lib/constants/states';
import { whatsappCustomerSchema } from '../lib/validation/ordering';
import assert from 'assert';

async function runPhase4Step2AcceptanceTests() {
  console.log('================================================================');
  console.log('PHASE 4 — STEP 2 ACCEPTANCE TESTS');
  console.log('DEDICATED WHATSAPP ORDER PAGE & CUSTOMER DETAILS FORM');
  console.log('================================================================\n');

  // Snapshot initial DB state to verify ZERO side effects
  const initialOrderCount = await prisma.order.count();
  const initialInventorySnap = await prisma.inventoryItem.findMany({
    select: { id: true, physicalStock: true, reservedStock: true },
  });

  // ----------------------------------------------------------------
  // Section 1: Standardized Indian States & UTs (36 total)
  // ----------------------------------------------------------------
  console.log('--- Section 1: Indian States & UTs (Searchable Dropdown Source) ---');
  assert.strictEqual(INDIAN_STATES_AND_UTS.length, 36, 'Must contain exactly 36 States and Union Territories');
  assert.ok(INDIAN_STATES_AND_UTS.includes('Delhi'), 'Includes Delhi');
  assert.ok(INDIAN_STATES_AND_UTS.includes('Kerala'), 'Includes Kerala');
  assert.ok(INDIAN_STATES_AND_UTS.includes('Maharashtra'), 'Includes Maharashtra');
  assert.ok(INDIAN_STATES_AND_UTS.includes('Uttar Pradesh'), 'Includes Uttar Pradesh');
  assert.ok(INDIAN_STATES_AND_UTS.includes('Jammu and Kashmir'), 'Includes Jammu and Kashmir');
  assert.ok(isValidIndianState('Karnataka'), 'isValidIndianState returns true for Karnataka');
  assert.ok(!isValidIndianState('California'), 'isValidIndianState returns false for non-Indian state');
  assert.ok(!isValidIndianState(''), 'isValidIndianState returns false for empty string');
  console.log('  ✓ 36 Indian States and UTs verified with strict validation helper\n');

  // ----------------------------------------------------------------
  // Section 2: Product Mode Data Fetching & Authoritative Pricing
  // ----------------------------------------------------------------
  console.log('--- Section 2: Product Mode Server-Side Authoritative Resolution ---');

  // Find a test product with active variants
  const activeProduct = await prisma.product.findFirst({
    where: { status: 'ACTIVE', variants: { some: { isAvailable: true } } },
    include: {
      variants: { where: { isAvailable: true }, take: 1, include: { inventoryItem: true } },
    },
  });

  assert.ok(activeProduct, 'Test requires at least one active product');
  const targetVariant = activeProduct.variants[0];

  // Call getWhatsAppProductOrderDetails with qty = 2
  const productOrderDetails = await getWhatsAppProductOrderDetails({
    slug: activeProduct.slug,
    variantId: targetVariant.id,
    quantity: 2,
  });

  assert.strictEqual(productOrderDetails.success, true, 'Product details fetch must succeed');
  assert.strictEqual(productOrderDetails.mode, 'product', 'Mode must be product');
  assert.strictEqual(productOrderDetails.items.length, 1, 'Exactly 1 item returned');

  const returnedItem = productOrderDetails.items[0];
  assert.strictEqual(returnedItem.variantId, targetVariant.id, 'Variant ID matches');
  assert.strictEqual(returnedItem.productSlug, activeProduct.slug, 'Product slug matches');
  assert.strictEqual(returnedItem.quantity, 2, 'Quantity matches requested');
  assert.strictEqual(returnedItem.unitPrice, Number(targetVariant.sellingPrice), 'Unit price is authoritative sellingPrice');
  assert.strictEqual(returnedItem.lineTotal, Number(targetVariant.sellingPrice) * 2, 'Line total is unitPrice * 2');
  assert.strictEqual(productOrderDetails.subtotal, returnedItem.lineTotal, 'Subtotal matches line total');

  // Verify invalid slug/variant gracefully fails
  const invalidDetails = await getWhatsAppProductOrderDetails({
    slug: 'non-existent-product-slug',
    variantId: targetVariant.id,
    quantity: 1,
  });
  assert.strictEqual(invalidDetails.success, false, 'Invalid product returns success=false');
  assert.strictEqual(invalidDetails.items.length, 0, 'No items returned for invalid product');
  console.log('  ✓ Product Mode authoritative resolution & error boundaries verified\n');

  // ----------------------------------------------------------------
  // Section 3: WhatsApp Shipping Calculation & Global Cap
  // ----------------------------------------------------------------
  console.log('--- Section 3: Authoritative WhatsApp Shipping & StoreSettings Cap ---');
  const storeSettings = await prisma.storeSettings.findFirst({ select: { globalShippingCap: true } });
  const globalCap = Number(storeSettings?.globalShippingCap ?? 200);

  // Find a product with positive shipping charge to test shipping fee & cap calculation
  const chargedProduct = await prisma.product.findFirst({
    where: { shippingCharge: { gt: 0 }, variants: { some: { isAvailable: true } } },
    include: { variants: { where: { isAvailable: true }, take: 1 } },
  });

  if (chargedProduct) {
    const chargedVariant = chargedProduct.variants[0];
    const unitCharge = Number(chargedProduct.shippingCharge);

    const shipRes1 = await calculateWhatsAppShippingAction([
      { variantId: chargedVariant.id, quantity: 1 },
    ]);
    assert.strictEqual(shipRes1.success, true, 'Shipping calculation succeeds');
    const expectedShip1 = Math.min(unitCharge * 1, globalCap);
    assert.strictEqual(shipRes1.shippingFee, expectedShip1, 'Single item shipping matches Product.shippingCharge');

    // Large quantity to test cap
    const shipResLarge = await calculateWhatsAppShippingAction([
      { variantId: chargedVariant.id, quantity: 100 },
    ]);
    assert.strictEqual(shipResLarge.shippingFee, globalCap, 'High quantity shipping is correctly capped at globalShippingCap');
    console.log(`  ✓ Shipping calculated as SUM(shippingCharge * qty) and strictly capped at ₹${globalCap}\n`);
  } else {
    console.log('  ⚠ No products with positive shipping charge found, skipping positive shipping assertion\n');
  }

  // ----------------------------------------------------------------
  // Section 4: Read-Only Coupon Validation (Zero Consumption)
  // ----------------------------------------------------------------
  console.log('--- Section 4: Coupon Preview Validation & Zero Usage Consumption ---');
  // Create temporary coupon
  const testCouponCode = `TESTCOUPON_${Date.now()}`;
  const testCoupon = await prisma.coupon.create({
    data: {
      name: 'Test Coupon 10%',
      code: testCouponCode,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      usageLimitGlobal: 5,
      usageCountGlobal: 0,
      status: 'ACTIVE',
    },
  });

  try {
    const couponPreview = await previewWhatsAppCouponAction({
      couponCode: testCouponCode,
      items: [{ variantId: targetVariant.id, quantity: 2 }],
    });

    assert.strictEqual(couponPreview.success, true, 'Coupon preview succeeds');
    assert.strictEqual(couponPreview.valid, true, 'Coupon is valid');
    const expectedDiscount = Math.round(Number(targetVariant.sellingPrice) * 2 * 0.1 * 100) / 100;
    assert.strictEqual(couponPreview.discountTotal, expectedDiscount, 'Discount is 10% of subtotal');

    // Verify usageCountGlobal is STILL 0
    const reloadedCoupon = await prisma.coupon.findUniqueOrThrow({ where: { id: testCoupon.id } });
    assert.strictEqual(reloadedCoupon.usageCountGlobal, 0, 'usageCountGlobal must NOT be incremented during preview');

    const usageCountInDb = await prisma.couponUsage.count({ where: { couponId: testCoupon.id } });
    assert.strictEqual(usageCountInDb, 0, 'Zero CouponUsage rows created during preview');
    console.log('  ✓ Coupon preview validates correctly with ZERO usage consumption\n');
  } finally {
    await prisma.coupon.delete({ where: { id: testCoupon.id } }).catch(() => {});
  }

  // ----------------------------------------------------------------
  // Section 5: Customer Form Schema & Validation
  // ----------------------------------------------------------------
  console.log('--- Section 5: Customer Details Form Validation UX ---');

  // Valid customer input
  const validCustomerData = {
    name: 'Amina Al-Mansoor',
    mobile: '9876543210',
    address: 'Flat 402, Al-Noor Residency, MG Road',
    city: 'Kozhikode',
    state: 'Kerala',
    pincode: '673001',
    email: 'amina@example.com',
  };
  const parsedValid = whatsappCustomerSchema.safeParse(validCustomerData);
  assert.strictEqual(parsedValid.success, true, 'Valid customer data passes whatsappCustomerSchema');

  // Optional email can be omitted / null
  const customerNoEmail = {
    name: 'Amina Al-Mansoor',
    mobile: '9876543210',
    address: 'Flat 402, Al-Noor Residency, MG Road',
    city: 'Kozhikode',
    state: 'Kerala',
    pincode: '673001',
    email: null,
  };
  assert.strictEqual(whatsappCustomerSchema.safeParse(customerNoEmail).success, true, 'Optional email can be null/omitted');

  // Invalid cases
  assert.strictEqual(
    whatsappCustomerSchema.safeParse({ ...validCustomerData, name: '' }).success,
    false,
    'Empty name fails'
  );
  assert.strictEqual(
    whatsappCustomerSchema.safeParse({ ...validCustomerData, mobile: '12345' }).success,
    false,
    'Short mobile fails'
  );
  assert.strictEqual(
    whatsappCustomerSchema.safeParse({ ...validCustomerData, mobile: '5555555555' }).success,
    false,
    'Mobile not starting with 6-9 fails'
  );
  assert.strictEqual(
    whatsappCustomerSchema.safeParse({ ...validCustomerData, address: '' }).success,
    false,
    'Empty address fails'
  );
  assert.strictEqual(
    whatsappCustomerSchema.safeParse({ ...validCustomerData, city: '' }).success,
    false,
    'Empty city fails'
  );
  assert.strictEqual(
    whatsappCustomerSchema.safeParse({ ...validCustomerData, pincode: '012345' }).success,
    false,
    'Pincode starting with 0 fails'
  );
  assert.strictEqual(
    whatsappCustomerSchema.safeParse({ ...validCustomerData, pincode: '12345' }).success,
    false,
    'Pincode not 6 digits fails'
  );
  assert.strictEqual(
    whatsappCustomerSchema.safeParse({ ...validCustomerData, email: 'not-an-email' }).success,
    false,
    'Malformed email fails'
  );
  console.log('  ✓ Field-level and form-level validations strictly verified\n');

  // ----------------------------------------------------------------
  // Section 6: Zero Database Order Mutation & Zero Stock Reservation
  // ----------------------------------------------------------------
  console.log('--- Section 6: Zero Database Order Mutation & Inventory Integrity ---');
  const finalOrderCount = await prisma.order.count();
  assert.strictEqual(
    finalOrderCount,
    initialOrderCount,
    'Zero orders created during Step 2 page loading and actions'
  );

  const finalInventorySnap = await prisma.inventoryItem.findMany({
    select: { id: true, physicalStock: true, reservedStock: true },
  });
  assert.deepStrictEqual(
    finalInventorySnap,
    initialInventorySnap,
    'Inventory items (physical and reserved stock) completely untouched'
  );
  console.log('  ✓ Verified ZERO database orders created');
  console.log('  ✓ Verified ZERO inventory reservations or deductions occurred\n');

  console.log('================================================================');
  console.log('ALL PHASE 4 STEP 2 ACCEPTANCE TESTS PASSED (6/6 OBJECTIVES)');
  console.log('================================================================');
}

runPhase4Step2AcceptanceTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
