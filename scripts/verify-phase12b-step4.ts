import fs from 'fs';
import path from 'path';

async function runStep4Verification() {
  console.log('===========================================================');
  console.log('  SIFR PHASE 12B — STEP 4: DESIGN SYSTEM FOUNDATION TEST');
  console.log('===========================================================');

  const rootDir = process.cwd();

  // TEST 1: Tailwind Design Tokens
  console.log('\n--- TEST 1: Tailwind Design Tokens Verification ---');
  const tailwindPath = path.join(rootDir, 'tailwind.config.ts');
  const tailwindContent = fs.readFileSync(tailwindPath, 'utf8');

  if (
    !tailwindContent.includes('#FFFFFF') ||
    !tailwindContent.includes('#111111') ||
    !tailwindContent.includes('#EAEAEA') ||
    !tailwindContent.includes('#FAFAF8')
  ) {
    throw new Error('TEST 1 FAILED: Tailwind config missing Phase 12A color tokens');
  }
  if (!tailwindContent.includes('cormorant') || !tailwindContent.includes('inter')) {
    throw new Error('TEST 1 FAILED: Tailwind config missing Cormorant Garamond & Inter typography tokens');
  }
  if (!tailwindContent.includes('4 / 5')) {
    throw new Error('TEST 1 FAILED: Tailwind config missing 4:5 aspect ratio token');
  }
  console.log('✓ TEST 1 PASSED: Tailwind design tokens (#FFFFFF, #111111, #EAEAEA, #FAFAF8, 4:5 aspect ratio) verified');

  // TEST 2: Font Imports & Root Layout
  console.log('\n--- TEST 2: Root Layout Google Fonts Verification ---');
  const layoutPath = path.join(rootDir, 'app', 'layout.tsx');
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');

  if (!layoutContent.includes('Cormorant_Garamond') || !layoutContent.includes('Inter')) {
    throw new Error('TEST 2 FAILED: app/layout.tsx missing Cormorant Garamond & Inter Google font imports');
  }
  console.log('✓ TEST 2 PASSED: Google Fonts (Cormorant Garamond + Inter) loaded in app/layout.tsx');

  // TEST 3: Store Header Locked Structure
  console.log('\n--- TEST 3: StoreHeader Locked Structure Verification ---');
  const headerPath = path.join(rootDir, 'components', 'store', 'StoreHeader.tsx');
  const headerContent = fs.readFileSync(headerPath, 'utf8');

  if (!headerContent.includes('MEN') || !headerContent.includes('WOMEN') || !headerContent.includes('SEARCH') || !headerContent.includes('CART')) {
    throw new Error('TEST 3 FAILED: StoreHeader missing required nav items');
  }
  if (headerContent.includes('href="/accessories"') || headerContent.includes('href="/wishlist"') || headerContent.includes('Wishlist')) {
    throw new Error('TEST 3 FAILED: StoreHeader contains prohibited nav items (Wishlist/Accessories top-level)');
  }
  if (!headerContent.includes('SearchOverlay')) {
    throw new Error('TEST 3 FAILED: StoreHeader lost SearchOverlay integration');
  }
  console.log('✓ TEST 3 PASSED: StoreHeader structure (MEN | WOMEN | SIFR | SEARCH | CART) & SearchOverlay integration verified');

  // TEST 4: Store Footer Multi-Column & Zero Newsletter
  console.log('\n--- TEST 4: StoreFooter Verification ---');
  const footerPath = path.join(rootDir, 'components', 'store', 'StoreFooter.tsx');
  const footerContent = fs.readFileSync(footerPath, 'utf8');

  if (!footerContent.includes('SHOP') || !footerContent.includes('HELP') || !footerContent.includes('FOLLOW') || !footerContent.includes('LEGAL')) {
    throw new Error('TEST 4 FAILED: StoreFooter missing required 4 columns');
  }
  if (footerContent.includes('newsletter') || footerContent.includes('subscribe') || footerContent.includes('email input')) {
    throw new Error('TEST 4 FAILED: StoreFooter contains prohibited newsletter signup');
  }
  console.log('✓ TEST 4 PASSED: StoreFooter 4-column layout verified with ZERO newsletter infrastructure');

  // TEST 5: ProductCard 4:5 Ratio & Light Foundation
  console.log('\n--- TEST 5: ProductCard Foundation Verification ---');
  const cardPath = path.join(rootDir, 'components', 'store', 'ProductCard.tsx');
  const cardContent = fs.readFileSync(cardPath, 'utf8');

  if (!cardContent.includes('aspect-[4/5]')) {
    throw new Error('TEST 5 FAILED: ProductCard does not use aspect-[4/5] ratio');
  }
  if (!cardContent.includes('bg-white')) {
    throw new Error('TEST 5 FAILED: ProductCard does not use light canvas background');
  }
  console.log('✓ TEST 5 PASSED: ProductCard 4:5 image ratio & light editorial foundation verified');

  console.log('===========================================================');
  console.log('  ALL PHASE 12B STEP 4 VERIFICATION TESTS PASSED! 🎉');
  console.log('===========================================================');
}

runStep4Verification().catch((e) => {
  console.error('STEP 4 VERIFICATION FAILED:', e);
  process.exit(1);
});
