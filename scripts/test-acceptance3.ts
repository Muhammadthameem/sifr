import { prisma } from '../lib/db/prisma';
import { recordPhysicalReceipt } from '../lib/returns/return-engine';
import { ReturnStatus } from '@prisma/client';

async function runAcceptanceTest3() {
  console.log('================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 3 — PRODUCT PHYSICALLY RECEIVED');
  console.log('================================================================\n');

  const returnNumber = 'RET-20260924-1022';

  // Reset RET-20260924-1022 to APPROVED state for clean test run
  await prisma.returnRequest.update({
    where: { returnNumber },
    data: { status: ReturnStatus.APPROVED, receivedAt: null, inspectedAt: null, resolvedAt: null },
  });

  await prisma.returnItem.updateMany({
    where: { returnRequest: { returnNumber } },
    data: { quantityReceived: 0, quantityRestocked: 0, quantityDamaged: 0 },
  });

  // 1. LOCATE RETURN REQUEST & VERIFY APPROVED STATE
  console.log('--- Step 1: Locate Return Request & Verify APPROVED State ---');
  let returnReq = await prisma.returnRequest.findUnique({
    where: { returnNumber },
    include: {
      order: true,
      items: { include: { variant: true } },
      refunds: true,
      exchanges: true,
    },
  });

  if (!returnReq) {
    throw new Error(`Return Request '${returnNumber}' not found in database.`);
  }

  console.log('  Return Request Located:', returnReq.returnNumber);
  console.log('  Current Status:', returnReq.status);

  if (returnReq.status !== ReturnStatus.APPROVED) {
    throw new Error(`Expected current status APPROVED, found ${returnReq.status}`);
  }

  const returnItem = returnReq.items[0];
  console.log('  Line Item SKU:', returnItem.variant.sku);
  console.log('  Quantity Requested:', returnItem.quantityRequested);
  console.log('  Initial Quantity Received:', returnItem.quantityReceived);
  console.log('  Initial Quantity Restocked:', returnItem.quantityRestocked);
  console.log('  Initial Quantity Damaged:', returnItem.quantityDamaged);

  if (returnItem.quantityRequested !== 2) {
    throw new Error(`Expected quantityRequested = 2, found ${returnItem.quantityRequested}`);
  }

  // Get initial physical inventory stock to verify zero stock change
  const initialInventory = await prisma.inventoryItem.findUnique({
    where: { variantId: returnItem.variantId },
  });
  console.log('  Initial Physical Stock:', initialInventory?.physicalStock);
  console.log('  Initial Reserved Stock:', initialInventory?.reservedStock);

  // 2. SIMULATE PHYSICAL RECEIPT (2 UNITS RECEIVED, 0 RESTOCKED, 0 DAMAGED)
  console.log('\n--- Step 2: Record Physical Receipt (2 Units Received) ---');
  
  // Call recordPhysicalReceipt engine function to record physical arrival of 2 units
  await recordPhysicalReceipt({
    returnRequestId: returnReq.id,
    idempotencyKey: `rcpt-arrival-${returnReq.id}-${Date.now()}`,
    receivedBy: 'Warehouse Logistics Team',
    notes: 'Physical shipment arrived at warehouse loading dock. 2 units unboxed.',
    items: [
      {
        returnItemId: returnItem.id,
        quantityReceived: 2,
      },
    ],
  });

  console.log('  Physical Receipt Recorded Successfully!');

  // 3. VERIFY POST-RECEIPT DATABASE STATE & QUANTITY INVARIANTS
  console.log('\n--- Step 3: Post-Receipt Database Invariants Verification ---');
  const postReturnReq = await prisma.returnRequest.findUnique({
    where: { id: returnReq.id },
    include: {
      order: true,
      items: true,
      refunds: true,
      receiptEvents: { include: { items: true } },
    },
  });

  if (!postReturnReq) throw new Error('Return request missing post-receipt!');

  const postItem = postReturnReq.items[0];

  console.log('  Status Transited to RECEIVED:', postReturnReq.status === ReturnStatus.RECEIVED);
  console.log('  quantityReceived Exactly 2:', postItem.quantityReceived === 2);
  console.log('  quantityRequested Preserved (2):', postItem.quantityRequested === 2);
  console.log('  quantityRestocked Remains 0:', postItem.quantityRestocked === 0);
  console.log('  quantityDamaged Remains 0:', postItem.quantityDamaged === 0);
  console.log('  ReturnReceiptEvent Logged:', postReturnReq.receiptEvents.length > 0);
  console.log('  Zero Refunds Created from Receipt:', postReturnReq.refunds.length === 0);
  console.log('  Order Status Unchanged (DELIVERED):', postReturnReq.order.status === 'DELIVERED');
  console.log('  Order Payment Status Unchanged (PAID):', postReturnReq.order.paymentStatus === 'PAID');

  if (postReturnReq.status !== ReturnStatus.RECEIVED) {
    throw new Error(`Expected status RECEIVED, got ${postReturnReq.status}`);
  }
  if (postItem.quantityReceived !== 2) {
    throw new Error(`Expected quantityReceived = 2, got ${postItem.quantityReceived}`);
  }
  if (postItem.quantityRequested !== 2) {
    throw new Error(`Expected quantityRequested = 2, got ${postItem.quantityRequested}`);
  }
  if (postItem.quantityRestocked !== 0) {
    throw new Error(`Expected quantityRestocked = 0, got ${postItem.quantityRestocked}`);
  }
  if (postItem.quantityDamaged !== 0) {
    throw new Error(`Expected quantityDamaged = 0, got ${postItem.quantityDamaged}`);
  }
  if (postReturnReq.refunds.length > 0) {
    throw new Error('Refund was prematurely created from physical receipt alone!');
  }
  if (postReturnReq.order.status !== 'DELIVERED' || postReturnReq.order.paymentStatus !== 'PAID') {
    throw new Error('Order or payment status altered during physical receipt!');
  }

  // 4. VERIFY INVENTORY UNCHANGED (INSPECTION / DISPOSITION NOT YET PERFORMED)
  console.log('\n--- Step 4: Verify Inventory Stock Unchanged ---');
  const postInventory = await prisma.inventoryItem.findUnique({
    where: { variantId: returnItem.variantId },
  });

  console.log('  Physical Stock Before Receipt:', initialInventory?.physicalStock);
  console.log('  Physical Stock After Receipt:', postInventory?.physicalStock);
  console.log('  Reserved Stock Before Receipt:', initialInventory?.reservedStock);
  console.log('  Reserved Stock After Receipt:', postInventory?.reservedStock);
  console.log('  Inventory Physical Stock Unchanged:', postInventory?.physicalStock === initialInventory?.physicalStock);
  console.log('  Inventory Reserved Stock Unchanged:', postInventory?.reservedStock === initialInventory?.reservedStock);

  if (postInventory?.physicalStock !== initialInventory?.physicalStock || postInventory?.reservedStock !== initialInventory?.reservedStock) {
    throw new Error('Inventory stock was prematurely restocked before inspection/disposition!');
  }

  // 5. VERIFY PERSISTENCE & READINESS FOR INSPECTION
  console.log('\n--- Step 5: Persistence Check & Inspection Readiness ---');

  // Re-query from database to simulate page reload
  const reloadedReq = await prisma.returnRequest.findUnique({
    where: { id: returnReq.id },
    include: { items: true },
  });

  console.log('  Persisted Status After Reload:', reloadedReq?.status);
  console.log('  Persisted quantityReceived After Reload:', reloadedReq?.items[0].quantityReceived);
  console.log('  Ready for Inspection & Restocking Stage:', reloadedReq?.status === ReturnStatus.RECEIVED);

  if (reloadedReq?.status !== ReturnStatus.RECEIVED || reloadedReq?.items[0].quantityReceived !== 2) {
    throw new Error('Received state failed to persist upon reload!');
  }

  console.log('\n================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 3 PASSED ALL VERIFICATION CHECKS!');
  console.log('================================================================');
}

runAcceptanceTest3().catch((err) => {
  console.error('FATAL ACCEPTANCE TEST 3 FAILURE:', err);
  process.exit(1);
});
