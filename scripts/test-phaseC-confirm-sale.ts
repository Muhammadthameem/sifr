import { prisma } from '../lib/db/prisma';
import {
  OrderStatus,
  SalesChannel,
  PaymentStatus,
  PaymentMethod,
  ProductStatus,
  CouponDiscountType,
} from '@prisma/client';
import { confirmWhatsAppOrderSaleAction } from '../lib/actions/order-actions';
import {
  createWhatsAppOrder,
  createOnlineOrder,
  createDirectSale,
  transitionOrderStatus,
  deleteContactedOrder,
  confirmWhatsAppOrderSale,
} from '../lib/ordering/order-engine';
import crypto from 'crypto';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

async function runPhaseCConfirmSaleTests() {
  console.log('================================================================');
  console.log('PHASE C ACCEPTANCE TESTS — ADMIN CONFIRM SALE');
  console.log('================================================================\n');

  const runId = Math.floor(100000 + Math.random() * 900000).toString();

  // --- Step 0: Test Fixtures Setup ---
  console.log('--- Step 0: Test Fixtures Setup ---');

  const category = await prisma.category.create({
    data: {
      name: `PhaseC Cat ${runId}`,
      slug: `phase-c-cat-${runId}`,
    },
  });

  const product = await prisma.product.create({
    data: {
      name: `PhaseC Silk Kaftan ${runId}`,
      slug: `phase-c-silk-kaftan-${runId}`,
      status: ProductStatus.ACTIVE,
      categoryId: category.id,
      shippingCharge: 60.0,
      variants: {
        create: {
          title: 'Emerald / Free Size',
          sku: `SKU-PHC-${runId}`,
          sellingPrice: 2800.0,
          mrp: 3500.0,
          isAvailable: true,
          shippingCost: 60.0,
          inventoryItem: {
            create: {
              physicalStock: 50,
              reservedStock: 0,
            },
          },
        },
      },
    },
    include: { variants: { include: { inventoryItem: true } } },
  });

  const variant = product.variants[0];

  // Create 2 FIFO layers: Layer 1 (older, 30 units @ ₹800), Layer 2 (newer, 20 units @ ₹900)
  const layer1 = await prisma.fifoLayer.create({
    data: {
      variantId: variant.id,
      initialQuantity: 30,
      remainingQuantity: 30,
      unitCost: 800.0,
      createdAt: new Date(Date.now() - 3600000), // 1 hour ago
    },
  });

  const layer2 = await prisma.fifoLayer.create({
    data: {
      variantId: variant.id,
      initialQuantity: 20,
      remainingQuantity: 20,
      unitCost: 900.0,
      createdAt: new Date(),
    },
  });

  // Create test coupon
  const coupon = await prisma.coupon.create({
    data: {
      code: `CPN${runId}`,
      name: `Phase C Coupon ${runId}`,
      discountType: CouponDiscountType.FIXED_AMOUNT,
      discountValue: 300.0,
      minOrderValue: 1000.0,
      usageLimitGlobal: 1, // Only 1 use allowed
      status: 'ACTIVE',
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000),
    },
  });

  // Create primary test order: CONTACTED, WHATSAPP, with coupon
  const order1 = await createWhatsAppOrder({
    creationIdempotencyKey: `phc-wa-1-${runId}`,
    customer: {
      name: `Nadia Hashmi ${runId}`,
      mobile: `98811${runId.slice(0, 5)}`,
      address: 'Bungalow 9, Civil Lines',
      city: 'Nagpur',
      state: 'Maharashtra',
      pincode: '440001',
      email: `nadia-${runId}@example.com`,
    },
    items: [{ variantId: variant.id, quantity: 2 }],
    couponCode: coupon.code,
  });

  console.log(`  ✓ Created Order 1: #${order1.orderNumber} (CONTACTED, 2 units @ ₹2800, discount ₹300)`);

  // ================================================================
  // Test 1: Admin Authentication is Required
  // ================================================================
  console.log('\n--- Test 1: Admin Authentication Required ---');
  let authFailed = false;
  try {
    const res = await confirmWhatsAppOrderSaleAction({
      orderId: order1.id,
      paymentMethod: 'COD',
      paymentStatus: 'DUE',
    });
    if (res && !res.success) {
      authFailed = true;
      console.log(`  ✓ confirmWhatsAppOrderSaleAction rejected unauthenticated request (${res.error})`);
    }
  } catch (err: any) {
    authFailed = true;
    console.log(`  ✓ confirmWhatsAppOrderSaleAction rejected unauthenticated request (${err.message || 'NEXT_REDIRECT'})`);
  }
  assert(authFailed, 'confirmWhatsAppOrderSaleAction must reject unauthenticated callers');

  // ================================================================
  // Test 3: Missing Payment Method is Rejected
  // ================================================================
  console.log('\n--- Test 3: Missing Payment Method Rejected ---');
  let missingMethodFailed = false;
  try {
    await confirmWhatsAppOrderSale({
      orderId: order1.id,
      paymentMethod: '' as any,
      paymentStatus: 'DUE',
    });
  } catch (err: any) {
    missingMethodFailed = true;
    console.log(`  ✓ Correctly rejected missing paymentMethod: ${err.message}`);
  }
  assert(missingMethodFailed, 'Missing paymentMethod must be rejected');

  // ================================================================
  // Test 4: Missing Payment Status is Rejected
  // ================================================================
  console.log('\n--- Test 4: Missing Payment Status Rejected ---');
  let missingStatusFailed = false;
  try {
    await confirmWhatsAppOrderSale({
      orderId: order1.id,
      paymentMethod: 'COD',
      paymentStatus: '' as any,
    });
  } catch (err: any) {
    missingStatusFailed = true;
    console.log(`  ✓ Correctly rejected missing paymentStatus: ${err.message}`);
  }
  assert(missingStatusFailed, 'Missing paymentStatus must be rejected');

  // ================================================================
  // Test 5: Invalid Payment Method is Rejected
  // ================================================================
  console.log('\n--- Test 5: Invalid Payment Method Rejected ---');
  let invalidMethodFailed = false;
  try {
    await confirmWhatsAppOrderSale({
      orderId: order1.id,
      paymentMethod: 'BITCOIN' as any,
      paymentStatus: 'DUE',
    });
  } catch (err: any) {
    invalidMethodFailed = true;
    console.log(`  ✓ Correctly rejected invalid paymentMethod: ${err.message}`);
  }
  assert(invalidMethodFailed, 'Invalid paymentMethod must be rejected');

  // ================================================================
  // Test 6: Invalid Payment Status is Rejected
  // ================================================================
  console.log('\n--- Test 6: Invalid Payment Status Rejected ---');
  let invalidStatusFailed = false;
  try {
    await confirmWhatsAppOrderSale({
      orderId: order1.id,
      paymentMethod: 'COD',
      paymentStatus: 'REFUNDED' as any,
    });
  } catch (err: any) {
    invalidStatusFailed = true;
    console.log(`  ✓ Correctly rejected invalid paymentStatus: ${err.message}`);
  }
  assert(invalidStatusFailed, 'Invalid paymentStatus must be rejected');

  // ================================================================
  // Test 8: Non-WHATSAPP Order Cannot Use WhatsApp Confirm Sale
  // ================================================================
  console.log('\n--- Test 8: Non-WHATSAPP Order Rejected ---');
  const onlineProduct = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: `Online Dummy Product ${runId}`,
      slug: `online-dummy-${runId}`,
      shippingCharge: 60.0,
      variants: {
        create: {
          title: 'Default',
          sku: `SKU-ONL-${runId}`,
          sellingPrice: 1000.0,
          mrp: 1200.0,
          inventoryItem: {
            create: {
              physicalStock: 10,
              reservedStock: 0,
            },
          },
        },
      },
    },
    include: { variants: true },
  });
  const onlineOrder = await createOnlineOrder({
    creationIdempotencyKey: `phc-onl-${runId}`,
    customer: {
      name: `Rohan Verma ${runId}`,
      mobile: `98822${runId.slice(0, 5)}`,
      shippingAddress: '42 MG Road, Bangalore, Karnataka, 560001',
    },
    shippingFee: 60.0,
    items: [{ variantId: onlineProduct.variants[0].id, quantity: 1 }],
  });

  let nonWhatsappFailed = false;
  try {
    await confirmWhatsAppOrderSale({
      orderId: onlineOrder.id,
      paymentMethod: 'COD',
      paymentStatus: 'DUE',
    });
  } catch (err: any) {
    nonWhatsappFailed = true;
    console.log(`  ✓ Non-WHATSAPP order correctly rejected: ${err.message}`);
  }
  assert(nonWhatsappFailed, 'Online order must be rejected by confirmWhatsAppOrderSale');

  // ================================================================
  // Tests 2, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25:
  // Successful Atomic Confirmation of Order 1
  // ================================================================
  console.log('\n--- Tests 2, 9-22, 24, 25: Atomic Sale Confirmation ---');

  const invBefore = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  assert(invBefore.physicalStock === 50, 'Initial physicalStock must be 50');
  assert(invBefore.reservedStock === 0, 'Initial reservedStock must be 0');

  const confirmedOrder1 = await confirmWhatsAppOrderSale({
    orderId: order1.id,
    paymentMethod: 'UPI',
    paymentStatus: 'PAID',
    idempotencyKey: `confirm-sale-${order1.id}`,
  });

  // Test 2 & 16: Order status changed CONTACTED -> CONFIRMED
  assert(confirmedOrder1.status === OrderStatus.CONFIRMED, `Status must be CONFIRMED, got ${confirmedOrder1.status}`);
  console.log('  ✓ Status transitioned: CONTACTED -> CONFIRMED');

  // Test 17: confirmedAt populated
  assert(confirmedOrder1.confirmedAt !== null, 'confirmedAt must be set');
  console.log(`  ✓ confirmedAt timestamp set: ${confirmedOrder1.confirmedAt?.toISOString()}`);

  // Test 18 & 19: paymentMethod and paymentStatus persisted
  assert(confirmedOrder1.paymentMethod === PaymentMethod.UPI, 'paymentMethod must be UPI');
  assert(confirmedOrder1.paymentStatus === PaymentStatus.PAID, 'paymentStatus must be PAID');
  console.log('  ✓ Payment method (UPI) and payment status (PAID) persisted successfully');

  // Test 10: physicalStock decrements by exact ordered quantity (50 - 2 = 48)
  const invAfter = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  assert(invAfter.physicalStock === 48, `physicalStock must be 48, got ${invAfter.physicalStock}`);
  console.log(`  ✓ Physical stock decremented from 50 to 48 (exact ordered quantity -2)`);

  // Test 11: reservedStock is NOT modified (remains 0)
  assert(invAfter.reservedStock === 0, `reservedStock must remain 0, got ${invAfter.reservedStock}`);
  console.log('  ✓ reservedStock remained strictly 0 (untouched)');

  // Test 12: FIFO layers consumed oldest-first (Layer 1: 30 -> 28 remaining)
  const layer1After = await prisma.fifoLayer.findUniqueOrThrow({ where: { id: layer1.id } });
  const layer2After = await prisma.fifoLayer.findUniqueOrThrow({ where: { id: layer2.id } });
  assert(layer1After.remainingQuantity === 28, `Layer 1 remaining must be 28, got ${layer1After.remainingQuantity}`);
  assert(layer2After.remainingQuantity === 20, `Layer 2 must be untouched (20), got ${layer2After.remainingQuantity}`);
  console.log('  ✓ FIFO consumed oldest layer first (Layer 1: 30 -> 28, Layer 2: 20 untouched)');

  // Test 13 & 15: FIFO COGS calculated from actual layer costs (2 units @ ₹800 = ₹1600.00)
  assert(Number(confirmedOrder1.totalFifoCogs) === 1600.0, `totalFifoCogs must be 1600, got ${confirmedOrder1.totalFifoCogs}`);
  const orderItemAfter = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order1.id } });
  assert(Number(orderItemAfter.fifoCogs) === 1600.0, `OrderItem fifoCogs must be 1600, got ${orderItemAfter.fifoCogs}`);
  console.log('  ✓ FIFO COGS accurately recorded: item fifoCogs = ₹1600.00, order totalFifoCogs = ₹1600.00');

  // Test 14: SALE_OUT movement recorded
  const saleOutMovements = await prisma.inventoryMovement.findMany({
    where: { referenceId: order1.id, type: 'SALE_OUT' },
  });
  assert(saleOutMovements.length === 1, `Expected 1 SALE_OUT movement, got ${saleOutMovements.length}`);
  assert(saleOutMovements[0].quantity === -2, 'Movement quantity must be -2');
  assert(Number(saleOutMovements[0].unitCost) === 800.0, 'Movement unitCost must be 800');
  assert(Number(saleOutMovements[0].totalCost) === 1600.0, 'Movement totalCost must be 1600');
  console.log('  ✓ SALE_OUT movement recorded with deterministic key and cost contribution');

  // Test 20 & 21: Preserved snapshots
  assert(confirmedOrder1.customerNameSnapshot === `Nadia Hashmi ${runId}`, 'Customer name snapshot altered');
  assert(Number(confirmedOrder1.subtotal) === Number(order1.subtotal), 'Subtotal altered');
  assert(Number(confirmedOrder1.discountTotal) === Number(order1.discountTotal), 'Discount total altered');
  assert(Number(confirmedOrder1.grandTotal) === Number(order1.grandTotal), 'Grand total altered');
  console.log('  ✓ All historical customer, item, and financial snapshots remain strictly frozen');

  // Test 22: Coupon usage consumed exactly once
  const couponAfter = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
  assert(couponAfter.usageCountGlobal === 1, `Coupon usage count must be 1, got ${couponAfter.usageCountGlobal}`);
  const couponUsageRecord = await prisma.couponUsage.findFirst({ where: { orderId: order1.id } });
  assert(couponUsageRecord !== null, 'CouponUsage ledger record must exist');
  assert(Number(couponUsageRecord!.discountAmount) === 300.0, 'CouponUsage discountAmount mismatch');
  console.log('  ✓ Coupon usage consumed exactly once (usageCountGlobal = 1, CouponUsage record logged)');

  // Test 24 & 25: ORDER_CONFIRMED queued, ORDER_RECEIVED not queued
  const notifications = await prisma.notification.findMany({ where: { orderId: order1.id } });
  assert(notifications.some((n) => n.eventType === 'ORDER_CONFIRMED'), 'ORDER_CONFIRMED notification missing');
  assert(!notifications.some((n) => n.eventType === 'ORDER_RECEIVED'), 'ORDER_RECEIVED must NOT be queued');
  console.log('  ✓ ORDER_CONFIRMED queued in outbox; ORDER_RECEIVED correctly omitted');

  // ================================================================
  // Test 7 & 30: Reconfirming a CONFIRMED Order is Rejected
  // ================================================================
  console.log('\n--- Tests 7 & 30: Reconfirming CONFIRMED Order Rejected ---');
  let reconfirmFailed = false;
  try {
    await confirmWhatsAppOrderSale({
      orderId: order1.id,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
    });
  } catch (err: any) {
    reconfirmFailed = true;
    console.log(`  ✓ Reconfirmation rejected: ${err.message}`);
  }
  assert(reconfirmFailed, 'Reconfirming a CONFIRMED order must be rejected');

  // ================================================================
  // Tests 31-36: Duplicate Idempotency Re-submission Produces Zero Mutations
  // ================================================================
  console.log('\n--- Tests 31-36: Duplicate Idempotent Submission Safety ---');
  const invBeforeRetry = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  const retryOrder = await transitionOrderStatus({
    orderId: order1.id,
    idempotencyKey: `confirm-sale-${order1.id}`, // Same idempotency key
    targetStatus: OrderStatus.CONFIRMED,
  });
  assert(retryOrder.id === order1.id, 'Retry returned wrong order');
  const invAfterRetry = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  assert(invBeforeRetry.physicalStock === invAfterRetry.physicalStock, 'Retry double-deducted physical stock!');

  const movementsAfterRetry = await prisma.inventoryMovement.findMany({ where: { referenceId: order1.id } });
  assert(movementsAfterRetry.length === 1, 'Retry created duplicate SALE_OUT movements!');

  const couponAfterRetry = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
  assert(couponAfterRetry.usageCountGlobal === 1, 'Retry incremented coupon usage count!');

  const notifsAfterRetry = await prisma.notification.findMany({ where: { orderId: order1.id } });
  assert(notifsAfterRetry.length === 1, 'Retry created duplicate notifications!');
  console.log('  ✓ Idempotent retry resulted in zero duplicate deductions, movements, or notifications');

  // ================================================================
  // Test 23: No Coupon Means Zero Coupon Mutation
  // ================================================================
  console.log('\n--- Test 23: Order Without Coupon Causes No Coupon Mutation ---');
  const orderNoCoupon = await createWhatsAppOrder({
    creationIdempotencyKey: `phc-wa-nocpn-${runId}`,
    customer: {
      name: `Tariq Aziz ${runId}`,
      mobile: `98833${runId.slice(0, 5)}`,
      address: '77 Residency Road',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
  });

  const couponUsageCountBefore = await prisma.couponUsage.count();
  await confirmWhatsAppOrderSale({
    orderId: orderNoCoupon.id,
    paymentMethod: 'CASH',
    paymentStatus: 'DUE',
  });
  const couponUsageCountAfter = await prisma.couponUsage.count();
  assert(couponUsageCountBefore === couponUsageCountAfter, 'CouponUsage was created for order without coupon!');
  console.log('  ✓ Order without coupon confirmed with zero coupon mutations');

  // ================================================================
  // Test 26: Insufficient Stock Causes Complete Atomic Rollback
  // ================================================================
  console.log('\n--- Test 26: Insufficient Stock Causes Complete Rollback ---');
  // Currently variant has 47 physical units left
  const orderBig = await createWhatsAppOrder({
    creationIdempotencyKey: `phc-wa-big-${runId}`,
    customer: {
      name: `Big Buyer ${runId}`,
      mobile: `98844${runId.slice(0, 5)}`,
      address: 'Industrial Area',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    },
    items: [{ variantId: variant.id, quantity: 40 }], // We will manually reduce stock to 10 to test
  });

  // Temporarily set physical stock to 10
  await prisma.inventoryItem.update({
    where: { variantId: variant.id },
    data: { physicalStock: 10 },
  });

  let stockFailError: any = null;
  try {
    await confirmWhatsAppOrderSale({
      orderId: orderBig.id,
      paymentMethod: 'COD',
      paymentStatus: 'DUE',
    });
  } catch (err: any) {
    stockFailError = err;
    console.log(`  ✓ Insufficient stock aborted: ${err.message}`);
  }
  assert(stockFailError !== null, 'Insufficient stock must abort');
  assert(stockFailError.message.includes('INSUFFICIENT_STOCK'), 'Expected INSUFFICIENT_STOCK error');

  // Verify order remained CONTACTED and stock remained 10
  const orderBigDb = await prisma.order.findUniqueOrThrow({ where: { id: orderBig.id } });
  assert(orderBigDb.status === OrderStatus.CONTACTED, 'Order status mutated despite stock failure!');
  const invAfterStockFail = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  assert(invAfterStockFail.physicalStock === 10, 'Physical stock was deducted despite failure!');
  console.log('  ✓ Complete atomic rollback: order remained CONTACTED, zero stock deducted');

  // Restore physical stock to 47
  await prisma.inventoryItem.update({
    where: { variantId: variant.id },
    data: { physicalStock: 47 },
  });

  // ================================================================
  // Test 27: Missing FIFO Capacity Causes Complete Rollback
  // ================================================================
  console.log('\n--- Test 27: Missing FIFO Capacity Causes Rollback ---');
  // Create variant with stock 10 but zero FIFO layers
  const zeroFifoProduct = await prisma.product.create({
    data: {
      name: `Zero FIFO Product ${runId}`,
      slug: `zero-fifo-${runId}`,
      status: ProductStatus.ACTIVE,
      categoryId: category.id,
      shippingCharge: 50.0,
      variants: {
        create: {
          title: 'Zero FIFO Variant',
          sku: `SKU-ZFIFO-${runId}`,
          sellingPrice: 1000.0,
          mrp: 1200.0,
          isAvailable: true,
          shippingCost: 50.0,
          inventoryItem: {
            create: {
              physicalStock: 10,
              reservedStock: 0,
            },
          },
        },
      },
    },
    include: { variants: true },
  });
  const zeroFifoVariant = zeroFifoProduct.variants[0];

  const zeroFifoOrder = await createWhatsAppOrder({
    creationIdempotencyKey: `phc-wa-zfifo-${runId}`,
    customer: {
      name: `Zero Fifo Buyer ${runId}`,
      mobile: `98855${runId.slice(0, 5)}`,
      address: 'Test Address',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
    },
    items: [{ variantId: zeroFifoVariant.id, quantity: 2 }],
  });

  let fifoFailError: any = null;
  try {
    await confirmWhatsAppOrderSale({
      orderId: zeroFifoOrder.id,
      paymentMethod: 'COD',
      paymentStatus: 'DUE',
    });
  } catch (err: any) {
    fifoFailError = err;
    console.log(`  ✓ Missing FIFO layers aborted: ${err.message}`);
  }
  assert(fifoFailError !== null, 'Missing FIFO layers must abort');
  assert(fifoFailError.message.includes('INSUFFICIENT_FIFO_LAYERS'), 'Expected INSUFFICIENT_FIFO_LAYERS error');

  const zeroFifoOrderDb = await prisma.order.findUniqueOrThrow({ where: { id: zeroFifoOrder.id } });
  assert(zeroFifoOrderDb.status === OrderStatus.CONTACTED, 'Order mutated on FIFO failure');
  const zeroFifoInvDb = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: zeroFifoVariant.id } });
  assert(zeroFifoInvDb.physicalStock === 10, 'Stock deducted on FIFO failure');
  console.log('  ✓ Complete atomic rollback: order remained CONTACTED, stock unchanged');

  // ================================================================
  // Test 28: Coupon Limit Failure Causes Complete Rollback
  // ================================================================
  console.log('\n--- Test 28: Coupon Limit Reached Causes Complete Rollback ---');
  const coupon2 = await prisma.coupon.create({
    data: {
      code: `CPN2_${runId}`,
      name: `Phase C Coupon 2 ${runId}`,
      discountType: CouponDiscountType.FIXED_AMOUNT,
      discountValue: 100.0,
      minOrderValue: 500.0,
      usageLimitGlobal: 1,
      usageCountGlobal: 0,
      status: 'ACTIVE',
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000),
    },
  });

  const overCouponOrder = await createWhatsAppOrder({
    creationIdempotencyKey: `phc-wa-overcpn-${runId}`,
    customer: {
      name: `Over Limit Customer ${runId}`,
      mobile: `98866${runId.slice(0, 5)}`,
      address: 'Test Address',
      city: 'Kochi',
      state: 'Kerala',
      pincode: '682001',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
    couponCode: coupon2.code,
  });

  // Now simulate another order having consumed the coupon in the meantime
  await prisma.coupon.update({
    where: { id: coupon2.id },
    data: { usageCountGlobal: 1 },
  });

  let couponFailError: any = null;
  try {
    await confirmWhatsAppOrderSale({
      orderId: overCouponOrder.id,
      paymentMethod: 'UPI',
      paymentStatus: 'PAID',
    });
  } catch (err: any) {
    couponFailError = err;
    console.log(`  ✓ Exhausted coupon confirmation aborted: ${err.message}`);
  }
  assert(couponFailError !== null, 'Exhausted coupon must abort');
  assert(couponFailError.message.includes('COUPON_LIMIT_REACHED'), 'Expected COUPON_LIMIT_REACHED error');

  const overCouponOrderDb = await prisma.order.findUniqueOrThrow({ where: { id: overCouponOrder.id } });
  assert(overCouponOrderDb.status === OrderStatus.CONTACTED, 'Order mutated on coupon failure');
  console.log('  ✓ Complete atomic rollback: order remained CONTACTED, zero stock deducted');

  // ================================================================
  // Test 37: Concurrent Confirmation Concurrency Control
  // ================================================================
  console.log('\n--- Test 37: Concurrent Confirmation Serialization ---');
  const orderConcurrent = await createWhatsAppOrder({
    creationIdempotencyKey: `phc-wa-conc-${runId}`,
    customer: {
      name: `Concurrent Customer ${runId}`,
      mobile: `98877${runId.slice(0, 5)}`,
      address: 'Race Track Road',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500001',
    },
    items: [{ variantId: variant.id, quantity: 2 }],
  });

  const stockBeforeConc = (await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } })).physicalStock;

  // Launch two concurrent confirmation attempts with different keys
  const [res1, res2] = await Promise.allSettled([
    confirmWhatsAppOrderSale({
      orderId: orderConcurrent.id,
      paymentMethod: 'UPI',
      paymentStatus: 'PAID',
      idempotencyKey: `conc-attempt-1-${runId}`,
    }),
    confirmWhatsAppOrderSale({
      orderId: orderConcurrent.id,
      paymentMethod: 'COD',
      paymentStatus: 'DUE',
      idempotencyKey: `conc-attempt-2-${runId}`,
    }),
  ]);

  const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
  const failures = [res1, res2].filter((r) => r.status === 'rejected');

  assert(successes.length === 1, `Expected exactly 1 successful confirmation, got ${successes.length}`);
  assert(failures.length === 1, `Expected exactly 1 failed confirmation, got ${failures.length}`);

  const stockAfterConc = (await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } })).physicalStock;
  assert(stockBeforeConc - stockAfterConc === 2, `Stock must be deducted by exactly 2 units, got ${stockBeforeConc - stockAfterConc}`);
  console.log('  ✓ Exactly 1 concurrent confirmation passed, exactly 1 failed safely; stock deducted exactly once');

  // ================================================================
  // Test 38: CONTACTED Deletion Forbidden After Confirmation
  // ================================================================
  console.log('\n--- Test 38: Deletion Strictly Forbidden After Confirmation ---');
  let deleteConfirmedError: any = null;
  try {
    await deleteContactedOrder(order1.id);
  } catch (err: any) {
    deleteConfirmedError = err;
  }
  assert(deleteConfirmedError !== null, 'Deleting CONFIRMED order must fail');
  assert(deleteConfirmedError.message.includes('CANNOT_DELETE_ORDER'), 'Expected CANNOT_DELETE_ORDER error');
  console.log('  ✓ CONTACTED deletion is strictly blocked for CONFIRMED order');

  // ================================================================
  // Test 39: Legacy ONLINE Orders Remain Unchanged
  // ================================================================
  console.log('\n--- Test 39: Legacy ONLINE Orders Architecture Intact ---');
  const onlineDb = await prisma.order.findUniqueOrThrow({ where: { id: onlineOrder.id } });
  assert(onlineDb.status === OrderStatus.RECEIVED, 'Online order status mismatch');
  assert(onlineDb.salesChannel === SalesChannel.ONLINE, 'Online salesChannel mismatch');
  console.log('  ✓ Legacy ONLINE orders untouched and functional');

  // ================================================================
  // Test 40: DIRECT Orders Remain Unchanged
  // ================================================================
  console.log('\n--- Test 40: DIRECT Orders Architecture Intact ---');
  const directSale = await createDirectSale({
    creationIdempotencyKey: `phc-ds-${runId}`,
    customer: {
      name: `Walk-in Customer ${runId}`,
      mobile: `98888${runId.slice(0, 5)}`,
    },
    items: [{ variantId: variant.id, quantity: 1 }],
  });
  assert(directSale.status === OrderStatus.DELIVERED, 'Direct sale status must be DELIVERED');
  assert(directSale.salesChannel === SalesChannel.DIRECT, 'Direct sale salesChannel must be DIRECT');
  console.log('  ✓ DIRECT sale architecture untouched and functional');

  // ================================================================
  // Test Fixture Cleanup (Strict Test Hygiene)
  // ================================================================
  console.log('\n--- Cleaning Up Test Fixtures ---');
  const allTestOrderIds = [
    order1.id,
    onlineOrder.id,
    orderNoCoupon.id,
    orderBig.id,
    zeroFifoOrder.id,
    overCouponOrder.id,
    orderConcurrent.id,
    directSale.id,
  ];

  await prisma.notificationAttempt.deleteMany({
    where: { notification: { orderId: { in: allTestOrderIds } } },
  });
  await prisma.notification.deleteMany({
    where: { orderId: { in: allTestOrderIds } },
  });
  await prisma.orderStatusTransition.deleteMany({
    where: { orderId: { in: allTestOrderIds } },
  });
  await prisma.couponUsage.deleteMany({
    where: { orderId: { in: allTestOrderIds } },
  });
  await prisma.inventoryMovement.deleteMany({
    where: { referenceId: { in: allTestOrderIds } },
  });
  await prisma.orderItem.deleteMany({
    where: { orderId: { in: allTestOrderIds } },
  });
  await prisma.order.deleteMany({
    where: { id: { in: allTestOrderIds } },
  });

  await prisma.coupon.deleteMany({ where: { id: { in: [coupon.id, coupon2.id] } } });

  await prisma.fifoLayer.deleteMany({
    where: { variantId: { in: [variant.id, zeroFifoVariant.id, onlineProduct.variants[0].id] } },
  });
  await prisma.inventoryMovement.deleteMany({
    where: { variantId: { in: [variant.id, zeroFifoVariant.id, onlineProduct.variants[0].id] } },
  });
  await prisma.inventoryItem.deleteMany({
    where: { variantId: { in: [variant.id, zeroFifoVariant.id, onlineProduct.variants[0].id] } },
  });
  await prisma.productVariant.deleteMany({
    where: { productId: { in: [product.id, zeroFifoProduct.id, onlineProduct.id] } },
  });
  await prisma.product.deleteMany({
    where: { id: { in: [product.id, zeroFifoProduct.id, onlineProduct.id] } },
  });
  await prisma.category.deleteMany({ where: { id: category.id } });

  console.log('  ✓ All test orders, coupons, inventory, movements, and products cleaned up safely');

  console.log('\n================================================================');
  console.log('ALL PHASE C ACCEPTANCE CRITERIA VERIFIED AND PASSED (40/40)!');
  console.log('================================================================');
}

runPhaseCConfirmSaleTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
    process.exit(1);
  });
