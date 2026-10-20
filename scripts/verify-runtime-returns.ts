import { prisma } from '../lib/db/prisma';
import { encryptSession, ADMIN_SESSION_COOKIE } from '../lib/auth/session';
import { OrderStatus, SalesChannel, PaymentStatus, ProductStatus, ReturnReason } from '@prisma/client';
import { createAdminFullReturn } from '../lib/returns/return-engine';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
  console.log(`Testing Runtime Returns Module on ${BASE_URL} ...\n`);

  // 1. Unauthenticated GET /admin/returns
  console.log('1. Testing unauthenticated GET /admin/returns ...');
  const unauthRes = await fetch(`${BASE_URL}/admin/returns`, {
    redirect: 'manual',
  });
  console.log(`   Status: ${unauthRes.status}`);
  if (unauthRes.status === 307 || unauthRes.status === 302 || unauthRes.status === 303) {
    const loc = unauthRes.headers.get('location');
    console.log(`   Redirect Location: ${loc}`);
    if (!loc?.includes('/admin/login')) {
      throw new Error(`Expected redirect to /admin/login, got: ${loc}`);
    }
  } else {
    throw new Error(`Expected redirect 307/302, got ${unauthRes.status}`);
  }

  // Create test return to test detail page
  const runId = Math.floor(100000 + Math.random() * 900000).toString();
  const testPhone = `+919876${runId.slice(0, 6)}`;

  let customer = await prisma.customer.findUnique({ where: { mobile: testPhone } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: { name: 'Runtime Return Customer', mobile: testPhone },
    });
  }

  let product = await prisma.product.findFirst({
    include: { variants: true },
  });
  if (!product || product.variants.length === 0) {
    const cat = await prisma.category.create({ data: { name: `Runtime Cat ${runId}`, slug: `runtime-cat-${runId}` } });
    product = await prisma.product.create({
      data: {
        name: `Runtime Shirt ${runId}`,
        slug: `runtime-shirt-${runId}`,
        categoryId: cat.id,
        status: ProductStatus.ACTIVE,
        variants: {
          create: {
            sku: `SKU-RUN-${runId}`,
            title: 'M',
            sellingPrice: 1500,
            mrp: 1800,
          },
        },
      },
      include: { variants: true },
    });
  }

  const order = await prisma.order.create({
    data: {
      orderNumber: `WA-RUN-${Date.now()}`,
      salesChannel: SalesChannel.WHATSAPP,
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PAID,
      customerId: customer.id,
      customerNameSnapshot: 'Runtime Return Customer',
      customerMobileSnapshot: testPhone,
      subtotal: 1500,
      grandTotal: 1500,
      items: {
        create: {
          variantId: product.variants[0].id,
          productNameSnapshot: product.name,
          variantTitleSnapshot: product.variants[0].title,
          skuSnapshot: product.variants[0].sku,
          quantity: 1,
          unitPrice: 1500,
          mrp: 1800,
          lineTotal: 1500,
        },
      },
    },
    include: { items: true },
  });

  const testReturn = await createAdminFullReturn({
    orderId: order.id,
    reason: ReturnReason.CHANGE_OF_MIND,
  });

  // 2. Unauthenticated GET /admin/returns/[id]
  console.log('\n2. Testing unauthenticated GET /admin/returns/[id] ...');
  const unauthDetail = await fetch(`${BASE_URL}/admin/returns/${testReturn.id}`, {
    redirect: 'manual',
  });
  console.log(`   Status: ${unauthDetail.status}`);
  if (unauthDetail.status !== 307 && unauthDetail.status !== 302) {
    throw new Error(`Expected redirect, got: ${unauthDetail.status}`);
  }

  // 3. Authenticated GET /admin/returns
  console.log('\n3. Testing authenticated GET /admin/returns ...');
  const token = await encryptSession({
    adminId: 'mock-admin-id',
    email: 'admin@sifr.in',
    name: 'Administrator',
  });

  const authListRes = await fetch(`${BASE_URL}/admin/returns`, {
    headers: {
      Cookie: `${ADMIN_SESSION_COOKIE}=${token}`,
    },
  });
  console.log(`   Status: ${authListRes.status}`);
  const listHtml = await authListRes.text();
  const hasHeading = listHtml.includes('Customer Returns');
  const hasSubtitle = listHtml.includes('Manage customer return requests, accepted returns and refunds');
  const hasCreateAction = listHtml.includes('Create Return');
  const hasTotalCard = listHtml.includes('Total Returns');
  const hasPendingCard = listHtml.includes('Pending Requests');
  const hasAcceptedCard = listHtml.includes('Accepted');
  const hasRejectedCard = listHtml.includes('Rejected');

  // Verify old lifecycle filters are NOT rendered
  const hasApprovedFilter = listHtml.includes('APPROVED');
  const hasReceivedFilter = listHtml.includes('RECEIVED');
  const hasInspectedFilter = listHtml.includes('INSPECTED');
  const hasResolvedFilter = listHtml.includes('RESOLVED');

  console.log(`   Has Heading "Customer Returns": ${hasHeading}`);
  console.log(`   Has Subtitle: ${hasSubtitle}`);
  console.log(`   Has Create Return button: ${hasCreateAction}`);
  console.log(`   Has Summary Cards (Total, Pending, Accepted, Rejected): ${hasTotalCard && hasPendingCard && hasAcceptedCard && hasRejectedCard}`);
  console.log(`   Old Lifecycle Filters Gone: ${!hasApprovedFilter && !hasReceivedFilter && !hasInspectedFilter && !hasResolvedFilter}`);

  if (!hasHeading || !hasSubtitle || !hasCreateAction) {
    throw new Error('Returns list page missing required header or actions.');
  }

  // 4. Authenticated GET /admin/returns/[id]
  console.log('\n4. Testing authenticated GET /admin/returns/[id] ...');
  const authDetailRes = await fetch(`${BASE_URL}/admin/returns/${testReturn.id}`, {
    headers: {
      Cookie: `${ADMIN_SESSION_COOKIE}=${token}`,
    },
  });
  console.log(`   Status: ${authDetailRes.status}`);
  const detailHtml = await authDetailRes.text();
  const hasReturnNumber = detailHtml.includes(testReturn.returnNumber);
  const hasOrderNumber = detailHtml.includes(order.orderNumber);
  const hasAcceptButton = detailHtml.includes('Accept Return');
  const hasRejectButton = detailHtml.includes('Reject Return');

  console.log(`   Has Return Number: ${hasReturnNumber}`);
  console.log(`   Has Order Number: ${hasOrderNumber}`);
  console.log(`   Has Accept Return Action: ${hasAcceptButton}`);
  console.log(`   Has Reject Return Action: ${hasRejectButton}`);

  if (!hasReturnNumber || !hasOrderNumber || !hasAcceptButton || !hasRejectButton) {
    throw new Error('Return detail page missing required details or action buttons.');
  }

  // Clean up test order & return
  await prisma.returnItem.deleteMany({ where: { returnRequestId: testReturn.id } });
  await prisma.returnRequest.delete({ where: { id: testReturn.id } });
  await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
  await prisma.order.delete({ where: { id: order.id } });
  await prisma.customer.delete({ where: { id: customer.id } });

  console.log('\n================================================================');
  console.log('✓ All Runtime Returns Module endpoints verified successfully!');
  console.log('================================================================\n');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Runtime verification failed:', e);
    process.exit(1);
  });
