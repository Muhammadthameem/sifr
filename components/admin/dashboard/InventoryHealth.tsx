import React from 'react';
import { InventoryHealthSummary, DEFAULT_LOW_STOCK_THRESHOLD } from '@/lib/reports/report-service';
import { Boxes, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react';

interface InventoryHealthProps {
  inventory: InventoryHealthSummary;
}

export function InventoryHealth({ inventory }: InventoryHealthProps) {
  const formatCurrency = (val: number) =>
    `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl space-y-4">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
        <h3 className="text-sm font-medium text-white tracking-wide flex items-center space-x-2">
          <Boxes className="w-4 h-4 text-neutral-400" />
          <span>Inventory Health & Reorder Alerts</span>
        </h3>
        <span className="text-xs font-mono text-neutral-400">
          Valuation: <strong className="text-white font-semibold">{formatCurrency(inventory.inventoryFifoValuation)}</strong>
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
        {/* Physical Stock */}
        <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg space-y-1">
          <span className="text-[#666666] block text-[10px] uppercase">Physical Stock</span>
          <span className="text-lg font-semibold text-white block">{inventory.totalPhysicalUnits.toLocaleString('en-IN')}</span>
          <span className="text-[10px] text-neutral-500 font-sans">Total warehouse units</span>
        </div>

        {/* Reserved Stock */}
        <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg space-y-1">
          <span className="text-[#666666] block text-[10px] uppercase">Reserved Stock</span>
          <span className="text-lg font-semibold text-amber-400 block">{inventory.totalReservedUnits.toLocaleString('en-IN')}</span>
          <span className="text-[10px] text-neutral-500 font-sans">Pending cart/orders</span>
        </div>

        {/* Available Stock */}
        <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg space-y-1">
          <span className="text-[#666666] block text-[10px] uppercase">Available Stock</span>
          <span className="text-lg font-semibold text-emerald-400 block">{inventory.totalAvailableUnits.toLocaleString('en-IN')}</span>
          <span className="text-[10px] text-neutral-500 font-sans">Sellable balance</span>
        </div>

        {/* Low-Stock Variants */}
        <div className={`p-3 border rounded-lg space-y-1 ${inventory.lowStockCount > 0 ? 'bg-amber-950/30 border-amber-800/60' : 'bg-neutral-950 border-neutral-800'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-amber-300">Low Stock (&le;{DEFAULT_LOW_STOCK_THRESHOLD})</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <span className="text-lg font-semibold text-amber-400 block">{inventory.lowStockCount}</span>
          <span className="text-[10px] text-neutral-400 font-sans">Reorder threshold</span>
        </div>

        {/* Out-of-Stock Variants */}
        <div className={`p-3 border rounded-lg space-y-1 ${inventory.outOfStockCount > 0 ? 'bg-rose-950/30 border-rose-800/60' : 'bg-neutral-950 border-neutral-800'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-rose-300">Out of Stock</span>
            {inventory.outOfStockCount > 0 ? <XCircle className="w-3.5 h-3.5 text-rose-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          </div>
          <span className="text-lg font-semibold text-rose-400 block">{inventory.outOfStockCount}</span>
          <span className="text-[10px] text-neutral-400 font-sans">0 available units</span>
        </div>
      </div>
    </div>
  );
}
