'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Mail, Phone, MapPin } from 'lucide-react';
import { StoreSettingsData, DEFAULT_STORE_SETTINGS } from '@/lib/settings/settings-service';

function InstagramIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function FacebookIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function YouTubeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function WhatsAppIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

interface StoreFooterProps {
  settings?: StoreSettingsData | null;
}

export function StoreFooter({ settings }: StoreFooterProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (sectionKey: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const businessName = settings?.businessName || DEFAULT_STORE_SETTINGS.businessName;
  const tagline = settings?.tagline || DEFAULT_STORE_SETTINGS.tagline;
  const email = settings?.email || DEFAULT_STORE_SETTINGS.email;
  const phone = settings?.phone || DEFAULT_STORE_SETTINGS.phone;
  const address = settings?.address || DEFAULT_STORE_SETTINGS.address;
  const rawWhatsApp = settings?.whatsAppNumber || DEFAULT_STORE_SETTINGS.whatsAppNumber;
  const cleanWhatsAppNumber = rawWhatsApp.replace(/[^0-9]/g, '');
  const greeting = settings?.whatsAppGreeting || DEFAULT_STORE_SETTINGS.whatsAppGreeting;
  const whatsAppChatUrl = `https://wa.me/${cleanWhatsAppNumber}?text=${encodeURIComponent(greeting)}`;

  const cleanPhoneForTel = phone.replace(/[^0-9+]/g, '');

  const instagramUrl = settings?.instagramUrl?.trim() || null;
  const facebookUrl = settings?.facebookUrl?.trim() || null;
  const youtubeUrl = settings?.youtubeUrl?.trim() || null;

  const shopLinks = [
    { label: 'All Products', href: '/shop' },
    { label: 'New Arrivals', href: '/shop' },
    { label: 'Your Cart', href: '/cart' },
  ];

  const policyLinks = [
    { label: 'Privacy Policy', href: '/policies/privacy' },
    { label: 'Terms & Conditions', href: '/policies/terms' },
    { label: 'Refund & Returns', href: '/returns' },
    { label: 'Shipping & Delivery', href: '/policies/shipping' },
  ];

  const companyLinks = [
    { label: 'About Us', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ];

  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#FAFAF8] text-neutral-900 border-t border-[#EAEAEA] pt-16 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Main 5-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-10">
          {/* Column 1: Brand */}
          <div className="space-y-4 lg:col-span-1">
            <Link
              href="/"
              className="font-serif text-2xl tracking-[0.25em] font-semibold text-neutral-900 uppercase block hover:opacity-80 transition-opacity"
              id="footer-brand-title"
            >
              {businessName}
            </Link>
            <p className="text-xs text-neutral-500 leading-relaxed max-w-xs font-sans">
              {tagline}
            </p>

            {/* Recognizable Social Media Icons */}
            {(instagramUrl || facebookUrl || youtubeUrl) && (
              <div className="flex items-center space-x-3 pt-2">
                {instagramUrl && (
                  <a
                    href={instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="w-8 h-8 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:border-neutral-900 transition-colors"
                  >
                    <InstagramIcon className="w-4 h-4" />
                  </a>
                )}
                {facebookUrl && (
                  <a
                    href={facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Facebook"
                    className="w-8 h-8 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:border-neutral-900 transition-colors"
                  >
                    <FacebookIcon className="w-4 h-4" />
                  </a>
                )}
                {youtubeUrl && (
                  <a
                    href={youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="YouTube"
                    className="w-8 h-8 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:border-neutral-900 transition-colors"
                  >
                    <YouTubeIcon className="w-4 h-4" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Column 2: Shop */}
          <div className="border-b border-neutral-200 sm:border-none pb-4 sm:pb-0">
            <button
              type="button"
              onClick={() => toggleSection('shop')}
              className="w-full flex items-center justify-between sm:cursor-default py-2 sm:py-0 text-xs font-mono font-semibold tracking-[0.2em] text-neutral-900 uppercase focus-visible:outline-none"
              aria-expanded={!!openSections['shop']}
            >
              <span>SHOP</span>
              <ChevronDown
                className={`w-4 h-4 text-neutral-500 sm:hidden transition-transform duration-200 ${
                  openSections['shop'] ? 'rotate-180' : ''
                }`}
              />
            </button>
            <ul
              className={`mt-3 space-y-2.5 text-xs text-neutral-600 sm:block ${
                openSections['shop'] ? 'block' : 'hidden'
              }`}
            >
              {shopLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="hover:text-neutral-900 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Policies */}
          <div className="border-b border-neutral-200 sm:border-none pb-4 sm:pb-0">
            <button
              type="button"
              onClick={() => toggleSection('policies')}
              className="w-full flex items-center justify-between sm:cursor-default py-2 sm:py-0 text-xs font-mono font-semibold tracking-[0.2em] text-neutral-900 uppercase focus-visible:outline-none"
              aria-expanded={!!openSections['policies']}
            >
              <span>POLICIES</span>
              <ChevronDown
                className={`w-4 h-4 text-neutral-500 sm:hidden transition-transform duration-200 ${
                  openSections['policies'] ? 'rotate-180' : ''
                }`}
              />
            </button>
            <ul
              className={`mt-3 space-y-2.5 text-xs text-neutral-600 sm:block ${
                openSections['policies'] ? 'block' : 'hidden'
              }`}
            >
              {policyLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="hover:text-neutral-900 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Company */}
          <div className="border-b border-neutral-200 sm:border-none pb-4 sm:pb-0">
            <button
              type="button"
              onClick={() => toggleSection('company')}
              className="w-full flex items-center justify-between sm:cursor-default py-2 sm:py-0 text-xs font-mono font-semibold tracking-[0.2em] text-neutral-900 uppercase focus-visible:outline-none"
              aria-expanded={!!openSections['company']}
            >
              <span>COMPANY</span>
              <ChevronDown
                className={`w-4 h-4 text-neutral-500 sm:hidden transition-transform duration-200 ${
                  openSections['company'] ? 'rotate-180' : ''
                }`}
              />
            </button>
            <ul
              className={`mt-3 space-y-2.5 text-xs text-neutral-600 sm:block ${
                openSections['company'] ? 'block' : 'hidden'
              }`}
            >
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="hover:text-neutral-900 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 5: Get in Touch */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-mono font-semibold tracking-[0.2em] text-neutral-900 uppercase">
              GET IN TOUCH
            </h4>

            {/* Chat on WhatsApp CTA Button */}
            <div>
              <a
                href={whatsAppChatUrl}
                target="_blank"
                rel="noopener noreferrer"
                id="footer-whatsapp-chat-btn"
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-medium rounded-md shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2"
              >
                <WhatsAppIcon className="w-4 h-4 shrink-0" />
                <span>Chat on WhatsApp</span>
              </a>
            </div>

            {/* Contact Details */}
            <div className="space-y-2 text-xs text-neutral-600 pt-1">
              <a
                href={`mailto:${email}`}
                className="flex items-center gap-2 hover:text-neutral-900 transition-colors"
                id="footer-contact-email"
              >
                <Mail className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span>{email}</span>
              </a>

              <a
                href={`tel:${cleanPhoneForTel}`}
                className="flex items-center gap-2 hover:text-neutral-900 transition-colors"
                id="footer-contact-phone"
              >
                <Phone className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span>{phone}</span>
              </a>

              <div className="flex items-start gap-2" id="footer-contact-address">
                <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                <span className="leading-tight">{address}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright & WhatsApp Ordering Notice */}
        <div className="pt-8 border-t border-neutral-200 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-neutral-500 font-sans">
          <p id="footer-copyright-text">
            © {currentYear} {businessName}. All rights reserved.
          </p>

          <p className="text-center md:text-right font-medium text-neutral-600 max-w-md" id="footer-whatsapp-notice">
            Orders are taken over WhatsApp — we confirm stock and shipping before you pay.
          </p>
        </div>
      </div>
    </footer>
  );
}
