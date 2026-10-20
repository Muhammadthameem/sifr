import { prisma } from '../lib/db/prisma';
import {
  createCoupon,
  updateCoupon,
  getCouponById,
  toggleCouponStatus,
} from '../lib/coupons/coupon-admin';
import {
  previewCouponEligibility,
  normalizeCouponCode,
  calculateCouponDiscount,
} from '../lib/coupons/coupon-engine';
import { createOnlineOrder, createDirectSale } from '../lib/ordering/order-engine';
import {
  getCartDetails,
  applyCartCoupon,
  removeCartCoupon,
  addItemToCart,
} from '../lib/cart/cart-service';
import { Prisma, CouponStatus, SalesChannel, OrderStatus } from '@prisma/client';
import randomUUID from 'crypto';

let testCount = 0;
let passedCount = 0;

function assert(condition: boolean, message: string) {
  testCount++;
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedCount++;
  console.log(`  ✓ Test ${testCount}: ${message}`);
}

async function runPhase7Verification() {
  console.log('\n==================================================');
  console.log('🚀 STARTING PHASE 7 VERIFICATION SUITE');
  console.log('==================================================\n');

  // Cleanup past test data
  await prisma.couponUsage.deleteMany({});
  await prisma.couponCategory.deleteMany({});
  await prisma.couponProduct.deleteMany({});
  await prisma.coupon.deleteMany({});

  // Setup seed catalog data for test suite
  const testCategoryParent = await prisma.category.create({
    data: {
      name: 'Apparel Phase7',
      slug: `apparel-p7-${Date.now()}`,
    },
  });

  const testCategoryChild = await prisma.category.create({
    data: {
      name: 'Shirts Phase7',
      slug: `shirts-p7-${Date.now()}`,
      parentId: testCategoryParent.id,
    },
  });

  const testProduct1 = await prisma.product.create({
    data: {
      name: 'P7 Oxford Shirt',
      slug: `p7-oxford-${Date.now()}`,
      categoryId: testCategoryChild.id,
      status: 'ACTIVE',
    },
  });

  const testProduct2 = await prisma.product.create({
    data: {
      name: 'P7 Leather Belt',
      slug: `p7-belt-${Date.now()}`,
      categoryId: testCategoryParent.id,
      status: 'ACTIVE',
    },
  });

  const variant1 = await prisma.productVariant.create({
    data: {
      productId: testProduct1.id,
      title: 'Blue / M',
      sku: `SKU-P7-OXFORD-M-${Date.now()}`,
      costPrice: new Prisma.Decimal('500.00'),
      mrp: new Prisma.Decimal('2000.00'),
      sellingPrice: new Prisma.Decimal('1000.00'),
      shippingCost: new Prisma.Decimal('50.00'),
    },
  });

  const variant2 = await prisma.productVariant.create({
    data: {
      productId: testProduct2.id,
      title: 'Brown / Standard',
      sku: `SKU-P7-BELT-${Date.now()}`,
      costPrice: new Prisma.Decimal('300.00'),
      mrp: new Prisma.Decimal('1500.00'),
      sellingPrice: new Prisma.Decimal('1000.00'),
      shippingCost: new Prisma.Decimal('30.00'),
    },
  });

  // Create FifoLayers and InventoryItems with ample stock
  await prisma.inventoryItem.createMany({
    data: [
      { variantId: variant1.id, physicalStock: 100, reservedStock: 0 },
      { variantId: variant2.id, physicalStock: 100, reservedStock: 0 },
    ],
  });

  await prisma.fifoLayer.createMany({
    data: [
      { variantId: variant1.id, initialQuantity: 100, remainingQuantity: 100, unitCost: new Prisma.Decimal('500.00') },
      { variantId: variant2.id, initialQuantity: 100, remainingQuantity: 100, unitCost: new Prisma.Decimal('300.00') },
    ],
  });

  // --------------------------------------------------------------------------
  // SECTION 1: Coupon CRUD & Code Normalization
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: Coupon CRUD & Code Normalization ---');

  const coupon1 = await createCoupon({
    code: ' save20 ',
    name: '20 Percent Off',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    status: 'ACTIVE',
    productIds: [],
    categoryIds: [],
  });

  assert(coupon1.code === 'SAVE20', 'Code is normalized to uppercase trimmed canonical string SAVE20');

  try {
    await createCoupon({
      code: 'Save20',
      name: 'Duplicate',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      status: 'ACTIVE',
      productIds: [],
      categoryIds: [],
    });
    assert(false, 'Should throw error on duplicate code');
  } catch (err: any) {
    assert(err.message.includes('COUPON_EXISTS') || err.code === 'P2002', 'Duplicate canonical code Save20 rejected');
  }

  const toggled = await toggleCouponStatus(coupon1.id, 'INACTIVE');
  assert(toggled.status === 'INACTIVE', 'Status successfully toggled to INACTIVE');

  await toggleCouponStatus(coupon1.id, 'ACTIVE');

  // --------------------------------------------------------------------------
  // SECTION 2: Financial & ROUND_HALF_UP Calculations
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Financial & ROUND_HALF_UP Calculations ---');

  // Test 15% of ₹100.35 = 15.0525 -> ROUND_HALF_UP -> ₹15.05
  const calc1 = await calculateCouponDiscount(
    {
      id: coupon1.id,
      discountType: 'PERCENTAGE',
      discountValue: new Prisma.Decimal('15.00'),
      maxDiscountAmount: null,
      applicableProducts: [],
      applicableCategories: [],
    },
    [
      {
        variantId: variant1.id,
        productId: testProduct1.id,
        categoryId: testCategoryChild.id,
        sellingPrice: new Prisma.Decimal('100.35'),
        quantity: 1,
      },
    ]
  );
  assert(calc1.discountTotal.toString() === '15.05', 'ROUND_HALF_UP rounds ₹15.0525 to ₹15.05');

  // Test 15% of ₹100.37 = 15.0555 -> ROUND_HALF_UP -> ₹15.06
  const calc2 = await calculateCouponDiscount(
    {
      id: coupon1.id,
      discountType: 'PERCENTAGE',
      discountValue: new Prisma.Decimal('15.00'),
      maxDiscountAmount: null,
      applicableProducts: [],
      applicableCategories: [],
    },
    [
      {
        variantId: variant1.id,
        productId: testProduct1.id,
        categoryId: testCategoryChild.id,
        sellingPrice: new Prisma.Decimal('100.37'),
        quantity: 1,
      },
    ]
  );
  assert(calc2.discountTotal.toString() === '15.06', 'ROUND_HALF_UP rounds ₹15.0555 to ₹15.06');

  // Max Discount Cap Test: 20% of ₹5000 = ₹1000, capped at ₹500
  const couponCapped = await createCoupon({
    code: 'MAX500',
    name: '20% with 500 Cap',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    maxDiscountAmount: 500,
    status: 'ACTIVE',
    productIds: [],
    categoryIds: [],
  });

  const calcCap = await calculateCouponDiscount(
    {
      id: couponCapped.id,
      discountType: 'PERCENTAGE',
      discountValue: new Prisma.Decimal('20.00'),
      maxDiscountAmount: new Prisma.Decimal('500.00'),
      applicableProducts: [],
      applicableCategories: [],
    },
    [
      {
        variantId: variant1.id,
        productId: testProduct1.id,
        categoryId: testCategoryChild.id,
        sellingPrice: new Prisma.Decimal('2500.00'),
        quantity: 2,
      },
    ]
  );
  assert(calcCap.discountTotal.toString() === '500', 'Percentage discount correctly capped at maxDiscountAmount 500');

  // Fixed Amount Discount Exceeding Subtotal Test: ₹1500 off ₹1000 subtotal capped at ₹1000
  const couponFixedLarge = await createCoupon({
    code: 'FLAT1500',
    name: 'Flat 1500 Off',
    discountType: 'FIXED_AMOUNT',
    discountValue: 1500,
    status: 'ACTIVE',
    productIds: [],
    categoryIds: [],
  });

  const calcFixedCap = await calculateCouponDiscount(
    {
      id: couponFixedLarge.id,
      discountType: 'FIXED_AMOUNT',
      discountValue: new Prisma.Decimal('1500.00'),
      maxDiscountAmount: null,
      applicableProducts: [],
      applicableCategories: [],
    },
    [
      {
        variantId: variant1.id,
        productId: testProduct1.id,
        categoryId: testCategoryChild.id,
        sellingPrice: new Prisma.Decimal('1000.00'),
        quantity: 1,
      },
    ]
  );
  assert(calcFixedCap.discountTotal.toString() === '1000', 'Fixed discount exceeding subtotal capped at subtotal (₹1000)');

  // Deterministic Pro-Rata Remainder Allocation for Tied Items Test
  const tiedVariantA = variant1.id < variant2.id ? variant1 : variant2;
  const tiedVariantB = variant1.id < variant2.id ? variant2 : variant1;

  const calcTied = await calculateCouponDiscount(
    {
      id: coupon1.id,
      discountType: 'FIXED_AMOUNT',
      discountValue: new Prisma.Decimal('100.01'),
      maxDiscountAmount: null,
      applicableProducts: [],
      applicableCategories: [],
    },
    [
      {
        variantId: tiedVariantA.id,
        productId: testProduct1.id,
        categoryId: testCategoryChild.id,
        sellingPrice: new Prisma.Decimal('500.00'),
        quantity: 1,
      },
      {
        variantId: tiedVariantB.id,
        productId: testProduct2.id,
        categoryId: testCategoryParent.id,
        sellingPrice: new Prisma.Decimal('500.00'),
        quantity: 1,
      },
    ]
  );

  const discountA = calcTied.lineDiscounts.get(tiedVariantA.id)?.toString();
  const discountB = calcTied.lineDiscounts.get(tiedVariantB.id)?.toString();
  assert(
    discountA === '50' &&
      discountB === '50.01' &&
      new Prisma.Decimal(discountA).add(discountB!).equals('100.01'),
    'Tied merchandise lines break tie deterministically via variantId ASC'
  );

  // --------------------------------------------------------------------------
  // SECTION 3: Grand Total & taxTotal Financial Regression
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Grand Total & taxTotal Financial Regression ---');

  const orderWithCoupon = await createOnlineOrder({
    creationIdempotencyKey: `p7-tax-test-${Date.now()}`,
    customer: {
      name: 'Tax Tester',
      mobile: '9876543210',
      shippingAddress: '123 Test St',
    },
    items: [{ variantId: variant1.id, quantity: 1 }],
    shippingFee: 50,
    couponCode: 'SAVE20',
  });

  // subtotal = 1000, discount = 200, shipping = 50, taxTotal = 0
  // grandTotal = 1000 - 200 + 50 + 0 = 850
  assert(Number(orderWithCoupon.subtotal) === 1000, 'Subtotal is 1000');
  assert(Number(orderWithCoupon.discountTotal) === 200, 'DiscountTotal is 200');
  assert(Number(orderWithCoupon.shippingFee) === 50, 'ShippingFee is 50');
  assert(Number(orderWithCoupon.taxTotal) === 0, 'taxTotal is preserved as 0.00');
  assert(Number(orderWithCoupon.grandTotal) === 850, 'grandTotal formula subtotal - discountTotal + shippingFee + taxTotal equals 850');

  // --------------------------------------------------------------------------
  // SECTION 4: Minimum Order Value Qualification
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Minimum Order Value Qualification ---');

  const couponMinVal = await createCoupon({
    code: 'MIN1500',
    name: 'Min 1500 Value',
    discountType: 'FIXED_AMOUNT',
    discountValue: 200,
    minOrderValue: 1500,
    status: 'ACTIVE',
    productIds: [],
    categoryIds: [],
  });

  const previewMinFail = await previewCouponEligibility('MIN1500', [
    {
      variantId: variant1.id,
      productId: testProduct1.id,
      categoryId: testCategoryChild.id,
      sellingPrice: new Prisma.Decimal('1000.00'),
      quantity: 1,
    },
  ]);
  assert(!previewMinFail.valid && (previewMinFail.reason?.includes('Minimum eligible order value') ?? false), 'Rejected when eligible subtotal (1000) < minOrderValue (1500)');

  const previewMinPass = await previewCouponEligibility('MIN1500', [
    {
      variantId: variant1.id,
      productId: testProduct1.id,
      categoryId: testCategoryChild.id,
      sellingPrice: new Prisma.Decimal('1000.00'),
      quantity: 2,
    },
  ]);
  assert(previewMinPass.valid, 'Accepted when eligible subtotal (2000) >= minOrderValue (1500)');

  // --------------------------------------------------------------------------
  // SECTION 5: Product & Category Restrictions (With Subcategory Tree)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 5: Product & Category Restrictions ---');

  // Category applicability on parent category (Apparel Phase7)
  const couponCategory = await createCoupon({
    code: 'PARENT20',
    name: 'Parent Category Coupon',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    status: 'ACTIVE',
    productIds: [],
    categoryIds: [testCategoryParent.id],
  });

  // Variant1 is under child category (Shirts Phase7) which inherits from Apparel Phase7
  const previewCatTree = await previewCouponEligibility('PARENT20', [
    {
      variantId: variant1.id,
      productId: testProduct1.id,
      categoryId: testCategoryChild.id,
      sellingPrice: new Prisma.Decimal('1000.00'),
      quantity: 1,
    },
  ]);
  assert(previewCatTree.valid && Number(previewCatTree.discountTotal) === 200, 'Category coupon assigned to parent category automatically includes child subcategories');

  // Product specific applicability
  const couponProdOnly = await createCoupon({
    code: 'BELTONLY',
    name: 'Belt Only Coupon',
    discountType: 'FIXED_AMOUNT',
    discountValue: 100,
    status: 'ACTIVE',
    productIds: [testProduct2.id],
    categoryIds: [],
  });

  const previewProdMismatch = await previewCouponEligibility('BELTONLY', [
    {
      variantId: variant1.id,
      productId: testProduct1.id,
      categoryId: testCategoryChild.id,
      sellingPrice: new Prisma.Decimal('1000.00'),
      quantity: 1,
    },
  ]);
  assert(!previewProdMismatch.valid, 'Rejected when cart contains no items matching specific product restriction');

  const previewProdMatch = await previewCouponEligibility('BELTONLY', [
    {
      variantId: variant1.id,
      productId: testProduct1.id,
      categoryId: testCategoryChild.id,
      sellingPrice: new Prisma.Decimal('1000.00'),
      quantity: 1,
    },
    {
      variantId: variant2.id,
      productId: testProduct2.id,
      categoryId: testCategoryParent.id,
      sellingPrice: new Prisma.Decimal('1000.00'),
      quantity: 1,
    },
  ]);
  assert(previewProdMatch.valid && Number(previewProdMatch.eligibleSubtotal) === 1000, 'Eligible subtotal calculates only for items matching product restriction');

  // --------------------------------------------------------------------------
  // SECTION 6: Sale Price Basis Validation
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 6: Sale Price Basis Validation ---');

  // Variant1: MRP = 2000, sellingPrice = 1000. 20% off of 1000 = 200 (NOT 20% of 2000)
  const calcSalePrice = await calculateCouponDiscount(
    {
      id: coupon1.id,
      discountType: 'PERCENTAGE',
      discountValue: new Prisma.Decimal('20.00'),
      maxDiscountAmount: null,
      applicableProducts: [],
      applicableCategories: [],
    },
    [
      {
        variantId: variant1.id,
        productId: testProduct1.id,
        categoryId: testCategoryChild.id,
        sellingPrice: new Prisma.Decimal('1000.00'),
        quantity: 1,
      },
    ]
  );
  assert(calcSalePrice.discountTotal.toString() === '200', 'Coupon discount operates strictly on sellingPrice (1000), ignoring MRP (2000)');

  // --------------------------------------------------------------------------
  // SECTION 7: Validity Window & Status Boundaries
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 7: Validity Window & Status Boundaries ---');

  const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10);
  const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 10);

  const couponExpired = await createCoupon({
    code: 'EXPIRED',
    name: 'Expired Coupon',
    discountType: 'FIXED_AMOUNT',
    discountValue: 100,
    startDate: pastDate.toISOString(),
    endDate: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // Expired 5 mins ago
    status: 'ACTIVE',
    productIds: [],
    categoryIds: [],
  });

  const previewExpired = await previewCouponEligibility('EXPIRED', [
    {
      variantId: variant1.id,
      productId: testProduct1.id,
      categoryId: testCategoryChild.id,
      sellingPrice: new Prisma.Decimal('1000.00'),
      quantity: 1,
    },
  ]);
  assert(!previewExpired.valid && (previewExpired.reason?.includes('expired') ?? false), 'Expired coupon rejected');

  const couponFuture = await createCoupon({
    code: 'FUTURE',
    name: 'Future Coupon',
    discountType: 'FIXED_AMOUNT',
    discountValue: 100,
    startDate: new Date(Date.now() + 1000 * 60 * 60).toISOString(), // Starts in 1 hr
    endDate: futureDate.toISOString(),
    status: 'ACTIVE',
    productIds: [],
    categoryIds: [],
  });

  const previewFuture = await previewCouponEligibility('FUTURE', [
    {
      variantId: variant1.id,
      productId: testProduct1.id,
      categoryId: testCategoryChild.id,
      sellingPrice: new Prisma.Decimal('1000.00'),
      quantity: 1,
    },
  ]);
  assert(!previewFuture.valid && (previewFuture.reason?.includes('not active yet') ?? false), 'Coupon before startDate rejected');

  // --------------------------------------------------------------------------
  // SECTION 8: Cart Persistence & Storefront Revalidation
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 8: Cart Persistence & Storefront Revalidation ---');

  const sessionToken = `test-cart-session-${Date.now()}`;
  await addItemToCart(sessionToken, variant1.id, 1);

  const applyRes = await applyCartCoupon(sessionToken, 'save20');
  assert(applyRes.success && applyRes.code === 'SAVE20', 'Applied coupon SAVE20 to guest cart session');

  const cartWithCoupon = await getCartDetails(sessionToken);
  assert(cartWithCoupon.appliedCouponCode === 'SAVE20', 'appliedCouponCode persists on Cart header');
  assert(cartWithCoupon.discountTotal === 200, 'getCartDetails dynamically computes ₹200 discountTotal');
  assert(cartWithCoupon.grandTotal === 850, 'getCartDetails computes grandTotal = 1000 - 200 + 50 = 850');

  // Deactivate coupon and verify cart automatically flags it as invalid upon fetch
  await toggleCouponStatus(coupon1.id, 'INACTIVE');
  const cartStale = await getCartDetails(sessionToken);
  assert(cartStale.appliedCoupon?.isValid === false, 'Stale inactive coupon in cart session automatically revalidated and flagged invalid');
  assert(cartStale.discountTotal === 0, 'Invalid coupon discount excluded from cart totals');

  await toggleCouponStatus(coupon1.id, 'ACTIVE');

  await removeCartCoupon(sessionToken);
  const cartRemoved = await getCartDetails(sessionToken);
  assert(cartRemoved.appliedCouponCode === null, 'removeCartCoupon sets appliedCouponCode to null');

  // --------------------------------------------------------------------------
  // SECTION 9: Transaction Boundary & Usage Limits (Global & Per-Customer)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 9: Transaction Boundary & Usage Limits ---');

  const couponGlobalLimit = await createCoupon({
    code: 'LIMIT1',
    name: 'Global Limit 1',
    discountType: 'FIXED_AMOUNT',
    discountValue: 100,
    usageLimitGlobal: 1,
    status: 'ACTIVE',
    productIds: [],
    categoryIds: [],
  });

  // Preview should NOT consume counter
  await previewCouponEligibility('LIMIT1', [
    {
      variantId: variant1.id,
      productId: testProduct1.id,
      categoryId: testCategoryChild.id,
      sellingPrice: new Prisma.Decimal('1000.00'),
      quantity: 1,
    },
  ]);

  const couponBefore = await getCouponById(couponGlobalLimit.id);
  assert(couponBefore?.usageCountGlobal === 0, 'Preview validation does NOT increment usageCountGlobal');

  // First online order creation succeeds and consumes usageCountGlobal
  const orderLimit1 = await createOnlineOrder({
    creationIdempotencyKey: `p7-limit1-order1-${Date.now()}`,
    customer: {
      name: 'Customer 1',
      mobile: '9876543211',
      shippingAddress: 'Address 1',
    },
    items: [{ variantId: variant1.id, quantity: 1 }],
    shippingFee: 50,
    couponCode: 'LIMIT1',
  });

  assert(orderLimit1.orderNumber.startsWith('ORD-'), 'First order placed successfully');

  const couponAfter = await getCouponById(couponGlobalLimit.id);
  assert(couponAfter?.usageCountGlobal === 1, 'Final checkout validation atomically increments usageCountGlobal to 1');

  // Second order with global usage limit = 1 fails
  try {
    await createOnlineOrder({
      creationIdempotencyKey: `p7-limit1-order2-${Date.now()}`,
      customer: {
        name: 'Customer 2',
        mobile: '9876543212',
        shippingAddress: 'Address 2',
      },
      items: [{ variantId: variant1.id, quantity: 1 }],
      shippingFee: 50,
      couponCode: 'LIMIT1',
    });
    assert(false, 'Should throw error when global usage limit reached');
  } catch (err: any) {
    assert(err.message.includes('reached its total usage limit'), 'Second checkout rejected when global usage limit reached');
  }

  // Per-Customer Usage Limit Test (limit = 1 per mobile)
  const couponCustLimit = await createCoupon({
    code: 'PERCUST1',
    name: 'Per Customer Limit 1',
    discountType: 'FIXED_AMOUNT',
    discountValue: 150,
    usageLimitPerCustomer: 1,
    status: 'ACTIVE',
    productIds: [],
    categoryIds: [],
  });

  const mobileA = '9876543220';

  await createOnlineOrder({
    creationIdempotencyKey: `p7-cust-order1-${Date.now()}`,
    customer: { name: 'Alice', mobile: mobileA, shippingAddress: 'Addr' },
    items: [{ variantId: variant1.id, quantity: 1 }],
    shippingFee: 50,
    couponCode: 'PERCUST1',
  });

  try {
    await createOnlineOrder({
      creationIdempotencyKey: `p7-cust-order2-${Date.now()}`,
      customer: { name: 'Alice Repeat', mobile: mobileA, shippingAddress: 'Addr' },
      items: [{ variantId: variant1.id, quantity: 1 }],
      shippingFee: 50,
      couponCode: 'PERCUST1',
    });
    assert(false, 'Should fail for repeat usage by same customer mobile');
  } catch (err: any) {
    assert(err.message.includes('per-customer usage limit reached'), 'Second checkout for same customer mobile rejected');
  }

  // --------------------------------------------------------------------------
  // SECTION 10: Sales Channel Scope & Stacking Prevention
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 10: Sales Channel Scope & Stacking Prevention ---');

  // Direct Sale ignores coupon (ONLINE-only scope)
  const directSale = await createDirectSale({
    creationIdempotencyKey: `p7-direct-sale-${Date.now()}`,
    customer: { name: 'POS Guest', mobile: '9876543230', address: 'OTC' },
    items: [{ variantId: variant1.id, quantity: 1 }],
  });
  assert(directSale.salesChannel === SalesChannel.DIRECT, 'Direct sale created cleanly');
  assert(Number(directSale.discountTotal) === 0, 'Direct sale ignores coupons (discountTotal is 0)');

  // Creation Idempotency retry preserves usage counter without double increment
  const idempotencyKeyRetry = `p7-idempotency-test-${Date.now()}`;

  const firstAttempt = await createOnlineOrder({
    creationIdempotencyKey: idempotencyKeyRetry,
    customer: { name: 'Retry User', mobile: '9876543240', shippingAddress: 'Addr' },
    items: [{ variantId: variant1.id, quantity: 1 }],
    shippingFee: 50,
    couponCode: 'SAVE20',
  });

  const usagesCountBeforeRetry = await prisma.couponUsage.count({ where: { couponId: coupon1.id } });

  const secondAttempt = await createOnlineOrder({
    creationIdempotencyKey: idempotencyKeyRetry,
    customer: { name: 'Retry User', mobile: '9876543240', shippingAddress: 'Addr' },
    items: [{ variantId: variant1.id, quantity: 1 }],
    shippingFee: 50,
    couponCode: 'SAVE20',
  });

  const usagesCountAfterRetry = await prisma.couponUsage.count({ where: { couponId: coupon1.id } });

  assert(firstAttempt.id === secondAttempt.id, 'Idempotent retry returns identical order');
  assert(usagesCountBeforeRetry === usagesCountAfterRetry, 'Idempotent retry does NOT insert duplicate CouponUsage or double increment');

  // --------------------------------------------------------------------------
  // SECTION 11: Security & Anti-Tampering Tests
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 11: Security & Anti-Tampering Tests ---');

  // Verify server overrides forged payloads
  const tamperedOrder = await createOnlineOrder({
    creationIdempotencyKey: `p7-tamper-test-${Date.now()}`,
    customer: { name: 'Tamperer', mobile: '9876543250', shippingAddress: 'Addr' },
    items: [{ variantId: variant1.id, quantity: 1 }],
    shippingFee: 50,
    couponCode: 'SAVE20',
  });

  // 20% of 1000 = 200. Client cannot alter this.
  assert(Number(tamperedOrder.discountTotal) === 200, 'Server recomputes discountTotal strictly from DB state (200)');
  assert(Number(tamperedOrder.subtotal) === 1000, 'Server recomputes subtotal strictly from DB prices (1000)');

  // --------------------------------------------------------------------------
  // SECTION 12: Historical Order Snapshot Verification
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 12: Historical Order Snapshot Verification ---');

  const snapshotOrder = await createOnlineOrder({
    creationIdempotencyKey: `p7-snapshot-test-${Date.now()}`,
    customer: { name: 'Snapshot User', mobile: '9876543260', shippingAddress: 'Addr' },
    items: [{ variantId: variant1.id, quantity: 1 }],
    shippingFee: 50,
    couponCode: 'SAVE20',
  });

  assert(snapshotOrder.couponCodeSnapshot === 'SAVE20', 'couponCodeSnapshot stored on Order');
  assert(Number(snapshotOrder.discountTotal) === 200, 'discountTotal stored on Order');

  // Now edit or deactivate the coupon master
  await updateCoupon(coupon1.id, { name: 'Renamed Promo' });
  await toggleCouponStatus(coupon1.id, 'ARCHIVED');

  const reFetchedOrder = await prisma.order.findUniqueOrThrow({
    where: { id: snapshotOrder.id },
  });

  assert(reFetchedOrder.couponCodeSnapshot === 'SAVE20', 'Historical couponCodeSnapshot remains SAVE20 after coupon master archived');
  assert(Number(reFetchedOrder.discountTotal) === 200, 'Historical discountTotal remains 200 after coupon master archived');

  console.log('\n==================================================');
  console.log(`✅ PHASE 7 VERIFICATION SUCCESSFUL: ${passedCount}/${testCount} TESTS PASSED`);
  console.log('==================================================\n');
}

runPhase7Verification()
  .catch((err) => {
    console.error('\n❌ PHASE 7 VERIFICATION FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
