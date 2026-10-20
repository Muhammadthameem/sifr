import React from 'react';
import { OrderListManager } from '@/components/admin/OrderListManager';

export const metadata = {
  title: 'Orders | SIFR Admin',
  description: 'Manage customer orders, payments, shipments and order status.',
};

export default function AdminOrdersPage() {
  return <OrderListManager />;
}
