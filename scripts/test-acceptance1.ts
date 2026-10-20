import { prisma } from '../lib/db/prisma';
import { createReturnRequest } from '../lib/returns/return-engine';
import { ReturnStatus, ReturnReason } from '@prisma/client';

async function runAcceptanceTest1() {
  console.log('================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 1 — CUSTOMER SUBMITS RETURN');
  console.log('================================================================\n');

  const timestamp = Date.now();
  const orderNumber = `ORD-ACC1-${timestamp}`;
  const customerMobile = '+919876543210';
  const guestAccessToken = `token-acc1-${timestamp}`;

  let variant = await prisma.productVariant.findFirst();
  if (!variant) throw new Error('No product variant found');

  const testOrder = await prisma.order.create({
    data: {
      orderNumber,
      salesChannel: 'ONLINE',
      status: 'DELIVERED',
      deliveredAt: new Date(),
      customerNameSnapshot: 'Test Customer',
      customerMobileSnapshot: customerMobile,
      guestAccessToken,
      guestAccessTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      subtotal: 3000,
      grandTotal: 3100,
      shippingFee: 100,
      paymentStatus: 'PAID',
      items: {
        create: [
          {
            variantId: variant.id,
            productNameSnapshot: 'Test Polo',
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

  // 1. GUEST AUTHORIZATION & ORDER LOOKUP
  console.log('--- Step 1: Guest Authorization & Order Lookup ---');
  const order = await prisma.order.findUnique({
    where: { orderNumber: testOrder.orderNumber },
    include: {
      items: true,
      returnRequests: { include: { items: true } },
      payments: true,
    },
  });

  if (!order) {
    throw new Error(`Test order '${orderNumber}' not found.`);
  }

  // Verify guest token authorization check
  const isGuestAuthorized =
    order.guestAccessToken === guestAccessToken &&
    new Date() < new Date(order.guestAccessTokenExpiresAt);

  console.log('  Order Found:', order.orderNumber);
  console.log('  Customer Mobile Snapshot:', order.customerMobileSnapshot);
  console.log('  Guest Token Authorized:', isGuestAuthorized);
  console.log('  Order Status:', order.status);
  console.log('  Payment Status:', order.paymentStatus);

  if (!isGuestAuthorized) {
    throw new Error('Guest authorization check failed.');
  }

  // 2. ELIGIBLE ITEMS & QUANTITY CHECK
  console.log('\n--- Step 2: Eligible Items & Quantity Verification ---');
  const eligibleItem = order.items[0];
  console.log(`  Item SKU: ${eligibleItem.skuSnapshot}, Total Purchased: ${eligibleItem.quantity}`);

  // Calculate remaining returnable quantity
  let alreadyRequestedSum = 0;
  for (const ret of order.returnRequests) {
    if (ret.status !== 'REJECTED') {
      const ri = ret.items.find((i) => i.orderItemId === eligibleItem.id);
      if (ri) alreadyRequestedSum += ri.quantityRequested;
    }
  }

  const unreturnedAvailable = eligibleItem.quantity - alreadyRequestedSum;
  console.log(`  Unreturned Available Quantity: ${unreturnedAvailable}`);

  if (unreturnedAvailable !== 3) {
    throw new Error(`Expected 3 available returnable units, found ${unreturnedAvailable}`);
  }

  // 3. SUBMIT RETURN REQUEST (Customer selection: 2 units)
  console.log('\n--- Step 3: Submitting Customer Return Request ---');
  const submissionKey = `acc-test1-sub-${Date.now()}`;
  const requestedQty = 2;

  const returnRes = await createReturnRequest({
    orderId: order.id,
    reason: ReturnReason.SIZE_FIT_ISSUE,
    reasonDetails: 'Size too tight',
    items: [{ orderItemId: eligibleItem.id, quantityRequested: requestedQty }],
    submissionIdempotencyKey: submissionKey,
    guestAccessToken: guestAccessToken,
    customerMobile: customerMobile,
  });

  const returnReq = returnRes.returnRequest;

  console.log('  Return Request Created Successfully!');
  console.log('  Return Number:', returnReq.returnNumber);
  console.log('  Return Status:', returnReq.status);
  console.log('  Subtotal Refund:', Number(returnReq.subtotalRefund));
  console.log('  Tax Refund:', Number(returnReq.taxRefund));
  console.log('  Total Refund Amount:', Number(returnReq.totalRefundAmount));

  // 4. VERIFY DATABASE STATE & INVARIANTS
  console.log('\n--- Step 4: Database State & Invariant Verification ---');

  // Verify ReturnRequest record
  const dbReturnReq = await prisma.returnRequest.findUnique({
    where: { id: returnReq.id },
    include: { items: true },
  });

  if (!dbReturnReq) throw new Error('ReturnRequest record missing in DB.');

  const dbItem = dbReturnReq.items[0];

  console.log('  DB Return Number:', dbReturnReq.returnNumber);
  console.log('  DB Status:', dbReturnReq.status);
  console.log('  DB Item Quantity Requested:', dbItem.quantityRequested);
  console.log('  DB Item Quantity Received:', dbItem.quantityReceived);
  console.log('  DB Item Quantity Restocked:', dbItem.quantityRestocked);
  console.log('  DB Item Quantity Damaged:', dbItem.quantityDamaged);

  // Assert initial status is REQUESTED
  if (dbReturnReq.status !== ReturnStatus.REQUESTED) {
    throw new Error(`Expected initial status REQUESTED, got ${dbReturnReq.status}`);
  }

  // Assert Order status unchanged (remains DELIVERED)
  const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
  console.log('  Order Status Unchanged:', dbOrder?.status === 'DELIVERED');
  console.log('  Order Payment Status Unchanged:', dbOrder?.paymentStatus === 'PAID');

  if (dbOrder?.status !== 'DELIVERED' || dbOrder?.paymentStatus !== 'PAID') {
    throw new Error('Order or payment status was incorrectly changed by return submission!');
  }

  // 5. DUPLICATE SUBMISSION PROTECTION TEST
  console.log('\n--- Step 5: Duplicate Protection Verification ---');

  // Replay exact same submission key -> Returns existing record without creating duplicate
  const replayedRes = await createReturnRequest({
    orderId: order.id,
    reason: ReturnReason.SIZE_FIT_ISSUE,
    reasonDetails: 'Size too tight',
    items: [{ orderItemId: eligibleItem.id, quantityRequested: requestedQty }],
    submissionIdempotencyKey: submissionKey,
    guestAccessToken: guestAccessToken,
    customerMobile: customerMobile,
  });

  console.log('  Idempotent Duplicate Replay Returned Existing:', replayedRes.isDuplicate === true);
  console.log('  Returned Same Return Number:', replayedRes.returnRequest.returnNumber === returnReq.returnNumber);

  if (!replayedRes.isDuplicate || replayedRes.returnRequest.id !== returnReq.id) {
    throw new Error('Duplicate idempotency protection failed!');
  }

  // Over-return attempt protection test (attempting 2 more units: 2 + 2 = 4 > 3)
  let overReturnBlocked = false;
  try {
    await createReturnRequest({
      orderId: order.id,
      reason: ReturnReason.CHANGE_OF_MIND,
      items: [{ orderItemId: eligibleItem.id, quantityRequested: 2 }],
      submissionIdempotencyKey: `acc-test1-over-${Date.now()}`,
      guestAccessToken: guestAccessToken,
    });
  } catch (err: any) {
    overReturnBlocked = err.message.includes('OVER_RETURN_ATTEMPT');
  }

  console.log('  Over-Return Request Safely Blocked:', overReturnBlocked);

  if (!overReturnBlocked) {
    throw new Error('Over-return request was not blocked!');
  }

  // 6. ADMIN VISIBILITY VERIFICATION
  console.log('\n--- Step 6: Admin Returns Visibility Verification ---');
  const adminReturns = await prisma.returnRequest.findMany({
    where: { orderId: order.id },
    include: {
      order: true,
      items: true,
    },
  });

  console.log('  Admin Return Requests Count for Order:', adminReturns.length);
  const adminRet = adminReturns.find((r) => r.id === returnReq.id);

  if (!adminRet) {
    throw new Error('Submitted return request not visible in admin returns view.');
  }

  console.log('  Admin View Return Number:', adminRet.returnNumber);
  console.log('  Admin View Customer Mobile:', adminRet.customerMobile);
  console.log('  Admin View Status:', adminRet.status);
  console.log('  Admin View Line Items Count:', adminRet.items.length);
  console.log('  Admin View Net Refund Amount:', Number(adminRet.totalRefundAmount));

  console.log('\n================================================================');
  console.log('PHASE 9 ACCEPTANCE TEST 1 PASSED ALL VERIFICATION CHECKS!');
  console.log('================================================================');
}

runAcceptanceTest1().catch((err) => {
  console.error('FATAL ACCEPTANCE TEST 1 FAILURE:', err);
  process.exit(1);
});
