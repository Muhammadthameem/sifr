import React from 'react';
import { getVendorsList } from '@/lib/actions/vendor-actions';
import { prisma } from '@/lib/db/prisma';
import { PurchaseForm } from '@/components/admin/PurchaseForm';

export const revalidate = 0;

export default async function CreatePurchasePage() {
  const [vendors, variants] = await Promise.all([
    getVendorsList(),
    prisma.productVariant.findMany({
      orderBy: { sku: 'asc' },
      select: {
        id: true,
        title: true,
        sku: true,
        product: { select: { name: true } },
      },
    }),
  ]);

  return <PurchaseForm vendors={vendors as any} variants={variants as any} />;
}
