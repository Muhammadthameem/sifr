# SIFR

Single-brand fashion/accessories e-commerce and business management platform.

SIFR provides an integrated, end-to-end solution combining a high-performance customer-facing storefront with a comprehensive backoffice management system designed specifically for direct-to-consumer fashion retail.

---

## Overview

SIFR integrates all commercial, operational, and financial functions of a direct-to-consumer fashion brand into a single cohesive platform:

- **Customer Storefront**: High-converting, responsive catalog browsing, product detail showcases, category filtering, cart management, and seamless WhatsApp ordering.
- **Product & Catalog Management**: Dynamic products, multiple images, rich descriptions, active/draft visibility, and category assignments.
- **Categories & Taxonomy**: Hierarchical category tree with subcategories and storefront navigation controls.
- **Variants & SKUs**: Size, color, SKU tracking, and variant-level pricing and barcode management.
- **Inventory & Warehouse**: Single-warehouse inventory ledger tracking physical versus available stock with reserve holds and stock alerts.
- **FIFO Inventory Costing**: Real-time First-In, First-Out (FIFO) purchase layer tracking and Cost of Goods Sold (COGS) calculation.
- **WhatsApp Ordering**: Conversational commerce checkout flow creating verified customer orders and redirecting to WhatsApp.
- **Order Lifecycle Management**: Complete admin workflow transitioning orders through CONTACTED, CONFIRMED, DISPATCHED, and DELIVERED states.
- **Customer Management**: Central customer directory with automatic phone normalization, purchase history, metrics, and customer notes.
- **Returns & Refunds**: Return processing, inventory restocking to specific FIFO layers, and automatic ledger refund deductions.
- **Payments & Accounting**: Multi-channel payment recording, transaction reconciliation, and ledger balance management.
- **Expense Management**: Categorized operating expense tracking integrated with Net Profit financial reporting.
- **Financial Reports**: Real-time financial dashboard displaying Gross Sales, Net Revenue, COGS, Gross Profit, Operating Expenses, and Net Profit.
- **CMS & Storefront Management**: Homepage hero banner customization, announcements, contact details, and policy pages.
- **Admin Backoffice**: Secure administrative portal with role-based access control, real-time KPI metrics, and operational workflows.

---

## Technology Stack

SIFR is built with a modern, production-grade TypeScript ecosystem:

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router with Server Components, Server Actions, and API Routes)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/) (Strict type safety)
- **UI & Components**: [React 18](https://react.dev/), Tailwind CSS, Lucide Icons, clsx, tailwind-merge
- **Database & ORM**: PostgreSQL via [Prisma ORM 5](https://www.prisma.io/)
- **Authentication**: Stateless administrative session management using signed JWTs via [jose](https://github.com/panva/jose) stored in `httpOnly`, `sameSite=lax`, secure cookies
- **Validation**: [Zod](https://zod.dev/) for strict runtime validation of API requests and form submissions
- **Password Security**: [bcryptjs](https://github.com/dcodeIO/bcrypt.js) for password hashing and verification
- **Document Generation**: [PDFKit](https://pdfkit.org/) for generating pack slips and invoices
- **Notification & Outbox**: Integrated transactional notification outbox with multi-provider architecture (Mock, Twilio, Meta Cloud API)
- **Local Database**: Embedded PostgreSQL for zero-configuration local development

---

## Architecture

SIFR follows a monolithic, single-source-of-truth architectural design:

```
┌────────────────────────────────────────────────────────┐
│                   SIFR Application                     │
│                                                        │
│  ┌─────────────────────────┐ ┌──────────────────────┐  │
│  │   Customer Storefront   │ │   Admin Backoffice   │  │
│  │     app/(store)/*       │ │     app/admin/*      │  │
│  └───────────┬─────────────┘ └──────────┬───────────┘  │
│              │                          │              │
│              └────────────┬─────────────┘              │
│                           │                            │
│              ┌────────────▼─────────────┐              │
│              │ Domain Services & Logic  │              │
│              │         lib/*            │              │
│              └────────────┬─────────────┘              │
│                           │                            │
│              ┌────────────▼─────────────┐              │
│              │    Prisma ORM Client     │              │
│              └────────────┬─────────────┘              │
└───────────────────────────┼────────────────────────────┘
                            │
               ┌────────────▼─────────────┐
               │   PostgreSQL Database    │
               └──────────────────────────┘
```

- **Single Integrated Application**: Storefront and Admin backoffice share the same Next.js repository, runtime environment, and domain models.
- **Single Source of Truth**: All transactional operations (inventory reservations, order fulfillment, returns, refunds, expenses) interact with a single PostgreSQL database via Prisma ORM.
- **Server-Side Business Logic**: Critical calculations (inventory reservation, FIFO cost depletion, ledger balances, margin calculations) execute exclusively on the server to ensure financial and inventory integrity.

---

## Customer Ordering

SIFR operates an optimized WhatsApp-first conversational commerce workflow designed for high conversion:

1. **Product Selection**: The customer browses the catalog, selects product variants (size/color), and adds them to their shopping bag.
2. **Customer Information**: At checkout, the customer inputs their name, phone number, delivery address, city, state, pincode, and optional email address.
3. **Contacted Order Creation**: The application validates input data, resolves or creates the Customer profile, snapshots customer information on the order, and creates an order in `CONTACTED` status.
4. **WhatsApp Redirect**: The website redirects the customer to WhatsApp via a prefilled `wa.me` message detailing their Order Number, selected items, delivery address, and order total.
5. **Admin Confirmation**: The business owner/admin confirms the order with the customer in WhatsApp and advances the order to `CONFIRMED` in Admin. Confirmation permanently reserves stock and calculates FIFO COGS.
6. **Dispatch & Tracking**: The admin packs the order, assigns courier and tracking details, and updates the status to `DISPATCHED`.
7. **Delivery**: Upon delivery confirmation, the order transitions to `DELIVERED`.

---

## Inventory

The inventory subsystem provides real-time multi-variant tracking backed by an immutable ledger:

- **Single Warehouse Model**: Centralized inventory tracking for all active SKUs.
- **Physical vs. Available Stock**:
  - `Physical Stock`: Total units physically located in the warehouse.
  - `Available Stock`: Physical stock minus temporary reservations and active pending orders.
- **First-In, First-Out (FIFO) Costing**:
  - Stock purchases are recorded into discrete inventory batches with specific unit cost prices.
  - When orders are confirmed, stock is depleted from the oldest available batch.
  - The exact unit cost of depleted items is recorded as Cost of Goods Sold (COGS).
- **Stock Adjustments & Purchases**: Admins can log incoming inventory shipments (with supplier info and cost) or record manual count adjustments with audit reasons.
- **Returns & Restocking**: Accepted returns can optionally restock items back into inventory at their original cost basis.

---

## Expenses

SIFR includes an integrated business expense module to track operating expenditures:

- **Expense Entry**: Record paid operational expenses with free-text descriptions, amounts, and dates.
- **Payment Method Tracking**: Associate expenses with the payment method used (Bank Transfer, UPI, Cash, Credit Card, Debit Card).
- **Expense Ledger**: Immutable ledger tracking all operating disbursements.
- **Profit Integration**: Operating expenses are deducted from Gross Profit to arrive at true Net Profit.

---

## Reports & Financial Calculations

The financial reporting engine calculates real-time profitability based on standard accounting rules:

$$\text{Net Revenue} = \text{Gross Sales} - \text{Refunds}$$

$$\text{Gross Profit} = \text{Net Revenue} - \text{FIFO COGS}$$

$$\text{Net Profit} = \text{Gross Profit} - \text{Operating Expenses}$$

- **Gross Sales**: Total value of confirmed, dispatched, and delivered sales orders.
- **Refunds**: Deductions resulting from processed and accepted customer returns.
- **FIFO COGS**: Exact cost of goods sold based on the FIFO inventory batch depleted upon order confirmation.
- **Operating Expenses**: Total recorded paid operational expenses for the period.
- **Returns & Refunds Impact**: When a return is accepted and refunded, Gross Sales is adjusted via Refunds, restocking returns units to inventory at cost basis, and Net Profit is recalculated automatically.

---

## Admin Backoffice

The administrative interface provides unified control over all business operations:

- **Authentication**: Email/password authentication verified with bcrypt hashes against the `AdminUser` model; authenticated sessions use signed HTTP-only JWT cookies.
- **Dashboard**: High-level KPI cards (Net Revenue, Gross Profit, Net Profit, Orders, Pending Tasks) and revenue charts.
- **Orders**: Full order lifecycle management, filtering by status (`CONTACTED`, `CONFIRMED`, `DISPATCHED`, `DELIVERED`, `CANCELLED`), courier assignment, and invoice generation.
- **Products & Categories**: Catalog editor with image management, variant matrix, inventory counts, and category organization.
- **Inventory**: Warehouse ledger, purchase order logging, stock adjustment history, and low-stock alerts.
- **Returns**: WhatsApp-initiated return request handling, approval/rejection, refund calculation, and inventory restocking.
- **Customers**: Customer directory with lifetime spend, order count, contact details, and notes.
- **Expenses**: Log, categorize, and review business operating expenditures.
- **Reports**: Financial reports, sales breakdown, inventory valuation, and tax summaries.
- **Settings & CMS**: Storefront announcement banners, hero slides, WhatsApp business contact configuration, and shipping policies.

---

## Environment Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Configure your local `.env` values:
   - `DATABASE_URL`: Connection string for your PostgreSQL database.
   - `JWT_SECRET`: A secure random string (minimum 32 characters) for signing session cookies.
   - `ADMIN_EMAIL`: Email address for the administrator account.
   - `ADMIN_PASSWORD`: Strong password for the administrator account.
   - `NEXT_PUBLIC_SITE_URL`: Local storefront URL (e.g. `http://localhost:3000`).
   - `WHATSAPP_BUSINESS_PHONE`: WhatsApp number to receive customer orders (e.g. `919876543210`).

> **Important**: Never commit `.env` or any production secrets to version control.

---

## Database Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Push the Prisma schema to the database:
   ```bash
   npx prisma db push
   ```

3. Seed the initial admin account:
   ```bash
   npm run db:seed
   ```

---

## Development

To start the local development environment:

```bash
npm run dev
```

### Local Embedded PostgreSQL
For local development convenience, SIFR includes an embedded PostgreSQL binary script (`scripts/dev.js` and `scripts/start-postgres.js`). When `npm run dev` is executed, the startup script checks if PostgreSQL is running on port 5432. If not, it boots a local instance in `data/db/` before launching the Next.js development server.

- **Storefront**: Accessible at [http://localhost:3000](http://localhost:3000)
- **Admin Backoffice**: Accessible at [http://localhost:3000/admin](http://localhost:3000/admin)

---

## Production Deployment

When deploying SIFR to a production environment (such as AWS, Vercel, Railway, or VPS):

1. **Managed PostgreSQL**: Use a managed PostgreSQL database (e.g., Supabase, Neon, AWS RDS) and configure `DATABASE_URL` with SSL enabled (`?sslmode=require`).
2. **Environment Secrets**: Ensure `JWT_SECRET` is generated using a cryptographically secure random generator (`openssl rand -base64 32`) and `ADMIN_PASSWORD` uses a strong, complex password.
3. **Durable Media Storage**: SIFR stores uploaded product images locally in `public/uploads/products/` by default. For serverless or containerized production environments, configure durable cloud object storage (e.g., AWS S3, Cloudflare R2) before deploying.
4. **Domain & HTTPS**: Configure `NEXT_PUBLIC_SITE_URL` to match your production domain (e.g., `https://sifr.in`). HTTPS is mandatory for secure cookie transmission.
5. **External Notification Services**: Configure Twilio or Meta WhatsApp Cloud API credentials in `.env` if automated outbound notification dispatch is enabled.

---

## Important Repository Notes

- **`.env` files**: Never commit `.env`, `.env.local`, or `.env.production`.
- **Local Database Data**: The `data/` directory contains local embedded PostgreSQL cluster storage and must never be committed.
- **Uploaded Media**: The `public/uploads/` directory contains user-uploaded media and test images; it is ignored by Git, with only `public/uploads/.gitkeep` tracked.
- **Clean Baseline**: The Git repository contains clean application source code, configuration templates, and database schemas ready for fresh deployment.
