import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { Layers } from 'lucide-react';

interface AdminPagePlaceholderProps {
  title: string;
  description: string;
}

export async function AdminPagePlaceholder({ title, description }: AdminPagePlaceholderProps) {
  await requireAdminAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-3">
          <Layers className="w-6 h-6 text-neutral-500" />
          <span>{title}</span>
        </h1>
        <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
          {description}
        </p>
      </div>

      <div className="p-8 rounded-2xl border border-neutral-800 bg-neutral-900/30 text-center space-y-4 max-w-2xl">
        <div className="inline-flex p-3 rounded-xl bg-neutral-900 text-neutral-400 border border-neutral-800">
          <Layers className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-mono tracking-widest text-neutral-300 uppercase">
          Structural Navigation Placeholder
        </h3>
        <p className="text-xs text-neutral-400 font-light leading-relaxed">
          The navigation endpoint for <strong className="text-white">{title}</strong> has been established in Phase 1. Business operations and data management for this module will be implemented in subsequent phases.
        </p>
        <div className="inline-block px-3 py-1 rounded text-[10px] font-mono tracking-wider bg-neutral-800 text-neutral-400 border border-neutral-700">
          STATUS: PHASE 1 STRUCTURAL PLACEHOLDER
        </div>
      </div>
    </div>
  );
}
