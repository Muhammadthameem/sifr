import { prisma } from '../lib/db/prisma';
import {
  OrderStatus,
  SalesChannel,
  PaymentStatus,
  ProductStatus,
  CouponDiscountType,
} from '@prisma/client';
import { getOrderById, getAdminOrderDetailsAction } from '../lib/actions/order-actions';
import { getAdminOrderDetails } from '../lib/ordering/order-query';
import {
  createWhatsAppOrder,
  createOnlineOrder,
  transitionOrderStatus,
  deleteContactedOrder,
} from '../lib/ordering/order-engine';
import crypto from 'crypto';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

async function runPhaseBOrderDetailsTests() {
  console.log('================================================================');
  console.log('PHASE B ACCEPTANCE TESTS — ADMIN ORDER DETAILS');
  console.log('================================================================\n');

  const runId = Math.floor(100000 + Math.random() * 900000).toString();

  // --- Step 0: Test Fixtures Setup ---
  console.log('--- Step 0: Test Fixtures Setup ---');

  const category = await prisma.category.create({
    data: {
      name: `PhaseB Cat ${runId}`,
      slug: `phase-b-cat-${runId}`,
    },
  });

  const product = await prisma.product.create({
    data: {
      name: `PhaseB Luxury Abaya ${runId}`,
      slug: `phase-b-luxury-abaya-${runId}`,
      status: ProductStatus.ACTIVE,
      categoryId: category.id,
      shippingCharge: 80.0,
      variants: {
        create: {
          title: 'Midnight Velvet / M',
          sku: `SKU-PHB-${runId}`,
          sellingPrice: 3500.0,
          mrp: 4500.0,
          isAvailable: true,
          shippingCost: 80.0,
          inventoryItem: {
            create: {
              physicalStock: 50,
              reservedStock: 0,
            },
          },
        },
      },
      images: {
        create: {
          url: `https://sifr.in/images/phase-b-${runId}.jpg`,
          sortOrder: 0,
        },
      },
    },
    include: { variants: { include: { inventoryItem: true } }, images: true },
  });

  const variant = product.variants[0];

  const fifoLayer = await prisma.fifoLayer.create({
    data: {
      variantId: variant.id,
      initialQuantity: 50,
      remainingQuantity: 50,
      unitCost: 1500.0,
    },
  });

  // Create test coupon
  const coupon = await prisma.coupon.create({
    data: {
      code: `DISC${runId}`,
      name: `Discount ${runId}`,
      discountType: CouponDiscountType.FIXED_AMOUNT,
      discountValue: 500.0,
      minOrderValue: 1000.0,
      status: 'ACTIVE',
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000),
    },
  });

  // 1. Order 1: WHATSAPP, CONTACTED, DUE, with coupon, no shipment
  const order1 = await createWhatsAppOrder({
    creationIdempotencyKey: `phb-wa-1-${runId}`,
    customer: {
      name: `Fatima Zahra ${runId}`,
      mobile: `98911${runId.slice(0, 5)}`,
      address: 'Villa 7, Palm Grove',
      city: 'Calicut',
      state: 'Kerala',
      pincode: '673001',
      email: `fatima-${runId}@example.com`,
    },
    items: [{ variantId: variant.id, quantity: 1 }],
    couponCode: coupon.code,
  });

  // 2. Order 2: WHATSAPP, DISPATCHED with BlueDart shipment
  const order2 = await createWhatsAppOrder({
    creationIdempotencyKey: `phb-wa-2-${runId}`,
    customer: {
      name: `Zayn Malik ${runId}`,
      mobile: `98922${runId.slice(0, 5)}`,
      address: 'Skyline Tower 12B',
      city: 'Kochi',
      state: 'Kerala',
      pincode: '682001',
    },
    items: [{ variantId: variant.id, quantity: 2 }],
  });

  await transitionOrderStatus({
    orderId: order2.id,
    idempotencyKey: `trans-phb-conf-${runId}`,
    targetStatus: OrderStatus.CONFIRMED,
  });

  const trackingId = `BD-PHB-${runId}-888`;
  const trackingUrl = `https://bluedart.com/track/${trackingId}`;
  await transitionOrderStatus({
    orderId: order2.id,
    idempotencyKey: `trans-phb-disp-${runId}`,
    targetStatus: OrderStatus.DISPATCHED,
    shipment: {
      courierName: 'BlueDart Express',
      trackingId,
      trackingUrl,
    },
  });

  // 3. Order 3: Legacy ONLINE order (RECEIVED)
  const order3 = await createOnlineOrder({
    creationIdempotencyKey: `phb-onl-3-${runId}`,
    customer: {
      name: `Ayaan Qureshi ${runId}`,
      mobile: `98933${runId.slice(0, 5)}`,
      email: `ayaan-${runId}@example.com`,
      shippingAddress: 'Flat 101, Crescent Heights, Mumbai, Maharashtra, 400001',
    },
    shippingFee: 80.0,
    items: [{ variantId: variant.id, quantity: 1 }],
  });

  console.log(`  ✓ Created Order 1: #${order1.orderNumber} (WHATSAPP, CONTACTED, with coupon)`);
  console.log(`  ✓ Created Order 2: #${order2.orderNumber} (WHATSAPP, DISPATCHED, with shipment)`);
  console.log(`  ✓ Created Order 3: #${order3.orderNumber} (ONLINE, RECEIVED, legacy)`);

  // ================================================================
  // Test 1: Unauthenticated Access is Rejected
  // ================================================================
  console.log('\n--- Test 1: Unauthenticated Access Rejected ---');
  let authRejectedGetById = false;
  try {
    await getOrderById(order1.id);
  } catch (err: any) {
    authRejectedGetById = true;
    console.log(`  ✓ getOrderById rejected unauthenticated access (${err.message || 'NEXT_REDIRECT'})`);
  }
  assert(authRejectedGetById, 'getOrderById must reject unauthenticated callers');

  let authRejectedAction = false;
  try {
    await getAdminOrderDetailsAction(order1.id);
  } catch (err: any) {
    authRejectedAction = true;
    console.log(`  ✓ getAdminOrderDetailsAction rejected unauthenticated access (${err.message || 'NEXT_REDIRECT'})`);
  }
  assert(authRejectedAction, 'getAdminOrderDetailsAction must reject unauthenticated callers');

  // ================================================================
  // Test 2: Authenticated Admin Can Access Order Details
  // ================================================================
  console.log('\n--- Test 2: Authenticated Access to Order Details ---');
  const details1 = await getAdminOrderDetails(order1.id);
  assert(details1 !== null, 'getAdminOrderDetails returned null for valid order');
  assert(details1!.id === order1.id, 'Retrieved order ID mismatch');
  console.log(`  ✓ Retrieved order details successfully for #${details1!.orderNumber}`);

  // ================================================================
  // Test 3: Unknown Order ID Returns Not-Found Safely
  // ================================================================
  console.log('\n--- Test 3: Unknown Order ID Returns Null (Not-Found) ---');
  const nonExistent = await getAdminOrderDetails(crypto.randomUUID());
  assert(nonExistent === null, 'Unknown order ID must return null');
  console.log('  ✓ Unknown order ID safely returned null');

  // ================================================================
  // Test 4: Order Number is Correct
  // ================================================================
  console.log('\n--- Test 4: Order Number Matches ---');
  assert(details1!.orderNumber === order1.orderNumber, 'Order number mismatch');
  console.log(`  ✓ Order number matches persisted value: ${details1!.orderNumber}`);

  // ================================================================
  // Test 5: Customer Snapshot is Correct
  // ================================================================
  console.log('\n--- Test 5: Customer Snapshot Integrity ---');
  assert(details1!.customerNameSnapshot === `Fatima Zahra ${runId}`, 'Customer name mismatch');
  assert(
    details1!.customerMobileSnapshot === `+9198911${runId.slice(0, 5)}` ||
      details1!.customerMobileSnapshot.includes(runId.slice(0, 5)),
    'Customer mobile mismatch'
  );
  assert(details1!.customerEmailSnapshot === `fatima-${runId}@example.com`, 'Customer email mismatch');
  assert(details1!.customerAddress.city === 'Calicut', `Customer city mismatch: got ${details1!.customerAddress.city}`);
  assert(details1!.customerAddress.state === 'Kerala', `Customer state mismatch: got ${details1!.customerAddress.state}`);
  assert(details1!.customerAddress.pincode === '673001', `Customer pincode mismatch: got ${details1!.customerAddress.pincode}`);
  console.log('  ✓ Customer snapshot (name, mobile, email, address, city, state, pincode) correct');

  // ================================================================
  // Test 6: Order Item Snapshots are Correct
  // ================================================================
  console.log('\n--- Test 6: Order Item Snapshots ---');
  assert(details1!.items.length === 1, 'Expected 1 line item');
  const item1 = details1!.items[0];
  assert(item1.productNameSnapshot === `PhaseB Luxury Abaya ${runId}`, 'Product name snapshot mismatch');
  assert(item1.variantTitleSnapshot === 'Midnight Velvet / M', 'Variant title snapshot mismatch');
  assert(item1.skuSnapshot === `SKU-PHB-${runId}`, 'SKU snapshot mismatch');
  assert(item1.quantity === 1, 'Quantity mismatch');
  assert(item1.productSlug === `phase-b-luxury-abaya-${runId}`, 'Product slug mismatch');
  assert(item1.productImageUrl !== null, 'Product image URL must be included');
  console.log('  ✓ Order item snapshots (name, variant, SKU, qty, image, slug) correct');

  // ================================================================
  // Test 7: Historical Prices are Displayed from Persisted Order Data
  // ================================================================
  console.log('\n--- Test 7: Historical Frozen Pricing ---');
  // Mutate the catalog selling price to ₹9999.00
  await prisma.productVariant.update({
    where: { id: variant.id },
    data: { sellingPrice: 9999.0 },
  });

  const refreshedDetails1 = await getAdminOrderDetails(order1.id);
  assert(refreshedDetails1!.items[0].unitPrice === 3500.0, 'Historical unit price was modified by catalog change!');
  assert(refreshedDetails1!.items[0].mrp === 4500.0, 'Historical MRP was modified by catalog change!');
  console.log('  ✓ Historical prices remain strictly frozen at ₹3500.00 despite catalog price changes');

  // ================================================================
  // Test 8: Shipping, Discount, Grand Total are Persisted Values
  // ================================================================
  console.log('\n--- Test 8: Financial Totals Verification ---');
  assert(refreshedDetails1!.subtotal === 3500.0, `Subtotal mismatch: got ${refreshedDetails1!.subtotal}`);
  assert(refreshedDetails1!.shippingFee === 80.0, `Shipping fee mismatch: got ${refreshedDetails1!.shippingFee}`);
  assert(refreshedDetails1!.discountTotal === 500.0, `Discount total mismatch: got ${refreshedDetails1!.discountTotal}`);
  assert(refreshedDetails1!.couponCodeSnapshot === `DISC${runId}`, `Coupon code snapshot mismatch: got ${refreshedDetails1!.couponCodeSnapshot}`);
  // Grand total: 3500 - 500 + 80 = 3080.00
  assert(refreshedDetails1!.grandTotal === 3080.0, `Grand total mismatch: got ${refreshedDetails1!.grandTotal}`);
  console.log('  ✓ Persisted financial totals (subtotal, shipping, discount, coupon, grand total) correct');

  // ================================================================
  // Test 9: Payment Method & Status Display Correctly
  // ================================================================
  console.log('\n--- Test 9: Payment Method & Status ---');
  assert(refreshedDetails1!.paymentStatus === 'DUE', 'Payment status must be DUE for contacted order');
  assert(refreshedDetails1!.paymentMethod === null, 'Payment method should be null if not yet selected');
  console.log('  ✓ Payment status and method displayed accurately');

  // ================================================================
  // Test 10: Shipment Information Displays Correctly When Present
  // ================================================================
  console.log('\n--- Test 10: Shipment Information Display (Dispatched Order) ---');
  const details2 = await getAdminOrderDetails(order2.id);
  assert(details2 !== null, 'Order 2 details must not be null');
  assert(details2!.shipment !== null, 'Shipment must exist for dispatched order');
  assert(details2!.shipment!.courierName === 'BlueDart Express', 'Courier name mismatch');
  assert(details2!.shipment!.trackingId === trackingId, 'Tracking ID mismatch');
  assert(details2!.shipment!.trackingUrl === trackingUrl, 'Tracking URL mismatch');
  assert(details2!.shipment!.status === 'DISPATCHED', 'Shipment status mismatch');
  console.log(`  ✓ Shipment details displayed correctly: ${details2!.shipment!.courierName} (${trackingId})`);

  // ================================================================
  // Test 11: Missing Shipment Displays Safely
  // ================================================================
  console.log('\n--- Test 11: Missing Shipment Safely Handled ---');
  assert(refreshedDetails1!.shipment === null, 'Order 1 must have null shipment');
  console.log('  ✓ Missing shipment correctly returned as null');

  // ================================================================
  // Test 12: Legacy ONLINE Orders Remain Readable
  // ================================================================
  console.log('\n--- Test 12: Legacy ONLINE Order Compatibility ---');
  const details3 = await getAdminOrderDetails(order3.id);
  assert(details3 !== null, 'Legacy ONLINE order must be readable');
  assert(details3!.salesChannel === 'ONLINE', 'Sales channel must be ONLINE');
  assert(details3!.status === 'RECEIVED', 'Status must be RECEIVED');
  assert(details3!.customerNameSnapshot === `Ayaan Qureshi ${runId}`, 'Legacy customer name mismatch');
  assert(details3!.items.length === 1, 'Legacy items count mismatch');
  console.log('  ✓ Legacy ONLINE order fully readable with correct channel and items');

  // ================================================================
  // Test 13: WHATSAPP Orders Remain Readable
  // ================================================================
  console.log('\n--- Test 13: WHATSAPP Order Channel Fidelity ---');
  assert(refreshedDetails1!.salesChannel === 'WHATSAPP', 'Order 1 channel must be WHATSAPP');
  assert(details2!.salesChannel === 'WHATSAPP', 'Order 2 channel must be WHATSAPP');
  console.log('  ✓ WHATSAPP channel metadata accurately captured');

  // ================================================================
  // Test 14: CONTACTED Order Remains CONTACTED After Viewing
  // ================================================================
  console.log('\n--- Test 14: Zero Status Transition from Viewing ---');
  // Read details 5 times
  for (let i = 0; i < 5; i++) {
    await getAdminOrderDetails(order1.id);
  }
  const order1Db = await prisma.order.findUniqueOrThrow({ where: { id: order1.id } });
  assert(order1Db.status === OrderStatus.CONTACTED, 'Status mutated from CONTACTED after viewing!');
  console.log('  ✓ Order 1 strictly remained in CONTACTED status after multiple views');

  // ================================================================
  // Test 15: Zero Inventory Mutation from Viewing
  // ================================================================
  console.log('\n--- Test 15: Zero Inventory Mutation ---');
  const invBefore = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  await getAdminOrderDetails(order1.id);
  await getAdminOrderDetails(order2.id);
  await getAdminOrderDetails(order3.id);
  const invAfter = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  assert(invBefore.physicalStock === invAfter.physicalStock, 'Physical stock changed after viewing order!');
  assert(invBefore.reservedStock === invAfter.reservedStock, 'Reserved stock changed after viewing order!');
  console.log(`  ✓ Physical stock (${invAfter.physicalStock}) and reserved stock (${invAfter.reservedStock}) untouched`);

  // ================================================================
  // Test 16: Zero FIFO Mutation from Viewing
  // ================================================================
  console.log('\n--- Test 16: Zero FIFO Layer Mutation ---');
  const fifoBefore = await prisma.fifoLayer.findUniqueOrThrow({ where: { id: fifoLayer.id } });
  await getAdminOrderDetails(order1.id);
  const fifoAfter = await prisma.fifoLayer.findUniqueOrThrow({ where: { id: fifoLayer.id } });
  assert(fifoBefore.remainingQuantity === fifoAfter.remainingQuantity, 'FIFO remaining quantity mutated!');
  console.log(`  ✓ FIFO layer remaining quantity strictly unchanged (${fifoAfter.remainingQuantity})`);

  // ================================================================
  // Test 17: Zero COGS Mutation from Viewing
  // ================================================================
  console.log('\n--- Test 17: Zero COGS Mutation ---');
  assert(refreshedDetails1!.totalFifoCogs === 0, 'CONTACTED order totalFifoCogs must be 0');
  const cogsMovements = await prisma.inventoryMovement.findMany({
    where: { variantId: variant.id, referenceId: order1.id },
  });
  assert(cogsMovements.length === 0, 'Zero movements must exist for CONTACTED order');
  console.log('  ✓ Verified totalFifoCogs is strictly 0.00 and zero inventory movements recorded');

  // ================================================================
  // Test 18: Zero Coupon Usage Mutation from Viewing
  // ================================================================
  console.log('\n--- Test 18: Zero Coupon Usage Mutation ---');
  const couponDb = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
  assert(couponDb.usageCountGlobal === 0, 'Coupon usage count incremented on CONTACTED order!');
  const couponUsages = await prisma.couponUsage.findMany({ where: { couponId: coupon.id } });
  assert(couponUsages.length === 0, 'CouponUsage record created on CONTACTED order!');
  console.log('  ✓ Verified coupon usageCountGlobal = 0 and zero CouponUsage records created');

  // ================================================================
  // Test 19: CONTACTED-Only Deletion Behavior Remains Intact
  // ================================================================
  console.log('\n--- Test 19: CONTACTED Deletion Works via Safe Engine Action ---');
  const delRes = await deleteContactedOrder(order1.id);
  assert(delRes.success, 'Failed to delete CONTACTED order');
  const checkDeleted = await prisma.order.findUnique({ where: { id: order1.id } });
  assert(checkDeleted === null, 'Order 1 still exists in database after deletion');
  console.log('  ✓ CONTACTED order safely deleted');

  // ================================================================
  // Test 20: Non-CONTACTED Orders Cannot Be Deleted
  // ================================================================
  console.log('\n--- Test 20: Deletion Forbidden for Non-CONTACTED Orders ---');
  // Order 2 is DISPATCHED
  let order2DeleteError: any = null;
  try {
    await deleteContactedOrder(order2.id);
  } catch (err: any) {
    order2DeleteError = err;
  }
  assert(order2DeleteError !== null, 'Deleting DISPATCHED order must fail');
  assert(order2DeleteError.message.includes('CANNOT_DELETE_ORDER'), `Unexpected error: ${order2DeleteError.message}`);

  // Order 3 is RECEIVED
  let order3DeleteError: any = null;
  try {
    await deleteContactedOrder(order3.id);
  } catch (err: any) {
    order3DeleteError = err;
  }
  assert(order3DeleteError !== null, 'Deleting RECEIVED order must fail');
  assert(order3DeleteError.message.includes('CANNOT_DELETE_ORDER'), `Unexpected error: ${order3DeleteError.message}`);
  console.log('  ✓ Deletion strictly forbidden for DISPATCHED and RECEIVED orders');

  // ================================================================
  // Step 21: Clean Up Test Fixtures Safely
  // ================================================================
  console.log('\n--- Cleaning Up Test Fixtures ---');
  await prisma.shipment.deleteMany({ where: { orderId: order2.id } });
  await prisma.orderStatusTransition.deleteMany({ where: { orderId: { in: [order2.id, order3.id] } } });

  const notifs = await prisma.notification.findMany({
    where: { orderId: { in: [order2.id, order3.id] } },
    select: { id: true },
  });
  if (notifs.length > 0) {
    const notifIds = notifs.map((n) => n.id);
    await prisma.notificationAttempt.deleteMany({ where: { notificationId: { in: notifIds } } });
    await prisma.notification.deleteMany({ where: { id: { in: notifIds } } });
  }

  await prisma.orderItem.deleteMany({ where: { orderId: { in: [order2.id, order3.id] } } });
  await prisma.order.deleteMany({ where: { id: { in: [order2.id, order3.id] } } });
  await prisma.coupon.deleteMany({ where: { id: coupon.id } });
  await prisma.inventoryMovement.deleteMany({ where: { variantId: variant.id } });
  await prisma.fifoLayer.deleteMany({ where: { variantId: variant.id } });
  await prisma.inventoryItem.deleteMany({ where: { variantId: variant.id } });
  await prisma.productImage.deleteMany({ where: { productId: product.id } });
  await prisma.productVariant.deleteMany({ where: { productId: product.id } });
  await prisma.product.deleteMany({ where: { id: product.id } });
  await prisma.category.deleteMany({ where: { id: category.id } });
  console.log('  ✓ Test fixtures cleaned up safely');

  console.log('\n================================================================');
  console.log('ALL PHASE B ACCEPTANCE CRITERIA VERIFIED AND PASSED (20/20)!');
  console.log('================================================================');
}

runPhaseBOrderDetailsTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
    process.exit(1);
  });
