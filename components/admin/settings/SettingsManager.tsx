'use client';

import React, { useState } from 'react';
import {
  StoreSettingsData,
  renderNotificationTemplate,
} from '@/lib/settings/settings-service';
import { updateAdminSettingsAction } from '@/lib/actions/settings-actions';
import { isValidIndiaMobile, normalizeIndiaMobile } from '@/lib/validation/mobile';
import {
  Save,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  Building,
  Mail,
  Share2,
  Truck,
  Bell,
  RefreshCw,
} from 'lucide-react';

interface SettingsManagerProps {
  initialSettings: StoreSettingsData;
}

export function SettingsManager({ initialSettings }: SettingsManagerProps) {
  const [settings, setSettings] = useState<StoreSettingsData>(initialSettings);
  const [formData, setFormData] = useState({
    businessName: initialSettings.businessName,
    storeDomain: initialSettings.storeDomain,
    tagline: initialSettings.tagline,
    whatsAppNumber: initialSettings.whatsAppNumber,
    whatsAppGreeting: initialSettings.whatsAppGreeting,
    email: initialSettings.email,
    phone: initialSettings.phone,
    address: initialSettings.address,
    instagramUrl: initialSettings.instagramUrl || '',
    facebookUrl: initialSettings.facebookUrl || '',
    youtubeUrl: initialSettings.youtubeUrl || '',
    confirmedOrderTemplate: initialSettings.confirmedOrderTemplate,
    shippedOrderTemplate: initialSettings.shippedOrderTemplate,
    contactedOrderTemplate: initialSettings.contactedOrderTemplate,
    cancelledOrderTemplate: initialSettings.cancelledOrderTemplate,
    globalShippingCap: initialSettings.globalShippingCap,
  });

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Active section tab for clean organization
  const [activeTab, setActiveTab] = useState<'all' | 'whatsapp' | 'business' | 'contact' | 'social' | 'shipping' | 'templates'>('all');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'globalShippingCap' ? parseFloat(value) || 0 : value,
    }));
  };

  // Live WhatsApp number calculation & validation
  const isMobileValid = isValidIndiaMobile(formData.whatsAppNumber);
  let normalizedPreview = '';
  let waCleanDigits = '';
  try {
    if (isMobileValid) {
      normalizedPreview = normalizeIndiaMobile(formData.whatsAppNumber);
      waCleanDigits = normalizedPreview.replace(/[^0-9]/g, '');
    }
  } catch {
    // fallback
  }

  const liveWaUrl = waCleanDigits
    ? `https://wa.me/${waCleanDigits}?text=${encodeURIComponent(formData.whatsAppGreeting)}`
    : '';

  // Sample data for template previews
  const sampleTemplateVars = {
    name: 'Amina Khan',
    order_code: 'WA-20261006-0042',
    order_url: `https://${formData.storeDomain || 'sifr.in'}/orders/WA-20261006-0042`,
    courier: 'Blue Dart Express',
    tracking_id: 'BD-88992200',
    tracking_url: 'https://bluedart.com/track/BD-88992200',
    store_name: formData.businessName || 'SIFR',
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    // Validate WhatsApp number
    if (!isValidIndiaMobile(formData.whatsAppNumber)) {
      setStatusMessage({
        type: 'error',
        text: 'Invalid WhatsApp number. Please enter a valid 10-digit Indian mobile number (e.g. 9876543210 or +919876543210).',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await updateAdminSettingsAction({
        businessName: formData.businessName,
        storeDomain: formData.storeDomain,
        tagline: formData.tagline,
        whatsAppNumber: formData.whatsAppNumber,
        whatsAppGreeting: formData.whatsAppGreeting,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        instagramUrl: formData.instagramUrl || null,
        facebookUrl: formData.facebookUrl || null,
        youtubeUrl: formData.youtubeUrl || null,
        confirmedOrderTemplate: formData.confirmedOrderTemplate,
        shippedOrderTemplate: formData.shippedOrderTemplate,
        contactedOrderTemplate: formData.contactedOrderTemplate,
        cancelledOrderTemplate: formData.cancelledOrderTemplate,
        globalShippingCap: Number(formData.globalShippingCap),
      });

      if (res.success && res.settings) {
        setSettings(res.settings);
        setFormData((prev) => ({
          ...prev,
          whatsAppNumber: res.settings!.whatsAppNumber,
        }));
        setStatusMessage({
          type: 'success',
          text: 'Settings saved successfully and propagated across storefront and WhatsApp flows.',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to save settings.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'An unexpected error occurred while saving.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Header & Save Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <h1 className="text-2xl font-serif font-bold text-neutral-900 tracking-tight">
            Store Settings
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Centralized configuration for WhatsApp ordering, brand identity, contact channels, and notification templates.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          id="btn-save-settings"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-mono tracking-wider uppercase rounded-md shadow-sm transition-all disabled:opacity-50"
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Save Settings</span>
            </>
          )}
        </button>
      </div>

      {/* Status Feedback Banners */}
      {statusMessage && (
        <div
          id="settings-status-banner"
          className={`p-4 rounded-lg flex items-start gap-3 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="text-sm font-medium">{statusMessage.text}</div>
        </div>
      )}

      {/* Navigation Filter Pills */}
      <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-3">
        {[
          { id: 'all', label: 'All Settings' },
          { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
          { id: 'business', label: 'Business Profile', icon: Building },
          { id: 'contact', label: 'Contact', icon: Mail },
          { id: 'social', label: 'Social Media', icon: Share2 },
          { id: 'shipping', label: 'Shipping Cap', icon: Truck },
          { id: 'templates', label: 'Notification Templates', icon: Bell },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3.5 py-1.5 text-xs font-mono rounded-full transition-colors ${
              activeTab === tab.id
                ? 'bg-neutral-900 text-white font-medium'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* SECTION 1: WhatsApp Configuration */}
        {(activeTab === 'all' || activeTab === 'whatsapp') && (
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-neutral-100 pb-4">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-900">WhatsApp Ordering</h2>
                <p className="text-xs text-neutral-500">
                  Target business phone number and default customer message for WhatsApp orders.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase mb-1">
                  Business WhatsApp Number *
                </label>
                <input
                  type="text"
                  name="whatsAppNumber"
                  id="input-whatsapp-number"
                  value={formData.whatsAppNumber}
                  onChange={handleChange}
                  placeholder="e.g. 9876543210 or +919876543210"
                  className={`w-full px-3.5 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 ${
                    isMobileValid
                      ? 'border-neutral-300 focus:ring-neutral-900'
                      : 'border-red-300 bg-red-50/30 text-red-900 focus:ring-red-500'
                  }`}
                  required
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Indian 10-digit mobile number (starts with 6, 7, 8, or 9).
                </p>
                {normalizedPreview && (
                  <div className="mt-2 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded inline-flex items-center gap-1.5 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Normalized: {normalizedPreview}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase mb-1">
                  Default Greeting Line *
                </label>
                <input
                  type="text"
                  name="whatsAppGreeting"
                  id="input-whatsapp-greeting"
                  value={formData.whatsAppGreeting}
                  onChange={handleChange}
                  placeholder="e.g. Hi! I would like to place an order."
                  className="w-full px-3.5 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  required
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Greeting line prefilled when customers click &quot;Chat on WhatsApp&quot;.
                </p>
              </div>
            </div>

            {/* Saved-number preview / wa.me destination */}
            {liveWaUrl && (
              <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium text-neutral-600 uppercase">
                    wa.me Destination Preview
                  </span>
                  <a
                    href={liveWaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    id="link-preview-wame"
                    className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-medium"
                  >
                    <span>Test Destination</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <div className="text-xs font-mono text-neutral-800 bg-white border border-neutral-200 px-3 py-2 rounded break-all select-all">
                  {liveWaUrl}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 2: Business Profile */}
        {(activeTab === 'all' || activeTab === 'business') && (
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-neutral-100 pb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-900">Business Profile</h2>
                <p className="text-xs text-neutral-500">
                  Store name, domain, and branding displayed on storefront headers and footers.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase mb-1">
                  Business Name *
                </label>
                <input
                  type="text"
                  name="businessName"
                  id="input-business-name"
                  value={formData.businessName}
                  onChange={handleChange}
                  placeholder="e.g. SIFR"
                  className="w-full px-3.5 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase mb-1">
                  Store Domain *
                </label>
                <input
                  type="text"
                  name="storeDomain"
                  id="input-store-domain"
                  value={formData.storeDomain}
                  onChange={handleChange}
                  placeholder="e.g. sifr.in"
                  className="w-full px-3.5 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase mb-1">
                  Tagline *
                </label>
                <input
                  type="text"
                  name="tagline"
                  id="input-tagline"
                  value={formData.tagline}
                  onChange={handleChange}
                  placeholder="e.g. Contemporary Fashion & Accessories"
                  className="w-full px-3.5 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  required
                />
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: Contact Details */}
        {(activeTab === 'all' || activeTab === 'contact') && (
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-neutral-100 pb-4">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-900">Contact Information</h2>
                <p className="text-xs text-neutral-500">
                  Customer-facing contact details displayed in the storefront footer &quot;Get in Touch&quot; section.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase mb-1">
                  Support Email *
                </label>
                <input
                  type="email"
                  name="email"
                  id="input-contact-email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="support@sifr.in"
                  className="w-full px-3.5 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase mb-1">
                  Contact Phone *
                </label>
                <input
                  type="text"
                  name="phone"
                  id="input-contact-phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+91 98765 43210"
                  className="w-full px-3.5 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase mb-1">
                  Operating Address *
                </label>
                <input
                  type="text"
                  name="address"
                  id="input-contact-address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="Calicut, Kerala, India"
                  className="w-full px-3.5 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  required
                />
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: Social Media Links */}
        {(activeTab === 'all' || activeTab === 'social') && (
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-neutral-100 pb-4">
              <div className="p-2 bg-pink-50 text-pink-600 rounded-lg">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-900">Social Media</h2>
                <p className="text-xs text-neutral-500">
                  Connect your brand profiles. Blank values are automatically hidden on the storefront footer.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase mb-1">
                  Instagram URL
                </label>
                <input
                  type="url"
                  name="instagramUrl"
                  id="input-instagram-url"
                  value={formData.instagramUrl}
                  onChange={handleChange}
                  placeholder="https://instagram.com/sifr"
                  className="w-full px-3.5 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
                <p className="text-[11px] text-neutral-400 mt-1">Leave blank to hide icon.</p>
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase mb-1">
                  Facebook URL
                </label>
                <input
                  type="url"
                  name="facebookUrl"
                  id="input-facebook-url"
                  value={formData.facebookUrl}
                  onChange={handleChange}
                  placeholder="https://facebook.com/sifr"
                  className="w-full px-3.5 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
                <p className="text-[11px] text-neutral-400 mt-1">Leave blank to hide icon.</p>
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase mb-1">
                  YouTube URL
                </label>
                <input
                  type="url"
                  name="youtubeUrl"
                  id="input-youtube-url"
                  value={formData.youtubeUrl}
                  onChange={handleChange}
                  placeholder="https://youtube.com/@sifr"
                  className="w-full px-3.5 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
                <p className="text-[11px] text-neutral-400 mt-1">Leave blank to hide icon.</p>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 5: Shipping Configuration */}
        {(activeTab === 'all' || activeTab === 'shipping') && (
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-neutral-100 pb-4">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-900">Shipping Configuration</h2>
                <p className="text-xs text-neutral-500">
                  Global shipping charge ceiling applied across WhatsApp orders.
                </p>
              </div>
            </div>

            <div className="max-w-md">
              <label className="block text-xs font-mono font-medium text-neutral-700 uppercase mb-1">
                Global Shipping Cap (₹) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-sm text-neutral-500">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="globalShippingCap"
                  id="input-shipping-cap"
                  value={formData.globalShippingCap}
                  onChange={handleChange}
                  className="w-full pl-8 pr-3.5 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900 font-mono"
                  required
                />
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                Authoritative ceiling for WhatsApp order shipping calculations: MIN(SUM(item shipping charges), shippingCap).
              </p>
            </div>
          </div>
        )}

        {/* SECTION 6: Order Status Notification Templates */}
        {(activeTab === 'all' || activeTab === 'templates') && (
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-neutral-100 pb-4">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-900">Order Notification Templates</h2>
                <p className="text-xs text-neutral-500">
                  Drafting and formatting templates for order lifecycle status updates.
                </p>
              </div>
            </div>

            {/* Tokens Reference Card */}
            <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-lg space-y-2">
              <span className="text-xs font-mono font-semibold text-indigo-950 uppercase">
                Supported Placeholder Tokens:
              </span>
              <div className="flex flex-wrap gap-2 text-xs font-mono">
                {['{name}', '{order_code}', '{order_url}', '{courier}', '{tracking_id}', '{tracking_url}', '{store_name}'].map((tok) => (
                  <code key={tok} className="px-2 py-0.5 bg-white border border-indigo-200 text-indigo-700 rounded text-[11px]">
                    {tok}
                  </code>
                ))}
              </div>
              <p className="text-[11px] text-neutral-500 italic pt-1">
                Note: SIFR Commerce explicitly excludes automatic delivery notifications (ORDER_DELIVERED).
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {/* Confirmed Order Template */}
              <div className="space-y-2">
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase">
                  Confirmed Order Message Template
                </label>
                <textarea
                  name="confirmedOrderTemplate"
                  id="template-confirmed"
                  rows={3}
                  value={formData.confirmedOrderTemplate}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2 border border-neutral-300 rounded-md text-sm font-sans focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
                <div className="text-[11px] text-neutral-500 bg-neutral-50 p-2.5 rounded border border-neutral-200">
                  <span className="font-semibold text-neutral-700">Preview: </span>
                  {renderNotificationTemplate(formData.confirmedOrderTemplate, sampleTemplateVars)}
                </div>
              </div>

              {/* Shipped Order Template */}
              <div className="space-y-2">
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase">
                  Shipped / Dispatched Order Message Template
                </label>
                <textarea
                  name="shippedOrderTemplate"
                  id="template-shipped"
                  rows={3}
                  value={formData.shippedOrderTemplate}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2 border border-neutral-300 rounded-md text-sm font-sans focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
                <div className="text-[11px] text-neutral-500 bg-neutral-50 p-2.5 rounded border border-neutral-200">
                  <span className="font-semibold text-neutral-700">Preview: </span>
                  {renderNotificationTemplate(formData.shippedOrderTemplate, sampleTemplateVars)}
                </div>
              </div>

              {/* Contacted / In-Progress Template */}
              <div className="space-y-2">
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase">
                  Contacted / In-Progress Message Template
                </label>
                <textarea
                  name="contactedOrderTemplate"
                  id="template-contacted"
                  rows={3}
                  value={formData.contactedOrderTemplate}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2 border border-neutral-300 rounded-md text-sm font-sans focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
                <div className="text-[11px] text-neutral-500 bg-neutral-50 p-2.5 rounded border border-neutral-200">
                  <span className="font-semibold text-neutral-700">Preview: </span>
                  {renderNotificationTemplate(formData.contactedOrderTemplate, sampleTemplateVars)}
                </div>
              </div>

              {/* Cancelled Order Template */}
              <div className="space-y-2">
                <label className="block text-xs font-mono font-medium text-neutral-700 uppercase">
                  Cancelled Order Message Template
                </label>
                <textarea
                  name="cancelledOrderTemplate"
                  id="template-cancelled"
                  rows={3}
                  value={formData.cancelledOrderTemplate}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2 border border-neutral-300 rounded-md text-sm font-sans focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
                <div className="text-[11px] text-neutral-500 bg-neutral-50 p-2.5 rounded border border-neutral-200">
                  <span className="font-semibold text-neutral-700">Preview: </span>
                  {renderNotificationTemplate(formData.cancelledOrderTemplate, sampleTemplateVars)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Save Button */}
        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={saving}
            id="btn-save-settings-bottom"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-mono tracking-wider uppercase rounded-md shadow-md transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving Settings...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save All Settings</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
