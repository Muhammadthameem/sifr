import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getAdminProducts } from '@/lib/actions/product-actions';
import { getActiveCategories } from '@/lib/actions/category-actions';
import { ProductListManager } from '@/components/admin/ProductListManager';

export default async function ProductsAdminPage() {
  await requireAdminAuth();

  const [products, categories] = await Promise.all([
    getAdminProducts(),
    getActiveCategories(),
  ]);

  const serializedProducts = products.map((p) => ({
    ...p,
    shippingCharge: p.shippingCharge != null ? Number(p.shippingCharge) : 0,
    variants: p.variants.map((v) => ({
      ...v,
      sellingPrice: Number(v.sellingPrice),
      mrp: Number(v.mrp),
    })),
  }));

  return (
    <ProductListManager
      initialProducts={serializedProducts as any}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
