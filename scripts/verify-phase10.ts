import { prisma } from '../lib/db/prisma';
import { createOnlineOrder, transitionOrderStatus } from '../lib/ordering/order-engine';
import { OrderDispatchedEventPayload } from '../lib/validation/ordering';
import crypto from 'crypto';

async function main() {
  console.log('=== SIFR PHASE 10 VERIFICATION SUITE ===\n');

  // 1. Setup Isolated Test Products, Vendors, Purchase & Stock
  console.log('--- Step 1: Setting up isolated test master data & stock ---');
  const uniqueId = Date.now().toString();

  const category = await prisma.category.create({
    data: {
      name: `P10 Category ${uniqueId}`,
      slug: `p10-category-${uniqueId}`,
    },
  });

  const product = await prisma.product.create({
    data: {
      name: `P10 Product ${uniqueId}`,
      slug: `p10-product-${uniqueId}`,
      categoryId: category.id,
      status: 'ACTIVE',
    },
  });

  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      title: 'P10 Variant L',
      sku: `SKU-P10-${uniqueId}`,
      mrp: '1000.00',
      sellingPrice: '800.00',
      isAvailable: true,
    },
  });

  await prisma.inventoryItem.create({
    data: {
      variantId: variant.id,
      physicalStock: 10,
      reservedStock: 0,
    },
  });

  const fifoLayer = await prisma.fifoLayer.create({
    data: {
      variantId: variant.id,
      initialQuantity: 10,
      remainingQuantity: 10,
      unitCost: '400.00',
      referenceId: `PUR-P10-${uniqueId}`,
    },
  });

  console.log(`Created test variant ${variant.sku} with physicalStock=10, FIFO layer=10 @ 400.00\n`);

  // 2. Test Validation Failure on Dispatch without Shipment details
  console.log('--- Step 2: Testing dispatch validation failure (missing shipment details) ---');
  const order1Key = `ord_p10_1_${uniqueId}`;
  const order1 = await createOnlineOrder({
    creationIdempotencyKey: order1Key,
    customer: {
      name: 'Dispatch Customer',
      mobile: '9876543210',
      email: 'dispatch@example.com',
      shippingAddress: '123 Shipping Lane, Mumbai',
    },
    items: [{ variantId: variant.id, quantity: 2 }],
    shippingFee: 50,
  });

  // Confirm order
  const confirmedOrder1 = await transitionOrderStatus({
    orderId: order1.id,
    idempotencyKey: `trans_confirm_${order1.id}`,
    targetStatus: 'CONFIRMED',
  });

  let validationFailedAsExpected = false;
  try {
    await transitionOrderStatus({
      orderId: confirmedOrder1.id,
      idempotencyKey: `trans_dispatch_invalid_${confirmedOrder1.id}`,
      targetStatus: 'DISPATCHED',
      // Missing shipment payload!
    });
  } catch (err: any) {
    if (err.message.includes('MISSING_SHIPMENT_DETAILS') || err.message.includes('shipment')) {
      validationFailedAsExpected = true;
      console.log('✔ Correctly rejected dispatch missing shipment details:', err.message);
    } else {
      throw err;
    }
  }

  if (!validationFailedAsExpected) {
    throw new Error('FAILED: Order dispatch allowed without shipment details!');
  }

  // 3. Test Successful Dispatch & Shipment Creation
  console.log('\n--- Step 3: Testing successful order dispatch (CONFIRMED -> DISPATCHED) ---');
  const dispatchKey1 = `trans_dispatch_valid_${confirmedOrder1.id}`;
  const dispatchedOrder1 = await transitionOrderStatus({
    orderId: confirmedOrder1.id,
    idempotencyKey: dispatchKey1,
    targetStatus: 'DISPATCHED',
    shipment: {
      courierName: 'Delhivery Express',
      trackingId: `DEL-${uniqueId}`,
      trackingUrl: `https://track.delhivery.com/DEL-${uniqueId}`,
    },
  });

  if (dispatchedOrder1.status !== 'DISPATCHED') {
    throw new Error(`Expected Order.status == DISPATCHED, got ${dispatchedOrder1.status}`);
  }
  if (!dispatchedOrder1.dispatchedAt) {
    throw new Error('Expected Order.dispatchedAt to be populated');
  }
  if (!dispatchedOrder1.shipment) {
    throw new Error('Expected Order.shipment relation to be loaded');
  }

  const shipment1 = dispatchedOrder1.shipment;
  console.log('✔ Order successfully dispatched!');
  console.log('  Shipment ID:', shipment1.id);
  console.log('  Courier Name:', shipment1.courierName);
  console.log('  Tracking ID:', shipment1.trackingId);
  console.log('  Tracking URL:', shipment1.trackingUrl);
  console.log('  Shipment Status:', shipment1.status);

  if (shipment1.courierName !== 'Delhivery Express' || shipment1.trackingId !== `DEL-${uniqueId}`) {
    throw new Error('Shipment details mismatch');
  }
  if (shipment1.status !== 'DISPATCHED') {
    throw new Error(`Expected Shipment.status == DISPATCHED, got ${shipment1.status}`);
  }

  // Verify Inventory State After First Dispatch
  const invAfterFirstDispatch = await prisma.inventoryItem.findUniqueOrThrow({
    where: { variantId: variant.id },
  });
  console.log(
    `  Inventory after dispatch: physicalStock=${invAfterFirstDispatch.physicalStock} (expected 8), reservedStock=${invAfterFirstDispatch.reservedStock} (expected 0)`
  );
  if (invAfterFirstDispatch.physicalStock !== 8 || invAfterFirstDispatch.reservedStock !== 0) {
    throw new Error('Inventory stock levels incorrect after dispatch');
  }

  const fifoLayerAfterFirstDispatch = await prisma.fifoLayer.findUniqueOrThrow({
    where: { id: fifoLayer.id },
  });
  console.log(
    `  FIFO Layer remaining quantity=${fifoLayerAfterFirstDispatch.remainingQuantity} (expected 8)`
  );
  if (fifoLayerAfterFirstDispatch.remainingQuantity !== 8) {
    throw new Error('FIFO layer remaining quantity incorrect after dispatch');
  }

  const saleOutMovementsCount1 = await prisma.inventoryMovement.count({
    where: { referenceId: confirmedOrder1.id, type: 'SALE_OUT' },
  });
  console.log(`  SALE_OUT movements created: ${saleOutMovementsCount1} (expected 1)`);
  if (saleOutMovementsCount1 !== 1) {
    throw new Error(`Expected 1 SALE_OUT movement, found ${saleOutMovementsCount1}`);
  }

  // 4. DEDICATED VERIFICATION CASE: Dispatch Idempotency Replay After Successful First Dispatch
  console.log(
    '\n--- Step 4: DEDICATED VERIFICATION CASE: "dispatch idempotency replay after successful first dispatch" ---'
  );

  const preReplayShipmentsCount = await prisma.shipment.count({
    where: { orderId: confirmedOrder1.id },
  });
  const preReplayDispatchedAt = dispatchedOrder1.dispatchedAt;
  const preReplayShipmentId = shipment1.id;

  console.log('Executing dispatch idempotency replay with key:', dispatchKey1);
  const replayedDispatchOrder = await transitionOrderStatus({
    orderId: confirmedOrder1.id,
    idempotencyKey: dispatchKey1, // Replaying the exact same idempotency key
    targetStatus: 'DISPATCHED',
    shipment: {
      courierName: 'Delhivery Express',
      trackingId: `DEL-${uniqueId}`,
      trackingUrl: `https://track.delhivery.com/DEL-${uniqueId}`,
    },
  });

  console.log('Replay execution returned successfully.');

  // Assert 1: Never creates another Shipment
  const postReplayShipmentsCount = await prisma.shipment.count({
    where: { orderId: confirmedOrder1.id },
  });
  console.log(`✔ Shipment count check: before=${preReplayShipmentsCount}, after=${postReplayShipmentsCount}`);
  if (postReplayShipmentsCount !== 1 || postReplayShipmentsCount !== preReplayShipmentsCount) {
    throw new Error('IDEMPOTENCY_FAIL: Duplicate Shipment record created during dispatch replay!');
  }
  if (replayedDispatchOrder.shipment?.id !== preReplayShipmentId) {
    throw new Error('IDEMPOTENCY_FAIL: Shipment ID changed during replay!');
  }

  // Assert 2: Never creates another SALE_OUT
  const postReplaySaleOutMovementsCount = await prisma.inventoryMovement.count({
    where: { referenceId: confirmedOrder1.id, type: 'SALE_OUT' },
  });
  console.log(
    `✔ SALE_OUT movements count check: before=${saleOutMovementsCount1}, after=${postReplaySaleOutMovementsCount}`
  );
  if (postReplaySaleOutMovementsCount !== saleOutMovementsCount1) {
    throw new Error('IDEMPOTENCY_FAIL: Duplicate SALE_OUT inventory movement created during dispatch replay!');
  }

  // Assert 3: Never consumes FIFO layers again
  const fifoLayerAfterReplay = await prisma.fifoLayer.findUniqueOrThrow({
    where: { id: fifoLayer.id },
  });
  console.log(
    `✔ FIFO Layer remaining quantity check: before=${fifoLayerAfterFirstDispatch.remainingQuantity}, after=${fifoLayerAfterReplay.remainingQuantity}`
  );
  if (fifoLayerAfterReplay.remainingQuantity !== fifoLayerAfterFirstDispatch.remainingQuantity) {
    throw new Error('IDEMPOTENCY_FAIL: FIFO layers consumed again during dispatch replay!');
  }

  // Assert 4 & 5: Never decrements physicalStock & reservedStock again
  const invAfterReplay = await prisma.inventoryItem.findUniqueOrThrow({
    where: { variantId: variant.id },
  });
  console.log(
    `✔ Inventory stock check: physicalStock=${invAfterReplay.physicalStock} (expected 8), reservedStock=${invAfterReplay.reservedStock} (expected 0)`
  );
  if (
    invAfterReplay.physicalStock !== invAfterFirstDispatch.physicalStock ||
    invAfterReplay.reservedStock !== invAfterFirstDispatch.reservedStock
  ) {
    throw new Error('IDEMPOTENCY_FAIL: physicalStock or reservedStock modified during dispatch replay!');
  }

  // Assert 6: Never changes dispatchedAt again
  console.log(
    `✔ dispatchedAt check: original=${preReplayDispatchedAt.toISOString()}, replay=${replayedDispatchOrder.dispatchedAt?.toISOString()}`
  );
  if (replayedDispatchOrder.dispatchedAt?.getTime() !== preReplayDispatchedAt.getTime()) {
    throw new Error('IDEMPOTENCY_FAIL: Order.dispatchedAt timestamp modified during dispatch replay!');
  }

  console.log('✔ ALL DISPATCH IDEMPOTENCY REPLAY GUARANTEES PASSED PERFECTLY!');

  // 5. Test Successful Delivery Transition (DISPATCHED -> DELIVERED)
  console.log('\n--- Step 5: Testing order delivery (DISPATCHED -> DELIVERED) ---');
  const deliveryKey1 = `trans_delivery_${confirmedOrder1.id}`;
  const deliveredOrder1 = await transitionOrderStatus({
    orderId: confirmedOrder1.id,
    idempotencyKey: deliveryKey1,
    targetStatus: 'DELIVERED',
  });

  if (deliveredOrder1.status !== 'DELIVERED') {
    throw new Error(`Expected Order.status == DELIVERED, got ${deliveredOrder1.status}`);
  }
  if (!deliveredOrder1.deliveredAt) {
    throw new Error('Expected Order.deliveredAt to be populated');
  }

  const updatedShipment1 = await prisma.shipment.findUniqueOrThrow({
    where: { orderId: confirmedOrder1.id },
  });
  console.log('✔ Order & Shipment successfully delivered!');
  console.log('  Shipment Status:', updatedShipment1.status);
  console.log('  Shipment Delivered At:', updatedShipment1.deliveredAt?.toISOString());

  if (updatedShipment1.status !== 'DELIVERED' || !updatedShipment1.deliveredAt) {
    throw new Error('Shipment status or deliveredAt not updated properly during order delivery');
  }

  // Verify zero inventory side-effects during delivery
  const invAfterDelivery = await prisma.inventoryItem.findUniqueOrThrow({
    where: { variantId: variant.id },
  });
  if (
    invAfterDelivery.physicalStock !== invAfterReplay.physicalStock ||
    invAfterDelivery.reservedStock !== invAfterReplay.reservedStock
  ) {
    throw new Error('Inventory stock modified unexpectedly during delivery transition');
  }

  // 6. Test Delivery Idempotency Replay
  console.log('\n--- Step 6: Testing delivery idempotency replay ---');
  const replayedDeliveryOrder = await transitionOrderStatus({
    orderId: confirmedOrder1.id,
    idempotencyKey: deliveryKey1,
    targetStatus: 'DELIVERED',
  });
  if (replayedDeliveryOrder.deliveredAt?.getTime() !== deliveredOrder1.deliveredAt.getTime()) {
    throw new Error('Delivery timestamp modified during delivery replay');
  }
  console.log('✔ Delivery idempotency replay verified successfully!');

  // 7. Test Phase 11 Notification Contract Schema Compilation
  console.log('\n--- Step 7: Verifying Phase 11 Domain Event Payload Contract ---');
  const domainPayload: OrderDispatchedEventPayload = {
    eventType: 'ORDER_DISPATCHED',
    orderId: deliveredOrder1.id,
    orderNumber: deliveredOrder1.orderNumber,
    customerMobile: deliveredOrder1.customerMobileSnapshot,
    customerName: deliveredOrder1.customerNameSnapshot,
    courierName: updatedShipment1.courierName,
    trackingId: updatedShipment1.trackingId,
    trackingUrl: updatedShipment1.trackingUrl,
    dispatchedAt: updatedShipment1.dispatchedAt,
  };
  console.log('✔ Phase 11 OrderDispatchedEventPayload contract verified:', domainPayload.eventType);

  console.log('\n==================================================');
  console.log('🎉 PHASE 10 VERIFICATION SUITE PASSED SUCCESSFULLY!');
  console.log('==================================================');
}

main()
  .catch((err) => {
    console.error('\n❌ PHASE 10 VERIFICATION SUITE FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
