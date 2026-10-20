import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getStoreSettings } from '@/lib/settings/settings-service';
import { SettingsManager } from '@/components/admin/settings/SettingsManager';

export default async function SettingsAdminPage() {
  await requireAdminAuth();
  const settings = await getStoreSettings();

  return <SettingsManager initialSettings={settings} />;
}
