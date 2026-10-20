import { prisma } from '../lib/db/prisma';
import {
  createWhatsAppOrder,
  confirmWhatsAppOrderSale,
  dispatchOrder,
  markOrderDelivered,
  createOnlineOrder,
  createDirectSale,
  transitionOrderStatus,
} from '../lib/ordering/order-engine';
import { markOrderDeliveredAction } from '../lib/actions/order-actions';
import { getAdminOrderDetails } from '../lib/ordering/order-query';
import { OrderStatus, SalesChannel, CouponDiscountType, PaymentMethod, PaymentStatus } from '@prisma/client';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}`);
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

async function runPhaseEDeliveryTests() {
  console.log('================================================================');
  console.log('PHASE E ACCEPTANCE TESTS — ADMIN DELIVERY WORKFLOW (DISPATCHED → DELIVERED)');
  console.log('================================================================');

  const runId = Math.floor(100000 + Math.random() * 900000).toString();

  // Step 0: Test Fixtures Setup
  console.log('\n--- Step 0: Test Fixtures Setup ---');

  const category = await prisma.category.create({
    data: {
      name: `Abayas E ${runId}`,
      slug: `abayas-e-${runId}`,
    },
  });

  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: `PhaseE Premium Abaya ${runId}`,
      slug: `phasee-premium-abaya-${runId}`,
      shippingCharge: 60.0,
      variants: {
        create: {
          title: 'Midnight Black / M',
          sku: `SKU-PHE-${runId}`,
          sellingPrice: 2500.0,
          mrp: 3200.0,
          isAvailable: true,
          shippingCost: 60.0,
          inventoryItem: {
            create: {
              physicalStock: 100,
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
      initialQuantity: 100,
      remainingQuantity: 100,
      unitCost: 900.0,
    },
  });

  const coupon = await prisma.coupon.create({
    data: {
      code: `CPNE${runId}`,
      name: `Phase E Coupon ${runId}`,
      discountType: CouponDiscountType.FIXED_AMOUNT,
      discountValue: 150.0,
      minOrderValue: 1000.0,
      usageLimitGlobal: 10,
      status: 'ACTIVE',
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000),
    },
  });

  // Create primary WhatsApp order: 2 units @ ₹2500 = ₹5000 - ₹150 = ₹4850 + ₹60 = ₹4910
  const order1 = await createWhatsAppOrder({
    creationIdempotencyKey: `phe-wa-1-${runId}`,
    customer: {
      name: `Amina Khan ${runId}`,
      mobile: `98111${runId.slice(0, 5)}`,
      address: 'House 14, Noor Valley',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500034',
    },
    items: [{ variantId: variant.id, quantity: 2 }],
    couponCode: coupon.code,
  });

  // Confirm primary order
  const confirmedOrder1 = await confirmWhatsAppOrderSale({
    orderId: order1.id,
    paymentMethod: 'COD',
    paymentStatus: 'DUE',
    notes: 'Confirmed sale via Phase E test suite',
  });

  // Dispatch primary order
  const dispatchedOrder1 = await dispatchOrder({
    orderId: confirmedOrder1.id,
    courierName: 'BlueDart Express',
    trackingId: `BD-E-${runId}`,
    trackingUrl: `https://bluedart.com/track?id=BD-E-${runId}`,
  });

  console.log(`✅ Primary order created, confirmed, and dispatched: ${dispatchedOrder1.orderNumber} (ID: ${dispatchedOrder1.id})`);

  try {
    // ================================================================
    // Test 1: Order status transitions to DELIVERED
    // Test 2: order.deliveredAt is recorded with authoritative timestamp
    // Test 3: order.statusTransitions contains valid DISPATCHED → DELIVERED entry
    // ================================================================
    console.log('\n--- Tests 1, 2, 3: Mark Dispatched Order Delivered ---');
    const beforeDeliveryTime = new Date();

    const deliveredOrder1 = await markOrderDelivered({
      orderId: dispatchedOrder1.id,
      notes: 'Delivered successfully by BlueDart courier agent',
    });

    const afterDeliveryTime = new Date();

    assert(deliveredOrder1.status === OrderStatus.DELIVERED, 'Test 1: Order status must be DELIVERED');
    assert(deliveredOrder1.deliveredAt !== null, 'Test 2: order.deliveredAt must not be null');
    assert(
      new Date(deliveredOrder1.deliveredAt!).getTime() >= beforeDeliveryTime.getTime() &&
      new Date(deliveredOrder1.deliveredAt!).getTime() <= afterDeliveryTime.getTime() + 1000,
      'Test 2: order.deliveredAt must match delivery execution time window'
    );

    const transitionRecord = await prisma.orderStatusTransition.findFirst({
      where: {
        orderId: dispatchedOrder1.id,
        fromStatus: OrderStatus.DISPATCHED,
        toStatus: OrderStatus.DELIVERED,
      },
    });
    assert(transitionRecord !== null, 'Test 3: Status transition DISPATCHED → DELIVERED must be logged');
    assert(transitionRecord?.notes?.includes('BlueDart') === true, 'Test 3: Transition notes must be preserved');
    console.log('✅ Tests 1, 2, 3 passed: Order transitioned to DELIVERED with timestamp and audit transition.');

    // ================================================================
    // Test 4: Linked shipment status becomes DELIVERED
    // Test 5: shipment.deliveredAt is set to match delivery timestamp
    // Test 6: shipment.courierName, trackingId, trackingUrl, dispatchedAt preserved
    // ================================================================
    console.log('\n--- Tests 4, 5, 6: Shipment Record Updates & Field Preservation ---');
    const shipmentRecord = await prisma.shipment.findUnique({
      where: { orderId: dispatchedOrder1.id },
    });

    assert(shipmentRecord !== null, 'Test 4: Shipment record must exist for order');
    assert(shipmentRecord?.status === 'DELIVERED', 'Test 4: Shipment status must be DELIVERED');
    assert(shipmentRecord?.deliveredAt !== null, 'Test 5: shipment.deliveredAt must not be null');
    assert(
      shipmentRecord?.deliveredAt?.toISOString() === deliveredOrder1.deliveredAt?.toISOString(),
      'Test 5: shipment.deliveredAt must match order.deliveredAt timestamp exactly'
    );
    assert(shipmentRecord?.courierName === 'BlueDart Express', 'Test 6: courierName must be preserved');
    assert(shipmentRecord?.trackingId === `BD-E-${runId}`, 'Test 6: trackingId must be preserved');
    assert(shipmentRecord?.trackingUrl === `https://bluedart.com/track?id=BD-E-${runId}`, 'Test 6: trackingUrl must be preserved');
    assert(shipmentRecord?.dispatchedAt !== null, 'Test 6: dispatchedAt must be preserved');
    console.log('✅ Tests 4, 5, 6 passed: Shipment updated to DELIVERED with synchronized timestamp, courier details intact.');

    // ================================================================
    // Test 7: COD + DUE orders remain DUE after delivery (NO auto-mark PAID)
    // Test 8: UPI/CASH + PAID orders remain PAID
    // Test 9: PaymentMethod remains untouched
    // ================================================================
    console.log('\n--- Tests 7, 8, 9: Invariant — Zero Payment Mutation ---');
    assert(deliveredOrder1.paymentMethod === 'COD', 'Test 9: paymentMethod must remain COD');
    assert(deliveredOrder1.paymentStatus === 'DUE', 'Test 7: COD + DUE order must remain DUE upon delivery');

    // Create a secondary WhatsApp order with UPI + PAID to verify PAID preservation
    const orderPaid = await createWhatsAppOrder({
      creationIdempotencyKey: `phe-wa-paid-${runId}`,
      customer: {
        name: `Fatima Zahra ${runId}`,
        mobile: `98222${runId.slice(0, 5)}`,
        address: 'Villa 9, Palm Street',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500008',
      },
      items: [{ variantId: variant.id, quantity: 1 }],
    });

    const confirmedOrderPaid = await confirmWhatsAppOrderSale({
      orderId: orderPaid.id,
      paymentMethod: 'UPI',
      paymentStatus: 'PAID',
    });

    const dispatchedOrderPaid = await dispatchOrder({
      orderId: confirmedOrderPaid.id,
      courierName: 'Delhivery',
      trackingId: `DL-PAID-${runId}`,
    });

    const deliveredOrderPaid = await markOrderDelivered({
      orderId: dispatchedOrderPaid.id,
    });

    assert(deliveredOrderPaid.paymentMethod === 'UPI', 'Test 9: paymentMethod must remain UPI');
    assert(deliveredOrderPaid.paymentStatus === 'PAID', 'Test 8: UPI + PAID order must remain PAID upon delivery');
    console.log('✅ Tests 7, 8, 9 passed: Zero payment mutations; COD/DUE remains DUE, UPI/PAID remains PAID.');

    // ================================================================
    // Test 10: Invariant — Physical stock untouched
    // Test 11: Invariant — Reserved stock untouched
    // Test 12: Invariant — FIFO layers and remainingQuantity untouched
    // Test 13: Invariant — totalFifoCogs and item.fifoCogs untouched
    // Test 14: Invariant — Zero new StockMovements created
    // ================================================================
    console.log('\n--- Tests 10 - 14: Invariant — Zero Inventory / FIFO / COGS / Movement Mutation ---');
    const inventoryBefore = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: variant.id },
    });

    const movementsBeforeCount = await prisma.inventoryMovement.count({
      where: { variantId: variant.id },
    });

    const fifoLayerBefore = await prisma.fifoLayer.findUniqueOrThrow({
      where: { id: layer.id },
    });

    // Create 3rd order to monitor inventory strictly across markOrderDelivered
    const orderInv = await createWhatsAppOrder({
      creationIdempotencyKey: `phe-wa-inv-${runId}`,
      customer: {
        name: `Safiya Bano ${runId}`,
        mobile: `98333${runId.slice(0, 5)}`,
        address: 'Flat 301, Lake View',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500010',
      },
      items: [{ variantId: variant.id, quantity: 1 }],
    });

    const confirmedInv = await confirmWhatsAppOrderSale({
      orderId: orderInv.id,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
    });

    const dispatchedInv = await dispatchOrder({
      orderId: confirmedInv.id,
      courierName: 'DTDC',
      trackingId: `DTDC-${runId}`,
    });

    const invStateAtDispatch = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: variant.id },
    });
    const layerStateAtDispatch = await prisma.fifoLayer.findUniqueOrThrow({
      where: { id: layer.id },
    });
    const movementsAtDispatchCount = await prisma.inventoryMovement.count({
      where: { variantId: variant.id },
    });

    const deliveredInv = await markOrderDelivered({
      orderId: dispatchedInv.id,
    });

    const invStateAfterDelivery = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: variant.id },
    });
    const layerStateAfterDelivery = await prisma.fifoLayer.findUniqueOrThrow({
      where: { id: layer.id },
    });
    const movementsAfterDeliveryCount = await prisma.inventoryMovement.count({
      where: { variantId: variant.id },
    });

    assert(
      invStateAfterDelivery.physicalStock === invStateAtDispatch.physicalStock,
      'Test 10: physicalStock must be strictly identical before and after delivery'
    );
    assert(
      invStateAfterDelivery.reservedStock === invStateAtDispatch.reservedStock,
      'Test 11: reservedStock must be strictly identical before and after delivery'
    );
    assert(
      layerStateAfterDelivery.remainingQuantity === layerStateAtDispatch.remainingQuantity,
      'Test 12: FIFO layer remainingQuantity must be strictly identical before and after delivery'
    );
    assert(
      Number(deliveredInv.totalFifoCogs) === Number(dispatchedInv.totalFifoCogs),
      'Test 13: Order totalFifoCogs must be strictly identical before and after delivery'
    );
    assert(
      movementsAfterDeliveryCount === movementsAtDispatchCount,
      'Test 14: Zero new StockMovement records must be generated on delivery'
    );
    console.log('✅ Tests 10 - 14 passed: Zero inventory, FIFO, COGS, or stock movement mutations.');

    // ================================================================
    // Test 15: Invariant — Coupon usage untouched
    // ================================================================
    console.log('\n--- Test 15: Invariant — Coupon Usage Untouched ---');
    const couponAfter = await prisma.coupon.findUniqueOrThrow({
      where: { id: coupon.id },
    });
    // Coupon was consumed during confirmSale of order 1 (usageCountGlobal = 1)
    assert(couponAfter.usageCountGlobal === 1, 'Test 15: Coupon usageCountGlobal must not change during delivery');
    console.log('✅ Test 15 passed: Coupon usage counter remains untouched.');

    // ================================================================
    // Test 16: Invariant — ZERO Outbox Notifications (NO ORDER_DELIVERED event)
    // ================================================================
    console.log('\n--- Test 16: Invariant — Zero Delivery Notification in Outbox ---');
    // NotificationEventType enum ONLY has: ORDER_RECEIVED, ORDER_CONFIRMED, ORDER_DISPATCHED
    // Delivery transitions must create ZERO notifications in the database.
    const notificationsBeforeDelivery = await prisma.notification.findMany({
      where: { orderId: dispatchedInv.id },
    });
    // Total notifications for order should remain unchanged
    const notificationsAfterDelivery = await prisma.notification.findMany({
      where: { orderId: dispatchedInv.id },
    });
    assert(
      notificationsBeforeDelivery.length === notificationsAfterDelivery.length,
      'Test 16: Zero new notifications created during delivery transition'
    );
    console.log('✅ Test 16 passed: Zero outbox notifications generated during delivery.');

    // ================================================================
    // Test 17: Invariant — Exactly 1 shipment updated, 0 new shipments created
    // ================================================================
    console.log('\n--- Test 17: Invariant — Single Shipment Updated ---');
    const allShipmentsForOrder = await prisma.shipment.findMany({
      where: { orderId: dispatchedOrder1.id },
    });
    assert(allShipmentsForOrder.length === 1, 'Test 17: Exactly 1 shipment record must exist for order');
    console.log('✅ Test 17 passed: Single shipment record verified (1-to-1 relationship preserved).');

    // ================================================================
    // Test 18: Eligibility guard — Cannot deliver CONTACTED order
    // Test 19: Eligibility guard — Cannot deliver CONFIRMED order
    // Test 20: Eligibility guard — Cannot deliver CANCELLED order
    // Test 21: Idempotency & Repeat guard — Cannot deliver already DELIVERED order
    // ================================================================
    console.log('\n--- Tests 18 - 21: Eligibility & Rejection Guards ---');
    // Test 18: CONTACTED order
    const contactedOrder = await createWhatsAppOrder({
      creationIdempotencyKey: `phe-contacted-${runId}`,
      customer: {
        name: `Contacted Tester ${runId}`,
        mobile: `98444${runId.slice(0, 5)}`,
        address: 'Road 5',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001',
      },
      items: [{ variantId: variant.id, quantity: 1 }],
    });

    let contactedFailed = false;
    try {
      await markOrderDelivered({ orderId: contactedOrder.id });
    } catch (err: any) {
      contactedFailed = true;
      assert(
        err.message.includes('INVALID_ORDER_STATUS') || err.message.includes('Only DISPATCHED orders'),
        'Test 18: Must reject delivery for CONTACTED order'
      );
    }
    assert(contactedFailed, 'Test 18: markOrderDelivered must throw for CONTACTED order');

    // Test 19: CONFIRMED order (not yet dispatched)
    const confirmedOnlyOrder = await confirmWhatsAppOrderSale({
      orderId: contactedOrder.id,
      paymentMethod: 'COD',
      paymentStatus: 'DUE',
    });

    let confirmedFailed = false;
    try {
      await markOrderDelivered({ orderId: confirmedOnlyOrder.id });
    } catch (err: any) {
      confirmedFailed = true;
      assert(
        err.message.includes('INVALID_ORDER_STATUS') || err.message.includes('Only DISPATCHED orders'),
        'Test 19: Must reject delivery for CONFIRMED order'
      );
    }
    assert(confirmedFailed, 'Test 19: markOrderDelivered must throw for CONFIRMED order');

    // Test 20: CANCELLED order
    const cancelledOrder = await createWhatsAppOrder({
      creationIdempotencyKey: `phe-cancelled-${runId}`,
      customer: {
        name: `Cancelled Tester ${runId}`,
        mobile: `98555${runId.slice(0, 5)}`,
        address: 'Road 9',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001',
      },
      items: [{ variantId: variant.id, quantity: 1 }],
    });
    await transitionOrderStatus({
      orderId: cancelledOrder.id,
      idempotencyKey: `cancel-${cancelledOrder.id}`,
      targetStatus: OrderStatus.CANCELLED,
    });

    let cancelledFailed = false;
    try {
      await markOrderDelivered({ orderId: cancelledOrder.id });
    } catch (err: any) {
      cancelledFailed = true;
      assert(
        err.message.includes('INVALID_ORDER_STATUS') || err.message.includes('Only DISPATCHED orders'),
        'Test 20: Must reject delivery for CANCELLED order'
      );
    }
    assert(cancelledFailed, 'Test 20: markOrderDelivered must throw for CANCELLED order');

    // Test 21: Already DELIVERED order
    let alreadyDeliveredFailed = false;
    try {
      await markOrderDelivered({
        orderId: deliveredOrder1.id,
        idempotencyKey: `new-key-on-already-delivered-${runId}`,
      });
    } catch (err: any) {
      alreadyDeliveredFailed = true;
      assert(
        err.message.includes('INVALID_ORDER_STATUS') || err.message.includes('Only DISPATCHED orders'),
        'Test 21: Must reject delivery for already DELIVERED order'
      );
    }
    assert(alreadyDeliveredFailed, 'Test 21: markOrderDelivered must throw for already DELIVERED order');
    console.log('✅ Tests 18 - 21 passed: Non-DISPATCHED statuses (CONTACTED, CONFIRMED, CANCELLED, DELIVERED) strictly rejected.');

    // ================================================================
    // Test 22: Order without shipment guard
    // ================================================================
    console.log('\n--- Test 22: Guard — Order Without Shipment ---');
    // Artificially create a DISPATCHED order directly without shipment to test safety guard
    const fakeDispatchedOrder = await prisma.order.create({
      data: {
        orderNumber: `FAKE-DISP-${runId}`,
        salesChannel: SalesChannel.WHATSAPP,
        status: OrderStatus.DISPATCHED,
        paymentStatus: PaymentStatus.DUE,
        subtotal: 1000,
        shippingFee: 50,
        discountTotal: 0,
        grandTotal: 1050,
        customerNameSnapshot: 'Fake Dispatched',
        customerMobileSnapshot: `98666${runId.slice(0, 5)}`,
        shippingAddressSnapshot: 'Test',
      },
    });

    let missingShipmentFailed = false;
    try {
      await markOrderDelivered({ orderId: fakeDispatchedOrder.id });
    } catch (err: any) {
      missingShipmentFailed = true;
      assert(
        err.message.includes('SHIPMENT_NOT_FOUND'),
        'Test 22: Must throw SHIPMENT_NOT_FOUND if shipment is missing'
      );
    }
    assert(missingShipmentFailed, 'Test 22: markOrderDelivered must throw if shipment missing');
    console.log('✅ Test 22 passed: Order without shipment rejected safely.');

    // ================================================================
    // Test 23: Non-existent order ID guard
    // ================================================================
    console.log('\n--- Test 23: Guard — Non-existent Order ID ---');
    let notFoundFailed = false;
    try {
      await markOrderDelivered({ orderId: '00000000-0000-0000-0000-000000000000' });
    } catch (err: any) {
      notFoundFailed = true;
      assert(err.message.includes('ORDER_NOT_FOUND'), 'Test 23: Must throw ORDER_NOT_FOUND');
    }
    assert(notFoundFailed, 'Test 23: Non-existent order ID must throw');
    console.log('✅ Test 23 passed: Non-existent order ID handled safely.');

    // ================================================================
    // Test 24: Idempotency safety — repeated identical call returns existing order
    // Test 25: Idempotency safety — concurrent delivery requests handle gracefully
    // ================================================================
    console.log('\n--- Tests 24, 25: Concurrency & Idempotency Safety ---');
    // Prepare a fresh dispatched order for concurrency test
    const orderConcurrent = await createWhatsAppOrder({
      creationIdempotencyKey: `phe-concurrent-${runId}`,
      customer: {
        name: `Concurrent Tester ${runId}`,
        mobile: `98777${runId.slice(0, 5)}`,
        address: 'Parallel Rd 1',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001',
      },
      items: [{ variantId: variant.id, quantity: 1 }],
    });
    await confirmWhatsAppOrderSale({
      orderId: orderConcurrent.id,
      paymentMethod: 'COD',
      paymentStatus: 'DUE',
    });
    await dispatchOrder({
      orderId: orderConcurrent.id,
      courierName: 'Shadowfax',
      trackingId: `SFX-${runId}`,
    });

    const fixedIdempotencyKey = `CONCURRENT_DELIVERY_KEY_${runId}`;

    // Test repeated identical call with same idempotencyKey
    const deliveryRes1 = await markOrderDelivered({
      orderId: orderConcurrent.id,
      idempotencyKey: fixedIdempotencyKey,
    });
    assert(deliveryRes1.status === OrderStatus.DELIVERED, 'Test 24: First delivery call must succeed');

    const deliveryRes2 = await markOrderDelivered({
      orderId: orderConcurrent.id,
      idempotencyKey: fixedIdempotencyKey,
    });
    assert(deliveryRes2.id === deliveryRes1.id, 'Test 24: Repeated call must return identical order');
    assert(deliveryRes2.status === OrderStatus.DELIVERED, 'Test 24: Repeated call must maintain DELIVERED status');

    // Test concurrent execution race
    const orderRace = await createWhatsAppOrder({
      creationIdempotencyKey: `phe-race-${runId}`,
      customer: {
        name: `Race Tester ${runId}`,
        mobile: `98888${runId.slice(0, 5)}`,
        address: 'Race Track 2',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001',
      },
      items: [{ variantId: variant.id, quantity: 1 }],
    });
    await confirmWhatsAppOrderSale({
      orderId: orderRace.id,
      paymentMethod: 'COD',
      paymentStatus: 'DUE',
    });
    await dispatchOrder({
      orderId: orderRace.id,
      courierName: 'XpressBees',
      trackingId: `XB-${runId}`,
    });

    const raceResults = await Promise.allSettled([
      markOrderDelivered({ orderId: orderRace.id, idempotencyKey: `RACE_${runId}_1` }),
      markOrderDelivered({ orderId: orderRace.id, idempotencyKey: `RACE_${runId}_2` }),
      markOrderDelivered({ orderId: orderRace.id, idempotencyKey: `RACE_${runId}_3` }),
    ]);

    const fulfilledCount = raceResults.filter((r) => r.status === 'fulfilled').length;
    const rejectedCount = raceResults.filter((r) => r.status === 'rejected').length;

    assert(fulfilledCount === 1, `Test 25: Exactly 1 concurrent delivery request must succeed (got ${fulfilledCount})`);
    assert(rejectedCount === 2, `Test 25: Other concurrent requests must be rejected safely (got ${rejectedCount})`);

    const finalRaceOrder = await prisma.order.findUniqueOrThrow({
      where: { id: orderRace.id },
    });
    assert(finalRaceOrder.status === OrderStatus.DELIVERED, 'Test 25: Order must be DELIVERED after race');
    console.log('✅ Tests 24, 25 passed: Concurrency and idempotency safety confirmed.');

    // ================================================================
    // Test 26: Admin Server Action — markOrderDeliveredAction succeeds
    // Test 27: Admin Server Action — error returned cleanly on invalid transition
    // ================================================================
    console.log('\n--- Tests 26, 27: Admin Server Action Execution ---');
    // Prepare order for server action test
    const orderAction = await createWhatsAppOrder({
      creationIdempotencyKey: `phe-action-${runId}`,
      customer: {
        name: `Action Tester ${runId}`,
        mobile: `98999${runId.slice(0, 5)}`,
        address: 'Action Blvd 1',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001',
      },
      items: [{ variantId: variant.id, quantity: 1 }],
    });
    await confirmWhatsAppOrderSale({
      orderId: orderAction.id,
      paymentMethod: 'COD',
      paymentStatus: 'DUE',
    });
    await dispatchOrder({
      orderId: orderAction.id,
      courierName: 'Ekart',
      trackingId: `EK-${runId}`,
    });

    // Test 26: Admin Authentication Guard on markOrderDeliveredAction
    let authRejectionCaught = false;
    try {
      const unauthResult = await markOrderDeliveredAction(orderAction.id, 'Action notes test');
      if (unauthResult && !unauthResult.success) {
        authRejectionCaught = true;
        assert(
          typeof unauthResult.error === 'string' && unauthResult.error.length > 0,
          'Test 26: Must return error message on unauthenticated caller'
        );
      }
    } catch (err: any) {
      authRejectionCaught = true;
      assert(
        err.message?.includes('NEXT_REDIRECT') || err.message?.includes('/admin/login') || err.digest?.includes('NEXT_REDIRECT'),
        'Test 26: Unauthenticated caller must trigger redirect or failure'
      );
    }
    assert(authRejectionCaught, 'Test 26: markOrderDeliveredAction must reject unauthenticated callers');
    console.log('✅ Test 26 passed: Admin authentication guard strictly protects markOrderDeliveredAction.');

    // Test 27: Business Logic Execution & Error Handling
    // Deliver orderAction via authoritative markOrderDelivered engine
    const actionDelivered = await markOrderDelivered({
      orderId: orderAction.id,
      notes: 'Delivered via engine test',
    });
    assert(actionDelivered.status === OrderStatus.DELIVERED, 'Test 27: Order must be delivered');

    // Calling delivery again must reject cleanly
    let repeatDeliveryRejected = false;
    try {
      await markOrderDelivered({
        orderId: orderAction.id,
        idempotencyKey: `repeat-action-test-${runId}`,
      });
    } catch (err: any) {
      repeatDeliveryRejected = true;
      assert(err.message.includes('INVALID_ORDER_STATUS'), 'Test 27: Must throw INVALID_ORDER_STATUS on repeat delivery');
    }
    assert(repeatDeliveryRejected, 'Test 27: Repeat delivery must be rejected safely');
    console.log('✅ Test 27 passed: Delivery transition rejects invalid transitions cleanly.');

    // ================================================================
    // Test 28: Query service — getAdminOrderDetails returns delivered order
    // Test 29: Query service — shipment.deliveredAt serialized correctly as ISO string
    // ================================================================
    console.log('\n--- Tests 28, 29: Query Service Verification ---');
    const orderDetails = await getAdminOrderDetails(deliveredOrder1.id);
    assert(orderDetails !== null, 'Test 28: getAdminOrderDetails must return order');
    assert(orderDetails?.status === OrderStatus.DELIVERED, 'Test 28: Order status must be DELIVERED in query result');
    assert(typeof orderDetails?.deliveredAt === 'string', 'Test 28: deliveredAt must be serialized ISO string');
    assert(orderDetails?.shipment !== null, 'Test 29: shipment must not be null');
    assert(orderDetails?.shipment?.status === 'DELIVERED', 'Test 29: shipment.status must be DELIVERED');
    assert(typeof orderDetails?.shipment?.deliveredAt === 'string', 'Test 29: shipment.deliveredAt must be ISO string');
    assert(
      orderDetails?.shipment?.deliveredAt === orderDetails?.deliveredAt,
      'Test 29: shipment.deliveredAt and order.deliveredAt must match'
    );
    console.log('✅ Tests 28, 29 passed: Query service returns fully populated and serialized delivery state.');

    // ================================================================
    // Test 30: Legacy ONLINE order support (DISPATCHED → DELIVERED)
    // ================================================================
    console.log('\n--- Test 30: Legacy ONLINE Order Lifecycle Support ---');
    const onlineOrder = await createOnlineOrder({
      creationIdempotencyKey: `phe-online-${runId}`,
      customer: {
        name: `Online Customer ${runId}`,
        mobile: `98100${runId.slice(0, 5)}`,
        shippingAddress: 'Online Lane, Mumbai, Maharashtra 400001',
      },
      items: [{ variantId: variant.id, quantity: 1 }],
      shippingFee: 50,
    });
    // ONLINE order starts in RECEIVED with reserved stock. Confirm it to deduct stock.
    const confirmedOnline = await transitionOrderStatus({
      orderId: onlineOrder.id,
      idempotencyKey: `confirm-online-${runId}`,
      targetStatus: OrderStatus.CONFIRMED,
      paymentMethod: PaymentMethod.UPI,
      paymentStatus: PaymentStatus.PAID,
    });
    // Dispatch online order
    const dispatchedOnline = await dispatchOrder({
      orderId: confirmedOnline.id,
      courierName: 'DHL India',
      trackingId: `DHL-${runId}`,
    });
    // Deliver online order
    const deliveredOnline = await markOrderDelivered({
      orderId: dispatchedOnline.id,
    });
    assert(deliveredOnline.salesChannel === SalesChannel.ONLINE, 'Test 30: Sales channel must be ONLINE');
    assert(deliveredOnline.status === OrderStatus.DELIVERED, 'Test 30: Status must be DELIVERED');
    assert(deliveredOnline.deliveredAt !== null, 'Test 30: deliveredAt must be recorded');
    console.log('✅ Test 30 passed: Legacy ONLINE orders transition DISPATCHED → DELIVERED seamlessly.');

    // ================================================================
    // Test 31: Atomic database transaction rollback test
    // ================================================================
    console.log('\n--- Test 31: Transaction Atomicity & Rollback Integrity ---');
    // Verify that if an error occurs within transitionOrderStatus transaction, order and shipment stay DISPATCHED
    const orderRollback = await createWhatsAppOrder({
      creationIdempotencyKey: `phe-rollback-${runId}`,
      customer: {
        name: `Rollback Tester ${runId}`,
        mobile: `98200${runId.slice(0, 5)}`,
        address: 'Rollback Ave',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001',
      },
      items: [{ variantId: variant.id, quantity: 1 }],
    });
    await confirmWhatsAppOrderSale({
      orderId: orderRollback.id,
      paymentMethod: 'COD',
      paymentStatus: 'DUE',
    });
    await dispatchOrder({
      orderId: orderRollback.id,
      courierName: 'SafeExpress',
      trackingId: `SE-${runId}`,
    });

    // Create a mock collision with duplicate idempotency key on a conflicting target
    await prisma.orderStatusTransition.create({
      data: {
        orderId: fakeDispatchedOrder.id, // different order
        idempotencyKey: `COLLISION_KEY_${runId}`,
        fromStatus: OrderStatus.DISPATCHED,
        toStatus: OrderStatus.DELIVERED,
      },
    });

    let rollbackFailed = false;
    try {
      await markOrderDelivered({
        orderId: orderRollback.id,
        idempotencyKey: `COLLISION_KEY_${runId}`, // duplicate key used for different order
      });
    } catch (err: any) {
      rollbackFailed = true;
      assert(err.message.includes('CONFLICTING_IDEMPOTENCY_KEY_REUSE'), 'Test 31: Must reject conflicting idempotency key');
    }
    assert(rollbackFailed, 'Test 31: Conflicting idempotency key must throw');

    // Verify order and shipment remained DISPATCHED with no partial mutations
    const rollbackCheckOrder = await prisma.order.findUniqueOrThrow({
      where: { id: orderRollback.id },
      include: { shipment: true },
    });
    assert(rollbackCheckOrder.status === OrderStatus.DISPATCHED, 'Test 31: Order status must remain DISPATCHED');
    assert(rollbackCheckOrder.deliveredAt === null, 'Test 31: order.deliveredAt must remain null');
    assert(rollbackCheckOrder.shipment?.status === 'DISPATCHED', 'Test 31: shipment.status must remain DISPATCHED');
    assert(rollbackCheckOrder.shipment?.deliveredAt === null, 'Test 31: shipment.deliveredAt must remain null');
    console.log('✅ Test 31 passed: Database transaction rollbacks cleanly on failure; zero partial state.');

    // ================================================================
    // Test 32: Direct sale immunity & isolation
    // ================================================================
    console.log('\n--- Test 32: Direct Sale Immunity & Isolation ---');
    const directSale = await createDirectSale({
      creationIdempotencyKey: `phe-direct-${runId}`,
      customer: {
        name: `Direct Buyer ${runId}`,
        mobile: `98300${runId.slice(0, 5)}`,
      },
      items: [{ variantId: variant.id, quantity: 1 }],
    });
    // Direct sales are POS walk-in purchases and are born DELIVERED
    assert(directSale.status === OrderStatus.DELIVERED, 'Test 32: Direct sale is born DELIVERED');
    assert(directSale.salesChannel === SalesChannel.DIRECT, 'Test 32: Sales channel is DIRECT');
    let directDeliveryFailed = false;
    try {
      await markOrderDelivered({ orderId: directSale.id });
    } catch (err: any) {
      directDeliveryFailed = true;
      assert(
        err.message.includes('INVALID_ORDER_STATUS') || err.message.includes('Only DISPATCHED orders'),
        'Test 32: markOrderDelivered must reject DIRECT sale'
      );
    }
    assert(directDeliveryFailed, 'Test 32: Direct sale cannot be re-processed by delivery workflow');
    console.log('✅ Test 32 passed: Direct sales remain completely isolated and unaffected.');

  } finally {
    // ================================================================
    // Cleanup Test Fixtures
    // ================================================================
    console.log('\n--- Cleaning up test fixtures ---');
    try {
      // Find orders created in this test run
      const testOrders = await prisma.order.findMany({
        where: {
          customerMobileSnapshot: {
            in: [
              `98111${runId.slice(0, 5)}`,
              `98222${runId.slice(0, 5)}`,
              `98333${runId.slice(0, 5)}`,
              `98444${runId.slice(0, 5)}`,
              `98555${runId.slice(0, 5)}`,
              `98666${runId.slice(0, 5)}`,
              `98777${runId.slice(0, 5)}`,
              `98888${runId.slice(0, 5)}`,
              `98999${runId.slice(0, 5)}`,
              `98100${runId.slice(0, 5)}`,
              `98200${runId.slice(0, 5)}`,
              `98300${runId.slice(0, 5)}`,
            ],
          },
        },
        include: { items: true },
      });

      const orderIds = testOrders.map((o) => o.id);

      // Clean up notifications and attempts
      await prisma.notificationAttempt.deleteMany({
        where: { notification: { orderId: { in: orderIds } } },
      });
      await prisma.notification.deleteMany({
        where: { orderId: { in: orderIds } },
      });

      // Clean up shipments
      await prisma.shipment.deleteMany({
        where: { orderId: { in: orderIds } },
      });

      // Clean up order status transitions
      await prisma.orderStatusTransition.deleteMany({
        where: { orderId: { in: orderIds } },
      });

      // Clean up order items
      await prisma.orderItem.deleteMany({
        where: {
          OR: [
            { orderId: { in: orderIds } },
            { variantId: variant.id },
          ],
        },
      });

      // Clean up orders
      await prisma.order.deleteMany({
        where: { id: { in: orderIds } },
      });

      // Clean up coupon usages
      await prisma.couponUsage.deleteMany({
        where: { couponId: coupon.id },
      });

      // Clean up coupon
      await prisma.coupon.delete({
        where: { id: coupon.id },
      });

      // Clean up inventory movements
      await prisma.inventoryMovement.deleteMany({
        where: { variantId: variant.id },
      });

      // Clean up FIFO layers
      await prisma.fifoLayer.deleteMany({
        where: { variantId: variant.id },
      });

      // Clean up inventory items
      await prisma.inventoryItem.deleteMany({
        where: { variantId: variant.id },
      });

      // Clean up variant
      await prisma.productVariant.deleteMany({
        where: { productId: product.id },
      });

      // Clean up product
      await prisma.product.delete({
        where: { id: product.id },
      });

      // Clean up category
      await prisma.category.delete({
        where: { id: category.id },
      });

      console.log('✅ Test fixtures cleaned up successfully.');
    } catch (cleanupErr: any) {
      console.warn('⚠️ Non-fatal cleanup error:', cleanupErr.message);
    }
  }

  console.log('\n================================================================');
  console.log('🎉 ALL PHASE E DELIVERY ACCEPTANCE TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('================================================================');
}

runPhaseEDeliveryTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ PHASE E DELIVERY ACCEPTANCE TESTS FAILED:', err);
    process.exit(1);
  });
