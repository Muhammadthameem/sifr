import React from 'react';
import Link from 'next/link';
import { BRAND_CONFIG } from '@/lib/constants/brand';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 mb-6">
        <FileQuestion className="w-10 h-10 text-neutral-400" />
      </div>

      <h1 className="font-serif text-3xl font-light tracking-[0.2em] uppercase mb-2">
        404 — Page Not Found
      </h1>

      <p className="max-w-md text-xs font-mono text-neutral-400 uppercase tracking-widest mb-8">
        The page you are looking for does not exist on {BRAND_CONFIG.name}.
      </p>

      <Link
        href="/"
        className="inline-flex items-center space-x-2 px-6 py-3 rounded-lg bg-white text-black font-medium text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Storefront</span>
      </Link>
    </div>
  );
}
