import { prisma } from '../lib/db/prisma';
import { receiveStock, consumeFifoStock } from '../lib/inventory/fifo-engine';
import {
  createReturnRequest,
  approveReturnRequest,
  recordPhysicalReceipt,
  processIncrementalInspection,
} from '../lib/returns/return-engine';
import {
  createRefundIntent,
  finalizeRefund,
} from '../lib/returns/refund-engine';
import { ReturnReason, RefundStatus, ReturnStatus, PaymentStatus } from '@prisma/client';

async function runAcceptanceTest10() {
  console.log('================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 10 — FAILED REFUND → REPLACEMENT');
  console.log('================================================================\n');

  const timestamp = Date.now();

  // 1. SETUP CATALOG & DELIVERED PAID TEST ORDER
  console.log('--- Step 1: Create Fresh Catalog & Delivered Paid Test Order ---');
  const category = await prisma.category.create({
    data: { name: `Acc10 Cat ${timestamp}`, slug: `acc10-cat-${timestamp}` },
  });

  const product = await prisma.product.create({
    data: { name: `Oxford Shirt Acc10 ${timestamp}`, slug: `oxford-shirt-acc10-${timestamp}`, categoryId: category.id, status: 'ACTIVE' },
  });

  const variant = await prisma.productVariant.create({
    data: { productId: product.id, title: 'Oxford Shirt / XL', sku: `OXF10-${timestamp}`, mrp: 2000, sellingPrice: 1500, costPrice: 700 },
  });

  await receiveStock({ variantId: variant.id, quantity: 10, unitCost: 700, idempotencyKey: `rec10-${timestamp}` });

  const orderNumber = `ORD-ACC10-${timestamp}`;
  const customerMobile = '+919876543210';
  const guestAccessToken = `token-acc10-${timestamp}`;

  const testOrder = await prisma.order.create({
    data: {
      orderNumber,
      salesChannel: 'ONLINE',
      status: 'DELIVERED',
      deliveredAt: new Date(),
      customerNameSnapshot: 'Test Acceptance 10 Customer',
      customerMobileSnapshot: customerMobile,
      guestAccessToken,
      guestAccessTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      subtotal: 1500,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 0,
      grandTotal: 1500,
      paymentStatus: 'PAID',
      items: {
        create: [
          {
            variantId: variant.id,
            productNameSnapshot: product.name,
            variantTitleSnapshot: variant.title,
            skuSnapshot: variant.sku,
            quantity: 1,
            unitPrice: 1500,
            mrp: 2000,
            lineTotal: 1500,
          },
        ],
      },
    },
    include: { items: true },
  });

  await consumeFifoStock({
    variantId: variant.id,
    quantity: 1,
    referenceId: testOrder.id,
    type: 'SALE_OUT',
    idempotencyKey: `ord10-sale-${testOrder.id}`,
  });

  console.log('  Order Created:', testOrder.orderNumber, `GrandTotal: ₹${Number(testOrder.grandTotal)}`);

  // 2. RETURN LIFECYCLE
  console.log('\n--- Step 2: Progress Return Lifecycle (Requested -> Approved -> Received -> Restocked) ---');
  const retRes = await createReturnRequest({
    orderId: testOrder.id,
    reason: ReturnReason.DEFECTIVE,
    reasonDetails: 'Test failed refund replacement',
    items: [{ orderItemId: testOrder.items[0].id, quantityRequested: 1 }],
    submissionIdempotencyKey: `sub-acc10-${timestamp}`,
    guestAccessToken,
    customerMobile,
  });

  const returnReq = retRes.returnRequest;
  await approveReturnRequest(returnReq.id, 'Approved for refund replacement test');
  await recordPhysicalReceipt({
    returnRequestId: returnReq.id,
    idempotencyKey: `rcpt-acc10-${timestamp}`,
    items: [{ returnItemId: returnReq.items[0].id, quantityReceived: 1 }],
  });

  await processIncrementalInspection({
    returnRequestId: returnReq.id,
    idempotencyKey: `ins-acc10-${timestamp}`,
    items: [{ returnItemId: returnReq.items[0].id, quantityRestocked: 1, quantityDamaged: 0 }],
  });

  console.log('  Return lifecycle completed through restock successfully.');

  // 3. DOCUMENT SEQUENCE BEFORE ORIGINAL REFUND CREATION
  console.log('\n--- Step 3: DocumentSequence Before Original Refund Creation ---');
  const seqBefore = await prisma.documentSequence.findUnique({ where: { code: 'REFUND' } });
  const seqValBefore = seqBefore ? seqBefore.nextValue : 1001;
  console.log('  DocumentSequence REFUND nextValue before creation:', seqValBefore);

  // 4. CREATE ORIGINAL REFUND INTENT
  console.log('\n--- Step 4: Create Original Refund Intent ---');
  const origIntent = await createRefundIntent({
    orderId: testOrder.id,
    returnRequestId: returnReq.id,
    amount: 1500,
    idempotencyKey: `ref-acc10-orig-${timestamp}`,
    allocations: [
      {
        orderItemId: testOrder.items[0].id,
        returnItemId: returnReq.items[0].id,
        merchandiseRefund: 1500,
      },
    ],
  });

  const origRefund = origIntent.refund;
  console.log('  Original Refund Created:');
  console.log('    ID:', origRefund.id);
  console.log('    Refund Number:', origRefund.refundNumber);
  console.log('    Amount: ₹', Number(origRefund.amount));
  console.log('    Status:', origRefund.status);

  const seqAfterOrig = await prisma.documentSequence.findUnique({ where: { code: 'REFUND' } });
  const seqValAfterOrig = seqAfterOrig?.nextValue || 0;
  console.log('  DocumentSequence REFUND nextValue after original creation:', seqValAfterOrig);

  if (seqValAfterOrig !== seqValBefore + 1) {
    throw new Error('DocumentSequence REFUND was not incremented upon original refund creation!');
  }

  // 5. SIMULATE INITIAL GATEWAY FAILURE
  console.log('\n--- Step 5: Simulate Gateway Failure on Original Refund ---');
  const failedOrigRefund = await prisma.refund.update({
    where: { id: origRefund.id },
    data: {
      status: RefundStatus.FAILED,
      failureReason: 'SIMULATED_ORIGINAL_GATEWAY_FAILURE',
    },
    include: { replacedByRefund: true },
  });

  console.log('  Original Refund Status After Failure:', failedOrigRefund.status);
  console.log('  failureReason:', failedOrigRefund.failureReason);
  console.log('  replacedByRefund:', failedOrigRefund.replacedByRefund);
  console.log('  resolvedByAdminId:', failedOrigRefund.resolvedByAdminId ?? null);

  if (failedOrigRefund.status !== RefundStatus.FAILED) throw new Error('Original refund status is not FAILED!');
  if (failedOrigRefund.replacedByRefund !== null && failedOrigRefund.replacedByRefund !== undefined) {
    throw new Error('Original failed refund should not have replacedByRefund set yet!');
  }

  // 6. INITIATE REPLACEMENT REFUND WORKFLOW
  console.log('\n--- Step 6: Initiate Replacement Refund Workflow ---');
  const replIntent = await createRefundIntent({
    orderId: testOrder.id,
    returnRequestId: returnReq.id,
    amount: 1500,
    idempotencyKey: `ref-acc10-repl-${timestamp}`,
    replacesRefundId: origRefund.id, // Explicit replacement link
    allocations: [
      {
        orderItemId: testOrder.items[0].id,
        returnItemId: returnReq.items[0].id,
        merchandiseRefund: 1500,
      },
    ],
  });

  const replRefund = replIntent.refund;
  console.log('  Replacement Refund Created:');
  console.log('    ID:', replRefund.id);
  console.log('    Refund Number:', replRefund.refundNumber);
  console.log('    replacesRefundId:', replRefund.replacesRefundId);
  console.log('    Amount: ₹', Number(replRefund.amount));
  console.log('    Status:', replRefund.status);

  const seqAfterRepl = await prisma.documentSequence.findUnique({ where: { code: 'REFUND' } });
  const seqValAfterRepl = seqAfterRepl?.nextValue || 0;
  console.log('  DocumentSequence REFUND nextValue after replacement creation:', seqValAfterRepl);

  // Assert Replacement Rules
  if (replRefund.id === origRefund.id) throw new Error('Replacement refund must be a NEW Refund record with a distinct ID!');
  if (replRefund.refundNumber === origRefund.refundNumber) throw new Error('Replacement refund must receive a NEW refund number!');
  if (replRefund.replacesRefundId !== origRefund.id) throw new Error('Replacement refund replacesRefundId mismatch!');
  if (seqValAfterRepl !== seqValAfterOrig + 1) {
    throw new Error(`Replacement creation should consume exactly 1 additional DocumentSequence value. Expected ${seqValAfterOrig + 1}, got ${seqValAfterRepl}`);
  }

  // Verify relationship from original refund side
  const reloadedOrigAfterRepl = await prisma.refund.findUnique({
    where: { id: origRefund.id },
    include: { replacedByRefund: true },
  });

  console.log('  Original Refund status after replacement creation:', reloadedOrigAfterRepl?.status);
  console.log('  Original Refund replacedByRefund ID:', reloadedOrigAfterRepl?.replacedByRefund?.id);

  if (reloadedOrigAfterRepl?.status !== RefundStatus.FAILED) throw new Error('Original refund should remain in FAILED status!');
  if (reloadedOrigAfterRepl?.replacedByRefund?.id !== replRefund.id) {
    throw new Error('Original refund replacedByRefund does not point to replacement refund!');
  }

  // 7. SIMULATE SUCCESSFUL GATEWAY RESPONSE FOR REPLACEMENT REFUND
  console.log('\n--- Step 7: Finalize Replacement Refund with Gateway Success ---');
  const completedReplRefund = await finalizeRefund(replRefund.id, `rfnd_repl_gateway_succ_${timestamp}`);

  console.log('  Replacement Refund Final Status:', completedReplRefund.status);
  console.log('  Replacement Provider Refund ID:', completedReplRefund.providerRefundId);

  const seqAfterFinalize = await prisma.documentSequence.findUnique({ where: { code: 'REFUND' } });
  console.log('  DocumentSequence REFUND nextValue after finalization:', seqAfterFinalize?.nextValue);

  if (seqAfterFinalize?.nextValue !== seqValAfterRepl) {
    throw new Error('Finalization should not consume additional DocumentSequence!');
  }

  // 8. VERIFY NO DOUBLE-COUNTING & CAPACITY INVARIANTS
  console.log('\n--- Step 8: Verify Financial Capacity & No Double-Counting ---');
  const allRefunds = await prisma.refund.findMany({
    where: { orderId: testOrder.id },
    include: { replacedByRefund: true },
  });

  console.log('  Total Refund Records for Order in DB:', allRefunds.length);
  const completedRefunds = allRefunds.filter((r) => r.status === RefundStatus.COMPLETED);
  console.log('  Total COMPLETED Refund Records:', completedRefunds.length);
  const completedAmountSum = completedRefunds.reduce((sum, r) => sum + Number(r.amount), 0);
  console.log('  Total Completed Refunded Amount Sum: ₹', completedAmountSum);

  if (allRefunds.length !== 2) throw new Error(`Expected total 2 refund records (1 FAILED, 1 COMPLETED), found ${allRefunds.length}`);
  if (completedRefunds.length !== 1) throw new Error(`Expected exactly 1 COMPLETED refund record, found ${completedRefunds.length}`);
  if (completedAmountSum !== 1500) throw new Error(`Expected completed refund sum = ₹1500, got ₹${completedAmountSum}`);

  // 9. VERIFY ORDER PAYMENT STATUS & RETURN RESOLUTION
  console.log('\n--- Step 9: Verify Order Payment Status & Return Resolution ---');
  const updatedOrder = await prisma.order.findUnique({ where: { id: testOrder.id } });
  const updatedReturn = await prisma.returnRequest.findUnique({ where: { id: returnReq.id } });

  console.log('  Order Payment Status:', updatedOrder?.paymentStatus);
  console.log('  Return Request Status:', updatedReturn?.status);

  if (updatedOrder?.paymentStatus !== PaymentStatus.REFUNDED) {
    throw new Error(`Expected Order.paymentStatus = REFUNDED, got ${updatedOrder?.paymentStatus}`);
  }
  if (updatedReturn?.status !== ReturnStatus.RESOLVED) {
    throw new Error(`Expected ReturnRequest.status = RESOLVED, got ${updatedReturn?.status}`);
  }

  // 10. RELOAD & PERSISTENCE VERIFICATION
  console.log('\n--- Step 10: Reload Database Records & Verify Persistence ---');
  const reloadedOrigFinal = await prisma.refund.findUnique({
    where: { id: origRefund.id },
    include: { replacedByRefund: true },
  });
  const reloadedReplFinal = await prisma.refund.findUnique({
    where: { id: replRefund.id },
    include: { replacesRefund: true },
  });

  console.log('  Persisted Original Status:', reloadedOrigFinal?.status);
  console.log('  Persisted Replacement Status:', reloadedReplFinal?.status);
  console.log('  Persisted Original replacedByRefund.id:', reloadedOrigFinal?.replacedByRefund?.id);
  console.log('  Persisted Replacement replacesRefund.id:', reloadedReplFinal?.replacesRefund?.id);

  if (reloadedOrigFinal?.status !== RefundStatus.FAILED || reloadedReplFinal?.status !== RefundStatus.COMPLETED) {
    throw new Error('Refund statuses failed to persist upon reload!');
  }
  if (reloadedOrigFinal?.replacedByRefund?.id !== replRefund.id || reloadedReplFinal?.replacesRefund?.id !== origRefund.id) {
    throw new Error('Replacement relationship failed to persist upon reload!');
  }

  console.log('\n================================================================');
  console.log('TEST 10 — Failed Refund → Replacement Report');
  console.log('================================================================');
  console.log('Fresh test data: PASS');
  console.log('Return lifecycle: PASS');
  console.log('Original refund creation: PASS');
  console.log('Initial gateway failure: PASS');
  console.log('Original refund FAILED: PASS');
  console.log('Replacement eligibility: PASS');
  console.log('New Refund record created: PASS');
  console.log('New refund number: PASS');
  console.log('replacedByRefund relationship: PASS');
  console.log('Original remains FAILED: PASS');
  console.log('Replacement refund amount: PASS');
  console.log('DocumentSequence: PASS');
  console.log('Refund capacity: PASS');
  console.log('Successful replacement finalization: PASS');
  console.log('No double-counting: PASS');
  console.log('Order payment status: PASS');
  console.log('Resolution state: PASS');
  console.log('Persistence after reload: PASS');
  console.log('Unexpected issues: None');
  console.log('================================================================\n');
}

runAcceptanceTest10().catch((err) => {
  console.error('FATAL ACCEPTANCE TEST 10 FAILURE:', err);
  process.exit(1);
});
