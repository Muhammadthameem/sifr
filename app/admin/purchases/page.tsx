import React from 'react';
import { getPurchasesList } from '@/lib/actions/purchase-actions';
import { getVendorsList } from '@/lib/actions/vendor-actions';
import { PurchaseListManager } from '@/components/admin/PurchaseListManager';

export const revalidate = 0;

export default async function PurchasesAdminPage() {
  const [purchases, vendors] = await Promise.all([getPurchasesList(), getVendorsList()]);

  return <PurchaseListManager initialPurchases={purchases as any} vendors={vendors as any} />;
}
