import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/db/prisma';
import {
  getInventoryReportRows,
  getInventoryReportSummary,
  DEFAULT_LOW_STOCK_THRESHOLD,
} from '../lib/reports/report-service';

async function main() {
  console.log('===========================================================');
  console.log('  SIFR PHASE 13 — STEP 4: INVENTORY REPORT VERIFICATION');
  console.log('===========================================================');

  // 1. Verify Inventory report route exists
  const inventoryPageRoute = path.join(process.cwd(), 'app', 'admin', 'reports', 'inventory', 'page.tsx');
  if (!fs.existsSync(inventoryPageRoute)) {
    throw new Error('Item 1 Failed: app/admin/reports/inventory/page.tsx does not exist.');
  }
  console.log('✓ Item 1: Inventory report route app/admin/reports/inventory/page.tsx exists.');

  const inventoryPageContent = fs.readFileSync(inventoryPageRoute, 'utf8');

  // 2. Verify Admin authentication is enforced
  if (!inventoryPageContent.includes('requireAdminAuth()')) {
    throw new Error('Item 2 Failed: requireAdminAuth() admin authentication check missing.');
  }
  console.log('✓ Item 2: Admin authentication requireAdminAuth() is enforced.');

  // 3. Verify Inventory report components exist
  const filterBarPath = path.join(process.cwd(), 'components', 'admin', 'reports', 'InventoryReportFilterBar.tsx');
  const summaryCardsPath = path.join(process.cwd(), 'components', 'admin', 'reports', 'InventoryReportSummaryCards.tsx');
  const tablePath = path.join(process.cwd(), 'components', 'admin', 'reports', 'InventoryReportTable.tsx');
  
  if (!fs.existsSync(filterBarPath) || !fs.existsSync(summaryCardsPath) || !fs.existsSync(tablePath)) {
    throw new Error('Verification Failed: Inventory report components missing in components/admin/reports.');
  }
  console.log('✓ Item 3: All 3 Inventory report UI components verified.');

  // 4. Verify no duplicate formulas in React components (Item 14)
  const filterBarContent = fs.readFileSync(filterBarPath, 'utf8');
  const summaryCardsContent = fs.readFileSync(summaryCardsPath, 'utf8');
  const tableContent = fs.readFileSync(tablePath, 'utf8');

  if (
    filterBarContent.includes('physicalStock -') ||
    summaryCardsContent.includes('physicalStock -') ||
    tableContent.includes('physicalStock -') ||
    inventoryPageContent.includes('physicalStock -')
  ) {
    throw new Error('Item 14 Failed: Duplicate inventory formulas found in React components.');
  }
  console.log('✓ Item 14: No duplicate financial/inventory formulas in React components.');

  // 5. Setup Deterministic Test Master Data
  console.log('\n--- Setting Up Deterministic Inventory Test Fixtures ---');
  const testCategory = await prisma.category.create({
    data: {
      name: 'P13-S4 Test Category',
      slug: `p13-s4-cat-${Date.now()}`,
    },
  });

  const testProduct = await prisma.product.create({
    data: {
      name: 'P13-S4 Inventory Coat',
      slug: `p13-s4-coat-${Date.now()}`,
      categoryId: testCategory.id,
      gender: 'MEN',
      status: 'ACTIVE',
    },
  });

  // Variant A: Normal In Stock (Physical: 20, Reserved: 5 => Available: 15)
  // FIFO Layers: 10 @ 1000, 10 @ 1200 => FIFO Valuation = ₹22,000
  const variantA = await prisma.productVariant.create({
    data: {
      productId: testProduct.id,
      title: 'Size 40 / Black',
      sku: `SKU-P13-S4-A-${Date.now()}`,
      sellingPrice: 5000,
      mrp: 6000,
      costPrice: 1000,
      isAvailable: true,
    },
  });

  await prisma.inventoryItem.create({
    data: {
      variantId: variantA.id,
      physicalStock: 20,
      reservedStock: 5,
    },
  });

  await prisma.fifoLayer.createMany({
    data: [
      {
        variantId: variantA.id,
        initialQuantity: 10,
        remainingQuantity: 10,
        unitCost: 1000,
      },
      {
        variantId: variantA.id,
        initialQuantity: 10,
        remainingQuantity: 10,
        unitCost: 1200,
      },
    ],
  });

  // Variant B: Low Stock (Physical: 6, Reserved: 2 => Available: 4 <= 5)
  // FIFO Layer: 6 @ 1500 => FIFO Valuation = ₹9,000
  const variantB = await prisma.productVariant.create({
    data: {
      productId: testProduct.id,
      title: 'Size 42 / Navy',
      sku: `SKU-P13-S4-B-${Date.now()}`,
      sellingPrice: 5000,
      mrp: 6000,
      costPrice: 1500,
      isAvailable: true,
    },
  });

  await prisma.inventoryItem.create({
    data: {
      variantId: variantB.id,
      physicalStock: 6,
      reservedStock: 2,
    },
  });

  await prisma.fifoLayer.create({
    data: {
      variantId: variantB.id,
      initialQuantity: 6,
      remainingQuantity: 6,
      unitCost: 1500,
    },
  });

  // Variant C: Out of Stock (Physical: 3, Reserved: 3 => Available: 0)
  const variantC = await prisma.productVariant.create({
    data: {
      productId: testProduct.id,
      title: 'Size 44 / Red',
      sku: `SKU-P13-S4-C-${Date.now()}`,
      sellingPrice: 5000,
      mrp: 6000,
      costPrice: 1500,
      isAvailable: true,
    },
  });

  await prisma.inventoryItem.create({
    data: {
      variantId: variantC.id,
      physicalStock: 3,
      reservedStock: 3,
    },
  });

  console.log('✓ Test fixtures successfully created.');

  // 6. Test Inventory Report Aggregations (Items 3-10)
  console.log('\n--- Testing Inventory Aggregation & Stock Calculations ---');

  const rowsResult = await getInventoryReportRows({
    search: `SKU-P13-S4-`,
    lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
  });

  if (rowsResult.totalCount !== 3) {
    throw new Error(`Item 3 Failed: Expected 3 test rows, found ${rowsResult.totalCount}`);
  }
  console.log('✓ Item 3 & 10: Product/variant-level aggregation verified.');

  const rowA = rowsResult.rows.find((r) => r.variantId === variantA.id);
  const rowB = rowsResult.rows.find((r) => r.variantId === variantB.id);
  const rowC = rowsResult.rows.find((r) => r.variantId === variantC.id);

  if (!rowA || !rowB || !rowC) {
    throw new Error('Item 10 Failed: Could not locate variant rows.');
  }

  // Check Physical, Reserved, Available Stock (Items 4, 5, 6)
  if (rowA.physicalStock !== 20 || rowA.reservedStock !== 5 || rowA.availableStock !== 15) {
    throw new Error('Item 4/5/6 Failed: Variant A stock calculations incorrect.');
  }
  console.log('✓ Items 4, 5, 6: Physical (20), Reserved (5), and Available (15) stock verified.');

  // Check Low Stock Threshold & Out of Stock Classification (Items 7 & 8)
  if (rowA.stockStatus !== 'IN_STOCK') {
    throw new Error(`Item 7/8 Failed: Variant A expected IN_STOCK, got ${rowA.stockStatus}`);
  }
  if (rowB.stockStatus !== 'LOW_STOCK' || rowB.availableStock !== 4) {
    throw new Error(`Item 8 Failed: Variant B expected LOW_STOCK (<= 5), got ${rowB.stockStatus}`);
  }
  if (rowC.stockStatus !== 'OUT_OF_STOCK' || rowC.availableStock !== 0) {
    throw new Error(`Item 7 Failed: Variant C expected OUT_OF_STOCK, got ${rowC.stockStatus}`);
  }
  console.log('✓ Items 7 & 8: Low stock (<= 5) and Out-of-stock (0) classifications verified.');

  // Check FIFO Valuation Calculation (Item 9)
  if (rowA.fifoValuation !== 22000) {
    throw new Error(`Item 9 Failed: Variant A FIFO valuation expected 22000, got ${rowA.fifoValuation}`);
  }
  if (rowB.fifoValuation !== 9000) {
    throw new Error(`Item 9 Failed: Variant B FIFO valuation expected 9000, got ${rowB.fifoValuation}`);
  }
  console.log('✓ Item 9: FIFO inventory cost valuation calculation verified.');

  // 7. Test Server-Side Pagination (Item 11)
  console.log('\n--- Testing Server-Side Pagination ---');
  const p1 = await getInventoryReportRows({
    search: `SKU-P13-S4-`,
    pageSize: 2,
    page: 1,
  });
  const p2 = await getInventoryReportRows({
    search: `SKU-P13-S4-`,
    pageSize: 2,
    page: 2,
  });

  if (p1.rows.length !== 2 || p2.rows.length !== 1 || p1.totalPages !== 2) {
    throw new Error('Item 11 Failed: Server-side pagination parameters skip/take error.');
  }
  console.log('✓ Item 11: Server-side pagination verified (page 1: 2 rows, page 2: 1 row).');

  // 8. Test Empty State & Zero-Value Safety (Items 12 & 13)
  console.log('\n--- Testing Empty State & Zero-Value Safety ---');
  const emptyRows = await getInventoryReportRows({
    search: 'NON_EXISTENT_SKU_QUERY_XYZ_123',
  });

  if (emptyRows.totalCount !== 0 || emptyRows.rows.length !== 0 || emptyRows.totalPages !== 1) {
    throw new Error('Item 12 Failed: Empty state query did not return 0 count.');
  }

  const overallSummary = await getInventoryReportSummary(DEFAULT_LOW_STOCK_THRESHOLD);
  if (
    typeof overallSummary.totalSkus !== 'number' ||
    typeof overallSummary.inventoryFifoValuation !== 'number' ||
    isNaN(overallSummary.inventoryFifoValuation)
  ) {
    throw new Error('Item 13 Failed: Zero-value safety check failed.');
  }
  console.log('✓ Items 12 & 13: Empty state handling and zero-value safety verified.');

  // 9. Clean Up Test Data (Item 15)
  console.log('\n--- Cleaning Up Deterministic Test Fixtures ---');
  await prisma.fifoLayer.deleteMany({
    where: { variantId: { in: [variantA.id, variantB.id, variantC.id] } },
  });
  await prisma.inventoryItem.deleteMany({
    where: { variantId: { in: [variantA.id, variantB.id, variantC.id] } },
  });
  await prisma.productVariant.deleteMany({
    where: { id: { in: [variantA.id, variantB.id, variantC.id] } },
  });
  await prisma.product.deleteMany({ where: { id: testProduct.id } });
  await prisma.category.deleteMany({ where: { id: testCategory.id } });
  console.log('✓ Item 15: Cleanup of test fixtures completed cleanly.');

  console.log('\n===========================================================');
  console.log('🎉 ALL 15 STEP 4 INVENTORY REPORT VERIFICATIONS PASSED!');
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
