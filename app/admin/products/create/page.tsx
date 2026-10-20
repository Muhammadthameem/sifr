import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getSelectableCategories } from '@/lib/actions/category-actions';
import { getAdminProducts } from '@/lib/actions/product-actions';
import { ProductForm } from '@/components/admin/ProductForm';

export default async function CreateProductPage() {
  await requireAdminAuth();

  const [categories, products] = await Promise.all([
    getSelectableCategories(),
    getAdminProducts(),
  ]);

  return (
    <ProductForm
      categories={categories}
      existingProducts={products.map((p) => ({ id: p.id, name: p.name, slug: p.slug, status: p.status }))}
    />
  );
}
