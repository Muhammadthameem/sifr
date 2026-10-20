import { prisma } from '../lib/db/prisma';
import { encryptSession, ADMIN_SESSION_COOKIE } from '../lib/auth/session';

async function main() {
  console.log('Testing Product Shipping UI on http://localhost:3000 ...\n');

  const adminToken = await encryptSession({
    adminId: 'admin-test-id',
    email: 'admin@sifr.com',
    name: 'Admin Tester',
  });
  const authCookie = `${ADMIN_SESSION_COOKIE}=${adminToken}`;

  // 1. Find an existing product
  const product = await prisma.product.findFirst({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, shippingCharge: true },
  });

  if (!product) {
    throw new Error('No ACTIVE product found in database');
  }

  console.log(`Using product: ${product.name} (id: ${product.id}, shippingCharge: ${product.shippingCharge})`);

  // 2. Test GET /admin/products
  console.log('\n1. Testing GET /admin/products ...');
  const listRes = await fetch('http://localhost:3000/admin/products', {
    headers: { Cookie: authCookie },
  });
  console.log(`   Status: ${listRes.status}`);
  if (listRes.status !== 200) {
    const text = await listRes.text();
    throw new Error(`Failed to load /admin/products: ${listRes.status} ${text.slice(0, 200)}`);
  }
  const listHtml = await listRes.text();
  const hasShippingInList = listHtml.includes('Shipping:');
  console.log(`   Renders shipping charge indicator: ${hasShippingInList}`);
  if (!hasShippingInList) {
    throw new Error('Expected Shipping indicator in /admin/products list');
  }

  // 3. Test GET /admin/products/create
  console.log('\n2. Testing GET /admin/products/create ...');
  const createRes = await fetch('http://localhost:3000/admin/products/create', {
    headers: { Cookie: authCookie },
  });
  console.log(`   Status: ${createRes.status}`);
  if (createRes.status !== 200) {
    const text = await createRes.text();
    throw new Error(`Failed to load /admin/products/create: ${createRes.status} ${text.slice(0, 200)}`);
  }
  const createHtml = await createRes.text();
  const hasShippingInputInCreate =
    createHtml.includes('Shipping Charge') &&
    createHtml.includes('product-shipping-charge-input');
  console.log(`   Contains Shipping Charge input: ${hasShippingInputInCreate}`);
  if (!hasShippingInputInCreate) {
    throw new Error('Expected Shipping Charge field in /admin/products/create');
  }

  // 4. Test GET /admin/products/[id]/edit
  console.log(`\n3. Testing GET /admin/products/${product.id}/edit ...`);
  const editRes = await fetch(`http://localhost:3000/admin/products/${product.id}/edit`, {
    headers: { Cookie: authCookie },
  });
  console.log(`   Status: ${editRes.status}`);
  if (editRes.status !== 200) {
    const text = await editRes.text();
    throw new Error(`Failed to load /admin/products/${product.id}/edit: ${editRes.status} ${text.slice(0, 200)}`);
  }
  const editHtml = await editRes.text();
  const hasShippingInputInEdit =
    editHtml.includes('Shipping Charge') &&
    editHtml.includes('product-shipping-charge-input');
  console.log(`   Contains Shipping Charge input: ${hasShippingInputInEdit}`);
  if (!hasShippingInputInEdit) {
    throw new Error('Expected Shipping Charge field in /admin/products/[id]/edit');
  }

  console.log('\n================================================================');
  console.log('✓ All Product Shipping UI & Endpoint checks passed successfully!');
  console.log('================================================================');
}

main()
  .catch((err) => {
    console.error('UI verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
