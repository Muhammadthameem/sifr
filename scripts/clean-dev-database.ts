import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanDevDatabase() {
  const dbUrl = process.env.DATABASE_URL || '';
  console.log('[SIFR DB Clean] Checking DATABASE_URL...');
  console.log('[SIFR DB Clean] DATABASE_URL:', dbUrl.replace(/:[^:@]+@/, ':****@'));

  // Strict safety check: Ensure it is ONLY local development database
  const urlObj = new URL(dbUrl);
  if (urlObj.hostname !== 'localhost' && urlObj.hostname !== '127.0.0.1') {
    throw new Error(`FATAL: DATABASE_URL host "${urlObj.hostname}" is not localhost. Aborting to protect non-dev databases!`);
  }
  if (!urlObj.pathname.includes('sifr_db')) {
    throw new Error(`FATAL: DATABASE_URL database "${urlObj.pathname}" is not sifr_db. Aborting!`);
  }

  console.log('[SIFR DB Clean] Confirmed local development database: sifr_db on localhost:5432.');

  // Pre-cleanup count inspection
  console.log('\n[SIFR DB Clean] --- Pre-cleanup Counts ---');
  const preCounts: Record<string, number> = {
    admin_users: await prisma.adminUser.count(),
    store_settings: await prisma.storeSettings.count(),
    document_sequences: await prisma.documentSequence.count(),
    cms_sections: await prisma.cmsSection.count(),
    cms_section_products: await prisma.cmsSectionProduct.count(),
    products: await prisma.product.count(),
    product_variants: await prisma.productVariant.count(),
    product_images: await prisma.productImage.count(),
    product_options: await prisma.productOption.count(),
    product_option_values: await prisma.productOptionValue.count(),
    product_buttons: await prisma.productButton.count(),
    categories: await prisma.category.count(),
    inventory_items: await prisma.inventoryItem.count(),
    fifo_layers: await prisma.fifoLayer.count(),
    inventory_movements: await prisma.inventoryMovement.count(),
    purchases: await prisma.purchase.count(),
    purchase_lines: await prisma.purchaseLine.count(),
    vendors: await prisma.vendor.count(),
    orders: await prisma.order.count(),
    order_items: await prisma.orderItem.count(),
    order_status_transitions: await prisma.orderStatusTransition.count(),
    shipments: await prisma.shipment.count(),
    customers: await prisma.customer.count(),
    carts: await prisma.cart.count(),
    cart_items: await prisma.cartItem.count(),
    coupons: await prisma.coupon.count(),
    coupon_usages: await prisma.couponUsage.count(),
    coupon_products: await prisma.couponProduct.count(),
    coupon_categories: await prisma.couponCategory.count(),
    payments: await prisma.payment.count(),
    payment_webhook_events: await prisma.paymentWebhookEvent.count(),
    return_requests: await prisma.returnRequest.count(),
    return_items: await prisma.returnItem.count(),
    return_receipt_events: await prisma.returnReceiptEvent.count(),
    return_receipt_items: await prisma.returnReceiptItem.count(),
    exchange_items: await prisma.exchangeItem.count(),
    refunds: await prisma.refund.count(),
    refund_line_allocations: await prisma.refundLineAllocation.count(),
    notifications: await prisma.notification.count(),
    notification_attempts: await prisma.notificationAttempt.count(),
  };

  for (const [k, v] of Object.entries(preCounts)) {
    if (v > 0) {
      console.log(`  - ${k}: ${v}`);
    }
  }

  console.log('\n[SIFR DB Clean] Executing controlled deletion in transactional dependency order...');

  await prisma.$transaction(async (tx) => {
    // 1. Notifications & Outbox
    await tx.notificationAttempt.deleteMany({});
    await tx.notification.deleteMany({});

    // 2. Returns & Refunds
    await tx.refundLineAllocation.deleteMany({});
    // Disconnect self-referencing replacesRefund before deleting refunds
    await tx.$executeRawUnsafe(`UPDATE "refunds" SET "replaces_refund_id" = NULL;`);
    await tx.refund.deleteMany({});
    await tx.exchangeItem.deleteMany({});
    await tx.returnReceiptItem.deleteMany({});
    await tx.returnReceiptEvent.deleteMany({});
    await tx.returnItem.deleteMany({});
    await tx.returnRequest.deleteMany({});

    // 3. Payments & Webhooks
    await tx.paymentWebhookEvent.deleteMany({});
    await tx.payment.deleteMany({});

    // 4. Coupons & Usages
    await tx.couponUsage.deleteMany({});
    await tx.couponProduct.deleteMany({});
    await tx.couponCategory.deleteMany({});
    await tx.coupon.deleteMany({});

    // 5. Orders, Shipments & Line Items
    await tx.shipment.deleteMany({});
    await tx.orderStatusTransition.deleteMany({});
    await tx.orderItem.deleteMany({});
    await tx.order.deleteMany({});

    // 6. Customers
    await tx.customer.deleteMany({});

    // 7. Carts
    await tx.cartItem.deleteMany({});
    await tx.cart.deleteMany({});

    // 8. Purchases & Vendors
    await tx.purchaseLine.deleteMany({});
    await tx.purchase.deleteMany({});
    await tx.vendor.deleteMany({});

    // 9. Inventory, FIFO Layers & Movements
    await tx.inventoryMovement.deleteMany({});
    await tx.fifoLayer.deleteMany({});
    await tx.inventoryItem.deleteMany({});

    // 10. CMS Product Links (Junction table to products)
    await tx.cmsSectionProduct.deleteMany({});

    // 11. Products, Variants, Images, Buttons & Options
    await tx.productButton.deleteMany({});
    await tx.productImage.deleteMany({});
    await tx.productOptionValue.deleteMany({});
    await tx.productOption.deleteMany({});
    await tx.productVariant.deleteMany({});
    await tx.product.deleteMany({});

    // 12. Categories (break parent hierarchy first, then delete all)
    await tx.$executeRawUnsafe(`UPDATE "categories" SET "parent_id" = NULL;`);
    await tx.category.deleteMany({});

    // 13. Reset Document Sequences to default start 1001
    await tx.documentSequence.updateMany({
      data: {
        nextValue: 1001,
      },
    });

    // 14. Clean CMS sections published payload productIds so no stale IDs remain
    const publishedSections = await tx.cmsSection.findMany();
    for (const sec of publishedSections) {
      if (sec.publishedPayloadJson) {
        try {
          const payload = JSON.parse(sec.publishedPayloadJson);
          if (payload.productIds && payload.productIds.length > 0) {
            payload.productIds = [];
            await tx.cmsSection.update({
              where: { id: sec.id },
              data: { publishedPayloadJson: JSON.stringify(payload) },
            });
          }
        } catch {
          // ignore parsing error
        }
      }
    }
  }, {
    timeout: 60000,
  });

  console.log('\n[SIFR DB Clean] Deletion complete. Verifying post-cleanup counts...');

  const postCounts: Record<string, number> = {
    products: await prisma.product.count(),
    product_variants: await prisma.productVariant.count(),
    product_images: await prisma.productImage.count(),
    product_options: await prisma.productOption.count(),
    product_option_values: await prisma.productOptionValue.count(),
    product_buttons: await prisma.productButton.count(),
    categories: await prisma.category.count(),
    inventory_items: await prisma.inventoryItem.count(),
    fifo_layers: await prisma.fifoLayer.count(),
    inventory_movements: await prisma.inventoryMovement.count(),
    purchases: await prisma.purchase.count(),
    purchase_lines: await prisma.purchaseLine.count(),
    vendors: await prisma.vendor.count(),
    orders: await prisma.order.count(),
    order_items: await prisma.orderItem.count(),
    order_status_transitions: await prisma.orderStatusTransition.count(),
    shipments: await prisma.shipment.count(),
    customers: await prisma.customer.count(),
    carts: await prisma.cart.count(),
    cart_items: await prisma.cartItem.count(),
    coupons: await prisma.coupon.count(),
    coupon_usages: await prisma.couponUsage.count(),
    coupon_products: await prisma.couponProduct.count(),
    coupon_categories: await prisma.couponCategory.count(),
    payments: await prisma.payment.count(),
    payment_webhook_events: await prisma.paymentWebhookEvent.count(),
    return_requests: await prisma.returnRequest.count(),
    return_items: await prisma.returnItem.count(),
    return_receipt_events: await prisma.returnReceiptEvent.count(),
    return_receipt_items: await prisma.returnReceiptItem.count(),
    exchange_items: await prisma.exchangeItem.count(),
    refunds: await prisma.refund.count(),
    refund_line_allocations: await prisma.refundLineAllocation.count(),
    notifications: await prisma.notification.count(),
    notification_attempts: await prisma.notificationAttempt.count(),
    cms_section_products: await prisma.cmsSectionProduct.count(),
    // Preserved
    admin_users: await prisma.adminUser.count(),
    store_settings: await prisma.storeSettings.count(),
    document_sequences: await prisma.documentSequence.count(),
    cms_sections: await prisma.cmsSection.count(),
    cms_buttons: await prisma.cmsButton.count(),
    cms_feature_cards: await prisma.cmsFeatureCard.count(),
  };

  console.log('\n[SIFR DB Clean] --- Post-cleanup Verification ---');
  for (const [k, v] of Object.entries(postCounts)) {
    console.log(`  ${k}: ${v}`);
  }

  console.log('\n[SIFR DB Clean] SUCCESS: All transactional, catalog, and test data cleared cleanly.');
}

cleanDevDatabase()
  .catch((err) => {
    console.error('[SIFR DB Clean Error]:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
