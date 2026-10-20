import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { CmsSectionManager } from '@/components/admin/CmsSectionManager';

export default async function WebsiteAdminPage() {
  await requireAdminAuth();
  return <CmsSectionManager />;
}
