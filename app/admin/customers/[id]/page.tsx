import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getAdminCustomerDetails } from '@/lib/customer/customer-service';
import { notFound } from 'next/navigation';
import { CustomerDetailView } from '@/components/admin/CustomerDetailView';

interface CustomerDetailPageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: CustomerDetailPageProps) {
  const customer = await getAdminCustomerDetails(params.id);
  return {
    title: customer ? `${customer.name} | Customers | SIFR Admin` : 'Customer Not Found | SIFR Admin',
  };
}

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  await requireAdminAuth();

  const customer = await getAdminCustomerDetails(params.id);
  if (!customer) {
    notFound();
  }

  return <CustomerDetailView initialCustomer={customer} />;
}
