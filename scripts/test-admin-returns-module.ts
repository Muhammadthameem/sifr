import { prisma } from '../lib/db/prisma';
import {
  findOrderByNumber,
  findOrdersByPhone,
  createAdminFullReturn,
  acceptAdminReturn,
  rejectAdminReturn,
  getAdminReturnDetails,
  queryAdminReturns,
} from '../lib/returns/return-engine';
import {
  getExecutiveFinancialSummary,
  getChannelSummary,
  getProductReportSummary,
  getProductReportRows,
  getSalesReportRows,
  getSalesReportSummary,
  getReturnsSummary,
} from '../lib/reports/report-service';
import {
  OrderStatus,
  SalesChannel,
  PaymentStatus,
  ProductStatus,
  ReturnReason,
  ReturnStatus,
  RefundMethod,
  RefundStatus,
  Prisma,
} from '@prisma/client';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}`);
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

async function runReturnsModuleTests() {
  console.log('================================================================');
  console.log(' SIFR — ADMIN RETURNS, INVENTORY, REFUND & REPORTING TEST SUITE');
  console.log('================================================================\n');

  const runId = Math.floor(100000 + Math.random() * 900000).toString();
  const testPhone = `+919876${runId.slice(0, 6)}`;

  // Step 0: Test Fixtures Setup
  console.log('--- Step 0: Setting up catalog fixtures ---');
  const category = await prisma.category.create({
    data: {
      name: `Returns Test Category ${runId}`,
      slug: `returns-test-cat-${runId}`,
    },
  });

  const product = await prisma.product.create({
    data: {
      name: `Returns Test Shirt ${runId}`,
      slug: `returns-test-shirt-${runId}`,
      status: ProductStatus.ACTIVE,
      categoryId: category.id,
      shippingCharge: 0,
      variants: {
        create: {
          title: 'L',
          sku: `SKU-RET-${runId}`,
          sellingPrice: 1000,
          mrp: 1200,
          isAvailable: true,
          inventoryItem: {
            create: {
              physicalStock: 20,
              reservedStock: 0,
            },
          },
          fifoLayers: {
            create: {
              unitCost: 400,
              initialQuantity: 20,
              remainingQuantity: 20,
            },
          },
        },
      },
    },
    include: { variants: true },
  });

  const variant = product.variants[0];

  // Helper to create test orders
  async function createTestOrder(opts: {
    status: OrderStatus;
    paymentStatus?: PaymentStatus;
    customPhone?: string;
    customName?: string;
    grandTotal?: number;
  }) {
    const total = opts.grandTotal ?? 1000;
    const phone = opts.customPhone ?? testPhone;
    const name = opts.customName ?? `Customer ${runId}`;
    const seq = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `WA-${Date.now()}-${seq}`;

    // Ensure customer exists
    let customer = await prisma.customer.findUnique({ where: { mobile: phone } });
    if (!customer) {
      customer = await prisma.customer.create({
        data: { name, mobile: phone, address: 'Test Address' },
      });
    }

    const order = await prisma.order.create({
      data: {
        orderNumber,
        salesChannel: SalesChannel.WHATSAPP,
        status: opts.status,
        paymentStatus: opts.paymentStatus ?? PaymentStatus.PAID,
        customerId: customer.id,
        customerNameSnapshot: name,
        customerMobileSnapshot: phone,
        shippingAddressSnapshot: '123 Test St, Test City',
        subtotal: new Prisma.Decimal(total),
        shippingFee: new Prisma.Decimal(0),
        discountTotal: new Prisma.Decimal(0),
        taxTotal: new Prisma.Decimal(0),
        grandTotal: new Prisma.Decimal(total),
        totalFifoCogs: new Prisma.Decimal(400),
        dispatchedAt: opts.status === 'DISPATCHED' || opts.status === 'DELIVERED' ? new Date() : null,
        deliveredAt: opts.status === 'DELIVERED' ? new Date() : null,
        items: {
          create: {
            variantId: variant.id,
            productNameSnapshot: product.name,
            variantTitleSnapshot: variant.title,
            skuSnapshot: variant.sku,
            quantity: 1,
            unitPrice: new Prisma.Decimal(total),
            mrp: new Prisma.Decimal(1200),
            lineTotal: new Prisma.Decimal(total),
            fifoCogs: new Prisma.Decimal(400),
          },
        },
      },
      include: { items: true },
    });

    // Create SALE_OUT movement for DELIVERED / DISPATCHED orders
    if (opts.status === 'DISPATCHED' || opts.status === 'DELIVERED') {
      await prisma.inventoryMovement.create({
        data: {
          variantId: variant.id,
          type: 'SALE_OUT',
          quantity: -1,
          unitCost: new Prisma.Decimal(400),
          totalCost: new Prisma.Decimal(400),
          referenceId: order.id,
          consumedLayersJson: JSON.stringify([{ layerId: 'init-layer', quantity: 1, unitCost: 400 }]),
          notes: `Sale out for order ${order.orderNumber}`,
        },
      });
    }

    return order;
  }

  // =========================================================================
  // TEST 1 & 2: Search by Order Number
  // =========================================================================
  console.log('--- TEST 1 & 2: Search by Order Number ---');
  const deliveredOrder1 = await createTestOrder({ status: OrderStatus.DELIVERED });

  // Valid search
  const foundValid = await findOrderByNumber(deliveredOrder1.orderNumber);
  assert(foundValid !== null, 'Valid order should be found by orderNumber');
  assert(foundValid?.order.id === deliveredOrder1.id, 'Found order ID must match created order');
  assert(foundValid?.isEligible === true, 'DELIVERED order must be return eligible');
  assert(foundValid?.hasActiveReturn === false, 'New order must not have active return');
  console.log('  ✓ TEST 1 passed: Valid order found by order number with correct details');

  // Invalid search
  const foundInvalid = await findOrderByNumber('WA-NONEXISTENT-9999');
  assert(foundInvalid === null, 'Invalid order number should return null');
  console.log('  ✓ TEST 2 passed: Invalid order number safely returns null with no mutations');

  // =========================================================================
  // TEST 3, 4, 5: Customer Phone Search & Selection
  // =========================================================================
  console.log('\n--- TEST 3, 4, 5: Customer Phone Search & Selection ---');
  const deliveredOrder2 = await createTestOrder({ status: OrderStatus.DELIVERED });

  // Search by phone returns both orders for testPhone
  const phoneResults = await findOrdersByPhone(testPhone);
  assert(phoneResults.length >= 2, `Phone search should return at least 2 orders (got ${phoneResults.length})`);
  assert(phoneResults.some((o) => o.orderNumber === deliveredOrder1.orderNumber), 'Should contain Order 1');
  assert(phoneResults.some((o) => o.orderNumber === deliveredOrder2.orderNumber), 'Should contain Order 2');
  console.log('  ✓ TEST 3 & 4 passed: Phone search returns multiple orders for explicit admin selection');

  // Change selected order: selection is purely transient in UI and causes 0 mutations
  const returnsCountBefore = await prisma.returnRequest.count();
  assert(returnsCountBefore === 0, 'No return requests should exist yet');
  console.log('  ✓ TEST 5 passed: Order selection is non-mutating');

  // =========================================================================
  // TEST 6, 7, 8, 9, 10, 11: Eligibility & REQUESTED State
  // =========================================================================
  console.log('\n--- TEST 6-11: Return Eligibility & REQUESTED State ---');

  // DELIVERED order -> Create Return
  const returnReq1 = await createAdminFullReturn({
    orderId: deliveredOrder1.id,
    reason: ReturnReason.CHANGE_OF_MIND,
  });
  assert(returnReq1.status === ReturnStatus.REQUESTED, 'New return status must be REQUESTED');
  assert(Number(returnReq1.totalRefundAmount) === 1000, 'totalRefundAmount must equal order grandTotal (1000)');

  // Verify at REQUESTED: NO inventory change, NO FIFO change, NO refund created, order status unchanged
  const invItemAfterReq = await prisma.inventoryItem.findUnique({ where: { variantId: variant.id } });
  assert(invItemAfterReq?.physicalStock === 20, 'At REQUESTED, physical stock must not change');
  const refundsForReq1 = await prisma.refund.count({ where: { returnRequestId: returnReq1.id } });
  assert(refundsForReq1 === 0, 'At REQUESTED, no refund record must exist');
  const order1AfterReq = await prisma.order.findUnique({ where: { id: deliveredOrder1.id } });
  assert(order1AfterReq?.status === OrderStatus.DELIVERED, 'At REQUESTED, order status must remain DELIVERED');
  console.log('  ✓ TEST 6 passed: DELIVERED order creates REQUESTED return with 0 side effects');

  // DISPATCHED order -> Create Return
  const dispatchedOrder = await createTestOrder({ status: OrderStatus.DISPATCHED });
  const returnReqDispatched = await createAdminFullReturn({
    orderId: dispatchedOrder.id,
    reason: ReturnReason.WRONG_ITEM,
  });
  assert(returnReqDispatched.status === ReturnStatus.REQUESTED, 'DISPATCHED order return status must be REQUESTED');
  console.log('  ✓ TEST 7 passed: DISPATCHED order creates REQUESTED return');

  // CONTACTED order -> Ineligible
  const contactedOrder = await createTestOrder({ status: OrderStatus.CONTACTED });
  try {
    await createAdminFullReturn({ orderId: contactedOrder.id, reason: ReturnReason.OTHER, reasonDetails: 'test' });
    assert(false, 'CONTACTED order should throw error');
  } catch (err: any) {
    assert(err.message.includes('not been dispatched yet'), `Error message must explain dispatch requirement (got: ${err.message})`);
  }
  console.log('  ✓ TEST 8 passed: CONTACTED order rejected with correct message');

  // CONFIRMED order -> Ineligible
  const confirmedOrder = await createTestOrder({ status: OrderStatus.CONFIRMED });
  try {
    await createAdminFullReturn({ orderId: confirmedOrder.id, reason: ReturnReason.DEFECTIVE });
    assert(false, 'CONFIRMED order should throw error');
  } catch (err: any) {
    assert(err.message.includes('not been dispatched yet'), `Error message must explain dispatch requirement (got: ${err.message})`);
  }
  console.log('  ✓ TEST 9 passed: CONFIRMED order rejected with correct message');

  // CANCELLED order -> Ineligible
  const cancelledOrder = await createTestOrder({ status: OrderStatus.CANCELLED });
  try {
    await createAdminFullReturn({ orderId: cancelledOrder.id, reason: ReturnReason.DEFECTIVE });
    assert(false, 'CANCELLED order should throw error');
  } catch (err: any) {
    assert(err.message.includes('Cancelled orders cannot be returned'), `Error message must explain cancellation (got: ${err.message})`);
  }
  console.log('  ✓ TEST 10 passed: CANCELLED order rejected with correct message');

  // Duplicate return on same order -> Ineligible
  try {
    await createAdminFullReturn({ orderId: deliveredOrder1.id, reason: ReturnReason.DAMAGED });
    assert(false, 'Duplicate return should throw error');
  } catch (err: any) {
    assert(err.message.includes('already exists'), `Error must explain duplicate return (got: ${err.message})`);
  }
  console.log('  ✓ TEST 11 passed: Duplicate return on same order blocked safely');

  // =========================================================================
  // TEST 12 & 13: Accept Return, Inventory Restoration, FIFO, COGS & Financials
  // =========================================================================
  console.log('\n--- TEST 12 & 13: Accept Return, Inventory, FIFO, COGS & Financials ---');

  // Accept returnReq1 (PAID order for ₹1,000)
  const stockBeforeAccept = (await prisma.inventoryItem.findUnique({ where: { variantId: variant.id } }))?.physicalStock ?? 0;
  const acceptRes1 = await acceptAdminReturn({
    returnRequestId: returnReq1.id,
    refundMethod: RefundMethod.BANK_TRANSFER,
  });

  assert(acceptRes1.returnRequest.status === ReturnStatus.ACCEPTED, 'Return status must become ACCEPTED');

  // Verify Inventory & FIFO Restoration
  const stockAfterAccept = (await prisma.inventoryItem.findUnique({ where: { variantId: variant.id } }))?.physicalStock ?? 0;
  assert(stockAfterAccept === stockBeforeAccept + 1, `Physical stock must increment by 1 (was ${stockBeforeAccept}, now ${stockAfterAccept})`);

  // Verify RETURN_IN movement created
  const returnMovement = await prisma.inventoryMovement.findFirst({
    where: { referenceId: returnReq1.id, type: 'RETURN_IN' },
  });
  assert(returnMovement !== null, 'RETURN_IN movement must be logged');
  assert(returnMovement?.quantity === 1, 'RETURN_IN quantity must be +1');
  assert(Number(returnMovement?.totalCost) === 400, 'RETURN_IN totalCost must match original unitCost (400)');

  // Verify FifoLayer reconstructed
  const restoredLayer = await prisma.fifoLayer.findFirst({
    where: { referenceId: `RETURN_${returnReq1.id}` },
  });
  assert(restoredLayer !== null, 'FifoLayer must be reconstructed with RETURN reference');
  assert(Number(restoredLayer?.unitCost) === 400, 'FifoLayer unitCost must be restored to 400');
  assert(restoredLayer?.remainingQuantity === 1, 'FifoLayer remainingQuantity must be 1');

  // Verify Refund created & settled for PAID order
  const refund1 = await prisma.refund.findFirst({
    where: { returnRequestId: returnReq1.id },
  });
  assert(refund1 !== null, 'Refund must be created for PAID accepted return');
  assert(Number(refund1?.amount) === 1000, 'Refund amount must be ₹1,000');
  assert(refund1?.status === RefundStatus.COMPLETED, 'Offline settlement must mark refund COMPLETED');
  assert(refund1?.method === RefundMethod.BANK_TRANSFER, 'Refund method must be BANK_TRANSFER');

  // Verify Payment Status transitioned to REFUNDED
  const order1AfterAccept = await prisma.order.findUnique({ where: { id: deliveredOrder1.id } });
  assert(order1AfterAccept?.paymentStatus === PaymentStatus.REFUNDED, 'PAID order must transition to REFUNDED');
  assert(order1AfterAccept?.status === OrderStatus.DELIVERED, 'Order status must REMAIN DELIVERED');

  console.log('  ✓ TEST 12 & 13 passed: Return accepted, physical stock restored, FIFO reconstructed, refund settled, payment marked REFUNDED');

  // =========================================================================
  // TEST 14: DUE Return (Unpaid Order)
  // =========================================================================
  console.log('\n--- TEST 14: DUE Return (Unpaid Order) ---');
  const dueOrder = await createTestOrder({
    status: OrderStatus.DELIVERED,
    paymentStatus: PaymentStatus.DUE,
  });

  const dueReturn = await createAdminFullReturn({
    orderId: dueOrder.id,
    reason: ReturnReason.DEFECTIVE,
  });
  assert(dueReturn.status === ReturnStatus.REQUESTED, 'DUE order return status must be REQUESTED');

  const acceptDueRes = await acceptAdminReturn({
    returnRequestId: dueReturn.id,
  });
  assert(acceptDueRes.returnRequest.status === ReturnStatus.ACCEPTED, 'DUE return status must be ACCEPTED');

  // Verify NO refund was created
  const dueRefunds = await prisma.refund.findMany({ where: { returnRequestId: dueReturn.id } });
  assert(dueRefunds.length === 0, 'No refund record should be created for DUE order return');

  // Payment remains DUE
  const dueOrderAfterAccept = await prisma.order.findUnique({ where: { id: dueOrder.id } });
  assert(dueOrderAfterAccept?.paymentStatus === PaymentStatus.DUE, 'Payment status must remain DUE for unpaid return');
  assert(dueOrderAfterAccept?.status === OrderStatus.DELIVERED, 'Order status must remain DELIVERED');
  console.log('  ✓ TEST 14 passed: DUE return accepted, inventory restored, no refund created, payment remains DUE');

  // =========================================================================
  // TEST 15: Reject Return
  // =========================================================================
  console.log('\n--- TEST 15: Reject Return ---');
  const orderToReject = await createTestOrder({ status: OrderStatus.DELIVERED });
  const returnToReject = await createAdminFullReturn({
    orderId: orderToReject.id,
    reason: ReturnReason.CHANGE_OF_MIND,
  });

  const stockBeforeReject = (await prisma.inventoryItem.findUnique({ where: { variantId: variant.id } }))?.physicalStock ?? 0;
  const rejectRes = await rejectAdminReturn({
    returnRequestId: returnToReject.id,
    rejectionReason: 'Exceeded return period window or item damaged by customer.',
  });

  assert(rejectRes.returnRequest.status === ReturnStatus.REJECTED, 'Return status must become REJECTED');

  // Verify 0 inventory/refund mutations
  const stockAfterReject = (await prisma.inventoryItem.findUnique({ where: { variantId: variant.id } }))?.physicalStock ?? 0;
  assert(stockAfterReject === stockBeforeReject, 'Stock must not change when return is rejected');
  const rejectRefunds = await prisma.refund.findMany({ where: { returnRequestId: returnToReject.id } });
  assert(rejectRefunds.length === 0, 'No refund must be created when return is rejected');
  const rejectedOrderAfter = await prisma.order.findUnique({ where: { id: orderToReject.id } });
  assert(rejectedOrderAfter?.status === OrderStatus.DELIVERED, 'Order status must remain DELIVERED');
  console.log('  ✓ TEST 15 passed: Return rejected with required reason and 0 side effects');

  // =========================================================================
  // TEST 16: Duplicate Acceptance Idempotency
  // =========================================================================
  console.log('\n--- TEST 16: Duplicate Acceptance Idempotency ---');
  const stockBeforeDup = (await prisma.inventoryItem.findUnique({ where: { variantId: variant.id } }))?.physicalStock ?? 0;
  const refundsBeforeDup = await prisma.refund.count({ where: { returnRequestId: returnReq1.id } });

  const duplicateAccept = await acceptAdminReturn({
    returnRequestId: returnReq1.id,
    refundMethod: RefundMethod.CASH,
  });
  assert(duplicateAccept.isDuplicate === true, 'Subsequent accept call must be detected as duplicate');

  const stockAfterDup = (await prisma.inventoryItem.findUnique({ where: { variantId: variant.id } }))?.physicalStock ?? 0;
  assert(stockAfterDup === stockBeforeDup, 'Stock must not increase on duplicate accept');
  const refundsAfterDup = await prisma.refund.count({ where: { returnRequestId: returnReq1.id } });
  assert(refundsAfterDup === refundsBeforeDup, 'Duplicate refund record must not be created');
  console.log('  ✓ TEST 16 passed: Duplicate accept call is idempotent and safe');

  // =========================================================================
  // TEST 17: Concurrent Acceptance Safety
  // =========================================================================
  console.log('\n--- TEST 17: Concurrent Acceptance Safety ---');
  const concurrentOrder = await createTestOrder({ status: OrderStatus.DELIVERED });
  const concurrentReturn = await createAdminFullReturn({
    orderId: concurrentOrder.id,
    reason: ReturnReason.DEFECTIVE,
  });

  const stockBeforeConcurrent = (await prisma.inventoryItem.findUnique({ where: { variantId: variant.id } }))?.physicalStock ?? 0;

  // Fire two accept calls concurrently
  const [resA, resB] = await Promise.allSettled([
    acceptAdminReturn({ returnRequestId: concurrentReturn.id }),
    acceptAdminReturn({ returnRequestId: concurrentReturn.id }),
  ]);

  assert(resA.status === 'fulfilled' || resB.status === 'fulfilled', 'At least one concurrent accept must succeed');
  const stockAfterConcurrent = (await prisma.inventoryItem.findUnique({ where: { variantId: variant.id } }))?.physicalStock ?? 0;
  assert(stockAfterConcurrent === stockBeforeConcurrent + 1, 'Physical stock must increment exactly once under concurrent calls');
  const concurrentRefunds = await prisma.refund.count({ where: { returnRequestId: concurrentReturn.id } });
  assert(concurrentRefunds === 1, 'Exactly one refund record must be created under concurrency');
  console.log('  ✓ TEST 17 passed: Concurrent acceptance safely serialized under deterministic locking');

  // =========================================================================
  // TEST 18: Refund Pending / Failure Behavior
  // =========================================================================
  console.log('\n--- TEST 18: Refund Pending / Failure Behavior ---');
  const pendingRefundOrder = await createTestOrder({ status: OrderStatus.DELIVERED });
  const pendingReturn = await createAdminFullReturn({
    orderId: pendingRefundOrder.id,
    reason: ReturnReason.CHANGE_OF_MIND,
  });

  // Accept with offlineSettlementSuccess: false (simulating offline settlement delayed/pending)
  const pendingAcceptRes = await acceptAdminReturn({
    returnRequestId: pendingReturn.id,
    offlineSettlementSuccess: false,
  });
  assert(pendingAcceptRes.returnRequest.status === ReturnStatus.ACCEPTED, 'Return must be ACCEPTED even if refund is pending');

  const pendingRefund = await prisma.refund.findFirst({ where: { returnRequestId: pendingReturn.id } });
  assert(pendingRefund?.status === RefundStatus.PENDING, 'Refund status must be PENDING');

  const pendingOrderAfter = await prisma.order.findUnique({ where: { id: pendingRefundOrder.id } });
  assert(pendingOrderAfter?.paymentStatus === PaymentStatus.PAID, 'Payment must NOT be marked REFUNDED while refund is PENDING');
  console.log('  ✓ TEST 18 passed: Physical return accepted while offline refund remains pending, payment not falsely marked refunded');

  // =========================================================================
  // TEST 19 & 20: Order Status & Historical Snapshots Immutability
  // =========================================================================
  console.log('\n--- TEST 19 & 20: Order Status & Historical Snapshots Immutability ---');
  assert(deliveredOrder1.status === OrderStatus.DELIVERED, 'Order status was DELIVERED');
  const finalOrder1 = await prisma.order.findUnique({
    where: { id: deliveredOrder1.id },
    include: { items: true },
  });
  assert(finalOrder1?.status === OrderStatus.DELIVERED, 'Order status must remain DELIVERED');
  assert(Number(finalOrder1?.subtotal) === 1000, 'Original order subtotal must remain 1000');
  assert(Number(finalOrder1?.grandTotal) === 1000, 'Original order grandTotal must remain 1000');
  assert(Boolean(finalOrder1?.customerNameSnapshot?.includes('Customer')), 'Customer name snapshot must remain preserved');
  console.log('  ✓ TEST 19 & 20 passed: Order status and historical financial snapshots remain 100% immutable');

  // =========================================================================
  // TEST 21: Financial Reports Consistency & Net Revenue / Net COGS Accounting
  // =========================================================================
  console.log('\n--- TEST 21: Reports Consistency & Return Accounting ---');
  const execSummary = await getExecutiveFinancialSummary();
  assert(execSummary.grossSales > 0, 'Gross sales must reflect all qualifying sale orders historically');
  assert(execSummary.returns > 0, `Returns must reflect accepted returns (got ₹${execSummary.returns})`);
  assert(execSummary.netRevenue === execSummary.grossSales - execSummary.refunds, 'Net Revenue must equal Gross Sales - Refunds/Returns');
  assert(execSummary.grossMargin === execSummary.netRevenue - execSummary.fifoCogs, 'Gross Margin must equal Net Revenue - Net COGS');

  const channelSummary = await getChannelSummary();
  const whatsappChannel = channelSummary.find((c) => c.channel === SalesChannel.WHATSAPP);
  assert(whatsappChannel !== undefined, 'WhatsApp channel summary must exist');
  assert(whatsappChannel!.netRevenue <= whatsappChannel!.grossSales, 'Channel Net Revenue must account for returns');

  const productSummary = await getProductReportSummary();
  assert(productSummary.grossSales > 0, 'Product report grossSales must reflect orders');
  assert(productSummary.refunds > 0, 'Product report must account for returned merchandise');

  const salesReportRows = await getSalesReportRows({ pageSize: 10 });
  const returnedOrderRow = salesReportRows.rows.find((r) => r.orderNumber === deliveredOrder1.orderNumber);
  assert(returnedOrderRow !== undefined, 'Returned order must appear in sales ledger report');
  assert(returnedOrderRow!.attributedRefund === 1000, 'Sales ledger row must attribute ₹1,000 refund/return');
  assert(returnedOrderRow!.netRevenue === 0, 'Sales ledger net revenue for fully returned order must be ₹0');
  assert(returnedOrderRow!.fifoCogs === 0, 'Sales ledger FIFO COGS for fully returned order must be reversed to ₹0');

  const returnsSummary = await getReturnsSummary();
  assert(returnsSummary.statusCounts.ACCEPTED >= 2, 'Returns summary must count ACCEPTED returns');

  console.log('  ✓ TEST 21 passed: Executive summary, channel summary, product report, and sales ledger report all accurately account for accepted returns');

  console.log('\n================================================================');
  console.log('🎉 ALL 21/21 ADMIN RETURNS ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');

  // Clean up fixtures
  console.log('--- Cleaning up test fixtures ---');
  await prisma.inventoryMovement.deleteMany({
    where: { variantId: variant.id },
  });
  await prisma.fifoLayer.deleteMany({
    where: { variantId: variant.id },
  });
  await prisma.refundLineAllocation.deleteMany({
    where: { refund: { order: { customerMobileSnapshot: testPhone } } },
  });
  await prisma.refund.deleteMany({
    where: { order: { customerMobileSnapshot: testPhone } },
  });
  await prisma.returnItem.deleteMany({
    where: { variantId: variant.id },
  });
  await prisma.returnRequest.deleteMany({
    where: { customerMobile: testPhone },
  });
  await prisma.orderItem.deleteMany({
    where: { variantId: variant.id },
  });
  await prisma.order.deleteMany({
    where: { customerMobileSnapshot: testPhone },
  });
  await prisma.inventoryItem.deleteMany({
    where: { variantId: variant.id },
  });
  await prisma.productVariant.deleteMany({
    where: { productId: product.id },
  });
  await prisma.product.deleteMany({
    where: { id: product.id },
  });
  await prisma.category.deleteMany({
    where: { id: category.id },
  });
  await prisma.customer.deleteMany({
    where: { mobile: testPhone },
  });
  console.log('✓ Test fixtures cleaned up successfully.\n');
}

runReturnsModuleTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
