import { prisma } from '../lib/db/prisma';
import { encryptSession, ADMIN_SESSION_COOKIE } from '../lib/auth/session';

async function main() {
  console.log('Testing Runtime Customers Module on http://localhost:3000 ...\n');

  // 1. Find a customer
  const customer = await prisma.customer.findFirst({
    select: { id: true, name: true, mobile: true },
  });

  if (!customer) {
    throw new Error('No customer found in database');
  }

  console.log(`Using customer: ${customer.name} (id: ${customer.id}, mobile: ${customer.mobile})`);

  // 2. Unauthenticated GET /admin/customers -> must redirect or 401/307
  console.log('\n1. Testing unauthenticated GET /admin/customers ...');
  const unauthListRes = await fetch('http://localhost:3000/admin/customers', {
    redirect: 'manual',
  });
  console.log(`   Status: ${unauthListRes.status}`);
  const isRedirect = unauthListRes.status === 307 || unauthListRes.status === 302 || unauthListRes.status === 308;
  if (!isRedirect) {
    throw new Error(`Expected redirect (307/302), got ${unauthListRes.status}`);
  }
  const redirectLocation = unauthListRes.headers.get('location') || '';
  console.log(`   Redirect Location: ${redirectLocation}`);
  if (!redirectLocation.includes('/admin/login')) {
    throw new Error(`Expected redirect to /admin/login, got ${redirectLocation}`);
  }

  // 3. Unauthenticated GET /admin/customers/[id] -> must redirect
  console.log('\n2. Testing unauthenticated GET /admin/customers/[id] ...');
  const unauthDetailRes = await fetch(`http://localhost:3000/admin/customers/${customer.id}`, {
    redirect: 'manual',
  });
  console.log(`   Status: ${unauthDetailRes.status}`);
  if (unauthDetailRes.status !== 307 && unauthDetailRes.status !== 302) {
    throw new Error(`Expected redirect (307/302), got ${unauthDetailRes.status}`);
  }

  // Generate valid admin session token
  const adminToken = await encryptSession({
    adminId: 'admin-test-id',
    email: 'admin@sifr.com',
    name: 'Admin Tester',
  });
  const authCookie = `${ADMIN_SESSION_COOKIE}=${adminToken}`;

  // 4. Authenticated GET /admin/customers
  console.log('\n3. Testing authenticated GET /admin/customers ...');
  const authListRes = await fetch('http://localhost:3000/admin/customers', {
    headers: { Cookie: authCookie },
  });
  console.log(`   Status: ${authListRes.status}`);
  if (authListRes.status !== 200) {
    const text = await authListRes.text();
    throw new Error(`Failed to load /admin/customers: ${authListRes.status} ${text.slice(0, 200)}`);
  }
  const listHtml = await authListRes.text();
  const hasHeading = listHtml.includes('Customers');
  const hasSubtitle = listHtml.includes('GUEST CHECKOUT PROFILES AND PURCHASE HISTORIES');
  const placeholderGone = !listHtml.includes('STRUCTURAL NAVIGATION PLACEHOLDER');
  console.log(`   Has Customers Heading: ${hasHeading}`);
  console.log(`   Has Required Subtitle: ${hasSubtitle}`);
  console.log(`   Structural Placeholder Gone: ${placeholderGone}`);
  if (!hasHeading || !hasSubtitle || !placeholderGone) {
    throw new Error('Customer list page content verification failed');
  }

  // 5. Authenticated GET /admin/customers/[id]
  console.log('\n4. Testing authenticated GET /admin/customers/[id] ...');
  const authDetailRes = await fetch(`http://localhost:3000/admin/customers/${customer.id}`, {
    headers: { Cookie: authCookie },
  });
  console.log(`   Status: ${authDetailRes.status}`);
  if (authDetailRes.status !== 200) {
    const text = await authDetailRes.text();
    throw new Error(`Failed to load /admin/customers/${customer.id}: ${authDetailRes.status} ${text.slice(0, 200)}`);
  }
  const detailHtml = await authDetailRes.text();
  const hasCustInfo = detailHtml.includes('Customer Information');
  const hasPurchaseSummary = detailHtml.includes('Purchase Summary');
  const hasOrderHistory = detailHtml.includes('Order History');
  console.log(`   Has Customer Information Card: ${hasCustInfo}`);
  console.log(`   Has Purchase Summary Card: ${hasPurchaseSummary}`);
  console.log(`   Has Order History Table: ${hasOrderHistory}`);
  if (!hasCustInfo || !hasPurchaseSummary || !hasOrderHistory) {
    throw new Error('Customer detail page content verification failed');
  }

  console.log('\n================================================================');
  console.log('✓ All Runtime Customers Module endpoints verified successfully!');
  console.log('================================================================');
}

main()
  .catch((err) => {
    console.error('Runtime verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
