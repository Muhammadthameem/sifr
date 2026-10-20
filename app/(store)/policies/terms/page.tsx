import React from 'react';
import { getStoreSettings } from '@/lib/settings/settings-service';

export default async function TermsPage() {
  const settings = await getStoreSettings();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-8">
      <div className="space-y-3">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
          Terms & Conditions
        </h1>
        <p className="text-xs font-mono text-neutral-500 uppercase tracking-wider">
          {settings.businessName} • Updated {new Date().getFullYear()}
        </p>
      </div>

      <div className="space-y-6 text-sm text-neutral-700 leading-relaxed font-sans">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-neutral-900 font-serif">1. Ordering & Order Confirmation</h2>
          <p>
            Orders placed on {settings.businessName} are submitted over WhatsApp. Submitting an order request establishes contact with our sales team. Stock, pricing, and shipping charges are validated before confirmation. No sale is finalized until our team confirms your order.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-neutral-900 font-serif">2. Payments & Pricing</h2>
          <p>
            All prices are listed in Indian Rupees (INR). Payment can be completed using approved methods including Cash on Delivery (COD) or UPI as confirmed by our sales team.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-neutral-900 font-serif">3. Governing Law</h2>
          <p>
            These terms are governed by the laws of India. For support, please reach out to{' '}
            <a href={`mailto:${settings.email}`} className="text-neutral-900 underline">
              {settings.email}
            </a>.
          </p>
        </section>
      </div>
    </div>
  );
}
