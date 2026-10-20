export interface InputPurchaseLine {
  id?: string;
  variantId: string;
  quantity: number;
  unitPurchasePrice: number;
}

export interface LandedCostSubLayer {
  variantId: string;
  lineId?: string;
  quantity: number;
  unitCost: number; // exact landed unit cost for this sub-layer
  totalCost: number; // quantity * unitCost
}

export interface LandedCostCalculationResult {
  totalUnits: number;
  subtotal: number;
  freight: number;
  totalLandedCost: number;
  lines: {
    variantId: string;
    lineId?: string;
    quantity: number;
    unitPurchasePrice: number;
    lineSubtotal: number;
    landedUnitCost: number; // display average/base landed cost for line
    subLayers: LandedCostSubLayer[];
  }[];
  allSubLayers: LandedCostSubLayer[];
}

export function calculateLandedCosts(
  lines: InputPurchaseLine[],
  freightInput: number
): LandedCostCalculationResult {
  const freight = Math.max(0, Number(freightInput) || 0);
  const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0);

  let subtotal = 0;
  const lineDetails = lines.map((line) => {
    const lineSubtotal = line.quantity * line.unitPurchasePrice;
    subtotal += lineSubtotal;
    return {
      ...line,
      lineSubtotal,
    };
  });

  const totalLandedCost = subtotal + freight;

  if (totalUnits <= 0) {
    return {
      totalUnits: 0,
      subtotal: 0,
      freight,
      totalLandedCost: freight,
      lines: [],
      allSubLayers: [],
    };
  }

  // Calculate base per-unit freight in paise (rounded down)
  const exactFreightPerUnit = freight / totalUnits;
  const baseFreightPaise = Math.floor(exactFreightPerUnit * 100);
  const remainderPaise = Math.round((freight - (baseFreightPaise / 100) * totalUnits) * 100);

  let remainingExtraPaise = remainderPaise;
  const resultLines: LandedCostCalculationResult['lines'] = [];
  const allSubLayers: LandedCostSubLayer[] = [];

  for (const line of lineDetails) {
    const extraUnits = Math.min(line.quantity, remainingExtraPaise);
    const normalUnits = line.quantity - extraUnits;
    remainingExtraPaise -= extraUnits;

    const extraUnitLandedCost = line.unitPurchasePrice + (baseFreightPaise + 1) / 100;
    const normalUnitLandedCost = line.unitPurchasePrice + baseFreightPaise / 100;

    const subLayers: LandedCostSubLayer[] = [];

    if (extraUnits > 0 && normalUnits > 0) {
      subLayers.push({
        variantId: line.variantId,
        lineId: line.id,
        quantity: extraUnits,
        unitCost: Number(extraUnitLandedCost.toFixed(2)),
        totalCost: Number((extraUnits * extraUnitLandedCost).toFixed(2)),
      });
      subLayers.push({
        variantId: line.variantId,
        lineId: line.id,
        quantity: normalUnits,
        unitCost: Number(normalUnitLandedCost.toFixed(2)),
        totalCost: Number((normalUnits * normalUnitLandedCost).toFixed(2)),
      });
    } else if (extraUnits > 0) {
      subLayers.push({
        variantId: line.variantId,
        lineId: line.id,
        quantity: line.quantity,
        unitCost: Number(extraUnitLandedCost.toFixed(2)),
        totalCost: Number((line.quantity * extraUnitLandedCost).toFixed(2)),
      });
    } else {
      subLayers.push({
        variantId: line.variantId,
        lineId: line.id,
        quantity: line.quantity,
        unitCost: Number(normalUnitLandedCost.toFixed(2)),
        totalCost: Number((line.quantity * normalUnitLandedCost).toFixed(2)),
      });
    }

    const lineTotalLandedCost = subLayers.reduce((sum, sl) => sum + sl.totalCost, 0);
    const displayLandedUnitCost = Number((lineTotalLandedCost / line.quantity).toFixed(2));

    resultLines.push({
      variantId: line.variantId,
      lineId: line.id,
      quantity: line.quantity,
      unitPurchasePrice: line.unitPurchasePrice,
      lineSubtotal: line.lineSubtotal,
      landedUnitCost: displayLandedUnitCost,
      subLayers,
    });

    allSubLayers.push(...subLayers);
  }

  return {
    totalUnits,
    subtotal: Number(subtotal.toFixed(2)),
    freight: Number(freight.toFixed(2)),
    totalLandedCost: Number(totalLandedCost.toFixed(2)),
    lines: resultLines,
    allSubLayers,
  };
}
