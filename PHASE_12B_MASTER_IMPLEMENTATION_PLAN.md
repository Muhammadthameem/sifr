# SIFR — Phase 12B Master Implementation Plan

**Date**: September 26, 2026  
**Project**: SIFR Commerce Management Platform  
**Phase**: Phase 12B — Customer Storefront, CMS & Search Implementation  
**Status**: Revised Implementation Plan (Planning Phase Only — Zero Code/Database Changes Made)

---

# 1. Executive Summary

Phase 12B implements the customer storefront presentation layer, section-based Content Management System (CMS), customer product listing pages (PLP), customer product detail pages (PDP), full-page shopping cart, guest checkout integration, header search overlay, and responsive light editorial design system for the SIFR platform.

### Core Implementation Principles
1. **Zero Rebuilding of Business Logic**: Storefront actions will reuse existing, 100% verified backend engines from Phases 1–11:
   - Order Creation & Reservation Engine (`lib/ordering/order-engine.ts`)
   - Authoritative Shipping Calculator (`lib/ordering/shipping.ts`)
   - Cart Service Engine (`lib/cart/cart-service.ts`)
   - Product Catalog Service (`lib/actions/product-actions.ts`)
   - Local Disk Image Storage (`lib/storage/image-storage.ts`)
   - WhatsApp Notification Outbox (`lib/notifications/notification-engine.ts`)
2. **Strict Product Architecture Compliance**: Preserves `Product` (catalog item) vs. `ProductVariant` (sellable combination) hierarchy, `ProductButton` cross-product links, and product-level image ownership.
3. **Phase 12A Design System Alignment**: Transitions the storefront from developer dark mode to the locked 12A **Light Editorial Design System** (`#FFFFFF` canvas, `#111111` typography, `#EAEAEA` subtle borders, `#FAFAF8` background highlights, Cormorant Garamond display font + Inter UI font, 4:5 product image ratio).
4. **Section-Based CMS with Deterministic Draft/Publish**: Adds a typed, relational CMS database model in PostgreSQL (`CmsSection`, `CmsButton`, `CmsSectionProduct`, `CmsFeatureCard`) and an admin editor at `/admin/website` to manage published storefront sections cleanly without generic page-builder complexity. Live customer requests consume a live published JSON snapshot (`publishedPayloadJson`), guaranteeing that editing draft sections in admin never accidentally alters live storefront content prior to explicit publishing.

---

# 2. Existing Architecture We Will Reuse

| Subsystem | Existing File / Service | What 12B Will Reuse | What 12B Will NOT Rebuild |
| :--- | :--- | :--- | :--- |
| **Product Master** | `lib/actions/product-actions.ts` | `getStorefrontProductBySlug()`, `getStorefrontProducts()` | Catalog schemas, option/variant generators, pricing warnings, SKU logic |
| **Cart Subsystem** | `lib/cart/cart-service.ts` & `lib/actions/cart-actions.ts` | `getCartDetails()`, `addItemToCart()`, `updateCartItemQuantity()`, `removeItemFromCart()`, `clearCart()`, `applyCartCoupon()`, `removeCartCoupon()` | Cart session cookie (`sifr_cart_id`), 30-day sliding TTL, stock checking |
| **Order & Checkout** | `lib/ordering/order-engine.ts` | `createOnlineOrder()`, `transitionOrderStatus()` | Order status state machine, transactional stock locks, customer auto-creation |
| **Shipping Engine** | `lib/ordering/shipping.ts` | `calculateOrderShipping()`, `getGlobalShippingCap()` | Raw shipping sum, global shipping cap (`GLOBAL_SHIPPING_CAP`), fee calculation |
| **Image Storage** | `lib/storage/image-storage.ts` & `/api/upload/route.ts` | `imageStorage.saveImage()`, `/api/upload` endpoint | Disk file persistence (`public/uploads/products/`), unique filename hashing |
| **Coupons & Discounts**| `lib/coupons/coupon-engine.ts` | `validateCouponForCart()`, `calculateCouponDiscount()` | Coupon redemption rules, min order value check, global/per-customer limits |
| **WhatsApp Outbox** | `lib/notifications/notification-engine.ts` | `createNotificationInOutbox()` | Post-commit WhatsApp notification creation for `ORDER_RECEIVED` |
| **Payment Gateway** | `lib/payments/razorpay.ts` | Payment initiation & webhook verification | Payment attempt state machine, Razorpay/Mock adapters |

---

# 3. Overall Phase 12B Architecture

```text
                               ┌──────────────────────────────────────────┐
                               │           CUSTOMER BROWSER               │
                               └────────────────────┬─────────────────────┘
                                                    │
        ┌───────────────────┬───────────────────────┼───────────────────────┬───────────────────┐
        ▼                   ▼                       ▼                       ▼                   ▼
  12B-3 Homepage      12B-4 PLP Routes        12B-5 PDP Route        12B-6 Search       12B-7 Cart Route
   (app/page.tsx)    (/men, /women, etc.)   (/products/[slug])    (Header Overlay)     (/cart & Drawer)
        │                   │                       │                       │                   │
        │ CMS Sections      │ Category / URL        │ Variant & Option      │ Text Search       │ Cart Session
        ▼                   ▼                       ▼                       ▼                   ▼
┌───────────────┐   ┌───────────────┐       ┌───────────────┐       ┌───────────────┐   ┌───────────────┐
│  CMS Engine   │   │Product Actions│       │Product Actions│       │ Search Service│   │ Cart Service  │
│(lib/cms/...)  │   │(product-act.ts)       │(product-act.ts)       │ (search-serv) │   │(cart-serv.ts) │
└───────┬───────┘   └───────┬───────┘       └───────┬───────┘       └───────┬───────┘   └───────┬───────┘
        │                   │                       │                       │                   │
        └───────────────────┴───────────────────────┼───────────────────────┴───────────────────┘
                                                    │
                                                    ▼
                               ┌──────────────────────────────────────────┐
                               │         Prisma Client / PostgreSQL       │
                               │  (Product, Variant, Cart, Order, CMS)    │
                               └──────────────────────────────────────────┘
```

---

# 4. Workstream 12B-1: Storefront Foundation & Design System

### Objectives
- Establish the **Phase 12A Light Editorial Design System**.
- Implement global font configuration (`Cormorant Garamond` display serif + `Inter` UI sans).
- Configure Tailwind design tokens for 12A color canvas.

### Design Tokens (`tailwind.config.ts`)
```ts
theme: {
  extend: {
    colors: {
      canvas: '#FFFFFF',
      primary: '#111111',
      secondary: '#666666',
      border: '#EAEAEA',
      subtle: '#FAFAF8',
    },
    fontFamily: {
      serif: ['var(--font-cormorant)', 'Georgia', 'serif'],
      sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
    },
    aspectRatio: {
      'product': '4 / 5',
    },
  },
}
```

### Layout Refactoring (`app/(store)/layout.tsx`)
Replace dark wrapper with light canvas wrapper:
```tsx
<div className="min-h-screen flex flex-col bg-white text-neutral-900 selection:bg-neutral-900 selection:text-white">
  <StoreHeader />
  <main className="flex-1">{children}</main>
  <StoreFooter />
</div>
```

---

# 5. Workstream 12B-2: CMS Architecture & Admin Manager

### Objectives
- Define typed PostgreSQL models for section-based homepage content.
- Support **HERO**, **PRODUCT_CAROUSEL**, **IMAGE_BANNER**, **SPLIT_FEATURE**, and **FEATURE_CARDS** section types.
- Support **DRAFT** and **PUBLISHED** workflow states with zero live customer content leakage.
- Provide a clean admin editor at `/admin/website`.

### Prisma Schema Additions (`prisma/schema.prisma`)

```prisma
enum CmsSectionType {
  HERO
  PRODUCT_CAROUSEL
  IMAGE_BANNER
  SPLIT_FEATURE
  FEATURE_CARDS
}

enum CmsSectionStatus {
  DRAFT
  PUBLISHED
}

model CmsSection {
  id                   String           @id @default(uuid())
  type                 CmsSectionType
  internalTitle        String           @map("internal_title") // e.g., "Spring 2026 Hero"
  heading              String?
  subheading           String?          @db.Text
  imageUrl             String?          @map("image_url")
  imageStorageKey      String?          @map("image_storage_key")
  altText              String?          @map("alt_text")
  viewAllUrl           String?          @map("view_all_url") // Destination for carousels (e.g. "/men")
  sortOrder            Int              @default(0) @map("sort_order")
  status               CmsSectionStatus @default(DRAFT)
  isActive             Boolean          @default(true) @map("is_active")

  // Live Published Snapshot Payload (Guarantees live site stability during draft edits)
  publishedPayloadJson String?          @map("published_payload_json") @db.Text
  publishedAt          DateTime?        @map("published_at")

  createdAt            DateTime         @default(now()) @map("created_at")
  updatedAt            DateTime         @updatedAt @map("updated_at")

  buttons              CmsButton[]
  productLinks         CmsSectionProduct[]
  featureCards         CmsFeatureCard[]

  @@index([status, isActive, sortOrder])
  @@map("cms_sections")
}

model CmsButton {
  id        String     @id @default(uuid())
  sectionId String     @map("section_id")
  section   CmsSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  label     String
  url       String
  style     String     @default("PRIMARY") // "PRIMARY" | "SECONDARY"
  sortOrder Int        @default(0) @map("sort_order")

  @@map("cms_buttons")
}

model CmsSectionProduct {
  id        String     @id @default(uuid())
  sectionId String     @map("section_id")
  section   CmsSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  productId String     @map("product_id")
  product   Product    @relation(fields: [productId], references: [id], onDelete: Cascade)
  sortOrder Int        @default(0) @map("sort_order")

  @@unique([sectionId, productId])
  @@map("cms_section_products")
}

model CmsFeatureCard {
  id             String     @id @default(uuid())
  sectionId      String     @map("section_id")
  section        CmsSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  title          String
  imageUrl       String     @map("image_url")
  imageStorageKey String?   @map("image_storage_key")
  buttonLabel    String     @map("button_label")
  buttonUrl      String     @map("button_url")
  sortOrder      Int        @default(0) @map("sort_order")

  @@map("cms_feature_cards")
}
```

### CMS Data Service (`lib/cms/cms-service.ts`)
- `getPublishedSections()`: Fetches active published section snapshots (`publishedPayloadJson != null`). Dynamically checks joined `Product` records to filter out any product where `status !== 'ACTIVE'`.
- `getAdminSections()`: Fetches draft section states for the admin section list.
- `publishCmsSection(sectionId)`: Validates button limits and product status rules, compiles section details into `publishedPayloadJson`, updates `status = 'PUBLISHED'` and `publishedAt = now()`.
- `upsertCmsSection()`, `reorderCmsSections()`, `deleteCmsSection()`.

---

# 6. Workstream 12B-3: Homepage Implementation

### Section Components Structure (`components/store/sections/`)
1. **`HeroSection.tsx`**: Large image container (Recommended: 2400 × 1050 px — approximately 16:7 desktop; optional 1080 × 1350 px — 4:5 mobile), Cormorant Garamond heading, supporting text, up to 2 CTA buttons.
2. **`ProductCarouselSection.tsx`**: Section title, horizontal scroll/touch carousel displaying 10 selected products (`ProductCard`, 2400 × 3000 px — 4:5 ratio), "View All" header link.
3. **`ImageBannerSection.tsx`**: Full-width promotional banner (Recommended: 2400 × 1200 px — 2:1 ratio), image, overlay text, up to 2 CTA buttons.
4. **`SplitFeatureSection.tsx`**: 50/50 Desktop layout (Large feature image on left, Recommended: 1200 × 1500 px — 4:5 ratio; 2×2 `ProductCard` grid on right; stacked on mobile).
5. **`FeatureCardsSection.tsx`**: 3 Promotional Cards side-by-side on desktop (Recommended: 900 × 1200 px — 3:4 ratio; image, title, shop CTA; stacked/scrollable on mobile).

### Homepage Route (`app/(store)/page.tsx`)
```tsx
export default async function StoreHomePage() {
  const sections = await getPublishedSections();

  return (
    <div className="space-y-16 sm:space-y-24 pb-20">
      {sections.map((section) => {
        switch (section.type) {
          case 'HERO':
            return <HeroSection key={section.id} section={section} />;
          case 'PRODUCT_CAROUSEL':
            return <ProductCarouselSection key={section.id} section={section} />;
          case 'IMAGE_BANNER':
            return <ImageBannerSection key={section.id} section={section} />;
          case 'SPLIT_FEATURE':
            return <SplitFeatureSection key={section.id} section={section} />;
          case 'FEATURE_CARDS':
            return <FeatureCardsSection key={section.id} section={section} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
```

---

# 7. Workstream 12B-4: Product Listing Pages (PLP)

### Routes Covered
- `/men` (Filter: `gender IN ['MEN', 'BOTH']`)
- `/women` (Filter: `gender IN ['WOMEN', 'BOTH']`)
- `/categories/[slug]` (Filter by Category slug & child categories)

### PLP Component Architecture (`components/store/plp/`)
- `PlpHeader.tsx`: Collection title, description, category tabs (`ALL`, `APPAREL`, `FOOTWEAR`, `ACCESSORIES`).
- `PlpFilterBar.tsx`: Filter triggers (Category, Size, Color, Price, Availability) and Sorting dropdown (`Recommended`, `Newest`, `Price Low-High`, `Price High-Low`).
- `PlpFilterDrawer.tsx`: Slide-over drawer for filter selection on mobile & desktop.
- `PlpGrid.tsx`: Responsive 4-column desktop / 3-column tablet / 2-column mobile grid rendering 4:5 `ProductCard` items.
- `PlpLoadMore.tsx`: Interactive client component handling "Load More" page appending.

### Appending Load More Architecture
1. **Initial Page Load (`page=1`)**: Server Component fetches initial batch of 24 products and renders them in `PlpGrid`.
2. **User Clicks "Load More"**: `PlpLoadMore.tsx` calls Server Action `loadMoreProductsAction({ page: nextPage, ...filters })` to fetch the next batch of 24 products.
3. **State Appending**: `PlpGrid` appends newly returned items to local product list state (`[...existingProducts, ...newProducts]`).
4. **URL Synchronization**: Updates `window.history.replaceState` (`?page=2`) so reloading the page preserves position.

---

# 8. Workstream 12B-5: Product Detail Page (PDP) & Buy Now Flow

### Route: `/products/[slug]`

### PDP Layout (`components/store/ProductDetailView.tsx`)
- **Desktop (60 / 40 Split)**:
  - **Left 60%**: 2-Column Editorial Gallery of 4:5 product images with high-resolution lightbox preview.
  - **Right 40%**: Sticky product info panel containing:
    - Product Name & Category breadcrumb
    - Selling Price & MRP (with % discount badge)
    - `ProductButton` links (Visually linked color variations e.g. White $\rightarrow$ Black)
    - Dynamic Option Pickers (Size, Fit, Material)
    - **Size Guide Button** (Triggers `SizeGuideModal.tsx`)
    - Quantity selector
    - **Add to Cart CTA** (Primary black button using `AddToCartButton.tsx`)
    - **Buy Now CTA** (Secondary bordered button executing single-source cart + checkout flow)
    - Product description, Material & Care details
    - Accordions for Shipping & Returns policies
- **Mobile Layout**:
  - Single column with touch swipe gallery.
  - **`StickyAddToCartBar.tsx`**: Appears at bottom of mobile viewport when main Add to Cart CTA scrolls out of view.
- **Below PDP Panel**:
  - "You May Also Like" carousel rendering related products from the same category.

### Single-Source Buy Now Architecture Contract
Buy Now does **NOT** bypass or duplicate existing cart/checkout logic:
```text
User clicks "Buy Now" on PDP
             │
             ▼
Validate selected ProductVariant & Stock
             │
             ▼
Invoke addToCartAction({ variantId, quantity: 1 }) (lib/actions/cart-actions.ts)
             │
             ▼
Redirect to /checkout
             │
             ▼
User completes form on /checkout -> processGuestCheckoutAction() -> createOnlineOrder()
```

---

# 9. Workstream 12B-6: Search Architecture

### Search Service (`lib/catalog/search-service.ts`)
Creates a centralized server-side search query helper consumed by both the Search Overlay and full-page Search Results:
```ts
export async function searchStorefrontProducts(query: string, limit = 24) {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  return prisma.product.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { name: { contains: cleanQuery, mode: 'insensitive' } },
        { description: { contains: cleanQuery, mode: 'insensitive' } },
        { category: { name: { contains: cleanQuery, mode: 'insensitive' } } },
        { variants: { some: { sku: { contains: cleanQuery, mode: 'insensitive' } } } },
      ],
    },
    include: {
      category: true,
      images: { orderBy: { sortOrder: 'asc' }, take: 2 },
      variants: { where: { isAvailable: true }, select: { mrp: true, sellingPrice: true } },
      sourceButtons: {
        where: { isActive: true, targetProduct: { status: 'ACTIVE' } },
        include: { targetProduct: { select: { id: true, name: true, slug: true } } },
      },
    },
    take: limit,
  });
}
```

### Search Overlay (`components/store/SearchOverlay.tsx`)
- Triggered by clicking "SEARCH" in `StoreHeader.tsx` or key shortcut `/`.
- Calls Server Action `searchSuggestionsAction(query)` which consumes `searchStorefrontProducts()`.

### Search Page (`app/(store)/search/page.tsx`)
- Route `/search?q=...` calling `searchStorefrontProducts(q)` and rendering results in `PlpGrid`.

---

# 10. Workstream 12B-7: Full-Page Cart & Drawer Sync

### Full-Page Cart (`app/(store)/cart/page.tsx`)
- **Desktop Layout (65% Items / 35% Summary)**:
  - Left column: 4:5 Thumbnail, product name, selected option labels, price, quantity controls (`+` / `-`), remove button.
  - Right column: Order Summary card (Subtotal, Coupon Code input/pill, Authoritative Shipping Fee, Grand Total, "Proceed to Guest Checkout" CTA).
- **Mobile Layout**: Stacked single column.
- **State Synchronization**: Modifying quantities on `/cart` or `CartDrawer` automatically updates header cart badge via `fetchCartAction()`.

---

# 11. Workstream 12B-8: Checkout Integration

### Checkout Refinement (`app/(store)/checkout/page.tsx`)
- Maintain existing 100% verified backend call `processGuestCheckoutAction()`.
- Update UI theme to 12A Light Design System (`bg-white`, `#111111` typography, `#EAEAEA` borders).
- Form validation: Mobile required (E.164 E.164 normalized), Email optional, Delivery address fields.

---

# 12. Workstream 12B-9: Responsive, Accessibility & Performance

- **Responsive Breakpoints**:
  - Desktop: $\ge 1024\text{px}$ (4-column grid, 60/40 PDP, 65/35 Cart)
  - Tablet: $768\text{px} - 1023\text{px}$ (3-column grid, 2-column PDP)
  - Mobile: $< 768\text{px}$ (2-column grid, stacked PDP with sticky CTA, accordion footer)
- **Accessibility**:
  - Semantic HTML (`<main>`, `<nav>`, `<header>`, `<footer>`, `<article>`).
  - Full keyboard tab navigation and visible focus rings (`focus-visible:ring-2`).
  - Screen reader aria-labels on icon buttons (`aria-label="Toggle Menu"`, `aria-label="Search"`).
  - Support `prefers-reduced-motion` for transitions.
- **Performance**:
  - Product images use Next.js `<Image />` with `sizes` and `priority` on Hero / LCP images.
  - Native loading="lazy" for below-the-fold images.

---

# 13. Workstream 12B-10: Automated Verification Suite

Build `scripts/verify-phase12b.ts` covering:
1. CMS Section CRUD & Publishing workflow test (Draft editing isolation & published snapshot verification).
2. Storefront Homepage CMS section rendering query test.
3. PLP product filtering, gender filtering & category hierarchy query test.
4. PDP product slug resolution & option combinations query test.
5. Search Overlay & `/search` page unified query service test.
6. Full-page Cart & CartDrawer state synchronization test.
7. End-to-end Guest Checkout execution & order creation regression check.

---

# 14. File Change Matrix

| File | NEW / MODIFY | Purpose | Dependencies | Risk |
| :--- | :--- | :--- | :--- | :--- |
| `prisma/schema.prisma` | **MODIFY** | Add `CmsSection`, `CmsButton`, `CmsSectionProduct`, `CmsFeatureCard` models & enums | None | **Low** (Additive changes only; no existing models modified) |
| `lib/cms/cms-service.ts` | **NEW** | CMS database queries and mutation service | Prisma | **Low** |
| `lib/catalog/search-service.ts` | **NEW** | Centralized server-side product search service | Prisma | **Low** |
| `lib/actions/cms-actions.ts` | **NEW** | Server actions for admin CMS editor & storefront homepage | `cms-service.ts` | **Low** |
| `tailwind.config.ts` | **MODIFY** | Add 12A color palette and font family tokens | Tailwind CSS | **Low** |
| `app/(store)/layout.tsx` | **MODIFY** | Apply 12A light canvas layout wrapper | Tailwind | **Low** |
| `app/(store)/page.tsx` | **MODIFY** | Render dynamic CMS homepage sections | `cms-actions.ts` | **Medium** |
| `app/(store)/men/page.tsx` | **MODIFY** | Integrate full PLP container with filters & sorting | `product-actions.ts` | **Low** |
| `app/(store)/women/page.tsx` | **MODIFY** | Integrate full PLP container with filters & sorting | `product-actions.ts` | **Low** |
| `app/(store)/categories/[slug]/page.tsx` | **MODIFY** | Integrate full PLP container with filters & sorting | `product-actions.ts` | **Low** |
| `app/(store)/products/[slug]/page.tsx` | **MODIFY** | Wire 60/40 PDP view with size guide & sticky CTA | `ProductDetailView.tsx` | **Low** |
| `app/(store)/cart/page.tsx` | **NEW** | Dedicated full-page shopping cart page | `cart-actions.ts` | **Low** |
| `app/(store)/search/page.tsx` | **NEW** | Storefront search results page | `search-service.ts` | **Low** |
| `app/(store)/checkout/page.tsx` | **MODIFY** | Update checkout UI styling to 12A light theme | `cart-actions.ts` | **Low** |
| `app/(store)/order-confirmation/[orderNumber]/page.tsx` | **MODIFY** | Update receipt UI styling to 12A light theme | Prisma | **Low** |
| `app/admin/website/page.tsx` | **MODIFY** | Build admin CMS section manager | `cms-actions.ts` | **Low** |
| `components/store/StoreHeader.tsx` | **MODIFY** | Apply 12A header layout, light styling & search trigger | React, Lucide | **Low** |
| `components/store/StoreFooter.tsx` | **MODIFY** | Apply 12A multi-column desktop / accordion mobile layout | React | **Low** |
| `components/store/ProductCard.tsx` | **MODIFY** | Apply 12A 4:5 image ratio & light editorial styling | React | **Low** |
| `components/store/ProductDetailView.tsx` | **MODIFY** | Implement 60/40 gallery layout & size guide modal | React | **Low** |
| `components/store/SearchOverlay.tsx` | **NEW** | Header search overlay modal component | React, Lucide | **Low** |
| `components/store/SizeGuideModal.tsx` | **NEW** | PDP size guide modal drawer component | React | **Low** |
| `components/store/StickyAddToCartBar.tsx` | **NEW** | Mobile PDP sticky CTA bar | React | **Low** |
| `components/store/sections/*` | **NEW** | 5 Homepage section rendering components | React | **Low** |
| `components/admin/CmsSectionEditor.tsx` | **NEW** | Admin CMS editor component for homepage sections | React | **Low** |
| `scripts/verify-phase12b.ts` | **NEW** | Phase 12B automated verification suite | `tsx` | **Low** |

---

# 15. Database Change Matrix

| Model / Table | Change | Reason | Existing Relations | Risk |
| :--- | :--- | :--- | :--- | :--- |
| `CmsSection` | **NEW** | Header for CMS homepage sections (with `publishedPayloadJson`) | Relates to `CmsButton`, `CmsSectionProduct`, `CmsFeatureCard` | **Low** |
| `CmsButton` | **NEW** | Configurable buttons for Hero / Banner sections | Relates to `CmsSection` (`onDelete: Cascade`) | **Low** |
| `CmsSectionProduct` | **NEW** | Join table linking CMS sections to catalog `Product`s | Relates to `CmsSection` (`onDelete: Cascade`) and `Product` (`onDelete: Cascade`) | **Low** |
| `CmsFeatureCard` | **NEW** | Promotional card items for `FEATURE_CARDS` section | Relates to `CmsSection` (`onDelete: Cascade`) | **Low** |

---

# 16. API / Server Action Matrix

| Endpoint / Action | Existing / New | Purpose | Consumer | Business Logic Reused |
| :--- | :--- | :--- | :--- | :--- |
| `getPublishedSections()` | **NEW** | Fetch published homepage section snapshots | `app/(store)/page.tsx` | `CmsSection` queries |
| `getAdminSections()` | **NEW** | Fetch draft & published sections for admin | `/admin/website` | `CmsSection` queries |
| `upsertCmsSectionAction()` | **NEW** | Create/update CMS section draft | `CmsSectionEditor.tsx` | `CmsSection` mutations & button validation |
| `reorderCmsSectionsAction()` | **NEW** | Update section sort orders | `/admin/website` | `CmsSection` mutations |
| `publishCmsSectionAction()` | **NEW** | Compile section & update `publishedPayloadJson` | `/admin/website` | `CmsSection` mutations |
| `searchStorefrontProductsAction()` | **NEW** | Text search for search overlay & search page | `SearchOverlay.tsx`, `/search` | `lib/catalog/search-service.ts` |
| `fetchCartAction()` | **EXISTING** | Fetch cart session & calculate totals | `StoreHeader.tsx`, `/cart` | `lib/cart/cart-service.ts` |
| `addToCartAction()` | **EXISTING** | Add item variant to guest cart | `AddToCartButton.tsx`, PDP Buy Now | `lib/cart/cart-service.ts` |
| `processGuestCheckoutAction()` | **EXISTING** | Create online order & clear cart | `/checkout` | `lib/ordering/order-engine.ts` |

---

# 17. Phase-by-Phase Implementation Order

1. **Step 1: Database Schema Update & Migration**:
   - Add CMS models to `prisma/schema.prisma`.
   - Execute standard project schema change workflow.
2. **Step 2: CMS Service & Admin Manager**:
   - Implement `lib/cms/cms-service.ts` and `lib/actions/cms-actions.ts`.
   - Build admin CMS editor at `/admin/website` and `components/admin/CmsSectionEditor.tsx`.
3. **Step 3: Search Service**:
   - Implement `lib/catalog/search-service.ts` and `SearchOverlay.tsx`.
4. **Step 4: Design System & Shared Storefront Layout**:
   - Update `tailwind.config.ts` and `globals.css` with 12A design system tokens.
   - Refactor `app/(store)/layout.tsx`, `StoreHeader.tsx`, `StoreFooter.tsx`, and `ProductCard.tsx`.
5. **Step 5: Dynamic Homepage**:
   - Implement homepage section components in `components/store/sections/`.
   - Wire `app/(store)/page.tsx` to render published CMS sections.
6. **Step 6: Product Listing Pages (PLP) & Search**:
   - Build PLP container components, category tabs, filter bar, sorting, and `PlpLoadMore.tsx`.
   - Build `/search?q=...` page.
7. **Step 7: Product Detail Page (PDP) & Buy Now Flow**:
   - Refactor `ProductDetailView.tsx` with 60/40 gallery, `SizeGuideModal.tsx`, `StickyAddToCartBar.tsx`, Buy Now flow, and related carousel.
8. **Step 8: Full-Page Cart & Checkout Refinement**:
   - Build `/cart` page and sync with `CartDrawer.tsx`.
   - Update `/checkout` page to 12A light theme styling.
9. **Step 9: Automated Verification & Complete Regression**:
   - Create and execute `scripts/verify-phase12b.ts`.
   - Run complete regression suite across Phases 5 through 11.
   - Run `npx tsc --noEmit` and `npm run build`.

---

# 18. Acceptance Criteria

- [ ] Homepage dynamically renders CMS-published section snapshots (`publishedPayloadJson`) in strict visual order.
- [ ] Admin CMS editor at `/admin/website` allows creating, editing draft sections, reordering, and publishing snapshots without altering live storefront content prior to explicit publishing.
- [ ] Server action enforces maximum 2 buttons for Hero & Image Banner sections.
- [ ] Product references in CMS automatically filter out `DRAFT` or `ARCHIVED` products.
- [ ] `/men`, `/women`, and `/categories/[slug]` render responsive 4/3/2 grids with URL filter state binding and Load More page appending.
- [ ] Centralized search service powers both Header Search Overlay suggestions and `/search` page results.
- [ ] PDP renders 60/40 gallery, active option picker, size guide modal, primary Add to Cart, single-source Buy Now, and mobile sticky CTA.
- [ ] Full-page `/cart` and `CartDrawer` stay synchronized and use server-authoritative pricing.
- [ ] Guest checkout invokes `processGuestCheckoutAction()` and creates orders cleanly.
- [ ] `scripts/verify-phase12b.ts` passes 100%.
- [ ] Regression test scripts for Phases 5–11 pass 100%.
- [ ] `npx tsc --noEmit` and `npm run build` complete with 0 errors.

---

# 19. Risks and Mitigations

| Risk | Mitigation |
| :--- | :--- |
| **Unpublished Draft Changes Leaking to Storefront** | Storefront queries consume ONLY `publishedPayloadJson` compiled snapshots. Draft edits only affect `CmsSection` draft columns. |
| **Tampered Client Prices** | Storefront UI displays prices for presentation only; `processGuestCheckoutAction()` calculates totals using server `ProductVariant` prices in database. |
| **Unpublished / Archived Products in CMS** | CMS section queries filter out products where `status !== 'ACTIVE'`. |

---

# PLAN REVISION — ARCHITECTURAL REVIEW

The following 10 architectural decisions have been thoroughly evaluated, resolved, and incorporated into the Phase 12B Master Implementation Plan:

---

### 1. CMS Draft / Publish / Preview Decision (`LOCKED`)

- **Requirement**: Support editing, previewing, and publishing CMS content deterministically. Published storefront content must never accidentally change when draft content is edited in the admin panel prior to publishing. Unpublished content must never leak publicly. Avoid complex versioning systems.
- **Architectural Solution**: Live Published Snapshot (`publishedPayloadJson` + `publishedAt`).
  - `CmsSection` model contains mutable draft fields (`heading`, `subheading`, `imageUrl`, `viewAllUrl`) and dynamic relations (`CmsButton`, `CmsSectionProduct`, `CmsFeatureCard`).
  - Editing a section in the admin panel updates only the draft columns/tables. Live storefront queries consume ONLY `publishedPayloadJson` (a compiled JSON string snapshot generated/replaced at the moment of publish).
  - **Draft**: Admin creates or modifies section fields. `status` remains `DRAFT` or `PUBLISHED` (with uncommitted draft updates). Live storefront continues displaying `publishedPayloadJson`.
  - **Preview**: Authenticated admin sessions invoke `/admin/website/preview` or live preview modal, rendering draft columns directly without affecting live customers.
  - **Publish**: Admin clicks "Publish Section". Server action validates section limits and active product statuses, compiles the section tree into a deterministic JSON snapshot (`publishedPayloadJson`), updates `publishedAt = now()`, and sets `status = PUBLISHED`.
  - **Storefront Determinism**: Storefront queries fetch only active sections where `publishedPayloadJson != null`, parsing the live published snapshot. Editing draft content in admin can NEVER alter live storefront content until "Publish" is explicitly clicked.
- **Why Versioning Systems Were Rejected**: Introduces version history tables, migration overhead, and rollback complexities proportional to enterprise CMS platforms. The live published snapshot payload achieves 100% deterministic isolation with zero complex versioning tables.

---

### 2. Prisma Migration Strategy (`LOCKED`)

- **Requirement**: Inspect existing project's Prisma migration strategy and adhere strictly to it without introducing a different workflow.
- **Architectural Solution**: **Use the existing project migration strategy.**
  - Codebase audit confirms that Phases 1–11 utilize schema push (`npx prisma db push`) for database schema updates.
  - Phase 12B will follow the exact same schema-change workflow (`npx prisma db push`). No competing migration strategy (such as `prisma migrate dev` directory setups) will be introduced.

---

### 3. CMS Product Delete Strategy (`LOCKED`)

- **Requirement**: Align CMS reference behavior for products with SIFR's product lifecycle architecture (which uses `DRAFT`, `ACTIVE`, `ARCHIVED` status flags rather than hard deletion).
- **Architectural Solution**: Relational join table `CmsSectionProduct` uses `onDelete: Cascade` for foreign key safety, combined with dynamic active-status storefront filtering.
  - **Product Lifecycle Alignment**: In SIFR, catalog items are marked `ARCHIVED` or `DRAFT` when removed from sale; hard deletion is strictly discouraged.
  - **Dynamic Storefront Filtering**: When `getPublishedSections()` prepares section payload snapshots or executes runtime queries, linked `Product` records are filtered via `where: { status: 'ACTIVE' }`. If a product is marked `ARCHIVED` or `DRAFT`, it is silently omitted from the storefront carousel/grid without breaking section structure or database integrity.
  - **Database Safety**: `onDelete: Cascade` on `CmsSectionProduct.productId -> Product.id` is retained purely to ensure that if a developer or seed script hard-deletes a test product, orphaned join table records are cleaned up automatically without throwing foreign key constraint errors.

---

### 4. CMS Section Schema Decision (`LOCKED`)

- **Requirement**: Review top-level nullable fields on `CmsSection` (`heading`, `subheading`, `imageUrl`, `imageStorageKey`, `altText`, `viewAllUrl`) vs. relational models against all 5 section types. Ensure architecture is typed, maintainable, simple, and not an uncontrolled collection of nullable fields or unstructured JSON blobs.
- **Validation Against All 5 Section Types**:
  1. `HERO`: Uses `heading`, `subheading`, `imageUrl`, `imageStorageKey`, `altText`, and 1:N `CmsButton` (max 2).
  2. `PRODUCT_CAROUSEL`: Uses `heading`, `viewAllUrl`, and 1:N `CmsSectionProduct` (max 10 products).
  3. `IMAGE_BANNER`: Uses `heading`, `subheading`, `imageUrl`, `imageStorageKey`, `altText`, and 1:N `CmsButton` (max 2).
  4. `SPLIT_FEATURE`: Uses `heading`, `subheading`, `imageUrl`, `imageStorageKey`, `altText`, and 1:N `CmsSectionProduct` (exactly 4 products).
  5. `FEATURE_CARDS`: Uses `heading`, and 1:N `CmsFeatureCard` (exactly 3 promotional cards).
- **Architectural Rationale**:
  - Top-level scalar columns on `CmsSection` represent shared presentation metadata present across image/text hero sections.
  - Repeating structures (`buttons`, `productLinks`, `featureCards`) are modeled as strongly-typed relational child tables (`CmsButton`, `CmsSectionProduct`, `CmsFeatureCard`) with foreign key constraints.
  - This avoids generic polymorphic page-builder complexities while providing 100% type safety and relational query support without relying on unvalidated JSON blobs for draft editing.

---

### 5. CMS Button Validation (`LOCKED`)

- **Requirement**: Enforce maximum 2 buttons for `HERO` and `IMAGE_BANNER` sections in BOTH the admin UI AND server-side. Reject invalid section configurations on the server. Specify validation for each section type.
- **Validation Rules & Enforcement**:
  - **UI Enforcement**: `components/admin/CmsSectionEditor.tsx` disables "Add Button" control when button count reaches 2 for `HERO` or `IMAGE_BANNER` sections.
  - **Server-Side Enforcement**: `upsertCmsSectionAction()` and `publishCmsSectionAction()` execute strict validation:
    - `HERO`: `buttons.length <= 2`. Rejects payload with `Invalid section configuration: HERO section cannot have more than 2 buttons.` if violated.
    - `IMAGE_BANNER`: `buttons.length <= 2` and `imageUrl` must be non-empty.
    - `PRODUCT_CAROUSEL`: `heading` must be non-empty, `productLinks.length <= 10`.
    - `SPLIT_FEATURE`: `imageUrl` must be non-empty, `productLinks.length === 4`.
    - `FEATURE_CARDS`: `featureCards.length === 3`, each card requiring `title`, `imageUrl`, `buttonLabel`, `buttonUrl`.
  - Any server validation failure immediately aborts the action and returns a descriptive error to the admin UI.

---

### 6. Search Architecture Decision (`LOCKED`)

- **Requirement**: Database search logic must NOT live inside a Server Action, but inside a reusable server-side product/search service. The Search Overlay and `/search` page must use the exact same underlying search service.
- **Architectural Solution**: Centralized Search Service `lib/catalog/search-service.ts`.
  - **Service Layer**:
    ```text
    Search Overlay  ─────┐
                         ├─► searchStorefrontProducts(query) ─► PostgreSQL Text Query ─► Reusable Result Shape ─► ProductCard / PLP
    /search Page    ─────┘    (lib/catalog/search-service.ts)
    ```
  - **Implementation**: `searchStorefrontProducts(query, limit)` performs insensitive substring matching against `Product.name`, `Product.description`, `Category.name`, and `ProductVariant.sku` for active products (`status: 'ACTIVE'`).
  - **Reusable Shape**: Returns full product data including category, first 2 images (for hover swap), active variant prices (MRP & selling price), and active `ProductButton` links.
  - Consumed by `searchSuggestionsAction()` for overlay auto-suggestions and `searchStorefrontProductsAction()` for the `/search?q=...` full-page results view. PostgreSQL text searching remains 100% sufficient; no external search engines (Elasticsearch, etc.) are introduced.

---

### 7. Load More Architecture (`LOCKED`)

- **Requirement**: Define PLP "Load More" behavior cleanly. Next page must be APPENDED to existing products (not replace page 1 with page 2). Synchronize URL state.
- **Architectural Solution**: Hybrid Next.js App Router Architecture (Server Render + Interactive Appending).
  - **Initial Load (`page=1`)**: Server Component (`app/(store)/men/page.tsx`, etc.) fetches initial batch of 24 products and renders `PlpGrid`.
  - **User Clicks "Load More"**: Client Component `PlpLoadMore.tsx` invokes Server Action `loadMoreProductsAction({ page: 2, category, filters, sort })`.
  - **State Appending**: `PlpGrid` appends returned products to local state: `renderedProducts = [...existingProducts, ...newProducts]`.
  - **Subsequent Pages**: Clicking "Load More" again fetches `page=3` and appends to the 48 items, rendering all 72 items seamlessly.
  - **URL Synchronization**: `PlpLoadMore.tsx` updates `window.history.replaceState` with `?page=2` without causing a full page refresh. If the user reloads or shares `/men?page=2`, the Server Component fetches 48 initial items ($24 \times 2$) to preserve scroll position and rendered list state deterministically.

---

### 8. Buy Now Architecture (`LOCKED`)

- **Requirement**: Make the implementation contract explicit. Buy Now must NOT create a second checkout or order creation path.
- **Architectural Solution**: Single-Source Cart + Checkout Flow.
  - **Conceptual Execution**:
    ```text
    User clicks "Buy Now" on PDP
                │
                ▼
    Validate selected ProductVariant ID & Stock availability
                │
                ▼
    Call existing cart service: addToCartAction({ variantId, quantity: 1 })
                │
                ▼
    Redirect browser to /checkout
                │
                ▼
    User submits checkout form on /checkout
                │
                ▼
    Existing processGuestCheckoutAction() executes createOnlineOrder() inside DB transaction
    ```
  - **Single Source of Truth**: Buy Now creates zero separate order flows, zero separate pricing engines, zero separate inventory reservation paths, and zero separate shipping logic. It utilizes the exact same server-authoritative cart and checkout infrastructure as standard cart checkout.

---

### 9. 12A Consistency Review (`LOCKED`)

- **Requirement**: Compare entire plan against locked Phase 12A specifications across Header, Homepage section order, PLP, PDP, Cart, Checkout, Search, Footer, Responsive, Accessibility, and Performance.
- **Audit Verification Results**:
  - **Header**: Contains `MEN`, `WOMEN`, `SIFR` display logo, `SEARCH` trigger, `CART` icon/badge, mobile hamburger drawer. Zero customer login/account buttons, zero wishlist, zero separate "Bag" terminology. *(Aligned)*
  - **Homepage Exact Section Order**:
    1. Hero Section (`HERO`)
    2. 10-Product Carousel (`PRODUCT_CAROUSEL`) with "View All" link
    3. Promotional Banner (`IMAGE_BANNER`)
    4. Second 10-Product Carousel (`PRODUCT_CAROUSEL`)
    5. 50/50 Split Feature (`SPLIT_FEATURE` with 4 products)
    6. Three Promotional Cards (`FEATURE_CARDS`)
    7. Store Footer
    *(Aligned)*
  - **PLP**: Includes `MEN` and `WOMEN` parent routes, category tabs, filter bar, sorting dropdown, URL state binding, 4-col desktop / 3-col tablet / 2-col mobile grid, and Load More appending. *(Aligned)*
  - **PDP**: 60/40 desktop split, editorial gallery, `ProductButton` linked color variations, dynamic size/fit pickers, Size Guide modal, primary Add to Cart, secondary Buy Now, related products carousel, mobile sticky CTA bar. *(Aligned)*
  - **Cart**: Full page route `/cart`, 65% items / 35% summary layout, server-authoritative totals, 100% state synchronization with `CartDrawer`. *(Aligned)*
  - **Checkout**: Guest checkout flow, E.164 mobile required, email optional, online Razorpay / COD payment options, reusing `processGuestCheckoutAction()`. *(Aligned)*
  - **Search**: Header Search Overlay modal, live auto-suggestions, dedicated `/search?q=...` page, empty state handling. *(Aligned)*
  - **Footer**: `Shop`, `Help`, `Follow`, `Legal` link columns. Zero newsletter input or backend infrastructure. *(Aligned)*
  - **Responsive Layout**: Validated breakpoint grid shifts ($1024\text{px}$, $768\text{px}$). *(Aligned)*
  - **Accessibility**: Semantic HTML5 tags, visible focus rings (`focus-visible:ring-2`), aria-labels on icon triggers, reduced motion support. *(Aligned)*
  - **Performance**: Next.js `<Image />` optimization, LCP priority loading on Hero images, reserved aspect ratio aspect-4/5 to prevent Cumulative Layout Shift (CLS). *(Aligned)*

---

### 10. Check for Unnecessary Complexity (`LOCKED`)

- **Requirement**: Ensure Phase 12B introduces zero unnecessary database models, services, server actions, client state libraries, packages, APIs, or abstractions.
- **Audit Verification Results**:
  - **No External Services**: Redis, Elasticsearch, Meilisearch, GraphQL, or microservices are strictly excluded. PostgreSQL handles search and storage natively.
  - **No Unnecessary CMS Versioning**: Historical revision snapshot tables, draft branching, or workflow approval engines are omitted. Live published JSON snapshot payload (`publishedPayloadJson`) delivers complete draft/publish isolation cleanly.
  - **No Excluded E-Commerce Features**: Wishlist, customer account registration, multi-currency engines, loyalty points, or newsletter subscription models are strictly excluded.
  - **Proportional Implementation**: The total architecture consists of 4 new Prisma models (`CmsSection`, `CmsButton`, `CmsSectionProduct`, `CmsFeatureCard`), 2 service modules (`lib/cms/cms-service.ts`, `lib/catalog/search-service.ts`), 1 full-page cart route (`/cart`), and light storefront UI components.

---

### 11. CMS Recommended Image Upload Dimensions (`LOCKED`)

- **Decision 11.1**: **Recommended Image Upload Dimensions & Ratios**
  - **Product images**: 2400 × 3000 px — 4:5
  - **Hero desktop**: 2400 × 1050 px — approximately 16:7
  - **Hero mobile (optional)**: 1080 × 1350 px — 4:5
  - **Large promotional/image banner**: 2400 × 1200 px — 2:1
  - **50/50 feature image**: 1200 × 1500 px — 4:5
  - **Promotional feature cards**: 900 × 1200 px — 3:4
  - **Usage**: These dimensions represent non-blocking recommendations communicated to the admin in the CMS image upload interface to ensure alignment with Phase 12A visual standards.
  - **Status**: **LOCKED**

---

# 21. Final Recommendation & Implementation Status

**Phase 12B Master Implementation Plan — LOCKED FOR IMPLEMENTATION**

- **Planning Mode Only**: 100% planning document revision. Zero code executed or changed.
- **Zero Source Code Changes**: Application source code remains untouched.
- **Zero Database / Schema Changes**: Database schema, Prisma schema, and migrations remain untouched.
- **Phase 12A Standards Preserved**: Visual specifications, design tokens, layout splits, and component contracts are fully preserved.
- **Decision 11.1 Locked**: CMS recommended upload dimensions are locked to Phase 12A standards.
- **Ready for Controlled Implementation**: All architectural decisions are locked. The codebase is ready for controlled Phase 12B implementation starting with **Step 1: Database Schema Update**.

