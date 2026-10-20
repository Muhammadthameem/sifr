import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { CustomerListManager } from '@/components/admin/CustomerListManager';

export const metadata = {
  title: 'Customers | SIFR Admin',
  description: 'Guest checkout profiles and purchase histories.',
};

export default async function CustomersAdminPage() {
  await requireAdminAuth();

  return <CustomerListManager />;
}
