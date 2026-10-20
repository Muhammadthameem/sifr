import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { normalizeIndiaMobile } from '@/lib/validation/mobile';
import { z } from 'zod';

export const DEFAULT_NOTIFICATION_TEMPLATES = {
  confirmedOrderTemplate:
    'Hi {name}, your order #{order_code} has been confirmed by {store_name}! We are preparing it for dispatch. View details: {order_url}',
  shippedOrderTemplate:
    'Hi {name}, your order #{order_code} has been shipped via {courier}. Tracking ID: {tracking_id}. Track here: {tracking_url}',
  contactedOrderTemplate:
    'Hi {name}, thank you for reaching out to {store_name}. We have received your order request #{order_code} and our team will assist you shortly! View: {order_url}',
  cancelledOrderTemplate:
    'Hi {name}, your order #{order_code} with {store_name} has been cancelled. If you have questions, please reach out to us at {order_url}.',
};

export const DEFAULT_STORE_SETTINGS = {
  id: 'default',
  globalShippingCap: 120.0,
  whatsAppNumber: '919876543210',
  whatsAppGreeting: 'Hi! I would like to place an order.',
  businessName: 'SIFR',
  storeDomain: 'sifr.in',
  tagline: 'Contemporary Fashion & Accessories',
  email: 'support@sifr.in',
  phone: '+91 98765 43210',
  address: 'Calicut, Kerala, India',
  instagramUrl: '',
  facebookUrl: '',
  youtubeUrl: '',
  ...DEFAULT_NOTIFICATION_TEMPLATES,
};

export interface StoreSettingsData {
  id: string;
  globalShippingCap: number;
  whatsAppNumber: string;
  whatsAppGreeting: string;
  businessName: string;
  storeDomain: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  instagramUrl: string | null;
  facebookUrl: string | null;
  youtubeUrl: string | null;
  confirmedOrderTemplate: string;
  shippedOrderTemplate: string;
  contactedOrderTemplate: string;
  cancelledOrderTemplate: string;
  createdAt: Date;
  updatedAt: Date;
}

export const updateStoreSettingsSchema = z.object({
  businessName: z.string().trim().min(1, 'Business name is required').max(100),
  storeDomain: z.string().trim().min(1, 'Store domain is required').max(100),
  tagline: z.string().trim().min(1, 'Tagline is required').max(255),
  whatsAppNumber: z.string().trim().min(1, 'WhatsApp number is required'),
  whatsAppGreeting: z.string().trim().min(1, 'WhatsApp greeting line is required').max(255),
  email: z.string().trim().email('Invalid email address'),
  phone: z.string().trim().min(5, 'Phone number is required').max(30),
  address: z.string().trim().min(1, 'Address is required').max(255),
  instagramUrl: z.string().trim().optional().nullable(),
  facebookUrl: z.string().trim().optional().nullable(),
  youtubeUrl: z.string().trim().optional().nullable(),
  confirmedOrderTemplate: z.string().trim().optional().nullable(),
  shippedOrderTemplate: z.string().trim().optional().nullable(),
  contactedOrderTemplate: z.string().trim().optional().nullable(),
  cancelledOrderTemplate: z.string().trim().optional().nullable(),
  globalShippingCap: z.number().min(0, 'Shipping cap cannot be negative').max(10000, 'Shipping cap is too high'),
});

export type UpdateStoreSettingsInput = z.infer<typeof updateStoreSettingsSchema>;

export interface NotificationTemplateVars {
  name?: string;
  order_code?: string;
  order_url?: string;
  courier?: string;
  tracking_id?: string;
  tracking_url?: string;
  store_name?: string;
}

/**
 * Renders an order notification template substituting supported placeholder tokens.
 * Supported tokens: {name}, {order_code}, {order_url}, {courier}, {tracking_id}, {tracking_url}, {store_name}
 */
export function renderNotificationTemplate(
  template: string,
  vars: NotificationTemplateVars
): string {
  if (!template) return '';
  return template
    .replace(/\{name\}/g, vars.name || '')
    .replace(/\{order_code\}/g, vars.order_code || '')
    .replace(/\{order_url\}/g, vars.order_url || '')
    .replace(/\{courier\}/g, vars.courier || '')
    .replace(/\{tracking_id\}/g, vars.tracking_id || '')
    .replace(/\{tracking_url\}/g, vars.tracking_url || '')
    .replace(/\{store_name\}/g, vars.store_name || '');
}

/**
 * Normalizes any Indian WhatsApp number to raw 12-digit format without leading plus (e.g. 919876543210)
 * for wa.me links.
 */
export function normalizeWhatsAppNumber(input: string): string {
  const e164 = normalizeIndiaMobile(input);
  return e164.replace(/[^0-9]/g, '');
}

/**
 * Retrieves authoritative singleton StoreSettings from the database, falling back to defaults.
 */
export async function getStoreSettings(
  tx?: Prisma.TransactionClient
): Promise<StoreSettingsData> {
  const client = tx || prisma;

  let settings = await client.storeSettings.findFirst();

  if (!settings) {
    settings = await client.storeSettings.create({
      data: {
        id: 'default',
        globalShippingCap: new Prisma.Decimal(DEFAULT_STORE_SETTINGS.globalShippingCap),
        whatsAppNumber: DEFAULT_STORE_SETTINGS.whatsAppNumber,
        whatsAppGreeting: DEFAULT_STORE_SETTINGS.whatsAppGreeting,
        businessName: DEFAULT_STORE_SETTINGS.businessName,
        storeDomain: DEFAULT_STORE_SETTINGS.storeDomain,
        tagline: DEFAULT_STORE_SETTINGS.tagline,
        email: DEFAULT_STORE_SETTINGS.email,
        phone: DEFAULT_STORE_SETTINGS.phone,
        address: DEFAULT_STORE_SETTINGS.address,
        instagramUrl: null,
        facebookUrl: null,
        youtubeUrl: null,
        confirmedOrderTemplate: DEFAULT_STORE_SETTINGS.confirmedOrderTemplate,
        shippedOrderTemplate: DEFAULT_STORE_SETTINGS.shippedOrderTemplate,
        contactedOrderTemplate: DEFAULT_STORE_SETTINGS.contactedOrderTemplate,
        cancelledOrderTemplate: DEFAULT_STORE_SETTINGS.cancelledOrderTemplate,
      },
    });
  }

  return {
    id: settings.id,
    globalShippingCap: Number(settings.globalShippingCap),
    whatsAppNumber: settings.whatsAppNumber || DEFAULT_STORE_SETTINGS.whatsAppNumber,
    whatsAppGreeting: settings.whatsAppGreeting || DEFAULT_STORE_SETTINGS.whatsAppGreeting,
    businessName: settings.businessName || DEFAULT_STORE_SETTINGS.businessName,
    storeDomain: settings.storeDomain || DEFAULT_STORE_SETTINGS.storeDomain,
    tagline: settings.tagline || DEFAULT_STORE_SETTINGS.tagline,
    email: settings.email || DEFAULT_STORE_SETTINGS.email,
    phone: settings.phone || DEFAULT_STORE_SETTINGS.phone,
    address: settings.address || DEFAULT_STORE_SETTINGS.address,
    instagramUrl: settings.instagramUrl || null,
    facebookUrl: settings.facebookUrl || null,
    youtubeUrl: settings.youtubeUrl || null,
    confirmedOrderTemplate:
      settings.confirmedOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.confirmedOrderTemplate,
    shippedOrderTemplate:
      settings.shippedOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.shippedOrderTemplate,
    contactedOrderTemplate:
      settings.contactedOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.contactedOrderTemplate,
    cancelledOrderTemplate:
      settings.cancelledOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.cancelledOrderTemplate,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

/**
 * Updates singleton StoreSettings with full validation and normalization.
 */
export async function updateStoreSettings(
  input: UpdateStoreSettingsInput,
  tx?: Prisma.TransactionClient
): Promise<StoreSettingsData> {
  const parsed = updateStoreSettingsSchema.parse(input);
  const client = tx || prisma;

  // Validate and normalize Indian WhatsApp number
  const cleanWhatsAppNumber = normalizeWhatsAppNumber(parsed.whatsAppNumber);

  // Clean empty strings to null for social URLs
  const cleanInstagram = parsed.instagramUrl?.trim() || null;
  const cleanFacebook = parsed.facebookUrl?.trim() || null;
  const cleanYoutube = parsed.youtubeUrl?.trim() || null;

  const updated = await client.storeSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      globalShippingCap: new Prisma.Decimal(parsed.globalShippingCap),
      whatsAppNumber: cleanWhatsAppNumber,
      whatsAppGreeting: parsed.whatsAppGreeting,
      businessName: parsed.businessName,
      storeDomain: parsed.storeDomain,
      tagline: parsed.tagline,
      email: parsed.email,
      phone: parsed.phone,
      address: parsed.address,
      instagramUrl: cleanInstagram,
      facebookUrl: cleanFacebook,
      youtubeUrl: cleanYoutube,
      confirmedOrderTemplate: parsed.confirmedOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.confirmedOrderTemplate,
      shippedOrderTemplate: parsed.shippedOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.shippedOrderTemplate,
      contactedOrderTemplate: parsed.contactedOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.contactedOrderTemplate,
      cancelledOrderTemplate: parsed.cancelledOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.cancelledOrderTemplate,
    },
    update: {
      globalShippingCap: new Prisma.Decimal(parsed.globalShippingCap),
      whatsAppNumber: cleanWhatsAppNumber,
      whatsAppGreeting: parsed.whatsAppGreeting,
      businessName: parsed.businessName,
      storeDomain: parsed.storeDomain,
      tagline: parsed.tagline,
      email: parsed.email,
      phone: parsed.phone,
      address: parsed.address,
      instagramUrl: cleanInstagram,
      facebookUrl: cleanFacebook,
      youtubeUrl: cleanYoutube,
      confirmedOrderTemplate: parsed.confirmedOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.confirmedOrderTemplate,
      shippedOrderTemplate: parsed.shippedOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.shippedOrderTemplate,
      contactedOrderTemplate: parsed.contactedOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.contactedOrderTemplate,
      cancelledOrderTemplate: parsed.cancelledOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.cancelledOrderTemplate,
    },
  });

  return {
    id: updated.id,
    globalShippingCap: Number(updated.globalShippingCap),
    whatsAppNumber: updated.whatsAppNumber,
    whatsAppGreeting: updated.whatsAppGreeting,
    businessName: updated.businessName,
    storeDomain: updated.storeDomain,
    tagline: updated.tagline,
    email: updated.email,
    phone: updated.phone,
    address: updated.address,
    instagramUrl: updated.instagramUrl,
    facebookUrl: updated.facebookUrl,
    youtubeUrl: updated.youtubeUrl,
    confirmedOrderTemplate: updated.confirmedOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.confirmedOrderTemplate,
    shippedOrderTemplate: updated.shippedOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.shippedOrderTemplate,
    contactedOrderTemplate: updated.contactedOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.contactedOrderTemplate,
    cancelledOrderTemplate: updated.cancelledOrderTemplate || DEFAULT_NOTIFICATION_TEMPLATES.cancelledOrderTemplate,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}
