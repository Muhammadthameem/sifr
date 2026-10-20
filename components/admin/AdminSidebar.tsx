'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_NAV_SECTIONS, BRAND_CONFIG } from '@/lib/constants/brand';
import { cn } from '@/lib/utils/cn';
import {
  LayoutDashboard,
  Shirt,
  FolderTree,
  Boxes,
  ShoppingBag,
  Building2,
  Receipt,
  Store,
  Users,
  RotateCcw,
  Tag,
  Globe,
  BarChart3,
  Settings,
  CreditCard,
  Wallet,
} from 'lucide-react';

const ICON_MAP = {
  LayoutDashboard,
  Shirt,
  FolderTree,
  Boxes,
  ShoppingBag,
  Building2,
  Receipt,
  CreditCard,
  Store,
  Users,
  RotateCcw,
  Wallet,
  Tag,
  Globe,
  BarChart3,
  Settings,
} as const;

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-neutral-900 border-r border-neutral-800 flex flex-col flex-shrink-0 h-screen sticky top-0">
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center border-b border-neutral-800">
        <Link href="/admin/dashboard" className="flex items-center space-x-3">
          <span className="font-serif text-xl tracking-[0.2em] font-semibold text-white uppercase">
            {BRAND_CONFIG.name}
          </span>
          <span className="text-[10px] font-mono tracking-widest bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded border border-neutral-700">
            ADMIN
          </span>
        </Link>
      </div>

      {/* Navigation list */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
        <div className="px-3 pb-2 text-[10px] font-mono tracking-widest uppercase text-neutral-500">
          Platform Management
        </div>

        {ADMIN_NAV_SECTIONS.map((section) => {
          const Icon = ICON_MAP[section.iconName as keyof typeof ICON_MAP] || LayoutDashboard;
          const isActive = pathname === section.href || pathname?.startsWith(`${section.href}/`);

          return (
            <Link
              key={section.id}
              href={section.href}
              className={cn(
                'flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium tracking-wide transition-all duration-150',
                isActive
                  ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700/60'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
              )}
              id={`admin-nav-${section.id}`}
            >
              <Icon className={cn('w-4 h-4', isActive ? 'text-white' : 'text-neutral-500')} />
              <span>{section.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Footer / System Status */}
      <div className="p-4 border-t border-neutral-800 bg-neutral-950/40">
        <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
          <span>Version</span>
          <span className="text-neutral-400">1.0.0-Phase1</span>
        </div>
      </div>
    </aside>
  );
}
