import { prisma } from '../lib/db/prisma';
import {
  getCartDetails,
  addItemToCart,
  updateCartItemQuantity,
  removeItemFromCart,
} from '../lib/cart/cart-service';
import { processGuestCheckoutAction } from '../lib/actions/cart-actions';
import { calculateOrderShipping, DEFAULT_GLOBAL_SHIPPING_CAP } from '../lib/ordering/shipping';
import crypto from 'crypto';

async function main() {
  console.log('=== PHASE 12B STEP 8 VERIFICATION: FULL-PAGE CART & CHECKOUT ===\n');

  const runId = Date.now();
  const testSessionId = `test-step8-session-${runId}`;

  try {
    // 1. Setup Test Master Data (Category, Active Product, Product Variants, Inventory)
    console.log('1. Setting up test catalog & inventory dataset...');
    const category = await prisma.category.create({
      data: {
        name: `Step 8 Category ${runId}`,
        slug: `step8-cat-${runId}`,
      },
    });

    const product = await prisma.product.create({
      data: {
        name: `Step 8 Signature Linen Shirt ${runId}`,
        slug: `step8-shirt-${runId}`,
        status: 'ACTIVE',
        gender: 'MEN',
        categoryId: category.id,
        images: {
          create: [{ url: 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10', sortOrder: 0 }],
        },
      },
    });

    const variantS = await prisma.productVariant.create({
      data: {
        productId: product.id,
        title: 'S',
        sku: `SKU-STEP8-S-${runId}`,
        mrp: 3499.0,
        sellingPrice: 2499.0,
        shippingCost: 80.0,
        isAvailable: true,
      },
    });

    const variantM = await prisma.productVariant.create({
      data: {
        productId: product.id,
        title: 'M',
        sku: `SKU-STEP8-M-${runId}`,
        mrp: 3499.0,
        sellingPrice: 2499.0,
        shippingCost: 80.0,
        isAvailable: true,
      },
    });

    // Create physical inventory items for both variants
    await prisma.inventoryItem.create({
      data: { variantId: variantS.id, physicalStock: 10, reservedStock: 0 },
    });
    await prisma.inventoryItem.create({
      data: { variantId: variantM.id, physicalStock: 5, reservedStock: 0 },
    });

    // Create initial FIFO layers
    await prisma.fifoLayer.create({
      data: {
        variantId: variantS.id,
        initialQuantity: 10,
        unitCost: 800.0,
        remainingQuantity: 10,
      },
    });

    console.log('✓ Master dataset setup completed cleanly.');

    // TEST 1: Cart Addition & Server-Authoritative Totals Calculation
    console.log('\n--- TEST 1: Cart Addition & Server-Authoritative Totals ---');
    const addRes1 = await addItemToCart(testSessionId, variantS.id, 2);
    if (!addRes1.success) throw new Error(`Add to cart failed: ${addRes1.message}`);

    const cartDetails1 = await getCartDetails(testSessionId);
    if (cartDetails1.items.length !== 1) throw new Error(`Expected 1 item in cart, got ${cartDetails1.items.length}`);
    if (cartDetails1.subtotal !== 4998) throw new Error(`Expected subtotal 4998, got ${cartDetails1.subtotal}`);

    // Shipping rule: sum(shippingCost * qty) = 80 * 2 = 160 (less than 200 cap)
    if (cartDetails1.shippingFee !== 160) throw new Error(`Expected shipping fee 160, got ${cartDetails1.shippingFee}`);
    if (cartDetails1.grandTotal !== 5158) throw new Error(`Expected grand total 5158, got ${cartDetails1.grandTotal}`);
    console.log('✓ TEST 1 PASSED: Cart addition & server-authoritative totals verified');

    // TEST 2: Authoritative Shipping Cap Rule Verification
    console.log('\n--- TEST 2: Authoritative Shipping Cap Rule Verification ---');
    // Add 2 of variantM (shipping cost 80 * 2 = 160; total raw shipping = 160 + 160 = 320 > cap 200)
    await addItemToCart(testSessionId, variantM.id, 2);
    const cartDetailsCap = await getCartDetails(testSessionId);
    const expectedCap = Number(DEFAULT_GLOBAL_SHIPPING_CAP);
    if (cartDetailsCap.shippingFee !== expectedCap) {
      throw new Error(`Expected global shipping cap ${expectedCap}, got ${cartDetailsCap.shippingFee}`);
    }
    console.log(`✓ TEST 2 PASSED: Shipping correctly capped at ₹${expectedCap} (raw shipping ₹320 -> capped ₹200)`);

    // TEST 3: Quantity Update with Stock Bounds Checking
    console.log('\n--- TEST 3: Quantity Update with Stock Validation ---');
    const updateRes = await updateCartItemQuantity(testSessionId, variantS.id, 3);
    if (!updateRes.success) throw new Error(`Update quantity failed: ${updateRes.message}`);

    // Attempting to set quantity beyond available stock (variantM stock = 5)
    const overstockRes = await updateCartItemQuantity(testSessionId, variantM.id, 10);
    if (overstockRes.success || overstockRes.code !== 'EXCEEDS_AVAILABLE_STOCK') {
      throw new Error('Expected EXCEEDS_AVAILABLE_STOCK error for over-quantity request');
    }
    console.log('✓ TEST 3 PASSED: Quantity update succeeded and overstock request correctly rejected');

    // TEST 4: Item Removal & Cart Clear Action
    console.log('\n--- TEST 4: Item Removal ---');
    await removeItemFromCart(testSessionId, variantM.id);
    const cartDetailsAfterRemove = await getCartDetails(testSessionId);
    if (cartDetailsAfterRemove.items.some((i: any) => i.variantId === variantM.id)) {
      throw new Error('Removed item still present in cart');
    }
    console.log('✓ TEST 4 PASSED: Item removed from cart cleanly');

    // TEST 5: Structured Address Checkout Composition & Payment Preference Flow
    console.log('\n--- TEST 5: Guest Checkout with Structured Address & Payment Preference ---');
    const idempotencyKey = `idemp-step8-${runId}-${crypto.randomUUID().substring(0, 8)}`;
    const testMobile = `987${String(runId).slice(-7)}`;
    const checkoutRes = await processGuestCheckoutAction(
      {
        creationIdempotencyKey: idempotencyKey,
        customer: {
          name: 'Anita Roy',
          mobile: testMobile,
          email: 'anita@example.com',
          shippingAddress: '42 Editorial Way, Suite 3B, Bandra West, Mumbai, Maharashtra - 400050',
        },
        notes: 'Please call before delivery | Payment Preference: Cash on Delivery (COD)',
      },
      testSessionId
    );

    if (!checkoutRes.success) {
      throw new Error(`Checkout failed: ${checkoutRes.message}`);
    }

    // Verify order in database
    const order = await prisma.order.findUnique({
      where: { orderNumber: checkoutRes.orderNumber },
      include: { customer: true, items: true },
    });

    if (!order) throw new Error('Created order not found in database');
    if (order.customer?.name !== 'Anita Roy') throw new Error(`Expected customer name Anita Roy, got ${order.customer?.name}`);
    if (!order.shippingAddressSnapshot?.includes('Bandra West')) throw new Error('Composed address not stored accurately on order');
    if (order.status !== 'RECEIVED' && order.status !== 'CONFIRMED') throw new Error(`Unexpected order status ${order.status}`);
    if (order.paymentStatus !== 'PENDING') throw new Error(`Unexpected payment status ${order.paymentStatus}`);
    if (Number(order.grandTotal) !== 3 * 2499 + 200) {
      throw new Error(`Unexpected grand total amount ${order.grandTotal}`);
    }
    console.log(`✓ TEST 5 PASSED: Order ${order.orderNumber} created successfully via guest checkout pipeline`);

    // TEST 6: Checkout Idempotency Verification
    console.log('\n--- TEST 6: Checkout Idempotency Verification ---');
    await addItemToCart(testSessionId, variantS.id, 1);
    const replayCheckoutRes = await processGuestCheckoutAction(
      {
        creationIdempotencyKey: idempotencyKey,
        customer: {
          name: 'Anita Roy',
          mobile: testMobile,
          email: 'anita@example.com',
          shippingAddress: '42 Editorial Way, Suite 3B, Bandra West, Mumbai, Maharashtra - 400050',
        },
        notes: 'Replay attempt',
      },
      testSessionId
    );

    if (!replayCheckoutRes.success || replayCheckoutRes.orderNumber !== checkoutRes.orderNumber) {
      throw new Error('Replayed checkout idempotency key did not return original order details');
    }
    console.log('✓ TEST 6 PASSED: Replay checkout idempotency key returned existing order cleanly');

    // TEST 7: Post-Checkout Cart Clearance Guarantee
    console.log('\n--- TEST 7: Post-Checkout Cart Clearance Guarantee ---');
    const postCheckoutCart = await getCartDetails(testSessionId);
    if (postCheckoutCart.items.length !== 0) {
      throw new Error('Cart was not cleared after successful checkout submission');
    }
    console.log('✓ TEST 7 PASSED: Cart cleared automatically after order completion');

    // Clean up test data
    console.log('\n--- Cleaning up Step 8 Test Data ---');
    await prisma.cartItem.deleteMany({ where: { variantId: { in: [variantS.id, variantM.id] } } });
    await prisma.orderItem.deleteMany({ where: { variantId: { in: [variantS.id, variantM.id] } } });
    await prisma.orderStatusTransition.deleteMany({ where: { orderId: order.id } });
    await prisma.notification.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.inventoryItem.deleteMany({ where: { variantId: { in: [variantS.id, variantM.id] } } });
    await prisma.fifoLayer.deleteMany({ where: { variantId: { in: [variantS.id, variantM.id] } } });
    await prisma.productVariant.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });

    console.log('===========================================================');
    console.log('  ALL PHASE 12B STEP 8 VERIFICATION TESTS PASSED! 🎉');
    console.log('===========================================================');
  } catch (err: any) {
    console.error('\n❌ STEP 8 VERIFICATION FAILURE:', err.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
