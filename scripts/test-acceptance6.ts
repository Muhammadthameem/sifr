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
  dispatchGatewayRefund,
} from '../lib/returns/refund-engine';
import { ReturnStatus, ReturnReason, RefundStatus, PaymentStatus } from '@prisma/client';

async function runAcceptanceTest6() {
  console.log('================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 6 — PARTIAL REFUND & DAMAGED DISPOSITION');
  console.log('================================================================\n');

  const timestamp = Date.now();

  // 1. SETUP ISOLATED CATALOG & ORDER DATA
  console.log('--- Step 1: Create Isolated Test Order with 3 Units ---');
  const category = await prisma.category.create({
    data: { name: `Acc6 Cat ${timestamp}`, slug: `acc6-cat-${timestamp}` },
  });
  const product = await prisma.product.create({
    data: { name: `Acc6 Polo ${timestamp}`, slug: `acc6-polo-${timestamp}`, categoryId: category.id, status: 'ACTIVE' },
  });
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, title: 'Navy / M', sku: `ACC6-NVY-M-${timestamp}`, mrp: 1500, sellingPrice: 1000, costPrice: 500 },
  });

  // Receive 20 units stock @ 500
  await receiveStock({
    variantId: variant.id,
    quantity: 20,
    unitCost: 500,
    idempotencyKey: `rec-acc6-${timestamp}`,
  });

  // Create DELIVERED test order with 3 units
  const orderNumber = `ORD-ACC6-${timestamp}`;
  const customerMobile = '+919876543210';
  const guestAccessToken = `token-acc6-${timestamp}`;

  const testOrder = await prisma.order.create({
    data: {
      orderNumber,
      salesChannel: 'ONLINE',
      status: 'DELIVERED',
      deliveredAt: new Date(),
      customerNameSnapshot: 'Test Acceptance 6 Customer',
      customerMobileSnapshot: customerMobile,
      guestAccessToken,
      guestAccessTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      subtotal: 3000,
      discountTotal: 0,
      shippingFee: 100,
      taxTotal: 150, // ₹50 tax per unit
      grandTotal: 3250,
      paymentStatus: 'PAID',
      items: {
        create: [
          {
            variantId: variant.id,
            productNameSnapshot: product.name,
            variantTitleSnapshot: variant.title,
            skuSnapshot: variant.sku,
            quantity: 3,
            unitPrice: 1000,
            mrp: 1500,
            lineTotal: 3000,
          },
        ],
      },
    },
    include: { items: true },
  });

  // Consume stock for order (3 units @ 500)
  await consumeFifoStock({
    variantId: variant.id,
    quantity: 3,
    referenceId: testOrder.id,
    type: 'SALE_OUT',
    idempotencyKey: `ord-sale-${testOrder.id}`,
  });

  const initialInventory = await prisma.inventoryItem.findUnique({
    where: { variantId: variant.id },
  });

  console.log('  Fresh Order Created:', testOrder.orderNumber);
  console.log('  Order Grand Total:', Number(testOrder.grandTotal));
  console.log('  Purchased Line Items Quantity:', testOrder.items[0].quantity);
  console.log('  Physical Stock After Order Sale:', initialInventory?.physicalStock);
  console.log('  Reserved Stock After Order Sale:', initialInventory?.reservedStock);

  if (initialInventory?.physicalStock !== 17) {
    throw new Error(`Expected physical stock 17 after order sale, found ${initialInventory?.physicalStock}`);
  }

  // 2. SUBMIT RETURN REQUEST FOR ALL 3 UNITS
  console.log('\n--- Step 2: Submit Return Request for 3 Units ---');
  const retSubRes = await createReturnRequest({
    orderId: testOrder.id,
    reason: ReturnReason.DEFECTIVE,
    reasonDetails: 'Fabric defective on arrival',
    items: [{ orderItemId: testOrder.items[0].id, quantityRequested: 3 }],
    submissionIdempotencyKey: `ret-sub-acc6-${timestamp}`,
    guestAccessToken,
    customerMobile,
  });

  const returnReq = retSubRes.returnRequest;

  console.log('  Return Request Created:', returnReq.returnNumber);
  console.log('  Return Status:', returnReq.status);
  console.log('  Subtotal Refund:', Number(returnReq.subtotalRefund));
  console.log('  Tax Refund:', Number(returnReq.taxRefund));
  console.log('  Total Refund Amount:', Number(returnReq.totalRefundAmount));

  // 3. ADMIN APPROVES RETURN
  console.log('\n--- Step 3: Admin Approves Return ---');
  const approvedReq = await approveReturnRequest(returnReq.id, 'Approved for physical arrival');
  console.log('  Approved Status:', approvedReq.status);

  // 4. RECORD PHYSICAL RECEIPT OF ALL 3 UNITS
  console.log('\n--- Step 4: Record Physical Receipt of All 3 Units ---');
  await recordPhysicalReceipt({
    returnRequestId: returnReq.id,
    idempotencyKey: `rcpt-acc6-${timestamp}`,
    items: [{ returnItemId: returnReq.items[0].id, quantityReceived: 3 }],
  });

  const postReceiptReq = await prisma.returnRequest.findUnique({
    where: { id: returnReq.id },
    include: { items: true },
  });

  console.log('  Post-Receipt Status:', postReceiptReq?.status);
  console.log('  quantityRequested:', postReceiptReq?.items[0].quantityRequested);
  console.log('  quantityReceived:', postReceiptReq?.items[0].quantityReceived);

  if (postReceiptReq?.items[0].quantityReceived !== 3) {
    throw new Error(`Expected quantityReceived = 3, got ${postReceiptReq?.items[0].quantityReceived}`);
  }

  // 5. INSPECTION & DISPOSITION: 2 RESTOCKED, 1 DAMAGED
  console.log('\n--- Step 5: Inspection Disposition (2 Restocked, 1 Damaged) ---');
  await processIncrementalInspection({
    returnRequestId: returnReq.id,
    idempotencyKey: `ins-acc6-${timestamp}`,
    receivedBy: 'Senior Inspector QA',
    notes: '2 units in pristine resalable condition. 1 unit has permanent tear (damaged).',
    items: [
      {
        returnItemId: returnReq.items[0].id,
        quantityRestocked: 2,
        quantityDamaged: 1,
      },
    ],
  });

  const postInspectReq = await prisma.returnRequest.findUnique({
    where: { id: returnReq.id },
    include: { items: true },
  });

  const itemAfterInspect = postInspectReq!.items[0];

  console.log('  Post-Inspection Status:', postInspectReq?.status);
  console.log('  quantityReceived:', itemAfterInspect.quantityReceived);
  console.log('  quantityRestocked:', itemAfterInspect.quantityRestocked);
  console.log('  quantityDamaged:', itemAfterInspect.quantityDamaged);

  // Verify Invariant: quantityReceived == quantityRestocked + quantityDamaged (3 == 2 + 1)
  const invariantSatisfied = itemAfterInspect.quantityReceived === (itemAfterInspect.quantityRestocked + itemAfterInspect.quantityDamaged);
  console.log('  Invariant (3 = 2 + 1) Satisfied:', invariantSatisfied);

  if (!invariantSatisfied) {
    throw new Error('Quantity invariant 3 = 2 + 1 violated!');
  }
  if (itemAfterInspect.quantityRestocked !== 2 || itemAfterInspect.quantityDamaged !== 1) {
    throw new Error(`Expected restocked 2, damaged 1; got restocked ${itemAfterInspect.quantityRestocked}, damaged ${itemAfterInspect.quantityDamaged}`);
  }

  // 6. INVENTORY & FIFO RESTORATION VERIFICATION
  console.log('\n--- Step 6: Physical Inventory & FIFO Restoration Audit ---');
  const postInspectInventory = await prisma.inventoryItem.findUnique({
    where: { variantId: variant.id },
  });

  const physicalStockAfter = postInspectInventory?.physicalStock || 0;
  const reservedStockAfter = postInspectInventory?.reservedStock || 0;
  const stockIncrement = physicalStockAfter - (initialInventory?.physicalStock || 0);

  console.log('  Physical Stock Before Inspection:', initialInventory?.physicalStock);
  console.log('  Physical Stock After Inspection:', physicalStockAfter);
  console.log('  Stock Increased By Exactly 2 (Not 3):', stockIncrement === 2);
  console.log('  Damaged Unit Excluded From Resalable Stock:', stockIncrement !== 3);
  console.log('  Reserved Stock Unchanged:', reservedStockAfter === (initialInventory?.reservedStock || 0));

  if (stockIncrement !== 2) {
    throw new Error(`Expected physical stock to increase by exactly 2, but increased by ${stockIncrement}`);
  }

  // Verify FIFO layer restoration
  const restoredLayers = await prisma.fifoLayer.findMany({
    where: { variantId: variant.id, referenceId: `RETURN_${returnReq.id}` },
  });

  console.log('  Restored FIFO Layers Count:', restoredLayers.length);
  if (restoredLayers.length > 0) {
    console.log('  Restored Layer Quantity:', restoredLayers[0].remainingQuantity);
    console.log('  Restored Layer Unit Cost:', Number(restoredLayers[0].unitCost));
  }

  if (restoredLayers.length === 0 || restoredLayers[0].remainingQuantity !== 2 || Number(restoredLayers[0].unitCost) !== 500) {
    throw new Error('FIFO layer restoration failed or restored wrong unit cost!');
  }

  // 7. FINANCIAL REFUND ENGINE & TAX ALLOCATION
  console.log('\n--- Step 7: Financial Refund Calculation & 3-Phase Execution ---');

  const merchandiseRefund = Number(returnReq.subtotalRefund); // ₹3,000.00
  const taxRefund = Number(returnReq.taxRefund); // ₹150.00
  const shippingRefund = 0; // Standard customer return
  const totalRefund = Number(returnReq.totalRefundAmount); // ₹3,150.00

  console.log(`  Order Grand Total: ₹${Number(testOrder.grandTotal).toFixed(2)}`);
  console.log(`  Unit/Line Selling Price: ₹${Number(testOrder.items[0].unitPrice).toFixed(2)}`);
  console.log(`  Quantity Requested: ${itemAfterInspect.quantityRequested}`);
  console.log(`  Quantity Received: ${itemAfterInspect.quantityReceived}`);
  console.log(`  Quantity Restocked: ${itemAfterInspect.quantityRestocked}`);
  console.log(`  Quantity Damaged: ${itemAfterInspect.quantityDamaged}`);
  console.log(`  Merchandise Refund: ₹${merchandiseRefund.toFixed(2)}`);
  console.log(`  Tax Refund: ₹${taxRefund.toFixed(2)}`);
  console.log(`  Shipping Refund: ₹${shippingRefund.toFixed(2)}`);
  console.log(`  Total Refund: ₹${totalRefund.toFixed(2)}`);
  console.log('  Refund Derivation Explanation: 3 requested & received units returned under DEFECTIVE reason. Net merchandise refund ₹3,000 (3 * ₹1,000) + full line tax refund ₹150 (3 * ₹50) = ₹3,150. Shipping ₹100 non-refundable.');

  // Create Refund Intent (Phase 1)
  const refundIdemKey = `ref-acc6-${returnReq.id}-${Date.now()}`;
  const intentRes = await createRefundIntent({
    orderId: testOrder.id,
    returnRequestId: returnReq.id,
    amount: totalRefund,
    shippingRefund,
    idempotencyKey: refundIdemKey,
    allocations: [
      {
        orderItemId: testOrder.items[0].id,
        returnItemId: returnReq.items[0].id,
        merchandiseRefund,
        taxRefund,
      },
    ],
  });

  const refundIntent = intentRes.refund;
  console.log('  Refund Intent Created (Phase 1 PENDING):', refundIntent.refundNumber);

  // Replay Idempotency Check
  const replayedIntent = await createRefundIntent({
    orderId: testOrder.id,
    returnRequestId: returnReq.id,
    amount: totalRefund,
    shippingRefund,
    idempotencyKey: refundIdemKey,
    allocations: [
      {
        orderItemId: testOrder.items[0].id,
        returnItemId: returnReq.items[0].id,
        merchandiseRefund,
        taxRefund,
      },
    ],
  });

  console.log('  Duplicate Replay Returned Existing:', replayedIntent.isDuplicate === true);
  if (!replayedIntent.isDuplicate) throw new Error('Duplicate refund intent check failed!');

  // Dispatch & Finalize Refund (Phase 2 & 3)
  const finalizedRefund = await dispatchGatewayRefund(refundIntent.id);
  console.log('  Final Refund Status:', finalizedRefund.status);

  if (finalizedRefund.status !== RefundStatus.COMPLETED) {
    throw new Error(`Expected final refund status COMPLETED, got ${finalizedRefund.status}`);
  }

  // 8. VERIFY POST-REFUND STATE & ORDER PAYMENT STATUS TRANSITION
  console.log('\n--- Step 8: Post-Refund Order & Terminal Resolution Invariants ---');
  const postRefundOrder = await prisma.order.findUnique({
    where: { id: testOrder.id },
  });
  const postRefundReq = await prisma.returnRequest.findUnique({
    where: { id: returnReq.id },
  });

  console.log('  Order Payment Status Transited to PARTIALLY_REFUNDED / REFUNDED:', postRefundOrder?.paymentStatus);
  console.log('  Return Request Terminal Status Transited to RESOLVED:', postRefundReq?.status === ReturnStatus.RESOLVED);

  if (postRefundOrder?.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED && postRefundOrder?.paymentStatus !== PaymentStatus.REFUNDED) {
    throw new Error(`Unexpected Order.paymentStatus: ${postRefundOrder?.paymentStatus}`);
  }
  if (postRefundReq?.status !== ReturnStatus.RESOLVED) {
    throw new Error(`Expected ReturnRequest.status RESOLVED, got ${postRefundReq?.status}`);
  }

  // 9. VERIFY PERSISTENCE AFTER RELOAD
  console.log('\n--- Step 9: Persistence Check Upon Reload ---');
  const reloadedOrder = await prisma.order.findUnique({ where: { id: testOrder.id } });
  const reloadedReq = await prisma.returnRequest.findUnique({ where: { id: returnReq.id }, include: { items: true } });
  const reloadedRefund = await prisma.refund.findUnique({ where: { id: refundIntent.id } });

  console.log('  Persisted Order Payment Status:', reloadedOrder?.paymentStatus);
  console.log('  Persisted Return Request Status:', reloadedReq?.status);
  console.log('  Persisted Refund Status:', reloadedRefund?.status);
  console.log('  Persisted restocked count:', reloadedReq?.items[0].quantityRestocked);
  console.log('  Persisted damaged count:', reloadedReq?.items[0].quantityDamaged);

  if (reloadedRefund?.status !== RefundStatus.COMPLETED || reloadedReq?.status !== ReturnStatus.RESOLVED) {
    throw new Error('State failed to persist upon reload!');
  }

  console.log('\n================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 6 PASSED ALL VERIFICATION CHECKS!');
  console.log('================================================================');
}

runAcceptanceTest6().catch((err) => {
  console.error('FATAL ACCEPTANCE TEST 6 FAILURE:', err);
  process.exit(1);
});
