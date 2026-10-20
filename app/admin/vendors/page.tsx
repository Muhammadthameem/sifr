import React from 'react';
import { getVendorsList } from '@/lib/actions/vendor-actions';
import { VendorManager } from '@/components/admin/VendorManager';

export const revalidate = 0;

export default async function VendorsAdminPage() {
  const vendors = await getVendorsList();

  return <VendorManager initialVendors={vendors as any} />;
}
