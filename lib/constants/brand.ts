/**
 * SIFR Brand Identity Constants
 * 
 * The primary SIFR brand identity is fixed at code/deployment level.
 * It is NOT editable through Admin Settings or CMS.
 */

export const BRAND_CONFIG = {
  name: 'SIFR',
  tagline: 'Contemporary Fashion & Accessories',
  market: 'India-First Commerce Platform',
  currency: {
    code: 'INR',
    symbol: '₹',
  },
  meta: {
    title: 'SIFR | Contemporary India Fashion',
    description: 'Minimalist luxury, contemporary fashion & accessories crafted in India.',
  },
} as const;

export const STORE_NAV_ITEMS = [
  { label: 'SHOP', href: '/shop' },
  { label: 'MEN', href: '/men' },
  { label: 'WOMEN', href: '/women' },
] as const;

export const ADMIN_NAV_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', href: '/admin/dashboard', iconName: 'LayoutDashboard' },
  { id: 'products', label: 'Products', href: '/admin/products', iconName: 'Shirt' },
  { id: 'categories', label: 'Categories', href: '/admin/categories', iconName: 'FolderTree' },
  { id: 'inventory', label: 'Inventory', href: '/admin/inventory', iconName: 'Boxes' },
  { id: 'purchases', label: 'Purchases', href: '/admin/purchases', iconName: 'ShoppingBag' },
  { id: 'vendors', label: 'Vendors', href: '/admin/vendors', iconName: 'Building2' },
  { id: 'orders', label: 'Orders', href: '/admin/orders', iconName: 'Receipt' },
  { id: 'payments', label: 'Payments', href: '/admin/payments', iconName: 'CreditCard' },
  { id: 'direct-sales', label: 'Direct Sales', href: '/admin/direct-sales', iconName: 'Store' },
  { id: 'customers', label: 'Customers', href: '/admin/customers', iconName: 'Users' },
  { id: 'returns', label: 'Returns', href: '/admin/returns', iconName: 'RotateCcw' },
  { id: 'expenses', label: 'Expenses', href: '/admin/expenses', iconName: 'Wallet' },
  { id: 'discounts', label: 'Discounts', href: '/admin/discounts', iconName: 'Tag' },
  { id: 'website', label: 'Website', href: '/admin/website', iconName: 'Globe' },
  { id: 'reports', label: 'Reports', href: '/admin/reports', iconName: 'BarChart3' },
  { id: 'settings', label: 'Settings', href: '/admin/settings', iconName: 'Settings' },
] as const;
