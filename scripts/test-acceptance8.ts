import { prisma } from '../lib/db/prisma';
import { receiveStock, consumeFifoStock } from '../lib/inventory/fifo-engine';
import {
  createReturnRequest,
  approveReturnRequest,
  recordPhysicalReceipt,
  processIncrementalInspection,
  approveSameProductExchange,
  dispatchExchangeItem,
} from '../lib/returns/return-engine';
import { ReturnReason, ExchangeItemStatus, PaymentPurpose, PaymentAttemptStatus } from '@prisma/client';

async function runAcceptanceTest8() {
  console.log('================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 8 — HIGHER-PRICE EXCHANGE / DIFFERENTIAL PAYMENT');
  console.log('================================================================\n');

  const timestamp = Date.now();

  // 1. SETUP CATALOG: PRODUCT 1 WITH VARIANT A (₹1,500) & VARIANT B (₹2,000)
  console.log('--- Step 1: Create Product & Variants (Variant A ₹1,500 vs Variant B ₹2,000) ---');
  const category = await prisma.category.create({
    data: { name: `Acc8 Cat ${timestamp}`, slug: `acc8-cat-${timestamp}` },
  });

  const product = await prisma.product.create({
    data: { name: `Oxford Shirt Premium ${timestamp}`, slug: `oxford-shirt-prem-${timestamp}`, categoryId: category.id, status: 'ACTIVE' },
  });

  const variantA = await prisma.productVariant.create({
    data: { productId: product.id, title: 'Oxford Shirt / M', sku: `OXF8-M-${timestamp}`, mrp: 2000, sellingPrice: 1500, costPrice: 700 },
  });

  const variantB = await prisma.productVariant.create({
    data: { productId: product.id, title: 'Oxford Shirt / L Premium', sku: `OXF8-L-${timestamp}`, mrp: 2500, sellingPrice: 2000, costPrice: 900 },
  });

  await receiveStock({ variantId: variantA.id, quantity: 10, unitCost: 700, idempotencyKey: `rec8-a-${timestamp}` });
  await receiveStock({ variantId: variantB.id, quantity: 10, unitCost: 900, idempotencyKey: `rec8-b-${timestamp}` });

  console.log('  Product ID:', product.id, `(${product.name})`);
  console.log('  Variant A (Original):', variantA.sku, `Price: ₹${Number(variantA.sellingPrice)}`);
  console.log('  Variant B (Higher-Price Replacement):', variantB.sku, `Price: ₹${Number(variantB.sellingPrice)}`);

  // Verify Same Product
  if (variantA.productId !== variantB.productId) {
    throw new Error('Variant A and Variant B must belong to the same Product!');
  }

  // 2. CREATE DELIVERED TEST ORDER FOR 1 UNIT OF VARIANT A
  console.log('\n--- Step 2: Create Delivered Test Order for 1 Unit of Variant A ---');
  const orderNumber = `ORD-ACC8-${timestamp}`;
  const customerMobile = '+919876543210';
  const guestAccessToken = `token-acc8-${timestamp}`;

  const testOrder = await prisma.order.create({
    data: {
      orderNumber,
      salesChannel: 'ONLINE',
      status: 'DELIVERED',
      deliveredAt: new Date(),
      customerNameSnapshot: 'Test Acceptance 8 Customer',
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
    referenceId: testOrder.id,
    type: 'SALE_OUT',
    idempotencyKey: `ord8-sale-${testOrder.id}`,
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
    reasonDetails: 'Upgrade to L Premium',
    items: [{ orderItemId: testOrder.items[0].id, quantityRequested: 1 }],
    submissionIdempotencyKey: `sub-acc8-${timestamp}`,
    guestAccessToken,
    customerMobile,
  });

  const returnReq = retRes.returnRequest;
  await approveReturnRequest(returnReq.id, 'Approved for higher-price exchange');
  await recordPhysicalReceipt({
    returnRequestId: returnReq.id,
    idempotencyKey: `rcpt-acc8-${timestamp}`,
    items: [{ returnItemId: returnReq.items[0].id, quantityReceived: 1 }],
  });

  await processIncrementalInspection({
    returnRequestId: returnReq.id,
    idempotencyKey: `ins-acc8-${timestamp}`,
    items: [{ returnItemId: returnReq.items[0].id, quantityRestocked: 1, quantityDamaged: 0 }],
  });

  const invAAfterRestock = await prisma.inventoryItem.findUnique({ where: { variantId: variantA.id } });
  console.log('  Variant A Physical Stock Restored To:', invAAfterRestock?.physicalStock);

  if ((invAAfterRestock?.physicalStock || 0) !== (invABefore?.physicalStock || 0) + 1) {
    throw new Error('Variant A inventory physical stock was not restored correctly!');
  }

  // 4. INITIATE HIGHER-PRICE EXCHANGE (VARIANT A -> VARIANT B)
  console.log('\n--- Step 4: Initiate Higher-Price Same-Product Exchange (Variant A -> Variant B) ---');
  const exchangeItem = await approveSameProductExchange({
    returnRequestId: returnReq.id,
    returnItemId: returnReq.items[0].id,
    replacementVariantId: variantB.id,
    quantity: 1,
  });

  console.log('  ExchangeItem Created Successfully!');
  console.log('  Exchange ID:', exchangeItem.id);
  console.log('  Original Unit Price: ₹', Number(exchangeItem.originalUnitPrice));
  console.log('  Replacement Unit Price: ₹', Number(exchangeItem.replacementUnitPrice));
  console.log('  Price Difference: ₹', Number(exchangeItem.priceDifference));
  console.log('  Differential Payment ID:', exchangeItem.differentialPaymentId);

  // Assert ExchangeItem Price Difference Invariants
  const originalPrice = Number(exchangeItem.originalUnitPrice);
  const replacementPrice = Number(exchangeItem.replacementUnitPrice);
  const diff = Number(exchangeItem.priceDifference);

  if (originalPrice !== 1500) throw new Error(`Expected originalUnitPrice = 1500, got ${originalPrice}`);
  if (replacementPrice !== 2000) throw new Error(`Expected replacementUnitPrice = 2000, got ${replacementPrice}`);
  if (diff !== 500) throw new Error(`Expected priceDifference = 500, got ${diff}`);
  if (!exchangeItem.differentialPaymentId) throw new Error('Differential payment record was not created for higher-priced exchange!');

  // 5. VERIFY DIFFERENTIAL PAYMENT RECORD INVARIANTS
  console.log('\n--- Step 5: Verify Differential Payment Invariants ---');
  const payment = await prisma.payment.findUnique({
    where: { id: exchangeItem.differentialPaymentId },
  });

  if (!payment) throw new Error('Differential Payment record not found in database!');

  console.log('  Payment Number:', payment.paymentNumber);
  console.log('  Payment Purpose:', payment.purpose);
  console.log('  Payment Amount: ₹', Number(payment.amount));
  console.log('  Payment Status:', payment.status);

  if (Number(payment.amount) !== 500) throw new Error(`Expected differential payment amount = 500, got ${payment.amount}`);
  if (payment.purpose !== PaymentPurpose.EXCHANGE_DIFFERENTIAL) {
    throw new Error(`Expected Payment.purpose = EXCHANGE_DIFFERENTIAL, got ${payment.purpose}`);
  }
  if (payment.orderId !== testOrder.id) throw new Error('Differential payment orderId mismatch!');
  if (payment.status !== PaymentAttemptStatus.INITIATED) {
    throw new Error(`Expected initial payment status INITIATED, got ${payment.status}`);
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

  // Verify NO SALE_OUT movement created during reservation
  const saleMovementsB = await prisma.inventoryMovement.findMany({
    where: { variantId: variantB.id, type: 'SALE_OUT', referenceId: returnReq.id },
  });
  console.log('  Zero Premature SALE_OUT Movements Created:', saleMovementsB.length === 0);
  if (saleMovementsB.length > 0) throw new Error('Premature SALE_OUT movement created during exchange reservation!');

  // Verify NO Refund created for higher-priced exchange
  const refunds = await prisma.refund.findMany({ where: { returnRequestId: returnReq.id } });
  console.log('  Zero Refunds Created for Higher-Priced Exchange:', refunds.length === 0);
  if (refunds.length > 0) throw new Error('Refund was prematurely created for higher-priced exchange!');

  // 7. VERIFY UNPAID PAYMENT BLOCKS DISPATCH
  console.log('\n--- Step 7: Verify Unpaid Differential Payment Blocks Dispatch ---');
  let dispatchBlocked = false;
  try {
    await dispatchExchangeItem(exchangeItem.id);
  } catch (err: any) {
    dispatchBlocked = err.message.includes('CANNOT_DISPATCH_UNPAID_EXCHANGE');
    console.log('  Observed Block Error:', err.message);
  }

  console.log('  Unpaid Payment Blocked Dispatch Successfully:', dispatchBlocked);
  if (!dispatchBlocked) throw new Error('System allowed dispatching exchange while differential payment was unpaid!');

  // 8. SIMULATE SUCCESSFUL DIFFERENTIAL PAYMENT
  console.log('\n--- Step 8: Simulate Successful Differential Payment ---');
  const updatedPayment = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: PaymentAttemptStatus.SUCCESS,
      providerPaymentId: `pay_mock_diff_${timestamp}`,
      completedAt: new Date(),
    },
  });

  console.log('  Payment Status Updated To:', updatedPayment.status);
  if (updatedPayment.status !== PaymentAttemptStatus.SUCCESS) {
    throw new Error('Failed to update differential payment status to SUCCESS!');
  }

  // 9. VERIFY EXCHANGE BECOMES DISPATCHABLE AFTER PAYMENT
  console.log('\n--- Step 9: Verify Exchange Eligibility For Dispatch ---');
  const exWithPayment = await prisma.exchangeItem.findUnique({
    where: { id: exchangeItem.id },
    include: { differentialPayment: true },
  });

  const isDispatchable =
    exWithPayment?.status === ExchangeItemStatus.RESERVED &&
    exWithPayment?.differentialPayment?.status === PaymentAttemptStatus.SUCCESS;

  console.log('  Exchange Status:', exWithPayment?.status);
  console.log('  Differential Payment Status:', exWithPayment?.differentialPayment?.status);
  console.log('  Exchange Eligible For Dispatch:', isDispatchable);

  if (!isDispatchable) throw new Error('Exchange is not eligible for dispatch after successful payment!');

  // Verify Order payment status remains PAID (not altered incorrectly)
  const reloadedOrder = await prisma.order.findUnique({ where: { id: testOrder.id } });
  console.log('  Original Order Payment Status Unaltered:', reloadedOrder?.paymentStatus === 'PAID');
  if (reloadedOrder?.paymentStatus !== 'PAID') {
    throw new Error(`Original order paymentStatus was incorrectly altered to ${reloadedOrder?.paymentStatus}`);
  }

  // 10. DUPLICATE PAYMENT / REPLAY PROTECTION CHECK
  console.log('\n--- Step 10: Duplicate Payment Protection Check ---');
  let dupExchangeRejected = false;
  try {
    await approveSameProductExchange({
      returnRequestId: returnReq.id,
      returnItemId: returnReq.items[0].id,
      replacementVariantId: variantB.id,
      quantity: 1,
    });
  } catch (err: any) {
    dupExchangeRejected = err.message.includes('OrderItem has already been exchanged once');
  }

  console.log('  Duplicate Exchange Approval Attempt Rejected Cleanly:', dupExchangeRejected);
  if (!dupExchangeRejected) throw new Error('System allowed duplicate exchange approval for the same item!');

  // 11. VERIFY PERSISTENCE UPON RELOAD
  console.log('\n--- Step 11: Reload & Persistence Verification ---');
  const reloadedEx = await prisma.exchangeItem.findUnique({
    where: { id: exchangeItem.id },
    include: { differentialPayment: true },
  });
  const reloadedInvB = await prisma.inventoryItem.findUnique({ where: { variantId: variantB.id } });

  console.log('  Persisted Exchange Status:', reloadedEx?.status);
  console.log('  Persisted Differential Payment Status:', reloadedEx?.differentialPayment?.status);
  console.log('  Persisted Differential Payment Amount: ₹', Number(reloadedEx?.differentialPayment?.amount));
  console.log('  Persisted Replacement Reserved Stock:', reloadedInvB?.reservedStock);

  if (
    reloadedEx?.status !== ExchangeItemStatus.RESERVED ||
    reloadedEx?.differentialPayment?.status !== PaymentAttemptStatus.SUCCESS ||
    Number(reloadedEx?.differentialPayment?.amount) !== 500 ||
    reloadedInvB?.reservedStock !== resBAfter
  ) {
    throw new Error('State failed to persist accurately upon database reload!');
  }

  console.log('\n================================================================');
  console.log('TEST 8 — Higher-Price Exchange / Differential Payment Report');
  console.log('================================================================');
  console.log('Fresh test data: PASS');
  console.log('Return submission: PASS');
  console.log('Return approval: PASS');
  console.log('Physical receipt/restocking: PASS');
  console.log('Same-product validation: PASS');
  console.log('Price difference calculation: PASS');
  console.log('priceDifference = ₹500: PASS');
  console.log('ExchangeItem creation: PASS');
  console.log('Replacement reservation: PASS');
  console.log('Differential Payment creation: PASS');
  console.log('Payment amount ₹500: PASS');
  console.log('Payment purpose EXCHANGE_DIFFERENTIAL: PASS');
  console.log('Unpaid payment blocks dispatch: PASS');
  console.log('Successful payment: PASS');
  console.log('Exchange becomes dispatchable: PASS');
  console.log('No refund: PASS');
  console.log('No premature SALE_OUT: PASS');
  console.log('Duplicate payment protection: PASS');
  console.log('Persistence after reload: PASS');
  console.log('Unexpected issues: None');
  console.log('================================================================\n');
}

runAcceptanceTest8().catch((err) => {
  console.error('FATAL ACCEPTANCE TEST 8 FAILURE:', err);
  process.exit(1);
});
