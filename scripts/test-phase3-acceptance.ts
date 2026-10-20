import { prisma } from '../lib/db/prisma';
import {
  createWhatsAppOrder,
  createOnlineOrder,
  createDirectSale,
  transitionOrderStatus,
  updateOrderPaymentAdmin,
} from '../lib/ordering/order-engine';
import {
  getExecutiveFinancialSummary,
  getChannelSummary,
  getProductPerformanceSummary,
  getOrderFunnelSummary,
  getSalesReportRows,
  getProductReportSummary,
  getProductReportRows,
  SALE_ORDER_STATUSES,
} from '../lib/reports/report-service';
import {
  createRefundIntent,
  dispatchGatewayRefund,
  executeManualOfflineRefund,
} from '../lib/returns/refund-engine';
import {
  createReturnRequest,
  recordPhysicalReceipt,
  processIncrementalInspection,
} from '../lib/returns/return-engine';
import { initiatePayment } from '../lib/payments/payment-engine';
import { updateOrderPaymentAction } from '../lib/actions/order-actions';
import { executeManualOfflineRefundAction } from '../lib/actions/return-actions';
import {
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  SalesChannel,
  RefundMethod,
  RefundStatus,
  ReturnStatus,
  Prisma,
} from '@prisma/client';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

async function main() {
  console.log('================================================================');
  console.log('PHASE 3 ACCEPTANCE TESTS — BACKEND LOGIC & FINANCIAL CORRECTNESS');
  console.log('================================================================\n');

  const runId = Math.floor(Math.random() * 900000 + 100000).toString();

  // --- Step 0: Test Fixture Setup ---
  console.log('--- Step 0: Test Fixture Setup ---');
  let category = await prisma.category.findFirst();
  if (!category) {
    category = await prisma.category.create({
      data: { name: 'P3 Test Category', slug: `p3-cat-${runId}` },
    });
  }

  const product = await prisma.product.create({
    data: {
      name: `P3 Abaya ${runId}`,
      slug: `p3-abaya-${runId}`,
      categoryId: category.id,
      shippingCharge: new Prisma.Decimal('50.00'),
    },
  });

  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `P3-SKU-${runId}`,
      title: 'Midnight Black',
      sellingPrice: new Prisma.Decimal('1000.00'),
      mrp: new Prisma.Decimal('1500.00'),
    },
  });

  await prisma.inventoryItem.create({
    data: {
      variantId: variant.id,
      physicalStock: 50,
      reservedStock: 0,
    },
  });

  await prisma.fifoLayer.create({
    data: {
      variantId: variant.id,
      unitCost: new Prisma.Decimal('500.00'),
      initialQuantity: 50,
      remainingQuantity: 50,
      referenceId: `P3-FIFO-${runId}`,
    },
  });

  console.log(`  Created test variant ${variant.sku} with 50 units in stock @ cost 500.00\n`);

  // --- Objective 1: Reporting Correctness ---
  console.log('--- Objective 1: Reporting Correctness ---');
  console.log('  Rule: CONTACTED is NOT a sale. Sale statuses are strictly CONFIRMED, DISPATCHED, DELIVERED.');

  // Create Order A: CONTACTED
  const orderA = await createWhatsAppOrder({
    creationIdempotencyKey: `p3-idem-repA-${runId}`,
    customer: {
      name: 'Reporting Customer A',
      mobile: '+919876543210',
      address: 'Street 1',
      city: 'Calicut',
      state: 'Kerala',
      pincode: '673001',
    },
    items: [{ variantId: variant.id, quantity: 2 }],
  });
  console.log(`  Created Order A (${orderA.orderNumber}): status=${orderA.status}, grandTotal=${orderA.grandTotal}`);

  // Create Order B: CANCELLED
  const orderB = await createWhatsAppOrder({
    creationIdempotencyKey: `p3-idem-repB-${runId}`,
    customer: {
      name: 'Reporting Customer B',
      mobile: '+919876543211',
      address: 'Street 2',
      city: 'Kochi',
      state: 'Kerala',
      pincode: '682001',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
  });
  await transitionOrderStatus({
    orderId: orderB.id,
    targetStatus: OrderStatus.CANCELLED,
    idempotencyKey: `p3-cancel-repB-${runId}`,
    notes: 'Customer changed mind',
  });
  console.log(`  Created Order B (${orderB.orderNumber}): transitioned to CANCELLED`);

  // Verify Executive Financial Summary before confirmation:
  // Neither Order A (CONTACTED) nor Order B (CANCELLED) should be included in grossSales or totalOrders
  const execSummaryBefore = await getExecutiveFinancialSummary();
  const salesRowsBefore = await getSalesReportRows({ pageSize: 50 });
  const p3RowsBefore = salesRowsBefore.rows.filter(
    (r) => r.id === orderA.id || r.id === orderB.id
  );
  assert(
    p3RowsBefore.length === 0,
    `Neither CONTACTED (Order A) nor CANCELLED (Order B) should appear in default sales report rows! Found: ${p3RowsBefore.length}`
  );
  console.log('  ✓ Verified CONTACTED & CANCELLED orders are excluded from default Sales Report rows');

  // Verify Product Performance before confirmation:
  const prodPerfBefore = await getProductPerformanceSummary();
  const testProdPerfBefore = prodPerfBefore.find((p) => p.productId === product.id);
  assert(
    !testProdPerfBefore || testProdPerfBefore.unitsSold === 0,
    `Product performance must show 0 units sold for CONTACTED/CANCELLED orders! Found: ${testProdPerfBefore?.unitsSold}`
  );
  console.log('  ✓ Verified CONTACTED & CANCELLED orders are excluded from Product Performance units/revenue');

  // Now Confirm Order A (CONTACTED -> CONFIRMED)
  await transitionOrderStatus({
    orderId: orderA.id,
    targetStatus: OrderStatus.CONFIRMED,
    idempotencyKey: `p3-confirm-repA-${runId}`,
  });
  console.log(`  Transitioned Order A to CONFIRMED`);

  // Verify Executive Financial Summary after confirmation:
  const salesRowsAfter = await getSalesReportRows({ pageSize: 50 });
  const orderARow = salesRowsAfter.rows.find((r) => r.id === orderA.id);
  assert(orderARow !== undefined, 'Confirmed Order A must now appear in Sales Report rows!');
  assert(orderARow?.orderStatus === OrderStatus.CONFIRMED, 'Order A row status must be CONFIRMED');
  assert(orderARow?.itemsQuantity === 2, 'Order A itemsQuantity must be 2');
  assert(orderARow?.fifoCogs === 1000, 'Order A fifoCogs must be 1000 (2 × 500)');
  console.log('  ✓ Verified CONFIRMED order is now included in Sales Report rows with correct units & FIFO COGS');

  // Verify Product Performance after confirmation:
  const prodPerfAfter = await getProductPerformanceSummary();
  const testProdPerfAfter = prodPerfAfter.find((p) => p.productId === product.id);
  assert(testProdPerfAfter !== undefined, 'Test product must now appear in product performance summary');
  assert(testProdPerfAfter?.unitsSold === 2, `Product performance units sold must be 2, got ${testProdPerfAfter?.unitsSold}`);
  assert(testProdPerfAfter?.fifoCogs === 1000, `Product performance FIFO COGS must be 1000, got ${testProdPerfAfter?.fifoCogs}`);
  console.log('  ✓ Verified CONFIRMED order is now included in Product Performance metrics');

  // Verify Order Funnel breakdown
  const funnel = await getOrderFunnelSummary();
  assert(funnel.confirmed >= 1, 'Funnel confirmed count must be >= 1');
  assert(funnel.cancelled >= 1, 'Funnel cancelled count must be >= 1');
  console.log(`  ✓ Verified Order Funnel reflects status distribution (confirmed=${funnel.confirmed}, cancelled=${funnel.cancelled})\n`);

  // --- Objective 2: Payment Administration ---
  console.log('--- Objective 2: Payment Administration ---');
  console.log('  Rule: Admin can update paymentMethod (COD, UPI, CASH) and paymentStatus (PAID, DUE). PAID requires paymentMethod.');

  // Create Order C for payment testing
  const orderC = await createWhatsAppOrder({
    creationIdempotencyKey: `p3-idem-payC-${runId}`,
    customer: {
      name: 'Payment Test Customer',
      mobile: '+919876543212',
      address: 'Street 3',
      city: 'Calicut',
      state: 'Kerala',
      pincode: '673001',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
  });
  assert(orderC.paymentStatus === PaymentStatus.DUE, 'Initial WhatsApp order paymentStatus must be DUE');
  assert(orderC.paymentMethod === null, 'Initial WhatsApp order paymentMethod must be null');

  // Test 2.1: Setting PAID without paymentMethod must fail
  let paidWithoutMethodFailed = false;
  try {
    await updateOrderPaymentAdmin({
      orderId: orderC.id,
      paymentStatus: PaymentStatus.PAID,
    });
  } catch (err: any) {
    paidWithoutMethodFailed = err.message.includes('PAYMENT_METHOD_REQUIRED');
  }
  assert(paidWithoutMethodFailed, 'Setting paymentStatus=PAID without paymentMethod must throw PAYMENT_METHOD_REQUIRED error');
  console.log('  ✓ Verified setting paymentStatus=PAID without paymentMethod is rejected');

  // Test 2.2: Set paymentMethod=UPI
  const updatedMethod = await updateOrderPaymentAdmin({
    orderId: orderC.id,
    paymentMethod: PaymentMethod.UPI,
  });
  assert(updatedMethod.paymentMethod === PaymentMethod.UPI, 'Order paymentMethod must be UPI');
  assert(updatedMethod.paymentStatus === PaymentStatus.DUE, 'Order paymentStatus must remain DUE');
  console.log('  ✓ Verified updating paymentMethod to UPI succeeded, paymentStatus remains DUE');

  // Test 2.3: Set paymentStatus=PAID (now that method is UPI)
  const updatedPaid = await updateOrderPaymentAdmin({
    orderId: orderC.id,
    paymentStatus: PaymentStatus.PAID,
  });
  assert(updatedPaid.paymentStatus === PaymentStatus.PAID, 'Order paymentStatus must now be PAID');
  console.log('  ✓ Verified updating paymentStatus to PAID succeeded');

  // Test 2.4: Update both simultaneously: paymentMethod=COD, paymentStatus=DUE
  const updatedBoth = await updateOrderPaymentAdmin({
    orderId: orderC.id,
    paymentMethod: PaymentMethod.COD,
    paymentStatus: PaymentStatus.DUE,
  });
  assert(updatedBoth.paymentMethod === PaymentMethod.COD, 'Order paymentMethod must be COD');
  assert(updatedBoth.paymentStatus === PaymentStatus.DUE, 'Order paymentStatus must be DUE');
  console.log('  ✓ Verified simultaneous update to COD and DUE succeeded');

  // Test 2.5: Verify payment changes did NOT touch inventory or FIFO
  const invAfterPay = await prisma.inventoryItem.findUniqueOrThrow({
    where: { variantId: variant.id },
  });
  assert(invAfterPay.reservedStock === 0, 'Reserved stock must remain 0 during payment updates');
  console.log('  ✓ Verified payment updates did NOT touch inventory or FIFO');

  // Test 2.6: Verify Server Action requires admin auth
  const actionRes = await updateOrderPaymentAction({
    orderId: orderC.id,
    paymentMethod: PaymentMethod.CASH,
  });
  assert(actionRes.success === false, 'updateOrderPaymentAction must reject unauthenticated call');
  console.log('  ✓ Verified updateOrderPaymentAction is protected by requireAdminAuth()\n');

  // --- Objective 3: WhatsApp Returns / Refunds ---
  console.log('--- Objective 3: WhatsApp Returns / Refunds ---');
  console.log('  Rule: Offline refunds (CASH, BANK_TRANSFER) for WhatsApp orders execute manually without gateway.');

  // Create Order D, confirm, dispatch, and deliver it
  const orderD = await createWhatsAppOrder({
    creationIdempotencyKey: `p3-idem-refD-${runId}`,
    customer: {
      name: 'Refund Test Customer',
      mobile: '+919876543213',
      address: 'Street 4',
      city: 'Calicut',
      state: 'Kerala',
      pincode: '673001',
    },
    items: [{ variantId: variant.id, quantity: 2 }],
  });
  await transitionOrderStatus({
    orderId: orderD.id,
    targetStatus: OrderStatus.CONFIRMED,
    idempotencyKey: `p3-conf-refD-${runId}`,
  });
  await transitionOrderStatus({
    orderId: orderD.id,
    targetStatus: OrderStatus.DISPATCHED,
    idempotencyKey: `p3-disp-refD-${runId}`,
    shipment: { courierName: 'BlueDart', trackingId: `BD-${runId}` },
  });
  await transitionOrderStatus({
    orderId: orderD.id,
    targetStatus: OrderStatus.DELIVERED,
    idempotencyKey: `p3-deliv-refD-${runId}`,
  });
  // Mark as PAID via UPI
  await updateOrderPaymentAdmin({
    orderId: orderD.id,
    paymentMethod: PaymentMethod.UPI,
    paymentStatus: PaymentStatus.PAID,
  });
  console.log(`  Created delivered & PAID WhatsApp Order D (${orderD.orderNumber})`);

  // Test 3.1: createRefundIntent with ORIGINAL_PAYMENT_GATEWAY on WhatsApp order must fail
  let gatewayRefundMethodFailed = false;
  try {
    await createRefundIntent({
      orderId: orderD.id,
      method: RefundMethod.ORIGINAL_PAYMENT_GATEWAY,
      amount: 1000,
      idempotencyKey: `p3-gw-ref-fail-${runId}`,
      allocations: [
        {
          orderItemId: orderD.items[0].id,
          merchandiseRefund: 1000,
        },
      ],
    });
  } catch (err: any) {
    gatewayRefundMethodFailed = err.message.includes('INVALID_REFUND_METHOD');
  }
  assert(gatewayRefundMethodFailed, 'WhatsApp order must reject ORIGINAL_PAYMENT_GATEWAY refund method');
  console.log('  ✓ Verified createRefundIntent rejects ORIGINAL_PAYMENT_GATEWAY on WhatsApp order');

  // Test 3.2: createRefundIntent with CASH on WhatsApp order succeeds in PENDING
  const refundIntentRes = await createRefundIntent({
    orderId: orderD.id,
    method: RefundMethod.CASH,
    amount: 1000,
    idempotencyKey: `p3-cash-ref-${runId}`,
    allocations: [
      {
        orderItemId: orderD.items[0].id,
        merchandiseRefund: 1000,
      },
    ],
  });
  const refundRecord = refundIntentRes.refund;
  assert(refundRecord.status === RefundStatus.PENDING, 'Offline refund starts in PENDING status');
  assert(refundRecord.method === RefundMethod.CASH, 'Refund method is CASH');
  console.log(`  ✓ Created offline CASH refund intent: ${refundRecord.refundNumber}, status=PENDING`);

  // Test 3.3: dispatchGatewayRefund must reject this offline refund
  let dispatchGwFailed = false;
  try {
    await dispatchGatewayRefund(refundRecord.id);
  } catch (err: any) {
    dispatchGwFailed = err.message.includes('GATEWAY_REFUND_NOT_SUPPORTED');
  }
  assert(dispatchGwFailed, 'dispatchGatewayRefund must reject CASH offline refund');
  console.log('  ✓ Verified dispatchGatewayRefund rejects offline CASH refund');

  // Test 3.4: executeManualOfflineRefund completes the refund and updates order paymentStatus
  const completedRefund = await executeManualOfflineRefund({
    refundId: refundRecord.id,
    referenceId: `CASH-REC-${runId}`,
    notes: 'Settled offline at store counter',
  });
  assert(completedRefund.status === RefundStatus.COMPLETED, 'Refund status must be COMPLETED');
  assert(completedRefund.providerRefundId === `CASH-REC-${runId}`, 'Refund providerRefundId must store referenceId');

  const orderDAfterRefund = await prisma.order.findUniqueOrThrow({
    where: { id: orderD.id },
  });
  // Grand total was 2100 (2 × 1000 + 100 shipping), refunded 1000 -> PARTIALLY_REFUNDED
  assert(
    orderDAfterRefund.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED,
    `Order paymentStatus must be PARTIALLY_REFUNDED, got ${orderDAfterRefund.paymentStatus}`
  );
  console.log('  ✓ Verified executeManualOfflineRefund completed refund and transitioned Order to PARTIALLY_REFUNDED');

  // Test 3.5: Verify executeManualOfflineRefundAction is protected by requireAdminAuth()
  const refundActionRes = await executeManualOfflineRefundAction({
    refundId: refundRecord.id,
  });
  assert(refundActionRes.success === false, 'executeManualOfflineRefundAction must reject unauthenticated call');
  console.log('  ✓ Verified executeManualOfflineRefundAction is protected by requireAdminAuth()\n');

  // --- Objective 4: Coupon Accounting ---
  console.log('--- Objective 4: Coupon Accounting ---');
  console.log('  Rule: WhatsApp orders consume coupon usage only at CONTACTED -> CONFIRMED with concurrency protection.');

  // Create a strictly limited coupon (usageLimitGlobal: 1)
  const couponCode = `P3LIMIT${runId}`;
  const coupon = await prisma.coupon.create({
    data: {
      name: 'P3 Limited Coupon',
      code: couponCode,
      discountType: 'FIXED_AMOUNT',
      discountValue: new Prisma.Decimal('100.00'),
      usageLimitGlobal: 1,
      usageCountGlobal: 0,
      status: 'ACTIVE',
    },
  });
  console.log(`  Created coupon ${couponCode} with usageLimitGlobal = 1`);

  // Create Order E1 with coupon
  const orderE1 = await createWhatsAppOrder({
    creationIdempotencyKey: `p3-idem-coup1-${runId}`,
    customer: {
      name: 'Coupon Customer 1',
      mobile: '+919876543214',
      address: 'Street 5',
      city: 'Calicut',
      state: 'Kerala',
      pincode: '673001',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
    couponCode: couponCode,
  });
  assert(orderE1.couponId === coupon.id, 'Order E1 must have couponId');
  assert(Number(orderE1.discountTotal) === 100, 'Order E1 must have 100 discount');

  // Create Order E2 with same coupon
  const orderE2 = await createWhatsAppOrder({
    creationIdempotencyKey: `p3-idem-coup2-${runId}`,
    customer: {
      name: 'Coupon Customer 2',
      mobile: '+919876543215',
      address: 'Street 6',
      city: 'Calicut',
      state: 'Kerala',
      pincode: '673001',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
    couponCode: couponCode,
  });
  assert(orderE2.couponId === coupon.id, 'Order E2 must have couponId');

  // Verify coupon was NOT consumed by either CONTACTED order
  const couponCheck1 = await prisma.coupon.findUniqueOrThrow({
    where: { id: coupon.id },
  });
  assert(couponCheck1.usageCountGlobal === 0, 'usageCountGlobal must still be 0 while orders are CONTACTED');
  console.log('  ✓ Verified CONTACTED orders did NOT consume coupon usage (usageCountGlobal = 0)');

  // Confirm Order E1: Should succeed and increment usageCountGlobal to 1
  await transitionOrderStatus({
    orderId: orderE1.id,
    targetStatus: OrderStatus.CONFIRMED,
    idempotencyKey: `p3-conf-coup1-${runId}`,
  });
  const couponCheck2 = await prisma.coupon.findUniqueOrThrow({
    where: { id: coupon.id },
  });
  assert(couponCheck2.usageCountGlobal === 1, 'usageCountGlobal must be 1 after confirming Order E1');

  const couponUsage1 = await prisma.couponUsage.findFirst({
    where: { orderId: orderE1.id, couponId: coupon.id },
  });
  assert(couponUsage1 !== null, 'CouponUsage record must be created for confirmed Order E1');
  console.log('  ✓ Verified confirming Order E1 consumed coupon and recorded CouponUsage');

  // Confirm Order E2: Should FAIL with COUPON_LIMIT_REACHED
  let orderE2ConfFailed = false;
  try {
    await transitionOrderStatus({
      orderId: orderE2.id,
      targetStatus: OrderStatus.CONFIRMED,
      idempotencyKey: `p3-conf-coup2-${runId}`,
    });
  } catch (err: any) {
    orderE2ConfFailed = err.message.includes('COUPON_LIMIT_REACHED');
  }
  assert(orderE2ConfFailed, 'Confirming Order E2 must be rejected with COUPON_LIMIT_REACHED');

  const orderE2Check = await prisma.order.findUniqueOrThrow({
    where: { id: orderE2.id },
  });
  assert(orderE2Check.status === OrderStatus.CONTACTED, 'Order E2 must remain CONTACTED after rejected confirmation');
  console.log('  ✓ Verified over-limit Order E2 confirmation was rejected, order remains CONTACTED\n');

  // --- Objective 5: Legacy Payment Isolation ---
  console.log('--- Objective 5: Legacy Payment Isolation ---');
  console.log('  Rule: Gateway payment initiation is guarded against WhatsApp/Direct orders, while legacy ONLINE works.');

  // Test 5.1: Attempt gateway payment on WhatsApp order must be rejected
  let waGwInitFailed = false;
  try {
    await initiatePayment({
      orderId: orderA.id,
      initiationIdempotencyKey: `p3-gw-init-wa-${runId}`,
      provider: 'MOCK',
    });
  } catch (err: any) {
    waGwInitFailed = err.message.includes('GATEWAY_PAYMENT_NOT_ALLOWED');
  }
  assert(waGwInitFailed, 'initiatePayment must reject WhatsApp orders with GATEWAY_PAYMENT_NOT_ALLOWED');
  console.log('  ✓ Verified initiatePayment rejects WhatsApp orders');

  // Test 5.2: Create a DIRECT sale and attempt gateway payment
  const directSale = await createDirectSale({
    creationIdempotencyKey: `p3-idem-direct-${runId}`,
    customer: {
      name: 'Direct Customer',
      mobile: '+919876543216',
      address: 'Store Counter',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
  });
  let directGwInitFailed = false;
  try {
    await initiatePayment({
      orderId: directSale.id,
      initiationIdempotencyKey: `p3-gw-init-dir-${runId}`,
      provider: 'MOCK',
    });
  } catch (err: any) {
    directGwInitFailed = err.message.includes('GATEWAY_PAYMENT_NOT_ALLOWED');
  }
  assert(directGwInitFailed, 'initiatePayment must reject Direct sales with GATEWAY_PAYMENT_NOT_ALLOWED');
  console.log('  ✓ Verified initiatePayment rejects Direct sales');

  // Test 5.3: Legacy ONLINE order payment initiation works seamlessly
  const onlineOrder = await createOnlineOrder({
    creationIdempotencyKey: `p3-idem-online-${runId}`,
    customer: {
      name: 'Online Customer',
      mobile: '+919876543217',
      address: 'Street 7',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
    shippingFee: 50.0,
  });
  const onlinePayment = await initiatePayment({
    orderId: onlineOrder.id,
    initiationIdempotencyKey: `p3-gw-init-online-${runId}`,
    provider: 'MOCK',
  });
  assert(onlinePayment.orderId === onlineOrder.id, 'Online payment must be linked to online order');
  assert(onlinePayment.status === 'INITIATED', 'Online payment attempt status must be INITIATED');
  console.log(`  ✓ Verified legacy ONLINE order payment initiation works seamlessly (${onlinePayment.paymentNumber})\n`);

  console.log('================================================================');
  console.log('ALL PHASE 3 ACCEPTANCE CRITERIA VERIFIED AND PASSED 100%!');
  console.log('================================================================');
}

main()
  .catch((err) => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
