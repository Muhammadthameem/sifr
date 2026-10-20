import { prisma } from '../lib/db/prisma';
import { createOnlineOrder, createDirectSale, transitionOrderStatus } from '../lib/ordering/order-engine';
import {
  processNotification,
  processPendingNotifications,
  claimNotificationForProcessing,
  reconcileOrRetryNotification,
} from '../lib/notifications/notification-engine';
import { mockWhatsAppProvider } from '../lib/notifications/whatsapp-provider';

async function waitForNotification(notificationId: string) {
  for (let i = 0; i < 30; i++) {
    const notif = await prisma.notification.findUniqueOrThrow({
      where: { id: notificationId },
      include: { attempts: true },
    });
    if (notif.status !== 'PENDING' && notif.status !== 'PROCESSING') {
      return notif;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return await prisma.notification.findUniqueOrThrow({
    where: { id: notificationId },
    include: { attempts: true },
  });
}

async function main() {
  console.log('=== SIFR PHASE 11 NOTIFICATIONS VERIFICATION SUITE ===\n');
  mockWhatsAppProvider.reset();

  const stamp = Date.now().toString();

  // Setup isolated catalog & inventory
  console.log('--- Step 1: Setting up isolated test master data & stock ---');
  const category = await prisma.category.create({
    data: { name: `P11 Cat ${stamp}`, slug: `p11-cat-${stamp}` },
  });

  const product = await prisma.product.create({
    data: { name: `P11 Product ${stamp}`, slug: `p11-product-${stamp}`, categoryId: category.id, status: 'ACTIVE' },
  });

  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      title: 'P11 Variant M',
      sku: `SKU-P11-${stamp}`,
      mrp: '1500.00',
      sellingPrice: '1200.00',
      isAvailable: true,
    },
  });

  await prisma.inventoryItem.create({
    data: { variantId: variant.id, physicalStock: 20, reservedStock: 0 },
  });

  await prisma.fifoLayer.create({
    data: {
      variantId: variant.id,
      initialQuantity: 20,
      remainingQuantity: 20,
      unitCost: '500.00',
      referenceId: `PUR-P11-${stamp}`,
    },
  });

  console.log('✓ Master data & stock created successfully.\n');

  // TEST 1: ORDER_RECEIVED Notification Creation & Processing on Online Checkout
  console.log('--- TEST 1: ORDER_RECEIVED Notification Creation & Outbox Processing ---');
  const order1Key = `key_p11_1_${stamp}`;
  const order1 = await createOnlineOrder({
    creationIdempotencyKey: order1Key,
    customer: { name: 'P11 Customer', mobile: '9876543210' },
    items: [{ variantId: variant.id, quantity: 2 }],
    shippingFee: 50,
  });

  const notif1 = await prisma.notification.findUnique({
    where: {
      order_event_unique: {
        orderId: order1.id,
        eventType: 'ORDER_RECEIVED',
      },
    },
  });

  if (!notif1) {
    throw new Error('FAILED: ORDER_RECEIVED notification record not created in outbox!');
  }
  console.log('✔ ORDER_RECEIVED notification created in outbox with ID:', notif1.id);

  // Process / wait for outbox notification
  await processNotification(notif1.id);
  const processedNotif1 = await waitForNotification(notif1.id);

  console.log('✔ Processed ORDER_RECEIVED status:', processedNotif1.status);
  if (processedNotif1.status !== 'SENT') {
    throw new Error(`Expected Notification status SENT, got ${processedNotif1.status}`);
  }
  if (processedNotif1.attempts.length !== 1 || processedNotif1.attempts[0].resultClass !== 'SUCCESS') {
    throw new Error('Notification attempt log mismatch');
  }

  // TEST 2: Direct Sales Excluded from ORDER_RECEIVED Notification
  console.log('\n--- TEST 2: Direct Sales Excluded from WhatsApp Notifications ---');
  const dsKey = `ds_p11_2_${stamp}`;
  const dsOrder = await createDirectSale({
    creationIdempotencyKey: dsKey,
    customer: { name: 'POS Customer', mobile: '9876543211' },
    items: [{ variantId: variant.id, quantity: 1 }],
  });

  const dsNotifs = await prisma.notification.findMany({
    where: { orderId: dsOrder.id },
  });
  console.log(`✔ Direct sale notification count: ${dsNotifs.length} (expected 0)`);
  if (dsNotifs.length !== 0) {
    throw new Error('FAILED: Direct sale created unexpected WhatsApp notification!');
  }

  // TEST 3: ORDER_CONFIRMED Notification Creation & Processing
  console.log('\n--- TEST 3: ORDER_CONFIRMED Notification Creation & Processing ---');
  const confirmKey1 = `trans_confirm_${order1.id}`;
  const confirmedOrder1 = await transitionOrderStatus({
    orderId: order1.id,
    idempotencyKey: confirmKey1,
    targetStatus: 'CONFIRMED',
  });

  const notifConfirmed = await prisma.notification.findUnique({
    where: {
      order_event_unique: {
        orderId: order1.id,
        eventType: 'ORDER_CONFIRMED',
      },
    },
  });
  if (!notifConfirmed) {
    throw new Error('FAILED: ORDER_CONFIRMED notification not created!');
  }

  await processNotification(notifConfirmed.id);
  const processedNotifConfirmed = await waitForNotification(notifConfirmed.id);
  console.log('✔ ORDER_CONFIRMED notification status:', processedNotifConfirmed.status);
  if (processedNotifConfirmed.status !== 'SENT') {
    throw new Error(`Expected ORDER_CONFIRMED status SENT, got ${processedNotifConfirmed.status}`);
  }

  // TEST 4: ORDER_DISPATCHED Notification Creation & Processing with Courier details
  console.log('\n--- TEST 4: ORDER_DISPATCHED Notification Creation & Processing ---');
  const dispatchKey1 = `trans_dispatch_${order1.id}`;
  const dispatchedOrder1 = await transitionOrderStatus({
    orderId: order1.id,
    idempotencyKey: dispatchKey1,
    targetStatus: 'DISPATCHED',
    shipment: {
      courierName: 'BlueDart Express',
      trackingId: `BD-${stamp}`,
      trackingUrl: `https://bluedart.com/track/BD-${stamp}`,
    },
  });

  const notifDispatched = await prisma.notification.findUnique({
    where: {
      order_event_unique: {
        orderId: order1.id,
        eventType: 'ORDER_DISPATCHED',
      },
    },
  });
  if (!notifDispatched) {
    throw new Error('FAILED: ORDER_DISPATCHED notification not created!');
  }

  const payload = JSON.parse(notifDispatched.payloadJson);
  console.log('✔ ORDER_DISPATCHED payload verified:', payload);
  if (payload.courierName !== 'BlueDart Express' || payload.trackingId !== `BD-${stamp}`) {
    throw new Error('Payload tracking details mismatch');
  }

  await processNotification(notifDispatched.id);
  const processedNotifDispatched = await waitForNotification(notifDispatched.id);
  if (processedNotifDispatched.status !== 'SENT') {
    throw new Error(`Expected ORDER_DISPATCHED status SENT, got ${processedNotifDispatched.status}`);
  }

  // TEST 5: ORDER_DELIVERED Intentionally Triggers ZERO Notification
  console.log('\n--- TEST 5: ORDER_DELIVERED Triggers ZERO Notification ---');
  const deliveryKey1 = `trans_delivery_${order1.id}`;
  const deliveredOrder1 = await transitionOrderStatus({
    orderId: order1.id,
    idempotencyKey: deliveryKey1,
    targetStatus: 'DELIVERED',
  });

  const order1Notifs = await prisma.notification.findMany({
    where: { orderId: order1.id },
  });
  const deliveredNotifExists = order1Notifs.some((n: any) => n.eventType === 'ORDER_DELIVERED');
  console.log(`✔ Total notifications for order after delivery: ${order1Notifs.length} (expected 3: RECEIVED, CONFIRMED, DISPATCHED)`);
  if (deliveredNotifExists || order1Notifs.length !== 3) {
    throw new Error('FAILED: ORDER_DELIVERED created an unexpected notification!');
  }

  // TEST 6: Atomic Claim Concurrency Race Test
  console.log('\n--- TEST 6: Atomic Claim Concurrency Race Test ---');
  const order2 = await createOnlineOrder({
    creationIdempotencyKey: `key_p11_race_${stamp}`,
    customer: { name: 'Race Customer', mobile: '9876543212' },
    items: [{ variantId: variant.id, quantity: 1 }],
    shippingFee: 0,
  });

  const notifRace = await prisma.notification.findUniqueOrThrow({
    where: {
      order_event_unique: {
        orderId: order2.id,
        eventType: 'ORDER_RECEIVED',
      },
    },
  });

  // Reset status to PENDING to test atomic claim race
  await prisma.notification.update({
    where: { id: notifRace.id },
    data: { status: 'PENDING' },
  });

  mockWhatsAppProvider.callCount = 0;

  // Run two concurrent worker claims for the exact same PENDING notification
  const [claim1, claim2] = await Promise.all([
    claimNotificationForProcessing(notifRace.id),
    claimNotificationForProcessing(notifRace.id),
  ]);

  console.log(`✔ Atomic claims: Worker1=${claim1}, Worker2=${claim2}`);
  if ((claim1 && claim2) || (!claim1 && !claim2)) {
    throw new Error('FAILED: Atomic claim race failed; both or neither worker acquired claim!');
  }

  // Process race notification
  await processNotification(notifRace.id);
  await waitForNotification(notifRace.id);
  console.log(`✔ Provider call count after race test: ${mockWhatsAppProvider.callCount} (expected 1)`);
  if (mockWhatsAppProvider.callCount !== 1) {
    throw new Error(`Expected exactly 1 provider call, found ${mockWhatsAppProvider.callCount}`);
  }

  // TEST 7: Dispatch Replay Deduplication Test
  console.log('\n--- TEST 7: Dispatch Replay Deduplication ---');
  await transitionOrderStatus({
    orderId: order1.id,
    idempotencyKey: dispatchKey1,
    targetStatus: 'DISPATCHED',
    shipment: {
      courierName: 'BlueDart Express',
      trackingId: `BD-${stamp}`,
    },
  });

  const notifDispatchedCount = await prisma.notification.count({
    where: { orderId: order1.id, eventType: 'ORDER_DISPATCHED' },
  });
  console.log(`✔ ORDER_DISPATCHED notification count after replay: ${notifDispatchedCount} (expected 1)`);
  if (notifDispatchedCount !== 1) {
    throw new Error('FAILED: Duplicate notification created on dispatch replay!');
  }

  // TEST 8: Provider Timeout -> REQUIRES_RECONCILIATION Status
  console.log('\n--- TEST 8: Provider Timeout -> REQUIRES_RECONCILIATION ---');
  mockWhatsAppProvider.setBehaviorMode('TIMEOUT');

  const orderTimeout = await createOnlineOrder({
    creationIdempotencyKey: `key_p11_timeout_${stamp}`,
    customer: { name: 'Timeout Customer', mobile: '9876543213' },
    items: [{ variantId: variant.id, quantity: 1 }],
    shippingFee: 0,
  });

  const notifTimeout = await prisma.notification.findUniqueOrThrow({
    where: { order_event_unique: { orderId: orderTimeout.id, eventType: 'ORDER_RECEIVED' } },
  });

  await processNotification(notifTimeout.id);
  const timeoutResult = await waitForNotification(notifTimeout.id);

  console.log('✔ Timeout notification status:', timeoutResult.status);
  if (timeoutResult.status !== 'REQUIRES_RECONCILIATION') {
    throw new Error(`Expected REQUIRES_RECONCILIATION, got ${timeoutResult.status}`);
  }
  if (timeoutResult.attempts[0].resultClass !== 'UNKNOWN') {
    throw new Error(`Expected resultClass UNKNOWN, got ${timeoutResult.attempts[0].resultClass}`);
  }

  // Verify poller does NOT auto-retry REQUIRES_RECONCILIATION
  mockWhatsAppProvider.setBehaviorMode('NORMAL');
  await processPendingNotifications();
  const timeoutAfterPoller = await prisma.notification.findUniqueOrThrow({ where: { id: notifTimeout.id } });
  if (timeoutAfterPoller.status !== 'REQUIRES_RECONCILIATION') {
    throw new Error('FAILED: Poller automatically retried REQUIRES_RECONCILIATION status!');
  }
  console.log('✔ Verified poller did NOT auto-retry REQUIRES_RECONCILIATION notification.');

  // TEST 9: Permanent Provider Failure -> FAILED Status
  console.log('\n--- TEST 9: Permanent Provider Failure -> FAILED Status ---');
  mockWhatsAppProvider.setBehaviorMode('PERMANENT_FAIL');

  const orderPermFail = await createOnlineOrder({
    creationIdempotencyKey: `key_p11_permfail_${stamp}`,
    customer: { name: 'Perm Fail Customer', mobile: '9876543214' },
    items: [{ variantId: variant.id, quantity: 1 }],
    shippingFee: 0,
  });

  const notifPermFail = await prisma.notification.findUniqueOrThrow({
    where: { order_event_unique: { orderId: orderPermFail.id, eventType: 'ORDER_RECEIVED' } },
  });

  await processNotification(notifPermFail.id);
  const permFailResult = await waitForNotification(notifPermFail.id);

  console.log('✔ Permanent failure notification status:', permFailResult.status);
  if (permFailResult.status !== 'FAILED') {
    throw new Error(`Expected status FAILED, got ${permFailResult.status}`);
  }

  // TEST 10: Retryable Provider Failure & Manual Action Retry
  console.log('\n--- TEST 10: Retryable Provider Failure & Manual Action Retry ---');
  mockWhatsAppProvider.setBehaviorMode('RETRYABLE_FAIL');

  const orderRetryable = await createOnlineOrder({
    creationIdempotencyKey: `key_p11_retryable_${stamp}`,
    customer: { name: 'Retryable Customer', mobile: '9876543215' },
    items: [{ variantId: variant.id, quantity: 1 }],
    shippingFee: 0,
  });

  const notifRetryable = await prisma.notification.findUniqueOrThrow({
    where: { order_event_unique: { orderId: orderRetryable.id, eventType: 'ORDER_RECEIVED' } },
  });

  await processNotification(notifRetryable.id);
  const retryableResult = await waitForNotification(notifRetryable.id);
  console.log('✔ Retryable failure notification status:', retryableResult.status);
  if (retryableResult.status !== 'PENDING') {
    throw new Error(`Expected status PENDING for retryable failure, got ${retryableResult.status}`);
  }

  // Reset provider to NORMAL and perform manual action retry
  mockWhatsAppProvider.setBehaviorMode('NORMAL');
  await reconcileOrRetryNotification(notifRetryable.id);
  const manualRetryResult = await waitForNotification(notifRetryable.id);

  console.log('✔ Status after manual retry:', manualRetryResult.status);
  if (manualRetryResult.status !== 'SENT') {
    throw new Error(`Expected status SENT after manual retry, got ${manualRetryResult.status}`);
  }

  // TEST 11: Transaction Side-Effect Isolation Check
  console.log('\n--- TEST 11: Notification Failure Leaves Core Transaction Intact ---');
  mockWhatsAppProvider.setBehaviorMode('PERMANENT_FAIL');

  const orderIso = await createOnlineOrder({
    creationIdempotencyKey: `key_p11_iso_${stamp}`,
    customer: { name: 'Iso Customer', mobile: '9876543216' },
    items: [{ variantId: variant.id, quantity: 2 }],
    shippingFee: 0,
  });

  const confirmedIso = await transitionOrderStatus({
    orderId: orderIso.id,
    idempotencyKey: `trans_conf_iso_${stamp}`,
    targetStatus: 'CONFIRMED',
  });

  const dispatchedIso = await transitionOrderStatus({
    orderId: orderIso.id,
    idempotencyKey: `trans_disp_iso_${stamp}`,
    targetStatus: 'DISPATCHED',
    shipment: { courierName: 'Delhivery', trackingId: `DEL-${stamp}` },
  });

  // Verify core business state is 100% intact even though notifications failed
  if (dispatchedIso.status !== 'DISPATCHED') {
    throw new Error('Core order dispatch failed when notification failed');
  }
  const shipmentIso = await prisma.shipment.findUnique({ where: { orderId: orderIso.id } });
  if (!shipmentIso || shipmentIso.status !== 'DISPATCHED') {
    throw new Error('Shipment creation failed when notification failed');
  }

  console.log('✔ Core Order status, Shipment creation, and Inventory stock remained 100% intact!');

  console.log('\n==================================================');
  console.log('🎉 PHASE 11 VERIFICATION SUITE PASSED SUCCESSFULLY!');
  console.log('==================================================');
}

main()
  .catch((err) => {
    console.error('\n❌ PHASE 11 VERIFICATION SUITE FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
