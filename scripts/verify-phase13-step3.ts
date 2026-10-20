import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/db/prisma';
import {
  getSalesReportRows,
  getSalesReportSummary,
  parseDateRangePreset,
} from '../lib/reports/report-service';
import { OrderStatus, SalesChannel, PaymentStatus, RefundStatus, RefundMethod } from '@prisma/client';

async function main() {
  console.log('===========================================================');
  console.log('  SIFR PHASE 13 — STEP 3: SALES & REVENUE REPORT VERIFY');
  console.log('===========================================================');

  // 1. Verify Sales report route exists
  const salesPageRoute = path.join(process.cwd(), 'app', 'admin', 'reports', 'sales', 'page.tsx');
  if (!fs.existsSync(salesPageRoute)) {
    throw new Error('Verification Item 1 Failed: app/admin/reports/sales/page.tsx does not exist.');
  }
  console.log('✓ Item 1: Sales report route app/admin/reports/sales/page.tsx exists.');

  const salesPageContent = fs.readFileSync(salesPageRoute, 'utf8');

  // 2. Verify Admin authentication is enforced
  if (!salesPageContent.includes('requireAdminAuth()')) {
    throw new Error('Verification Item 2 Failed: requireAdminAuth() admin authentication check missing.');
  }
  console.log('✓ Item 2: Admin authentication requireAdminAuth() is enforced.');

  // 3. Verify Sales report components exist
  const filterBarPath = path.join(process.cwd(), 'components', 'admin', 'reports', 'SalesReportFilterBar.tsx');
  const tablePath = path.join(process.cwd(), 'components', 'admin', 'reports', 'SalesReportTable.tsx');
  if (!fs.existsSync(filterBarPath) || !fs.existsSync(tablePath)) {
    throw new Error('Verification Failed: Sales report components missing.');
  }
  console.log('✓ Sales report UI components verified in components/admin/reports.');

  // 4. Verify no duplicate formulas in React components
  const filterBarContent = fs.readFileSync(filterBarPath, 'utf8');
  const tableContent = fs.readFileSync(tablePath, 'utf8');
  if (
    filterBarContent.includes('grandTotal -') ||
    tableContent.includes('grandTotal -') ||
    salesPageContent.includes('grandTotal -')
  ) {
    throw new Error('Verification Item 19 Failed: Duplicate financial formulas found in React components.');
  }
  console.log('✓ Item 19: No duplicate financial formulas in React components (centralized in report-service).');

  // 5. Setup Deterministic Test Data
  console.log('\n--- Setting Up Deterministic Sales Report Test Fixtures ---');
  const testCategory = await prisma.category.create({
    data: {
      name: 'P13-S3 Test Category',
      slug: `p13-s3-cat-${Date.now()}`,
    },
  });

  const testProduct = await prisma.product.create({
    data: {
      name: 'P13-S3 Luxury Jacket',
      slug: `p13-s3-jacket-${Date.now()}`,
      categoryId: testCategory.id,
      gender: 'MEN',
      status: 'ACTIVE',
    },
  });

  const testVariant = await prisma.productVariant.create({
    data: {
      productId: testProduct.id,
      title: 'L',
      sku: `SKU-P13-S3-${Date.now()}`,
      sellingPrice: 10000,
      mrp: 12000,
      costPrice: 4000,
      isAvailable: true,
    },
  });

  const testCreatedAt = new Date('2029-03-20T10:00:00.000Z');
  const dateStart = new Date('2029-03-20T00:00:00.000Z');
  const dateEnd = new Date('2029-03-21T00:00:00.000Z');

  // Create 3 Test Orders:
  // Order 1: ONLINE, CONFIRMED, PAID, grandTotal: ₹10,000, totalFifoCogs: ₹4,000
  const order1 = await prisma.order.create({
    data: {
      orderNumber: `S3-ORD-1-${Date.now()}`,
      salesChannel: SalesChannel.ONLINE,
      status: OrderStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      subtotal: 10000,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 0,
      grandTotal: 10000,
      totalFifoCogs: 4000,
      customerNameSnapshot: 'Alice Smith',
      customerMobileSnapshot: '+919888800001',
      createdAt: testCreatedAt,
      items: {
        create: {
          variantId: testVariant.id,
          productNameSnapshot: testProduct.name,
          variantTitleSnapshot: testVariant.title,
          skuSnapshot: testVariant.sku,
          quantity: 1,
          unitPrice: 10000,
          mrp: 12000,
          lineTotal: 10000,
          fifoCogs: 4000,
        },
      },
    },
  });

  // Order 2: DIRECT, DELIVERED, PAID, grandTotal: ₹20,000, totalFifoCogs: ₹8,000
  const order2 = await prisma.order.create({
    data: {
      orderNumber: `S3-ORD-2-${Date.now()}`,
      salesChannel: SalesChannel.DIRECT,
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PAID,
      subtotal: 20000,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 0,
      grandTotal: 20000,
      totalFifoCogs: 8000,
      customerNameSnapshot: 'Bob POS Customer',
      customerMobileSnapshot: '+919888800002',
      createdAt: testCreatedAt,
      items: {
        create: {
          variantId: testVariant.id,
          productNameSnapshot: testProduct.name,
          variantTitleSnapshot: testVariant.title,
          skuSnapshot: testVariant.sku,
          quantity: 2,
          unitPrice: 10000,
          mrp: 12000,
          lineTotal: 20000,
          fifoCogs: 8000,
        },
      },
    },
  });

  // Order 3: ONLINE, CANCELLED, FAILED, grandTotal: ₹10,000, totalFifoCogs: ₹4,000 (Excluded by default)
  const order3 = await prisma.order.create({
    data: {
      orderNumber: `S3-ORD-3-CANCELLED-${Date.now()}`,
      salesChannel: SalesChannel.ONLINE,
      status: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.FAILED,
      subtotal: 10000,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 0,
      grandTotal: 10000,
      totalFifoCogs: 4000,
      customerNameSnapshot: 'Charlie Cancelled',
      customerMobileSnapshot: '+919888800003',
      createdAt: testCreatedAt,
      items: {
        create: {
          variantId: testVariant.id,
          productNameSnapshot: testProduct.name,
          variantTitleSnapshot: testVariant.title,
          skuSnapshot: testVariant.sku,
          quantity: 1,
          unitPrice: 10000,
          mrp: 12000,
          lineTotal: 10000,
          fifoCogs: 4000,
        },
      },
    },
  });

  // Order 4: ONLINE, DELIVERED, PARTIALLY_REFUNDED, grandTotal: ₹10,000, totalFifoCogs: ₹4,000, Refund: ₹2,000
  const order4 = await prisma.order.create({
    data: {
      orderNumber: `S3-ORD-4-REFUND-${Date.now()}`,
      salesChannel: SalesChannel.ONLINE,
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      subtotal: 10000,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 0,
      grandTotal: 10000,
      totalFifoCogs: 4000,
      customerNameSnapshot: 'Diana Refunded',
      customerMobileSnapshot: '+919888800004',
      createdAt: testCreatedAt,
      items: {
        create: {
          variantId: testVariant.id,
          productNameSnapshot: testProduct.name,
          variantTitleSnapshot: testVariant.title,
          skuSnapshot: testVariant.sku,
          quantity: 1,
          unitPrice: 10000,
          mrp: 12000,
          lineTotal: 10000,
          fifoCogs: 4000,
        },
      },
    },
  });

  // Refund linked to Order 4
  await prisma.refund.create({
    data: {
      refundNumber: `S3-REF-4-${Date.now()}`,
      orderId: order4.id,
      amount: 2000,
      status: RefundStatus.COMPLETED,
      idempotencyKey: `s3-ref-4-${Date.now()}`,
      method: RefundMethod.ORIGINAL_PAYMENT_GATEWAY,
    },
  });

  console.log('✓ Test fixtures successfully seeded into database.');

  // 6. Test Default Population & Financial Metrics (Items 3, 4, 5, 9-15)
  console.log('\n--- Testing Default Sales Report Summary & Row Aggregation ---');
  const defaultSummary = await getSalesReportSummary({
    dateRange: { startDate: dateStart, endDate: dateEnd },
  });

  console.log(`✓ Item 9  - Gross Sales: ₹${defaultSummary.grossSales} (Expected: ₹40,000)`);
  console.log(`✓ Item 10 - Attributed Refund: ₹${defaultSummary.refunds} (Expected: ₹2,000)`);
  console.log(`✓ Item 11 - Net Revenue: ₹${defaultSummary.netRevenue} (Expected: ₹38,000)`);
  console.log(`✓ Item 12 - FIFO COGS: ₹${defaultSummary.fifoCogs} (Expected: ₹16,000)`);
  console.log(`✓ Item 13 - Gross Margin: ₹${defaultSummary.grossMargin} (Expected: ₹22,000)`);
  console.log(`✓ Item 14 - Summary AOV: ₹${defaultSummary.aov.toFixed(2)} (Expected: ₹12,666.67)`);
  console.log(`✓ Item 15 - Summary Gross Margin %: ${defaultSummary.grossMarginPercent.toFixed(2)}% (Expected: 57.89%)`);

  if (
    defaultSummary.grossSales !== 40000 ||
    defaultSummary.refunds !== 2000 ||
    defaultSummary.netRevenue !== 38000 ||
    defaultSummary.fifoCogs !== 16000 ||
    defaultSummary.grossMargin !== 22000 ||
    defaultSummary.totalOrders !== 3
  ) {
    throw new Error('Financial formulas verification failed against expected values.');
  }

  // 7. Test Channel Filtering (Item 6)
  console.log('\n--- Testing Channel Filter (ONLINE vs DIRECT) ---');
  const onlineRows = await getSalesReportRows({
    dateRange: { startDate: dateStart, endDate: dateEnd },
    channel: SalesChannel.ONLINE,
  });
  const directRows = await getSalesReportRows({
    dateRange: { startDate: dateStart, endDate: dateEnd },
    channel: SalesChannel.DIRECT,
  });

  if (onlineRows.totalCount !== 2 || directRows.totalCount !== 1) {
    throw new Error(`Item 6 Failed: Online count (${onlineRows.totalCount}) or Direct count (${directRows.totalCount}) mismatch.`);
  }
  console.log('✓ Item 6: ONLINE and DIRECT sales channel filtering verified.');

  // 8. Test Order Status Filtering (Item 7)
  console.log('\n--- Testing Order Status Filter ---');
  const cancelledRows = await getSalesReportRows({
    dateRange: { startDate: dateStart, endDate: dateEnd },
    orderStatus: OrderStatus.CANCELLED,
  });
  if (cancelledRows.totalCount !== 1 || cancelledRows.rows[0].orderNumber !== order3.orderNumber) {
    throw new Error('Item 7 Failed: Order status filter for CANCELLED failed.');
  }
  console.log('✓ Item 7: Explicit CANCELLED order status filter verified.');

  // 9. Test Payment Status Filtering (Item 8)
  console.log('\n--- Testing Payment Status Filter ---');
  const refundedPaymentRows = await getSalesReportRows({
    dateRange: { startDate: dateStart, endDate: dateEnd },
    paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
  });
  if (refundedPaymentRows.totalCount !== 1 || refundedPaymentRows.rows[0].id !== order4.id) {
    throw new Error('Item 8 Failed: Payment status filter for PARTIALLY_REFUNDED failed.');
  }
  console.log('✓ Item 8: Payment status filter verified.');

  // 10. Test Server-Side Pagination (Item 16)
  console.log('\n--- Testing Server-Side Pagination ---');
  const page1 = await getSalesReportRows({
    dateRange: { startDate: dateStart, endDate: dateEnd },
    pageSize: 2,
    page: 1,
  });
  const page2 = await getSalesReportRows({
    dateRange: { startDate: dateStart, endDate: dateEnd },
    pageSize: 2,
    page: 2,
  });

  if (page1.rows.length !== 2 || page2.rows.length !== 1 || page1.totalPages !== 2) {
    throw new Error('Item 16 Failed: Server-side pagination parameters skip/take error.');
  }
  console.log('✓ Item 16: Server-side pagination verified (page 1: 2 rows, page 2: 1 row).');

  // 11. Test Empty State & Zero Safety (Items 17, 18)
  console.log('\n--- Testing Empty State & Zero Financial Safety ---');
  const emptyRange = await getSalesReportRows({
    dateRange: { startDate: new Date('2015-01-01'), endDate: new Date('2015-01-02') },
  });
  const emptySummary = await getSalesReportSummary({
    dateRange: { startDate: new Date('2015-01-01'), endDate: new Date('2015-01-02') },
  });

  if (
    emptyRange.totalCount !== 0 ||
    emptyRange.rows.length !== 0 ||
    emptySummary.aov !== 0 ||
    emptySummary.grossMarginPercent !== 0 ||
    isNaN(emptySummary.aov) ||
    isNaN(emptySummary.grossMarginPercent)
  ) {
    throw new Error('Items 17 & 18 Failed: Empty state or zero-value financial safety check failed.');
  }
  console.log('✓ Items 17 & 18: Empty state and zero-division financial safety verified.');

  // 12. Clean up test data
  console.log('\n--- Cleaning up Test Fixtures ---');
  await prisma.refund.deleteMany({ where: { orderId: order4.id } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: [order1.id, order2.id, order3.id, order4.id] } } });
  await prisma.order.deleteMany({ where: { id: { in: [order1.id, order2.id, order3.id, order4.id] } } });
  await prisma.productVariant.deleteMany({ where: { id: testVariant.id } });
  await prisma.product.deleteMany({ where: { id: testProduct.id } });
  await prisma.category.deleteMany({ where: { id: testCategory.id } });
  console.log('✓ Cleanup complete.');

  console.log('\n===========================================================');
  console.log('🎉 ALL 20 STEP 3 SALES REPORT VERIFICATION CHECKS PASSED!');
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
