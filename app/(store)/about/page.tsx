import React from 'react';
import { getStoreSettings } from '@/lib/settings/settings-service';
import Link from 'next/link';

export default async function AboutPage() {
  const settings = await getStoreSettings();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-8">
      <div className="space-y-3">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
          About {settings.businessName}
        </h1>
        <p className="text-base text-neutral-600 font-sans leading-relaxed">
          {settings.tagline}
        </p>
      </div>

      <div className="prose prose-neutral max-w-none space-y-6 text-sm sm:text-base text-neutral-700 leading-relaxed">
        <p>
          Welcome to {settings.businessName}. We curate timeless contemporary fashion and essentials crafted with uncompromising attention to detail, fabric quality, and mindful design.
        </p>
        <p>
          Our platform operates with personal attention — orders are confirmed with our dedicated team over WhatsApp before you make any payment. We verify exact stock, garment sizing, and delivery timelines to provide a personalized shopping experience.
        </p>
        <p>
          If you have any questions or bespoke requests, reach out to us at{' '}
          <a href={`mailto:${settings.email}`} className="text-neutral-900 underline underline-offset-4">
            {settings.email}
          </a>{' '}
          or chat with us directly on WhatsApp.
        </p>
      </div>

      <div className="pt-6 border-t border-neutral-200 flex gap-4">
        <Link
          href="/shop"
          className="px-6 py-3 bg-neutral-900 text-white text-xs font-mono uppercase tracking-wider rounded-md hover:bg-neutral-800 transition-colors"
        >
          Explore Collection
        </Link>
      </div>
    </div>
  );
}
