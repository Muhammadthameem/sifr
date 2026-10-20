import { prisma } from '../lib/db/prisma';
import {
  getStoreSettings,
  updateStoreSettings,
  renderNotificationTemplate,
  normalizeWhatsAppNumber,
  DEFAULT_STORE_SETTINGS,
} from '../lib/settings/settings-service';
import {
  getAdminSettingsAction,
  updateAdminSettingsAction,
  getPublicStoreSettingsAction,
} from '../lib/actions/settings-actions';
import {
  getBusinessWhatsAppNumber,
  getBusinessWhatsAppNumberAsync,
  buildWhatsAppOrderMessage,
  buildWhatsAppUrl,
} from '../lib/ordering/whatsapp';
import { createWhatsAppOrderAction } from '../lib/actions/order-actions';
import { isValidIndiaMobile, normalizeIndiaMobile } from '../lib/validation/mobile';
import { ProductStatus } from '@prisma/client';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`ASSERTION_FAILED: ${message}`);
  }
}

async function runSettingsAndFooterTests() {
  console.log('================================================================');
  console.log('SETTINGS & STOREFRONT FOOTER COMPLETION VERIFICATION');
  console.log('================================================================\n');

  const runId = Math.floor(100000 + Math.random() * 900000).toString();

  // Snapshot original settings so we can restore them in finally block
  const originalSettings = await getStoreSettings();

  try {
    // -------------------------------------------------------------------------
    // 1. WhatsApp Number Validation & Normalization
    // -------------------------------------------------------------------------
    console.log('--- SECTION 1: WHATSAPP VALIDATION & NORMALIZATION ---');

    // Valid formats
    assert(isValidIndiaMobile('9876543210'), 'Valid 10-digit mobile passes');
    assert(isValidIndiaMobile('+91 98765 43210'), 'Valid formatted +91 mobile passes');
    assert(isValidIndiaMobile('919876543210'), 'Valid 12-digit with 91 passes');
    assert(isValidIndiaMobile('09876543210'), 'Valid 11-digit with leading 0 passes');
    assert(normalizeWhatsAppNumber('9876543210') === '919876543210', 'Normalized digits match 919876543210');
    assert(normalizeWhatsAppNumber('+91 98765 43210') === '919876543210', 'Normalized +91 digits match 919876543210');

    // Invalid formats
    assert(!isValidIndiaMobile('12345'), 'Too short number rejected');
    assert(!isValidIndiaMobile('5987654321'), 'Number starting with 5 rejected (must start with 6-9)');
    assert(!isValidIndiaMobile('abcdefghij'), 'Non-numeric string rejected');
    console.log('  ✓ Test 1: Indian mobile validation and normalization verified');

    // -------------------------------------------------------------------------
    // 2. Settings Persistence & Retrieval
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 2: SETTINGS PERSISTENCE & RETRIEVAL ---');

    const testNumber = `98765${runId.slice(0, 5)}`;
    const updated = await updateStoreSettings({
      businessName: `SIFR Couture ${runId}`,
      storeDomain: `couture-${runId}.sifr.in`,
      tagline: 'Refined Minimalist Luxury',
      whatsAppNumber: testNumber,
      whatsAppGreeting: 'Custom Greeting: I want to order bespoke abayas.',
      email: `concierge-${runId}@sifr.in`,
      phone: '+91 98765 00000',
      address: 'Suite 404, Crescent Bay, Calicut, Kerala',
      instagramUrl: 'https://instagram.com/sifr_couture',
      facebookUrl: '', // blank allowed
      youtubeUrl: null, // null allowed
      confirmedOrderTemplate: 'Order #{order_code} confirmed by {store_name}! Preparing for {name}. Url: {order_url}',
      shippedOrderTemplate: 'Order #{order_code} shipped with {courier}. Tracking: {tracking_id} at {tracking_url}',
      contactedOrderTemplate: 'Thanks {name}, {store_name} received order #{order_code}. Check {order_url}',
      cancelledOrderTemplate: 'Order #{order_code} with {store_name} has been cancelled.',
      globalShippingCap: 150.0,
    });

    assert(updated.businessName === `SIFR Couture ${runId}`, 'Business name persisted');
    assert(updated.storeDomain === `couture-${runId}.sifr.in`, 'Store domain persisted');
    assert(updated.tagline === 'Refined Minimalist Luxury', 'Tagline persisted');
    assert(updated.whatsAppNumber === `91${testNumber}`, 'WhatsApp number normalized and persisted');
    assert(updated.email === `concierge-${runId}@sifr.in`, 'Email persisted');
    assert(updated.instagramUrl === 'https://instagram.com/sifr_couture', 'Instagram URL persisted');
    assert(updated.facebookUrl === null, 'Blank Facebook URL converted to null');
    assert(updated.youtubeUrl === null, 'Null YouTube URL persisted as null');
    assert(updated.globalShippingCap === 150.0, 'Global shipping cap persisted');
    console.log('  ✓ Test 2: Complete StoreSettings fields persisted and retrieved accurately');

    // -------------------------------------------------------------------------
    // 3. Notification Template Placeholders
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 3: NOTIFICATION TEMPLATE RENDERING ---');

    const sampleVars = {
      name: 'Mariam Al-Zaabi',
      order_code: 'WA-2026-999',
      order_url: 'https://sifr.in/orders/WA-2026-999',
      courier: 'Blue Dart',
      tracking_id: 'BD-123456',
      tracking_url: 'https://bluedart.com/track/BD-123456',
      store_name: 'SIFR Couture',
    };

    const renderedConfirmed = renderNotificationTemplate(updated.confirmedOrderTemplate, sampleVars);
    assert(renderedConfirmed.includes('Order #WA-2026-999 confirmed by SIFR Couture! Preparing for Mariam Al-Zaabi.'), 'Confirmed template rendered');

    const renderedShipped = renderNotificationTemplate(updated.shippedOrderTemplate, sampleVars);
    assert(renderedShipped.includes('shipped with Blue Dart. Tracking: BD-123456 at https://bluedart.com/track/BD-123456'), 'Shipped template rendered');

    const renderedContacted = renderNotificationTemplate(updated.contactedOrderTemplate, sampleVars);
    assert(renderedContacted.includes('Thanks Mariam Al-Zaabi, SIFR Couture received order #WA-2026-999'), 'Contacted template rendered');

    const renderedCancelled = renderNotificationTemplate(updated.cancelledOrderTemplate, sampleVars);
    assert(renderedCancelled.includes('Order #WA-2026-999 with SIFR Couture has been cancelled.'), 'Cancelled template rendered');
    console.log('  ✓ Test 3: Supported placeholders rendered across all 4 notification templates');

    // -------------------------------------------------------------------------
    // 4. Settings Propagation into WhatsApp Ordering Engine
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 4: WHATSAPP SETTINGS PROPAGATION ---');

    // getBusinessWhatsAppNumberAsync must return the persisted setting
    const asyncNum = await getBusinessWhatsAppNumberAsync();
    assert(asyncNum === `91${testNumber}`, 'getBusinessWhatsAppNumberAsync reflects persisted settings');

    // buildWhatsAppOrderMessage must reflect dynamic store name
    const sampleSnapshot: any = {
      orderNumber: 'WA-TEST-001',
      createdAt: new Date(),
      customerNameSnapshot: 'Zainab Begum',
      customerMobileSnapshot: '+919876543210',
      shippingAddressSnapshot: '12 Rose Villa, Kochi',
      items: [{
        productNameSnapshot: 'Silk Abaya',
        variantTitleSnapshot: 'M',
        skuSnapshot: 'SKU-001',
        quantity: 1,
        unitPrice: 2000,
        lineTotal: 2000,
      }],
      subtotal: 2000,
      discountTotal: 0,
      shippingFee: 50,
      grandTotal: 2050,
      paymentStatus: 'DUE',
    };

    const dynamicMsg = buildWhatsAppOrderMessage(sampleSnapshot, updated.businessName);
    assert(dynamicMsg.includes(`*${updated.businessName} — Order Request*`), 'WhatsApp message uses dynamic store name');

    // Verify buildWhatsAppUrl uses clean phone number
    const waUrl = buildWhatsAppUrl(asyncNum, dynamicMsg);
    assert(waUrl.startsWith(`https://wa.me/91${testNumber}?text=`), 'wa.me destination uses persisted phone number');
    console.log('  ✓ Test 4: Dynamic WhatsApp number and business name propagated to order engine');

    // -------------------------------------------------------------------------
    // 5. End-to-End createWhatsAppOrderAction Integration
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 5: E2E ORDER CREATION CONSUMES SETTINGS ---');

    // Create temporary product for testing order creation
    const category = await prisma.category.create({
      data: { name: `SetCat ${runId}`, slug: `setcat-${runId}` },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: `Settings Test Dress ${runId}`,
        slug: `set-dress-${runId}`,
        status: ProductStatus.ACTIVE,
        variants: {
          create: {
            title: 'Standard',
            sku: `SKU-SET-${runId}`,
            sellingPrice: 1500.0,
            mrp: 1800.0,
            inventoryItem: { create: { physicalStock: 10, reservedStock: 0 } },
          },
        },
      },
      include: { variants: true },
    });

    const orderActionRes = await createWhatsAppOrderAction({
      creationIdempotencyKey: `KEY-SET-${runId}`,
      customer: {
        name: 'Fatima Noor',
        mobile: `98764${runId.slice(0, 5)}`,
        address: 'Harbor Road',
        city: 'Calicut',
        state: 'Kerala',
        pincode: '673001',
      },
      items: [{ variantId: product.variants[0].id, quantity: 1 }],
    });

    assert(orderActionRes.success, 'createWhatsAppOrderAction succeeded');
    assert(orderActionRes.whatsAppUrl !== undefined, 'whatsAppUrl returned');
    assert(orderActionRes.whatsAppUrl!.includes(`wa.me/91${testNumber}`), 'whatsAppUrl contains persisted phone number');
    assert(orderActionRes.whatsAppMessage!.includes(`*${updated.businessName} — Order Request*`), 'whatsAppMessage contains dynamic store name');
    console.log('  ✓ Test 5: createWhatsAppOrderAction authoritatively consumed persisted Settings');

    // Clean up temporary order and product
    await prisma.orderItem.deleteMany({ where: { orderId: orderActionRes.order!.id } });
    await prisma.order.delete({ where: { id: orderActionRes.order!.id } });
    await prisma.inventoryItem.deleteMany({ where: { variantId: product.variants[0].id } });
    await prisma.productVariant.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });

    // -------------------------------------------------------------------------
    // 6. Security Guards on Settings Server Actions
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 6: SECURITY / AUTH GUARDS ---');

    let unauthGetBlocked = false;
    try {
      const res = await getAdminSettingsAction();
      if (!res.success) unauthGetBlocked = true;
    } catch {
      unauthGetBlocked = true;
    }
    assert(unauthGetBlocked, 'Unauthenticated getAdminSettingsAction is strictly blocked');

    let unauthUpdateBlocked = false;
    try {
      const res = await updateAdminSettingsAction(updated as any);
      if (!res.success) unauthUpdateBlocked = true;
    } catch {
      unauthUpdateBlocked = true;
    }
    assert(unauthUpdateBlocked, 'Unauthenticated updateAdminSettingsAction is strictly blocked');
    console.log('  ✓ Test 6: Settings server actions protected by requireAdminAuth()');

    // -------------------------------------------------------------------------
    // 7. Public Settings Retrieval for Storefront
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 7: STOREFRONT PUBLIC SETTINGS RETRIEVAL ---');

    const publicSettings = await getPublicStoreSettingsAction();
    assert(publicSettings.businessName === updated.businessName, 'Public settings returns dynamic businessName');
    assert(publicSettings.tagline === updated.tagline, 'Public settings returns dynamic tagline');
    assert(publicSettings.email === updated.email, 'Public settings returns dynamic email');
    assert(publicSettings.whatsAppNumber === updated.whatsAppNumber, 'Public settings returns dynamic whatsAppNumber');
    console.log('  ✓ Test 7: Public StoreSettings retrieval verified for storefront layout & footer');

    console.log('\n================================================================');
    console.log('✅ ALL SETTINGS & STOREFRONT FOOTER TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    // Restore original settings to leave database in pristine state
    console.log('\n--- Restoring Original Settings ---');
    try {
      await updateStoreSettings({
        businessName: originalSettings.businessName,
        storeDomain: originalSettings.storeDomain,
        tagline: originalSettings.tagline,
        whatsAppNumber: originalSettings.whatsAppNumber,
        whatsAppGreeting: originalSettings.whatsAppGreeting,
        email: originalSettings.email,
        phone: originalSettings.phone,
        address: originalSettings.address,
        instagramUrl: originalSettings.instagramUrl,
        facebookUrl: originalSettings.facebookUrl,
        youtubeUrl: originalSettings.youtubeUrl,
        confirmedOrderTemplate: originalSettings.confirmedOrderTemplate,
        shippedOrderTemplate: originalSettings.shippedOrderTemplate,
        contactedOrderTemplate: originalSettings.contactedOrderTemplate,
        cancelledOrderTemplate: originalSettings.cancelledOrderTemplate,
        globalShippingCap: originalSettings.globalShippingCap,
      });
      console.log('✅ Original settings restored successfully.');
    } catch (e: any) {
      console.warn('⚠️ Could not restore original settings:', e.message);
    }
  }
}

runSettingsAndFooterTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ TESTS FAILED:', err);
    process.exit(1);
  });
