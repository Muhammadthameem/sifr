import { prisma } from '@/lib/db/prisma';
import { Prisma, InventoryMovementType, AdjustmentReason } from '@prisma/client';

export interface ReceiveStockOptions {
  variantId: string;
  quantity: number;
  unitCost: number;
  type?: 'PURCHASE_IN' | 'ADJUSTMENT_IN';
  reason?: AdjustmentReason;
  referenceId?: string | null;
  idempotencyKey: string;
  notes?: string | null;
}

export interface ConsumeStockOptions {
  variantId: string;
  quantity: number;
  type?: 'ADJUSTMENT_OUT' | 'SALE_OUT';
  reason?: AdjustmentReason;
  referenceId?: string | null;
  idempotencyKey: string;
  notes?: string | null;
}

export interface FifoConsumptionResult {
  consumedQuantity: number;
  totalFifoCost: number;
  movementId: string;
  isDuplicate?: boolean;
}

/**
 * Locks the inventory row for a variant in PostgreSQL using SELECT ... FOR UPDATE.
 * Serializes concurrent stock operations for the same variantId.
 */
async function lockVariantInventory(tx: Prisma.TransactionClient, variantId: string) {
  // Ensure product variant exists first
  const variant = await tx.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, title: true, sku: true },
  });

  if (!variant) {
    throw new Error(`ProductVariant with ID '${variantId}' does not exist.`);
  }

  // Ensure InventoryItem row exists
  let item = await tx.inventoryItem.findUnique({
    where: { variantId },
  });

  if (!item) {
    item = await tx.inventoryItem.create({
      data: {
        variantId,
        physicalStock: 0,
        reservedStock: 0,
      },
    });
  }

  // Execute row-level lock FOR UPDATE on inventory_items table
  await tx.$executeRaw`
    SELECT * FROM inventory_items WHERE variant_id = ${variantId} FOR UPDATE;
  `;

  return { variant, item };
}

/**
 * Check if idempotencyKey has already been processed.
 */
async function checkIdempotency(tx: Prisma.TransactionClient, idempotencyKey: string) {
  if (!idempotencyKey || idempotencyKey.trim() === '') {
    throw new Error('An explicit, non-empty idempotencyKey is required for all stock mutations.');
  }

  const existingMovement = await tx.inventoryMovement.findUnique({
    where: { idempotencyKey },
  });

  return existingMovement;
}

/**
 * Atomic Stock Receipt (PURCHASE_IN or ADJUSTMENT_IN)
 */
export async function receiveStock(options: ReceiveStockOptions, externalTx?: Prisma.TransactionClient) {
  const {
    variantId,
    quantity,
    unitCost,
    type = 'PURCHASE_IN',
    reason,
    referenceId,
    idempotencyKey,
    notes,
  } = options;

  if (quantity <= 0) {
    throw new Error('Stock receipt quantity must be greater than zero.');
  }

  if (unitCost < 0) {
    throw new Error('Unit acquisition cost cannot be negative.');
  }

  const execute = async (tx: Prisma.TransactionClient) => {
    // 1. Idempotency Check
    const existingMovement = await checkIdempotency(tx, idempotencyKey);
    if (existingMovement) {
      return {
        success: true,
        isDuplicate: true,
        movement: existingMovement,
      };
    }

    // 2. Lock Inventory Row (Row-level concurrency protection)
    const { item } = await lockVariantInventory(tx, variantId);

    // 3. Increment Physical Stock
    const updatedItem = await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        physicalStock: { increment: quantity },
      },
    });

    // 4. Create FIFO Layer (initialQuantity > 0, remainingQuantity = quantity)
    const fifoLayer = await tx.fifoLayer.create({
      data: {
        variantId,
        initialQuantity: quantity,
        remainingQuantity: quantity,
        unitCost: new Prisma.Decimal(unitCost),
        referenceId: referenceId || null,
      },
    });

    // 5. Create Inventory Movement (+quantity)
    const totalCost = new Prisma.Decimal(quantity * unitCost);
    const movement = await tx.inventoryMovement.create({
      data: {
        variantId,
        type,
        quantity: quantity, // Positive for IN
        unitCost: new Prisma.Decimal(unitCost),
        totalCost,
        reason: reason || null,
        referenceId: referenceId || null,
        idempotencyKey,
        notes: notes || null,
      },
    });

    return {
      success: true,
      isDuplicate: false,
      item: updatedItem,
      layer: fifoLayer,
      movement,
    };
  };

  if (externalTx) {
    return execute(externalTx);
  }
  return prisma.$transaction((tx) => execute(tx));
}

/**
 * Atomic FIFO Stock Consumption (ADJUSTMENT_OUT or SALE_OUT)
 * Consumes oldest FIFO layers first (createdAt ASC, id ASC)
 */
export async function consumeFifoStock(
  options: ConsumeStockOptions,
  externalTx?: Prisma.TransactionClient
): Promise<FifoConsumptionResult> {
  const {
    variantId,
    quantity,
    type = 'ADJUSTMENT_OUT',
    reason,
    referenceId,
    idempotencyKey,
    notes,
  } = options;

  if (quantity <= 0) {
    throw new Error('Stock consumption quantity must be greater than zero.');
  }

  const execute = async (tx: Prisma.TransactionClient) => {
    // 1. Idempotency Check
    const existingMovement = await checkIdempotency(tx, idempotencyKey);
    if (existingMovement) {
      return {
        consumedQuantity: Math.abs(existingMovement.quantity),
        totalFifoCost: Number(existingMovement.totalCost || 0),
        movementId: existingMovement.id,
        isDuplicate: true,
      };
    }

    // 2. Lock Inventory Row (Row-level concurrency protection)
    const { variant, item } = await lockVariantInventory(tx, variantId);

    // 3. Validate Physical Stock Invariant
    if (item.physicalStock < quantity) {
      throw new Error(
        `INSUFFICIENT_STOCK: Attempted to consume ${quantity} units, but physical stock is ${item.physicalStock} for variant '${variant.sku}'.`
      );
    }

    // 4. Fetch Active FIFO Layers ordered by createdAt ASC, id ASC (Deterministic tie-breaker)
    const activeLayers = await tx.fifoLayer.findMany({
      where: {
        variantId,
        remainingQuantity: { gt: 0 },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const totalAvailableInLayers = activeLayers.reduce((sum, l) => sum + l.remainingQuantity, 0);
    if (totalAvailableInLayers < quantity) {
      throw new Error(
        `INSUFFICIENT_FIFO_LAYERS: Available FIFO layer quantity (${totalAvailableInLayers}) is less than required consumption (${quantity}).`
      );
    }

    // 5. Consume Layers Sequentially
    let remainingToConsume = quantity;
    let totalFifoCost = 0;
    const consumedLayersDetails: Array<{ layerId: string; quantity: number; unitCost: number }> = [];

    for (const layer of activeLayers) {
      if (remainingToConsume <= 0) break;

      const takeQty = Math.min(layer.remainingQuantity, remainingToConsume);
      const layerUnitCost = Number(layer.unitCost);
      const layerCost = takeQty * layerUnitCost;

      totalFifoCost += layerCost;
      remainingToConsume -= takeQty;
      consumedLayersDetails.push({
        layerId: layer.id,
        quantity: takeQty,
        unitCost: layerUnitCost,
      });

      // Update remaining quantity on layer (Depleted layers with remainingQuantity = 0 are retained for auditability)
      await tx.fifoLayer.update({
        where: { id: layer.id },
        data: {
          remainingQuantity: { decrement: takeQty },
        },
      });
    }

    if (remainingToConsume > 0) {
      throw new Error('Partial FIFO layer consumption detected. Transaction rolled back.');
    }

    // 6. Decrement Physical Stock
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        physicalStock: { decrement: quantity },
      },
    });

    // 7. Create Inventory Movement (-quantity, totalCost = totalFifoCost, consumedLayersJson)
    const movement = await tx.inventoryMovement.create({
      data: {
        variantId,
        type,
        quantity: -quantity, // Negative for OUT
        unitCost: null,
        totalCost: new Prisma.Decimal(totalFifoCost),
        reason: reason || null,
        referenceId: referenceId || null,
        idempotencyKey,
        notes: notes || null,
        consumedLayersJson: JSON.stringify(consumedLayersDetails),
      },
    });

    return {
      consumedQuantity: quantity,
      totalFifoCost,
      movementId: movement.id,
      isDuplicate: false,
    };
  };

  if (externalTx) {
    return execute(externalTx);
  }
  return prisma.$transaction((tx) => execute(tx));
}

/**
 * Stock Adjustment Entry Handler
 */
export async function adjustStock(
  variantId: string,
  direction: 'IN' | 'OUT',
  quantity: number,
  unitCost: number | null | undefined,
  reason: AdjustmentReason,
  notes: string,
  idempotencyKey: string
) {
  if (direction === 'IN') {
    if (unitCost === undefined || unitCost === null || unitCost < 0) {
      throw new Error('Unit acquisition cost is required for Adjustment IN.');
    }
    return receiveStock({
      variantId,
      quantity,
      unitCost,
      type: 'ADJUSTMENT_IN',
      reason,
      idempotencyKey,
      notes,
    });
  } else {
    return consumeFifoStock({
      variantId,
      quantity,
      type: 'ADJUSTMENT_OUT',
      reason,
      idempotencyKey,
      notes,
    });
  }
}

/**
 * Calculates current FIFO inventory valuation for a variant (sum of remainingQuantity * unitCost).
 */
export async function getVariantInventoryValuation(variantId: string): Promise<number> {
  const activeLayers = await prisma.fifoLayer.findMany({
    where: {
      variantId,
      remainingQuantity: { gt: 0 },
    },
    select: {
      remainingQuantity: true,
      unitCost: true,
    },
  });

  return activeLayers.reduce((sum, layer) => {
    return sum + layer.remainingQuantity * Number(layer.unitCost);
  }, 0);
}
