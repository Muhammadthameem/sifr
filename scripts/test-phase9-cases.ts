import { prisma } from '../lib/db/prisma';
import { receiveStock, consumeFifoStock } from '../lib/inventory/fifo-engine';
import {
  createReturnRequest,
  approveReturnRequest,
  recordPhysicalReceipt,
  processIncrementalInspection,
} from '../lib/returns/return-engine';
import { ReturnStatus, ReturnReason } from '@prisma/client';

async function runRegressionEdgeCases() {
  console.log('================================================================');
  console.log('PHASE 9 REGRESSION TEST SUITE — EDGE CASES A TO F');
  console.log('================================================================\n');

  const timestamp = Date.now();

  // Setup Category, Product & Variant
  const category = await prisma.category.create({
    data: { name: `Edge Cat ${timestamp}`, slug: `edge-cat-${timestamp}` },
  });
  const product = await prisma.product.create({
    data: { name: `Edge Product ${timestamp}`, slug: `edge-prod-${timestamp}`, categoryId: category.id, status: 'ACTIVE' },
  });
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, title: 'Edge Variant', sku: `EDGE-SKU-${timestamp}`, mrp: 1000, sellingPrice: 800, costPrice: 400 },
  });

  await receiveStock({
    variantId: variant.id,
    quantity: 50,
    unitCost: 400,
    idempotencyKey: `rec-edge-${timestamp}`,
  });

  // Helper to create test order
  async function createDeliveredTestOrder(orderNumber: string, qty: number) {
    const order = await prisma.order.create({
      data: {
        orderNumber,
        salesChannel: 'ONLINE',
        status: 'DELIVERED',
        deliveredAt: new Date(),
        customerNameSnapshot: 'Edge Customer',
        customerMobileSnapshot: '+919876543210',
        subtotal: 800 * qty,
        grandTotal: 800 * qty,
        paymentStatus: 'PAID',
        items: {
          create: [
            {
              variantId: variant.id,
              productNameSnapshot: product.name,
              variantTitleSnapshot: variant.title,
              skuSnapshot: variant.sku,
              quantity: qty,
              unitPrice: 800,
              mrp: 1000,
              lineTotal: 800 * qty,
            },
          ],
        },
      },
      include: { items: true },
    });

    await consumeFifoStock({
      variantId: variant.id,
      quantity: qty,
      referenceId: order.id,
      type: 'SALE_OUT',
      idempotencyKey: `ord-sale-${order.id}`,
    });

    return order;
  }

  // --------------------------------------------------------------------------
  // CASE A — Full receipt, then full inspection (Requested=2, Received=2, Restocked=2, Damaged=0)
  // --------------------------------------------------------------------------
  console.log('--- CASE A: Full receipt (2), then full inspection (2 restocked, 0 damaged) ---');
  const orderA = await createDeliveredTestOrder(`ORD-CASE-A-${timestamp}`, 2);
  const retA = await createReturnRequest({
    orderId: orderA.id,
    reason: ReturnReason.SIZE_FIT_ISSUE,
    items: [{ orderItemId: orderA.items[0].id, quantityRequested: 2 }],
    submissionIdempotencyKey: `sub-a-${timestamp}`,
  });
  await approveReturnRequest(retA.returnRequest.id);

  await recordPhysicalReceipt({
    returnRequestId: retA.returnRequest.id,
    idempotencyKey: `rcpt-a-${timestamp}`,
    items: [{ returnItemId: retA.returnRequest.items[0].id, quantityReceived: 2 }],
  });

  const inspectA = await processIncrementalInspection({
    returnRequestId: retA.returnRequest.id,
    idempotencyKey: `ins-a-${timestamp}`,
    items: [{ returnItemId: retA.returnRequest.items[0].id, quantityRestocked: 2, quantityDamaged: 0 }],
  });

  const checkA = await prisma.returnRequest.findUnique({
    where: { id: retA.returnRequest.id },
    include: { items: true },
  });
  const itemA = checkA!.items[0];
  console.log('  Case A Result:');
  console.log(`    Requested: ${itemA.quantityRequested}, Received: ${itemA.quantityReceived}, Restocked: ${itemA.quantityRestocked}, Damaged: ${itemA.quantityDamaged}`);
  if (itemA.quantityRequested !== 2 || itemA.quantityReceived !== 2 || itemA.quantityRestocked !== 2 || itemA.quantityDamaged !== 0) {
    throw new Error('Case A failed state check!');
  }
  console.log('  ✓ CASE A PASSED\n');

  // --------------------------------------------------------------------------
  // CASE B — Full receipt (5), partial inspection (Restocked=2, Damaged=1)
  // --------------------------------------------------------------------------
  console.log('--- CASE B: Full receipt (5), partial inspection (2 restocked, 1 damaged) ---');
  const orderB = await createDeliveredTestOrder(`ORD-CASE-B-${timestamp}`, 5);
  const retB = await createReturnRequest({
    orderId: orderB.id,
    reason: ReturnReason.DEFECTIVE,
    items: [{ orderItemId: orderB.items[0].id, quantityRequested: 5 }],
    submissionIdempotencyKey: `sub-b-${timestamp}`,
  });
  await approveReturnRequest(retB.returnRequest.id);

  await recordPhysicalReceipt({
    returnRequestId: retB.returnRequest.id,
    idempotencyKey: `rcpt-b-${timestamp}`,
    items: [{ returnItemId: retB.returnRequest.items[0].id, quantityReceived: 5 }],
  });

  await processIncrementalInspection({
    returnRequestId: retB.returnRequest.id,
    idempotencyKey: `ins-b-${timestamp}`,
    items: [{ returnItemId: retB.returnRequest.items[0].id, quantityRestocked: 2, quantityDamaged: 1 }],
  });

  const checkB = await prisma.returnRequest.findUnique({
    where: { id: retB.returnRequest.id },
    include: { items: true },
  });
  const itemB = checkB!.items[0];
  const uninspectedB = itemB.quantityReceived - (itemB.quantityRestocked + itemB.quantityDamaged);
  console.log('  Case B Result:');
  console.log(`    Received: ${itemB.quantityReceived}, Restocked: ${itemB.quantityRestocked}, Damaged: ${itemB.quantityDamaged}, Uninspected: ${uninspectedB}`);
  console.log(`    Status: ${checkB!.status} (Pending further inspection)`);
  if (itemB.quantityReceived !== 5 || itemB.quantityRestocked !== 2 || itemB.quantityDamaged !== 1 || uninspectedB !== 2 || checkB!.status !== ReturnStatus.RECEIVED) {
    throw new Error('Case B failed state check!');
  }
  console.log('  ✓ CASE B PASSED\n');

  // --------------------------------------------------------------------------
  // CASE C — Complete remaining inspection (Inspect remaining 2 as restocked)
  // --------------------------------------------------------------------------
  console.log('--- CASE C: Complete remaining inspection (Inspect remaining 2 as restocked) ---');
  await processIncrementalInspection({
    returnRequestId: retB.returnRequest.id,
    idempotencyKey: `ins-c-${timestamp}`,
    items: [{ returnItemId: retB.returnRequest.items[0].id, quantityRestocked: 2, quantityDamaged: 0 }],
  });

  const checkC = await prisma.returnRequest.findUnique({
    where: { id: retB.returnRequest.id },
    include: { items: true },
  });
  const itemC = checkC!.items[0];
  console.log('  Case C Result:');
  console.log(`    Received: ${itemC.quantityReceived}, Restocked: ${itemC.quantityRestocked}, Damaged: ${itemC.quantityDamaged}`);
  console.log(`    Status: ${checkC!.status}`);
  if (itemC.quantityReceived !== 5 || itemC.quantityRestocked !== 4 || itemC.quantityDamaged !== 1) {
    throw new Error('Case C failed state check!');
  }
  console.log('  ✓ CASE C PASSED\n');

  // --------------------------------------------------------------------------
  // CASE D — Inspection exceeds received (Received=2, Attempt inspect Restocked=3)
  // --------------------------------------------------------------------------
  console.log('--- CASE D: Inspection exceeds received (Received=2, Attempt inspect 3) ---');
  const orderD = await createDeliveredTestOrder(`ORD-CASE-D-${timestamp}`, 5);
  const retD = await createReturnRequest({
    orderId: orderD.id,
    reason: ReturnReason.DEFECTIVE,
    items: [{ orderItemId: orderD.items[0].id, quantityRequested: 5 }],
    submissionIdempotencyKey: `sub-d-${timestamp}`,
  });
  await approveReturnRequest(retD.returnRequest.id);

  await recordPhysicalReceipt({
    returnRequestId: retD.returnRequest.id,
    idempotencyKey: `rcpt-d-${timestamp}`,
    items: [{ returnItemId: retD.returnRequest.items[0].id, quantityReceived: 2 }],
  });

  let caseDRejected = false;
  try {
    await processIncrementalInspection({
      returnRequestId: retD.returnRequest.id,
      idempotencyKey: `ins-d-${timestamp}`,
      items: [{ returnItemId: retD.returnRequest.items[0].id, quantityRestocked: 3, quantityDamaged: 0 }],
    });
  } catch (err: any) {
    caseDRejected = err.message.includes('INSPECTION_EXCEEDS_RECEIVED');
  }

  console.log('  Case D Result:');
  console.log('    Attempting inspection > received rejected cleanly:', caseDRejected);
  if (!caseDRejected) {
    throw new Error('Case D failed to reject inspection exceeding received quantity!');
  }
  console.log('  ✓ CASE D PASSED\n');

  // --------------------------------------------------------------------------
  // CASE E — Physical receipt exceeds requested (Requested=2, Attempt receive 3)
  // --------------------------------------------------------------------------
  console.log('--- CASE E: Physical receipt exceeds requested (Requested=2, Attempt receive 3) ---');
  const orderE = await createDeliveredTestOrder(`ORD-CASE-E-${timestamp}`, 2);
  const retE = await createReturnRequest({
    orderId: orderE.id,
    reason: ReturnReason.WRONG_ITEM,
    items: [{ orderItemId: orderE.items[0].id, quantityRequested: 2 }],
    submissionIdempotencyKey: `sub-e-${timestamp}`,
  });
  await approveReturnRequest(retE.returnRequest.id);

  let caseERejected = false;
  try {
    await recordPhysicalReceipt({
      returnRequestId: retE.returnRequest.id,
      idempotencyKey: `rcpt-e-${timestamp}`,
      items: [{ returnItemId: retE.returnRequest.items[0].id, quantityReceived: 3 }],
    });
  } catch (err: any) {
    caseERejected = err.message.includes('OVER_RECEIPT');
  }

  console.log('  Case E Result:');
  console.log('    Attempting physical receipt > requested rejected cleanly:', caseERejected);
  if (!caseERejected) {
    throw new Error('Case E failed to reject physical receipt exceeding requested quantity!');
  }
  console.log('  ✓ CASE E PASSED\n');

  // --------------------------------------------------------------------------
  // CASE F — Mixed disposition (Requested=4, Received=4, Restocked=3, Damaged=1)
  // --------------------------------------------------------------------------
  console.log('--- CASE F: Mixed disposition (Requested=4, Received=4, Restocked=3, Damaged=1) ---');
  const orderF = await createDeliveredTestOrder(`ORD-CASE-F-${timestamp}`, 4);
  const retF = await createReturnRequest({
    orderId: orderF.id,
    reason: ReturnReason.DEFECTIVE,
    items: [{ orderItemId: orderF.items[0].id, quantityRequested: 4 }],
    submissionIdempotencyKey: `sub-f-${timestamp}`,
  });
  await approveReturnRequest(retF.returnRequest.id);

  await recordPhysicalReceipt({
    returnRequestId: retF.returnRequest.id,
    idempotencyKey: `rcpt-f-${timestamp}`,
    items: [{ returnItemId: retF.returnRequest.items[0].id, quantityReceived: 4 }],
  });

  const invBeforeF = await prisma.inventoryItem.findUnique({ where: { variantId: variant.id } });

  await processIncrementalInspection({
    returnRequestId: retF.returnRequest.id,
    idempotencyKey: `ins-f-${timestamp}`,
    items: [{ returnItemId: retF.returnRequest.items[0].id, quantityRestocked: 3, quantityDamaged: 1 }],
  });

  const checkF = await prisma.returnRequest.findUnique({
    where: { id: retF.returnRequest.id },
    include: { items: true },
  });
  const itemF = checkF!.items[0];
  const invAfterF = await prisma.inventoryItem.findUnique({ where: { variantId: variant.id } });

  const physicalIncrementF = (invAfterF?.physicalStock || 0) - (invBeforeF?.physicalStock || 0);

  console.log('  Case F Result:');
  console.log(`    Received: ${itemF.quantityReceived}, Restocked: ${itemF.quantityRestocked}, Damaged: ${itemF.quantityDamaged}`);
  console.log(`    Invariant (4 = 3 + 1) Satisfied: ${itemF.quantityReceived === itemF.quantityRestocked + itemF.quantityDamaged}`);
  console.log(`    Physical Inventory Increased By Exactly 3: ${physicalIncrementF === 3}`);

  if (itemF.quantityReceived !== 4 || itemF.quantityRestocked !== 3 || itemF.quantityDamaged !== 1 || physicalIncrementF !== 3) {
    throw new Error('Case F failed state check!');
  }
  console.log('  ✓ CASE F PASSED\n');

  console.log('================================================================');
  console.log('ALL EDGE CASES A TO F PASSED SUCCESSFULLY! 🎉');
  console.log('================================================================');
}

runRegressionEdgeCases().catch((err) => {
  console.error('FATAL EDGE CASE FAILURE:', err);
  process.exit(1);
});
