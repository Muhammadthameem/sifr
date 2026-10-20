import React from 'react';
import { StoreHeader } from '@/components/store/StoreHeader';
import { StoreFooter } from '@/components/store/StoreFooter';
import { getActiveCategoryTree } from '@/lib/actions/category-actions';

import { getStoreSettings } from '@/lib/settings/settings-service';

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categoryTree, settings] = await Promise.all([
    getActiveCategoryTree(),
    getStoreSettings(),
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-white text-neutral-900 selection:bg-neutral-900 selection:text-white">
      <StoreHeader categoryTree={categoryTree} />
      <main className="flex-1">{children}</main>
      <StoreFooter settings={settings} />
    </div>
  );
}
