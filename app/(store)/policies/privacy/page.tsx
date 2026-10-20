import React from 'react';
import { getStoreSettings } from '@/lib/settings/settings-service';

export default async function PrivacyPolicyPage() {
  const settings = await getStoreSettings();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-8">
      <div className="space-y-3">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
          Privacy Policy
        </h1>
        <p className="text-xs font-mono text-neutral-500 uppercase tracking-wider">
          {settings.businessName} • Updated {new Date().getFullYear()}
        </p>
      </div>

      <div className="space-y-6 text-sm text-neutral-700 leading-relaxed font-sans">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-neutral-900 font-serif">1. Information We Collect</h2>
          <p>
            When you interact with {settings.businessName} or submit an order request over WhatsApp, we collect details necessary to process and deliver your items: your name, shipping address, contact phone number, and optional email address.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-neutral-900 font-serif">2. How We Use Your Information</h2>
          <p>
            We use your information exclusively to fulfill order requests, communicate shipment updates, provide tracking information via WhatsApp, and deliver exceptional customer care. We never sell your personal information to third parties.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-neutral-900 font-serif">3. Contact Us</h2>
          <p>
            If you have questions regarding this Privacy Policy or your personal data, contact us at{' '}
            <a href={`mailto:${settings.email}`} className="text-neutral-900 underline">
              {settings.email}
            </a>.
          </p>
        </section>
      </div>
    </div>
  );
}
