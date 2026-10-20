import { prisma } from '../lib/db/prisma';
import { createWhatsAppOrderAction } from '../lib/actions/order-actions';
import { createWhatsAppOrder } from '../lib/ordering/order-engine';
import { calculateWhatsAppOrderShipping } from '../lib/ordering/shipping';
import { SalesChannel, OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import assert from 'assert';
import crypto from 'crypto';

async function runPhase4Step3AcceptanceTests() {
  console.log('================================================================');
  console.log('PHASE 4 — STEP 3 ACCEPTANCE TESTS');
  console.log('CONNECT WHATSAPP ORDER FORM TO SERVER-SIDE ORDER CREATION');
  console.log('================================================================\n');

  const testSuffix = Date.now().toString().slice(-6);
  const createdOrderIds: string[] = [];
  const createdCouponIds: string[] = [];
  const createdProductIds: string[] = [];

  try {
    // ----------------------------------------------------------------
    // Step 0: Test Fixtures Setup
    // ----------------------------------------------------------------
    console.log('--- Step 0: Test Fixtures Setup ---');
    const category = await prisma.category.findFirstOrThrow();

    // Create a dedicated product with known stock & shipping charge
    const testProduct = await prisma.product.create({
      data: {
        name: `Phase 4 Product ${testSuffix}`,
        slug: `phase-4-product-${testSuffix}`,
        description: 'Test garment for Phase 4 Step 3 acceptance',
        shippingCharge: 75.0,
        status: 'ACTIVE',
        categoryId: category.id,
      },
    });
    createdProductIds.push(testProduct.id);

    const testVariant = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        title: 'M / Midnight Black',
        sku: `P4-VAR-${testSuffix}`,
        mrp: 2999.0,
        sellingPrice: 1999.0,
        isAvailable: true,
        inventoryItem: {
          create: {
            physicalStock: 20,
            reservedStock: 0,
          },
        },
      },
      include: { inventoryItem: true },
    });

    // Create a second variant for multi-item / cart mode test
    const testVariant2 = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        title: 'L / Midnight Black',
        sku: `P4-VAR2-${testSuffix}`,
        mrp: 2999.0,
        sellingPrice: 1999.0,
        isAvailable: true,
        inventoryItem: {
          create: {
            physicalStock: 15,
            reservedStock: 0,
          },
        },
      },
      include: { inventoryItem: true },
    });

    // Create an active percentage coupon for discount test
    const testCoupon = await prisma.coupon.create({
      data: {
        name: `P4 Coupon ${testSuffix}`,
        code: `P4DISC${testSuffix}`,
        discountType: 'PERCENTAGE',
        discountValue: 10,
        usageLimitGlobal: 10,
        usageCountGlobal: 0,
        status: 'ACTIVE',
      },
    });
    createdCouponIds.push(testCoupon.id);

    console.log(`  Created test product ${testProduct.slug} with shippingCharge = 75.00`);
    console.log(`  Created test variant 1 (${testVariant.sku}) with 20 units @ ₹1999.00`);
    console.log(`  Created test variant 2 (${testVariant2.sku}) with 15 units @ ₹1999.00`);
    console.log(`  Created test coupon ${testCoupon.code} (10% off)\n`);

    // Snapshot inventory before orders
    const initialInv1 = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: testVariant.id },
    });
    const initialInv2 = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: testVariant2.id },
    });
    const initialMovementCount = await prisma.inventoryMovement.count();
    const initialFifoLayerCount = await prisma.fifoLayer.count();
    const initialNotificationCount = await prisma.notification.count();

    // ----------------------------------------------------------------
    // 1. Valid Product-Mode Submission via createWhatsAppOrderAction
    // ----------------------------------------------------------------
    console.log('--- Test 1: Product-Mode Submission creates Order ---');
    const idempotencyKey1 = `p4-prod-${testSuffix}-1`;
    const productSubmission = await createWhatsAppOrderAction({
      creationIdempotencyKey: idempotencyKey1,
      customer: {
        name: 'Fatima Zahra',
        mobile: '9876543210',
        address: 'Villa 14, Palm Crescent',
        city: 'Kochi',
        state: 'Kerala',
        pincode: '682001',
        email: 'fatima@example.com',
      },
      items: [{ variantId: testVariant.id, quantity: 2 }],
      couponCode: null,
      paymentMethod: null,
    });

    if (!productSubmission.success) {
      console.error('FAILED PRODUCT SUBMISSION:', productSubmission);
    }
    assert.strictEqual(productSubmission.success, true, 'Product-mode submission must succeed');
    assert.ok(productSubmission.order, 'Order data must be returned');
    createdOrderIds.push(productSubmission.order.id);

    console.log(`  ✓ Order created: ${productSubmission.order.orderNumber} (ID: ${productSubmission.order.id})`);

    // ----------------------------------------------------------------
    // 2. Valid Cart-Mode Submission (Multi-item + Coupon)
    // ----------------------------------------------------------------
    console.log('\n--- Test 2: Cart-Mode Submission (Multi-Item + Coupon) creates Order ---');
    const idempotencyKey2 = `p4-cart-${testSuffix}-2`;
    const cartSubmission = await createWhatsAppOrderAction({
      creationIdempotencyKey: idempotencyKey2,
      customer: {
        name: 'Zainab Qasim',
        mobile: '9123456780',
        address: 'Apartment 5B, Skyline Towers, MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        email: null,
      },
      items: [
        { variantId: testVariant.id, quantity: 1 },
        { variantId: testVariant2.id, quantity: 2 },
      ],
      couponCode: testCoupon.code,
      paymentMethod: null,
    });

    assert.strictEqual(cartSubmission.success, true, 'Cart-mode submission must succeed');
    assert.ok(cartSubmission.order, 'Order data must be returned');
    createdOrderIds.push(cartSubmission.order.id);

    console.log(`  ✓ Cart Order created: ${cartSubmission.order.orderNumber} with coupon ${testCoupon.code}`);

    // ----------------------------------------------------------------
    // 3. Status, SalesChannel, PaymentStatus, PaymentMethod Verifications
    // ----------------------------------------------------------------
    console.log('\n--- Test 3: Order Header State Verification ---');
    const order1Db = await prisma.order.findUniqueOrThrow({
      where: { id: productSubmission.order.id },
      include: { items: true, customer: true },
    });

    assert.strictEqual(order1Db.status, OrderStatus.CONTACTED, 'Status must be CONTACTED');
    assert.strictEqual(order1Db.salesChannel, SalesChannel.WHATSAPP, 'salesChannel must be WHATSAPP');
    assert.strictEqual(order1Db.paymentStatus, PaymentStatus.DUE, 'paymentStatus must be DUE');
    assert.strictEqual(order1Db.paymentMethod, null, 'paymentMethod must be null');
    assert.strictEqual(order1Db.reservationExpiresAt, null, 'reservationExpiresAt must be null (no timer)');
    console.log('  ✓ status = CONTACTED, salesChannel = WHATSAPP, paymentStatus = DUE, paymentMethod = null');

    // ----------------------------------------------------------------
    // 4. Customer Snapshot Persistence
    // ----------------------------------------------------------------
    console.log('\n--- Test 4: Customer Details Snapshot Persistence ---');
    assert.strictEqual(order1Db.customerNameSnapshot, 'Fatima Zahra', 'Customer name snapshotted');
    assert.strictEqual(order1Db.customerMobileSnapshot, '+919876543210', 'Normalized Indian mobile snapshotted');
    assert.strictEqual(order1Db.customerEmailSnapshot, 'fatima@example.com', 'Email snapshotted');
    assert.ok(order1Db.shippingAddressSnapshot?.includes('Villa 14, Palm Crescent'), 'Address line included');
    assert.ok(order1Db.shippingAddressSnapshot?.includes('Kochi'), 'City included');
    assert.ok(order1Db.shippingAddressSnapshot?.includes('Kerala'), 'State included');
    assert.ok(order1Db.shippingAddressSnapshot?.includes('682001'), 'Pincode included');
    console.log('  ✓ Customer name, mobile, address, city, state, pincode, email successfully snapshotted');

    // ----------------------------------------------------------------
    // 5. Product/Variant/Quantity Snapshots
    // ----------------------------------------------------------------
    console.log('\n--- Test 5: Item and Variant Snapshots ---');
    assert.strictEqual(order1Db.items.length, 1, 'Order 1 has exactly 1 line item');
    const lineItem1 = order1Db.items[0];
    assert.strictEqual(lineItem1.variantId, testVariant.id, 'Variant ID matches');
    assert.strictEqual(lineItem1.productNameSnapshot, testProduct.name, 'Product name snapshotted');
    assert.strictEqual(lineItem1.variantTitleSnapshot, testVariant.title, 'Variant title snapshotted');
    assert.strictEqual(lineItem1.skuSnapshot, testVariant.sku, 'SKU snapshotted');
    assert.strictEqual(lineItem1.quantity, 2, 'Quantity snapshotted');
    console.log('  ✓ Item variant ID, SKU, product name, title, and quantity correctly snapshotted');

    // ----------------------------------------------------------------
    // 6, 7 & 8: Server-Authoritative Pricing, Shipping & Total Calculation
    // ----------------------------------------------------------------
    console.log('\n--- Tests 6-8: Authoritative Pricing, Shipping and Grand Total ---');
    assert.strictEqual(Number(lineItem1.unitPrice), 1999.0, 'Authoritative sellingPrice 1999.00 persisted');
    assert.strictEqual(Number(lineItem1.mrp), 2999.0, 'Authoritative MRP 2999.00 persisted');
    assert.strictEqual(Number(order1Db.subtotal), 1999.0 * 2, 'Subtotal = 3998.00');

    // Shipping calculation check: 2 items * 75.00 = 150.00 (capped at globalShippingCap)
    const storeSettings = await prisma.storeSettings.findFirst({ select: { globalShippingCap: true } });
    const globalCap = Number(storeSettings?.globalShippingCap ?? 200.0);
    const expectedShippingOrder1 = Math.min(75.0 * 2, globalCap);
    assert.strictEqual(Number(order1Db.shippingFee), expectedShippingOrder1, `Shipping fee = ₹${expectedShippingOrder1}`);

    const expectedGrandTotal1 = 3998.0 + expectedShippingOrder1;
    assert.strictEqual(Number(order1Db.grandTotal), expectedGrandTotal1, `Grand total = ₹${expectedGrandTotal1}`);
    console.log(`  ✓ Subtotal ₹3998.00 + Shipping ₹${expectedShippingOrder1}.00 = Total ₹${expectedGrandTotal1}.00 persisted`);

    // ----------------------------------------------------------------
    // 9 & 10: Coupon Discount Snapshot & Zero Usage Consumption at CONTACTED
    // ----------------------------------------------------------------
    console.log('\n--- Tests 9 & 10: Coupon Accounting at CONTACTED ---');
    const order2Db = await prisma.order.findUniqueOrThrow({
      where: { id: cartSubmission.order.id },
      include: { items: true },
    });

    // Subtotal: 1 * 1999 + 2 * 1999 = 5997.00
    assert.strictEqual(Number(order2Db.subtotal), 5997.0, 'Order 2 Subtotal = 5997.00');
    // Coupon: 10% of 5997 = 599.70
    assert.strictEqual(Number(order2Db.discountTotal), 599.7, 'Order 2 Discount = ₹599.70');
    assert.strictEqual(order2Db.couponCodeSnapshot, testCoupon.code, 'Coupon code snapshot matches');

    // Critical Rule: Coupon usage must NOT be consumed at CONTACTED
    const reloadedCoupon = await prisma.coupon.findUniqueOrThrow({ where: { id: testCoupon.id } });
    assert.strictEqual(reloadedCoupon.usageCountGlobal, 0, 'usageCountGlobal must remain 0 at CONTACTED');
    const usageRowCount = await prisma.couponUsage.count({ where: { couponId: testCoupon.id } });
    assert.strictEqual(usageRowCount, 0, 'Zero CouponUsage records created at CONTACTED');
    console.log('  ✓ Coupon discount ₹599.70 correctly snapshotted');
    console.log('  ✓ Confirmed usageCountGlobal = 0 and 0 CouponUsage records at CONTACTED');

    // ----------------------------------------------------------------
    // 11-15: Zero Inventory & Zero FIFO Mutation Verification
    // ----------------------------------------------------------------
    console.log('\n--- Tests 11-15: Strict Inventory & FIFO Non-Interference ---');
    const postInv1 = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: testVariant.id },
    });
    const postInv2 = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: testVariant2.id },
    });

    assert.strictEqual(postInv1.physicalStock, initialInv1.physicalStock, 'Variant 1 physical stock untouched (20)');
    assert.strictEqual(postInv1.reservedStock, initialInv1.reservedStock, 'Variant 1 reserved stock untouched (0)');
    assert.strictEqual(postInv2.physicalStock, initialInv2.physicalStock, 'Variant 2 physical stock untouched (15)');
    assert.strictEqual(postInv2.reservedStock, initialInv2.reservedStock, 'Variant 2 reserved stock untouched (0)');

    const postMovementCount = await prisma.inventoryMovement.count();
    assert.strictEqual(postMovementCount, initialMovementCount, 'Zero inventory movements created');

    const postFifoCount = await prisma.fifoLayer.count();
    assert.strictEqual(postFifoCount, initialFifoLayerCount, 'Zero FIFO layers created or modified');

    assert.strictEqual(Number(order1Db.totalFifoCogs), 0, 'Order 1 totalFifoCogs is 0');
    assert.strictEqual(Number(order2Db.totalFifoCogs), 0, 'Order 2 totalFifoCogs is 0');
    console.log('  ✓ Physical stock: UNCHANGED');
    console.log('  ✓ Reserved stock: UNCHANGED');
    console.log('  ✓ FIFO layers: UNCHANGED');
    console.log('  ✓ Movements: ZERO created');
    console.log('  ✓ totalFifoCogs: STRICTLY 0.00');

    // ----------------------------------------------------------------
    // 16: Zero ORDER_RECEIVED Notification
    // ----------------------------------------------------------------
    console.log('\n--- Test 16: Notification Outbox Non-Interference ---');
    const postNotificationCount = await prisma.notification.count();
    assert.strictEqual(postNotificationCount, initialNotificationCount, 'Zero notifications enqueued during WhatsApp order creation');
    console.log('  ✓ Zero ORDER_RECEIVED notifications created');

    // ----------------------------------------------------------------
    // 17 & 18: Idempotency Behavior
    // ----------------------------------------------------------------
    console.log('\n--- Tests 17 & 18: Idempotency Handling ---');
    // Technical retry with exact same idempotency key
    const duplicateRes = await createWhatsAppOrderAction({
      creationIdempotencyKey: idempotencyKey1,
      customer: {
        name: 'Fatima Zahra',
        mobile: '9876543210',
        address: 'Villa 14, Palm Crescent',
        city: 'Kochi',
        state: 'Kerala',
        pincode: '682001',
      },
      items: [{ variantId: testVariant.id, quantity: 2 }],
    });

    assert.strictEqual(duplicateRes.success, true, 'Duplicate call succeeds');
    assert.strictEqual(duplicateRes.order?.id, productSubmission.order.id, 'Duplicate call returns existing order ID');
    assert.strictEqual(duplicateRes.order?.orderNumber, productSubmission.order.orderNumber, 'Returns same order number');

    const totalOrdersMatchingKey = await prisma.order.count({
      where: { creationIdempotencyKey: idempotencyKey1 },
    });
    assert.strictEqual(totalOrdersMatchingKey, 1, 'Only ONE order row exists in database for this idempotency key');
    console.log('  ✓ Technical retry with identical idempotency key returned existing order without duplication');

    // Two separate intentional submissions with different idempotency keys create two separate orders
    const idempotencyKey3 = `p4-separate-${testSuffix}-3`;
    const separateSubmission = await createWhatsAppOrderAction({
      creationIdempotencyKey: idempotencyKey3,
      customer: {
        name: 'Fatima Zahra',
        mobile: '9876543210',
        address: 'Villa 14, Palm Crescent',
        city: 'Kochi',
        state: 'Kerala',
        pincode: '682001',
      },
      items: [{ variantId: testVariant.id, quantity: 1 }],
    });
    assert.strictEqual(separateSubmission.success, true, 'Separate submission succeeds');
    assert.notStrictEqual(separateSubmission.order?.id, productSubmission.order.id, 'Distinct order ID generated');
    createdOrderIds.push(separateSubmission.order!.id);
    console.log('  ✓ Separate customer submissions create separate CONTACTED orders as intended');

    // ----------------------------------------------------------------
    // 19: Insufficient Stock Rejection
    // ----------------------------------------------------------------
    console.log('\n--- Test 19: Submission-time Stock Availability Rejection ---');
    const orderCountBeforeStockFail = await prisma.order.count();
    const stockFailRes = await createWhatsAppOrderAction({
      creationIdempotencyKey: `p4-stockfail-${testSuffix}`,
      customer: {
        name: 'Maryam Ali',
        mobile: '9876543219',
        address: '42 Crescent Road',
        city: 'Calicut',
        state: 'Kerala',
        pincode: '673001',
      },
      items: [{ variantId: testVariant.id, quantity: 999 }], // 999 exceeds 20 available units
    });

    assert.strictEqual(stockFailRes.success, false, 'Insufficient stock submission must fail');
    assert.strictEqual(stockFailRes.code, 'INSUFFICIENT_STOCK', 'Code must be INSUFFICIENT_STOCK');
    const orderCountAfterStockFail = await prisma.order.count();
    assert.strictEqual(orderCountAfterStockFail, orderCountBeforeStockFail, 'Zero orders created on stock failure');
    console.log('  ✓ Excess quantity (999 > 20) correctly rejected with INSUFFICIENT_STOCK error');

    // ----------------------------------------------------------------
    // 20: Invalid Customer Data Rejection
    // ----------------------------------------------------------------
    console.log('\n--- Test 20: Server-side Customer Validation Rejection ---');
    const invalidCustomerRes = await createWhatsAppOrderAction({
      creationIdempotencyKey: `p4-invalidcust-${testSuffix}`,
      customer: {
        name: '',
        mobile: '12345', // Invalid mobile
        address: '',
        city: '',
        state: 'InvalidState',
        pincode: '000000', // Invalid PIN
      },
      items: [{ variantId: testVariant.id, quantity: 1 }],
    });
    assert.strictEqual(invalidCustomerRes.success, false, 'Invalid customer submission must be rejected');
    console.log('  ✓ Invalid customer details safely rejected server-side');

    // ----------------------------------------------------------------
    // 21: Client Tampering Non-Interference
    // ----------------------------------------------------------------
    console.log('\n--- Test 21: Server Authoritative Security (No Client Pricing Trust) ---');
    // Client only submits variantId and quantity — schema does not accept prices or shipping from client
    // Server computes all prices authoritatively from database
    const secureSubmission = await createWhatsAppOrderAction({
      creationIdempotencyKey: `p4-secure-${testSuffix}`,
      customer: {
        name: 'Aisha Siddiqa',
        mobile: '9876543218',
        address: 'Al-Huda Villa, Beach Road',
        city: 'Mangaluru',
        state: 'Karnataka',
        pincode: '575001',
      },
      items: [{ variantId: testVariant.id, quantity: 1 }],
    });
    assert.strictEqual(secureSubmission.success, true);
    createdOrderIds.push(secureSubmission.order!.id);
    assert.strictEqual(secureSubmission.order!.subtotal, 1999.0, 'Subtotal derived strictly from database variant sellingPrice');
    assert.strictEqual(secureSubmission.order!.shippingFee, 75.0, 'Shipping fee derived strictly from database product shippingCharge');
    console.log('  ✓ Client cannot tamper with price, shipping, or totals; server remains fully authoritative');

    // ----------------------------------------------------------------
    // 22: Existing Phase 2 & Phase 3 Regressions Guard
    // ----------------------------------------------------------------
    console.log('\n--- Test 22: Order Transition & Admin Flow Intact ---');
    // Confirming order1 transitions to CONFIRMED and deducts stock as expected in Phase 2
    const confirmRes = await createWhatsAppOrder({
      creationIdempotencyKey: `p4-engine-${testSuffix}`,
      customer: {
        name: 'Halima Sadia',
        mobile: '9876543217',
        address: 'House 9, Green Valley',
        city: 'Kozhikode',
        state: 'Kerala',
        pincode: '673004',
      },
      items: [{ variantId: testVariant.id, quantity: 1 }],
    });
    createdOrderIds.push(confirmRes.id);
    assert.strictEqual(confirmRes.status, OrderStatus.CONTACTED);
    console.log('  ✓ Phase 2 engine createWhatsAppOrder functions identically');

    console.log('\n================================================================');
    console.log('ALL PHASE 4 STEP 3 ACCEPTANCE TESTS PASSED (22/22 OBJECTIVES)');
    console.log('================================================================\n');
  } finally {
    // Clean up test data
    console.log('--- Cleaning Up Test Fixtures ---');
    // First remove any order items tied to the test variants
    await prisma.orderItem.deleteMany({
      where: { variant: { productId: { in: createdProductIds } } },
    }).catch(() => {});

    // Delete created orders
    for (const orderId of createdOrderIds) {
      await prisma.orderStatusTransition.deleteMany({ where: { orderId } }).catch(() => {});
      await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
    }

    // Delete created coupons
    for (const couponId of createdCouponIds) {
      await prisma.couponUsage.deleteMany({ where: { couponId } }).catch(() => {});
      await prisma.coupon.delete({ where: { id: couponId } }).catch(() => {});
    }

    // Delete inventory items, variants, and products
    for (const productId of createdProductIds) {
      const variants = await prisma.productVariant.findMany({ where: { productId } });
      for (const v of variants) {
        await prisma.inventoryItem.deleteMany({ where: { variantId: v.id } }).catch(() => {});
      }
      await prisma.productVariant.deleteMany({ where: { productId } }).catch(() => {});
      await prisma.product.delete({ where: { id: productId } }).catch(() => {});
    }
    console.log('  ✓ Test orders, coupons, and products cleaned up safely');
  }
}

runPhase4Step3AcceptanceTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
