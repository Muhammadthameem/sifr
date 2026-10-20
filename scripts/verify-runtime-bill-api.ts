import { prisma } from '../lib/db/prisma';
import { encryptSession, ADMIN_SESSION_COOKIE } from '../lib/auth/session';

async function main() {
  console.log('Testing Runtime Bill API on http://localhost:3000 ...');

  // Find a CONFIRMED order and a CONTACTED order
  const confirmedOrder = await prisma.order.findFirst({
    where: { status: 'CONFIRMED' },
    select: { id: true, orderNumber: true }
  });

  const contactedOrder = await prisma.order.findFirst({
    where: { status: 'CONTACTED' },
    select: { id: true, orderNumber: true }
  });

  if (!confirmedOrder) {
    throw new Error('No CONFIRMED order found in database');
  }

  // 1. Unauthenticated GET /api/admin/orders/[id]/bill
  console.log('\n1. Testing unauthenticated GET /api/admin/orders/[id]/bill ...');
  const unauthRes = await fetch(`http://localhost:3000/api/admin/orders/${confirmedOrder.id}/bill`);
  console.log(`   Status: ${unauthRes.status}`);
  if (unauthRes.status !== 401) {
    throw new Error(`Expected 401 Unauthorized, got ${unauthRes.status}`);
  }
  const unauthBody = await unauthRes.json();
  console.log(`   Response: ${JSON.stringify(unauthBody)}`);

  // Generate valid admin auth cookie
  const adminToken = await encryptSession({
    adminId: 'admin-test-id',
    email: 'admin@sifr.com',
    name: 'Admin Tester'
  });
  const authCookie = `${ADMIN_SESSION_COOKIE}=${adminToken}`;

  // 2. Authenticated GET /api/admin/orders/[id]/bill (inline preview)
  console.log('\n2. Testing authenticated GET /api/admin/orders/[id]/bill (inline preview) ...');
  const authRes = await fetch(`http://localhost:3000/api/admin/orders/${confirmedOrder.id}/bill`, {
    headers: { Cookie: authCookie }
  });
  console.log(`   Status: ${authRes.status}`);
  console.log(`   Content-Type: ${authRes.headers.get('content-type')}`);
  console.log(`   Content-Disposition: ${authRes.headers.get('content-disposition')}`);
  
  if (authRes.status !== 200) {
    const errorText = await authRes.text();
    throw new Error(`Expected 200 OK, got ${authRes.status}: ${errorText}`);
  }
  if (authRes.headers.get('content-type') !== 'application/pdf') {
    throw new Error(`Expected application/pdf, got ${authRes.headers.get('content-type')}`);
  }
  if (!authRes.headers.get('content-disposition')?.includes('inline')) {
    throw new Error(`Expected inline Content-Disposition, got ${authRes.headers.get('content-disposition')}`);
  }

  const pdfBuffer = await authRes.arrayBuffer();
  const pdfHeader = Buffer.from(pdfBuffer.slice(0, 5)).toString('utf-8');
  console.log(`   PDF Magic bytes: ${pdfHeader} (${pdfBuffer.byteLength} bytes)`);
  if (!pdfHeader.startsWith('%PDF-')) {
    throw new Error(`Invalid PDF header: ${pdfHeader}`);
  }

  // 3. Authenticated GET /api/admin/orders/[id]/bill?download=1 (download)
  console.log('\n3. Testing authenticated GET /api/admin/orders/[id]/bill?download=1 (attachment) ...');
  const downloadRes = await fetch(`http://localhost:3000/api/admin/orders/${confirmedOrder.id}/bill?download=1`, {
    headers: { Cookie: authCookie }
  });
  console.log(`   Status: ${downloadRes.status}`);
  console.log(`   Content-Disposition: ${downloadRes.headers.get('content-disposition')}`);
  if (!downloadRes.headers.get('content-disposition')?.includes('attachment')) {
    throw new Error(`Expected attachment Content-Disposition, got ${downloadRes.headers.get('content-disposition')}`);
  }

  // 4. Authenticated GET for CONTACTED order (should reject with 400)
  if (contactedOrder) {
    console.log('\n4. Testing authenticated GET for CONTACTED order (should reject) ...');
    const contactedRes = await fetch(`http://localhost:3000/api/admin/orders/${contactedOrder.id}/bill`, {
      headers: { Cookie: authCookie }
    });
    console.log(`   Status: ${contactedRes.status}`);
    if (contactedRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request, got ${contactedRes.status}`);
    }
    const contactedBody = await contactedRes.json();
    console.log(`   Response: ${JSON.stringify(contactedBody)}`);
  }

  // 5. Test Admin Order Details Page loads 200 OK
  console.log('\n5. Testing GET /admin/orders/[id] page rendering ...');
  const pageRes = await fetch(`http://localhost:3000/admin/orders/${confirmedOrder.id}`, {
    headers: { Cookie: authCookie }
  });
  console.log(`   Status: ${pageRes.status}`);
  if (pageRes.status !== 200) {
    const pageErr = await pageRes.text();
    throw new Error(`Expected 200 OK for order details page, got ${pageRes.status}: ${pageErr.slice(0, 300)}`);
  }

  console.log('\n=========================================');
  console.log('✓ All runtime bill & WhatsApp endpoint checks passed!');
  console.log('=========================================');
}

main()
  .catch((e) => {
    console.error('Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
