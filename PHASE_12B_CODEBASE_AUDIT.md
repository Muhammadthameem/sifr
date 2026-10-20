# SIFR — Phase 12B Pre-Implementation Codebase Audit

**Date**: September 26, 2026  
**Project**: SIFR Commerce Management Platform  
**Audit Purpose**: Pre-implementation analysis of existing codebase against locked Phase 12A target specifications prior to Phase 12B execution.  
**Mode**: Read-Only Audit (Zero code modifications made to application/schema/database).

---

# 1. Current Project Structure

The project is structured as a single Next.js App Router application in TypeScript with a unified backend (Prisma ORM + PostgreSQL) and frontend.

```text
sifr/
├── app/
│   ├── (store)/                             # Storefront Route Group
│   │   ├── categories/
│   │   │   └── [slug]/page.tsx              # Category PLP (Server Component)
│   │   ├── checkout/
│   │   │   └── page.tsx                     # Guest Checkout Page (Client Component)
│   │   ├── men/
│   │   │   └── page.tsx                     # Men's Collection PLP (Server Component)
│   │   ├── order-confirmation/
│   │   │   └── [orderNumber]/page.tsx       # Guest Order Confirmation (Server Component)
│   │   ├── products/
│   │   │   └── [slug]/page.tsx              # PDP Route Container (Server Component)
│   │   ├── returns/
│   │   │   └── request/page.tsx             # Guest Return Request (Server Component)
│   │   ├── women/
│   │   │   └── page.tsx                     # Women's Collection PLP (Server Component)
│   │   ├── layout.tsx                       # Store Layout (Header + Footer wrapper)
│   │   └── page.tsx                         # Store Homepage (Placeholder)
│   ├── admin/                               # Admin Portal Routes (Protected by Middleware)
│   │   ├── categories/                      # Category Management
│   │   ├── coupons/                         # Coupon & Discount Management
│   │   ├── customers/                       # Customer Master List
│   │   ├── dashboard/                       # Admin Analytics Dashboard
│   │   ├── direct-sales/                    # POS Over-the-Counter Terminal
│   │   ├── discounts/                       # Discount Rules
│   │   ├── inventory/                       # Stock Balances & Movements
│   │   ├── login/                           # Admin Authentication
│   │   ├── orders/                          # Order Management & Fulfillment
│   │   ├── products/                        # Product Master Catalog
│   │   ├── purchases/                       # PO & Vendor Receiving
│   │   ├── reports/                         # Financial Reports
│   │   ├── returns/                         # Return Approvals & Inspections
│   │   ├── settings/                        # System Configuration
│   │   ├── vendors/                         # Vendor Master Records
│   │   ├── website/                         # Website / CMS Admin (Placeholder)
│   │   └── layout.tsx                       # Admin Navigation Shell
│   ├── api/                                 # Server API Routes
│   │   ├── admin/auth/                      # Admin Login / Logout API
│   │   ├── tasks/                           # Cron / Background Poller Tasks
│   │   ├── upload/                          # Image Upload API Endpoint
│   │   ├── variants/search/                 # Internal Variant Search API
│   │   └── webhooks/payments/               # Payment Gateway Webhooks
│   ├── error.tsx                            # Global Error Boundary
│   ├── globals.css                          # Global Tailwind CSS Stylesheet
│   ├── layout.tsx                           # Root HTML Layout
│   └── not-found.tsx                        # Global 404 Component
├── components/
│   ├── admin/                               # Admin UI Components (ProductForm, OrderDetailView, etc.)
│   └── store/                               # Customer Storefront Components
│       ├── AddToCartButton.tsx              # Interactive Add-To-Cart CTA
│       ├── CartDrawer.tsx                   # Slide-Over Cart Drawer
│       ├── ProductCard.tsx                  # Storefront Product Grid Card
│       ├── ProductDetailView.tsx            # Full Product Detail View
│       ├── StoreFooter.tsx                  # Customer Storefront Footer
│       └── StoreHeader.tsx                  # Customer Storefront Header
├── lib/
│   ├── actions/                             # Server Actions (Cart, Product, Order, Coupon, etc.)
│   ├── auth/                                # JWT Admin Authentication & Middleware Utilities
│   ├── cart/                                # Cart Service Engine (Cookie-based session & totals)
│   ├── constants/                           # Fixed Brand & Navigation Configuration
│   ├── coupons/                             # Coupon Engine & Validation Rules
│   ├── db/                                  # Prisma Client Singleton
│   ├── inventory/                           # FIFO Cost & Stock Balance Engine
│   ├── notifications/                       # WhatsApp Notification Outbox & Provider Adapters
│   ├── ordering/                            # Core Order Engine, Status Transitions & Shipping
│   ├── payments/                            # Payment Gateway Integration & Webhook Processors
│   ├── purchasing/                          # Vendor PO & Landed Cost Engine
│   ├── returns/                             # Customer Return, Exchange & Refund Engine
│   ├── storage/                             # Local File System Image Storage Provider
│   ├── utils/                               # API Response & Class Name Utilities
│   └── validation/                          # Zod Schemas for Product, Cart, Order, etc.
├── prisma/
│   ├── schema.prisma                        # PostgreSQL Prisma Database Schema (Phases 1–11)
│   └── seed.ts                              # Database Seeding Script
├── public/
│   └── uploads/products/                    # Local Disk Storage Directory for Uploaded Images
├── scripts/                                 # Verification & Automated Test Suites (Phases 3–11)
├── middleware.ts                            # Next.js Route Guard Middleware (/admin protection)
├── next.config.mjs                          # Next.js Configuration
├── package.json                             # Node Dependencies & Package Scripts
└── tailwind.config.ts                       # Tailwind CSS Custom Configuration
```

---

# 2. Current Prisma Schema Summary

The current PostgreSQL database schema (`prisma/schema.prisma`) comprises **30 models** and **17 enums**, supporting Phases 1 through 11. 

### Key Models & Enums Relevant to Phase 12B

#### A. Catalog & Product Master Models
- `Product`:
  - **Fields**: `id` (UUID), `name`, `slug` (Unique), `description` (Text), `gender` (Enum: `MEN`, `WOMEN`, `BOTH`), `status` (Enum: `DRAFT`, `ACTIVE`, `ARCHIVED`), `categoryId` (FK to `Category`), `createdAt`, `updatedAt`.
  - **Relations**: `category`, `images` (`ProductImage[]`), `options` (`ProductOption[]`), `variants` (`ProductVariant[]`), `sourceButtons` (`ProductButton[]`), `targetButtons` (`ProductButton[]`), `couponProducts`.
  - **Rules**: Deleting a Category referenced by a Product is blocked (`onDelete: Restrict`).
- `ProductVariant`:
  - **Fields**: `id` (UUID), `productId` (FK), `title` (Combination name e.g. "S / White"), `sku` (Unique), `costPrice` (Decimal 10,2), `mrp` (Decimal 10,2), `sellingPrice` (Decimal 10,2), `shippingCost` (Decimal 10,2), `isAvailable` (Boolean flag for catalog sellability), `createdAt`, `updatedAt`.
  - **Relations**: `product`, `inventoryItem` (1-to-1), `fifoLayers`, `inventoryMovements`, `cartItems`, `orderItems`.
  - **Rules**: Cascades delete when parent Product is deleted (`onDelete: Cascade`).
- `ProductOption` & `ProductOptionValue`:
  - **Fields**: `ProductOption` (`id`, `productId`, `name`, `position`), `ProductOptionValue` (`id`, `optionId`, `value`, `position`).
  - **Rules**: Represents dynamic variant dimensions (e.g. Size, Color, Fit).
- `ProductImage`:
  - **Fields**: `id`, `productId` (FK), `url` (Relative `/uploads/...` or external), `storageKey`, `altText`, `sortOrder`, `createdAt`.
  - **Rules**: Belongs directly to `Product`, NOT to individual `ProductVariant`s.
- `ProductButton`:
  - **Fields**: `id`, `sourceProductId` (FK), `targetProductId` (FK), `label`, `sortOrder`, `isActive`, `createdAt`, `updatedAt`.
  - **Unique Constraint**: `@@unique([sourceProductId, targetProductId])`.
  - **Rules**: Configurable cross-links between distinct catalog Products (e.g., White Shirt $\rightarrow$ Black Shirt).
- `Category`:
  - **Fields**: `id`, `name`, `slug` (Unique), `description`, `sortOrder`, `isActive`, `parentId` (Self-referential FK for parent category), `createdAt`, `updatedAt`.
  - **Hierarchy**: Self-relation `CategoryHierarchy` supporting multi-level category trees.

#### B. Cart & Guest Checkout Models (Phase 6)
- `Cart`:
  - **Fields**: `id`, `sessionId` (Unique token in `sifr_cart_id` HTTP-only cookie), `appliedCouponCode`, `expiresAt` (30-day sliding TTL), `createdAt`, `updatedAt`.
  - **Index**: `@@index([sessionId])`.
- `CartItem`:
  - **Fields**: `id`, `cartId` (FK), `variantId` (FK to `ProductVariant`), `quantity` (Int), `createdAt`, `updatedAt`.
  - **Unique Constraint**: `@@unique([cartId, variantId])`.

#### C. Order & Financial Models (Phases 5, 7, 8, 10)
- `Order`:
  - **Fields**: `id`, `orderNumber` (Unique `ORD-YYYYMMDD-XXXX`), `salesChannel` (`ONLINE` / `DIRECT`), `status` (`RECEIVED`, `CONFIRMED`, `DISPATCHED`, `DELIVERED`, `CANCELLED`), `paymentStatus` (`PENDING`, `PAID`, `FAILED`, `PARTIALLY_REFUNDED`, `REFUNDED`), `creationIdempotencyKey` (Unique), `guestAccessToken` (Unique UUID), `guestAccessTokenExpiresAt` (7-day TTL), `subtotal`, `shippingFee`, `discountTotal`, `taxTotal`, `grandTotal`, `totalFifoCogs`, `reservationExpiresAt` (30-min stock reservation TTL).
- `OrderItem`:
  - **Fields**: `id`, `orderId`, `variantId`, `productNameSnapshot`, `variantTitleSnapshot`, `skuSnapshot`, `quantity`, `unitPrice`, `mrp`, `discountAmount`, `lineTotal`, `fifoCogs`.
  - **Unique Constraint**: `@@unique([orderId, variantId])`.

#### D. CMS Models
> [!IMPORTANT]  
> **Absence of CMS Models**: There are currently **ZERO** CMS or Homepage section models in `prisma/schema.prisma`. 

---

# 3. Existing Product Architecture Analysis

| Architectural Dimension | Codebase Implementation | Target 12A Specification | Compliance Status |
| :--- | :--- | :--- | :--- |
| **Catalog Hierarchy** | `Product` = Distinct catalog item.<br>`ProductVariant` = Exact sellable combination. | `Product` = Catalog item.<br>`ProductVariant` = Exact combination. | **FULL MATCH** |
| **Color/Variant Linkage** | `ProductButton` connects source `Product` to target `Product` with `label` (e.g. "Black"). | Product Buttons store relationship to target Product, not SKU/URL. | **FULL MATCH** |
| **Image Attachment** | `ProductImage` belongs to `Product` (`product_id`). Shared across variants. | Images belong to Products, not variants. | **FULL MATCH** |
| **Gender Classification** | `ProductGender` enum (`MEN`, `WOMEN`, `BOTH`). Tagged at Product level. | Products tagged `MEN`, `WOMEN`, or `BOTH`. No separate Unisex category. | **FULL MATCH** |
| **Dynamic Options** | `ProductOption` & `ProductOptionValue` support arbitrary dimensions (Size, Material, Fit). | Dynamic Product Options supported. | **FULL MATCH** |
| **Sellability Flag** | `ProductVariant.isAvailable` (Boolean flag). Stock balance in `InventoryItem`. | `isAvailable` flag + stock balances. | **FULL MATCH** |
| **Product Status** | `ProductStatus` enum (`DRAFT`, `ACTIVE`, `ARCHIVED`). | Catalog item lifecycle states. | **FULL MATCH** |

The existing backend architecture **100% matches** the locked product architecture. No structural refactoring of Product, Variant, Image, or ProductButton models is required.

---

# 4. Existing Storefront Inspection

| Route | Purpose | Current Status | Server/Client | Data Source / Dependencies | Reusable for 12B? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | Storefront Homepage | Placeholder ("PHASE 1 FOUNDATION SETUP") with dark mode banner | Server Component | `BRAND_CONFIG` static constants | **No** (Needs full rebuild for Section-based CMS) |
| `/men` | Men's Collection Listing | Functional 4-column product grid | Server Component | `getStorefrontProducts('MEN')` in `product-actions.ts` | **Partial** (Needs PLP category tabs, filters, sorting, 12A theme) |
| `/women` | Women's Collection Listing | Functional 4-column product grid | Server Component | `getStorefrontProducts('WOMEN')` in `product-actions.ts` | **Partial** (Needs PLP category tabs, filters, sorting, 12A theme) |
| `/categories/[slug]` | Category Listing | Functional category product grid | Server Component | `getStorefrontProducts(undefined, slug)` | **Partial** (Needs PLP filters, sorting, pagination, 12A theme) |
| `/products/[slug]` | Product Detail Page | Functional product view with options & images | Server Component + `ProductDetailView` (Client) | `getStorefrontProductBySlug(slug)` | **Partial** (Needs gallery redesign, sticky mobile CTA, 12A theme) |
| `/checkout` | Guest Checkout Page | Functional guest checkout form | Client Component | `fetchCartAction`, `processGuestCheckoutAction` | **Yes** (Backend flows intact; UI styling needs 12A theme) |
| `/order-confirmation/[orderNumber]` | Order Confirmation | Functional receipt + shipment tracking | Server Component | `prisma.order.findUnique` + guest token check | **Yes** (Backend logic intact; UI needs 12A styling polish) |
| `/returns/request` | Guest Return Portal | Functional 14-day return request form | Server Component | `getGuestOrderForReturnAction`, `submitReturnRequestAction` | **Yes** (Backend fully verified in Phase 9) |

---

# 5. Existing Admin Inspection

| Admin Route | Purpose | Component / File | Current Status | Reusable for 12B? |
| :--- | :--- | :--- | :--- | :--- |
| `/admin/products` | Master product catalog list | `ProductListManager.tsx` | Active & verified | **Yes** (Admin backend intact) |
| `/admin/products/create` | Product creation editor | `ProductForm.tsx` | Active & verified | **Yes** (Manages Options, Variants, Images, Buttons) |
| `/admin/products/[id]/edit` | Product edit editor | `ProductForm.tsx` | Active & verified | **Yes** (Handles upserts, image reordering, button links) |
| `/admin/categories` | Dynamic category tree manager | `CategoryManager.tsx` | Active & verified | **Yes** (Handles parent-child hierarchy & active toggles) |
| `/admin/orders` | Order management & fulfillment | `OrderListManager.tsx` | Active & verified | **Yes** (Handles Phase 10 dispatching & tracking) |
| `/admin/orders/[id]` | Order detail & notification audit | `OrderDetailView.tsx` | Active & verified | **Yes** (Displays WhatsApp attempts & retry actions) |
| `/admin/inventory` | Physical/Reserved stock balances | `InventoryManager.tsx` | Active & verified | **Yes** (Handles FIFO layers & stock adjustments) |
| `/admin/website` | Website CMS Admin | `AdminPagePlaceholder.tsx` | **Placeholder** | **No** (Needs full implementation for Section-based CMS) |

---

# 6. Existing Image / Media System Analysis

- **Storage Location**: Images uploaded via admin forms are saved to disk under `public/uploads/products/`.
- **URL Format**: Stored as root-relative paths e.g. `/uploads/products/1790415000-a1b2c3d4.jpg`.
- **Storage Abstraction**: `LocalFileSystemStorage` in `lib/storage/image-storage.ts` implements `ImageStorageProvider` interface (`saveImage`, `deleteImage`).
- **Upload API Endpoint**: `/api/upload/route.ts` accepts `multipart/form-data` file uploads, verifies admin JWT authentication via `requireAdminAuth()`, and writes files using `imageStorage`.
- **Current Image Component Usage**: Components currently use standard HTML `<img>` tags with `object-cover`. Next.js `<Image />` component (`next/image`) is **not** currently utilized in storefront components.
- **Reusability for 12B**: The upload API, storage abstraction, and disk file resolution are 100% operational and ready to serve storefront product galleries and CMS hero/banner assets.

---

# 7. Existing Cart & Checkout Analysis

- **Database Models**: `Cart` and `CartItem` models in PostgreSQL (`prisma/schema.prisma`).
- **Cart Session Token**: Stored in HTTP-only cookie `sifr_cart_id` with a **30-day sliding TTL**.
- **Cart Service Engine (`lib/cart/cart-service.ts`)**:
  - `getCartDetails(sessionId)`: Fetches cart items, joins product variant data, calculates line totals, verifies available stock (`physicalStock - reservedStock`), checks applied coupon validity, and returns authoritative totals.
  - `addItemToCart(sessionId, variantId, quantity)`: Validates catalog sellability (`isAvailable`) and available stock before adding/incrementing item. Returns `EXCEEDS_AVAILABLE_STOCK` if requested qty > available stock.
  - `updateCartItemQuantity`, `removeItemFromCart`, `clearCart`.
  - `applyCartCoupon`, `removeCartCoupon`.
- **Cart Server Actions (`lib/actions/cart-actions.ts`)**:
  - `fetchCartAction()`, `addToCartAction()`, `updateCartItemAction()`, `removeFromCartAction()`, `clearCartAction()`, `applyCartCouponAction()`, `removeCartCouponAction()`.
  - `processGuestCheckoutAction()`: Server action that loads cart details, verifies item availability, computes server-authoritative shipping fee via `calculateOrderShipping()`, calls `createOnlineOrder()`, clears the cart session, and returns the order number and 7-day `guestAccessToken`.
- **Cart Components**: `CartDrawer.tsx` (Slide-over drawer) and `AddToCartButton.tsx`.

---

# 8. Existing Search Analysis

- **Current Implementation**: `/api/variants/search/route.ts` exists as an internal API endpoint returning up to 20 raw `ProductVariant` JSON objects matching title, SKU, or product name.
- **Missing Storefront Search**:
  - **No** customer-facing header search overlay component exists.
  - **No** customer-facing search route (e.g. `/search?q=...`) exists.
  - **No** product grid search integration exists.
- **Database Capability**: PostgreSQL `contains` with `mode: 'insensitive'` on `Product.name`, `Product.description`, `Category.name`, and `ProductVariant.sku` is sufficient for initial storefront search without external dependencies.

---

# 9. Existing Order / Checkout Dependencies

When a customer places a guest order on the storefront, it invokes existing, fully-verified backend business logic across Phases 5 through 11:

```text
Storefront Guest Checkout Form
             │
             ▼
processGuestCheckoutAction() (lib/actions/cart-actions.ts)
             │
             ├── 1. Validates Cart Stock & Sellability (lib/cart/cart-service.ts)
             ├── 2. Calculates Authoritative Shipping Fee (lib/ordering/shipping.ts)
             │      Raw Shipping = SUM(variant.shippingCost * qty)
             │      Final Shipping = MIN(Raw Shipping, GLOBAL_SHIPPING_CAP)
             └── 3. Invokes createOnlineOrder() (lib/ordering/order-engine.ts)
                    ├── Transactional Stock Lock (SELECT FOR UPDATE)
                    ├── Customer Master Lookup / Auto-Creation by E.164 Mobile
                    ├── DocumentSequence ORDER Number Generation (ORD-YYYYMMDD-XXXX)
                    ├── Coupon Validation & CouponUsage Recording (Phase 7)
                    ├── Atomic Inventory Reservation Increment (+reservedStock)
                    └── Outbox WhatsApp Notification Creation (ORDER_RECEIVED, Phase 11)
```

---

# 10. Existing Reusable Components Summary

| Component | Location | Current Purpose | Reusable for 12B? | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `StoreHeader` | `components/store/StoreHeader.tsx` | Storefront navigation header | **Partial** | Needs styling update to match 12A light theme & search overlay trigger. |
| `StoreFooter` | `components/store/StoreFooter.tsx` | Storefront footer | **Partial** | Needs update to 12A multi-column desktop / accordion mobile layout. |
| `ProductCard` | `components/store/ProductCard.tsx` | Product grid item card | **Partial** | Needs 4:5 aspect ratio update, 12A typography, and removal of dark borders/shadows. |
| `ProductDetailView` | `components/store/ProductDetailView.tsx` | Product detail page view | **Partial** | Business logic intact; UI needs 12A editorial 60/40 gallery layout & size guide modal. |
| `CartDrawer` | `components/store/CartDrawer.tsx` | Slide-over cart drawer | **Yes** | Fully functional with stock validation & coupon application; needs 12A light theme styling. |
| `AddToCartButton` | `components/store/AddToCartButton.tsx` | Add-to-cart button with state | **Yes** | Fully wired to `addToCartAction` with stock feedback; needs 12A button styling. |
| `AdminHeader` | `components/admin/AdminHeader.tsx` | Admin portal top header | **Yes** | Admin authentication & route indicator intact. |
| `AdminSidebar` | `components/admin/AdminSidebar.tsx` | Admin navigation sidebar | **Yes** | Includes link to `/admin/website` (CMS portal). |
| `AdminPagePlaceholder` | `components/admin/AdminPagePlaceholder.tsx` | Placeholder view | **Yes** | Used for pending admin sections. |

---

# 11. Existing Dependencies (`package.json`)

| Package | Version | Purpose | 12B Utilization |
| :--- | :--- | :--- | :--- |
| `next` | `^14.2.24` | React Framework (App Router) | Storefront routing, Server Components, Server Actions, Image optimization |
| `react` / `react-dom` | `^18.0.0` | UI Library | Storefront components & client interactivity |
| `@prisma/client` / `prisma` | `^5.22.0` | ORM & Database Driver | PostgreSQL queries & outbox transactions |
| `tailwindcss` | `^3.4.1` | Utility CSS Framework | Storefront 12A design system implementation |
| `lucide-react` | `^1.47.0` | Icon Library | Storefront UI icons (Search, Cart, Chevron, Check, X, Menu, etc.) |
| `zod` | `^4.6.5` | Schema Validation | Form validation & API payload parsing |
| `clsx` / `tailwind-merge` | `^2.1.1` / `^3.7.0` | Utility CSS Combiner | Class name merging (`cn()` helper) |
| `jose` / `bcryptjs` | `^6.2.12` / `^3.0.3` | JWT Authentication & Hashing | Admin authentication middleware |
| `embedded-postgres` | `^16.14.0-beta.17` | Local PostgreSQL Server | Local development & automated verification tests |

> [!NOTE]  
> **No Additional Package Dependencies Needed**: All requirements for Phase 12B (Storefront, CMS, Cart, Checkout, Search, Animations) can be fulfilled using the existing dependency stack.

---

# 12. Existing Tests & Verification Commands

The codebase possesses automated test scripts covering Phases 3 through 11 located in `scripts/`:

- `npx tsx scripts/verify-phase5.ts` — 35 Orders & Direct Sales tests
- `npx tsx scripts/verify-phase6.ts` — 42 Cart & Guest Checkout tests
- `npx tsx scripts/verify-phase7.ts` — 43 Coupon & Discount tests
- `npx tsx scripts/verify-phase8.ts` — 14 Payment Gateway tests
- `npx tsx scripts/verify-phase9.ts` — 20 Return, Inspection & Refund tests
- `npx tsx scripts/verify-phase10.ts` — Shipment, Tracking & Dispatch Idempotency tests
- `npx tsx scripts/verify-phase11.ts` — 11 Notification Outbox & Poller tests
- `npx tsc --noEmit` — Safe read-only TypeScript compiler check (0 errors)
- `npm run build` — Safe Next.js production build check (0 errors)

---

# 13. Potential Conflicts With Phase 12A Specification

| Area | Current Implementation | Locked 12A Requirement | Conflict? | Details |
| :--- | :--- | :--- | :--- | :--- |
| **Theme / Canvas** | Dark mode (`bg-neutral-950`, `text-white`, `border-neutral-800`). | Premium minimal **Light** theme (`#FFFFFF` canvas, `#111111` text, `#EAEAEA` border, no dark mode). | **YES** | Global layout (`app/(store)/layout.tsx`) and components currently hardcode dark Tailwind classes. |
| **Header Layout** | Dark top bar with `MEN`, `WOMEN` left, brand center, `SEARCH`, `CART` right. | Light top bar. Desktop: `MEN \| WOMEN \| SIFR \| SEARCH \| CART`. Mobile: `HAMBURGER \| SIFR \| SEARCH \| CART`. | **YES** | Header structure is close, but colors and mobile drawer styling need alignment with 12A. |
| **Homepage** | Static dark placeholder card ("PHASE 1 FOUNDATION SETUP"). | **Section-Based CMS Homepage** (Hero, Shop the Collection Carousel, Promo Banner, New Arrivals Carousel, 50/50 Split, Feature Cards). | **YES** | Current homepage is a developer placeholder page. |
| **Product Card** | Dark container (`bg-neutral-900/40`), `aspect-[3/4]`, heavy rounded corners & borders. | Light background, `aspect-[4/5]`, editorial image-first design, no heavy borders/shadows/rounded cards. | **YES** | `ProductCard.tsx` aspect ratio and container styles conflict with 12A editorial guidelines. |
| **Product Detail Page (PDP)** | Dark split container with hardcoded disabled "Add to Cart (Phase 3 Feature)" button. | 60/40 Light Editorial Gallery, dynamic options, size guide modal, primary Add to Cart CTA, sticky mobile CTA, "You May Also Like" carousel. | **YES** | `ProductDetailView.tsx` needs visual layout redesign and activation of `AddToCartButton`. |
| **Cart Experience** | Slide-over drawer (`CartDrawer.tsx`) + `/checkout` page. | Dedicated **Full-Page Cart** (`/cart`) + Slide-over drawer. | **YES** | Full-page `/cart` route (65% items / 35% summary) is currently missing. |
| **Search** | Internal admin variant search (`/api/variants/search`). | Header search overlay with instant suggestions + full-page search results reusing PLP grid. | **YES** | Customer search overlay and `/search` route do not exist yet. |
| **Footer** | Dark single-row footer with "Owner Access" link. | Editorial light footer (Shop, Help, Follow, Legal columns desktop; accordions mobile). | **YES** | `StoreFooter.tsx` must be redesigned according to 12A structure. |
| **CMS System** | No database models or admin editor (`/admin/website` is a placeholder). | Section-based CMS schema, draft/publish state, section reordering, section activation, admin CMS editor. | **YES** | CMS infrastructure needs to be created in Phase 12B. |

---

# 14. Missing Pieces For Phase 12B

### A. Storefront Foundation
- 12A Light Color Palette design system tokens in Tailwind (`#FFFFFF`, `#111111`, `#666666`, `#EAEAEA`, `#FAFAF8`).
- Google Fonts integration (Cormorant Garamond / editorial serif + Inter UI font).
- Header Search Overlay state & modal trigger in `StoreHeader.tsx`.

### B. Homepage (CMS-Driven)
- Dynamic Homepage rendering engine in `app/(store)/page.tsx`.
- Section Components: `HeroSection.tsx`, `ProductCarouselSection.tsx`, `ImageBannerSection.tsx`, `SplitFeatureSection.tsx`, `FeatureCardsSection.tsx`.

### C. Product Listing Pages (PLP)
- Reusable PLP Container supporting `/men`, `/women`, and `/categories/[slug]`.
- Category tabs bar (`ALL`, `APPAREL`, `FOOTWEAR`, `ACCESSORIES`).
- URL parameter state binding (`?category=...&size=...&color=...&price=...&sort=...&page=...`).
- Filter Drawer / Bar (Size, Color, Price Range, Availability).
- Sorting dropdown (Recommended, Newest, Price Low-High, Price High-Low).
- Server-side pagination (24 items per page with "Load More" CTA).

### D. Product Detail Page (PDP)
- 60/40 Editorial Layout with 2-column image gallery desktop / swipe gallery mobile.
- Size Guide Modal / Drawer component with HTML comparison table.
- Mobile Sticky Add to Cart bar (appearing when main CTA scrolls out of view).
- "You May Also Like" related products carousel (`ProductCard` carousel).

### E. Search System
- Storefront Search Overlay component (header search popup).
- Storefront Search API / Query supporting product name, category, and attributes.
- Full-page search route (`/search?q=...`) reusing PLP product grid architecture.

### F. Cart Experience
- Full-page Cart route (`/cart`) with 65% items / 35% summary layout desktop and stacked mobile layout.
- Syncing between `CartDrawer`, `/cart`, and header item counter.

### G. Checkout Experience
- Alignment of `/checkout` page with 12A light theme styling and step indicators.

### H. CMS Database Schema & Services
- Prisma model for Homepage Sections (`CmsSection` / `CmsSectionItem` or structured JSON configuration model).
- Section Types enum (`HERO`, `PRODUCT_CAROUSEL`, `IMAGE_BANNER`, `SPLIT_FEATURE`, `FEATURE_CARDS`).
- Status enum (`DRAFT`, `PUBLISHED`).
- Server actions for fetching published sections for storefront and managing sections in admin.

### I. CMS Admin Management (`/admin/website`)
- Section list & reordering UI (drag/move up/down).
- Section content editor forms (Image URL upload, heading text, button labels/links, selected product picker).
- Draft / Publish toggle & preview mode.

### J. Image System Enhancements
- Migration of storefront image rendering from raw `<img>` tags to optimized Next.js `<Image />` (`next/image`) with proper `sizes` and reserved aspect ratios (4:5).

---

# 15. Existing Code We Should NOT Rebuild

The following existing backend services, engines, and schemas are fully operational, verified by regression tests, and **MUST BE REUSED AS-IS**:

1. **`lib/ordering/order-engine.ts`**: `createOnlineOrder()`, `transitionOrderStatus()`, `resolveCustomer()`.
2. **`lib/ordering/shipping.ts`**: `calculateOrderShipping()`, `getGlobalShippingCap()`.
3. **`lib/cart/cart-service.ts`**: `getCartDetails()`, `addItemToCart()`, `updateCartItemQuantity()`, `removeItemFromCart()`, `clearCart()`, `applyCartCoupon()`.
4. **`lib/actions/cart-actions.ts`**: `fetchCartAction()`, `addToCartAction()`, `processGuestCheckoutAction()`.
5. **`lib/actions/product-actions.ts`**: `getStorefrontProductBySlug()`, `createProduct()`, `updateProduct()`.
6. **`lib/storage/image-storage.ts`**: `imageStorage.saveImage()`, `/api/upload/route.ts`.
7. **`lib/notifications/notification-engine.ts`**: Transactional outbox creation & poller processor.
8. **Prisma Schema Models**: `Product`, `ProductVariant`, `ProductOption`, `ProductImage`, `ProductButton`, `Category`, `Cart`, `CartItem`, `Order`, `OrderItem`, `Customer`, `Shipment`, `Payment`, `Notification`.

---

# 16. Architectural Risks

1. **Client-Side Pricing Vulnerability**: Ensure that price displays on product cards, PDP, and cart pages remain purely presentational. All checkout calculations must continue to use `processGuestCheckoutAction()` which fetches server-authoritative prices from `ProductVariant` in the database.
2. **Dual Cart Route vs. Cart Drawer State Sync**: Adding the full-page `/cart` route alongside `CartDrawer.tsx` requires careful state revalidation so that editing quantities on `/cart` updates the header badge and drawer synchronously.
3. **CMS Product References**: CMS section components (carousels, 50/50 grid) will reference selected `Product` IDs. If a referenced product is set to `DRAFT` or `ARCHIVED`, the storefront section renderer must gracefully filter it out without throwing rendering errors.
4. **Image Aspect Ratio Distortion**: Ensure container classes use `aspect-[4/5]` with `object-cover` or `object-contain` so product imagery renders sharply across breakpoints without horizontal stretching.

---

# 17. Recommended Phase 12B Integration Strategy

1. **Phase 12B.1 — CMS Schema & Admin Section Manager**:
   - Add CMS section model to `prisma/schema.prisma` without altering any existing models.
   - Run `npx prisma db push` & `npx prisma generate`.
   - Build CMS server actions and admin management portal in `/admin/website`.
2. **Phase 12B.2 — Design System & Shared Storefront Primitives**:
   - Update `globals.css` and `tailwind.config.ts` with 12A light color palette (`#FFFFFF`, `#111111`, `#666666`, `#EAEAEA`, `#FAFAF8`) and Google Fonts (Cormorant Garamond & Inter).
   - Refactor `StoreHeader.tsx`, `StoreFooter.tsx`, and `ProductCard.tsx` to match 12A light theme guidelines.
3. **Phase 12B.3 — CMS-Driven Homepage**:
   - Build section rendering components (`HeroSection`, `ProductCarouselSection`, `ImageBannerSection`, `SplitFeatureSection`, `FeatureCardsSection`).
   - Wire `app/(store)/page.tsx` to fetch active published CMS sections.
4. **Phase 12B.4 — Storefront PLP & Search**:
   - Build unified PLP container supporting `/men`, `/women`, `/categories/[slug]`, and `/search`.
   - Implement category tabs, URL parameter filtering, sorting, and pagination.
   - Implement header search overlay modal.
5. **Phase 12B.5 — Storefront PDP & Cart/Checkout Refinement**:
   - Redesign `ProductDetailView.tsx` with 60/40 editorial gallery, size guide modal, sticky mobile CTA, and "You May Also Like" carousel.
   - Build full-page `/cart` route.
   - Polish `/checkout` and `/order-confirmation` views.
6. **Phase 12B.6 — Verification & Full Regression**:
   - Execute Phase 12B verification suite and run full regression suite for Phases 5–11.
   - Run `npx tsc --noEmit` and `npm run build`.

---

# 18. Files That Need To Be Created / Modified

### NEW FILES
- `lib/cms/cms-service.ts` — CMS section query & mutation service
- `lib/actions/cms-actions.ts` — CMS server actions for admin editor & storefront
- `components/store/SearchOverlay.tsx` — Header search modal component
- `components/store/SizeGuideModal.tsx` — PDP size guide modal drawer
- `components/store/StickyAddToCartBar.tsx` — Mobile PDP sticky CTA bar
- `components/store/sections/HeroSection.tsx` — Homepage Hero section
- `components/store/sections/ProductCarouselSection.tsx` — Homepage product carousel section
- `components/store/sections/ImageBannerSection.tsx` — Homepage image banner section
- `components/store/sections/SplitFeatureSection.tsx` — Homepage 50/50 split section
- `components/store/sections/FeatureCardsSection.tsx` — Homepage 3-card promo section
- `components/admin/CmsSectionEditor.tsx` — Admin homepage section editor
- `app/(store)/cart/page.tsx` — Full-page customer shopping cart
- `app/(store)/search/page.tsx` — Customer search results page
- `scripts/verify-phase12b.ts` — Phase 12B automated verification suite

### MODIFIED FILES
- `prisma/schema.prisma` — Add `CmsSection` and `CmsSectionItem` models & enums
- `app/(store)/layout.tsx` — Update store layout to light theme canvas
- `app/(store)/page.tsx` — Render CMS-driven homepage sections
- `app/(store)/men/page.tsx` — Integrate full PLP grid, filters & sorting
- `app/(store)/women/page.tsx` — Integrate full PLP grid, filters & sorting
- `app/(store)/categories/[slug]/page.tsx` — Integrate full PLP grid, filters & sorting
- `app/(store)/products/[slug]/page.tsx` — Wire full PDP view with size guide & sticky CTA
- `app/(store)/checkout/page.tsx` — Apply 12A light theme styling
- `app/(store)/order-confirmation/[orderNumber]/page.tsx` — Apply 12A light theme styling
- `app/admin/website/page.tsx` — Build CMS section management admin interface
- `components/store/StoreHeader.tsx` — Apply 12A header layout, light styling & search trigger
- `components/store/StoreFooter.tsx` — Apply 12A multi-column desktop / accordion mobile layout
- `components/store/ProductCard.tsx` — Apply 12A 4:5 image ratio & light editorial styling
- `components/store/ProductDetailView.tsx` — Apply 12A 60/40 gallery layout & size guide modal
- `components/store/CartDrawer.tsx` — Apply 12A light theme styling
- `tailwind.config.ts` — Configure 12A font families and subtle neutral color tokens

---

# 19. Questions / Decisions Requiring Review

1. **CMS Model Storage Structure**: Should homepage CMS sections be stored as individual relational rows (`CmsSection` + `CmsSectionItem` tables) or as a structured JSON document per section? *(Recommendation: Relational tables `CmsSection` and `CmsSectionItem` provide clean foreign key references to `Product` rows for carousels).*
2. **Default Image Aspect Ratio for Banners**: Should CMS Hero and Image Banner upload inputs enforce recommended dimensions (e.g. 2400x1050 for Hero) via admin UI guidance? *(Recommendation: Yes, display recommended dimensions in admin upload fields).*

---

# 20. Final Audit Summary

- **Current Architecture Status**: **EXCELLENT**. Product, Variant, Option, Image, ProductButton, Category, Cart, Order, Payment, Shipment, Return, and Notification engines are 100% verified and operational.
- **Storefront Readiness**: **READY FOR 12B**. Core data fetching actions (`getStorefrontProducts`, `getStorefrontProductBySlug`, `fetchCartAction`, `processGuestCheckoutAction`) exist. UI layers require styling transformation to 12A light editorial theme.
- **CMS Readiness**: **REQUIRES IMPLEMENTATION**. Database schema and admin section manager must be created during 12B.1.
- **Cart & Checkout Readiness**: **READY FOR 12B**. Backend engines and validation are complete; full-page `/cart` route and 12A styling polish needed.
- **Search Readiness**: **READY FOR 12B**. PostgreSQL text search query can be integrated directly into header overlay and `/search` route.
- **Image System Readiness**: **READY FOR 12B**. Local file storage and upload API `/api/upload` are operational.
- **Major Risks**: None. Existing business logic and regression test suites provide a solid foundation.
- **Recommended Next Step**: Review and approve this codebase audit, then proceed to finalize the Phase 12B implementation plan.
