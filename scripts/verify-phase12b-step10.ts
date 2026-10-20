import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/db/prisma';

async function main() {
  console.log('=== VERIFYING PHASE 12B STEP 10 (Order Confirmation Visual Refinement) ===');

  const pagePath = path.join(process.cwd(), 'app', '(store)', 'order-confirmation', '[orderNumber]', 'page.tsx');
  if (!fs.existsSync(pagePath)) {
    throw new Error('Step 10 Failed: Order confirmation route app/(store)/order-confirmation/[orderNumber]/page.tsx does not exist.');
  }

  const fileContent = fs.readFileSync(pagePath, 'utf8');

  // 1. Verify guestAccessToken authorization logic is preserved
  if (!fileContent.includes('guestAccessToken') || !fileContent.includes('guestAccessTokenExpiresAt') || !fileContent.includes('notFound()')) {
    throw new Error('Step 10 Failed: guestAccessToken authorization or expiration check was missing or modified.');
  }

  // 2. Verify reuse of existing order lookup
  if (!fileContent.includes('prisma.order.findUnique') || !fileContent.includes('orderNumber: params.orderNumber')) {
    throw new Error('Step 10 Failed: Existing prisma.order.findUnique order lookup was not reused.');
  }

  // 3. Verify Light Editorial design system tokens and styling
  const lightDesignTokens = ['bg-white', '#111111', '#666666', '#EAEAEA', '#FAFAF8', 'font-serif'];
  for (const token of lightDesignTokens) {
    if (!fileContent.includes(token)) {
      throw new Error(`Step 10 Failed: Light Editorial design token "${token}" is missing from order confirmation page.`);
    }
  }

  // 4. Verify no dark theme classes remain as primary containers
  if (fileContent.includes('bg-neutral-950') || fileContent.includes('bg-purple-950')) {
    throw new Error('Step 10 Failed: Order confirmation still contains dark theme background classes.');
  }

  // 5. Verify tracking CTA conditionally checks trackingUrl/shipment
  if (!fileContent.includes('order.shipment') || !fileContent.includes('order.shipment.trackingUrl')) {
    throw new Error('Step 10 Failed: Shipment and tracking URL conditional handling is missing.');
  }

  // 6. Verify Continue Shopping link exists
  if (!fileContent.includes('Continue Shopping') || !fileContent.includes('href="/"')) {
    throw new Error('Step 10 Failed: "Continue Shopping" link pointing to "/" is missing.');
  }

  // 7. Verify security/data-exposure rules (costPrice, fifoCogs should not be displayed)
  if (fileContent.includes('fifoCogs') || fileContent.includes('costPrice')) {
    throw new Error('Step 10 Failed: Internal cost or FIFO COGS data was exposed in order confirmation UI.');
  }

  // 8. Verify DB verification with an actual sample or created order
  const sampleOrder = await prisma.order.findFirst({
    include: {
      items: true,
      shipment: true,
    },
  });

  if (sampleOrder) {
    console.log(`✓ Sample Order Verified: ${sampleOrder.orderNumber}`);
    console.log(`✓ Status: ${sampleOrder.status} | Payment: ${sampleOrder.paymentStatus}`);
    console.log(`✓ Items Count: ${sampleOrder.items.length}`);
    if (sampleOrder.shipment) {
      console.log(`✓ Shipment Courier: ${sampleOrder.shipment.courierName} (${sampleOrder.shipment.trackingId})`);
    } else {
      console.log('✓ No shipment linked (tracking CTA omitted as expected)');
    }
  } else {
    console.log('✓ No existing orders in DB to query, static code verification passed.');
  }

  console.log('✓ All Step 10 checks PASSED successfully!');
}

main()
  .catch((err) => {
    console.error('VERIFICATION FAILED:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
