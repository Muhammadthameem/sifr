'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, UserCheck, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface AdminHeaderProps {
  userEmail?: string;
}

export function AdminHeader({ userEmail = 'admin@sifr.in' }: AdminHeaderProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
      router.push('/admin/login');
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  };

  return (
    <header className="h-16 bg-neutral-900/90 backdrop-blur-md border-b border-neutral-800 px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center space-x-3">
        <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider">
          Single-Brand Platform
        </span>
      </div>

      <div className="flex items-center space-x-4">
        {/* Storefront Link */}
        <Link
          href="/"
          target="_blank"
          className="inline-flex items-center space-x-1.5 text-xs text-neutral-400 hover:text-white transition-colors py-1.5 px-3 rounded-md hover:bg-neutral-800 border border-transparent hover:border-neutral-700"
        >
          <span>View Storefront</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>

        <div className="h-4 w-[1px] bg-neutral-800" />

        {/* Admin User Info */}
        <div className="flex items-center space-x-2 text-xs text-neutral-300">
          <UserCheck className="w-4 h-4 text-emerald-400" />
          <span className="font-mono text-neutral-200">{userEmail}</span>
        </div>

        {/* Logout Button */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="inline-flex items-center space-x-1.5 text-xs text-neutral-400 hover:text-rose-400 transition-colors py-1.5 px-3 rounded-md hover:bg-rose-950/30 border border-transparent hover:border-rose-900/50"
          id="admin-logout-btn"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>{loggingOut ? 'Logging out...' : 'Logout'}</span>
        </button>
      </div>
    </header>
  );
}
