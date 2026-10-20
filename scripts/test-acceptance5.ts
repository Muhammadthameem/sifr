import { prisma } from '../lib/db/prisma';
import { createRefundIntent, dispatchGatewayRefund } from '../lib/returns/refund-engine';
import { RefundStatus, PaymentStatus, ReturnStatus } from '@prisma/client';

async function runAcceptanceTest5() {
  console.log('================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 5 — FULL REFUND');
  console.log('================================================================\n');

  const returnNumber = 'RET-20260924-1022';

  // 1. LOCATE RETURN REQUEST & VERIFY TEST 4 STATE
  console.log('--- Step 1: Locate Return Request & Verify Post-Restocking State ---');
  let returnReq = await prisma.returnRequest.findUnique({
    where: { returnNumber },
    include: {
      order: { include: { items: true, payments: true } },
      items: { include: { variant: true } },
      refunds: { include: { allocations: true } },
      exchanges: true,
    },
  });

  if (!returnReq) {
    throw new Error(`Return Request '${returnNumber}' not found in database.`);
  }

  console.log('  Return Request Located:', returnReq.returnNumber);
  console.log('  Current Status:', returnReq.status);
  console.log('  Order Number:', returnReq.order.orderNumber);
  console.log('  Order Grand Total:', Number(returnReq.order.grandTotal));
  console.log('  Initial Order Payment Status:', returnReq.order.paymentStatus);
  console.log('  Initial Refunds Count:', returnReq.refunds.length);

  const returnItem = returnReq.items[0];
  console.log('  Line Item SKU:', returnItem.variant.sku);
  console.log('  quantityRequested:', returnItem.quantityRequested);
  console.log('  quantityReceived:', returnItem.quantityReceived);
  console.log('  quantityRestocked:', returnItem.quantityRestocked);
  console.log('  quantityDamaged:', returnItem.quantityDamaged);

  if (returnItem.quantityRequested !== 2 || returnItem.quantityReceived !== 2 || returnItem.quantityRestocked !== 2 || returnItem.quantityDamaged !== 0) {
    throw new Error('Return request state does not match post-restocking criteria from Test 4!');
  }

  // Get initial physical inventory stock to verify zero stock change during refund
  const initialInventory = await prisma.inventoryItem.findUnique({
    where: { variantId: returnItem.variantId },
  });
  console.log('  Physical Stock Before Refund:', initialInventory?.physicalStock);
  console.log('  Reserved Stock Before Refund:', initialInventory?.reservedStock);

  // Get initial movement count for this return
  const initialMovements = await prisma.inventoryMovement.findMany({
    where: { referenceId: returnReq.id },
  });
  console.log('  Initial Inventory Movements Count for Return:', initialMovements.length);

  // 2. FINANCIAL CALCULATIONS AUDIT
  console.log('\n--- Step 2: Financial Calculation & Allocation Audit ---');
  const merchandiseValue = Number(returnItem.netRefundAmount);
  const taxRefundVal = Number(returnReq.taxRefund);
  const shippingRefundVal = 0; // Standard customer return (isMerchantError = false)
  const totalRefundVal = Number(returnReq.totalRefundAmount);
  const orderGrandTotal = Number(returnReq.order.grandTotal);

  console.log(`  Order Grand Total: ₹${orderGrandTotal.toFixed(2)}`);
  console.log(`  Returned Merchandise Value: ₹${merchandiseValue.toFixed(2)}`);
  console.log(`  Applicable Tax Refund: ₹${taxRefundVal.toFixed(2)}`);
  console.log(`  Applicable Shipping Refund: ₹${shippingRefundVal.toFixed(2)}`);
  console.log(`  Total Refund Amount: ₹${totalRefundVal.toFixed(2)}`);
  console.log(`  Difference Explanation: Returned 2 of 3 units (₹2,000). Standard customer return (shipping ₹100 non-refundable). Remaining 1 unit (₹1,000) + shipping (₹100) = ₹1,100 unrefunded.`);

  if (Math.abs(merchandiseValue - 2000) > 0.01 || Math.abs(totalRefundVal - 2000) > 0.01) {
    throw new Error(`Refund amount calculation error: expected ₹2,000, got ₹${totalRefundVal}`);
  }

  // 3. PHASE 1 — CREATE REFUND INTENT
  console.log('\n--- Step 3: Phase 1 — Create Refund Intent ---');
  const refundIdemKey = `ref-intent-acc5-${returnReq.id}-${Date.now()}`;

  const intentResult = await createRefundIntent({
    orderId: returnReq.orderId,
    returnRequestId: returnReq.id,
    amount: totalRefundVal,
    shippingRefund: shippingRefundVal,
    idempotencyKey: refundIdemKey,
    allocations: [
      {
        orderItemId: returnItem.orderItemId,
        returnItemId: returnItem.id,
        merchandiseRefund: merchandiseValue,
        taxRefund: taxRefundVal,
      },
    ],
  });

  const refundIntent = intentResult.refund;

  console.log('  Refund Intent Created Successfully!');
  console.log('  Refund ID:', refundIntent.id);
  console.log('  Refund Number:', refundIntent.refundNumber);
  console.log('  Refund Method:', refundIntent.method);
  console.log('  Refund Purpose:', refundIntent.purpose);
  console.log('  Refund Status (Phase 1):', refundIntent.status);
  console.log('  Refund Amount:', Number(refundIntent.amount));
  console.log('  Allocations Count:', refundIntent.allocations.length);

  // Assert Phase 1 Intent Invariants
  if (refundIntent.status !== RefundStatus.PENDING) {
    throw new Error(`Expected Phase 1 status PENDING, got ${refundIntent.status}`);
  }
  if (!refundIntent.refundNumber.startsWith('REF-')) {
    throw new Error(`Invalid refund number sequence format: ${refundIntent.refundNumber}`);
  }
  if (refundIntent.allocations.length !== 1) {
    throw new Error(`Expected 1 line allocation, got ${refundIntent.allocations.length}`);
  }

  const alloc = refundIntent.allocations[0];
  console.log('  Allocation OrderItem ID:', alloc.orderItemId);
  console.log('  Allocation Merchandise Refund:', Number(alloc.merchandiseRefund));
  console.log('  Allocation Tax Refund:', Number(alloc.taxRefund));

  if (alloc.orderItemId !== returnItem.orderItemId || Number(alloc.merchandiseRefund) !== merchandiseValue) {
    throw new Error('RefundLineAllocation fields do not match returned item data!');
  }

  // Verify Duplicate Replay Protection
  console.log('\n--- Step 4: Verify Idempotent Duplicate Replay Protection ---');
  const replayedIntent = await createRefundIntent({
    orderId: returnReq.orderId,
    returnRequestId: returnReq.id,
    amount: totalRefundVal,
    shippingRefund: shippingRefundVal,
    idempotencyKey: refundIdemKey,
    allocations: [
      {
        orderItemId: returnItem.orderItemId,
        returnItemId: returnItem.id,
        merchandiseRefund: merchandiseValue,
        taxRefund: taxRefundVal,
      },
    ],
  });

  console.log('  Idempotent Duplicate Replay Returned Existing:', replayedIntent.isDuplicate === true);
  console.log('  Returned Same Refund Number:', replayedIntent.refund.refundNumber === refundIntent.refundNumber);

  if (!replayedIntent.isDuplicate || replayedIntent.refund.id !== refundIntent.id) {
    throw new Error('Duplicate refund intent protection failed!');
  }

  // 4. PHASE 2 & 3 — GATEWAY DISPATCH & FINALIZATION
  console.log('\n--- Step 5: Phase 2 & 3 — Gateway Dispatch & Finalization ---');
  const finalizedRefund = await dispatchGatewayRefund(refundIntent.id);

  console.log('  Gateway Refund Finalized Successfully!');
  console.log('  Final Refund Status:', finalizedRefund.status);
  console.log('  Provider Refund ID:', finalizedRefund.providerRefundId);

  if (finalizedRefund.status !== RefundStatus.COMPLETED) {
    throw new Error(`Expected final status COMPLETED, got ${finalizedRefund.status}`);
  }

  // 5. VERIFY POST-REFUND DATABASE INVARIANTS & PAYMENT STATUS TRANSITION
  console.log('\n--- Step 6: Post-Refund Database Invariants & State Transition Verification ---');
  const postOrder = await prisma.order.findUnique({
    where: { id: returnReq.orderId },
    include: { returnRequests: true },
  });

  const postReturnReq = await prisma.returnRequest.findUnique({
    where: { id: returnReq.id },
  });

  console.log('  Order Payment Status Transited to PARTIALLY_REFUNDED:', postOrder?.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED);
  console.log('  Order Main Status Preserved (DELIVERED):', postOrder?.status === 'DELIVERED');
  console.log('  Return Request Terminal Status (RESOLVED):', postReturnReq?.status === ReturnStatus.RESOLVED);

  if (postOrder?.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED) {
    throw new Error(`Expected Order.paymentStatus PARTIALLY_REFUNDED, got ${postOrder?.paymentStatus}`);
  }
  if (postOrder?.status !== 'DELIVERED') {
    throw new Error(`Order status altered during refund finalization: ${postOrder?.status}`);
  }
  if (postReturnReq?.status !== ReturnStatus.RESOLVED) {
    throw new Error(`Expected ReturnRequest.status RESOLVED, got ${postReturnReq?.status}`);
  }

  // 6. VERIFY INVENTORY STOCK UNCHANGED DURING REFUND FINALIZATION
  console.log('\n--- Step 7: Verify Inventory Unchanged During Refund Finalization ---');
  const postInventory = await prisma.inventoryItem.findUnique({
    where: { variantId: returnItem.variantId },
  });

  const postMovements = await prisma.inventoryMovement.findMany({
    where: { referenceId: returnReq.id },
  });

  console.log('  Physical Stock Before Refund:', initialInventory?.physicalStock);
  console.log('  Physical Stock After Refund:', postInventory?.physicalStock);
  console.log('  Physical Stock Unchanged:', postInventory?.physicalStock === initialInventory?.physicalStock);
  console.log('  Reserved Stock Unchanged:', postInventory?.reservedStock === initialInventory?.reservedStock);
  console.log('  Zero Additional Inventory Movements Created:', postMovements.length === initialMovements.length);

  if (postInventory?.physicalStock !== initialInventory?.physicalStock || postInventory?.reservedStock !== initialInventory?.reservedStock) {
    throw new Error('Inventory stock was incorrectly altered during refund finalization!');
  }
  if (postMovements.length !== initialMovements.length) {
    throw new Error('Additional inventory movement was created during refund finalization!');
  }

  // 7. VERIFY PERSISTENCE UPON RELOAD
  console.log('\n--- Step 8: Persistence Check Upon Reload ---');
  const reloadedRefund = await prisma.refund.findUnique({
    where: { id: refundIntent.id },
  });
  const reloadedOrder = await prisma.order.findUnique({
    where: { id: returnReq.orderId },
  });

  console.log('  Persisted Refund Status After Reload:', reloadedRefund?.status);
  console.log('  Persisted Order Payment Status After Reload:', reloadedOrder?.paymentStatus);

  if (reloadedRefund?.status !== RefundStatus.COMPLETED || reloadedOrder?.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED) {
    throw new Error('Refund or order state failed to persist upon reload!');
  }

  console.log('\n================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 5 PASSED ALL VERIFICATION CHECKS!');
  console.log('================================================================');
}

runAcceptanceTest5().catch((err) => {
  console.error('FATAL ACCEPTANCE TEST 5 FAILURE:', err);
  process.exit(1);
});
