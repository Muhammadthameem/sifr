import React from 'react';
import { DirectSaleTerminal } from '@/components/admin/DirectSaleTerminal';

export const metadata = {
  title: 'Direct Sales POS | SIFR Admin',
  description: 'Over-the-counter POS terminal for direct offline sales',
};

export default function AdminDirectSalesPage() {
  return <DirectSaleTerminal />;
}
