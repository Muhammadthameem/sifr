import React, { Suspense } from 'react';
import { WhatsAppOrderView } from '@/components/store/WhatsAppOrderView';

export const revalidate = 0; // Dynamic server rendering for checkout flow

interface WhatsAppOrderPageProps {
  searchParams: {
    variantId?: string;
    quantity?: string;
    slug?: string;
    from?: string;
  };
}

export default function WhatsAppOrderPage({ searchParams }: WhatsAppOrderPageProps) {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-24 text-center">
          <div className="inline-block w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">
            Loading WhatsApp Order...
          </p>
        </div>
      }
    >
      <WhatsAppOrderView searchParams={searchParams} />
    </Suspense>
  );
}
