'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error internally without exposing sensitive details to the UI
    console.error('[SIFR Application Error]:', error.message);
  }, [error]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-900/60 mb-6 text-rose-400">
        <AlertTriangle className="w-10 h-10" />
      </div>

      <h1 className="font-serif text-2xl font-light tracking-[0.2em] uppercase mb-2">
        Something Went Wrong
      </h1>

      <p className="max-w-md text-xs font-mono text-neutral-400 uppercase tracking-wider mb-8">
        An unexpected application error occurred. No internal credentials or trace details were exposed.
      </p>

      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex items-center space-x-2 px-6 py-3 rounded-lg bg-neutral-800 text-white border border-neutral-700 font-medium text-xs tracking-widest uppercase hover:bg-neutral-700 transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        <span>Try Again</span>
      </button>
    </div>
  );
}
