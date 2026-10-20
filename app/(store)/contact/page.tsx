import React from 'react';
import { getStoreSettings } from '@/lib/settings/settings-service';
import { Mail, Phone, MapPin, MessageSquare } from 'lucide-react';

export default async function ContactPage() {
  const settings = await getStoreSettings();
  const cleanPhone = settings.whatsAppNumber.replace(/[^0-9]/g, '');
  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(settings.whatsAppGreeting)}`;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-10">
      <div className="space-y-3">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
          Contact Us
        </h1>
        <p className="text-base text-neutral-600 font-sans leading-relaxed">
          Get in touch with the {settings.businessName} team. We are here to assist with styling, sizing, and order queries.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-[#FAFAF8] border border-neutral-200 rounded-xl p-6 space-y-6">
          <h2 className="text-sm font-mono font-semibold tracking-wider text-neutral-900 uppercase">
            Direct Assistance
          </h2>

          <div className="space-y-4 text-sm text-neutral-700">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-neutral-400 shrink-0" />
              <div>
                <span className="block text-xs font-mono text-neutral-400">Email</span>
                <a href={`mailto:${settings.email}`} className="font-medium text-neutral-900 hover:underline">
                  {settings.email}
                </a>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-neutral-400 shrink-0" />
              <div>
                <span className="block text-xs font-mono text-neutral-400">Phone</span>
                <a href={`tel:${settings.phone.replace(/[^0-9+]/g, '')}`} className="font-medium text-neutral-900 hover:underline">
                  {settings.phone}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
              <div>
                <span className="block text-xs font-mono text-neutral-400">Location</span>
                <span className="font-medium text-neutral-900">{settings.address}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#FAFAF8] border border-neutral-200 rounded-xl p-6 space-y-6 flex flex-col justify-between">
          <div className="space-y-3">
            <h2 className="text-sm font-mono font-semibold tracking-wider text-neutral-900 uppercase">
              Instant Chat on WhatsApp
            </h2>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Connect directly with our customer concierge on WhatsApp. We answer questions about products, fabric specifications, and custom requirements in real time.
            </p>
          </div>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2.5 px-6 py-3 bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-mono uppercase tracking-wider rounded-md shadow-sm transition-all"
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>Start WhatsApp Chat</span>
          </a>
        </div>
      </div>
    </div>
  );
}
