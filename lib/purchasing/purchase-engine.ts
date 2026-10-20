import { prisma } from '@/lib/db/prisma';
import { Prisma, PurchaseStatus, InventoryMovementType } from '@prisma/client';
import { purchaseSchema } from '@/lib/validation/purchasing';
import { generatePurchaseNumber } from '@/lib/purchasing/sequence';
import { calculateLandedCosts, InputPurchaseLine } from '@/lib/purchasing/landed-cost';

export interface CreatePurchaseDraftOptions {
  vendorId: string;
  purchaseDate?: Date | string;
  freight?: number;
  notes?: string | null;
  lines: InputPurchaseLine[];
}

export interface UpdatePurchaseDraftOptions {
  purchaseId: string;
  vendorId?: string;
  purchaseDate?: Date | string;
  freight?: number;
  notes?: string | null;
  lines?: InputPurchaseLine[];
}

export interface ReceivePurchaseOptions {
  purchaseId: string;
  idempotencyKey: string;
}

/**
 * Creates a DRAFT Purchase document with vendor master snapshots.
 */
export async function createPurchaseDraft(options: CreatePurchaseDraftOptions) {
  const validated = purchaseSchema.parse(options);

  return prisma.$transaction(async (tx) => {
    // 1. Fetch Vendor master and verify active status
    const vendor = await tx.vendor.findUnique({
      where: { id: validated.vendorId },
    });

    if (!vendor) {
      throw new Error(`Vendor with ID '${validated.vendorId}' does not exist.`);
    }

    if (!vendor.isActive) {
      throw new Error(`Vendor '${vendor.name}' is inactive and cannot be selected for new purchases.`);
    }

    // 2. Verify all ProductVariants exist
    const variantIds = validated.lines.map((l) => l.variantId);
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, sku: true },
    });

    if (variants.length !== variantIds.length) {
      throw new Error('One or more selected ProductVariants do not exist.');
    }

    // 3. Compute landed cost totals
    const calculation = calculateLandedCosts(validated.lines, validated.freight);

    // 4. Generate concurrency-safe purchase number
    const purchaseNumber = await generatePurchaseNumber(tx);

    // 5. Create Purchase and PurchaseLines atomically
    const purchaseDate = validated.purchaseDate ? new Date(validated.purchaseDate) : new Date();

    const purchase = await tx.purchase.create({
      data: {
        purchaseNumber,
        vendorId: vendor.id,
        purchaseDate,
        status: PurchaseStatus.DRAFT,
        subtotal: new Prisma.Decimal(calculation.subtotal),
        freight: new Prisma.Decimal(calculation.freight),
        totalLandedCost: new Prisma.Decimal(calculation.totalLandedCost),
        totalUnits: calculation.totalUnits,
        vendorNameSnapshot: vendor.name,
        vendorContactSnapshot: vendor.contactPerson,
        vendorPhoneSnapshot: vendor.phone,
        vendorEmailSnapshot: vendor.email,
        vendorAddressSnapshot: vendor.address,
        vendorGstinSnapshot: vendor.gstin,
        notes: validated.notes || null,
        lines: {
          create: calculation.lines.map((l) => ({
            variantId: l.variantId,
            quantity: l.quantity,
            unitPurchasePrice: new Prisma.Decimal(l.unitPurchasePrice),
            lineSubtotal: new Prisma.Decimal(l.lineSubtotal),
            landedUnitCost: new Prisma.Decimal(l.landedUnitCost),
          })),
        },
      },
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

    return purchase;
  });
}

/**
 * Updates a DRAFT Purchase document.
 */
export async function updatePurchaseDraft(options: UpdatePurchaseDraftOptions) {
  const { purchaseId, vendorId, purchaseDate, freight, notes, lines } = options;

  return prisma.$transaction(async (tx) => {
    // 1. Lock purchase row and verify status
    const purchase = await tx.purchase.findUnique({
      where: { id: purchaseId },
      include: { lines: true },
    });

    if (!purchase) {
      throw new Error(`Purchase document '${purchaseId}' does not exist.`);
    }

    if (purchase.status !== PurchaseStatus.DRAFT) {
      throw new Error(`Purchase document '${purchase.purchaseNumber}' is ${purchase.status} and cannot be edited.`);
    }

    // 2. Handle vendor update if vendorId changed
    let vendorSnapshots = {
      vendorId: purchase.vendorId,
      vendorNameSnapshot: purchase.vendorNameSnapshot,
      vendorContactSnapshot: purchase.vendorContactSnapshot,
      vendorPhoneSnapshot: purchase.vendorPhoneSnapshot,
      vendorEmailSnapshot: purchase.vendorEmailSnapshot,
      vendorAddressSnapshot: purchase.vendorAddressSnapshot,
      vendorGstinSnapshot: purchase.vendorGstinSnapshot,
    };

    if (vendorId && vendorId !== purchase.vendorId) {
      const newVendor = await tx.vendor.findUnique({ where: { id: vendorId } });
      if (!newVendor) {
        throw new Error(`Vendor '${vendorId}' does not exist.`);
      }
      if (!newVendor.isActive) {
        throw new Error(`Vendor '${newVendor.name}' is inactive.`);
      }

      vendorSnapshots = {
        vendorId: newVendor.id,
        vendorNameSnapshot: newVendor.name,
        vendorContactSnapshot: newVendor.contactPerson,
        vendorPhoneSnapshot: newVendor.phone,
        vendorEmailSnapshot: newVendor.email,
        vendorAddressSnapshot: newVendor.address,
        vendorGstinSnapshot: newVendor.gstin,
      };
    }

    // 3. Prepare line items & compute landed costs
    const inputLines: InputPurchaseLine[] = lines || purchase.lines.map((l) => ({
      variantId: l.variantId,
      quantity: l.quantity,
      unitPurchasePrice: Number(l.unitPurchasePrice),
    }));

    const validated = purchaseSchema.parse({
      vendorId: vendorSnapshots.vendorId,
      purchaseDate: purchaseDate || purchase.purchaseDate,
      freight: freight !== undefined ? freight : Number(purchase.freight),
      notes: notes !== undefined ? notes : purchase.notes,
      lines: inputLines,
    });

    const calculation = calculateLandedCosts(validated.lines, validated.freight);

    // 4. Delete existing lines and update purchase
    await tx.purchaseLine.deleteMany({ where: { purchaseId } });

    const updated = await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        ...vendorSnapshots,
        purchaseDate: validated.purchaseDate ? new Date(validated.purchaseDate) : purchase.purchaseDate,
        subtotal: new Prisma.Decimal(calculation.subtotal),
        freight: new Prisma.Decimal(calculation.freight),
        totalLandedCost: new Prisma.Decimal(calculation.totalLandedCost),
        totalUnits: calculation.totalUnits,
        notes: validated.notes || null,
        lines: {
          create: calculation.lines.map((l) => ({
            variantId: l.variantId,
            quantity: l.quantity,
            unitPurchasePrice: new Prisma.Decimal(l.unitPurchasePrice),
            lineSubtotal: new Prisma.Decimal(l.lineSubtotal),
            landedUnitCost: new Prisma.Decimal(l.landedUnitCost),
          })),
        },
      },
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

    return updated;
  });
}

/**
 * Atomic Purchase Receiving Engine inside prisma.$transaction.
 * Strict Row Locking Order:
 * 1. Lock Purchase header SELECT FOR UPDATE
 * 2. Verify DRAFT status
 * 3. Verify receipt idempotency state
 * 4. Sort variantIds and lock InventoryItems SELECT FOR UPDATE
 * 5. Compute landed costs and sub-layer splits
 * 6. Update inventory physical stock
 * 7. Create FifoLayers
 * 8. Create PURCHASE_IN InventoryMovements matching sub-layers
 * 9. Set status RECEIVED and record receivedAt
 * 10. Commit atomically
 */
export async function receivePurchase(options: ReceivePurchaseOptions) {
  const { purchaseId, idempotencyKey } = options;

  if (!idempotencyKey || idempotencyKey.trim() === '') {
    throw new Error('An explicit idempotencyKey is required to receive a purchase.');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Lock Purchase header row with SELECT ... FOR UPDATE
    await tx.$executeRaw`
      SELECT * FROM purchases WHERE id = ${purchaseId} FOR UPDATE;
    `;

    const purchase = await tx.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        lines: true,
        vendor: true,
      },
    });

    if (!purchase) {
      throw new Error(`Purchase document '${purchaseId}' does not exist.`);
    }

    // 2. Check receipt status & idempotency state
    if (purchase.status === PurchaseStatus.RECEIVED) {
      return {
        success: true,
        isDuplicate: true,
        purchase,
        message: `Purchase document '${purchase.purchaseNumber}' has already been received.`,
      };
    }

    if (purchase.status === PurchaseStatus.CANCELLED) {
      throw new Error(`Cannot receive cancelled purchase document '${purchase.purchaseNumber}'.`);
    }

    if (purchase.receivedByIdempotencyKey && purchase.receivedByIdempotencyKey === idempotencyKey) {
      return {
        success: true,
        isDuplicate: true,
        purchase,
        message: 'Duplicate receipt request ignored cleanly.',
      };
    }

    if (purchase.lines.length === 0) {
      throw new Error(`Purchase '${purchase.purchaseNumber}' contains no line items to receive.`);
    }

    // 3. Verify Vendor active status
    if (!purchase.vendor.isActive) {
      throw new Error(`Vendor '${purchase.vendorNameSnapshot}' is inactive. Cannot receive purchase.`);
    }

    // 4. Sort target variantIds and lock InventoryItem rows deterministically
    const rawLines: InputPurchaseLine[] = purchase.lines.map((l) => ({
      id: l.id,
      variantId: l.variantId,
      quantity: l.quantity,
      unitPurchasePrice: Number(l.unitPurchasePrice),
    }));

    const sortedVariantIds = Array.from(new Set(rawLines.map((l) => l.variantId))).sort();

    for (const variantId of sortedVariantIds) {
      let item = await tx.inventoryItem.findUnique({ where: { variantId } });
      if (!item) {
        item = await tx.inventoryItem.create({
          data: { variantId, physicalStock: 0, reservedStock: 0 },
        });
      }
      await tx.$executeRaw`
        SELECT * FROM inventory_items WHERE variant_id = ${variantId} FOR UPDATE;
      `;
    }

    // 5. Calculate equal-per-unit landed cost & sub-layer splits
    const calculation = calculateLandedCosts(rawLines, Number(purchase.freight));

    // 6. Process each sub-layer: update physical stock, create FifoLayers & PURCHASE_IN movements
    const createdLayers = [];
    const createdMovements = [];

    for (let idx = 0; idx < calculation.allSubLayers.length; idx++) {
      const subLayer = calculation.allSubLayers[idx];

      // Update Physical Stock
      await tx.inventoryItem.update({
        where: { variantId: subLayer.variantId },
        data: {
          physicalStock: { increment: subLayer.quantity },
        },
      });

      // Create FIFO Layer
      const fifoLayer = await tx.fifoLayer.create({
        data: {
          variantId: subLayer.variantId,
          initialQuantity: subLayer.quantity,
          remainingQuantity: subLayer.quantity,
          unitCost: new Prisma.Decimal(subLayer.unitCost),
          referenceId: purchase.id,
        },
      });
      createdLayers.push(fifoLayer);

      // Create PURCHASE_IN Inventory Movement matching sub-layer granularity
      const movementKey = `${purchase.id}-receive-${subLayer.lineId || subLayer.variantId}-sub-${idx}`;
      const movement = await tx.inventoryMovement.create({
        data: {
          variantId: subLayer.variantId,
          type: InventoryMovementType.PURCHASE_IN,
          quantity: subLayer.quantity, // Positive for IN
          unitCost: new Prisma.Decimal(subLayer.unitCost),
          totalCost: new Prisma.Decimal(subLayer.totalCost),
          referenceId: purchase.id,
          idempotencyKey: movementKey,
          notes: `Received ${purchase.purchaseNumber} (Landed Unit Cost: ₹${subLayer.unitCost})`,
        },
      });
      createdMovements.push(movement);
    }

    // 7. Update line landedUnitCost display values
    for (const lineCalc of calculation.lines) {
      if (lineCalc.lineId) {
        await tx.purchaseLine.update({
          where: { id: lineCalc.lineId },
          data: {
            landedUnitCost: new Prisma.Decimal(lineCalc.landedUnitCost),
          },
        });
      }
    }

    // 8. Update Purchase header to RECEIVED
    const receivedPurchase = await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        status: PurchaseStatus.RECEIVED,
        receivedAt: new Date(),
        receivedByIdempotencyKey: idempotencyKey,
      },
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

    return {
      success: true,
      isDuplicate: false,
      purchase: receivedPurchase,
      layers: createdLayers,
      movements: createdMovements,
    };
  });
}

/**
 * Cancels a DRAFT Purchase.
 */
export async function cancelPurchaseDraft(purchaseId: string) {
  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) {
      throw new Error(`Purchase document '${purchaseId}' does not exist.`);
    }

    if (purchase.status !== PurchaseStatus.DRAFT) {
      throw new Error(`Cannot cancel purchase '${purchase.purchaseNumber}' because it is in '${purchase.status}' status.`);
    }

    return tx.purchase.update({
      where: { id: purchaseId },
      data: { status: PurchaseStatus.CANCELLED },
    });
  });
}
