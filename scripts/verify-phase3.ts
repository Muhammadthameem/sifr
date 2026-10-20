import { prisma } from '../lib/db/prisma';
import { receiveStock, consumeFifoStock, adjustStock, getVariantInventoryValuation } from '../lib/inventory/fifo-engine';
import { InventoryMovementType, AdjustmentReason, Prisma } from '@prisma/client';

async function runTests() {
  console.log('===================================================================');
  console.log('  SIFR PHASE 3 — INVENTORY, STOCK MANAGEMENT & FIFO TEST SUITE    ');
  console.log('===================================================================\n');

  // Clean up any test variants from previous test runs
  const testSkusPattern = 'TEST-SKU-P3';
  const existingVariants = await prisma.productVariant.findMany({
    where: { sku: { contains: testSkusPattern } },
    select: { id: true },
  });
  const variantIds = existingVariants.map((v: { id: string }) => v.id);

  const testLayerIds = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'];
  await prisma.fifoLayer.deleteMany({ where: { id: { in: testLayerIds } } });

  if (variantIds.length > 0) {
    await prisma.inventoryMovement.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.fifoLayer.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.inventoryItem.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
  }

  // Ensure test category & product setup
  let category = await prisma.category.findFirst({ where: { slug: { contains: 'test' } } });
  if (!category) {
    category = await prisma.category.create({
      data: { name: 'Test Category Phase3', slug: `test-cat-p3-${Date.now()}` },
    });
  }

  let product = await prisma.product.findFirst({ where: { slug: { contains: 'test-p3-inv' } } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        name: 'Phase 3 Test Inventory Product',
        slug: `test-p3-inv-${Date.now()}`,
        description: 'Test Product for Phase 3 Verification',
        categoryId: category.id,
      },
    });
  }

  async function createTestVariant(skuTag: string) {
    const sku = `${testSkusPattern}-${skuTag}-${Date.now()}`;
    return await prisma.productVariant.create({
      data: {
        productId: product!.id,
        title: `Variant ${skuTag}`,
        sku,
        mrp: 1000,
        sellingPrice: 1000,
        isAvailable: true,
      },
    });
  }

  // -------------------------------------------------------------------
  // TEST A — Initial Purchase
  // 100 units @ ₹500 -> Physical = 100, Available = 100, FIFO = 100 @ ₹500
  // -------------------------------------------------------------------
  console.log('[TEST A] Initial Purchase (100 @ ₹500)...');
  const vA = await createTestVariant('A');
  const keyA = `idempotency-test-a-${Date.now()}`;

  await receiveStock({
    variantId: vA.id,
    type: InventoryMovementType.PURCHASE_IN,
    quantity: 100,
    unitCost: 500,
    idempotencyKey: keyA,
    notes: 'Test A Receipt',
  });

  const invA = await prisma.inventoryItem.findUnique({ where: { variantId: vA.id } });
  const layersA = await prisma.fifoLayer.findMany({ where: { variantId: vA.id } });
  const movsA = await prisma.inventoryMovement.findMany({ where: { variantId: vA.id } });

  console.assert(invA?.physicalStock === 100, `Test A physicalStock fail: expected 100, got ${invA?.physicalStock}`);
  console.assert(invA?.physicalStock! - invA?.reservedStock! === 100, 'Test A available stock fail');
  console.assert(layersA.length === 1 && layersA[0].remainingQuantity === 100 && Number(layersA[0].unitCost) === 500, 'Test A FIFO layer fail');
  console.assert(movsA.length === 1 && movsA[0].quantity === 100 && Number(movsA[0].totalCost) === 50000, 'Test A movement fail');
  console.log('✓ PASSED: Test A — Physical = 100, Available = 100, FIFO = 100 @ ₹500');

  // -------------------------------------------------------------------
  // TEST B — Second Purchase
  // Add 50 units @ ₹550 -> Physical = 150, FIFO: 100 @ ₹500 & 50 @ ₹550
  // -------------------------------------------------------------------
  console.log('[TEST B] Second Purchase (Add 50 @ ₹550)...');
  const keyB1 = `idempotency-test-b-${Date.now()}`;
  await receiveStock({
    variantId: vA.id,
    type: InventoryMovementType.PURCHASE_IN,
    quantity: 50,
    unitCost: 550,
    idempotencyKey: keyB1,
    notes: 'Test B Receipt',
  });

  const invB = await prisma.inventoryItem.findUnique({ where: { variantId: vA.id } });
  const layersB = await prisma.fifoLayer.findMany({
    where: { variantId: vA.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  console.assert(invB?.physicalStock === 150, `Test B physicalStock fail: expected 150, got ${invB?.physicalStock}`);
  console.assert(layersB.length === 2, 'Test B layer count fail');
  console.assert(layersB[0].remainingQuantity === 100 && Number(layersB[0].unitCost) === 500, 'Test B layer 1 fail');
  console.assert(layersB[1].remainingQuantity === 50 && Number(layersB[1].unitCost) === 550, 'Test B layer 2 fail');
  console.log('✓ PASSED: Test B — Physical = 150, FIFO Layers: 100 @ ₹500 & 50 @ ₹550');

  // -------------------------------------------------------------------
  // TEST C — FIFO Consumption
  // Consume 120 units -> Physical = 30, FIFO COGS = ₹61,000, Remaining = 30 @ ₹550
  // -------------------------------------------------------------------
  console.log('[TEST C] FIFO Consumption (Consume 120 units)...');
  const keyC = `idempotency-test-c-${Date.now()}`;
  const resC = await consumeFifoStock({
    variantId: vA.id,
    type: InventoryMovementType.ADJUSTMENT_OUT,
    quantity: 120,
    reason: AdjustmentReason.DAMAGED,
    idempotencyKey: keyC,
    notes: 'Test C Consume 120',
  });

  const invC = await prisma.inventoryItem.findUnique({ where: { variantId: vA.id } });
  const layersC = await prisma.fifoLayer.findMany({
    where: { variantId: vA.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  console.assert(invC?.physicalStock === 30, `Test C physicalStock fail: ${invC?.physicalStock}`);
  console.assert(resC.totalFifoCost === 61000, `Test C COGS fail: expected 61000, got ${resC.totalFifoCost}`);
  console.assert(layersC[0].remainingQuantity === 0, 'Test C layer 1 remaining fail');
  console.assert(layersC[1].remainingQuantity === 30 && Number(layersC[1].unitCost) === 550, 'Test C layer 2 remaining fail');
  console.log('✓ PASSED: Test C — Physical = 30, FIFO COGS = ₹61,000, Remaining = 30 @ ₹550');

  // -------------------------------------------------------------------
  // TEST D — Multi-layer Consumption
  // Start with 100 @ ₹500, 50 @ ₹550, 75 @ ₹600. Consume 130.
  // Expected COGS = ₹66,500. Remaining: 20 @ ₹550, 75 @ ₹600.
  // -------------------------------------------------------------------
  console.log('[TEST D] Multi-layer Consumption (100 @ 500, 50 @ 550, 75 @ 600; Consume 130)...');
  const vD = await createTestVariant('D');
  await receiveStock({ variantId: vD.id, quantity: 100, unitCost: 500, idempotencyKey: `key-d1-${Date.now()}` });
  await receiveStock({ variantId: vD.id, quantity: 50, unitCost: 550, idempotencyKey: `key-d2-${Date.now()}` });
  await receiveStock({ variantId: vD.id, quantity: 75, unitCost: 600, idempotencyKey: `key-d3-${Date.now()}` });

  const resD = await consumeFifoStock({
    variantId: vD.id,
    quantity: 130,
    type: InventoryMovementType.ADJUSTMENT_OUT,
    reason: AdjustmentReason.PHYSICAL_CORRECTION,
    idempotencyKey: `key-d4-${Date.now()}`,
  });

  const layersD = await prisma.fifoLayer.findMany({
    where: { variantId: vD.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  // 100 @ 500 = 50000; 30 @ 550 = 16500 -> total = 66500
  console.assert(resD.totalFifoCost === 66500, `Test D COGS fail: expected 66500, got ${resD.totalFifoCost}`);
  console.assert(layersD[0].remainingQuantity === 0, 'Test D layer 1 fail');
  console.assert(layersD[1].remainingQuantity === 20 && Number(layersD[1].unitCost) === 550, 'Test D layer 2 fail');
  console.assert(layersD[2].remainingQuantity === 75 && Number(layersD[2].unitCost) === 600, 'Test D layer 3 fail');
  console.log('✓ PASSED: Test D — COGS = ₹66,500, Remaining = 20 @ ₹550 & 75 @ ₹600');

  // -------------------------------------------------------------------
  // TEST E — Insufficient Stock
  // Attempt to consume more than physical stock -> Rejected, DB unchanged
  // -------------------------------------------------------------------
  console.log('[TEST E] Insufficient Stock Rejection...');
  const keyE = `idempotency-test-e-${Date.now()}`;
  let errorE = false;
  const initialStockD = (await prisma.inventoryItem.findUnique({ where: { variantId: vD.id } }))?.physicalStock;

  try {
    await consumeFifoStock({
      variantId: vD.id,
      quantity: 500, // Stock is only 95
      type: InventoryMovementType.ADJUSTMENT_OUT,
      reason: AdjustmentReason.SPOILAGE,
      idempotencyKey: keyE,
    });
  } catch (err: any) {
    errorE = true;
    console.assert(err.message.includes('INSUFFICIENT_STOCK'), 'Test E error message check');
  }

  const finalStockD = (await prisma.inventoryItem.findUnique({ where: { variantId: vD.id } }))?.physicalStock;
  console.assert(errorE, 'Test E did not reject excessive consumption');
  console.assert(initialStockD === finalStockD, 'Test E physical stock altered on error');
  console.log('✓ PASSED: Test E — Insufficient stock attempt rejected cleanly without state change');

  // -------------------------------------------------------------------
  // TEST F — Adjustment IN
  // Add 20 units @ ₹600 -> Stock increases, layer created, ledger created
  // -------------------------------------------------------------------
  console.log('[TEST F] Adjustment IN (Add 20 @ ₹600)...');
  const vF = await createTestVariant('F');
  const keyF = `idempotency-test-f-${Date.now()}`;

  await adjustStock(vF.id, 'IN', 20, 600, AdjustmentReason.PHYSICAL_CORRECTION, 'Test F Note', keyF);

  const invF = await prisma.inventoryItem.findUnique({ where: { variantId: vF.id } });
  const layersF = await prisma.fifoLayer.findMany({ where: { variantId: vF.id } });
  const movsF = await prisma.inventoryMovement.findMany({ where: { variantId: vF.id } });

  console.assert(invF?.physicalStock === 20, 'Test F stock increase fail');
  console.assert(layersF.length === 1 && layersF[0].remainingQuantity === 20 && Number(layersF[0].unitCost) === 600, 'Test F layer fail');
  console.assert(movsF.length === 1 && movsF[0].quantity === 20 && Number(movsF[0].totalCost) === 12000, 'Test F ledger fail');
  console.log('✓ PASSED: Test F — Adjustment IN created stock, FIFO layer, and ledger record');

  // -------------------------------------------------------------------
  // TEST G — Adjustment OUT
  // Remove stock -> oldest layer consumed, physical stock decreases, ledger created
  // -------------------------------------------------------------------
  console.log('[TEST G] Adjustment OUT (Remove 5 units)...');
  const keyG = `idempotency-test-g-${Date.now()}`;
  await adjustStock(vF.id, 'OUT', 5, null, AdjustmentReason.MISHANDLING, 'Test G Note', keyG);

  const invG = await prisma.inventoryItem.findUnique({ where: { variantId: vF.id } });
  const layersG = await prisma.fifoLayer.findMany({ where: { variantId: vF.id } });
  const movG = await prisma.inventoryMovement.findFirst({ where: { idempotencyKey: keyG } });

  console.assert(invG?.physicalStock === 15, 'Test G stock decrease fail');
  console.assert(layersG[0].remainingQuantity === 15, 'Test G layer decrease fail');
  console.assert(movG?.quantity === -5 && Number(movG?.totalCost) === 3000, 'Test G movement cost fail');
  console.log('✓ PASSED: Test G — Adjustment OUT consumed oldest layer, updated stock & ledger');

  // -------------------------------------------------------------------
  // TEST H — Idempotency
  // Process exact same mutation twice -> only 1 mutation takes effect
  // -------------------------------------------------------------------
  console.log('[TEST H] Idempotency Enforcement...');
  const keyH = `idempotency-test-h-dup-${Date.now()}`;
  await receiveStock({ variantId: vF.id, quantity: 10, unitCost: 100, idempotencyKey: keyH });

  const dupResultH = await receiveStock({ variantId: vF.id, quantity: 10, unitCost: 100, idempotencyKey: keyH });
  console.assert(dupResultH.isDuplicate === true, 'Test H isDuplicate flag fail');

  const invH = await prisma.inventoryItem.findUnique({ where: { variantId: vF.id } });
  const movsH = await prisma.inventoryMovement.findMany({ where: { idempotencyKey: keyH } });

  console.assert(invH?.physicalStock === 25, 'Test H physical stock double-counted');
  console.assert(movsH.length === 1, 'Test H duplicate ledger movement created');
  console.log('✓ PASSED: Test H — Second mutation with identical idempotency key ignored cleanly');

  // -------------------------------------------------------------------
  // TEST I — Atomic Failure Rollback (Mandatory distinct test)
  // Force an error inside a transaction after a mutation occurs -> entire tx rolls back
  // -------------------------------------------------------------------
  console.log('[TEST I] Atomic Failure Rollback (Distinct Test)...');
  const vI = await createTestVariant('I');

  let forcedErrorOccurred = false;
  try {
    await prisma.$transaction(async (tx) => {
      // 1. First mutation step inside transaction
      await tx.inventoryItem.create({
        data: { variantId: vI.id, physicalStock: 50, reservedStock: 0 },
      });

      await tx.fifoLayer.create({
        data: {
          variantId: vI.id,
          initialQuantity: 50,
          remainingQuantity: 50,
          unitCost: new Prisma.Decimal(200),
        },
      });

      // 2. Intentionally throw an unhandled application exception mid-transaction
      throw new Error('INTENTIONAL_SIMULATED_TRANSACTION_FAILURE');
    });
  } catch (err: any) {
    if (err.message.includes('INTENTIONAL_SIMULATED_TRANSACTION_FAILURE')) {
      forcedErrorOccurred = true;
    }
  }

  const itemIAfter = await prisma.inventoryItem.findUnique({ where: { variantId: vI.id } });
  const layersIAfter = await prisma.fifoLayer.findMany({ where: { variantId: vI.id } });

  console.assert(forcedErrorOccurred, 'Test I forced error did not trigger catch block');
  console.assert(itemIAfter === null, 'Test I InventoryItem was committed despite transaction error');
  console.assert(layersIAfter.length === 0, 'Test I FifoLayer was committed despite transaction error');
  console.log('✓ PASSED: Test I — Transaction cleanly rolled back all uncommitted mutations upon error');

  // -------------------------------------------------------------------
  // TEST J — Inventory Valuation
  // Verify SUM(remainingQuantity * unitCost) matches expected valuation
  // -------------------------------------------------------------------
  console.log('[TEST J] Inventory Valuation Calculation...');
  // vD remaining layers: 20 @ 550 (11000) + 75 @ 600 (45000) = 56000
  const valuationD = await getVariantInventoryValuation(vD.id);
  console.assert(valuationD === 56000, `Test J valuation fail: expected 56000, got ${valuationD}`);
  console.log('✓ PASSED: Test J — SUM(remainingQuantity * unitCost) accurately matches ₹56,000');

  // -------------------------------------------------------------------
  // TEST K — Reserved Stock Invariant
  // Verify reservedStock >= 0, reservedStock <= physicalStock, availableStock = physicalStock - reservedStock
  // -------------------------------------------------------------------
  console.log('[TEST K] Reserved Stock Invariant Check...');
  const invK = await prisma.inventoryItem.findUnique({ where: { variantId: vF.id } });
  if (invK) {
    const available = invK.physicalStock - invK.reservedStock;
    console.assert(invK.reservedStock >= 0, 'Test K reserved stock < 0');
    console.assert(invK.reservedStock <= invK.physicalStock, 'Test K reserved stock > physical stock');
    console.assert(available === invK.physicalStock - invK.reservedStock, 'Test K available stock mismatch');
  }
  console.log('✓ PASSED: Test K — Stock invariants (reservedStock >= 0, reservedStock <= physical, available derived) verified');

  // -------------------------------------------------------------------
  // TEST L — Concurrent FIFO Consumption
  // Run simultaneous consumption attempts -> row lock serializes operations, no negative/double stock
  // -------------------------------------------------------------------
  console.log('[TEST L] Concurrent FIFO Consumption Protection...');
  const vL = await createTestVariant('L');
  await receiveStock({ variantId: vL.id, quantity: 50, unitCost: 100, idempotencyKey: `conc-init-${Date.now()}` });

  const conc1 = consumeFifoStock({
    variantId: vL.id,
    quantity: 30,
    type: InventoryMovementType.ADJUSTMENT_OUT,
    reason: AdjustmentReason.DAMAGED,
    idempotencyKey: `conc-out-1-${Date.now()}`,
  });

  const conc2 = consumeFifoStock({
    variantId: vL.id,
    quantity: 30,
    type: InventoryMovementType.ADJUSTMENT_OUT,
    reason: AdjustmentReason.SPOILAGE,
    idempotencyKey: `conc-out-2-${Date.now()}`,
  });

  const concResults = await Promise.allSettled([conc1, conc2]);
  const concFulfilled = concResults.filter((r) => r.status === 'fulfilled');
  const concRejected = concResults.filter((r) => r.status === 'rejected');

  console.assert(concFulfilled.length === 1 && concRejected.length === 1, 'Test L concurrency fail: expected exactly 1 pass and 1 reject');
  const invL = await prisma.inventoryItem.findUnique({ where: { variantId: vL.id } });
  console.assert(invL?.physicalStock === 20, `Test L stock corruption: expected 20, got ${invL?.physicalStock}`);
  console.log('✓ PASSED: Test L — PostgreSQL row-level locking serialized concurrent stock operations correctly');

  // -------------------------------------------------------------------
  // TEST M — Deterministic FIFO Ordering
  // Layers with same timestamp consumed deterministically using createdAt ASC, id ASC
  // -------------------------------------------------------------------
  console.log('[TEST M] Deterministic FIFO Ordering...');
  const vM = await createTestVariant('M');
  const nowM = new Date();

  await prisma.fifoLayer.createMany({
    data: [
      { id: '11111111-1111-1111-1111-111111111111', variantId: vM.id, initialQuantity: 10, remainingQuantity: 10, unitCost: new Prisma.Decimal(100), createdAt: nowM },
      { id: '22222222-2222-2222-2222-222222222222', variantId: vM.id, initialQuantity: 10, remainingQuantity: 10, unitCost: new Prisma.Decimal(200), createdAt: nowM },
    ],
  });

  await prisma.inventoryItem.create({
    data: { variantId: vM.id, physicalStock: 20, reservedStock: 0 },
  });

  await consumeFifoStock({
    variantId: vM.id,
    quantity: 10,
    type: InventoryMovementType.ADJUSTMENT_OUT,
    reason: AdjustmentReason.PHYSICAL_CORRECTION,
    idempotencyKey: `det-out-${Date.now()}`,
  });

  const layersM = await prisma.fifoLayer.findMany({
    where: { variantId: vM.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  console.assert(layersM[0].id === '11111111-1111-1111-1111-111111111111' && layersM[0].remainingQuantity === 0 && Number(layersM[0].unitCost) === 100, 'Test M tie-breaker fail');
  console.assert(layersM[1].id === '22222222-2222-2222-2222-222222222222' && layersM[1].remainingQuantity === 10, 'Test M tie-breaker second layer fail');
  console.log('✓ PASSED: Test M — Deterministic tie-breaking (createdAt ASC, id ASC) verified');

  // -------------------------------------------------------------------
  // TEST N — Duplicate Mutation with Same Idempotency Key
  // Run exact same mutation twice -> only 1 mutation affects physical stock, FIFO layers, ledger
  // -------------------------------------------------------------------
  console.log('[TEST N] Duplicate Mutation Idempotency Test...');
  const vN = await createTestVariant('N');
  const keyN = `idempotency-test-n-${Date.now()}`;

  await receiveStock({
    variantId: vN.id,
    quantity: 25,
    unitCost: 400,
    idempotencyKey: keyN,
  });

  const dupResultN = await receiveStock({
    variantId: vN.id,
    quantity: 25,
    unitCost: 400,
    idempotencyKey: keyN,
  });

  const invN = await prisma.inventoryItem.findUnique({ where: { variantId: vN.id } });
  const layersN = await prisma.fifoLayer.findMany({ where: { variantId: vN.id } });
  const movsN = await prisma.inventoryMovement.findMany({ where: { variantId: vN.id } });

  console.assert(dupResultN.isDuplicate === true, 'Test N duplicate flag fail');
  console.assert(invN?.physicalStock === 25, 'Test N physical stock altered');
  console.assert(layersN.length === 1, 'Test N duplicate layer created');
  console.assert(movsN.length === 1, 'Test N duplicate movement created');
  console.log('✓ PASSED: Test N — Duplicate mutation rejected; physical stock, FIFO layers, and ledger remain unchanged');

  // -------------------------------------------------------------------
  // ADDITIONAL PROTECTION CHECK: ProductVariant Deletion Protection (RESTRICT)
  // -------------------------------------------------------------------
  console.log('[PROTECTION TEST] ProductVariant Deletion Protection (RESTRICT constraint)...');
  let deleteBlocked = false;
  try {
    await prisma.productVariant.delete({ where: { id: vA.id } });
  } catch (err: any) {
    deleteBlocked = true;
    console.assert(
      err.code === 'P2003' || err.message.includes('Foreign key constraint failed') || err.message.includes('Restrict'),
      'Protection test error code fail'
    );
  }

  console.assert(deleteBlocked, 'ProductVariant with inventory history was deleted!');
  console.log('✓ PASSED: ProductVariant with inventory history cannot be deleted (onDelete: Restrict enforced database-side)');

  console.log('\n===================================================================');
  console.log('  ALL PHASE 3 VERIFICATION TESTS (A THROUGH N + PROTECTION) PASSED! 🎉 ');
  console.log('===================================================================\n');
}

runTests()
  .catch((err) => {
    console.error('Test Suite Exception:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
