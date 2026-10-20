import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getInventoryOverview, getInventoryLedger } from '@/lib/actions/inventory-actions';
import { InventoryManager } from '@/components/admin/InventoryManager';

export default async function InventoryAdminPage() {
  await requireAdminAuth();

  const [overview, ledger] = await Promise.all([
    getInventoryOverview(),
    getInventoryLedger(),
  ]);

  return (
    <InventoryManager
      initialSummary={overview}
      initialLedger={ledger as any}
    />
  );
}
