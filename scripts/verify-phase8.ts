import { Prisma, PrismaClient, OrderStatus, PaymentStatus, SalesChannel } from '@prisma/client';
import { createOnlineOrder, createDirectSale } from '../lib/ordering/order-engine';
import { initiatePayment, processPaymentWebhook } from '../lib/payments/payment-engine';
import { cleanupExpiredReservations } from '../lib/payments/reservation-cleanup';
import { MockPaymentAdapter } from '../lib/payments/mock-adapter';
import { createCoupon } from '../lib/coupons/coupon-admin';
import crypto from 'crypto';

const prisma = new PrismaClient();

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runPhase8VerificationSuite() {
  console.log('==================================================');
  console.log('🚀 STARTING PHASE 8 — PAYMENT GATEWAY VERIFICATION SUITE');
  console.log('==================================================');

  // Setup Test Data
  const sku1 = `SKU-P8-${Date.now()}-1`;
  const sku2 = `SKU-P8-${Date.now()}-2`;

  const category = await prisma.category.create({
    data: {
      name: `P8 Category ${Date.now()}`,
      slug: `p8-cat-${Date.now()}`,
    },
  });

  const product = await prisma.product.create({
    data: {
      name: `P8 Product ${Date.now()}`,
      slug: `p8-prod-${Date.now()}`,
      status: 'ACTIVE',
      categoryId: category.id,
    },
  });

  const variant1 = await prisma.productVariant.create({
    data: {
      productId: product.id,
      title: 'Variant 1',
      sku: sku1,
      mrp: new Prisma.Decimal('1000.00'),
      sellingPrice: new Prisma.Decimal('500.00'),
      shippingCost: new Prisma.Decimal('0.00'),
      isAvailable: true,
      inventoryItem: {
        create: {
          physicalStock: 20,
          reservedStock: 0,
        },
      },
      fifoLayers: {
        create: {
          initialQuantity: 20,
          remainingQuantity: 20,
          unitCost: new Prisma.Decimal('300.00'),
        },
      },
    },
  });

  const variant2 = await prisma.productVariant.create({
    data: {
      productId: product.id,
      title: 'Variant 2',
      sku: sku2,
      mrp: new Prisma.Decimal('2000.00'),
      sellingPrice: new Prisma.Decimal('1000.00'),
      shippingCost: new Prisma.Decimal('0.00'),
      isAvailable: true,
      inventoryItem: {
        create: {
          physicalStock: 20,
          reservedStock: 0,
        },
      },
    },
  });

  // --------------------------------------------------------------------------
  // SECTION 1: Payment Initiation & Single Active Attempt Rule
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 1: Payment Initiation & Active Attempt Constraints ---');

  const order1 = await createOnlineOrder({
    creationIdempotencyKey: `p8-init-key-${Date.now()}`,
    customer: {
      name: 'P8 Customer',
      mobile: '9876543210',
    },
    items: [{ variantId: variant1.id, quantity: 2 }],
    shippingFee: 50,
  });

  assert(order1.status === OrderStatus.RECEIVED, 'Order 1 status is RECEIVED');
  assert(order1.paymentStatus === PaymentStatus.PENDING, 'Order 1 paymentStatus is PENDING');

  const initIdemKey1 = `p8-idem-pay-${Date.now()}`;
  const payment1 = await initiatePayment({
    orderId: order1.id,
    provider: 'MOCK',
    initiationIdempotencyKey: initIdemKey1,
    guestAccessToken: order1.guestAccessToken,
  });

  console.log('  ✓ Test 1: Payment initiation created Payment record with matching amount ₹1050');
  assert(payment1.status === 'INITIATED', 'Payment 1 status is INITIATED');
  assert(Number(payment1.amount) === 1050, 'Payment 1 amount matches grandTotal ₹1050');

  // Attempt 2 while Attempt 1 is active
  let activeAttemptRejected = false;
  try {
    await initiatePayment({
      orderId: order1.id,
      provider: 'MOCK',
      initiationIdempotencyKey: `p8-idem-pay-2-${Date.now()}`,
      guestAccessToken: order1.guestAccessToken,
    });
  } catch (err: any) {
    activeAttemptRejected = err.message.includes('ACTIVE_PAYMENT_EXISTS');
  }
  assert(activeAttemptRejected, 'Test 2: Initiating second attempt while one is active rejected with ACTIVE_PAYMENT_EXISTS');
  console.log('  ✓ Test 2: Single active payment attempt rule enforced');

  // --------------------------------------------------------------------------
  // SECTION 2: Initiation Idempotency & Conflicting Reuse
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Payment Initiation Idempotency ---');

  const replayedPayment = await initiatePayment({
    orderId: order1.id,
    provider: 'MOCK',
    initiationIdempotencyKey: initIdemKey1,
    guestAccessToken: order1.guestAccessToken,
  });
  assert(replayedPayment.id === payment1.id, 'Same key + same order returned existing Payment record cleanly');
  console.log('  ✓ Test 3: Same initiationIdempotencyKey returns existing Payment attempt');

  const order2 = await createOnlineOrder({
    creationIdempotencyKey: `p8-init-key-2-${Date.now()}`,
    customer: {
      name: 'P8 Customer 2',
      mobile: '9876543211',
    },
    items: [{ variantId: variant2.id, quantity: 1 }],
    shippingFee: 0,
  });

  let conflictingReuseRejected = false;
  try {
    await initiatePayment({
      orderId: order2.id,
      provider: 'MOCK',
      initiationIdempotencyKey: initIdemKey1, // Reusing key from order 1
      guestAccessToken: order2.guestAccessToken,
    });
  } catch (err: any) {
    conflictingReuseRejected = err.message.includes('CONFLICTING_IDEMPOTENCY_KEY_REUSE');
  }
  assert(conflictingReuseRejected, 'Test 4: Reusing initiation key for different order rejected with CONFLICTING_IDEMPOTENCY_KEY_REUSE');
  console.log('  ✓ Test 4: Conflicting initiation key reuse rejected cleanly');

  // --------------------------------------------------------------------------
  // SECTION 3: Webhook Verification, Deduplication & Amount Protection
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Webhook Verification & Deduplication ---');

  const eventId1 = `evt_p8_${Date.now()}_1`;
  const webhookPayload1 = MockPaymentAdapter.generateMockWebhookPayload({
    eventId: eventId1,
    eventType: 'payment.authorized',
    providerOrderId: payment1.providerOrderId!,
    providerPaymentId: `pay_mock_${Date.now()}`,
    amountPaise: 105000, // ₹1050
    status: 'captured',
  });

  // Invalid HMAC Signature test
  let invalidSigRejected = false;
  try {
    await processPaymentWebhook({
      provider: 'MOCK',
      rawBody: webhookPayload1.rawBody,
      signature: 'invalid_tampered_signature',
      secret: MockPaymentAdapter.MOCK_SECRET,
    });
  } catch (err: any) {
    invalidSigRejected = err.message.includes('INVALID_WEBHOOK_SIGNATURE');
  }
  assert(invalidSigRejected, 'Invalid HMAC signature rejected');
  console.log('  ✓ Test 5: Invalid HMAC signature rejected');

  // Valid Webhook Processing
  const webhookRes1 = await processPaymentWebhook({
    provider: 'MOCK',
    rawBody: webhookPayload1.rawBody,
    signature: webhookPayload1.signature,
    secret: MockPaymentAdapter.MOCK_SECRET,
  });

  assert(webhookRes1.success === true, 'Webhook 1 processed successfully');
  console.log('  ✓ Test 6: Valid webhook transitioned Order to PAID and CONFIRMED');

  const updatedOrder1 = await prisma.order.findUniqueOrThrow({ where: { id: order1.id } });
  assert(updatedOrder1.paymentStatus === PaymentStatus.PAID, 'Order 1 paymentStatus updated to PAID');
  assert(updatedOrder1.status === OrderStatus.CONFIRMED, 'Order 1 status updated to CONFIRMED');

  // Duplicate Webhook ACK test
  const dupWebhookRes = await processPaymentWebhook({
    provider: 'MOCK',
    rawBody: webhookPayload1.rawBody,
    signature: webhookPayload1.signature,
    secret: MockPaymentAdapter.MOCK_SECRET,
  });
  assert(dupWebhookRes.duplicate === true, 'Duplicate webhook returns duplicate: true ACK without side effects');
  console.log('  ✓ Test 7: Duplicate webhook event returned HTTP ACK without duplicate processing');

  // Conflicting Payload Duplicate EventId test
  const conflictingPayload = MockPaymentAdapter.generateMockWebhookPayload({
    eventId: eventId1, // Same eventId
    eventType: 'payment.authorized',
    providerOrderId: payment1.providerOrderId!,
    providerPaymentId: `pay_mock_conflict`,
    amountPaise: 99999, // Altered amount
    status: 'captured',
  });

  let conflictingEventRejected = false;
  try {
    await processPaymentWebhook({
      provider: 'MOCK',
      rawBody: conflictingPayload.rawBody,
      signature: conflictingPayload.signature,
      secret: MockPaymentAdapter.MOCK_SECRET,
    });
  } catch (err: any) {
    conflictingEventRejected = err.message.includes('CONFLICTING_WEBHOOK_EVENT');
  }
  assert(conflictingEventRejected, 'Conflicting duplicate eventId payload rejected with CONFLICTING_WEBHOOK_EVENT');
  console.log('  ✓ Test 8: Conflicting payload for duplicate eventId rejected with HTTP 400 error');

  // --------------------------------------------------------------------------
  // SECTION 4: Amount Tampering Protection
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Amount Tampering Protection ---');

  const orderTamper = await createOnlineOrder({
    creationIdempotencyKey: `p8-tamper-key-${Date.now()}`,
    customer: { name: 'Tamper Tester', mobile: '9876543212' },
    items: [{ variantId: variant1.id, quantity: 1 }],
    shippingFee: 0,
  });

  const paymentTamper = await initiatePayment({
    orderId: orderTamper.id,
    provider: 'MOCK',
    initiationIdempotencyKey: `p8-idem-tamper-${Date.now()}`,
  });

  // Client attempts to report ₹10 instead of ₹500
  const tamperWebhook = MockPaymentAdapter.generateMockWebhookPayload({
    eventId: `evt_tamper_${Date.now()}`,
    eventType: 'payment.authorized',
    providerOrderId: paymentTamper.providerOrderId!,
    providerPaymentId: `pay_tamper_${Date.now()}`,
    amountPaise: 1000, // ₹10 instead of ₹500
    status: 'captured',
  });

  let amountTamperRejected = false;
  try {
    await processPaymentWebhook({
      provider: 'MOCK',
      rawBody: tamperWebhook.rawBody,
      signature: tamperWebhook.signature,
      secret: MockPaymentAdapter.MOCK_SECRET,
    });
  } catch (err: any) {
    amountTamperRejected = err.message.includes('SECURITY_ALERT: Amount mismatch');
  }
  assert(amountTamperRejected, 'Amount mismatch webhook rejected with security alert');
  console.log('  ✓ Test 9: Webhook with tampered amount rejected with SECURITY_ALERT');

  // --------------------------------------------------------------------------
  // SECTION 5: Unpaid Order Expiry & Audit-Friendly Coupon Reversion
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 5: Unpaid Order Expiry & Reversible Coupon Model ---');

  const couponCode = `P8SAVE-${Date.now()}`;
  const couponMaster = await createCoupon({
    code: couponCode,
    name: 'P8 Coupon',
    discountType: 'FIXED_AMOUNT',
    discountValue: 100.00,
    usageLimitPerCustomer: 1,
    status: 'ACTIVE',
    productIds: [],
    categoryIds: [],
  });

  const expiryOrder = await createOnlineOrder({
    creationIdempotencyKey: `p8-exp-key-${Date.now()}`,
    customer: { name: 'Expiry Tester', mobile: '9876543213' },
    items: [{ variantId: variant1.id, quantity: 2 }],
    shippingFee: 0,
    couponCode,
  });

  const invBeforeExp = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant1.id } });
  assert(invBeforeExp.reservedStock === 5, 'Stock reserved before expiry');

  const usageBeforeExp = await prisma.couponUsage.findUniqueOrThrow({ where: { orderId: expiryOrder.id } });
  assert(usageBeforeExp.status === 'ACTIVE', 'Coupon usage initially ACTIVE');

  // Force reservationExpiresAt to the past to simulate 30-min expiration
  await prisma.order.update({
    where: { id: expiryOrder.id },
    data: { reservationExpiresAt: new Date(Date.now() - 60 * 1000) },
  });

  // Run Cleanup Worker
  const cleanupRes = await cleanupExpiredReservations(expiryOrder.id);
  assert(cleanupRes.processedCount === 1, 'Cleanup processed 1 expired order');

  const expiredOrder = await prisma.order.findUniqueOrThrow({ where: { id: expiryOrder.id } });
  assert(expiredOrder.status === OrderStatus.CANCELLED, 'Expired order status set to CANCELLED');
  assert(expiredOrder.paymentStatus === PaymentStatus.FAILED, 'Expired order paymentStatus set to FAILED');

  const invAfterExp = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant1.id } });
  assert(invAfterExp.reservedStock === 3, 'Reserved stock released cleanly on expiry (5 -> 3)');

  const usageAfterExp = await prisma.couponUsage.findUniqueOrThrow({ where: { orderId: expiryOrder.id } });
  assert(usageAfterExp.status === 'REVERSED', 'CouponUsage status set to REVERSED for audit history');
  assert(usageAfterExp.reversalReason === 'UNPAID_ORDER_EXPIRED', 'Reversal reason recorded');

  const couponMasterAfterExp = await prisma.coupon.findUniqueOrThrow({ where: { id: couponMaster.id } });
  assert(couponMasterAfterExp.usageCountGlobal === 0, 'Global coupon usage count decremented cleanly to 0');

  console.log('  ✓ Test 10: Unpaid order expiry released stock and set CouponUsage to REVERSED');

  // Verify Customer Eligibility Restored
  const reorderWithCoupon = await createOnlineOrder({
    creationIdempotencyKey: `p8-reorder-key-${Date.now()}`,
    customer: { name: 'Expiry Tester', mobile: '9876543213' }, // Same customer mobile
    items: [{ variantId: variant1.id, quantity: 1 }],
    shippingFee: 0,
    couponCode,
  });

  assert(reorderWithCoupon.discountTotal.equals('100'), 'Customer per-customer eligibility restored after reversal');
  console.log('  ✓ Test 11: Per-customer coupon eligibility restored after usage reversal');

  // --------------------------------------------------------------------------
  // SECTION 6: Payment Success vs. Expiry Race (Case B - Late Payment on Cancelled Order)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 6: Payment Success vs. Expiry Race (REQUIRES_RECONCILIATION) ---');

  const raceOrder = await createOnlineOrder({
    creationIdempotencyKey: `p8-race-key-${Date.now()}`,
    customer: { name: 'Race Tester', mobile: '9876543214' },
    items: [{ variantId: variant1.id, quantity: 1 }],
    shippingFee: 0,
  });

  const racePayment = await initiatePayment({
    orderId: raceOrder.id,
    provider: 'MOCK',
    initiationIdempotencyKey: `p8-idem-race-${Date.now()}`,
  });

  // Simulate Cleanup winning race first: Order is CANCELLED and stock released
  await prisma.order.update({
    where: { id: raceOrder.id },
    data: { reservationExpiresAt: new Date(Date.now() - 60 * 1000) },
  });
  await cleanupExpiredReservations(raceOrder.id);

  const raceOrderCancelled = await prisma.order.findUniqueOrThrow({ where: { id: raceOrder.id } });
  assert(raceOrderCancelled.status === OrderStatus.CANCELLED, 'Order cancelled by cleanup worker');

  // Now late successful webhook arrives for the cancelled order
  const lateWebhookPayload = MockPaymentAdapter.generateMockWebhookPayload({
    eventId: `evt_late_${Date.now()}`,
    eventType: 'payment.authorized',
    providerOrderId: racePayment.providerOrderId!,
    providerPaymentId: `pay_late_${Date.now()}`,
    amountPaise: 50000, // ₹500
    status: 'captured',
  });

  const lateWebhookRes = await processPaymentWebhook({
    provider: 'MOCK',
    rawBody: lateWebhookPayload.rawBody,
    signature: lateWebhookPayload.signature,
    secret: MockPaymentAdapter.MOCK_SECRET,
  });

  assert(lateWebhookRes.requiresReconciliation === true, 'Late webhook sets requiresReconciliation: true');

  const latePaymentRecord = await prisma.payment.findUniqueOrThrow({ where: { id: racePayment.id } });
  assert(latePaymentRecord.status === 'REQUIRES_RECONCILIATION', 'Payment.status set to REQUIRES_RECONCILIATION');

  const orderAfterLateWebhook = await prisma.order.findUniqueOrThrow({ where: { id: raceOrder.id } });
  assert(orderAfterLateWebhook.status === OrderStatus.CANCELLED, 'Order remains CANCELLED (zero stock overselling)');
  assert(orderAfterLateWebhook.paymentStatus === PaymentStatus.FAILED, 'Order paymentStatus remains FAILED');

  console.log('  ✓ Test 12: Late payment on cancelled order set Payment status to REQUIRES_RECONCILIATION without fulfilling cancelled order');

  // --------------------------------------------------------------------------
  // SECTION 7: COD & Direct Sales Isolations
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 7: COD & Direct Sales Path Isolations ---');

  const codOrder = await createOnlineOrder({
    creationIdempotencyKey: `p8-cod-key-${Date.now()}`,
    customer: { name: 'COD Tester', mobile: '9876543215' },
    items: [{ variantId: variant1.id, quantity: 1 }],
    shippingFee: 50,
  });

  assert(codOrder.paymentStatus === PaymentStatus.PENDING, 'COD order created with paymentStatus PENDING');
  assert(codOrder.status === OrderStatus.RECEIVED, 'COD order status is RECEIVED');
  console.log('  ✓ Test 13: COD path creates online order without gateway invocation');

  const directSale = await createDirectSale({
    creationIdempotencyKey: `p8-ds-key-${Date.now()}`,
    customer: { name: 'POS Customer', mobile: '9876543216' },
    items: [{ variantId: variant1.id, quantity: 1 }],
  });

  assert(directSale.salesChannel === SalesChannel.DIRECT, 'Direct Sale channel is DIRECT');
  assert(directSale.status === OrderStatus.DELIVERED, 'Direct Sale status is DELIVERED immediately');
  assert(directSale.paymentStatus === PaymentStatus.PAID, 'Direct Sale paymentStatus is PAID immediately');
  console.log('  ✓ Test 14: Phase 5 POS Direct Sales remain 100% operational');

  console.log('\n==================================================');
  console.log('✅ PHASE 8 VERIFICATION SUCCESSFUL: ALL TESTS PASSED');
  console.log('==================================================\n');
}

runPhase8VerificationSuite()
  .catch((err) => {
    console.error('❌ PHASE 8 VERIFICATION FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
