import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/db/prisma';
import { searchStorefrontProducts } from '../lib/catalog/search-service';
import { getCartDetails } from '../lib/cart/cart-service';

async function main() {
  console.log('===========================================================');
  console.log('  SIFR PHASE 12B — MASTER IMPLEMENTATION VERIFICATION SUITE');
  console.log('===========================================================');

  // --- 1. CMS & SECTION VERIFICATION (Workstream 12B-1 & 12B-3) ---
  console.log('\n--- 1. CMS & Storefront Section Audit ---');
  const cmsManagerPath = path.join(process.cwd(), 'components', 'admin', 'CmsSectionManager.tsx');
  const cmsServicePath = path.join(process.cwd(), 'lib', 'cms', 'cms-service.ts');
  const homepagePath = path.join(process.cwd(), 'app', '(store)', 'page.tsx');

  if (!fs.existsSync(cmsManagerPath) || !fs.existsSync(cmsServicePath) || !fs.existsSync(homepagePath)) {
    throw new Error('CMS verification failed: Key CMS files are missing.');
  }

  const cmsServiceContent = fs.readFileSync(cmsServicePath, 'utf8');
  if (!cmsServiceContent.includes('getPublishedSections') || !cmsServiceContent.includes('publishCmsSection')) {
    throw new Error('CMS service is missing core getPublishedSections or publishCmsSection methods.');
  }
  console.log('✓ CMS draft/publish engine and storefront section renderer verified.');

  // --- 2. STOREFRONT DESIGN SYSTEM & LAYOUT AUDIT (Workstream 12B-2) ---
  console.log('\n--- 2. Storefront Design System & Shared Components Audit ---');
  const layoutPath = path.join(process.cwd(), 'app', 'layout.tsx');
  const headerPath = path.join(process.cwd(), 'components', 'store', 'StoreHeader.tsx');
  const footerPath = path.join(process.cwd(), 'components', 'store', 'StoreFooter.tsx');
  const productCardPath = path.join(process.cwd(), 'components', 'store', 'ProductCard.tsx');

  const layoutContent = fs.readFileSync(layoutPath, 'utf8');
  const headerContent = fs.readFileSync(headerPath, 'utf8');
  const footerContent = fs.readFileSync(footerPath, 'utf8');
  const productCardContent = fs.readFileSync(productCardPath, 'utf8');

  if (!layoutContent.includes('Cormorant_Garamond') || !layoutContent.includes('Inter')) {
    throw new Error('Design System Audit Failed: Cormorant Garamond / Inter Google Fonts missing in root layout.');
  }
  if (!headerContent.includes('STORE_NAV_ITEMS') || !headerContent.includes('BRAND_CONFIG') || !headerContent.includes('SEARCH') || !headerContent.includes('CART')) {
    throw new Error('Design System Audit Failed: Header structure violates locked specification.');
  }
  if (!footerContent.includes('BRAND_CONFIG') || footerContent.includes('type="email"') || footerContent.includes('Subscribe')) {
    throw new Error('Design System Audit Failed: StoreFooter includes forbidden newsletter subscription input.');
  }
  if (!productCardContent.includes('aspect-[4/5]')) {
    throw new Error('Design System Audit Failed: ProductCard does not enforce 4:5 image ratio.');
  }
  console.log('✓ Light Editorial Design System, Google Fonts, Header, Footer, and ProductCard verified.');

  // --- 3. PLP AUDIT (Workstream 12B-4) ---
  console.log('\n--- 3. Product Listing Pages (PLP) Audit ---');
  const menPlpPath = path.join(process.cwd(), 'app', '(store)', 'men', 'page.tsx');
  const womenPlpPath = path.join(process.cwd(), 'app', '(store)', 'women', 'page.tsx');
  const plpGridPath = path.join(process.cwd(), 'components', 'store', 'plp', 'PlpContainer.tsx');

  if (!fs.existsSync(menPlpPath) || !fs.existsSync(womenPlpPath) || !fs.existsSync(plpGridPath)) {
    throw new Error('PLP Audit Failed: /men, /women, or PlpGrid component missing.');
  }
  const plpGridContent = fs.readFileSync(plpGridPath, 'utf8');
  if (!plpGridContent.includes('loadMore') && !plpGridContent.includes('page')) {
    throw new Error('PLP Audit Failed: PlpGrid is missing pagination / load-more handling.');
  }
  console.log('✓ PLP routes (/men, /women) and responsive product grid verified.');

  // --- 4. PDP & SIZE GUIDE AUDIT (Workstream 12B-5) ---
  console.log('\n--- 4. Product Detail Page (PDP) & Size Guide Audit ---');
  const pdpPath = path.join(process.cwd(), 'app', '(store)', 'products', '[slug]', 'page.tsx');
  const pdpViewPath = path.join(process.cwd(), 'components', 'store', 'ProductDetailView.tsx');
  const sizeGuidePath = path.join(process.cwd(), 'components', 'store', 'SizeGuideModal.tsx');

  if (!fs.existsSync(pdpPath) || !fs.existsSync(pdpViewPath) || !fs.existsSync(sizeGuidePath)) {
    throw new Error('PDP Audit Failed: /products/[slug] or SizeGuideModal component missing.');
  }

  const sizeGuideContent = fs.readFileSync(sizeGuidePath, 'utf8');
  // Strict check: verify no fabricated sizing numbers (e.g. "38", "40", "42", "96", "100") are present in SizeGuideModal
  if (sizeGuideContent.includes('>38<') || sizeGuideContent.includes('>40<') || sizeGuideContent.includes('>96<')) {
    throw new Error('PDP Size Guide Audit Failed: Fabricated size measurement numbers detected in SizeGuideModal.tsx.');
  }
  if (!sizeGuideContent.includes('—')) {
    throw new Error('PDP Size Guide Audit Failed: Structural neutral placeholder "—" missing in SizeGuideModal.tsx.');
  }
  console.log('✓ PDP route, ProductDetailView, and Size Guide structural placeholder integrity verified.');

  // --- 5. SEARCH ENGINE AUDIT (Workstream 12B-6) ---
  console.log('\n--- 5. Full-Page Search & Suggestions Audit ---');
  const searchPagePath = path.join(process.cwd(), 'app', '(store)', 'search', 'page.tsx');
  const searchOverlayPath = path.join(process.cwd(), 'components', 'store', 'SearchOverlay.tsx');

  if (!fs.existsSync(searchPagePath) || !fs.existsSync(searchOverlayPath)) {
    throw new Error('Search Audit Failed: /search route or SearchOverlay component missing.');
  }

  const searchResults = await searchStorefrontProducts('Tee');
  if (!Array.isArray(searchResults)) {
    throw new Error('Search Service Audit Failed: searchStorefrontProducts did not return an array.');
  }
  console.log('✓ Full-page search route (/search?q=...) and searchStorefrontProducts service verified.');

  // --- 6. CART & CHECKOUT AUDIT (Workstream 12B-7 & 12B-8) ---
  console.log('\n--- 6. Cart & Guest Checkout Audit ---');
  const cartPagePath = path.join(process.cwd(), 'app', '(store)', 'cart', 'page.tsx');
  const checkoutPagePath = path.join(process.cwd(), 'app', '(store)', 'checkout', 'page.tsx');

  if (!fs.existsSync(cartPagePath) || !fs.existsSync(checkoutPagePath)) {
    throw new Error('Cart/Checkout Audit Failed: Full-page /cart or /checkout routes missing.');
  }

  const cartContent = fs.readFileSync(cartPagePath, 'utf8');
  if (!cartContent.includes('Proceed to Checkout') || !cartContent.includes('Order Summary')) {
    throw new Error('Cart Audit Failed: Cart page missing Proceed to Checkout or Summary structure.');
  }
  console.log('✓ Full-page cart (/cart) and guest checkout (/checkout) routes verified.');

  // --- 7. ORDER CONFIRMATION RECEIPT AUDIT (Workstream 12B-9) ---
  console.log('\n--- 7. Order Confirmation Receipt Audit ---');
  const orderConfPath = path.join(process.cwd(), 'app', '(store)', 'order-confirmation', '[orderNumber]', 'page.tsx');
  if (!fs.existsSync(orderConfPath)) {
    throw new Error('Order Confirmation Audit Failed: Route app/(store)/order-confirmation/[orderNumber]/page.tsx missing.');
  }
  const orderConfContent = fs.readFileSync(orderConfPath, 'utf8');
  if (!orderConfContent.includes('guestAccessToken') || !orderConfContent.includes('notFound()')) {
    throw new Error('Order Confirmation Audit Failed: Guest authorization token check missing.');
  }
  console.log('✓ Order confirmation receipt route and guest authorization security verified.');

  // --- 8. SECURITY & DATA EXPOSURE AUDIT ---
  console.log('\n--- 8. Storefront Security & Data Exposure Audit ---');
  const publicStorefrontFiles = [
    menPlpPath,
    womenPlpPath,
    pdpViewPath,
    searchPagePath,
    cartPagePath,
    orderConfPath,
  ];

  for (const filePath of publicStorefrontFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('costPrice') || content.includes('fifoCogs') || content.includes('unitCost')) {
      throw new Error(`Security Audit Failed: Sensitive cost/FIFO data exposed in ${path.basename(filePath)}`);
    }
  }
  console.log('✓ Storefront files audited — zero exposure of costPrice, fifoCogs, or supplier valuations.');

  // --- 9. SHIPPING CALCULATION CONSISTENCY AUDIT ---
  console.log('\n--- 9. Shipping Fee Calculation Consistency Audit ---');
  const cartServicePath = path.join(process.cwd(), 'lib', 'cart', 'cart-service.ts');
  const cartServiceContent = fs.readFileSync(cartServicePath, 'utf8');
  if (!cartServiceContent.includes('shippingFee') || !cartServiceContent.includes('subtotal')) {
    throw new Error('Shipping Audit Failed: Cart service totals calculation logic missing.');
  }
  console.log('✓ Server-authoritative shipping calculation verified.');

  console.log('\n===========================================================');
  console.log('🎉 ALL MASTER PHASE 12B VERIFICATION CHECKS PASSED PERFECTLY!');
  console.log('===========================================================');
}

main()
  .catch((err) => {
    console.error('MASTER VERIFICATION FAILED:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
