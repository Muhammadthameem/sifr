'use client';

import React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

interface CategoryTabsProps {
  categories: { id: string; name: string; slug: string }[];
  activeCategorySlug?: string;
}

export function CategoryTabs({ categories, activeCategorySlug }: CategoryTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const currentCategory = activeCategorySlug || searchParams.get('category') || 'all';

  const handleSelectTab = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (slug === 'all') {
      params.delete('category');
    } else {
      params.set('category', slug);
    }
    // Reset to page 1 on filter change
    params.delete('page');

    const newUrl = `${pathname}?${params.toString()}`;
    router.push(newUrl, { scroll: false });
  };

  // Preset tabs plus database categories
  const allTabs = [
    { name: 'ALL', slug: 'all' },
    ...categories.map((c) => ({
      name: c.name.toUpperCase(),
      slug: c.slug,
    })),
  ];

  // Deduplicate tabs by slug
  const uniqueTabs = allTabs.filter(
    (tab, index, self) => index === self.findIndex((t) => t.slug === tab.slug)
  );

  return (
    <div className="py-4 border-b border-neutral-200/60 overflow-x-auto scrollbar-none">
      <div className="flex items-center space-x-6 sm:space-x-8 min-w-max text-xs font-mono tracking-widest uppercase">
        {uniqueTabs.map((tab) => {
          const isActive = currentCategory.toLowerCase() === tab.slug.toLowerCase();
          return (
            <button
              key={tab.slug}
              onClick={() => handleSelectTab(tab.slug)}
              className={`pb-1 transition-all duration-200 relative ${
                isActive
                  ? 'text-neutral-900 font-bold border-b-2 border-neutral-900'
                  : 'text-neutral-400 hover:text-neutral-700 border-b-2 border-transparent'
              }`}
            >
              {tab.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
