'use server';

import { prisma } from '@/lib/db/prisma';
import {
  createPurchaseDraft,
  updatePurchaseDraft,
  receivePurchase,
  cancelPurchaseDraft,
  CreatePurchaseDraftOptions,
  UpdatePurchaseDraftOptions,
  ReceivePurchaseOptions,
} from '@/lib/purchasing/purchase-engine';
import { revalidatePath } from 'next/cache';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore when executed outside Next.js request context
  }
}

export async function createPurchaseAction(options: CreatePurchaseDraftOptions) {
  const result = await createPurchaseDraft(options);
  safeRevalidatePath('/admin/purchases');
  safeRevalidatePath('/admin/inventory');
  return result;
}

export async function updatePurchaseAction(options: UpdatePurchaseDraftOptions) {
  const result = await updatePurchaseDraft(options);
  safeRevalidatePath('/admin/purchases');
  safeRevalidatePath(`/admin/purchases/${options.purchaseId}`);
  safeRevalidatePath('/admin/inventory');
  return result;
}

export async function receivePurchaseAction(options: ReceivePurchaseOptions) {
  const result = await receivePurchase(options);
  safeRevalidatePath('/admin/purchases');
  safeRevalidatePath(`/admin/purchases/${options.purchaseId}`);
  safeRevalidatePath('/admin/inventory');
  return result;
}

export async function cancelPurchaseAction(purchaseId: string) {
  const result = await cancelPurchaseDraft(purchaseId);
  safeRevalidatePath('/admin/purchases');
  safeRevalidatePath(`/admin/purchases/${purchaseId}`);
  return result;
}

export async function getPurchasesList() {
  return prisma.purchase.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      vendor: true,
      lines: {
        include: {
          variant: {
            include: { product: true },
          },
        },
      },
    },
  });
}

export async function getPurchaseDetail(id: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      vendor: true,
      lines: {
        include: {
          variant: {
            include: {
              product: true,
            },
          },
        },
      },
    },
  });

  if (!purchase) {
    return null;
  }

  // Fetch linked FIFO layers & InventoryMovements for audit display
  const fifoLayers = await prisma.fifoLayer.findMany({
    where: { referenceId: id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const inventoryMovements = await prisma.inventoryMovement.findMany({
    where: { referenceId: id },
    orderBy: { createdAt: 'asc' },
  });

  return {
    ...purchase,
    fifoLayers,
    inventoryMovements,
  };
}
