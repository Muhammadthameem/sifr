import { prisma } from '../lib/db/prisma';
import {
  OrderStatus,
  SalesChannel,
  PaymentStatus,
  ProductStatus,
} from '@prisma/client';
import {
  buildWhatsAppOrderMessage,
  buildWhatsAppUrl,
  getProductUrl,
  getBusinessWhatsAppNumber,
  getSiteBaseUrl,
} from '../lib/ordering/whatsapp';
import { createWhatsAppOrderAction } from '../lib/actions/order-actions';
import {
  addItemToCart,
  getCartDetails,
  removeItemsFromCart,
} from '../lib/cart/cart-service';
import crypto from 'crypto';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

async function runPhase4Step4AcceptanceTests() {
  console.log('================================================================');
  console.log('PHASE 4 — STEP 4 ACCEPTANCE TESTS');
  console.log('WHATSAPP MESSAGE GENERATION, REDIRECT & SELECTIVE CART CLEANUP');
  console.log('================================================================\n');

  const runId = Math.floor(100000 + Math.random() * 900000).toString();

  // --- Step 0: Test Fixtures Setup ---
  console.log('--- Step 0: Test Fixtures Setup ---');

  // Category
  const category = await prisma.category.create({
    data: {
      name: `Step4 Cat ${runId}`,
      slug: `step4-cat-${runId}`,
    },
  });

  // Product 1
  const product1 = await prisma.product.create({
    data: {
      name: `Sifr Classic Hijab ${runId}`,
      slug: `sifr-classic-hijab-${runId}`,
      status: ProductStatus.ACTIVE,
      categoryId: category.id,
      shippingCharge: 60.0,
      variants: {
        create: {
          title: 'Silk Ivory',
          sku: `SKU-P4-A-${runId}`,
          sellingPrice: 1200.0,
          mrp: 1500.0,
          isAvailable: true,
          shippingCost: 60.0,
          inventoryItem: {
            create: {
              physicalStock: 25,
              reservedStock: 0,
            },
          },
        },
      },
    },
    include: { variants: { include: { inventoryItem: true } } },
  });

  // Product 2
  const product2 = await prisma.product.create({
    data: {
      name: `Sifr Chiffon Abaya ${runId}`,
      slug: `sifr-chiffon-abaya-${runId}`,
      status: ProductStatus.ACTIVE,
      categoryId: category.id,
      shippingCharge: 80.0,
      variants: {
        create: {
          title: 'Midnight Black',
          sku: `SKU-P4-B-${runId}`,
          sellingPrice: 2800.0,
          mrp: 3200.0,
          isAvailable: true,
          shippingCost: 80.0,
          inventoryItem: {
            create: {
              physicalStock: 15,
              reservedStock: 0,
            },
          },
        },
      },
    },
    include: { variants: { include: { inventoryItem: true } } },
  });

  // Product 3 (will remain in cart)
  const product3 = await prisma.product.create({
    data: {
      name: `Sifr Satin Scrunchie ${runId}`,
      slug: `sifr-satin-scrunchie-${runId}`,
      status: ProductStatus.ACTIVE,
      categoryId: category.id,
      shippingCharge: 30.0,
      variants: {
        create: {
          title: 'Champagne Gold',
          sku: `SKU-P4-C-${runId}`,
          sellingPrice: 350.0,
          mrp: 450.0,
          isAvailable: true,
          shippingCost: 30.0,
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

  // Coupon (15% off)
  const coupon = await prisma.coupon.create({
    data: {
      name: `15% Off Step 4 Coupon ${runId}`,
      code: `SAVE15_${runId}`,
      description: '15% Off Step 4 Coupon',
      discountType: 'PERCENTAGE',
      discountValue: 15.0,
      status: 'ACTIVE',
    },
  });

  const varA = product1.variants[0];
  const varB = product2.variants[0];
  const varC = product3.variants[0];

  console.log(`  ✓ Created test products: ${product1.name}, ${product2.name}, ${product3.name}`);
  console.log(`  ✓ Created test coupon: ${coupon.code}\n`);

  // ================================================================
  // Test 1: Canonical Base URL and Product Link Generation
  // ================================================================
  console.log('--- Test 1: Canonical Base URL and Product Link Resolution ---');
  const baseUrl = getSiteBaseUrl();
  assert(!baseUrl.includes('localhost'), `Base URL must never be localhost, got ${baseUrl}`);
  assert(baseUrl.startsWith('http'), `Base URL must start with http/https, got ${baseUrl}`);
  assert(!baseUrl.endsWith('/'), `Base URL must not have trailing slash, got ${baseUrl}`);

  const productUrlA = getProductUrl(product1.slug);
  assert(productUrlA === `${baseUrl}/products/${product1.slug}`, `Expected ${baseUrl}/products/${product1.slug}, got ${productUrlA}`);
  console.log(`  ✓ Canonical product URL verified: ${productUrlA}`);

  // ================================================================
  // Test 2: Business Phone Resolution & wa.me URL Formatting
  // ================================================================
  console.log('\n--- Test 2: Business Phone Number and wa.me URL Formatting ---');
  const businessPhone = getBusinessWhatsAppNumber();
  assert(/^\d+$/.test(businessPhone), `Business phone must be strictly numeric digits, got ${businessPhone}`);
  assert(businessPhone.length >= 10, `Business phone must be at least 10 digits, got ${businessPhone}`);

  const sampleMessage = 'Hello SIFR!\nTesting special chars: & = ? + / " % ₹ 1,200.00';
  const waUrl = buildWhatsAppUrl(businessPhone, sampleMessage);
  assert(waUrl.startsWith(`https://wa.me/${businessPhone}?text=`), `wa.me URL must start with https://wa.me/${businessPhone}?text=, got ${waUrl}`);
  const decodedText = decodeURIComponent(waUrl.replace(`https://wa.me/${businessPhone}?text=`, ''));
  assert(decodedText === sampleMessage, `URL decoding must preserve original message exactly`);
  console.log(`  ✓ wa.me URL generation and round-trip URL encoding verified`);

  // ================================================================
  // Test 3: WhatsApp Message Generation (All Fields)
  // ================================================================
  console.log('\n--- Test 3: WhatsApp Message Generation with Full Metadata ---');
  const now = new Date();
  const testOrderSnapshot = {
    orderNumber: `ORD-${runId}-001`,
    createdAt: now,
    customerNameSnapshot: 'Mariam Noor',
    customerMobileSnapshot: '+919876543210',
    customerEmailSnapshot: 'mariam@example.com',
    shippingAddressSnapshot: `Villa 12, Rose Garden\nCity: Kochi\nState: Kerala\nPincode: 682001`,
    subtotal: 4000.0,
    shippingFee: 120.0,
    discountTotal: 600.0,
    couponCodeSnapshot: coupon.code,
    grandTotal: 3520.0,
    paymentStatus: 'DUE',
    items: [
      {
        productNameSnapshot: product1.name,
        variantTitleSnapshot: varA.title,
        skuSnapshot: varA.sku,
        quantity: 1,
        unitPrice: 1200.0,
        lineTotal: 1200.0,
        productSlug: product1.slug,
        productUrl: getProductUrl(product1.slug),
      },
      {
        productNameSnapshot: product2.name,
        variantTitleSnapshot: varB.title,
        skuSnapshot: varB.sku,
        quantity: 1,
        unitPrice: 2800.0,
        lineTotal: 2800.0,
        productSlug: product2.slug,
        productUrl: getProductUrl(product2.slug),
      },
    ],
  };

  const message = buildWhatsAppOrderMessage(testOrderSnapshot);
  assert(message.includes('*SIFR — Order Request*'), 'Missing header');
  assert(message.includes(`Order Number: ${testOrderSnapshot.orderNumber}`), 'Missing order number');
  assert(message.includes('Date: '), 'Missing formatted date');
  assert(message.includes('Mariam Noor'), 'Missing customer name');
  assert(message.includes('+919876543210'), 'Missing customer mobile');
  assert(message.includes('Email: mariam@example.com'), 'Missing customer email');
  assert(message.includes('City: Kochi'), 'Missing city');
  assert(message.includes('State: Kerala'), 'Missing state');
  assert(message.includes('Pincode: 682001'), 'Missing pincode');
  assert(message.includes(varA.sku), 'Missing SKU A');
  assert(message.includes(varB.sku), 'Missing SKU B');
  assert(message.includes(getProductUrl(product1.slug)), 'Missing product 1 link');
  assert(message.includes(getProductUrl(product2.slug)), 'Missing product 2 link');
  assert(message.includes('Subtotal: ₹4,000.00'), 'Missing subtotal');
  assert(message.includes(`Discount (${coupon.code}): -₹600.00`), 'Missing coupon discount line');
  assert(message.includes('Shipping: ₹120.00'), 'Missing shipping fee');
  assert(message.includes('Grand Total: ₹3,520.00'), 'Missing grand total');
  assert(message.includes('Payment Status: DUE'), 'Missing payment status DUE');
  assert(message.includes('Please confirm my order. Thank you!'), 'Missing closing note');
  console.log('  ✓ Verified complete WhatsApp message format:');
  console.log('--------------------------------------------------');
  console.log(message);
  console.log('--------------------------------------------------');

  // ================================================================
  // Test 4: Message Generation without Optional Fields (Email, Coupon)
  // ================================================================
  console.log('\n--- Test 4: WhatsApp Message Generation without Email & Coupon ---');
  const minimalSnapshot = {
    orderNumber: `ORD-${runId}-002`,
    customerNameSnapshot: 'Zainab Begum',
    customerMobileSnapshot: '9876543211',
    customerEmailSnapshot: null,
    shippingAddressSnapshot: `Flat 302, Green Heights\nCity: Calicut\nState: Kerala\nPincode: 673001`,
    subtotal: 1200.0,
    shippingFee: 60.0,
    grandTotal: 1260.0,
    items: [
      {
        productNameSnapshot: product1.name,
        variantTitleSnapshot: varA.title,
        skuSnapshot: varA.sku,
        quantity: 1,
        unitPrice: 1200.0,
        lineTotal: 1200.0,
        productSlug: product1.slug,
        productUrl: getProductUrl(product1.slug),
      },
    ],
  };

  const minimalMessage = buildWhatsAppOrderMessage(minimalSnapshot);
  assert(!minimalMessage.includes('Email:'), 'Email should not be rendered when null');
  assert(!minimalMessage.includes('Discount:'), 'Discount should not be rendered when 0 or not applied');
  assert(minimalMessage.includes('Payment Status: DUE'), 'Default payment status must be DUE');
  console.log('  ✓ Clean message formatting when optional fields are omitted');

  // ================================================================
  // Test 5: End-to-End Server Action Order Creation with WhatsApp Data
  // ================================================================
  console.log('\n--- Test 5: createWhatsAppOrderAction returns whatsAppMessage and whatsAppUrl ---');
  const actionResult = await createWhatsAppOrderAction({
    creationIdempotencyKey: `idem-act-${runId}`,
    customer: {
      name: 'Farhan Siddiqui',
      mobile: '9876543212',
      email: 'farhan@example.com',
      address: 'Plot 44, Sea Breeze Colony',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    },
    items: [
      { variantId: varA.id, quantity: 2 },
    ],
    couponCode: coupon.code,
  });

  assert(actionResult.success, `Action failed: ${actionResult.error}`);
  assert(actionResult.order !== undefined, 'Missing order in action response');
  assert(actionResult.whatsAppMessage !== undefined, 'Missing whatsAppMessage in action response');
  assert(actionResult.whatsAppUrl !== undefined, 'Missing whatsAppUrl in action response');

  // Validate message contents returned from action
  const actMsg = actionResult.whatsAppMessage!;
  assert(actMsg.includes(actionResult.order!.orderNumber), 'Message missing persisted order number');
  assert(actMsg.includes('Farhan Siddiqui'), 'Message missing customer name');
  assert(actMsg.includes('Mumbai'), 'Message missing city');
  assert(actMsg.includes(getProductUrl(product1.slug)), 'Message missing canonical product URL');
  assert(actMsg.includes(`Discount (${coupon.code})`), 'Message missing coupon code snapshot');
  assert(actMsg.includes('Payment Status: DUE'), 'Message missing payment status DUE');

  // Validate wa.me URL
  assert(actionResult.whatsAppUrl!.startsWith(`https://wa.me/${businessPhone}?text=`), 'Invalid wa.me URL');
  console.log(`  ✓ Action returned valid order #${actionResult.order!.orderNumber} with WhatsApp text and wa.me URL`);

  // ================================================================
  // Test 6: Idempotent Submission Handling
  // ================================================================
  console.log('\n--- Test 6: Idempotent Re-submission Returns Existing URL Without Duplicate Order ---');
  const initialOrderCount = await prisma.order.count({
    where: { creationIdempotencyKey: `idem-act-${runId}` },
  });
  assert(initialOrderCount === 1, 'Expected exactly 1 order row');

  const replayResult = await createWhatsAppOrderAction({
    creationIdempotencyKey: `idem-act-${runId}`,
    customer: {
      name: 'Farhan Siddiqui',
      mobile: '9876543212',
      email: 'farhan@example.com',
      address: 'Plot 44, Sea Breeze Colony',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    },
    items: [
      { variantId: varA.id, quantity: 2 },
    ],
    couponCode: coupon.code,
  });

  assert(replayResult.success, 'Replay action failed');
  assert(replayResult.order?.orderNumber === actionResult.order?.orderNumber, 'Replay returned different order number');
  assert(replayResult.whatsAppUrl === actionResult.whatsAppUrl, 'Replay returned different wa.me URL');

  const orderCountAfterReplay = await prisma.order.count({
    where: { creationIdempotencyKey: `idem-act-${runId}` },
  });
  assert(orderCountAfterReplay === 1, 'Replay must NOT create an extra order row');
  console.log('  ✓ Idempotent re-submission safely returned existing order and URL');

  // ================================================================
  // Test 7: Selective Cart Cleanup in Cart Mode
  // ================================================================
  console.log('\n--- Test 7: Selective Cart Cleanup (Cart Mode) ---');
  const testSessionId = `test-cart-session-${runId}`;

  // Populate cart with 3 items:
  // Item 1: varA (qty 2)
  // Item 2: varB (qty 1)
  // Item 3: varC (qty 3)
  await addItemToCart(testSessionId, varA.id, 2);
  await addItemToCart(testSessionId, varB.id, 1);
  await addItemToCart(testSessionId, varC.id, 3);

  const cartBefore = await getCartDetails(testSessionId);
  assert(cartBefore.items.length === 3, `Cart should have 3 items before order, got ${cartBefore.items.length}`);
  console.log(`  Cart before order has 3 items: [${cartBefore.items.map((i) => i.sku).join(', ')}]`);

  // Simulate customer submitting order for Item 1 (varA) and Item 2 (varB)
  const submittedVariantIds = [varA.id, varB.id];
  const cleanupRes = await removeItemsFromCart(testSessionId, submittedVariantIds);
  assert(cleanupRes.success, 'Failed to remove submitted items');

  const cartAfter = await getCartDetails(testSessionId);
  assert(cartAfter.items.length === 1, `Cart must have exactly 1 item remaining, got ${cartAfter.items.length}`);
  assert(cartAfter.items[0].variantId === varC.id, `Remaining item must be varC (${varC.sku}), got ${cartAfter.items[0].sku}`);
  assert(cartAfter.items[0].quantity === 3, `Remaining item quantity must be preserved at 3, got ${cartAfter.items[0].quantity}`);
  console.log(`  ✓ Submitted items [${varA.sku}, ${varB.sku}] removed, unsubmitted item [${varC.sku} × 3] preserved untouched`);

  // ================================================================
  // Test 8: Product Mode Does NOT Mutate Customer Cart
  // ================================================================
  console.log('\n--- Test 8: Product Mode Leaves Cart Untouched ---');
  const prodModeSessionId = `test-prod-session-${runId}`;
  await addItemToCart(prodModeSessionId, varA.id, 1);
  await addItemToCart(prodModeSessionId, varC.id, 2);

  const prodCartBefore = await getCartDetails(prodModeSessionId);
  assert(prodCartBefore.items.length === 2, 'Initial cart must have 2 items');

  // Customer places product-mode order for varB (directly from product page)
  const prodOrderRes = await createWhatsAppOrderAction({
    creationIdempotencyKey: `idem-prod-${runId}`,
    customer: {
      name: 'Salma Khan',
      mobile: '9876543213',
      address: 'Tower B, Flat 501',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
    },
    items: [{ variantId: varB.id, quantity: 1 }],
  });
  assert(prodOrderRes.success, 'Product mode order creation failed');

  // Verify cart for prodModeSessionId is completely unchanged
  const prodCartAfter = await getCartDetails(prodModeSessionId);
  assert(prodCartAfter.items.length === 2, `Product mode must NOT touch cart, item count changed: ${prodCartAfter.items.length}`);
  assert(prodCartAfter.items[0].quantity === 1 && prodCartAfter.items[1].quantity === 2, 'Cart item quantities altered unexpectedly');
  console.log('  ✓ In Product Mode, customer cart remains 100% intact');

  // ================================================================
  // Test 9: Strict Non-Interference with Inventory & FIFO
  // ================================================================
  console.log('\n--- Test 9: Strict Zero Inventory & FIFO Mutation Invariant ---');
  const invA = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: varA.id } });
  const invB = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: varB.id } });

  assert(invA.physicalStock === 25, `Physical stock altered: ${invA.physicalStock} (expected 25)`);
  assert(invA.reservedStock === 0, `Reserved stock altered: ${invA.reservedStock} (expected 0)`);
  assert(invB.physicalStock === 15, `Physical stock altered: ${invB.physicalStock} (expected 15)`);
  assert(invB.reservedStock === 0, `Reserved stock altered: ${invB.reservedStock} (expected 0)`);

  const createdOrder = await prisma.order.findUniqueOrThrow({
    where: { id: actionResult.order!.id },
    include: { items: true },
  });
  assert(Number(createdOrder.totalFifoCogs) === 0, `totalFifoCogs must be 0, got ${createdOrder.totalFifoCogs}`);
  for (const item of createdOrder.items) {
    assert(Number(item.fifoCogs) === 0, `Item fifoCogs must be 0, got ${item.fifoCogs}`);
  }

  const movements = await prisma.inventoryMovement.findMany({
    where: { referenceId: createdOrder.id },
  });
  assert(movements.length === 0, `Expected 0 inventory movements, found ${movements.length}`);
  console.log('  ✓ Physical stock: UNTOUCHED (25, 15)');
  console.log('  ✓ Reserved stock: UNTOUCHED (0, 0)');
  console.log('  ✓ FIFO COGS: STRICTLY 0.00');
  console.log('  ✓ Movements: ZERO created');

  // ================================================================
  // Test 10: Zero Notification Creation Invariant
  // ================================================================
  console.log('\n--- Test 10: Notification Outbox Non-Interference ---');
  const notifs = await prisma.notification.findMany({
    where: { orderId: createdOrder.id },
  });
  assert(notifs.length === 0, `Zero notifications must be queued, found: ${notifs.length}`);
  console.log('  ✓ Zero ORDER_RECEIVED notifications created');

  // ================================================================
  // Clean Up Test Fixtures
  // ================================================================
  console.log('\n--- Cleaning Up Test Fixtures ---');
  await prisma.cartItem.deleteMany({ where: { cart: { sessionId: { in: [testSessionId, prodModeSessionId] } } } });
  await prisma.cart.deleteMany({ where: { sessionId: { in: [testSessionId, prodModeSessionId] } } });
  await prisma.orderItem.deleteMany({ where: { order: { creationIdempotencyKey: { in: [`idem-act-${runId}`, `idem-prod-${runId}`] } } } });
  await prisma.order.deleteMany({ where: { creationIdempotencyKey: { in: [`idem-act-${runId}`, `idem-prod-${runId}`] } } });
  await prisma.coupon.delete({ where: { id: coupon.id } });
  await prisma.inventoryItem.deleteMany({ where: { variantId: { in: [varA.id, varB.id, varC.id] } } });
  await prisma.productVariant.deleteMany({ where: { productId: { in: [product1.id, product2.id, product3.id] } } });
  await prisma.product.deleteMany({ where: { id: { in: [product1.id, product2.id, product3.id] } } });
  await prisma.category.delete({ where: { id: category.id } });
  console.log('  ✓ Test fixtures cleaned up safely');

  console.log('\n================================================================');
  console.log('ALL PHASE 4 STEP 4 ACCEPTANCE TESTS PASSED (10/10 OBJECTIVES)');
  console.log('================================================================');
}

runPhase4Step4AcceptanceTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
    process.exit(1);
  });
