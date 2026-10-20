import { prisma } from '../lib/db/prisma';
import {
  receiveStock,
  consumeFifoStock,
  getVariantInventoryValuation,
} from '../lib/inventory/fifo-engine';
import {
  createReturnRequest,
  approveReturnRequest,
  rejectReturnRequest,
  processIncrementalInspection,
  resolvePartialReturn,
  approveSameProductExchange,
  dispatchExchangeItem,
  cancelExchangeItem,
  evaluateReturnResolution,
} from '../lib/returns/return-engine';
import {
  createRefundIntent,
  dispatchGatewayRefund,
  finalizeRefund,
  retryRefundAction,
  resolveFailedRefundAction,
  calculateAlreadyRefundedTax,
  calculateAlreadyReservedOrDisbursed,
  calculateCumulativeRefundedMoney,
  deriveOrderPaymentStatus,
} from '../lib/returns/refund-engine';
import {
  RefundPurpose,
  RefundStatus,
  ManualRefundResolutionType,
  RefundMethod,
  ReturnStatus,
  ReturnReason,
  PaymentPurpose,
  PaymentAttemptStatus,
  PaymentStatus,
  ExchangeItemStatus,
} from '@prisma/client';

async function main() {
  console.log('================================================================');
  console.log('STARTING PHASE 9 AUTOMATED VERIFICATION SUITE');
  console.log('Customer Returns, Inspections, Restocking & Financial Refunds');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
      failedTests++;
    }
  }

  const timestamp = Date.now();

  // 1. SETUP BASE CATALOG DATA
  console.log('--- 1. Setting up Catalog, Category & Product Variants ---');

  const category = await prisma.category.create({
    data: {
      name: `Returns Cat ${timestamp}`,
      slug: `returns-cat-${timestamp}`,
    },
  });

  const product = await prisma.product.create({
    data: {
      name: `Returns Polo ${timestamp}`,
      slug: `returns-polo-${timestamp}`,
      categoryId: category.id,
      status: 'ACTIVE',
    },
  });

  const variantWhiteS = await prisma.productVariant.create({
    data: {
      productId: product.id,
      title: 'White / S',
      sku: `POLO-WHT-S-${timestamp}`,
      mrp: 1500,
      sellingPrice: 1200,
      costPrice: 600,
    },
  });

  const variantWhiteM = await prisma.productVariant.create({
    data: {
      productId: product.id,
      title: 'White / M',
      sku: `POLO-WHT-M-${timestamp}`,
      mrp: 1500,
      sellingPrice: 1400,
      costPrice: 700,
    },
  });

  // Receive initial FIFO stock (2 layers for White S: 10 units @ 500, 10 units @ 600)
  await receiveStock({
    variantId: variantWhiteS.id,
    quantity: 10,
    unitCost: 500,
    idempotencyKey: `rec-s1-${timestamp}`,
  });

  await receiveStock({
    variantId: variantWhiteS.id,
    quantity: 10,
    unitCost: 600,
    idempotencyKey: `rec-s2-${timestamp}`,
  });

  await receiveStock({
    variantId: variantWhiteM.id,
    quantity: 10,
    unitCost: 700,
    idempotencyKey: `rec-m1-${timestamp}`,
  });

  console.log('Catalog setup complete.');

  // 2. CREATE DELIVERED ORDER
  console.log('\n--- 2. Creating & Fulfilling Test Order ---');

  const testOrder1 = await prisma.order.create({
    data: {
      orderNumber: `ORD-RET-${timestamp}`,
      salesChannel: 'ONLINE',
      status: 'DELIVERED',
      deliveredAt: new Date(),
      customerNameSnapshot: `Customer ${timestamp}`,
      customerMobileSnapshot: `+9198765${String(timestamp).slice(-5)}`,
      subtotal: 4800,
      discountTotal: 0,
      shippingFee: 100,
      taxTotal: 240,
      grandTotal: 5140,
      paymentStatus: 'PAID',
      items: {
        create: [
          {
            variantId: variantWhiteS.id,
            productNameSnapshot: 'Polo',
            variantTitleSnapshot: 'White S',
            skuSnapshot: variantWhiteS.sku,
            quantity: 4,
            unitPrice: 1200,
            mrp: 1500,
            lineTotal: 4800,
          },
        ],
      },
    },
    include: { items: true },
  });

  const orderRes = { order: testOrder1 };
  const orderId = testOrder1.id;

  // Record SALE_OUT movement for LIFO restocking reference
  await consumeFifoStock({
    variantId: variantWhiteS.id,
    quantity: 4,
    referenceId: orderId,
    type: 'SALE_OUT',
    idempotencyKey: `ord-sale-${timestamp}`,
  });

  console.log(`Order ${testOrder1.orderNumber} created, stock consumed, and marked DELIVERED.`);

  // 3. RETURN WINDOW & ELIGIBILITY TESTS
  console.log('\n--- 3. Testing Return Window Eligibility & Over-Return Prevention ---');

  // Test 3.1: Valid return request within 14 days
  const retSubRes1 = await createReturnRequest({
    orderId,
    reason: ReturnReason.SIZE_FIT_ISSUE,
    reasonDetails: 'Too small',
    items: [{ orderItemId: orderRes.order.items[0].id, quantityRequested: 2 }],
    submissionIdempotencyKey: `ret-sub-1-${timestamp}`,
  });

  assert(retSubRes1.returnRequest.status === ReturnStatus.REQUESTED, 'Return request created in REQUESTED status');
  assert(Number(retSubRes1.returnRequest.subtotalRefund) === 2400, 'Pro-rata subtotal refund computed correctly (2 * 1200)');

  // Test 3.2: Over-return attempt (requesting more than available unreturned units)
  let overReturnFailed = false;
  try {
    await createReturnRequest({
      orderId,
      reason: ReturnReason.CHANGE_OF_MIND,
      items: [{ orderItemId: orderRes.order.items[0].id, quantityRequested: 3 }], // 2 requested + 3 = 5 > 4
      submissionIdempotencyKey: `ret-sub-over-${timestamp}`,
    });
  } catch (e: any) {
    overReturnFailed = e.message.includes('OVER_RETURN_ATTEMPT');
  }
  assert(overReturnFailed, 'Over-return request rejected with OVER_RETURN_ATTEMPT error');

  // Test 3.3: Return eligibility window past 14 days
  const oldOrder = await prisma.order.create({
    data: {
      orderNumber: `ORD-OLD-${timestamp}`,
      salesChannel: 'ONLINE',
      status: 'DELIVERED',
      deliveredAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
      customerNameSnapshot: 'Old Customer',
      customerMobileSnapshot: '+919999988888',
      subtotal: 1000,
      grandTotal: 1000,
      items: {
        create: [
          {
            variantId: variantWhiteS.id,
            productNameSnapshot: 'Polo',
            variantTitleSnapshot: 'White S',
            skuSnapshot: variantWhiteS.sku,
            quantity: 1,
            unitPrice: 1000,
            mrp: 1000,
            lineTotal: 1000,
          },
        ],
      },
    },
  });

  let expiredWindowFailed = false;
  try {
    await createReturnRequest({
      orderId: oldOrder.id,
      reason: ReturnReason.DEFECTIVE,
      items: [{ orderItemId: (await prisma.orderItem.findFirst({ where: { orderId: oldOrder.id } }))!.id, quantityRequested: 1 }],
      submissionIdempotencyKey: `ret-sub-exp-${timestamp}`,
    });
  } catch (e: any) {
    expiredWindowFailed = e.message.includes('RETURN_WINDOW_EXPIRED');
  }
  assert(expiredWindowFailed, 'Return request past 14 days rejected with RETURN_WINDOW_EXPIRED');

  // 4. APPROVAL & INCREMENTAL INSPECTION WITH LIFO RESTOCKING
  console.log('\n--- 4. Testing Admin Approval & LIFO Restocking Inspection ---');

  const returnRequestId1 = retSubRes1.returnRequest.id;
  await approveReturnRequest(returnRequestId1, 'Approved by Manager');

  const returnItem1 = retSubRes1.returnRequest.items[0];

  // Inspect 2 units: 1 Restockable, 1 Damaged
  const valBeforeRestock = await getVariantInventoryValuation(variantWhiteS.id);

  const inspectRes1 = await processIncrementalInspection({
    returnRequestId: returnRequestId1,
    idempotencyKey: `rcpt-evt-1-${timestamp}`,
    receivedBy: 'Inspector A',
    items: [
      {
        returnItemId: returnItem1.id,
        quantityRestocked: 1,
        quantityDamaged: 1,
      },
    ],
  });

  assert(inspectRes1.receiptEvent.items.length === 1, 'Incremental ReturnReceiptEvent logged');

  const valAfterRestock = await getVariantInventoryValuation(variantWhiteS.id);
  console.log(`Valuation before: ${valBeforeRestock}, Valuation after: ${valAfterRestock}`);
  assert(valAfterRestock > valBeforeRestock, 'Restocking incremented FIFO inventory valuation via LIFO layer restoration');

  const updatedReq1 = await prisma.returnRequest.findUnique({
    where: { id: returnRequestId1 },
    include: { items: true },
  });
  assert(updatedReq1?.status === ReturnStatus.INSPECTED || updatedReq1?.status === ReturnStatus.RESOLVED, 'ReturnRequest status updated to INSPECTED/RESOLVED after 100% arrival inspection');

  // 5. SAME-PRODUCT VARIANT EXCHANGES
  console.log('\n--- 5. Testing Same-Product Variant Exchange Engine ---');

  const testOrder2 = await prisma.order.create({
    data: {
      orderNumber: `ORD-EX-${timestamp}`,
      salesChannel: 'ONLINE',
      status: 'DELIVERED',
      deliveredAt: new Date(),
      customerNameSnapshot: `Exchange Customer ${timestamp}`,
      customerMobileSnapshot: `+9198765${String(timestamp + 1).slice(-5)}`,
      subtotal: 1200,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 0,
      grandTotal: 1200,
      paymentStatus: 'PAID',
      items: {
        create: [
          {
            variantId: variantWhiteS.id,
            productNameSnapshot: 'Polo',
            variantTitleSnapshot: 'White S',
            skuSnapshot: variantWhiteS.sku,
            quantity: 1,
            unitPrice: 1200,
            mrp: 1500,
            lineTotal: 1200,
          },
        ],
      },
    },
    include: { items: true },
  });

  const orderRes2 = { order: testOrder2 };

  const retExSub = await createReturnRequest({
    orderId: orderRes2.order.id,
    reason: ReturnReason.SIZE_FIT_ISSUE,
    items: [{ orderItemId: orderRes2.order.items[0].id, quantityRequested: 1 }],
    submissionIdempotencyKey: `ret-ex-sub-${timestamp}`,
  });

  await approveReturnRequest(retExSub.returnRequest.id);

  // Exchange White S (1200) -> White M (1400): Higher priced (+200 differential)
  const exchangeItem = await approveSameProductExchange({
    returnRequestId: retExSub.returnRequest.id,
    returnItemId: retExSub.returnRequest.items[0].id,
    replacementVariantId: variantWhiteM.id,
    quantity: 1,
  });

  assert(Number(exchangeItem.priceDifference) === 200, 'Exchange price difference calculated correctly (+200)');
  assert(exchangeItem.differentialPaymentId !== null, 'Higher-priced exchange created differential Payment record');

  // Verify stock reservation (reservedStock = 1, physicalStock UNCHANGED)
  const itemM = await prisma.inventoryItem.findUnique({ where: { variantId: variantWhiteM.id } });
  assert(itemM?.reservedStock === 1, 'Replacement variant reservedStock incremented by 1');

  // Attempt dispatch before payment -> Must fail
  let dispatchUnpaidFailed = false;
  try {
    await dispatchExchangeItem(exchangeItem.id);
  } catch (e: any) {
    dispatchUnpaidFailed = e.message.includes('CANNOT_DISPATCH_UNPAID_EXCHANGE');
  }
  assert(dispatchUnpaidFailed, 'Dispatching unpaid higher-priced exchange rejected');

  // Complete differential payment
  await prisma.payment.update({
    where: { id: exchangeItem.differentialPaymentId! },
    data: { status: PaymentAttemptStatus.SUCCESS },
  });

  // Now dispatch exchange
  const dispatchedEx = await dispatchExchangeItem(exchangeItem.id);
  assert(dispatchedEx.status === ExchangeItemStatus.DISPATCHED, 'Exchange replacement dispatched successfully');

  // 6. ASYNCHRONOUS 3-PHASE FINANCIAL REFUND ENGINE & TAX CAPACITY
  console.log('\n--- 6. Testing 3-Phase Financial Refund Engine & Tax Capacity ---');

  // Create Refund Intent Phase 1
  const refIntentRes = await createRefundIntent({
    orderId,
    returnRequestId: returnRequestId1,
    amount: 2520,
    idempotencyKey: `ref-intent-1-${timestamp}`,
    allocations: [
      {
        orderItemId: orderRes.order.items[0].id,
        returnItemId: returnItem1.id,
        merchandiseRefund: 2400,
        taxRefund: 120,
      },
    ],
  });

  assert(refIntentRes.refund.status === RefundStatus.PENDING, 'Refund intent created in PENDING status (Phase 1)');

  // Verify PENDING refund reserves tax capacity
  const reservedTax = await calculateAlreadyRefundedTax(prisma, orderRes.order.items[0].id);
  assert(reservedTax > 0, `PENDING refund reserves line tax capacity (tax: ${reservedTax})`);

  // Execute Phase 2 & 3: Dispatch & Finalize
  const finalizedRefund = await dispatchGatewayRefund(refIntentRes.refund.id);
  assert(finalizedRefund.status === RefundStatus.COMPLETED, 'Gateway refund finalized to COMPLETED (Phase 3)');

  // Verify Order.paymentStatus updated
  const updatedOrder1 = await prisma.order.findUnique({ where: { id: orderId } });
  assert(updatedOrder1?.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED, 'Order.paymentStatus updated to PARTIALLY_REFUNDED');

  // 7. PAYMENT-PATH RESTRICTIONS & MANUAL FAILED REFUND RESOLUTION
  console.log('\n--- 7. Testing Payment-Path Restrictions & Manual Write-Offs ---');

  // Create prepaid Razorpay order
  const prepaidOrder = await prisma.order.create({
    data: {
      orderNumber: `ORD-RZP-${timestamp}`,
      salesChannel: 'ONLINE',
      status: 'DELIVERED',
      deliveredAt: new Date(),
      customerNameSnapshot: 'Razorpay User',
      customerMobileSnapshot: '+919777766666',
      subtotal: 1200,
      grandTotal: 1200,
      payments: {
        create: [
          {
            paymentNumber: `PAY-RZP-${timestamp}`,
            provider: 'RAZORPAY',
            status: 'SUCCESS',
            amount: 1200,
            initiationIdempotencyKey: `pay-rzp-${timestamp}`,
            expiresAt: new Date(),
          },
        ],
      },
      items: {
        create: [
          {
            variantId: variantWhiteS.id,
            productNameSnapshot: 'Polo',
            variantTitleSnapshot: 'White S',
            skuSnapshot: variantWhiteS.sku,
            quantity: 1,
            unitPrice: 1200,
            mrp: 1200,
            lineTotal: 1200,
          },
        ],
      },
    },
    include: { items: true },
  });

  const rzpRet = await createReturnRequest({
    orderId: prepaidOrder.id,
    reason: ReturnReason.DEFECTIVE,
    items: [{ orderItemId: prepaidOrder.items[0].id, quantityRequested: 1 }],
    submissionIdempotencyKey: `ret-rzp-${timestamp}`,
  });

  await approveReturnRequest(rzpRet.returnRequest.id);

  // Create a FAILED refund on Razorpay order
  const failedRefIntent = await createRefundIntent({
    orderId: prepaidOrder.id,
    returnRequestId: rzpRet.returnRequest.id,
    amount: 1200,
    idempotencyKey: `ref-rzp-fail-${timestamp}`,
    allocations: [{ orderItemId: prepaidOrder.items[0].id, merchandiseRefund: 1200 }],
  });

  await prisma.refund.update({
    where: { id: failedRefIntent.refund.id },
    data: { status: RefundStatus.FAILED, failureReason: 'Razorpay API Down' },
  });

  // Attempt offline cash settlement on Razorpay order -> MUST FAIL
  let rzpOfflineCashFailed = false;
  try {
    await resolveFailedRefundAction({
      refundId: failedRefIntent.refund.id,
      adminId: 'ADMIN_TEST',
      resolutionType: ManualRefundResolutionType.OFFLINE_SETTLED_CASH,
      notes: 'Cash payout attempt',
    });
  } catch (e: any) {
    rzpOfflineCashFailed = e.message.includes('PAYMENT_PATH_RESTRICTION_VIOLATION');
  }
  assert(rzpOfflineCashFailed, 'Offline cash settlement on Razorpay order rejected with PAYMENT_PATH_RESTRICTION_VIOLATION');

  // Manual resolution via ADMINISTRATIVE_WRITEOFF on Razorpay order -> MUST SUCCEED
  const writeoffRes = await resolveFailedRefundAction({
    refundId: failedRefIntent.refund.id,
    adminId: 'ADMIN_TEST',
    resolutionType: ManualRefundResolutionType.ADMINISTRATIVE_WRITEOFF,
    notes: 'Approved administrative writeoff',
  });

  assert(writeoffRes.status === RefundStatus.MANUALLY_RESOLVED, 'FAILED refund write-off resolved to MANUALLY_RESOLVED');
  assert(Number(writeoffRes.allocations[0].taxRefund) === 0, 'ADMINISTRATIVE_WRITEOFF sets taxRefund = 0');

  const prepaidOrderAfter = await prisma.order.findUnique({ where: { id: prepaidOrder.id } });
  assert(prepaidOrderAfter?.paymentStatus === PaymentStatus.PAID, 'ADMINISTRATIVE_WRITEOFF does NOT alter Order.paymentStatus (remains PAID)');

  // 8. FULL REGRESSION SUITE EXECUTION
  console.log('\n--- 8. Phase 9 Final Resolution & Regression Audits ---');

  const checkTerminalRes = await evaluateReturnResolution(prisma, returnRequestId1);
  console.log(`ReturnRequest ${returnRequestId1} terminal evaluation result: ${checkTerminalRes}`);

  console.log('\n================================================================');
  console.log(`PHASE 9 VERIFICATION SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during Phase 9 verification:', err);
  process.exit(1);
});
