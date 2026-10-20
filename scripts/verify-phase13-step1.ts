import { prisma } from '../lib/db/prisma';
import {
  getExecutiveFinancialSummary,
  getOrderFunnelSummary,
  getChannelSummary,
  getInventoryHealthSummary,
  getProductPerformanceSummary,
  getReturnsSummary,
  getPaymentSummary,
  getNotificationSummary,
  DEFAULT_LOW_STOCK_THRESHOLD,
} from '../lib/reports/report-service';
import { OrderStatus, SalesChannel, PaymentStatus, RefundStatus, RefundMethod } from '@prisma/client';

async function main() {
  console.log('===========================================================');
  console.log('  SIFR PHASE 13 — STEP 1: REPORT SERVICE VERIFICATION');
  console.log('===========================================================');

  // 1. Zero Safety Math Test (Clean State Test)
  console.log('\n--- TEST 1: Zero-State Safety Math Verification ---');
  const pastFarDate = new Date('2020-01-01T00:00:00.000Z');
  const pastFarDateEnd = new Date('2020-01-02T00:00:00.000Z');

  const zeroSummary = await getExecutiveFinancialSummary({
    startDate: pastFarDate,
    endDate: pastFarDateEnd,
  });

  if (
    zeroSummary.grossSales !== 0 ||
    zeroSummary.netRevenue !== 0 ||
    zeroSummary.aov !== 0 ||
    zeroSummary.grossMargin !== 0 ||
    zeroSummary.grossMarginPercent !== 0 ||
    isNaN(zeroSummary.aov) ||
    isNaN(zeroSummary.grossMarginPercent)
  ) {
    throw new Error('TEST 1 FAILED: Zero-state math produced NaN or non-zero outputs.');
  }
  console.log('✓ TEST 1 PASSED: Zero-state safe math verified (0 AOV, 0% Margin, no NaN).');

  // 2. Setup Test Data (Category, Product, Variant, InventoryItem, FifoLayer)
  console.log('\n--- 2. Setting up Master Catalog & Order Dataset ---');
  const testCategory = await prisma.category.create({
    data: {
      name: 'P13 Test Apparel',
      slug: `p13-test-cat-${Date.now()}`,
    },
  });

  const testProduct = await prisma.product.create({
    data: {
      name: 'P13 Test Oxford Shirt',
      slug: `p13-test-shirt-${Date.now()}`,
      categoryId: testCategory.id,
      gender: 'MEN',
      status: 'ACTIVE',
    },
  });

  const testVariant = await prisma.productVariant.create({
    data: {
      productId: testProduct.id,
      title: 'M',
      sku: `SKU-P13-${Date.now()}`,
      sellingPrice: 2000,
      mrp: 2500,
      costPrice: 1000,
      isAvailable: true,
    },
  });

  await prisma.inventoryItem.create({
    data: {
      variantId: testVariant.id,
      physicalStock: 10,
      reservedStock: 2,
    },
  });

  await prisma.fifoLayer.create({
    data: {
      variantId: testVariant.id,
      initialQuantity: 10,
      remainingQuantity: 8,
      unitCost: 1000,
    },
  });

  // Create Out-of-Stock Variant & Low-Stock Variant
  const outOfStockVariant = await prisma.productVariant.create({
    data: {
      productId: testProduct.id,
      title: 'S',
      sku: `SKU-OOS-${Date.now()}`,
      sellingPrice: 2000,
      mrp: 2500,
      costPrice: 1000,
      isAvailable: true,
    },
  });
  await prisma.inventoryItem.create({
    data: {
      variantId: outOfStockVariant.id,
      physicalStock: 2,
      reservedStock: 2, // available = 0
    },
  });

  const lowStockVariant = await prisma.productVariant.create({
    data: {
      productId: testProduct.id,
      title: 'L',
      sku: `SKU-LOW-${Date.now()}`,
      sellingPrice: 2000,
      mrp: 2500,
      costPrice: 1000,
      isAvailable: true,
    },
  });
  await prisma.inventoryItem.create({
    data: {
      variantId: lowStockVariant.id,
      physicalStock: 5,
      reservedStock: 2, // available = 3 (<= 5)
    },
  });

  console.log('✓ Master catalog, inventory items, and FIFO layers created.');

  // 3. Create Representative Orders with isolated fixed timestamp
  console.log('\n--- 3. Creating Test Orders (Online, Direct, Cancelled, Refunds) ---');
  const testCreatedAt = new Date('2028-05-15T12:00:00.000Z');
  const testDateStart = new Date('2028-05-15T00:00:00.000Z');
  const testDateEnd = new Date('2028-05-16T00:00:00.000Z');

  // Order 1: Online Normal Order (₹2,000 Grand Total, ₹1,000 FIFO COGS)
  const order1 = await prisma.order.create({
    data: {
      orderNumber: `ORD-P13-1-${Date.now()}`,
      salesChannel: SalesChannel.ONLINE,
      status: OrderStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      subtotal: 2000,
      shippingFee: 0,
      grandTotal: 2000,
      totalFifoCogs: 1000,
      customerNameSnapshot: 'Test Customer 1',
      customerMobileSnapshot: '+919999900001',
      createdAt: testCreatedAt,
      items: {
        create: {
          variantId: testVariant.id,
          productNameSnapshot: testProduct.name,
          variantTitleSnapshot: testVariant.title,
          skuSnapshot: testVariant.sku,
          quantity: 1,
          unitPrice: 2000,
          mrp: 2500,
          lineTotal: 2000,
          fifoCogs: 1000,
        },
      },
    },
  });

  // Order 2: Direct Sale Order (₹4,000 Grand Total, ₹2,000 FIFO COGS)
  const order2 = await prisma.order.create({
    data: {
      orderNumber: `DS-P13-2-${Date.now()}`,
      salesChannel: SalesChannel.DIRECT,
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PAID,
      subtotal: 4000,
      shippingFee: 0,
      grandTotal: 4000,
      totalFifoCogs: 2000,
      customerNameSnapshot: 'Test Direct Customer',
      customerMobileSnapshot: '+919999900002',
      createdAt: testCreatedAt,
      items: {
        create: {
          variantId: testVariant.id,
          productNameSnapshot: testProduct.name,
          variantTitleSnapshot: testVariant.title,
          skuSnapshot: testVariant.sku,
          quantity: 2,
          unitPrice: 2000,
          mrp: 2500,
          lineTotal: 4000,
          fifoCogs: 2000,
        },
      },
    },
  });

  // Order 3: Cancelled Order (₹2,000) — Should be strictly EXCLUDED
  const order3 = await prisma.order.create({
    data: {
      orderNumber: `ORD-P13-3-CANCELLED-${Date.now()}`,
      salesChannel: SalesChannel.ONLINE,
      status: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.FAILED,
      subtotal: 2000,
      shippingFee: 0,
      grandTotal: 2000,
      totalFifoCogs: 1000,
      customerNameSnapshot: 'Test Cancelled Customer',
      customerMobileSnapshot: '+919999900003',
      createdAt: testCreatedAt,
    },
  });

  // Order 4: Online Order with Completed Refund (₹2,000 Grand Total, ₹500 Refunded)
  const order4 = await prisma.order.create({
    data: {
      orderNumber: `ORD-P13-4-REFUNDED-${Date.now()}`,
      salesChannel: SalesChannel.ONLINE,
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      subtotal: 2000,
      shippingFee: 0,
      grandTotal: 2000,
      totalFifoCogs: 1000,
      customerNameSnapshot: 'Test Refunded Customer',
      customerMobileSnapshot: '+919999900004',
      createdAt: testCreatedAt,
      items: {
        create: {
          variantId: testVariant.id,
          productNameSnapshot: testProduct.name,
          variantTitleSnapshot: testVariant.title,
          skuSnapshot: testVariant.sku,
          quantity: 1,
          unitPrice: 2000,
          mrp: 2500,
          lineTotal: 2000,
          fifoCogs: 1000,
        },
      },
    },
  });

  // Refund 1: Completed Refund linked to Order 4
  await prisma.refund.create({
    data: {
      refundNumber: `REF-1-${Date.now()}`,
      orderId: order4.id,
      amount: 500,
      status: RefundStatus.COMPLETED,
      idempotencyKey: `ref-p13-1-${Date.now()}`,
      method: RefundMethod.ORIGINAL_PAYMENT_GATEWAY,
    },
  });

  // Refund 2: Manually Resolved Refund linked to Order 4
  await prisma.refund.create({
    data: {
      refundNumber: `REF-2-${Date.now()}`,
      orderId: order4.id,
      amount: 300,
      status: RefundStatus.MANUALLY_RESOLVED,
      idempotencyKey: `ref-p13-2-${Date.now()}`,
      method: RefundMethod.ORIGINAL_PAYMENT_GATEWAY,
    },
  });

  console.log('✓ 4 Test Orders and 2 Attributed Refunds created.');

  // 4. Executive Financial Summary Test
  console.log('\n--- TEST 2: Executive Financial Summary Calculation ---');
  const summary = await getExecutiveFinancialSummary({
    startDate: testDateStart,
    endDate: testDateEnd,
  });

  console.log(`✓ Gross Sales: ₹${summary.grossSales} (Expected: ₹8,000)`);
  console.log(`✓ Refunds: ₹${summary.refunds} (Expected: ₹800)`);
  console.log(`✓ Net Revenue: ₹${summary.netRevenue} (Expected: ₹7,200)`);
  console.log(`✓ Total Non-Cancelled Orders: ${summary.totalOrders} (Expected: 3)`);
  console.log(`✓ AOV: ₹${summary.aov.toFixed(2)} (Expected: ₹2,400.00)`);
  console.log(`✓ FIFO COGS: ₹${summary.fifoCogs} (Expected: ₹4,000)`);
  console.log(`✓ Gross Margin ($): ₹${summary.grossMargin} (Expected: ₹3,200)`);
  console.log(`✓ Gross Margin (%): ${summary.grossMarginPercent.toFixed(2)}% (Expected: 44.44%)`);

  if (
    summary.grossSales !== 8000 ||
    summary.refunds !== 800 ||
    summary.netRevenue !== 7200 ||
    summary.totalOrders !== 3 ||
    Math.round(summary.aov) !== 2400 ||
    summary.fifoCogs !== 4000 ||
    summary.grossMargin !== 3200 ||
    Math.round(summary.grossMarginPercent) !== 44
  ) {
    throw new Error('TEST 2 FAILED: Executive financial calculations do not match expected values.');
  }

  // 5. Order Funnel Summary Test
  console.log('\n--- TEST 3: Order Funnel Summary Verification ---');
  const funnel = await getOrderFunnelSummary({
    startDate: testDateStart,
    endDate: testDateEnd,
  });
  if (funnel.confirmed < 1 || funnel.delivered < 2 || funnel.cancelled < 1) {
    throw new Error('TEST 3 FAILED: Order funnel status count mismatch.');
  }
  console.log('✓ TEST 3 PASSED: Order funnel status distribution verified.');

  // 6. Channel Summary Test
  console.log('\n--- TEST 4: Channel Summary Verification ---');
  const channelSummary = await getChannelSummary({
    startDate: testDateStart,
    endDate: testDateEnd,
  });
  const onlineChannel = channelSummary.find((c) => c.channel === SalesChannel.ONLINE);
  const directChannel = channelSummary.find((c) => c.channel === SalesChannel.DIRECT);

  if (!onlineChannel || !directChannel || onlineChannel.orderCount !== 2 || directChannel.orderCount !== 1) {
    throw new Error('TEST 4 FAILED: Channel order count aggregation mismatch.');
  }
  console.log('✓ TEST 4 PASSED: Sales channel breakdown (ONLINE vs DIRECT) verified.');

  // 7. Inventory Health Summary Test
  console.log('\n--- TEST 5: Inventory Health & Low-Stock Threshold ---');
  const invHealth = await getInventoryHealthSummary(DEFAULT_LOW_STOCK_THRESHOLD);
  if (invHealth.outOfStockCount < 1 || invHealth.lowStockCount < 1) {
    throw new Error('TEST 5 FAILED: Out-of-stock or low-stock detection failure.');
  }
  console.log(`✓ Out-of-Stock Count: ${invHealth.outOfStockCount}`);
  console.log(`✓ Low-Stock Count (<= ${DEFAULT_LOW_STOCK_THRESHOLD}): ${invHealth.lowStockCount}`);
  console.log(`✓ FIFO Inventory Valuation: ₹${invHealth.inventoryFifoValuation}`);
  console.log('✓ TEST 5 PASSED: Inventory health & configurable threshold verified.');

  // 8. Product Performance Summary Test
  console.log('\n--- TEST 6: Product Performance Summary ---');
  const prodPerf = await getProductPerformanceSummary({
    startDate: testDateStart,
    endDate: testDateEnd,
  });
  if (prodPerf.length === 0 || prodPerf[0].unitsSold < 4) {
    throw new Error('TEST 6 FAILED: Product performance units sold calculation error.');
  }
  console.log(`✓ Top Product: ${prodPerf[0].productName} | Units Sold: ${prodPerf[0].unitsSold} | Gross Sales: ₹${prodPerf[0].grossRevenue}`);
  console.log('✓ TEST 6 PASSED: Product performance aggregation verified.');

  // 9. Clean up test data
  console.log('\n--- Cleaning up Test Master Dataset ---');
  await prisma.refund.deleteMany({ where: { orderId: { in: [order1.id, order2.id, order3.id, order4.id] } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: [order1.id, order2.id, order3.id, order4.id] } } });
  await prisma.order.deleteMany({ where: { id: { in: [order1.id, order2.id, order3.id, order4.id] } } });
  await prisma.fifoLayer.deleteMany({ where: { variantId: testVariant.id } });
  await prisma.inventoryItem.deleteMany({ where: { variantId: { in: [testVariant.id, outOfStockVariant.id, lowStockVariant.id] } } });
  await prisma.productVariant.deleteMany({ where: { id: { in: [testVariant.id, outOfStockVariant.id, lowStockVariant.id] } } });
  await prisma.product.deleteMany({ where: { id: testProduct.id } });
  await prisma.category.deleteMany({ where: { id: testCategory.id } });
  console.log('✓ Cleanup complete.');

  console.log('\n===========================================================');
  console.log('🎉 ALL PHASE 13 STEP 1 VERIFICATION TESTS PASSED PERFECTLY!');
  console.log('===========================================================');
}

main()
  .catch((err) => {
    console.error('VERIFICATION FAILED:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
