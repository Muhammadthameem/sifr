'use server';

import { prisma } from '@/lib/db/prisma';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { stockAdjustmentInputSchema, StockAdjustmentInput } from '@/lib/validation/inventory';
import { adjustStock, receiveStock } from '@/lib/inventory/fifo-engine';
import { revalidatePath } from 'next/cache';

export interface VariantInventorySummary {
  variantId: string;
  productName: string;
  productSlug: string;
  variantTitle: string;
  sku: string;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  inventoryValuation: number;
  productStatus: string;
}

/**
 * Overview of inventory balances and FIFO valuation per ProductVariant.
 */
export async function getInventoryOverview(filters?: { search?: string; status?: string }) {
  await requireAdminAuth();

  const where: any = {};

  if (filters?.search) {
    where.OR = [
      { sku: { contains: filters.search, mode: 'insensitive' } },
      { title: { contains: filters.search, mode: 'insensitive' } },
      { product: { name: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }

  const variants = await prisma.productVariant.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, slug: true, status: true } },
      inventoryItem: true,
      fifoLayers: {
        where: { remainingQuantity: { gt: 0 } },
        select: { remainingQuantity: true, unitCost: true },
      },
    },
    orderBy: [{ product: { name: 'asc' } }, { title: 'asc' }],
  });

  const summaryList: VariantInventorySummary[] = variants.map((v) => {
    const physicalStock = v.inventoryItem?.physicalStock ?? 0;
    const reservedStock = v.inventoryItem?.reservedStock ?? 0;
    const availableStock = physicalStock - reservedStock; // Derived Available Stock

    const inventoryValuation = v.fifoLayers.reduce((sum, layer) => {
      return sum + layer.remainingQuantity * Number(layer.unitCost);
    }, 0);

    return {
      variantId: v.id,
      productName: v.product.name,
      productSlug: v.product.slug,
      variantTitle: v.title,
      sku: v.sku,
      physicalStock,
      reservedStock,
      availableStock,
      inventoryValuation,
      productStatus: v.product.status,
    };
  });

  if (filters?.status === 'IN_STOCK') {
    return summaryList.filter((s) => s.availableStock > 0);
  } else if (filters?.status === 'OUT_OF_STOCK') {
    return summaryList.filter((s) => s.availableStock <= 0);
  }

  return summaryList;
}

/**
 * Detailed FIFO layers and movement history for a selected variant.
 */
export async function getVariantInventoryDetail(variantId: string) {
  await requireAdminAuth();

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      product: { select: { id: true, name: true, slug: true } },
      inventoryItem: true,
      fifoLayers: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], // Deterministic FIFO ordering
      },
      inventoryMovements: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      },
    },
  });

  if (!variant) {
    throw new Error('Variant not found.');
  }

  const physicalStock = variant.inventoryItem?.physicalStock ?? 0;
  const reservedStock = variant.inventoryItem?.reservedStock ?? 0;
  const availableStock = physicalStock - reservedStock;

  const activeLayers = variant.fifoLayers.filter((l) => l.remainingQuantity > 0);
  const inventoryValuation = activeLayers.reduce(
    (sum, l) => sum + l.remainingQuantity * Number(l.unitCost),
    0
  );

  return {
    variant,
    physicalStock,
    reservedStock,
    availableStock,
    inventoryValuation,
    fifoLayers: variant.fifoLayers,
    movements: variant.inventoryMovements,
  };
}

/**
 * Admin action to perform Stock Adjustment (IN or OUT).
 */
export async function performStockAdjustmentAction(input: StockAdjustmentInput) {
  await requireAdminAuth();

  const validated = stockAdjustmentInputSchema.parse(input);

  const result = await adjustStock(
    validated.variantId,
    validated.direction,
    validated.quantity,
    validated.unitCost,
    validated.reason,
    validated.notes,
    validated.idempotencyKey
  );

  revalidatePath('/admin/inventory');
  return result;
}

/**
 * Chronological inventory movement ledger stream.
 */
export async function getInventoryLedger(filters?: { type?: string; search?: string }) {
  await requireAdminAuth();

  const where: any = {};

  if (filters?.type && filters.type !== 'ALL') {
    where.type = filters.type;
  }

  if (filters?.search) {
    where.OR = [
      { variant: { sku: { contains: filters.search, mode: 'insensitive' } } },
      { variant: { product: { name: { contains: filters.search, mode: 'insensitive' } } } },
      { referenceId: { contains: filters.search, mode: 'insensitive' } },
      { idempotencyKey: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return prisma.inventoryMovement.findMany({
    where,
    include: {
      variant: {
        select: {
          id: true,
          title: true,
          sku: true,
          product: { select: { name: true, slug: true } },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 100,
  });
}
