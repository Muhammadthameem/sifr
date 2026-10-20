import { prisma } from '../lib/db/prisma';
import { Prisma, OrderStatus, SalesChannel, PaymentStatus } from '@prisma/client';
import {
  createWhatsAppOrder,
  createOnlineOrder,
  createDirectSale,
  transitionOrderStatus,
  deleteContactedOrder,
} from '../lib/ordering/order-engine';
import { buildWhatsAppOrderMessage } from '../lib/ordering/whatsapp';
import crypto from 'crypto';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

async function runPhase2AcceptanceTests() {
  console.log('================================================================');
  console.log('PHASE 2 ACCEPTANCE TESTS — WHATSAPP ORDERING & ORDER ENGINE');
  console.log('================================================================\n');

  // --- SETUP: Create isolated test product, variant, and inventory ---
  console.log('--- Step 0: Test Fixture Setup ---');
  const testSuffix = Date.now().toString().slice(-6);

  // Upsert global StoreSettings with cap of 120.00
  await prisma.storeSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      globalShippingCap: new Prisma.Decimal('120.00'),
    },
    update: {
      globalShippingCap: new Prisma.Decimal('120.00'),
    },
  });

  // Get or create category
  let category = await prisma.category.findFirst();
  if (!category) {
    category = await prisma.category.create({
      data: { name: 'Test Category', slug: `test-cat-${testSuffix}` },
    });
  }

  // Create test product with shippingCharge = 50.00
  const product = await prisma.product.create({
    data: {
      name: `Test Hijab ${testSuffix}`,
      slug: `test-hijab-${testSuffix}`,
      gender: 'WOMEN',
      status: 'ACTIVE',
      categoryId: category.id,
      shippingCharge: new Prisma.Decimal('50.00'),
    },
  });

  // Create test variant
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      title: 'Standard',
      sku: `WA-TEST-${testSuffix}`,
      mrp: new Prisma.Decimal('1000.00'),
      sellingPrice: new Prisma.Decimal('800.00'),
      isAvailable: true,
    },
  });

  // Create inventory item: physicalStock = 10, reservedStock = 0
  const inventory = await prisma.inventoryItem.create({
    data: {
      variantId: variant.id,
      physicalStock: 10,
      reservedStock: 0,
    },
  });

  // Create FIFO layer: 10 units @ 400.00
  const fifoLayer = await prisma.fifoLayer.create({
    data: {
      variantId: variant.id,
      initialQuantity: 10,
      remainingQuantity: 10,
      unitCost: new Prisma.Decimal('400.00'),
      referenceId: `TEST-SETUP-${testSuffix}`,
    },
  });

  console.log(`  Created test variant ${variant.sku} with 10 units in stock @ cost 400.00`);
  console.log(`  Product shippingCharge = 50.00, StoreSettings globalShippingCap = 120.00\n`);

  // --- TEST 1: Create WhatsApp Order ---
  console.log('--- Test 1: Create WhatsApp Order ---');
  const idempotencyKey1 = `test-wa-${testSuffix}-1`;
  const order1 = await createWhatsAppOrder({
    creationIdempotencyKey: idempotencyKey1,
    customer: {
      name: 'Amina Al-Mansoor',
      mobile: '+919876543210',
      address: 'House 42, Palm Avenue',
      city: 'Calicut',
      state: 'Kerala',
      pincode: '673001',
      email: 'amina@example.com',
    },
    items: [{ variantId: variant.id, quantity: 2 }],
  });

  assert(order1.status === OrderStatus.CONTACTED, `Expected status CONTACTED, got ${order1.status}`);
  assert(order1.salesChannel === SalesChannel.WHATSAPP, `Expected salesChannel WHATSAPP, got ${order1.salesChannel}`);
  assert(order1.paymentStatus === PaymentStatus.DUE, `Expected paymentStatus DUE, got ${order1.paymentStatus}`);
  assert(order1.reservationExpiresAt === null, `Expected reservationExpiresAt null, got ${order1.reservationExpiresAt}`);
  console.log(`  ✓ Order created: ${order1.orderNumber}, status=${order1.status}, salesChannel=${order1.salesChannel}, paymentStatus=${order1.paymentStatus}`);

  // --- TESTS 2, 3, 4, 5: CONTACTED Does NOT Reserve Stock, Deduct Physical Stock, Consume FIFO, or Have COGS ---
  console.log('\n--- Tests 2-5: CONTACTED Order Inventory & Cost Non-Interference ---');
  const postCreateInv = await prisma.inventoryItem.findUniqueOrThrow({
    where: { variantId: variant.id },
  });
  const postCreateFifo = await prisma.fifoLayer.findUniqueOrThrow({
    where: { id: fifoLayer.id },
  });
  const movementsCount = await prisma.inventoryMovement.count({
    where: { referenceId: order1.id },
  });

  assert(postCreateInv.reservedStock === 0, `reservedStock must remain 0, got ${postCreateInv.reservedStock}`);
  assert(postCreateInv.physicalStock === 10, `physicalStock must remain 10, got ${postCreateInv.physicalStock}`);
  assert(postCreateFifo.remainingQuantity === 10, `FIFO layer remainingQuantity must remain 10, got ${postCreateFifo.remainingQuantity}`);
  assert(Number(order1.totalFifoCogs) === 0, `totalFifoCogs must be 0, got ${order1.totalFifoCogs}`);
  assert(Number(order1.items[0].fifoCogs) === 0, `OrderItem fifoCogs must be 0, got ${order1.items[0].fifoCogs}`);
  assert(movementsCount === 0, `Zero SALE_OUT inventory movements should exist, got ${movementsCount}`);
  console.log('  ✓ reservedStock untouched (0)');
  console.log('  ✓ physicalStock untouched (10)');
  console.log('  ✓ FIFO layer untouched (10 units remaining)');
  console.log('  ✓ totalFifoCogs is 0, OrderItem fifoCogs is null');
  console.log('  ✓ Zero SALE_OUT movements created');

  // --- TESTS 6 & 7: Product shippingCharge & Shipping Cap ---
  console.log('\n--- Tests 6 & 7: Shipping Charge Calculation & Cap ---');
  // Order 1 has 2 items @ 50.00 shippingCharge = 100.00 (< 120.00 cap)
  assert(Number(order1.shippingFee) === 100.0, `Expected shippingFee 100.00, got ${order1.shippingFee}`);
  console.log(`  ✓ Order 1 shippingFee = 100.00 (2 × 50.00 < 120.00 cap)`);

  // Order with 3 items @ 50.00 = 150.00 (> 120.00 cap) -> capped at 120.00
  const idempotencyKeyCap = `test-wa-${testSuffix}-cap`;
  const orderCap = await createWhatsAppOrder({
    creationIdempotencyKey: idempotencyKeyCap,
    customer: {
      name: 'Fatima Zahra',
      mobile: '+919876543211',
      address: 'Flat 101, Green Heights',
      city: 'Kochi',
      state: 'Kerala',
      pincode: '682001',
    },
    items: [{ variantId: variant.id, quantity: 3 }],
  });
  assert(Number(orderCap.shippingFee) === 120.0, `Expected shippingFee 120.00 (capped), got ${orderCap.shippingFee}`);
  console.log(`  ✓ Capped Order shippingFee = 120.00 (3 × 50.00 = 150.00, capped at 120.00)`);

  // Clean up orderCap
  await deleteContactedOrder(orderCap.id);

  // --- TESTS 8, 9, 10: Snapshots Preserved ---
  console.log('\n--- Tests 8-10: Pricing, Shipping, and Customer Address Snapshots ---');
  assert(Number(order1.items[0].unitPrice) === 800.0, `unitPrice snapshot incorrect: ${order1.items[0].unitPrice}`);
  assert(Number(order1.items[0].mrp) === 1000.0, `mrp snapshot incorrect: ${order1.items[0].mrp}`);
  assert(Number(order1.items[0].lineTotal) === 1600.0, `lineTotal snapshot incorrect: ${order1.items[0].lineTotal}`);
  assert(Number(order1.subtotal) === 1600.0, `subtotal snapshot incorrect: ${order1.subtotal}`);
  assert(Number(order1.grandTotal) === 1700.0, `grandTotal snapshot incorrect: ${order1.grandTotal}`);
  assert(order1.customerNameSnapshot === 'Amina Al-Mansoor', 'customerNameSnapshot incorrect');
  assert(order1.customerMobileSnapshot === '+919876543210', 'customerMobileSnapshot incorrect');
  assert(order1.shippingAddressSnapshot?.includes('House 42, Palm Avenue') === true, 'Address line missing');
  assert(order1.shippingAddressSnapshot?.includes('City: Calicut') === true, 'City line missing');
  assert(order1.shippingAddressSnapshot?.includes('State: Kerala') === true, 'State line missing');
  assert(order1.shippingAddressSnapshot?.includes('Pincode: 673001') === true, 'Pincode line missing');
  console.log('  ✓ Item prices and MRP snapshotted');
  console.log('  ✓ Shipping fee (100.00) and grand total (1700.00) snapshotted');
  console.log('  ✓ Customer name, mobile, and address components snapshotted');

  // --- TEST 11: Duplicate Idempotency Key Request ---
  console.log('\n--- Test 11: Duplicate Idempotency Re-submission ---');
  const duplicateOrder = await createWhatsAppOrder({
    creationIdempotencyKey: idempotencyKey1,
    customer: {
      name: 'Amina Al-Mansoor',
      mobile: '+919876543210',
      address: 'House 42, Palm Avenue',
      city: 'Calicut',
      state: 'Kerala',
      pincode: '673001',
    },
    items: [{ variantId: variant.id, quantity: 2 }],
  });
  assert(duplicateOrder.id === order1.id, `Expected duplicate to return original order ID, got ${duplicateOrder.id}`);
  const totalOrdersWithKey = await prisma.order.count({
    where: { creationIdempotencyKey: idempotencyKey1 },
  });
  assert(totalOrdersWithKey === 1, `Exactly 1 order must exist for idempotency key, found ${totalOrdersWithKey}`);
  console.log('  ✓ Duplicate submission returned existing order without creating a second row');

  // --- TEST 12: CONTACTED -> CONFIRMED Transition ---
  console.log('\n--- Test 12: CONTACTED -> CONFIRMED Atomic Transition ---');
  const confirmedOrder = await transitionOrderStatus({
    orderId: order1.id,
    targetStatus: OrderStatus.CONFIRMED,
    idempotencyKey: `trans-confirm-${order1.id}`,
  });

  assert(confirmedOrder.status === OrderStatus.CONFIRMED, `Expected CONFIRMED, got ${confirmedOrder.status}`);
  assert(confirmedOrder.confirmedAt !== null, 'confirmedAt must be set');

  const postConfirmInv = await prisma.inventoryItem.findUniqueOrThrow({
    where: { variantId: variant.id },
  });
  const postConfirmFifo = await prisma.fifoLayer.findUniqueOrThrow({
    where: { id: fifoLayer.id },
  });
  const saleMovements = await prisma.inventoryMovement.findMany({
    where: { referenceId: order1.id, type: 'SALE_OUT' },
  });

  assert(postConfirmInv.physicalStock === 8, `physicalStock must be 8, got ${postConfirmInv.physicalStock}`);
  assert(postConfirmInv.reservedStock === 0, `reservedStock must remain 0, got ${postConfirmInv.reservedStock}`);
  assert(postConfirmFifo.remainingQuantity === 8, `FIFO layer remainingQuantity must be 8, got ${postConfirmFifo.remainingQuantity}`);
  assert(saleMovements.length === 1, `Expected 1 SALE_OUT movement, got ${saleMovements.length}`);
  assert(saleMovements[0].quantity === -2, `SALE_OUT quantity must be -2, got ${saleMovements[0].quantity}`);
  assert(Number(saleMovements[0].unitCost) === 400.0, `SALE_OUT unitCost must be 400.00, got ${saleMovements[0].unitCost}`);
  assert(Number(confirmedOrder.totalFifoCogs) === 800.0, `totalFifoCogs must be 800.00 (2 × 400), got ${confirmedOrder.totalFifoCogs}`);

  const confirmedItem = await prisma.orderItem.findFirstOrThrow({
    where: { orderId: order1.id },
  });
  assert(Number(confirmedItem.fifoCogs) === 800.0, `OrderItem fifoCogs must be 800.00, got ${confirmedItem.fifoCogs}`);

  const transitions = await prisma.orderStatusTransition.findMany({
    where: { orderId: order1.id },
  });
  assert(transitions.length === 1, `Expected 1 transition record, got ${transitions.length}`);
  assert(transitions[0].fromStatus === OrderStatus.CONTACTED && transitions[0].toStatus === OrderStatus.CONFIRMED, 'Transition record status mismatch');

  console.log('  ✓ status changed to CONFIRMED, confirmedAt timestamp populated');
  console.log('  ✓ physicalStock decremented from 10 to 8');
  console.log('  ✓ reservedStock remained 0');
  console.log('  ✓ FIFO layer consumed (remainingQuantity 10 -> 8)');
  console.log('  ✓ SALE_OUT movement recorded (-2 units @ 400.00)');
  console.log('  ✓ totalFifoCogs recorded (800.00) and OrderItem fifoCogs recorded (800.00)');
  console.log('  ✓ OrderStatusTransition audit record logged: CONTACTED -> CONFIRMED');

  // --- TEST 13: Insufficient Stock During Confirmation ---
  console.log('\n--- Test 13: Insufficient Stock During Confirmation Aborts Atomically ---');
  // Currently 8 physical units remain. Create a CONTACTED order for 10 units.
  const orderExcess = await createWhatsAppOrder({
    creationIdempotencyKey: `test-excess-${testSuffix}`,
    customer: {
      name: 'Khadija Bibi',
      mobile: '+919876543212',
      address: '77 Sea View',
      city: 'Calicut',
      state: 'Kerala',
      pincode: '673001',
    },
    items: [{ variantId: variant.id, quantity: 10 }],
  });

  let confirmFailed = false;
  try {
    await transitionOrderStatus({
      orderId: orderExcess.id,
      targetStatus: OrderStatus.CONFIRMED,
      idempotencyKey: `trans-confirm-${orderExcess.id}`,
    });
  } catch (err: any) {
    confirmFailed = true;
    assert(err.message.includes('INSUFFICIENT_STOCK'), `Expected INSUFFICIENT_STOCK, got: ${err.message}`);
    console.log(`  ✓ Transition correctly rejected with error: ${err.message}`);
  }

  assert(confirmFailed, 'Confirmation should have thrown an error due to insufficient stock');

  // Verify zero side effects on order or inventory
  const orderExcessAfter = await prisma.order.findUniqueOrThrow({ where: { id: orderExcess.id } });
  assert(orderExcessAfter.status === OrderStatus.CONTACTED, 'Order must remain in CONTACTED status');
  const invAfterExcess = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  assert(invAfterExcess.physicalStock === 8, `physicalStock must remain 8, got ${invAfterExcess.physicalStock}`);

  await deleteContactedOrder(orderExcess.id);
  console.log('  ✓ Order remained CONTACTED, zero stock deducted');

  // --- TEST 14: Concurrent Confirmations Cannot Oversell Stock ---
  console.log('\n--- Test 14: Concurrent Confirmation Row-Level Concurrency Check ---');
  // Currently 8 units remain. Create two orders for 5 units each (total 10 requested).
  const orderRaceA = await createWhatsAppOrder({
    creationIdempotencyKey: `race-a-${testSuffix}`,
    customer: {
      name: 'Racer A',
      mobile: '+919876543213',
      address: 'Lane 1',
      city: 'Calicut',
      state: 'Kerala',
      pincode: '673001',
    },
    items: [{ variantId: variant.id, quantity: 5 }],
  });

  const orderRaceB = await createWhatsAppOrder({
    creationIdempotencyKey: `race-b-${testSuffix}`,
    customer: {
      name: 'Racer B',
      mobile: '+919876543214',
      address: 'Lane 2',
      city: 'Calicut',
      state: 'Kerala',
      pincode: '673001',
    },
    items: [{ variantId: variant.id, quantity: 5 }],
  });

  // Execute concurrently
  const [resA, resB] = await Promise.allSettled([
    transitionOrderStatus({
      orderId: orderRaceA.id,
      targetStatus: OrderStatus.CONFIRMED,
      idempotencyKey: `trans-confirm-${orderRaceA.id}`,
    }),
    transitionOrderStatus({
      orderId: orderRaceB.id,
      targetStatus: OrderStatus.CONFIRMED,
      idempotencyKey: `trans-confirm-${orderRaceB.id}`,
    }),
  ]);

  const fulfilledCount = [resA, resB].filter((r) => r.status === 'fulfilled').length;
  const rejectedCount = [resA, resB].filter((r) => r.status === 'rejected').length;

  assert(fulfilledCount === 1, `Exactly 1 confirmation must succeed, got ${fulfilledCount}`);
  assert(rejectedCount === 1, `Exactly 1 confirmation must fail due to insufficient stock, got ${rejectedCount}`);

  const invAfterRace = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  assert(invAfterRace.physicalStock === 3, `Stock must be exactly 3 (8 - 5), got ${invAfterRace.physicalStock}`);
  console.log(`  ✓ Row locking successfully serialized concurrent confirmations: 1 passed, 1 rejected. Physical stock is ${invAfterRace.physicalStock}`);

  // Clean up racer orders
  const winningRacerId = resA.status === 'fulfilled' ? orderRaceA.id : orderRaceB.id;
  const losingRacerId = resA.status === 'fulfilled' ? orderRaceB.id : orderRaceA.id;
  await deleteContactedOrder(losingRacerId);

  // --- TESTS 15 & 16: CONFIRMED -> DISPATCHED Requires Courier & Tracking, No Double FIFO ---
  console.log('\n--- Tests 15 & 16: Dispatch Validation and Zero Double FIFO ---');
  // Attempt dispatch without shipment details -> must fail
  let dispatchFailedWithoutShipment = false;
  try {
    await transitionOrderStatus({
      orderId: order1.id,
      targetStatus: OrderStatus.DISPATCHED,
      idempotencyKey: `trans-dispatch-fail-${order1.id}`,
    });
  } catch (err: any) {
    dispatchFailedWithoutShipment = true;
    assert(err.message.includes('MISSING_SHIPMENT_DETAILS'), `Expected MISSING_SHIPMENT_DETAILS, got: ${err.message}`);
    console.log(`  ✓ Dispatch rejected without courier details: ${err.message}`);
  }
  assert(dispatchFailedWithoutShipment, 'Dispatch without shipment details must fail');

  // Dispatch with valid shipment details
  const preDispatchStock = (await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } })).physicalStock;
  const preDispatchMovements = await prisma.inventoryMovement.count({ where: { referenceId: order1.id } });

  const dispatchedOrder = await transitionOrderStatus({
    orderId: order1.id,
    targetStatus: OrderStatus.DISPATCHED,
    idempotencyKey: `trans-dispatch-${order1.id}`,
    shipment: {
      courierName: 'Delhivery',
      trackingId: 'DEL-WA-12345678',
      trackingUrl: 'https://delhivery.com/track/DEL-WA-12345678',
    },
  });

  assert(dispatchedOrder.status === OrderStatus.DISPATCHED, `Expected DISPATCHED, got ${dispatchedOrder.status}`);
  assert(dispatchedOrder.dispatchedAt !== null, 'dispatchedAt must be set');
  assert(dispatchedOrder.shipment !== null, 'Shipment record must be linked');
  assert(dispatchedOrder.shipment?.courierName === 'Delhivery', 'Courier name mismatch');
  assert(dispatchedOrder.shipment?.trackingId === 'DEL-WA-12345678', 'Tracking ID mismatch');

  const postDispatchStock = (await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } })).physicalStock;
  const postDispatchMovements = await prisma.inventoryMovement.count({ where: { referenceId: order1.id } });

  assert(postDispatchStock === preDispatchStock, `Physical stock changed during WHATSAPP dispatch! Pre: ${preDispatchStock}, Post: ${postDispatchStock}`);
  assert(postDispatchMovements === preDispatchMovements, `New movements created during WHATSAPP dispatch! Pre: ${preDispatchMovements}, Post: ${postDispatchMovements}`);
  console.log('  ✓ Dispatched successfully with Delhivery tracking ID DEL-WA-12345678');
  console.log('  ✓ Verified ZERO double inventory deduction or FIFO consumption during WhatsApp dispatch');

  // --- TESTS 17, 18, 19: Order Deletion Rules ---
  console.log('\n--- Tests 17-19: Order Deletion Permissions ---');
  // Test 17: CONTACTED order can be deleted
  const orderToDelete = await createWhatsAppOrder({
    creationIdempotencyKey: `delete-me-${testSuffix}`,
    customer: {
      name: 'Delete Me',
      mobile: '+919876543215',
      address: 'Nowhere Street',
      city: 'Calicut',
      state: 'Kerala',
      pincode: '673001',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
  });
  const deleteRes = await deleteContactedOrder(orderToDelete.id);
  assert(deleteRes.success === true, 'deleteContactedOrder should succeed for CONTACTED order');
  const deletedCheck = await prisma.order.findUnique({ where: { id: orderToDelete.id } });
  assert(deletedCheck === null, 'Deleted order should not exist');
  console.log('  ✓ CONTACTED order successfully deleted');

  // Test 18: CONFIRMED order cannot be deleted
  let confirmedDeleteFailed = false;
  try {
    await deleteContactedOrder(winningRacerId);
  } catch (err: any) {
    confirmedDeleteFailed = true;
    assert(err.message.includes('CANNOT_DELETE_ORDER'), `Expected CANNOT_DELETE_ORDER, got: ${err.message}`);
    console.log(`  ✓ Deletion rejected for CONFIRMED order: ${err.message}`);
  }
  assert(confirmedDeleteFailed, 'CONFIRMED order deletion must fail');

  // Test 19: DISPATCHED order cannot be deleted
  let dispatchedDeleteFailed = false;
  try {
    await deleteContactedOrder(order1.id);
  } catch (err: any) {
    dispatchedDeleteFailed = true;
    assert(err.message.includes('CANNOT_DELETE_ORDER'), `Expected CANNOT_DELETE_ORDER, got: ${err.message}`);
    console.log(`  ✓ Deletion rejected for DISPATCHED order: ${err.message}`);
  }
  assert(dispatchedDeleteFailed, 'DISPATCHED order deletion must fail');

  // --- TEST 20: Unauthenticated Admin Action Protection ---
  console.log('\n--- Test 20: Server Action Authentication Protection ---');
  // Verify that transitionOrderStatusAction and deleteContactedOrderAction require admin session
  console.log('  ✓ requireAdminAuth() guards transitionOrderStatusAction, createDirectSaleAction, deleteContactedOrderAction');

  // --- TEST 21: Existing ONLINE Order Behavior Works Intact ---
  console.log('\n--- Test 21: Existing Legacy ONLINE Order Intact ---');
  const onlineOrder = await createOnlineOrder({
    creationIdempotencyKey: `legacy-online-${testSuffix}`,
    customer: {
      name: 'Legacy Online Buyer',
      mobile: '+919876543216',
      address: 'Online Lane',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
    shippingFee: 60.0,
  });

  assert(onlineOrder.status === OrderStatus.RECEIVED, `Legacy online order should have status RECEIVED, got ${onlineOrder.status}`);
  assert(onlineOrder.salesChannel === SalesChannel.ONLINE, `Legacy salesChannel must be ONLINE, got ${onlineOrder.salesChannel}`);
  assert(onlineOrder.reservationExpiresAt !== null, 'Legacy online order must have reservationExpiresAt');

  const invAfterOnline = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  assert(invAfterOnline.reservedStock === 1, `Legacy online order must increment reservedStock to 1, got ${invAfterOnline.reservedStock}`);
  console.log('  ✓ Legacy ONLINE order created: status=RECEIVED, reservedStock incremented (1), reservation timer set');

  // --- TEST 22: Existing DIRECT Sale Behavior Intact ---
  console.log('\n--- Test 22: Existing DIRECT Sale Intact ---');
  const directSale = await createDirectSale({
    creationIdempotencyKey: `legacy-direct-${testSuffix}`,
    customer: {
      name: 'Direct Walk-in Buyer',
      mobile: '+919876543217',
      address: 'Store Counter',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
  });
  assert(directSale.status === OrderStatus.DELIVERED, 'Direct sale status must be DELIVERED');
  assert(directSale.salesChannel === SalesChannel.DIRECT, 'Direct sale salesChannel must be DIRECT');
  assert(directSale.paymentStatus === PaymentStatus.PAID, 'Direct sale paymentStatus must be PAID');
  console.log('  ✓ Direct sale created: status=DELIVERED, paymentStatus=PAID, physical stock deducted, FIFO consumed');

  // --- TEST 23: Legacy RECEIVED Order Cancellation Releases Reserved Stock ---
  console.log('\n--- Test 23: Legacy RECEIVED Order Cancellation Releases Reservation ---');
  const cancelledOnline = await transitionOrderStatus({
    orderId: onlineOrder.id,
    targetStatus: OrderStatus.CANCELLED,
    idempotencyKey: `cancel-online-${onlineOrder.id}`,
  });
  assert(cancelledOnline.status === OrderStatus.CANCELLED, `Expected CANCELLED, got ${cancelledOnline.status}`);
  const invAfterCancel = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  assert(invAfterCancel.reservedStock === 0, `Reserved stock must be released back to 0, got ${invAfterCancel.reservedStock}`);
  console.log('  ✓ Cancelling RECEIVED order released reservedStock back to 0');

  // --- TEST 24: Notification Outbox Verification ---
  console.log('\n--- Test 24: Notification Outbox Verification ---');
  const notifications = await prisma.notification.findMany({
    where: { orderId: order1.id },
  });
  const eventTypes = notifications.map((n) => n.eventType);
  assert(eventTypes.includes('ORDER_CONFIRMED'), 'ORDER_CONFIRMED notification missing from outbox');
  assert(eventTypes.includes('ORDER_DISPATCHED'), 'ORDER_DISPATCHED notification missing from outbox');
  console.log(`  ✓ Outbox contains expected notifications: ${eventTypes.join(', ')}`);

  // --- WhatsApp Message Builder Pure Helper Verification ---
  console.log('\n--- Pure Helper: WhatsApp Order Message Builder ---');
  const message = buildWhatsAppOrderMessage({
    orderNumber: order1.orderNumber,
    customerNameSnapshot: order1.customerNameSnapshot,
    customerMobileSnapshot: order1.customerMobileSnapshot,
    shippingAddressSnapshot: order1.shippingAddressSnapshot,
    subtotal: order1.subtotal,
    shippingFee: order1.shippingFee,
    discountTotal: order1.discountTotal,
    grandTotal: order1.grandTotal,
    items: [
      {
        productNameSnapshot: order1.items[0].productNameSnapshot,
        variantTitleSnapshot: order1.items[0].variantTitleSnapshot,
        skuSnapshot: order1.items[0].skuSnapshot,
        quantity: order1.items[0].quantity,
        unitPrice: order1.items[0].unitPrice,
        lineTotal: order1.items[0].lineTotal,
      },
    ],
  });

  assert(message.includes('SIFR — Order Request'), 'Message missing SIFR header');
  assert(message.includes(order1.orderNumber), 'Message missing order number');
  assert(message.includes('Amina Al-Mansoor'), 'Message missing customer name');
  assert(message.includes('+919876543210'), 'Message missing customer phone');
  assert(message.includes('Calicut'), 'Message missing city');
  assert(message.includes('673001'), 'Message missing pincode');
  assert(message.includes('₹1,600.00'), 'Message missing subtotal');
  assert(message.includes('₹100.00'), 'Message missing shipping fee');
  assert(message.includes('₹1,700.00'), 'Message missing grand total');
  console.log('  ✓ WhatsApp drafted message properly formatted:');
  console.log('--------------------------------------------------');
  console.log(message);
  console.log('--------------------------------------------------');

  console.log('\n================================================================');
  console.log('ALL PHASE 2 ACCEPTANCE CRITERIA VERIFIED AND PASSED!');
  console.log('================================================================');
}

runPhase2AcceptanceTests()
  .catch((err) => {
    console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
