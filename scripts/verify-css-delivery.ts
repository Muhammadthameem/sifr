import http from 'http';
import fs from 'fs';
import path from 'path';

// Load .env into process.env if present
try {
  const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
} catch {}

import { encryptSession, ADMIN_SESSION_COOKIE } from '../lib/auth/session';

interface RequestResult {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function makeRequest(
  path: string,
  options: { cookie?: string; method?: string } = {}
): Promise<RequestResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method: options.method || 'GET',
        headers: {
          ...(options.cookie ? { Cookie: options.cookie } : {}),
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body,
          });
        });
      }
    );

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

function extractStylesheetHrefs(html: string): string[] {
  const matches = Array.from(html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi));
  const hrefs: string[] = [];
  for (const match of matches) {
    if (match[1]) hrefs.push(match[1]);
  }
  // Also check href before rel
  const matchesRev = Array.from(html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']stylesheet["']/gi));
  for (const match of matchesRev) {
    if (match[1] && !hrefs.includes(match[1])) hrefs.push(match[1]);
  }
  return hrefs;
}

async function run() {
  console.log('='.repeat(70));
  console.log('       SIFR CSS & TAILWIND RENDERING VERIFICATION SUITE');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${msg}`);
      failed++;
    }
  }

  // 1. Generate Admin Session Cookie
  console.log('\n--- 1. Authenticated Session Setup ---');
  const token = await encryptSession({
    adminId: 'css-test-admin-id',
    email: 'admin@sifr.in',
    name: 'Admin Test User',
  });
  const adminCookie = `${ADMIN_SESSION_COOKIE}=${token}`;
  assert(Boolean(token), 'Generated valid encrypted admin session token');

  // 2. Storefront Routes Verification
  console.log('\n--- 2. Storefront Pages & CSS Loading ---');
  const storefrontRoutes = [
    { name: 'Storefront Homepage', path: '/' },
    { name: 'Storefront Shop', path: '/shop' },
    { name: 'Storefront Men Category', path: '/men' },
    { name: 'Storefront Women Category', path: '/women' },
    { name: 'Storefront Cart', path: '/cart' },
  ];

  let primaryCssHref = '';

  for (const route of storefrontRoutes) {
    const res = await makeRequest(route.path);
    assert(res.statusCode === 200, `${route.name} (${route.path}) returned HTTP 200 OK`);

    const stylesheets = extractStylesheetHrefs(res.body);
    assert(
      stylesheets.length > 0,
      `${route.name} includes stylesheet <link>: found ${stylesheets.join(', ')}`
    );

    if (!primaryCssHref && stylesheets.length > 0) {
      primaryCssHref = stylesheets[0];
    }
  }

  // 3. CSS Asset Delivery & Tailwind Compilation Verification
  console.log('\n--- 3. Stylesheet Asset Content & Tailwind Compilation ---');
  assert(Boolean(primaryCssHref), `Found primary stylesheet URL: ${primaryCssHref}`);

  const cssRes = await makeRequest(primaryCssHref);
  assert(cssRes.statusCode === 200, `Stylesheet asset request returned HTTP 200 OK`);

  const contentType = (cssRes.headers['content-type'] || '').toLowerCase();
  assert(
    contentType.includes('text/css'),
    `Stylesheet Content-Type is text/css (got "${contentType}")`
  );

  const cssBytes = Buffer.byteLength(cssRes.body, 'utf8');
  assert(
    cssBytes > 40000,
    `Stylesheet contains substantial compiled CSS bundle (${(cssBytes / 1024).toFixed(1)} KB > 40 KB)`
  );

  // Check critical Tailwind utility classes and theme tokens
  const containsFontSerif = cssRes.body.includes('font-serif');
  const containsFontSans = cssRes.body.includes('font-sans') || cssRes.body.includes('--font-inter');
  const containsBgWhite = cssRes.body.includes('bg-white');
  const containsFlex = cssRes.body.includes('flex');
  const containsGrid = cssRes.body.includes('grid');
  const containsSubtleColor = cssRes.body.includes('#fafaf8') || cssRes.body.includes('#FAFAF8');

  assert(containsFontSerif, 'CSS bundle contains custom theme font-serif (Cormorant Garamond)');
  assert(containsFontSans, 'CSS bundle contains custom theme font-sans (Inter)');
  assert(containsBgWhite, 'CSS bundle contains standard utility .bg-white');
  assert(containsFlex, 'CSS bundle contains layout utility .flex');
  assert(containsGrid, 'CSS bundle contains layout utility .grid');
  assert(containsSubtleColor, 'CSS bundle contains custom theme color subtle (#FAFAF8)');

  // 4. Admin Login Page Verification
  console.log('\n--- 4. Admin Login Page Styling ---');
  const loginRes = await makeRequest('/admin/login');
  assert(loginRes.statusCode === 200, 'Admin login page (/admin/login) returned HTTP 200 OK');
  const loginStylesheets = extractStylesheetHrefs(loginRes.body);
  assert(loginStylesheets.length > 0, 'Admin login page links to stylesheet');
  assert(
    loginRes.body.includes('bg-neutral-950') && loginRes.body.includes('Single Owner Access'),
    'Admin login page markup contains expected styling classes and content'
  );

  // 5. Protected Admin Routes Verification
  console.log('\n--- 5. Protected Admin Routes & Layout Styling ---');
  const unauthRes = await makeRequest('/admin');
  assert(
    unauthRes.statusCode === 307 || unauthRes.statusCode === 302,
    `Unauthenticated /admin redirects securely (HTTP ${unauthRes.statusCode})`
  );

  const adminRoutes = [
    { name: 'Admin Dashboard', path: '/admin/dashboard' },
    { name: 'Admin Products', path: '/admin/products' },
    { name: 'Admin Categories', path: '/admin/categories' },
    { name: 'Admin Inventory', path: '/admin/inventory' },
    { name: 'Admin Purchases', path: '/admin/purchases' },
    { name: 'Admin Vendors', path: '/admin/vendors' },
    { name: 'Admin Orders', path: '/admin/orders' },
    { name: 'Admin Payments', path: '/admin/payments' },
    { name: 'Admin Direct Sales', path: '/admin/direct-sales' },
    { name: 'Admin Customers', path: '/admin/customers' },
    { name: 'Admin Returns', path: '/admin/returns' },
    { name: 'Admin Expenses', path: '/admin/expenses' },
    { name: 'Admin Discounts', path: '/admin/discounts' },
    { name: 'Admin Website/CMS', path: '/admin/website' },
    { name: 'Admin Reports', path: '/admin/reports' },
    { name: 'Admin Settings', path: '/admin/settings' },
  ];

  for (const route of adminRoutes) {
    const res = await makeRequest(route.path, { cookie: adminCookie });
    assert(
      res.statusCode === 200,
      `${route.name} (${route.path}) authenticated request returned HTTP 200 OK`
    );

    const sheets = extractStylesheetHrefs(res.body);
    assert(
      sheets.length > 0,
      `${route.name} links to stylesheet: found ${sheets.join(', ')}`
    );

    // Verify presence of Admin layout classes
    const hasAdminShell = res.body.includes('bg-neutral-950') || res.body.includes('AdminSidebar');
    assert(hasAdminShell, `${route.name} renders with dark theme admin shell styling`);
  }

  console.log('\n' + '='.repeat(70));
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during CSS verification:', err);
  process.exit(1);
});
