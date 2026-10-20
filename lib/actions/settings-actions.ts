'use server';

import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { revalidatePath } from 'next/cache';
import {
  getStoreSettings,
  updateStoreSettings,
  UpdateStoreSettingsInput,
  StoreSettingsData,
} from '@/lib/settings/settings-service';

export interface SettingsActionResult {
  success: boolean;
  settings?: StoreSettingsData;
  error?: string;
}

/**
 * Admin action to fetch current complete StoreSettings.
 */
export async function getAdminSettingsAction(): Promise<SettingsActionResult> {
  try {
    await requireAdminAuth();
    const settings = await getStoreSettings();
    return { success: true, settings };
  } catch (err: any) {
    if (err?.message === 'NEXT_REDIRECT') throw err;
    return { success: false, error: err.message || 'Failed to retrieve settings' };
  }
}

/**
 * Admin action to update StoreSettings.
 */
export async function updateAdminSettingsAction(
  input: UpdateStoreSettingsInput
): Promise<SettingsActionResult> {
  try {
    await requireAdminAuth();
    const updated = await updateStoreSettings(input);

    // Revalidate storefront and admin paths to propagate updated settings immediately
    revalidatePath('/', 'layout');
    revalidatePath('/admin/settings');

    return { success: true, settings: updated };
  } catch (err: any) {
    if (err?.message === 'NEXT_REDIRECT') throw err;
    return { success: false, error: err.message || 'Failed to update settings' };
  }
}

/**
 * Public action or helper to fetch current StoreSettings for storefront consumers.
 */
export async function getPublicStoreSettingsAction(): Promise<StoreSettingsData> {
  return await getStoreSettings();
}
