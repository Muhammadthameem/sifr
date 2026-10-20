import { prisma } from '../lib/db/prisma';
import {
  createWhatsAppOrder,
  confirmWhatsAppOrderSale,
  dispatchOrder,
  createOnlineOrder,
  createDirectSale,
  transitionOrderStatus,
} from '../lib/ordering/order-engine';
import { dispatchOrderAction } from '../lib/actions/order-actions';
import { getAdminOrderDetails } from '../lib/ordering/order-query';
import { OrderStatus, SalesChannel, CouponDiscountType } from '@prisma/client';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}`);
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

async function runPhaseDDispatchTests() {
  console.log('================================================================');
  console.log('PHASE D ACCEPTANCE TESTS — ADMIN DISPATCH & COURIER INTEGRATION');
  console.log('================================================================');

  const runId = Math.floor(100000 + Math.random() * 900000).toString();

  // ================================================================
  // Step 0: Test Fixtures Setup
  // ================================================================
  console.log('\n--- Step 0: Test Fixtures Setup ---');

  const category = await prisma.category.create({
    data: {
      name: `Abayas D ${runId}`,
      slug: `abayas-d-${runId}`,
    },
  });

  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: `PhaseD Silk Abaya ${runId}`,
      slug: `phased-silk-abaya-${runId}`,
      shippingCharge: 70.0,
      variants: {
        create: {
          title: 'Royal Navy / L',
          sku: `SKU-PHD-${runId}`,
          sellingPrice: 3000.0,
          mrp: 3800.0,
          isAvailable: true,
          shippingCost: 70.0,
          inventoryItem: {
            create: {
              physicalStock: 50,
              reservedStock: 0,
            },
          },
        },
      },
    },
    include: { variants: { include: { inventoryItem: true } } },
  });

  const variant = product.variants[0];

  const layer = await prisma.fifoLayer.create({
    data: {
      variantId: variant.id,
      initialQuantity: 50,
      remainingQuantity: 50,
      unitCost: 1000.0,
    },
  });

  const coupon = await prisma.coupon.create({
    data: {
      code: `CPND${runId}`,
      name: `Phase D Coupon ${runId}`,
      discountType: CouponDiscountType.FIXED_AMOUNT,
      discountValue: 200.0,
      minOrderValue: 1000.0,
      usageLimitGlobal: 10,
      status: 'ACTIVE',
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000),
    },
  });

  // Create primary WhatsApp order: 2 units @ ₹3000 = ₹6000 - ₹200 = ₹5800 + ₹70 = ₹5870
  const order1 = await createWhatsAppOrder({
    creationIdempotencyKey: `phd-wa-1-${runId}`,
    customer: {
      name: `Zainab Qasim ${runId}`,
      mobile: `98991${runId.slice(0, 5)}`,
      address: 'Plot 7, Al-Ameen Enclave',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500001',
      email: `zainab-${runId}@example.com`,
    },
    items: [{ variantId: variant.id, quantity: 2 }],
    couponCode: coupon.code,
  });

  // Confirm Order 1 via Phase C Confirm Sale (COD, DUE)
  const confirmedOrder1 = await confirmWhatsAppOrderSale({
    orderId: order1.id,
    paymentMethod: 'COD',
    paymentStatus: 'DUE',
    idempotencyKey: `phd-conf-1-${runId}`,
  });

  assert(confirmedOrder1.status === OrderStatus.CONFIRMED, 'Order 1 must be CONFIRMED');
  console.log(`  ✓ Created & Confirmed Order 1: #${order1.orderNumber} (CONFIRMED, COD, DUE)`);

  // Verify stock state after Phase C confirmation
  const invAfterConf = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  assert(invAfterConf.physicalStock === 48, 'physicalStock after confirmation must be 48');
  assert(invAfterConf.reservedStock === 0, 'reservedStock after confirmation must be 0');

  // ================================================================
  // Test 1: Admin Authentication is Required
  // ================================================================
  console.log('\n--- Test 1: Admin Authentication Required ---');
  let authFailed = false;
  try {
    const res = await dispatchOrderAction({
      orderId: order1.id,
      courierName: 'BlueDart Express',
      trackingId: `TRK-PHD-${runId}`,
    });
    if (res && !res.success) {
      authFailed = true;
      console.log(`  ✓ dispatchOrderAction rejected unauthenticated request (${res.error})`);
    }
  } catch (err: any) {
    authFailed = true;
    console.log(`  ✓ dispatchOrderAction rejected unauthenticated request (${err.message || 'NEXT_REDIRECT'})`);
  }
  assert(authFailed, 'dispatchOrderAction must reject unauthenticated callers');

  // ================================================================
  // Test 3: Missing Courier Name is Rejected
  // ================================================================
  console.log('\n--- Test 3: Missing Courier Name Rejected ---');
  let missingCourierFailed = false;
  try {
    await dispatchOrder({
      orderId: order1.id,
      courierName: '',
      trackingId: `TRK-PHD-${runId}`,
    });
  } catch (err: any) {
    missingCourierFailed = true;
    console.log(`  ✓ Correctly rejected missing courierName: ${err.message}`);
  }
  assert(missingCourierFailed, 'Missing courierName must be rejected');

  // ================================================================
  // Test 4: Missing Tracking ID is Rejected
  // ================================================================
  console.log('\n--- Test 4: Missing Tracking ID Rejected ---');
  let missingTrackingFailed = false;
  try {
    await dispatchOrder({
      orderId: order1.id,
      courierName: 'Delhivery',
      trackingId: '',
    });
  } catch (err: any) {
    missingTrackingFailed = true;
    console.log(`  ✓ Correctly rejected missing trackingId: ${err.message}`);
  }
  assert(missingTrackingFailed, 'Missing trackingId must be rejected');

  // ================================================================
  // Test 5: Blank/Whitespace Courier Name is Rejected
  // ================================================================
  console.log('\n--- Test 5: Blank/Whitespace Courier Name Rejected ---');
  let blankCourierFailed = false;
  try {
    await dispatchOrder({
      orderId: order1.id,
      courierName: '    ',
      trackingId: `TRK-PHD-${runId}`,
    });
  } catch (err: any) {
    blankCourierFailed = true;
    console.log(`  ✓ Correctly rejected whitespace courierName: ${err.message}`);
  }
  assert(blankCourierFailed, 'Whitespace courierName must be rejected');

  // ================================================================
  // Test 6: Blank/Whitespace Tracking ID is Rejected
  // ================================================================
  console.log('\n--- Test 6: Blank/Whitespace Tracking ID Rejected ---');
  let blankTrackingFailed = false;
  try {
    await dispatchOrder({
      orderId: order1.id,
      courierName: 'Delhivery',
      trackingId: '    ',
    });
  } catch (err: any) {
    blankTrackingFailed = true;
    console.log(`  ✓ Correctly rejected whitespace trackingId: ${err.message}`);
  }
  assert(blankTrackingFailed, 'Whitespace trackingId must be rejected');

  // ================================================================
  // Test 7: CONTACTED Order Cannot Be Dispatched
  // ================================================================
  console.log('\n--- Test 7: CONTACTED Order Cannot Be Dispatched ---');
  const contactedOrder = await createWhatsAppOrder({
    creationIdempotencyKey: `phd-wa-contacted-${runId}`,
    customer: {
      name: `Contacted Customer ${runId}`,
      mobile: `98992${runId.slice(0, 5)}`,
      address: 'Contacted Address',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
  });

  let contactedDispatchFailed = false;
  try {
    await dispatchOrder({
      orderId: contactedOrder.id,
      courierName: 'BlueDart Express',
      trackingId: `BD-CON-${runId}`,
    });
  } catch (err: any) {
    contactedDispatchFailed = true;
    console.log(`  ✓ Correctly rejected dispatching CONTACTED order: ${err.message}`);
  }
  assert(contactedDispatchFailed, 'CONTACTED order must not be dispatchable');

  // Create dedicated dummy product for direct / online orders to preserve variant stock isolation
  const dummyProduct = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: `Dummy Product ${runId}`,
      slug: `dummy-product-${runId}`,
      shippingCharge: 50.0,
      variants: {
        create: {
          title: 'Dummy Variant',
          sku: `SKU-DUMMY-${runId}`,
          sellingPrice: 1000.0,
          mrp: 1200.0,
          inventoryItem: {
            create: {
              physicalStock: 20,
              reservedStock: 0,
            },
          },
        },
      },
    },
    include: { variants: true },
  });
  const dummyVariant = dummyProduct.variants[0];
  await prisma.fifoLayer.create({
    data: {
      variantId: dummyVariant.id,
      initialQuantity: 20,
      remainingQuantity: 20,
      unitCost: 500.0,
    },
  });

  // ================================================================
  // Test 9: DELIVERED Order Cannot Be Dispatched
  // ================================================================
  console.log('\n--- Test 9: DELIVERED Order Cannot Be Dispatched ---');
  const directDelivered = await createDirectSale({
    creationIdempotencyKey: `phd-ds-deliv-${runId}`,
    customer: {
      name: `Direct Customer ${runId}`,
      mobile: `98993${runId.slice(0, 5)}`,
    },
    items: [{ variantId: dummyVariant.id, quantity: 1 }],
  });
  assert(directDelivered.status === OrderStatus.DELIVERED, 'Direct sale must be DELIVERED');

  let deliveredDispatchFailed = false;
  try {
    await dispatchOrder({
      orderId: directDelivered.id,
      courierName: 'BlueDart Express',
      trackingId: `BD-DEL-${runId}`,
    });
  } catch (err: any) {
    deliveredDispatchFailed = true;
    console.log(`  ✓ Correctly rejected dispatching DELIVERED order: ${err.message}`);
  }
  assert(deliveredDispatchFailed, 'DELIVERED order must not be dispatchable');

  // ================================================================
  // Test 10: CANCELLED Order Cannot Be Dispatched
  // ================================================================
  console.log('\n--- Test 10: CANCELLED Order Cannot Be Dispatched ---');
  const cancelledOrder = await createWhatsAppOrder({
    creationIdempotencyKey: `phd-wa-canc-${runId}`,
    customer: {
      name: `Cancelled Customer ${runId}`,
      mobile: `98994${runId.slice(0, 5)}`,
      address: 'Cancelled Address',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
  });

  await transitionOrderStatus({
    orderId: cancelledOrder.id,
    idempotencyKey: `canc-${cancelledOrder.id}`,
    targetStatus: OrderStatus.CANCELLED,
  });

  let cancelledDispatchFailed = false;
  try {
    await dispatchOrder({
      orderId: cancelledOrder.id,
      courierName: 'BlueDart Express',
      trackingId: `BD-CANC-${runId}`,
    });
  } catch (err: any) {
    cancelledDispatchFailed = true;
    console.log(`  ✓ Correctly rejected dispatching CANCELLED order: ${err.message}`);
  }
  assert(cancelledDispatchFailed, 'CANCELLED order must not be dispatchable');

  // ================================================================
  // Test 11: Legacy RECEIVED ONLINE Order Cannot Incorrectly Use Dispatch
  // ================================================================
  console.log('\n--- Test 11: Legacy RECEIVED ONLINE Order Cannot Be Dispatched ---');
  const onlineOrder = await createOnlineOrder({
    creationIdempotencyKey: `phd-onl-rec-${runId}`,
    customer: {
      name: `Online Customer ${runId}`,
      mobile: `98995${runId.slice(0, 5)}`,
      shippingAddress: 'Online Address, Bangalore, Karnataka, 560001',
    },
    shippingFee: 70.0,
    items: [{ variantId: dummyVariant.id, quantity: 1 }],
  });
  assert(onlineOrder.status === OrderStatus.RECEIVED, 'Online order must be RECEIVED');

  let onlineReceivedDispatchFailed = false;
  try {
    await dispatchOrder({
      orderId: onlineOrder.id,
      courierName: 'BlueDart Express',
      trackingId: `BD-ONL-${runId}`,
    });
  } catch (err: any) {
    onlineReceivedDispatchFailed = true;
    console.log(`  ✓ Correctly rejected dispatching RECEIVED online order: ${err.message}`);
  }
  assert(onlineReceivedDispatchFailed, 'RECEIVED online order must not be directly dispatchable');

  // ================================================================
  // Test 12: DIRECT Order Behavior Remains Unchanged
  // ================================================================
  console.log('\n--- Test 12: DIRECT Order Behavior Intact ---');
  assert(directDelivered.salesChannel === SalesChannel.DIRECT, 'DIRECT channel intact');
  assert(directDelivered.status === OrderStatus.DELIVERED, 'DIRECT status DELIVERED intact');
  console.log('  ✓ DIRECT sale architecture untouched and functional');

  // ================================================================
  // Tests 2, 13, 14, 15, 16, 17, 18, 19, 20, 21:
  // Successful Atomic Dispatch of Order 1
  // ================================================================
  console.log('\n--- Tests 2, 13-21: Atomic Order Dispatch ---');

  const trackingNumber = `BD-PHD-${runId}-789`;
  const courierPartner = 'BlueDart Express';
  const trackingLink = `https://track.bluedart.com/track/${trackingNumber}`;

  const dispatchedOrder1 = await dispatchOrder({
    orderId: order1.id,
    courierName: courierPartner,
    trackingId: trackingNumber,
    trackingUrl: trackingLink,
    idempotencyKey: `dispatch-${order1.id}`,
  });

  // Test 2 & 17: Order transitions CONFIRMED -> DISPATCHED
  assert(dispatchedOrder1.status === OrderStatus.DISPATCHED, `Status must be DISPATCHED, got ${dispatchedOrder1.status}`);
  console.log('  ✓ Order status transitioned: CONFIRMED -> DISPATCHED');

  // Test 16: Dispatch timestamp persisted
  assert(dispatchedOrder1.dispatchedAt !== null, 'dispatchedAt must be populated');
  console.log(`  ✓ dispatchedAt timestamp set: ${dispatchedOrder1.dispatchedAt?.toISOString()}`);

  // Test 13-15: Shipment created correctly with courier & tracking details
  const shipment = await prisma.shipment.findUnique({
    where: { orderId: order1.id },
  });
  assert(shipment !== null, 'Shipment record must exist');
  assert(shipment!.courierName === courierPartner, `courierName mismatch: got ${shipment!.courierName}`);
  assert(shipment!.trackingId === trackingNumber, `trackingId mismatch: got ${shipment!.trackingId}`);
  assert(shipment!.trackingUrl === trackingLink, `trackingUrl mismatch: got ${shipment!.trackingUrl}`);
  assert(shipment!.status === 'DISPATCHED', `Shipment status must be DISPATCHED, got ${shipment!.status}`);
  assert(shipment!.dispatchedAt !== null, 'Shipment dispatchedAt must be set');
  console.log('  ✓ Shipment created correctly with courierName, trackingId, trackingUrl, and dispatchedAt');

  // Test 18: Status transition history recorded
  const transitions = await prisma.orderStatusTransition.findMany({
    where: { orderId: order1.id },
    orderBy: { createdAt: 'asc' },
  });
  const dispatchTransition = transitions.find((t) => t.toStatus === OrderStatus.DISPATCHED);
  assert(dispatchTransition !== undefined, 'Transition to DISPATCHED must be logged');
  assert(dispatchTransition!.fromStatus === OrderStatus.CONFIRMED, 'fromStatus must be CONFIRMED');
  console.log('  ✓ Status transition history recorded in audit ledger (CONFIRMED -> DISPATCHED)');

  // Test 19: ORDER_DISPATCHED notification queued
  const notifications = await prisma.notification.findMany({
    where: { orderId: order1.id },
  });
  const dispatchNotif = notifications.find((n) => n.eventType === 'ORDER_DISPATCHED');
  assert(dispatchNotif !== undefined, 'ORDER_DISPATCHED notification must be queued in outbox');
  const payload = JSON.parse(dispatchNotif!.payloadJson);
  assert(payload.courierName === courierPartner, 'Notification payload courierName mismatch');
  assert(payload.trackingId === trackingNumber, 'Notification payload trackingId mismatch');
  console.log('  ✓ ORDER_DISPATCHED notification queued in durable outbox with shipment details');

  // Test 20: ORDER_RECEIVED is not created
  assert(!notifications.some((n) => n.eventType === 'ORDER_RECEIVED'), 'ORDER_RECEIVED must NOT be created');
  console.log('  ✓ ORDER_RECEIVED correctly omitted for WhatsApp orders');

  // Test 21: ORDER_CONFIRMED is not duplicated
  const confirmedNotifs = notifications.filter((n) => n.eventType === 'ORDER_CONFIRMED');
  assert(confirmedNotifs.length === 1, `ORDER_CONFIRMED count must be exactly 1, got ${confirmedNotifs.length}`);
  console.log('  ✓ ORDER_CONFIRMED notification was not duplicated at dispatch');

  // ================================================================
  // Tests 22, 23, 24, 25, 26, 27:
  // Strict Inventory & Cost Non-Interference Invariant
  // ================================================================
  console.log('\n--- Tests 22-27: Strict Inventory, FIFO & Cost Non-Interference ---');

  const invAfterDispatch = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  // Test 22: Physical stock does NOT change at dispatch
  assert(
    invAfterDispatch.physicalStock === 48,
    `physicalStock must remain strictly 48 (unchanged at dispatch), got ${invAfterDispatch.physicalStock}`
  );
  console.log('  ✓ physicalStock strictly unchanged at dispatch (48)');

  // Test 23: reservedStock does NOT change at dispatch
  assert(invAfterDispatch.reservedStock === 0, 'reservedStock must remain strictly 0');
  console.log('  ✓ reservedStock strictly unchanged at dispatch (0)');

  // Test 24: FIFO layers do NOT change at dispatch
  const layerAfterDispatch = await prisma.fifoLayer.findUniqueOrThrow({ where: { id: layer.id } });
  assert(
    layerAfterDispatch.remainingQuantity === 48,
    `FIFO layer remainingQuantity must remain 48, got ${layerAfterDispatch.remainingQuantity}`
  );
  console.log('  ✓ FIFO layers strictly untouched at dispatch (remainingQuantity = 48)');

  // Test 25: SALE_OUT movements do NOT change at dispatch
  const movements = await prisma.inventoryMovement.findMany({
    where: { referenceId: order1.id, type: 'SALE_OUT' },
  });
  assert(movements.length === 1, `SALE_OUT movements count must remain exactly 1, got ${movements.length}`);
  console.log('  ✓ Zero additional inventory movements created at dispatch');

  // Test 26: FIFO COGS does NOT change at dispatch
  const order1Db = await prisma.order.findUniqueOrThrow({
    where: { id: order1.id },
    include: { items: true },
  });
  assert(Number(order1Db.totalFifoCogs) === 2000.0, 'totalFifoCogs must remain ₹2000.00');
  assert(Number(order1Db.items[0].fifoCogs) === 2000.0, 'item fifoCogs must remain ₹2000.00');
  console.log('  ✓ FIFO COGS strictly unchanged at dispatch (item = ₹2000.00, order = ₹2000.00)');

  // Test 27: Coupon usage does NOT change at dispatch
  const couponAfterDispatch = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
  assert(couponAfterDispatch.usageCountGlobal === 1, 'Coupon usageCountGlobal must remain 1');
  const couponUsages = await prisma.couponUsage.findMany({ where: { orderId: order1.id } });
  assert(couponUsages.length === 1, 'CouponUsage ledger records must remain exactly 1');
  console.log('  ✓ Coupon usage strictly unchanged at dispatch (usageCountGlobal = 1)');

  // ================================================================
  // Tests 28, 29: Payment Invariant
  // ================================================================
  console.log('\n--- Tests 28-29: Payment Invariant ---');
  // Test 28: Payment method does NOT change
  assert(order1Db.paymentMethod === 'COD', `paymentMethod must remain COD, got ${order1Db.paymentMethod}`);
  // Test 29: Payment status does NOT change
  assert(order1Db.paymentStatus === 'DUE', `paymentStatus must remain DUE, got ${order1Db.paymentStatus}`);
  console.log('  ✓ Payment method (COD) and payment status (DUE) remain strictly preserved at dispatch');

  // ================================================================
  // Tests 30, 31, 32, 33: Snapshot and Financial Integrity
  // ================================================================
  console.log('\n--- Tests 30-33: Snapshot and Financial Integrity ---');
  // Test 30: Customer snapshot remains unchanged
  assert(order1Db.customerNameSnapshot === order1.customerNameSnapshot, 'Customer name snapshot altered');
  assert(order1Db.customerMobileSnapshot === order1.customerMobileSnapshot, 'Customer mobile snapshot altered');
  // Test 31: Order item snapshots remain unchanged
  assert(order1Db.items[0].productNameSnapshot === `PhaseD Silk Abaya ${runId}`, 'Product name snapshot altered');
  assert(order1Db.items[0].skuSnapshot === `SKU-PHD-${runId}`, 'SKU snapshot altered');
  // Test 32: Historical prices remain unchanged
  assert(Number(order1Db.items[0].unitPrice) === 3000.0, 'Unit price altered');
  // Test 33: Subtotal/shipping/discount/grand total remain unchanged
  assert(Number(order1Db.subtotal) === Number(order1.subtotal), 'Subtotal altered');
  assert(Number(order1Db.shippingFee) === Number(order1.shippingFee), 'Shipping fee altered');
  assert(Number(order1Db.discountTotal) === Number(order1.discountTotal), 'Discount total altered');
  assert(Number(order1Db.grandTotal) === Number(order1.grandTotal), 'Grand total altered');
  console.log('  ✓ All historical customer, item, and commercial financial totals remain strictly frozen');

  // ================================================================
  // Tests 8, 34, 35, 36: Duplicate Dispatch Safety / Re-dispatch Rejected
  // ================================================================
  console.log('\n--- Tests 8, 34-36: Re-dispatching DISPATCHED Order Safely Rejected ---');
  let redispatchFailed = false;
  try {
    await dispatchOrder({
      orderId: order1.id,
      courierName: 'Another Courier',
      trackingId: `ANOTHER-${runId}`,
    });
  } catch (err: any) {
    redispatchFailed = true;
    console.log(`  ✓ Re-dispatch correctly rejected: ${err.message}`);
  }
  // Test 8: DISPATCHED order cannot be dispatched again
  assert(redispatchFailed, 'DISPATCHED order must not be re-dispatchable');

  // Test 34: Duplicate dispatch request cannot create another shipment
  const shipmentsAfterRedispatch = await prisma.shipment.findMany({ where: { orderId: order1.id } });
  assert(shipmentsAfterRedispatch.length === 1, `Expected exactly 1 shipment, got ${shipmentsAfterRedispatch.length}`);
  console.log('  ✓ Duplicate dispatch created zero additional shipments (exactly 1 exists)');

  // Test 35: Duplicate dispatch request cannot create another transition
  const transitionsAfterRedispatch = await prisma.orderStatusTransition.findMany({
    where: { orderId: order1.id, toStatus: OrderStatus.DISPATCHED },
  });
  assert(transitionsAfterRedispatch.length === 1, `Expected exactly 1 transition, got ${transitionsAfterRedispatch.length}`);
  console.log('  ✓ Duplicate dispatch created zero additional transitions (exactly 1 exists)');

  // Test 36: Duplicate dispatch request cannot create another notification
  const notifsAfterRedispatch = await prisma.notification.findMany({
    where: { orderId: order1.id, eventType: 'ORDER_DISPATCHED' },
  });
  assert(notifsAfterRedispatch.length === 1, `Expected exactly 1 dispatch notification, got ${notifsAfterRedispatch.length}`);
  console.log('  ✓ Duplicate dispatch created zero additional notifications (exactly 1 exists)');

  // ================================================================
  // Tests 37, 38, 39: Concurrent Dispatch Serialization
  // ================================================================
  console.log('\n--- Tests 37-39: Concurrent Dispatch Serialization ---');
  const orderConcurrent = await createWhatsAppOrder({
    creationIdempotencyKey: `phd-wa-concurrent-${runId}`,
    customer: {
      name: `Concurrent Customer ${runId}`,
      mobile: `98996${runId.slice(0, 5)}`,
      address: 'Concurrent Address',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
  });

  await confirmWhatsAppOrderSale({
    orderId: orderConcurrent.id,
    paymentMethod: 'UPI',
    paymentStatus: 'PAID',
    idempotencyKey: `phd-conf-conc-${runId}`,
  });

  // Attempt 2 concurrent dispatches on the same CONFIRMED order
  const [res1, res2] = await Promise.allSettled([
    dispatchOrder({
      orderId: orderConcurrent.id,
      courierName: 'Delhivery',
      trackingId: `DEL-CONC-1-${runId}`,
    }),
    dispatchOrder({
      orderId: orderConcurrent.id,
      courierName: 'BlueDart',
      trackingId: `BD-CONC-2-${runId}`,
    }),
  ]);

  const fulfilledCount = [res1, res2].filter((r) => r.status === 'fulfilled').length;
  const rejectedCount = [res1, res2].filter((r) => r.status === 'rejected').length;

  // Test 37: Concurrent dispatch allows exactly one successful request
  assert(fulfilledCount === 1, `Expected exactly 1 concurrent dispatch to pass, got ${fulfilledCount}`);
  assert(rejectedCount === 1, `Expected exactly 1 concurrent dispatch to fail, got ${rejectedCount}`);
  console.log('  ✓ Exactly 1 concurrent dispatch passed, exactly 1 rejected safely');

  // Test 38: Concurrent dispatch creates exactly one shipment
  const concurrentShipments = await prisma.shipment.findMany({ where: { orderId: orderConcurrent.id } });
  assert(concurrentShipments.length === 1, `Expected exactly 1 shipment, got ${concurrentShipments.length}`);
  console.log('  ✓ Exactly 1 shipment created under concurrent race');

  // Test 39: Concurrent dispatch creates exactly one notification
  const concurrentNotifs = await prisma.notification.findMany({
    where: { orderId: orderConcurrent.id, eventType: 'ORDER_DISPATCHED' },
  });
  assert(concurrentNotifs.length === 1, `Expected exactly 1 notification, got ${concurrentNotifs.length}`);
  console.log('  ✓ Exactly 1 ORDER_DISPATCHED notification queued under concurrent race');

  // ================================================================
  // Test 40: Shipment Creation Failure Rolls Back Order/Status/Notification
  // ================================================================
  console.log('\n--- Test 40: Rollback on Failure ---');
  const rollbackOrder = await createWhatsAppOrder({
    creationIdempotencyKey: `phd-wa-roll-${runId}`,
    customer: {
      name: `Rollback Customer ${runId}`,
      mobile: `98997${runId.slice(0, 5)}`,
      address: 'Rollback Address',
      city: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302001',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
  });

  await confirmWhatsAppOrderSale({
    orderId: rollbackOrder.id,
    paymentMethod: 'CASH',
    paymentStatus: 'PAID',
    idempotencyKey: `phd-conf-roll-${runId}`,
  });

  // Test atomic failure: inject invalid target transition or simulate transaction failure
  let rollbackFailed = false;
  try {
    await transitionOrderStatus({
      orderId: rollbackOrder.id,
      idempotencyKey: `invalid-dispatch-${rollbackOrder.id}`,
      targetStatus: OrderStatus.DISPATCHED,
      shipment: {
        courierName: '', // Invalid empty courier name inside transitionOrderStatus
        trackingId: '',
      },
    });
  } catch (err: any) {
    rollbackFailed = true;
    console.log(`  ✓ Transaction aborted on invalid shipment details: ${err.message}`);
  }
  assert(rollbackFailed, 'Invalid transition must abort');

  const rollbackOrderDb = await prisma.order.findUniqueOrThrow({ where: { id: rollbackOrder.id } });
  assert(rollbackOrderDb.status === OrderStatus.CONFIRMED, 'Order must remain CONFIRMED on abort');
  const rollbackShipments = await prisma.shipment.findMany({ where: { orderId: rollbackOrder.id } });
  assert(rollbackShipments.length === 0, 'No shipment must remain on abort');
  const rollbackTransitions = await prisma.orderStatusTransition.findMany({
    where: { orderId: rollbackOrder.id, toStatus: OrderStatus.DISPATCHED },
  });
  assert(rollbackTransitions.length === 0, 'No DISPATCHED transition must remain on abort');
  const rollbackNotifs = await prisma.notification.findMany({
    where: { orderId: rollbackOrder.id, eventType: 'ORDER_DISPATCHED' },
  });
  assert(rollbackNotifs.length === 0, 'No ORDER_DISPATCHED notification must remain on abort');
  console.log('  ✓ Complete atomic rollback verified: order remained CONFIRMED with zero partial state');

  // ================================================================
  // Tests 41 & 42: Order Details Query View & Dispatch Button Disappearance
  // ================================================================
  console.log('\n--- Tests 41-42: Order Details Query & Button Invariant ---');
  // Test 41: Order Details shows shipment after successful dispatch
  const details = await getAdminOrderDetails(order1.id);
  assert(details !== null, 'Order details must not be null');
  assert(details!.status === OrderStatus.DISPATCHED, 'Status in details must be DISPATCHED');
  assert(details!.shipment !== null, 'Shipment in details must be populated');
  assert(details!.shipment!.courierName === courierPartner, 'Shipment courierName mismatch in details');
  assert(details!.shipment!.trackingId === trackingNumber, 'Shipment trackingId mismatch in details');
  console.log('  ✓ getAdminOrderDetails returns populated shipment (courier, tracking, status)');

  // Test 42: Dispatch action is unavailable for DISPATCHED orders
  // The UI renders the button conditionally on `order.status === 'CONFIRMED'`.
  // Since `details.status === 'DISPATCHED'`, the button is definitively hidden.
  assert(details!.status !== OrderStatus.CONFIRMED, 'Order is no longer CONFIRMED, dispatch button disappears');
  console.log('  ✓ Verified order is no longer in CONFIRMED status; Dispatch button is unavailable');

  // ================================================================
  // Step 23: Test Fixture Cleanup
  // ================================================================
  console.log('\n--- Cleaning Up Test Fixtures ---');

  const allTestOrderIds = [
    order1.id,
    contactedOrder.id,
    directDelivered.id,
    cancelledOrder.id,
    onlineOrder.id,
    orderConcurrent.id,
    rollbackOrder.id,
  ];

  await prisma.notificationAttempt.deleteMany({
    where: { notification: { orderId: { in: allTestOrderIds } } },
  });
  await prisma.notification.deleteMany({
    where: { orderId: { in: allTestOrderIds } },
  });
  await prisma.orderStatusTransition.deleteMany({
    where: { orderId: { in: allTestOrderIds } },
  });
  await prisma.shipment.deleteMany({
    where: { orderId: { in: allTestOrderIds } },
  });
  await prisma.couponUsage.deleteMany({
    where: { orderId: { in: allTestOrderIds } },
  });
  await prisma.inventoryMovement.deleteMany({
    where: { referenceId: { in: allTestOrderIds } },
  });
  await prisma.orderItem.deleteMany({
    where: { orderId: { in: allTestOrderIds } },
  });
  await prisma.order.deleteMany({
    where: { id: { in: allTestOrderIds } },
  });

  await prisma.coupon.deleteMany({ where: { id: coupon.id } });

  await prisma.fifoLayer.deleteMany({
    where: { variantId: { in: [variant.id, dummyVariant.id] } },
  });
  await prisma.inventoryMovement.deleteMany({
    where: { variantId: { in: [variant.id, dummyVariant.id] } },
  });
  await prisma.inventoryItem.deleteMany({
    where: { variantId: { in: [variant.id, dummyVariant.id] } },
  });
  await prisma.productVariant.deleteMany({
    where: { productId: { in: [product.id, dummyProduct.id] } },
  });
  await prisma.product.deleteMany({
    where: { id: { in: [product.id, dummyProduct.id] } },
  });
  await prisma.category.deleteMany({ where: { id: category.id } });

  console.log('  ✓ All test orders, shipments, notifications, transitions, coupons, and products cleaned up safely');

  console.log('\n================================================================');
  console.log('ALL PHASE D ACCEPTANCE CRITERIA VERIFIED AND PASSED (42/42)!');
  console.log('================================================================');
}

runPhaseDDispatchTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
    process.exit(1);
  });
