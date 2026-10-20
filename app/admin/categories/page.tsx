import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getCategories } from '@/lib/actions/category-actions';
import { CategoryManager } from '@/components/admin/CategoryManager';

export default async function CategoriesAdminPage() {
  await requireAdminAuth();
  const categories = await getCategories();

  return <CategoryManager initialCategories={categories as any} />;
}
