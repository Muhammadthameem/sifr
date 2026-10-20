import { prisma } from '../lib/db/prisma';
import {
  OrderStatus,
  SalesChannel,
  PaymentStatus,
  ProductStatus,
} from '@prisma/client';
import { getOrders, deleteContactedOrderAction } from '../lib/actions/order-actions';
import { queryAdminOrders } from '../lib/ordering/order-query';
import { createWhatsAppOrder, transitionOrderStatus, deleteContactedOrder } from '../lib/ordering/order-engine';
import crypto from 'crypto';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

async function runPhaseAAdminOrdersTests() {
  console.log('================================================================');
  console.log('PHASE A ACCEPTANCE TESTS — ADMIN ORDERS LIST & NAVIGATION');
  console.log('================================================================\n');

  const runId = Math.floor(100000 + Math.random() * 900000).toString();

  // --- Step 0: Test Fixtures Setup ---
  console.log('--- Step 0: Test Fixtures Setup ---');

  const category = await prisma.category.create({
    data: {
      name: `AdminOrders Cat ${runId}`,
      slug: `admin-orders-cat-${runId}`,
    },
  });

  const product = await prisma.product.create({
    data: {
      name: `AdminOrders Abaya ${runId}`,
      slug: `admin-orders-abaya-${runId}`,
      status: ProductStatus.ACTIVE,
      categoryId: category.id,
      shippingCharge: 70.0,
      variants: {
        create: {
          title: 'Onyx Silk',
          sku: `SKU-ADM-${runId}`,
          sellingPrice: 2400.0,
          mrp: 3000.0,
          isAvailable: true,
          shippingCost: 70.0,
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

  await prisma.fifoLayer.create({
    data: {
      variantId: variant.id,
      initialQuantity: 50,
      remainingQuantity: 50,
      unitCost: 1000.0,
    },
  });

  // Create 3 test orders with distinct properties:
  // Order 1: CONTACTED, WHATSAPP, DUE, unassigned shipment
  const order1 = await createWhatsAppOrder({
    creationIdempotencyKey: `adm-wa-1-${runId}`,
    customer: {
      name: `Zoya Farooq ${runId}`,
      mobile: `98711${runId.slice(0, 5)}`,
      address: 'House 11, Green Park',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110016',
      email: `zoya-${runId}@example.com`,
    },
    items: [{ variantId: variant.id, quantity: 1 }],
  });

  // Order 2: CONFIRMED, WHATSAPP, DUE, dispatched later
  const order2 = await createWhatsAppOrder({
    creationIdempotencyKey: `adm-wa-2-${runId}`,
    customer: {
      name: `Bilal Siddiqui ${runId}`,
      mobile: `98722${runId.slice(0, 5)}`,
      address: 'Flat 402, Sea Pearl',
      city: 'Kochi',
      state: 'Kerala',
      pincode: '682001',
    },
    items: [{ variantId: variant.id, quantity: 2 }],
  });

  await transitionOrderStatus({
    orderId: order2.id,
    idempotencyKey: `trans-adm-conf-${runId}`,
    targetStatus: OrderStatus.CONFIRMED,
  });

  // Order 3: DISPATCHED, WHATSAPP, DUE, with tracking details
  const order3 = await createWhatsAppOrder({
    creationIdempotencyKey: `adm-wa-3-${runId}`,
    customer: {
      name: `Tariq Mansoor ${runId}`,
      mobile: `98733${runId.slice(0, 5)}`,
      address: 'Plot 55, Lake View',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500001',
    },
    items: [{ variantId: variant.id, quantity: 1 }],
  });

  await transitionOrderStatus({
    orderId: order3.id,
    idempotencyKey: `trans-adm-conf3-${runId}`,
    targetStatus: OrderStatus.CONFIRMED,
  });

  const trackingId = `TRK-${runId}-777`;
  await transitionOrderStatus({
    orderId: order3.id,
    idempotencyKey: `trans-adm-disp3-${runId}`,
    targetStatus: OrderStatus.DISPATCHED,
    shipment: {
      courierName: 'BlueDart',
      trackingId,
      trackingUrl: `https://bluedart.com/track/${trackingId}`,
    },
  });

  console.log(`  ✓ Created Order 1: #${order1.orderNumber} (CONTACTED)`);
  console.log(`  ✓ Created Order 2: #${order2.orderNumber} (CONFIRMED)`);
  console.log(`  ✓ Created Order 3: #${order3.orderNumber} (DISPATCHED with tracking ID ${trackingId})`);

  // ================================================================
  // Test 0: Server Action Authentication Guards
  // ================================================================
  console.log('\n--- Test 0: Server Action Auth Guards ---');
  let getOrdersAuthFailed = false;
  try {
    await getOrders();
  } catch (err: any) {
    getOrdersAuthFailed = true;
    console.log(`  ✓ getOrders rejected unauthenticated call (${err.message || 'redirect to login'})`);
  }
  assert(getOrdersAuthFailed, 'getOrders MUST reject unauthenticated requests');

  let deleteActionAuthFailed = false;
  try {
    const res = await deleteContactedOrderAction(order1.id);
    if (!res.success) {
      deleteActionAuthFailed = true;
      console.log(`  ✓ deleteContactedOrderAction rejected unauthenticated call (${res.error})`);
    }
  } catch (err: any) {
    deleteActionAuthFailed = true;
    console.log(`  ✓ deleteContactedOrderAction threw auth redirect on unauthenticated call`);
  }
  assert(deleteActionAuthFailed, 'deleteContactedOrderAction MUST reject unauthenticated requests');

  // ================================================================
  // Test 1: Order Data Shape & Required Fields
  // ================================================================
  console.log('\n--- Test 1: Required Order Row Fields in queryAdminOrders ---');
  const resultAll = await queryAdminOrders({ limit: 10 });
  assert(resultAll.orders.length > 0, 'queryAdminOrders must return orders array');
  assert(resultAll.total >= 3, `Expected at least 3 orders, got ${resultAll.total}`);

  const row3 = resultAll.orders.find((o) => o.id === order3.id);
  assert(row3 !== undefined, `Order 3 (#${order3.orderNumber}) must be in results`);
  assert(row3!.orderNumber === order3.orderNumber, 'Missing/invalid orderNumber');
  assert(row3!.salesChannel === 'WHATSAPP', 'Missing/invalid salesChannel');
  assert(row3!.status === 'DISPATCHED', 'Missing/invalid status');
  assert(row3!.paymentStatus === 'DUE', 'Missing/invalid paymentStatus');
  assert(row3!.customerNameSnapshot === `Tariq Mansoor ${runId}`, 'Missing/invalid customer name');
  assert(row3!.customerMobileSnapshot === `+9198733${runId.slice(0, 5)}` || row3!.customerMobileSnapshot.includes(runId.slice(0, 5)), 'Missing customer mobile');
  assert(row3!.grandTotal > 0, 'grandTotal must be positive number');
  assert(row3!.itemsCount === 1, 'itemsCount must be 1');
  assert(row3!.shipment !== null, 'shipment should not be null for DISPATCHED order');
  assert(row3!.shipment?.trackingId === trackingId, 'shipment trackingId mismatch');
  assert(row3!.shipment?.courierName === 'BlueDart', 'shipment courierName mismatch');
  console.log('  ✓ All required table fields populated with plain, client-safe types');

  // ================================================================
  // Test 2: Search by Order Number
  // ================================================================
  console.log('\n--- Test 2: Search by Order Number ---');
  const searchByOrderNum = await queryAdminOrders({ search: order1.orderNumber });
  assert(searchByOrderNum.orders.some((o) => o.id === order1.id), `Search failed for orderNumber ${order1.orderNumber}`);
  assert(!searchByOrderNum.orders.some((o) => o.id === order2.id), 'Search returned unrelated order');
  console.log(`  ✓ Search by orderNumber '${order1.orderNumber}' returned exact match`);

  // ================================================================
  // Test 3: Search by Customer Name & Mobile
  // ================================================================
  console.log('\n--- Test 3: Search by Customer Name & Mobile ---');
  const searchByName = await queryAdminOrders({ search: `Bilal Siddiqui ${runId}` });
  assert(searchByName.orders.some((o) => o.id === order2.id), 'Search failed for customer name');

  const searchByMobile = await queryAdminOrders({ search: runId.slice(0, 5) });
  assert(searchByMobile.orders.length >= 3, 'Search by mobile fragment failed');
  console.log('  ✓ Search by customer name and mobile substring succeeded');

  // ================================================================
  // Test 4: Search by Item SKU
  // ================================================================
  console.log('\n--- Test 4: Search by Item SKU ---');
  const searchBySku = await queryAdminOrders({ search: `SKU-ADM-${runId}` });
  assert(searchBySku.orders.some((o) => o.id === order1.id), 'Search failed for SKU');
  assert(searchBySku.orders.some((o) => o.id === order2.id), 'Search failed for SKU');
  assert(searchBySku.orders.some((o) => o.id === order3.id), 'Search failed for SKU');
  console.log(`  ✓ Search by SKU 'SKU-ADM-${runId}' returned all 3 matching orders`);

  // ================================================================
  // Test 5: Search by Shipment Tracking ID
  // ================================================================
  console.log('\n--- Test 5: Search by Tracking ID ---');
  const searchByTracking = await queryAdminOrders({ search: trackingId });
  assert(searchByTracking.orders.length === 1, `Expected 1 match for tracking ID, got ${searchByTracking.orders.length}`);
  assert(searchByTracking.orders[0].id === order3.id, 'Tracking search returned wrong order');
  console.log(`  ✓ Search by Tracking ID '${trackingId}' returned exact order #${order3.orderNumber}`);

  // ================================================================
  // Test 6: Filter by Order Status
  // ================================================================
  console.log('\n--- Test 6: Filter by Order Status ---');
  const filterContacted = await queryAdminOrders({ status: OrderStatus.CONTACTED, search: runId });
  assert(filterContacted.orders.length === 1 && filterContacted.orders[0].id === order1.id, 'Filter CONTACTED failed');

  const filterConfirmed = await queryAdminOrders({ status: OrderStatus.CONFIRMED, search: runId });
  assert(filterConfirmed.orders.length === 1 && filterConfirmed.orders[0].id === order2.id, 'Filter CONFIRMED failed');

  const filterDispatched = await queryAdminOrders({ status: OrderStatus.DISPATCHED, search: runId });
  assert(filterDispatched.orders.length === 1 && filterDispatched.orders[0].id === order3.id, 'Filter DISPATCHED failed');
  console.log('  ✓ Status filters (CONTACTED, CONFIRMED, DISPATCHED) verified');

  // ================================================================
  // Test 7: Filter by Payment Status & Sales Channel
  // ================================================================
  console.log('\n--- Test 7: Filter by Payment Status & Channel ---');
  const filterDue = await queryAdminOrders({ paymentStatus: PaymentStatus.DUE, search: runId });
  assert(filterDue.orders.length === 3, 'Filter paymentStatus DUE failed');

  const filterPaid = await queryAdminOrders({ paymentStatus: PaymentStatus.PAID, search: runId });
  assert(filterPaid.orders.length === 0, 'Filter paymentStatus PAID should have 0 matches for these test orders');

  const filterWhatsapp = await queryAdminOrders({ salesChannel: SalesChannel.WHATSAPP, search: runId });
  assert(filterWhatsapp.orders.length === 3, 'Filter salesChannel WHATSAPP failed');

  const filterOnline = await queryAdminOrders({ salesChannel: SalesChannel.ONLINE, search: runId });
  assert(filterOnline.orders.length === 0, 'Filter salesChannel ONLINE should have 0 matches for these test orders');
  console.log('  ✓ Payment status and sales channel filters verified');

  // ================================================================
  // Test 8: Filter by Date Range
  // ================================================================
  console.log('\n--- Test 8: Filter by Date Range ---');
  const todayStr = new Date().toISOString().split('T')[0];
  const filterToday = await queryAdminOrders({ startDate: todayStr, endDate: todayStr, search: runId });
  assert(filterToday.orders.length === 3, `Expected 3 orders created today, got ${filterToday.orders.length}`);

  const filterPast = await queryAdminOrders({ startDate: '2020-01-01', endDate: '2020-01-02', search: runId });
  assert(filterPast.orders.length === 0, 'Past date filter should have 0 matches');
  console.log('  ✓ Date range filter verified');

  // ================================================================
  // Test 9: Sorting
  // ================================================================
  console.log('\n--- Test 9: Sorting (Date & Total) ---');
  const sortTotalDesc = await queryAdminOrders({ search: runId, sortBy: 'grandTotal', sortOrder: 'desc' });
  assert(sortTotalDesc.orders[0].grandTotal >= sortTotalDesc.orders[sortTotalDesc.orders.length - 1].grandTotal, 'Sort total desc failed');
  // Order 2 has quantity 2 (higher total)
  assert(sortTotalDesc.orders[0].id === order2.id, `Order 2 with 2 qty should be highest total, got #${sortTotalDesc.orders[0].orderNumber}`);

  const sortTotalAsc = await queryAdminOrders({ search: runId, sortBy: 'grandTotal', sortOrder: 'asc' });
  assert(sortTotalAsc.orders[0].grandTotal <= sortTotalAsc.orders[sortTotalAsc.orders.length - 1].grandTotal, 'Sort total asc failed');
  console.log('  ✓ Sorting by grandTotal (asc/desc) verified');

  // ================================================================
  // Test 10: Pagination
  // ================================================================
  console.log('\n--- Test 10: Pagination ---');
  const page1 = await queryAdminOrders({ search: runId, limit: 2, page: 1 });
  assert(page1.orders.length === 2, `Page 1 should have 2 orders, got ${page1.orders.length}`);
  assert(page1.total === 3, `Total should be 3, got ${page1.total}`);
  assert(page1.totalPages === 2, `Total pages should be 2, got ${page1.totalPages}`);

  const page2 = await queryAdminOrders({ search: runId, limit: 2, page: 2 });
  assert(page2.orders.length === 1, `Page 2 should have 1 order, got ${page2.orders.length}`);
  assert(page1.orders[0].id !== page2.orders[0].id, 'Page 1 and Page 2 contain duplicate orders');
  console.log('  ✓ Pagination (limit, page, totalPages, total) verified');

  // ================================================================
  // Test 11: CONTACTED Delete Safety Invariants
  // ================================================================
  console.log('\n--- Test 11: Deletion Permissions Invariant ---');
  // Order 1 is CONTACTED: Can be deleted
  const delRes1 = await deleteContactedOrder(order1.id);
  assert(delRes1.success, 'Failed to delete CONTACTED order');

  const checkOrder1 = await prisma.order.findUnique({ where: { id: order1.id } });
  assert(checkOrder1 === null, 'Deleted CONTACTED order still found in database');
  console.log('  ✓ CONTACTED order 1 successfully deleted');

  // Order 2 is CONFIRMED: CANNOT be deleted
  let order2Error: any = null;
  try {
    await deleteContactedOrder(order2.id);
  } catch (err: any) {
    order2Error = err;
  }
  assert(order2Error !== null, 'Deleting CONFIRMED order must be rejected');
  assert(order2Error.message.includes('CANNOT_DELETE_ORDER'), `Unexpected error: ${order2Error.message}`);
  console.log('  ✓ Deletion strictly rejected for CONFIRMED order');

  // Order 3 is DISPATCHED: CANNOT be deleted
  let order3Error: any = null;
  try {
    await deleteContactedOrder(order3.id);
  } catch (err: any) {
    order3Error = err;
  }
  assert(order3Error !== null, 'Deleting DISPATCHED order must be rejected');
  assert(order3Error.message.includes('CANNOT_DELETE_ORDER'), `Unexpected error: ${order3Error.message}`);
  console.log('  ✓ Deletion strictly rejected for DISPATCHED order');

  // ================================================================
  // Test 12: Zero Mutation Invariant
  // ================================================================
  console.log('\n--- Test 12: Zero Mutation Invariant from Viewing/Searching ---');
  const invBefore = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  // Perform multiple searches and filter calls
  await queryAdminOrders({ search: 'something' });
  await queryAdminOrders({ status: OrderStatus.CONFIRMED });
  await queryAdminOrders({ paymentStatus: PaymentStatus.DUE });
  const invAfter = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });

  assert(invBefore.physicalStock === invAfter.physicalStock, 'Physical stock was modified by viewing/searching!');
  assert(invBefore.reservedStock === invAfter.reservedStock, 'Reserved stock was modified by viewing/searching!');
  console.log('  ✓ Verified ZERO inventory mutations from viewing, filtering, and searching orders');

  // ================================================================
  // Cleanup Test Fixtures
  // ================================================================
  console.log('\n--- Cleaning Up Test Fixtures ---');
  await prisma.shipment.deleteMany({ where: { orderId: order3.id } });
  await prisma.orderStatusTransition.deleteMany({ where: { orderId: { in: [order2.id, order3.id] } } });
  const notifs = await prisma.notification.findMany({
    where: { orderId: { in: [order2.id, order3.id] } },
    select: { id: true },
  });
  if (notifs.length > 0) {
    const notifIds = notifs.map((n) => n.id);
    await prisma.notificationAttempt.deleteMany({ where: { notificationId: { in: notifIds } } });
    await prisma.notification.deleteMany({ where: { id: { in: notifIds } } });
  }
  await prisma.orderItem.deleteMany({ where: { orderId: { in: [order2.id, order3.id] } } });
  await prisma.order.deleteMany({ where: { id: { in: [order2.id, order3.id] } } });
  await prisma.inventoryMovement.deleteMany({ where: { variantId: variant.id } });
  await prisma.fifoLayer.deleteMany({ where: { variantId: variant.id } });
  await prisma.inventoryItem.deleteMany({ where: { variantId: variant.id } });
  await prisma.productVariant.deleteMany({ where: { productId: product.id } });
  await prisma.product.deleteMany({ where: { id: product.id } });
  await prisma.category.deleteMany({ where: { id: category.id } });
  console.log('  ✓ Test fixtures cleaned up safely');

  console.log('\n================================================================');
  console.log('ALL PHASE A ACCEPTANCE CRITERIA VERIFIED AND PASSED (12/12)!');
  console.log('================================================================');
}

runPhaseAAdminOrdersTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
    process.exit(1);
  });
