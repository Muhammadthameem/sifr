import { prisma } from '../lib/db/prisma';
import { receiveStock, consumeFifoStock } from '../lib/inventory/fifo-engine';
import {
  createReturnRequest,
  approveReturnRequest,
  recordPhysicalReceipt,
  processIncrementalInspection,
  approveSameProductExchange,
} from '../lib/returns/return-engine';
import { ReturnReason, ExchangeItemStatus } from '@prisma/client';

async function runAcceptanceTest7() {
  console.log('================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 7 — SAME-PRODUCT EXCHANGE');
  console.log('================================================================\n');

  const timestamp = Date.now();

  // 1. SETUP CATALOG: PRODUCT 1 (2 VARIANTS: A & B) & PRODUCT 2 (VARIANT C)
  console.log('--- Step 1: Create Products & Variants (Same-Product vs Different-Product) ---');
  const category = await prisma.category.create({
    data: { name: `Acc7 Cat ${timestamp}`, slug: `acc7-cat-${timestamp}` },
  });

  // Product 1: Oxford Shirt
  const product1 = await prisma.product.create({
    data: { name: `Oxford Shirt ${timestamp}`, slug: `oxford-shirt-${timestamp}`, categoryId: category.id, status: 'ACTIVE' },
  });
  const variantA = await prisma.productVariant.create({
    data: { productId: product1.id, title: 'Oxford Shirt / M', sku: `OXF-M-${timestamp}`, mrp: 2000, sellingPrice: 1500, costPrice: 700 },
  });
  const variantB = await prisma.productVariant.create({
    data: { productId: product1.id, title: 'Oxford Shirt / L', sku: `OXF-L-${timestamp}`, mrp: 2000, sellingPrice: 1500, costPrice: 700 },
  });

  // Product 2: Linen Pants (Different Product for Negative Validation)
  const product2 = await prisma.product.create({
    data: { name: `Linen Pants ${timestamp}`, slug: `linen-pants-${timestamp}`, categoryId: category.id, status: 'ACTIVE' },
  });
  const variantC = await prisma.productVariant.create({
    data: { productId: product2.id, title: 'Linen Pants / M', sku: `LNN-M-${timestamp}`, mrp: 2500, sellingPrice: 2000, costPrice: 1000 },
  });

  // Receive stock for Variant A (10 units), Variant B (10 units), Variant C (10 units)
  await receiveStock({ variantId: variantA.id, quantity: 10, unitCost: 700, idempotencyKey: `rec-a-${timestamp}` });
  await receiveStock({ variantId: variantB.id, quantity: 10, unitCost: 700, idempotencyKey: `rec-b-${timestamp}` });
  await receiveStock({ variantId: variantC.id, quantity: 10, unitCost: 1000, idempotencyKey: `rec-c-${timestamp}` });

  console.log('  Product 1 ID:', product1.id, `(${product1.name})`);
  console.log('  Variant A (Original):', variantA.sku, `(Product: ${variantA.productId}, Price: ₹${Number(variantA.sellingPrice)})`);
  console.log('  Variant B (Same Product Replacement):', variantB.sku, `(Product: ${variantB.productId}, Price: ₹${Number(variantB.sellingPrice)})`);
  console.log('  Variant C (Different Product):', variantC.sku, `(Product: ${variantC.productId})`);

  // Verify Product IDs: Variant A & B have SAME product ID, Variant C has DIFFERENT product ID
  if (variantA.productId !== variantB.productId) throw new Error('Variant A and B must belong to same product!');
  if (variantA.productId === variantC.productId) throw new Error('Variant A and C must belong to different products!');

  // 2. CREATE DELIVERED TEST ORDER FOR VARIANT A
  console.log('\n--- Step 2: Create Delivered Test Order for 1 Unit of Variant A ---');
  const orderNumber = `ORD-ACC7-${timestamp}`;
  const customerMobile = '+919876543210';
  const guestAccessToken = `token-acc7-${timestamp}`;

  const testOrder = await prisma.order.create({
    data: {
      orderNumber,
      salesChannel: 'ONLINE',
      status: 'DELIVERED',
      deliveredAt: new Date(),
      customerNameSnapshot: 'Test Acceptance 7 Customer',
      customerMobileSnapshot: customerMobile,
      guestAccessToken,
      guestAccessTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      subtotal: 1500,
      discountTotal: 0,
      shippingFee: 100,
      taxTotal: 0,
      grandTotal: 1600,
      paymentStatus: 'PAID',
      items: {
        create: [
          {
            variantId: variantA.id,
            productNameSnapshot: product1.name,
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
    referenceId: testOrder.id,
    type: 'SALE_OUT',
    idempotencyKey: `ord-sale-${testOrder.id}`,
  });

  const invABefore = await prisma.inventoryItem.findUnique({ where: { variantId: variantA.id } });
  const invBBefore = await prisma.inventoryItem.findUnique({ where: { variantId: variantB.id } });

  console.log('  Variant A Physical Stock After Sale:', invABefore?.physicalStock);
  console.log('  Variant B Physical Stock Before Exchange:', invBBefore?.physicalStock);
  console.log('  Variant B Reserved Stock Before Exchange:', invBBefore?.reservedStock);
  console.log('  Variant B Available Stock Before Exchange:', (invBBefore?.physicalStock || 0) - (invBBefore?.reservedStock || 0));

  // 3. RETURN & RESTOCK VARIANT A
  console.log('\n--- Step 3: Return, Approve & Restock Variant A ---');
  const retRes = await createReturnRequest({
    orderId: testOrder.id,
    reason: ReturnReason.SIZE_FIT_ISSUE,
    reasonDetails: 'Size M too tight, want Size L',
    items: [{ orderItemId: testOrder.items[0].id, quantityRequested: 1 }],
    submissionIdempotencyKey: `sub-acc7-${timestamp}`,
    guestAccessToken,
    customerMobile,
  });

  const returnReq = retRes.returnRequest;
  await approveReturnRequest(returnReq.id, 'Approved for variant exchange');
  await recordPhysicalReceipt({
    returnRequestId: returnReq.id,
    idempotencyKey: `rcpt-acc7-${timestamp}`,
    items: [{ returnItemId: returnReq.items[0].id, quantityReceived: 1 }],
  });

  await processIncrementalInspection({
    returnRequestId: returnReq.id,
    idempotencyKey: `ins-acc7-${timestamp}`,
    items: [{ returnItemId: returnReq.items[0].id, quantityRestocked: 1, quantityDamaged: 0 }],
  });

  const invAAfterRestock = await prisma.inventoryItem.findUnique({ where: { variantId: variantA.id } });
  console.log('  Variant A Physical Stock Restored To:', invAAfterRestock?.physicalStock);

  if ((invAAfterRestock?.physicalStock || 0) !== (invABefore?.physicalStock || 0) + 1) {
    throw new Error('Variant A inventory physical stock was not restored correctly!');
  }

  // 4. NEGATIVE VALIDATION: DIFFERENT-PRODUCT REJECTION
  console.log('\n--- Step 4: Negative Validation (Attempt Exchange with Different Product) ---');
  let diffProductRejected = false;
  try {
    await approveSameProductExchange({
      returnRequestId: returnReq.id,
      returnItemId: returnReq.items[0].id,
      replacementVariantId: variantC.id, // Variant C belongs to Product 2
      quantity: 1,
    });
  } catch (err: any) {
    diffProductRejected = err.message.includes('CROSS_PRODUCT_EXCHANGE_DISALLOWED');
  }

  console.log('  Cross-Product Exchange Attempt Rejected Cleanly:', diffProductRejected);
  if (!diffProductRejected) {
    throw new Error('System failed to reject cross-product exchange!');
  }

  // 5. VALID SAME-PRODUCT EXCHANGE (VARIANT B)
  console.log('\n--- Step 5: Execute Valid Same-Product Exchange (Variant A -> Variant B) ---');
  const exchangeItem = await approveSameProductExchange({
    returnRequestId: returnReq.id,
    returnItemId: returnReq.items[0].id,
    replacementVariantId: variantB.id, // Variant B belongs to Product 1
    quantity: 1,
  });

  console.log('  ExchangeItem Created Successfully!');
  console.log('  Exchange ID:', exchangeItem.id);
  console.log('  Original Variant ID:', exchangeItem.originalVariantId);
  console.log('  Replacement Variant ID:', exchangeItem.replacementVariantId);
  console.log('  Exchange Status:', exchangeItem.status);
  console.log('  Original Unit Price:', Number(exchangeItem.originalUnitPrice));
  console.log('  Replacement Unit Price:', Number(exchangeItem.replacementUnitPrice));
  console.log('  Price Difference:', Number(exchangeItem.priceDifference));
  console.log('  Differential Payment ID:', exchangeItem.differentialPaymentId);

  // Assert ExchangeItem Invariants
  if (exchangeItem.status !== ExchangeItemStatus.RESERVED) {
    throw new Error(`Expected exchange status RESERVED, got ${exchangeItem.status}`);
  }
  if (Number(exchangeItem.priceDifference) !== 0) {
    throw new Error(`Expected equal-priced exchange priceDifference = 0, got ${exchangeItem.priceDifference}`);
  }
  if (exchangeItem.differentialPaymentId !== null && exchangeItem.differentialPaymentId !== undefined) {
    throw new Error('Differential Payment was created for equal-priced exchange!');
  }

  // 6. VERIFY REPLACEMENT STOCK RESERVATION INVARIANTS
  console.log('\n--- Step 6: Verify Replacement Stock Reservation Invariants ---');
  const invBAfter = await prisma.inventoryItem.findUnique({ where: { variantId: variantB.id } });

  const physBBefore = invBBefore?.physicalStock || 0;
  const resBBefore = invBBefore?.reservedStock || 0;
  const physBAfter = invBAfter?.physicalStock || 0;
  const resBAfter = invBAfter?.reservedStock || 0;
  const availBBefore = physBBefore - resBBefore;
  const availBAfter = physBAfter - resBAfter;

  console.log('  Replacement Physical Stock Before:', physBBefore);
  console.log('  Replacement Physical Stock After:', physBAfter);
  console.log('  Replacement Physical Stock Unchanged:', physBAfter === physBBefore);

  console.log('  Replacement Reserved Stock Before:', resBBefore);
  console.log('  Replacement Reserved Stock After:', resBAfter);
  console.log('  Replacement Reserved Stock Increased By Exactly +1:', resBAfter === resBBefore + 1);

  console.log('  Replacement Available Stock Before:', availBBefore);
  console.log('  Replacement Available Stock After:', availBAfter);
  console.log('  Replacement Available Stock Decreased By Exactly 1:', availBAfter === availBBefore - 1);

  if (physBAfter !== physBBefore) throw new Error('Replacement physical stock was incorrectly reduced during reservation!');
  if (resBAfter !== resBBefore + 1) throw new Error('Replacement reserved stock was not incremented by 1!');
  if (availBAfter !== availBBefore - 1) throw new Error('Available stock calculation is incorrect!');

  // Verify original Variant A is NOT reserved
  const invAAfterExchange = await prisma.inventoryItem.findUnique({ where: { variantId: variantA.id } });
  console.log('  Original Variant A Reserved Stock Unchanged (0):', invAAfterExchange?.reservedStock === 0);

  if (invAAfterExchange?.reservedStock !== 0) {
    throw new Error('Original returned Variant A was incorrectly reserved!');
  }

  // Verify NO SALE_OUT movement created during reservation
  const saleMovementsB = await prisma.inventoryMovement.findMany({
    where: { variantId: variantB.id, type: 'SALE_OUT', referenceId: returnReq.id },
  });
  console.log('  Zero Premature SALE_OUT Movements Created:', saleMovementsB.length === 0);

  if (saleMovementsB.length > 0) {
    throw new Error('Premature SALE_OUT movement created during exchange reservation!');
  }

  // Verify NO Refund created for equal-priced exchange
  const refunds = await prisma.refund.findMany({
    where: { returnRequestId: returnReq.id },
  });
  console.log('  Zero Refunds Created for Equal-Priced Exchange:', refunds.length === 0);

  if (refunds.length > 0) {
    throw new Error('Refund was prematurely created for equal-priced exchange!');
  }

  // 7. DUPLICATE PROTECTION CHECK
  console.log('\n--- Step 7: Duplicate Protection Check ---');
  let duplicateRejected = false;
  try {
    await approveSameProductExchange({
      returnRequestId: returnReq.id,
      returnItemId: returnReq.items[0].id,
      replacementVariantId: variantB.id,
      quantity: 1,
    });
  } catch (err: any) {
    duplicateRejected = err.message.includes('OrderItem has already been exchanged once');
  }
  console.log('  Duplicate Exchange Submission Rejected Cleanly:', duplicateRejected);
  if (!duplicateRejected) {
    throw new Error('System allowed duplicate exchange submission!');
  }

  // 8. VERIFY PERSISTENCE UPON RELOAD & DISPATCH READINESS
  console.log('\n--- Step 8: Persistence Check & Dispatch Readiness ---');
  const reloadedEx = await prisma.exchangeItem.findUnique({ where: { id: exchangeItem.id } });
  const reloadedInvB = await prisma.inventoryItem.findUnique({ where: { variantId: variantB.id } });

  console.log('  Persisted Exchange Status After Reload:', reloadedEx?.status);
  console.log('  Persisted Replacement Reserved Stock After Reload:', reloadedInvB?.reservedStock);
  console.log('  Ready for Later Dispatch Stage (RESERVED):', reloadedEx?.status === ExchangeItemStatus.RESERVED);

  if (reloadedEx?.status !== ExchangeItemStatus.RESERVED || reloadedInvB?.reservedStock !== resBAfter) {
    throw new Error('Exchange reservation state failed to persist upon reload!');
  }

  console.log('\n================================================================');
  console.log('TEST 7 — Same-Product Exchange Report');
  console.log('================================================================');
  console.log('Fresh test data: PASS');
  console.log('Return submission: PASS');
  console.log('Return approval: PASS');
  console.log('Physical receipt/restocking: PASS');
  console.log('Same-product validation: PASS');
  console.log('Different-product rejection: PASS');
  console.log('ExchangeItem creation: PASS');
  console.log('Replacement reservation: PASS');
  console.log('Physical stock unchanged: PASS');
  console.log('Reserved stock +1: PASS');
  console.log('Available stock calculation: PASS');
  console.log('No premature SALE_OUT: PASS');
  console.log('No refund: PASS');
  console.log('No differential payment: PASS');
  console.log('Exchange status RESERVED: PASS');
  console.log('Duplicate protection: PASS');
  console.log('Persistence after reload: PASS');
  console.log('Ready for dispatch: PASS');
  console.log('Unexpected issues: None');
  console.log('================================================================\n');
}

runAcceptanceTest7().catch((err) => {
  console.error('FATAL ACCEPTANCE TEST 7 FAILURE:', err);
  process.exit(1);
});

