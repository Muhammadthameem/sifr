'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BRAND_CONFIG } from '@/lib/constants/brand';
import { ShieldCheck, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectFrom = searchParams.get('from') || '/admin/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Invalid credentials. Please check your email and password.');
        setLoading(false);
        return;
      }

      router.push(redirectFrom);
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-8">
      {/* Brand Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-white shadow-lg">
          <ShieldCheck className="w-8 h-8 text-neutral-200" />
        </div>
        <h1 className="font-serif text-3xl tracking-[0.2em] font-light text-white uppercase">
          {BRAND_CONFIG.name}
        </h1>
        <p className="text-xs text-neutral-400 font-mono tracking-widest uppercase">
          Owner Commerce Management Platform
        </p>
      </div>

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="bg-neutral-900/80 border border-neutral-800 p-8 rounded-2xl space-y-6 shadow-2xl backdrop-blur-xl">
        {error && (
          <div className="flex items-start space-x-3 p-4 rounded-lg bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-mono tracking-wider uppercase text-neutral-400 mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@sifr.in"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
                id="admin-email-input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono tracking-wider uppercase text-neutral-400 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
                id="admin-password-input"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-lg bg-white text-black font-medium text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors disabled:opacity-50"
          id="admin-login-submit-btn"
        >
          <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {/* Footer Info */}
      <div className="text-center text-[11px] font-mono text-neutral-600 uppercase tracking-widest">
        Single Owner Access • Protected Area
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-md text-center text-xs font-mono text-neutral-500 uppercase tracking-widest">Loading...</div>}>
      <AdminLoginForm />
    </Suspense>
  );
}
