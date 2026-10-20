import { prisma } from '../lib/db/prisma';
import { approveReturnRequest } from '../lib/returns/return-engine';
import { ReturnStatus } from '@prisma/client';

async function runAcceptanceTest2() {
  console.log('================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 2 — ADMIN APPROVES RETURN');
  console.log('================================================================\n');

  const returnNumber = 'RET-20260924-1022';

  // 1. LOCATE RETURN REQUEST & VERIFY INITIAL STATE
  console.log('--- Step 1: Locate Return Request & Initial Detail Verification ---');
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
  console.log('  Return Request ID:', returnReq.id);
  console.log('  Order Number:', returnReq.order.orderNumber);
  console.log('  Customer Mobile:', returnReq.customerMobile);
  console.log('  Reason:', returnReq.reason);
  console.log('  Reason Details:', returnReq.reasonDetails);
  console.log('  Initial Status:', returnReq.status);

  if (returnReq.status !== ReturnStatus.REQUESTED) {
    throw new Error(`Expected initial status REQUESTED, found ${returnReq.status}`);
  }

  const returnItem = returnReq.items[0];
  console.log('  Line Item SKU:', returnItem.variant.sku);
  console.log('  Quantity Requested:', returnItem.quantityRequested);
  console.log('  Quantity Received:', returnItem.quantityReceived);
  console.log('  Quantity Restocked:', returnItem.quantityRestocked);
  console.log('  Quantity Damaged:', returnItem.quantityDamaged);
  console.log('  Order Status:', returnReq.order.status);
  console.log('  Order Payment Status:', returnReq.order.paymentStatus);

  if (returnItem.quantityRequested !== 2) {
    throw new Error(`Expected quantityRequested = 2, found ${returnItem.quantityRequested}`);
  }
  if (returnItem.quantityReceived !== 0 || returnItem.quantityRestocked !== 0 || returnItem.quantityDamaged !== 0) {
    throw new Error('Received/restocked/damaged quantities are non-zero before approval!');
  }
  if (returnReq.order.status !== 'DELIVERED' || returnReq.order.paymentStatus !== 'PAID') {
    throw new Error('Order or payment status is invalid before approval!');
  }

  // Get initial physical inventory stock to verify zero stock change
  const initialInventory = await prisma.inventoryItem.findUnique({
    where: { variantId: returnItem.variantId },
  });
  console.log('  Initial Physical Stock:', initialInventory?.physicalStock);
  console.log('  Initial Reserved Stock:', initialInventory?.reservedStock);

  // 2. APPROVE RETURN REQUEST
  console.log('\n--- Step 2: Approve Return Request ---');
  const adminNotes = 'Approved for customer return inspection';
  const approvedReq = await approveReturnRequest(returnReq.id, adminNotes);

  console.log('  Approval Action Executed Successfully!');
  console.log('  Approved Return Status:', approvedReq.status);
  console.log('  Approved At Timestamp:', approvedReq.approvedAt);

  // 3. VERIFY POST-APPROVAL DATABASE STATE & INVARIANTS
  console.log('\n--- Step 3: Post-Approval Database Invariants Verification ---');
  const postReturnReq = await prisma.returnRequest.findUnique({
    where: { id: returnReq.id },
    include: {
      order: true,
      items: true,
      refunds: true,
    },
  });

  if (!postReturnReq) throw new Error('Return request missing post-approval!');

  const postItem = postReturnReq.items[0];

  console.log('  Status Transited to APPROVED:', postReturnReq.status === ReturnStatus.APPROVED);
  console.log('  Quantity Requested Preserved (2):', postItem.quantityRequested === 2);
  console.log('  Quantity Received Unchanged (0):', postItem.quantityReceived === 0);
  console.log('  Quantity Restocked Unchanged (0):', postItem.quantityRestocked === 0);
  console.log('  Quantity Damaged Unchanged (0):', postItem.quantityDamaged === 0);
  console.log('  Zero Refunds Created from Approval:', postReturnReq.refunds.length === 0);
  console.log('  Order Status Unchanged (DELIVERED):', postReturnReq.order.status === 'DELIVERED');
  console.log('  Order Payment Status Unchanged (PAID):', postReturnReq.order.paymentStatus === 'PAID');

  if (postReturnReq.status !== ReturnStatus.APPROVED) {
    throw new Error(`Expected status APPROVED, got ${postReturnReq.status}`);
  }
  if (postItem.quantityRequested !== 2 || postItem.quantityReceived !== 0 || postItem.quantityRestocked !== 0 || postItem.quantityDamaged !== 0) {
    throw new Error('Quantity counts mutated improperly during approval!');
  }
  if (postReturnReq.refunds.length > 0) {
    throw new Error('Refund was prematurely created during approval alone!');
  }
  if (postReturnReq.order.status !== 'DELIVERED' || postReturnReq.order.paymentStatus !== 'PAID') {
    throw new Error('Order or payment status altered during approval!');
  }

  // 4. VERIFY INVENTORY UNCHANGED
  const postInventory = await prisma.inventoryItem.findUnique({
    where: { variantId: returnItem.variantId },
  });
  console.log('  Post-Approval Physical Stock Unchanged:', postInventory?.physicalStock === initialInventory?.physicalStock);
  console.log('  Post-Approval Reserved Stock Unchanged:', postInventory?.reservedStock === initialInventory?.reservedStock);

  if (postInventory?.physicalStock !== initialInventory?.physicalStock || postInventory?.reservedStock !== initialInventory?.reservedStock) {
    throw new Error('Inventory physical or reserved stock mutated from approval alone!');
  }

  // 5. VERIFY PERSISTENCE & READY FOR PHYSICAL RECEIPT
  console.log('\n--- Step 4: Persistence Check & Inspection Readiness ---');

  // Re-query from database to simulate page refresh
  const reloadedReq = await prisma.returnRequest.findUnique({
    where: { id: returnReq.id },
  });

  console.log('  Persisted Status After Reload:', reloadedReq?.status);
  console.log('  Ready for Physical Receipt & Inspection (APPROVED):', reloadedReq?.status === ReturnStatus.APPROVED);

  if (reloadedReq?.status !== ReturnStatus.APPROVED) {
    throw new Error('Approved state failed to persist!');
  }

  console.log('\n================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 2 PASSED ALL VERIFICATION CHECKS!');
  console.log('================================================================');
}

runAcceptanceTest2().catch((err) => {
  console.error('FATAL ACCEPTANCE TEST 2 FAILURE:', err);
  process.exit(1);
});
