import { prisma } from '../lib/db/prisma';
import { receiveStock, consumeFifoStock } from '../lib/inventory/fifo-engine';
import {
  createReturnRequest,
  approveReturnRequest,
  recordPhysicalReceipt,
  processIncrementalInspection,
  approveSameProductExchange,
  dispatchExchangeItem,
  cancelExchangeItem,
} from '../lib/returns/return-engine';
import { ReturnReason, ExchangeItemStatus, PaymentAttemptStatus } from '@prisma/client';

async function runRegressionSuite() {
  console.log('================================================================');
  console.log('PHASE 9 REGRESSION TEST — EXCHANGE DISPATCH FIFO & SALE_OUT');
  console.log('================================================================\n');

  const timestamp = Date.now();

  // 1. CREATE CATALOG WITH MULTIPLE FIFO LAYERS FOR REPLACEMENT VARIANT
  console.log('--- Step 1: Create Product with Multiple FIFO Layers for Variant B ---');
  const category = await prisma.category.create({
    data: { name: `FifoReg Cat ${timestamp}`, slug: `fiforeg-cat-${timestamp}` },
  });

  const product = await prisma.product.create({
    data: { name: `Shirt FifoReg ${timestamp}`, slug: `shirt-fiforeg-${timestamp}`, categoryId: category.id, status: 'ACTIVE' },
  });

  const variantA = await prisma.productVariant.create({
    data: { productId: product.id, title: 'Shirt / M', sku: `SKU-FIFO-A-${timestamp}`, mrp: 2000, sellingPrice: 1500, costPrice: 700 },
  });

  const variantB = await prisma.productVariant.create({
    data: { productId: product.id, title: 'Shirt / L', sku: `SKU-FIFO-B-${timestamp}`, mrp: 2500, sellingPrice: 2000, costPrice: 900 },
  });

  // Layer 1 for Variant B: 2 units @ ₹400
  const layer1Res = await receiveStock({
    variantId: variantB.id,
    quantity: 2,
    unitCost: 400,
    idempotencyKey: `rec-fiforeg-b1-${timestamp}`,
  });
  const layer1Id = layer1Res.layer!.id;

  // Layer 2 for Variant B: 3 units @ ₹500
  const layer2Res = await receiveStock({
    variantId: variantB.id,
    quantity: 3,
    unitCost: 500,
    idempotencyKey: `rec-fiforeg-b2-${timestamp}`,
  });
  const layer2Id = layer2Res.layer!.id;

  // Variant A stock receiving: 10 units @ ₹700
  await receiveStock({
    variantId: variantA.id,
    quantity: 10,
    unitCost: 700,
    idempotencyKey: `rec-fiforeg-a-${timestamp}`,
  });

  console.log('  Variant B Total Initial Stock: 5 (Layer 1: 2 @ ₹400, Layer 2: 3 @ ₹500)');

  // 2. CREATE DELIVERED PAID ORDER FOR VARIANT A
  console.log('\n--- Step 2: Create Delivered Order & Complete Return/Restock ---');
  const order = await prisma.order.create({
    data: {
      orderNumber: `ORD-FIFOREG-${timestamp}`,
      salesChannel: 'ONLINE',
      status: 'DELIVERED',
      deliveredAt: new Date(),
      customerNameSnapshot: 'Fifo Test Customer',
      customerMobileSnapshot: '+919876543210',
      subtotal: 1500,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 0,
      grandTotal: 1500,
      paymentStatus: 'PAID',
      items: {
        create: [
          {
            variantId: variantA.id,
            productNameSnapshot: product.name,
            variantTitleSnapshot: variantA.title,
            skuSnapshot: variantA.sku,
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
    variantId: variantA.id,
    quantity: 1,
    referenceId: order.id,
    type: 'SALE_OUT',
    idempotencyKey: `fiforeg-sale-${order.id}`,
  });

  const retRes = await createReturnRequest({
    orderId: order.id,
    reason: ReturnReason.DEFECTIVE,
    reasonDetails: 'FIFO dispatch regression test',
    items: [{ orderItemId: order.items[0].id, quantityRequested: 1 }],
    submissionIdempotencyKey: `sub-fiforeg-${timestamp}`,
    customerMobile: '+919876543210',
  });

  const returnReq = retRes.returnRequest;
  await approveReturnRequest(returnReq.id, 'Approve for FIFO test');
  await recordPhysicalReceipt({
    returnRequestId: returnReq.id,
    idempotencyKey: `rcpt-fiforeg-${timestamp}`,
    items: [{ returnItemId: returnReq.items[0].id, quantityReceived: 1 }],
  });

  await processIncrementalInspection({
    returnRequestId: returnReq.id,
    idempotencyKey: `ins-fiforeg-${timestamp}`,
    items: [{ returnItemId: returnReq.items[0].id, quantityRestocked: 1, quantityDamaged: 0 }],
  });

  // 3. INITIATE SAME-PRODUCT EXCHANGE & PAY DIFFERENTIAL
  console.log('\n--- Step 3: Initiate Exchange & Pay Differential ---');
  const exItem = await approveSameProductExchange({
    returnRequestId: returnReq.id,
    returnItemId: returnReq.items[0].id,
    replacementVariantId: variantB.id,
    quantity: 3, // Request 3 units to span across Layer 1 (2 units) & Layer 2 (1 unit)
  });

  const invBAfterRes = await prisma.inventoryItem.findUnique({ where: { variantId: variantB.id } });
  console.log('  Variant B physicalStock after reservation:', invBAfterRes?.physicalStock);
  console.log('  Variant B reservedStock after reservation:', invBAfterRes?.reservedStock);

  if (invBAfterRes?.physicalStock !== 5 || invBAfterRes?.reservedStock !== 3) {
    throw new Error('Reservation counting error!');
  }

  // Pay differential
  await prisma.payment.update({
    where: { id: exItem.differentialPaymentId! },
    data: { status: PaymentAttemptStatus.SUCCESS, completedAt: new Date() },
  });

  // 4. DISPATCH EXCHANGE & VERIFY FIFO CONSUMPTION
  console.log('\n--- Step 4: Dispatch Exchange & Verify FIFO Consumption ---');
  const dispatchedEx = await dispatchExchangeItem(exItem.id);

  const invBAfterDisp = await prisma.inventoryItem.findUnique({ where: { variantId: variantB.id } });
  console.log('  Variant B physicalStock after dispatch:', invBAfterDisp?.physicalStock);
  console.log('  Variant B reservedStock after dispatch:', invBAfterDisp?.reservedStock);
  console.log('  Variant B availableStock after dispatch:', (invBAfterDisp?.physicalStock || 0) - (invBAfterDisp?.reservedStock || 0));

  if (invBAfterDisp?.physicalStock !== 2 || invBAfterDisp?.reservedStock !== 0) {
    throw new Error('Dispatch stock deduction error!');
  }

  // Verify InventoryMovement SALE_OUT created
  const saleMovements = await prisma.inventoryMovement.findMany({
    where: { variantId: variantB.id, type: 'SALE_OUT', referenceId: exItem.id },
  });

  console.log('  SALE_OUT movements for exchange dispatch:', saleMovements.length);
  if (saleMovements.length !== 1) throw new Error('Expected exactly 1 SALE_OUT movement for exchange dispatch!');

  const movement = saleMovements[0];
  console.log('  Movement quantity:', movement.quantity);
  console.log('  Movement totalCost:', Number(movement.totalCost));
  console.log('  Movement consumedLayersJson:', movement.consumedLayersJson);

  if (!movement.consumedLayersJson) throw new Error('consumedLayersJson is missing from SALE_OUT movement!');

  const consumedLayers = JSON.parse(movement.consumedLayersJson);
  console.log('  Parsed consumedLayersDetails:', consumedLayers);

  // Expected FIFO consumption:
  // Layer 1 (2 units @ ₹400 = ₹800)
  // Layer 2 (1 unit @ ₹500 = ₹500)
  // Total FIFO Cost = ₹1,300
  if (consumedLayers.length !== 2) throw new Error('Expected 2 layer entries in consumedLayersJson!');
  if (consumedLayers[0].layerId !== layer1Id || consumedLayers[0].quantity !== 2 || consumedLayers[0].unitCost !== 400) {
    throw new Error('Layer 1 FIFO consumption mismatch!');
  }
  if (consumedLayers[1].layerId !== layer2Id || consumedLayers[1].quantity !== 1 || consumedLayers[1].unitCost !== 500) {
    throw new Error('Layer 2 FIFO consumption mismatch!');
  }
  if (Number(movement.totalCost) !== 1300) {
    throw new Error(`Expected totalCost = 1300, got ${movement.totalCost}`);
  }

  // Verify layer remaining quantities in DB
  const layer1DB = await prisma.fifoLayer.findUnique({ where: { id: layer1Id } });
  const layer2DB = await prisma.fifoLayer.findUnique({ where: { id: layer2Id } });

  console.log('  Layer 1 remainingQuantity after dispatch:', layer1DB?.remainingQuantity);
  console.log('  Layer 2 remainingQuantity after dispatch:', layer2DB?.remainingQuantity);

  if (layer1DB?.remainingQuantity !== 0 || layer2DB?.remainingQuantity !== 2) {
    throw new Error('FIFO Layer remainingQuantity in DB was not updated correctly!');
  }

  // 5. VERIFY IDEMPOTENCY OF RE-DISPATCH
  console.log('\n--- Step 5: Verify Idempotency of Re-Dispatch ---');
  let duplicateBlocked = false;
  try {
    await dispatchExchangeItem(exItem.id);
  } catch (err: any) {
    duplicateBlocked = err.message.includes('ExchangeItem is in state');
  }

  console.log('  Duplicate Dispatch Rejection Clean:', duplicateBlocked);
  if (!duplicateBlocked) throw new Error('System allowed duplicate exchange dispatch!');

  const invBAfterDup = await prisma.inventoryItem.findUnique({ where: { variantId: variantB.id } });
  const saleMovsDup = await prisma.inventoryMovement.findMany({
    where: { variantId: variantB.id, type: 'SALE_OUT', referenceId: exItem.id },
  });

  if (invBAfterDup?.physicalStock !== 2 || saleMovsDup.length !== 1) {
    throw new Error('Duplicate dispatch mutated stock or created duplicate movements!');
  }

  // 6. VERIFY CANCELLATION SAFETY (SEPARATE ISOLATED EXCHANGE)
  console.log('\n--- Step 6: Verify Cancellation Safety ---');
  const tsCancel = timestamp + 500;
  const orderCancel = await prisma.order.create({
    data: {
      orderNumber: `ORD-CANCEL-${tsCancel}`,
      salesChannel: 'ONLINE',
      status: 'DELIVERED',
      deliveredAt: new Date(),
      customerNameSnapshot: 'Cancel Test Customer',
      customerMobileSnapshot: '+919876543210',
      subtotal: 1500,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 0,
      grandTotal: 1500,
      paymentStatus: 'PAID',
      items: {
        create: [
          {
            variantId: variantA.id,
            productNameSnapshot: product.name,
            variantTitleSnapshot: variantA.title,
            skuSnapshot: variantA.sku,
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
    variantId: variantA.id,
    quantity: 1,
    referenceId: orderCancel.id,
    type: 'SALE_OUT',
    idempotencyKey: `cancel-sale-${orderCancel.id}`,
  });

  const retCancelRes = await createReturnRequest({
    orderId: orderCancel.id,
    reason: ReturnReason.DEFECTIVE,
    reasonDetails: 'Cancel safety test',
    items: [{ orderItemId: orderCancel.items[0].id, quantityRequested: 1 }],
    submissionIdempotencyKey: `sub-cancel-${tsCancel}`,
    customerMobile: '+919876543210',
  });

  const retCancel = retCancelRes.returnRequest;
  await approveReturnRequest(retCancel.id, 'Approve for cancel test');
  await recordPhysicalReceipt({
    returnRequestId: retCancel.id,
    idempotencyKey: `rcpt-cancel-${tsCancel}`,
    items: [{ returnItemId: retCancel.items[0].id, quantityReceived: 1 }],
  });

  await processIncrementalInspection({
    returnRequestId: retCancel.id,
    idempotencyKey: `ins-cancel-${tsCancel}`,
    items: [{ returnItemId: retCancel.items[0].id, quantityRestocked: 1, quantityDamaged: 0 }],
  });

  const exCancelItem = await approveSameProductExchange({
    returnRequestId: retCancel.id,
    returnItemId: retCancel.items[0].id,
    replacementVariantId: variantB.id,
    quantity: 1,
  });

  const invBBeforeCancel = await prisma.inventoryItem.findUnique({ where: { variantId: variantB.id } });
  console.log('  Variant B physicalStock before cancellation:', invBBeforeCancel?.physicalStock);
  console.log('  Variant B reservedStock before cancellation:', invBBeforeCancel?.reservedStock);

  const cancelledEx = await cancelExchangeItem(exCancelItem.id);
  const invBAfterCancel = await prisma.inventoryItem.findUnique({ where: { variantId: variantB.id } });

  console.log('  Cancelled Exchange Status:', cancelledEx.status);
  console.log('  Variant B physicalStock after cancellation:', invBAfterCancel?.physicalStock);
  console.log('  Variant B reservedStock after cancellation:', invBAfterCancel?.reservedStock);

  if (invBAfterCancel?.physicalStock !== invBBeforeCancel?.physicalStock) {
    throw new Error('Cancellation incorrectly altered physicalStock!');
  }
  if (invBAfterCancel?.reservedStock !== (invBBeforeCancel?.reservedStock || 1) - 1) {
    throw new Error('Cancellation did not release reservedStock!');
  }

  const cancelSaleMovs = await prisma.inventoryMovement.findMany({
    where: { variantId: variantB.id, type: 'SALE_OUT', referenceId: exCancelItem.id },
  });
  if (cancelSaleMovs.length > 0) throw new Error('Cancellation created a SALE_OUT movement!');

  // 7. PERSISTENCE CHECK UPON RELOAD
  console.log('\n--- Step 7: Persistence Check Upon Reload ---');
  const reloadedEx = await prisma.exchangeItem.findUnique({ where: { id: exItem.id } });
  const reloadedCancelEx = await prisma.exchangeItem.findUnique({ where: { id: exCancelItem.id } });

  if (reloadedEx?.status !== ExchangeItemStatus.DISPATCHED || reloadedCancelEx?.status !== ExchangeItemStatus.CANCELLED) {
    throw new Error('State failed to persist upon reload!');
  }

  console.log('\n================================================================');
  console.log('PHASE 9 REGRESSION TEST PASSED ALL CHECKS!');
  console.log('================================================================\n');
}

runRegressionSuite().catch((err) => {
  console.error('FATAL REGRESSION SUITE FAILURE:', err);
  process.exit(1);
});
