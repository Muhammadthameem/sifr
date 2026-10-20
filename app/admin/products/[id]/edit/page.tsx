import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getProductById, getAdminProducts } from '@/lib/actions/product-actions';
import { getSelectableCategories } from '@/lib/actions/category-actions';
import { notFound } from 'next/navigation';
import { ProductForm } from '@/components/admin/ProductForm';

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminAuth();

  const [product, categories, products] = await Promise.all([
    getProductById(params.id),
    getSelectableCategories(),
    getAdminProducts(),
  ]);

  if (!product) {
    notFound();
  }

  // Preserve existing product category in option list if not currently selectable
  const isCategoryInSelectable = categories.some((c) => c.id === product.categoryId);
  let finalCategories = categories;

  if (!isCategoryInSelectable && product.category) {
    const cat = product.category as any;
    const label = `${cat.name} (Parent/Inactive — Please Reassign)`;
    finalCategories = [
      {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        parentId: cat.parentId,
        parentName: undefined,
        label,
      },
      ...categories,
    ];
  }

  const serializedProduct = {
    ...product,
    shippingCharge: product.shippingCharge != null ? Number(product.shippingCharge) : 0,
    variants: product.variants.map((v) => ({
      ...v,
      costPrice: v.costPrice != null ? Number(v.costPrice) : null,
      mrp: Number(v.mrp),
      sellingPrice: Number(v.sellingPrice),
    })),
  };

  return (
    <ProductForm
      initialData={serializedProduct}
      categories={finalCategories}
      existingProducts={products.map((p) => ({ id: p.id, name: p.name, slug: p.slug, status: p.status }))}
    />
  );
}
