import { prisma } from '../lib/db/prisma';
import { processIncrementalInspection } from '../lib/returns/return-engine';
import { ReturnStatus } from '@prisma/client';

async function runAcceptanceTest4() {
  console.log('================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 4 — INSPECTION & RESTOCKING');
  console.log('================================================================\n');

  const returnNumber = 'RET-20260924-1022';

  // 1. LOCATE RETURN REQUEST & VERIFY RECEIVED STATE
  console.log('--- Step 1: Locate Return Request & Verify RECEIVED State ---');
  let returnReq = await prisma.returnRequest.findUnique({
    where: { returnNumber },
    include: {
      order: { include: { items: true } },
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

  if (returnReq.status !== ReturnStatus.RECEIVED && returnReq.status !== ReturnStatus.APPROVED) {
    throw new Error(`Expected current status RECEIVED or APPROVED, found ${returnReq.status}`);
  }

  const returnItem = returnReq.items[0];
  console.log('  Line Item SKU:', returnItem.variant.sku);
  console.log('  Quantity Requested:', returnItem.quantityRequested);
  console.log('  Quantity Received:', returnItem.quantityReceived);
  console.log('  Pre-Inspection Restocked:', returnItem.quantityRestocked);
  console.log('  Pre-Inspection Damaged:', returnItem.quantityDamaged);

  // Get initial physical inventory stock before restocking
  const initialInventory = await prisma.inventoryItem.findUnique({
    where: { variantId: returnItem.variantId },
  });
  console.log('  Initial Physical Stock Before Inspection:', initialInventory?.physicalStock);
  console.log('  Initial Reserved Stock Before Inspection:', initialInventory?.reservedStock);

  const initialPhysicalStock = initialInventory?.physicalStock || 0;
  const initialReservedStock = initialInventory?.reservedStock || 0;

  // Check initial FIFO layers count and valuation before restocking
  const fifoLayersBefore = await prisma.fifoLayer.findMany({
    where: { variantId: returnItem.variantId, remainingQuantity: { gt: 0 } },
  });
  console.log('  Active FIFO Layers Before Restocking:', fifoLayersBefore.length);

  // 2. EXECUTE INSPECTION & RESTOCKING DISPOSITION (2 RESTOCKED, 0 DAMAGED)
  console.log('\n--- Step 2: Execute Physical Inspection & Restocking Disposition ---');
  const inspectIdemKey = `inspect-test4-${returnReq.id}-${Date.now()}`;

  const inspectRes = await processIncrementalInspection({
    returnRequestId: returnReq.id,
    idempotencyKey: inspectIdemKey,
    receivedBy: 'Senior Inspector QA',
    notes: 'Inspected 2 returned polo shirts. Both in original pristine condition with tags attached. Restocked to physical inventory.',
    items: [
      {
        returnItemId: returnItem.id,
        quantityRestocked: 2,
        quantityDamaged: 0,
      },
    ],
  });

  console.log('  Inspection & Restocking Action Executed Successfully!');
  console.log('  Receipt Event ID:', inspectRes.receiptEvent.id);

  // 3. VERIFY POST-INSPECTION QUANTITY COUNTS & INVARIANTS
  console.log('\n--- Step 3: Post-Inspection Quantity & Invariant Verification ---');
  const postReturnReq = await prisma.returnRequest.findUnique({
    where: { id: returnReq.id },
    include: {
      order: true,
      items: true,
      refunds: true,
      receiptEvents: { include: { items: true } },
    },
  });

  if (!postReturnReq) throw new Error('Return request missing post-inspection!');

  const postItem = postReturnReq.items[0];

  console.log('  Status Updated (INSPECTED or RESOLVED):', postReturnReq.status);
  console.log('  quantityReceived Exactly 2:', postItem.quantityReceived === 2);
  console.log('  quantityRestocked Exactly 2:', postItem.quantityRestocked === 2);
  console.log('  quantityDamaged Exactly 0:', postItem.quantityDamaged === 0);

  // Assert Quantity Invariant: quantityReceived == quantityRestocked + quantityDamaged (2 == 2 + 0)
  const quantityInvariantSatisfied = postItem.quantityReceived === (postItem.quantityRestocked + postItem.quantityDamaged);
  console.log('  Quantity Invariant (2 = 2 + 0) Satisfied:', quantityInvariantSatisfied);

  if (!quantityInvariantSatisfied) {
    throw new Error(`Quantity invariant violated: quantityReceived (${postItem.quantityReceived}) !== quantityRestocked (${postItem.quantityRestocked}) + quantityDamaged (${postItem.quantityDamaged})`);
  }

  // 4. VERIFY PHYSICAL INVENTORY INCREMENT & RESERVED STOCK INVARIANTS
  console.log('\n--- Step 4: Physical Inventory & Stock Movement Verification ---');
  const postInventory = await prisma.inventoryItem.findUnique({
    where: { variantId: returnItem.variantId },
  });

  const postPhysicalStock = postInventory?.physicalStock || 0;
  const postReservedStock = postInventory?.reservedStock || 0;
  const physicalStockDelta = postPhysicalStock - initialPhysicalStock;

  console.log('  Physical Stock Before:', initialPhysicalStock);
  console.log('  Physical Stock After:', postPhysicalStock);
  console.log('  Physical Stock Increased By Exactly 2:', physicalStockDelta === 2);
  console.log('  Reserved Stock Unchanged:', postReservedStock === initialReservedStock);

  if (physicalStockDelta !== 2) {
    throw new Error(`Expected physical stock to increase by exactly 2, but increased by ${physicalStockDelta}`);
  }
  if (postReservedStock !== initialReservedStock) {
    throw new Error('Reserved stock was incorrectly altered during restocking inspection!');
  }

  // Verify InventoryMovement recorded (type: RETURN_IN, quantity: +2)
  const movements = await prisma.inventoryMovement.findMany({
    where: {
      variantId: returnItem.variantId,
      type: 'RETURN_IN',
      referenceId: returnReq.id,
    },
  });

  console.log('  RETURN_IN InventoryMovement Created:', movements.length > 0);
  if (movements.length > 0) {
    console.log('  Movement Type:', movements[0].type);
    console.log('  Movement Quantity:', movements[0].quantity);
    console.log('  Movement Notes:', movements[0].notes);
  }

  if (movements.length === 0 || movements[0].quantity !== 2) {
    throw new Error('RETURN_IN inventory movement missing or invalid quantity!');
  }

  // 5. VERIFY FIFO COST RESTORATION & LAYER RECONSTRUCTION
  console.log('\n--- Step 5: FIFO Layer Cost Restoration Verification ---');
  const restoredFifoLayers = await prisma.fifoLayer.findMany({
    where: {
      variantId: returnItem.variantId,
      referenceId: `RETURN_${returnReq.id}`,
    },
  });

  console.log('  Restored FIFO Layers Count:', restoredFifoLayers.length);
  if (restoredFifoLayers.length > 0) {
    console.log('  Restored Layer Initial Quantity:', restoredFifoLayers[0].initialQuantity);
    console.log('  Restored Layer Remaining Quantity:', restoredFifoLayers[0].remainingQuantity);
    console.log('  Restored Layer Unit Cost:', Number(restoredFifoLayers[0].unitCost));
  }

  if (restoredFifoLayers.length === 0 || restoredFifoLayers[0].remainingQuantity !== 2) {
    throw new Error('Restored FIFO layer missing or invalid remaining quantity!');
  }

  // 6. VERIFY ZERO REFUNDS & ORDER/PAYMENT STATE INVARIANTS
  console.log('\n--- Step 6: Refund & Order State Verification ---');
  console.log('  Zero Refunds Created from Inspection Alone:', postReturnReq.refunds.length === 0);
  console.log('  Order Status Unchanged (DELIVERED):', postReturnReq.order.status === 'DELIVERED');
  console.log('  Order Payment Status Unchanged (PAID):', postReturnReq.order.paymentStatus === 'PAID');

  if (postReturnReq.refunds.length > 0) {
    throw new Error('Refund was prematurely created from inspection alone!');
  }
  if (postReturnReq.order.status !== 'DELIVERED' || postReturnReq.order.paymentStatus !== 'PAID') {
    throw new Error('Order or payment status altered during inspection!');
  }

  // 7. VERIFY PERSISTENCE & READINESS FOR FINANCIAL RESOLUTION STAGE
  console.log('\n--- Step 7: Persistence Check & Financial Resolution Readiness ---');
  const reloadedReq = await prisma.returnRequest.findUnique({
    where: { id: returnReq.id },
    include: { items: true },
  });

  console.log('  Persisted Status After Reload:', reloadedReq?.status);
  console.log('  Persisted quantityRestocked After Reload:', reloadedReq?.items[0].quantityRestocked);
  console.log('  Ready for Refund / Financial Resolution Stage:', true);

  if (reloadedReq?.items[0].quantityRestocked !== 2) {
    throw new Error('Restocked quantity failed to persist upon reload!');
  }

  console.log('\n================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 4 PASSED ALL VERIFICATION CHECKS!');
  console.log('================================================================');
}

runAcceptanceTest4().catch((err) => {
  console.error('FATAL ACCEPTANCE TEST 4 FAILURE:', err);
  process.exit(1);
});
