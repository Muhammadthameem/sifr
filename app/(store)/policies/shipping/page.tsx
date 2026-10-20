import React from 'react';
import { getStoreSettings } from '@/lib/settings/settings-service';

export default async function ShippingPolicyPage() {
  const settings = await getStoreSettings();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-8">
      <div className="space-y-3">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
          Shipping & Delivery Policy
        </h1>
        <p className="text-xs font-mono text-neutral-500 uppercase tracking-wider">
          {settings.businessName} • Updated {new Date().getFullYear()}
        </p>
      </div>

      <div className="space-y-6 text-sm text-neutral-700 leading-relaxed font-sans">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-neutral-900 font-serif">1. Shipping Coverage</h2>
          <p>
            {settings.businessName} delivers across India via trusted courier partners including Blue Dart, Delhivery, and DTDC. Delivery timelines typically range from 3 to 7 business days from dispatch.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-neutral-900 font-serif">2. Shipping Charges & Capping</h2>
          <p>
            Shipping fees are calculated transparently per item and capped at a maximum of ₹{settings.globalShippingCap.toFixed(2)} per order, regardless of total parcel weight or item count.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-neutral-900 font-serif">3. Tracking Your Order</h2>
          <p>
            Once your order is dispatched, tracking details and courier links will be shared directly with you via WhatsApp. For any inquiries, reach us at{' '}
            <a href={`mailto:${settings.email}`} className="text-neutral-900 underline">
              {settings.email}
            </a>.
          </p>
        </section>
      </div>
    </div>
  );
}
