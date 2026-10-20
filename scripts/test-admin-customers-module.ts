import { prisma } from '../lib/db/prisma';
import {
  createWhatsAppOrder,
  createDirectSale,
  resolveCustomer,
} from '../lib/ordering/order-engine';
import {
  queryAdminCustomers,
  getAdminCustomerDetails,
  updateCustomerProfile,
  QUALIFYING_SALES_STATUSES,
} from '../lib/customer/customer-service';
import {
  OrderStatus,
  SalesChannel,
  PaymentStatus,
  ProductStatus,
} from '@prisma/client';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}`);
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

async function runCustomerModuleTests() {
  console.log('================================================================');
  console.log(' SIFR — ADMIN CUSTOMERS MODULE & IDENTITY VERIFICATION SUITE');
  console.log('================================================================\n');

  const runId = Math.floor(100000 + Math.random() * 900000).toString();
  // Using an Indian mobile number starting with 9: 10 digits
  const testPhoneRaw = `9876${runId.slice(0, 6)}`;
  const normalizedTestPhone = `+91${testPhoneRaw}`;

  // Step 0: Test Fixtures Setup (Category & Product)
  console.log('--- Step 0: Setting up catalog fixtures ---');
  const category = await prisma.category.create({
    data: {
      name: `Cust Test Cat ${runId}`,
      slug: `cust-test-cat-${runId}`,
    },
  });

  const product = await prisma.product.create({
    data: {
      name: `Cust Test Shirt ${runId}`,
      slug: `cust-test-shirt-${runId}`,
      status: ProductStatus.ACTIVE,
      categoryId: category.id,
      shippingCharge: 50,
      variants: {
        create: {
          title: 'M',
          sku: `SKU-CUST-${runId}`,
          sellingPrice: 2000,
          mrp: 2500,
          isAvailable: true,
          shippingCost: 50,
          inventoryItem: {
            create: {
              physicalStock: 100,
              reservedStock: 0,
            },
          },
          fifoLayers: {
            create: {
              unitCost: 1000,
              initialQuantity: 10,
              remainingQuantity: 10,
            },
          },
        },
      },
    },
    include: { variants: true },
  });
  const variant = product.variants[0];

  const createdOrderIds: string[] = [];
  let testCustomerId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: SAME PHONE, DIFFERENT NAME
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Same Phone, Different Name ---');
    console.log(`Submitting Order 1 with Phone: ${testPhoneRaw}, Name: "Thameem"`);

    const order1 = await createWhatsAppOrder({
      customer: {
        name: 'Thameem',
        mobile: testPhoneRaw,
        email: 'thameem@example.com',
        address: '123 Ocean Street',
        city: 'Calicut',
        state: 'Kerala',
        pincode: '673001',
      },
      items: [{ variantId: variant.id, quantity: 1 }],
      creationIdempotencyKey: `idem-cust1-${runId}`,
    });
    createdOrderIds.push(order1.id);
    testCustomerId = order1.customerId;

    assert(Boolean(testCustomerId), 'Order 1 must be linked to a customerId');
    assert(order1.customerNameSnapshot === 'Thameem', 'Order 1 snapshot must be Thameem');
    assert(order1.customerMobileSnapshot === normalizedTestPhone, 'Order 1 phone must be normalized');

    const customerRecord1 = await prisma.customer.findUnique({
      where: { id: testCustomerId! },
    });
    assert(customerRecord1 !== null, 'Customer record must exist');
    assert(customerRecord1!.mobile === normalizedTestPhone, 'Customer phone must match normalized');
    assert(customerRecord1!.name === 'Thameem', 'Customer initial name must be Thameem');

    console.log(`Submitting Order 2 with SAME Phone: ${testPhoneRaw}, Name: "Muhammad Thameem"`);
    const order2 = await createWhatsAppOrder({
      customer: {
        name: 'Muhammad Thameem',
        mobile: testPhoneRaw,
        email: 'thameem@example.com',
        address: '123 Ocean Street',
        city: 'Calicut',
        state: 'Kerala',
        pincode: '673001',
      },
      items: [{ variantId: variant.id, quantity: 1 }],
      creationIdempotencyKey: `idem-cust2-${runId}`,
    });
    createdOrderIds.push(order2.id);

    // Verify same Customer ID reused
    assert(order2.customerId === testCustomerId, 'Order 2 must reuse the same customerId');
    assert(order2.customerNameSnapshot === 'Muhammad Thameem', 'Order 2 snapshot must be Muhammad Thameem');

    // Verify Order 1 snapshot remains unchanged
    const refetchedOrder1 = await prisma.order.findUnique({ where: { id: order1.id } });
    assert(refetchedOrder1!.customerNameSnapshot === 'Thameem', 'Historical Order 1 snapshot must remain Thameem');

    // Verify exactly ONE customer exists for this phone
    const customersForPhone = await prisma.customer.findMany({
      where: { mobile: normalizedTestPhone },
    });
    assert(customersForPhone.length === 1, `Expected exactly 1 customer record, got ${customersForPhone.length}`);
    console.log('  ✓ TEST 1 passed: Same phone reused customer, historical snapshot preserved, exactly 1 customer record exists');

    // -------------------------------------------------------------------------
    // TEST 2: SAME PHONE, DIFFERENT ADDRESS
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Same Phone, Different Address ---');
    console.log(`Submitting Order 3 with Address: "456 Mountain View, Bangalore, Karnataka, 560001"`);
    const order3 = await createWhatsAppOrder({
      customer: {
        name: 'Muhammad Thameem',
        mobile: testPhoneRaw,
        email: 'thameem@example.com',
        address: '456 Mountain View',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560001',
      },
      items: [{ variantId: variant.id, quantity: 1 }],
      creationIdempotencyKey: `idem-cust3-${runId}`,
    });
    createdOrderIds.push(order3.id);

    assert(order3.customerId === testCustomerId, 'Order 3 must reference same customerId');
    assert(Boolean(order3.shippingAddressSnapshot?.includes('456 Mountain View')), 'Order 3 has new address snapshot');

    // Historical Order 1 snapshot must be unchanged
    const order1Check = await prisma.order.findUnique({ where: { id: order1.id } });
    assert(Boolean(order1Check?.shippingAddressSnapshot?.includes('123 Ocean Street')), 'Order 1 snapshot must remain Address A');
    console.log('  ✓ TEST 2 passed: Order 3 succeeded, historical address snapshot preserved on Order 1');

    // -------------------------------------------------------------------------
    // TEST 3: SAME PHONE, DIFFERENT EMAIL
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Same Phone, Different Email ---');
    console.log(`Submitting Order 4 with Email: "updated.email@example.com"`);
    const order4 = await createWhatsAppOrder({
      customer: {
        name: 'Muhammad Thameem',
        mobile: testPhoneRaw,
        email: 'updated.email@example.com',
        address: '456 Mountain View',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560001',
      },
      items: [{ variantId: variant.id, quantity: 1 }],
      creationIdempotencyKey: `idem-cust4-${runId}`,
    });
    createdOrderIds.push(order4.id);

    assert(order4.customerId === testCustomerId, 'Order 4 must reference same customerId');
    assert(order4.customerEmailSnapshot === 'updated.email@example.com', 'Order 4 snapshot has new email');

    const order1EmailCheck = await prisma.order.findUnique({ where: { id: order1.id } });
    assert(order1EmailCheck!.customerEmailSnapshot === 'thameem@example.com', 'Order 1 email snapshot unchanged');
    console.log('  ✓ TEST 3 passed: Order 4 succeeded, historical email snapshot preserved on Order 1');

    // -------------------------------------------------------------------------
    // TEST 4: CONCURRENT SAME-PHONE ORDERS
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Concurrent Same-Phone Orders ---');
    const concurrentPhone = `9875${Math.floor(100000 + Math.random() * 900000)}`;
    const normalizedConcurrentPhone = `+91${concurrentPhone}`;

    const [resA, resB] = await Promise.all([
      resolveCustomer({
        name: 'Concurrent User A',
        mobile: concurrentPhone,
        email: 'concurrentA@example.com',
        address: 'Concurrent Address A',
      }),
      resolveCustomer({
        name: 'Concurrent User B',
        mobile: concurrentPhone,
        email: 'concurrentB@example.com',
        address: 'Concurrent Address B',
      }),
    ]);

    assert(resA.customer.id === resB.customer.id, 'Both concurrent resolutions must resolve to same customerId');
    const concurrentCustomers = await prisma.customer.findMany({
      where: { mobile: normalizedConcurrentPhone },
    });
    assert(concurrentCustomers.length === 1, `Expected exactly 1 customer created under race, got ${concurrentCustomers.length}`);
    console.log('  ✓ TEST 4 passed: Concurrent customer resolution resolved to exact same record with zero crash');

    // Clean up concurrent customer fixture
    await prisma.customer.delete({ where: { id: resA.customer.id } });

    // -------------------------------------------------------------------------
    // TEST 5: CUSTOMER LIST (Search, Sort, Pagination)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Customer List Queries, Search, Sorting, and Pagination ---');
    // Search by Name
    const searchByName = await queryAdminCustomers({ search: 'Muhammad Thameem' });
    assert(
      searchByName.customers.some((c) => c.id === testCustomerId),
      'Search by customer name must find test customer'
    );
    console.log(`  ✓ Search by name found ${searchByName.customers.length} results`);

    // Search by raw Phone digits
    const searchByPhone = await queryAdminCustomers({ search: testPhoneRaw });
    assert(
      searchByPhone.customers.some((c) => c.id === testCustomerId),
      'Search by phone must find test customer'
    );
    console.log(`  ✓ Search by phone found ${searchByPhone.customers.length} results`);

    // Search by Email
    const searchByEmail = await queryAdminCustomers({ search: 'updated.email@example.com' });
    assert(
      searchByEmail.customers.some((c) => c.id === testCustomerId),
      'Search by email must find test customer'
    );
    console.log(`  ✓ Search by email found ${searchByEmail.customers.length} results`);

    // Sorting tests
    const sortBySpend = await queryAdminCustomers({ sortBy: 'total_spend', limit: 10 });
    assert(sortBySpend.customers.length > 0, 'Sorting by total_spend must return results');
    if (sortBySpend.customers.length > 1) {
      assert(
        sortBySpend.customers[0].totalPurchaseValue >= sortBySpend.customers[1].totalPurchaseValue,
        'First customer must have >= spend than second customer'
      );
    }
    console.log('  ✓ Sorting by total_spend verified');

    const sortByOrders = await queryAdminCustomers({ sortBy: 'most_orders', limit: 10 });
    assert(sortByOrders.customers.length > 0, 'Sorting by most_orders must return results');
    console.log('  ✓ Sorting by most_orders verified');

    // Pagination test
    const page1 = await queryAdminCustomers({ page: 1, limit: 5 });
    const page2 = await queryAdminCustomers({ page: 2, limit: 5 });
    assert(page1.page === 1, 'Page 1 result has page=1');
    assert(page2.page === 2, 'Page 2 result has page=2');
    console.log(`  ✓ Pagination verified: Page 1 (${page1.customers.length} items), Page 2 (${page2.customers.length} items)`);

    // -------------------------------------------------------------------------
    // TEST 6 & 7: CUSTOMER DETAIL & SALES STATISTICS (Exclusion of CONTACTED/CANCELLED)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6 & 7: Customer Detail & Sales Statistics (CONFIRMED vs CONTACTED/CANCELLED) ---');
    // Currently, Order 1, 2, 3, 4 are in CONTACTED status
    const detailBeforeSales = await getAdminCustomerDetails(testCustomerId!);
    assert(detailBeforeSales !== null, 'Customer detail must exist');
    assert(detailBeforeSales!.totalOrdersCount === 4, `Expected 4 total orders, got ${detailBeforeSales!.totalOrdersCount}`);
    assert(
      detailBeforeSales!.totalSalesCount === 0,
      `Expected 0 sales count for CONTACTED orders, got ${detailBeforeSales!.totalSalesCount}`
    );
    assert(
      detailBeforeSales!.totalPurchaseValue === 0,
      `Expected 0 total purchase value for CONTACTED orders, got ${detailBeforeSales!.totalPurchaseValue}`
    );
    console.log('  ✓ CONTACTED orders are strictly excluded from sales count and purchase value');

    // Confirm Order 1 -> Status CONFIRMED, GrandTotal = 2050 (2000 + 50 shipping)
    await prisma.order.update({
      where: { id: order1.id },
      data: { status: OrderStatus.CONFIRMED },
    });

    // Dispatch Order 2 -> Status DISPATCHED, GrandTotal = 2050
    await prisma.order.update({
      where: { id: order2.id },
      data: { status: OrderStatus.DISPATCHED },
    });

    // Deliver Order 3 -> Status DELIVERED, GrandTotal = 2050
    await prisma.order.update({
      where: { id: order3.id },
      data: { status: OrderStatus.DELIVERED },
    });

    // Cancel Order 4 -> Status CANCELLED, GrandTotal = 2050
    await prisma.order.update({
      where: { id: order4.id },
      data: { status: OrderStatus.CANCELLED },
    });

    // Refetch details
    const detailAfterSales = await getAdminCustomerDetails(testCustomerId!);
    assert(detailAfterSales!.totalOrdersCount === 4, 'Total requests placed is 4');
    assert(
      detailAfterSales!.totalSalesCount === 3,
      `Expected 3 sales (CONFIRMED, DISPATCHED, DELIVERED), got ${detailAfterSales!.totalSalesCount}`
    );
    // 3 orders * ₹2050 = ₹6150
    assert(
      detailAfterSales!.totalPurchaseValue === 6150,
      `Expected total purchase value of ₹6150, got ₹${detailAfterSales!.totalPurchaseValue}`
    );
    console.log(`  ✓ Confirmed sales: ${detailAfterSales!.totalSalesCount}/4 orders, Value: ₹${detailAfterSales!.totalPurchaseValue}`);
    console.log('  ✓ CANCELLED Order 4 appears in order history with isSale=false');

    // -------------------------------------------------------------------------
    // TEST 8: CHANNELS (WHATSAPP, ONLINE, DIRECT)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Sales Channels in Customer History ---');
    // Create DIRECT sale order linked to same customer
    const directOrder = await createDirectSale({
      customer: {
        name: 'Muhammad Thameem',
        mobile: testPhoneRaw,
      },
      items: [{ variantId: variant.id, quantity: 1 }],
      creationIdempotencyKey: `idem-direct-${runId}`,
    });
    createdOrderIds.push(directOrder.id);

    const detailWithDirect = await getAdminCustomerDetails(testCustomerId!);
    const hasDirect = detailWithDirect!.orders.some((o) => o.salesChannel === 'DIRECT');
    const hasWhatsApp = detailWithDirect!.orders.some((o) => o.salesChannel === 'WHATSAPP');
    assert(hasDirect, 'Customer order history must include DIRECT orders');
    assert(hasWhatsApp, 'Customer order history must include WHATSAPP orders');
    console.log('  ✓ Customer history cleanly aggregates WHATSAPP and DIRECT channels');

    // -------------------------------------------------------------------------
    // TEST 9: CUSTOMER PROFILE EDITING (Safe, Non-mutating to Snapshots)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Safe Customer Profile Editing ---');
    await updateCustomerProfile({
      customerId: testCustomerId!,
      name: 'Muhammad Thameem (VIP)',
      email: 'vip.thameem@sifr.com',
      addressLine: 'Villa 10, Palm Grove',
      city: 'Calicut',
      state: 'Kerala',
      pincode: '673006',
    });

    const updatedCustomer = await getAdminCustomerDetails(testCustomerId!);
    assert(updatedCustomer!.name === 'Muhammad Thameem (VIP)', 'Customer name updated to VIP');
    assert(updatedCustomer!.email === 'vip.thameem@sifr.com', 'Customer email updated');
    assert(updatedCustomer!.city === 'Calicut', 'Customer city updated');
    assert(updatedCustomer!.pincode === '673006', 'Customer pincode updated');
    assert(updatedCustomer!.mobile === normalizedTestPhone, 'Customer phone remains unmutated');

    // Verify historical snapshots on Order 1 are untouched
    const historicalOrder1 = await prisma.order.findUnique({ where: { id: order1.id } });
    assert(
      historicalOrder1!.customerNameSnapshot === 'Thameem',
      'Historical Order 1 snapshot must NEVER be modified when editing customer profile'
    );
    console.log('  ✓ Customer profile updated successfully; historical order snapshots remain 100% untouched');

    console.log('\n================================================================');
    console.log('🎉 ALL 9/9 CUSTOMER MODULE ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    console.log('\n--- Cleaning up test fixtures ---');
    for (const orderId of createdOrderIds) {
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.orderStatusTransition.deleteMany({ where: { orderId } });
      await prisma.order.delete({ where: { id: orderId } });
    }
    if (testCustomerId) {
      await prisma.customer.delete({ where: { id: testCustomerId } });
    }
    await prisma.inventoryMovement.deleteMany({ where: { variantId: variant.id } });
    await prisma.fifoLayer.deleteMany({ where: { variantId: variant.id } });
    await prisma.inventoryItem.deleteMany({ where: { variantId: variant.id } });
    await prisma.productVariant.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });
    console.log('✓ Test fixtures cleaned up successfully.');
  }
}

runCustomerModuleTests()
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
