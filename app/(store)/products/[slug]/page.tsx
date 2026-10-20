import React from 'react';
import { getStorefrontProductBySlug, getStorefrontProducts } from '@/lib/actions/product-actions';
import { notFound } from 'next/navigation';
import { ProductDetailView } from '@/components/store/ProductDetailView';

export const revalidate = 0; // Dynamic server rendering for storefront PDP

export default async function ProductDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const product = await getStorefrontProductBySlug(params.slug);

  if (!product || product.status !== 'ACTIVE') {
    notFound();
  }

  // Fetch related active products from the same category
  const allCategoryProducts = await getStorefrontProducts(undefined, product.category.slug);
  const relatedProducts = allCategoryProducts.filter((p) => p.id !== product.id).slice(0, 4);

  return (
    <ProductDetailView
      product={product as any}
      relatedProducts={relatedProducts as any[]}
    />
  );
}
