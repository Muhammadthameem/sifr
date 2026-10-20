'use client';

import React, { useState } from 'react';
import {
  VariantInventorySummary,
  performStockAdjustmentAction,
  getVariantInventoryDetail,
} from '@/lib/actions/inventory-actions';
import {
  Boxes,
  Search,
  Plus,
  Minus,
  Layers,
  History,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  TrendingDown,
  DollarSign,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface InventoryManagerProps {
  initialSummary: VariantInventorySummary[];
  initialLedger: any[];
}

export function InventoryManager({ initialSummary, initialLedger }: InventoryManagerProps) {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'LEDGER'>('OVERVIEW');
  const [summary, setSummary] = useState<VariantInventorySummary[]>(initialSummary);
  const [ledger, setLedger] = useState<any[]>(initialLedger);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Adjustment Modal State
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState<number | ''>(500);
  const [reason, setReason] = useState<any>('PHYSICAL_CORRECTION');
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Variant Detail Drawer State
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedVariantDetail, setSelectedVariantDetail] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const handleOpenAdjustment = (variantId?: string) => {
    const vId = variantId || (summary[0]?.variantId || '');
    setSelectedVariantId(vId);
    setDirection('IN');
    setQuantity(1);
    setUnitCost(500);
    setReason('PHYSICAL_CORRECTION');
    setNotes('Stock adjustment entry');
    setIdempotencyKey(`ADJ-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
    setAdjustError(null);
    setAdjustmentModalOpen(true);
  };

  const handleOpenDetail = async (variantId: string) => {
    setLoadingDetail(true);
    setDetailDrawerOpen(true);
    try {
      const detail = await getVariantInventoryDetail(variantId);
      setSelectedVariantDetail(detail);
    } catch (err: any) {
      alert(err.message || 'Failed to load variant detail');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjusting(true);
    setAdjustError(null);

    try {
      await performStockAdjustmentAction({
        variantId: selectedVariantId,
        direction,
        quantity: Number(quantity),
        unitCost: direction === 'IN' ? (unitCost !== '' ? Number(unitCost) : 0) : null,
        reason,
        notes,
        idempotencyKey,
      });

      alert(`Stock Adjustment ${direction} applied successfully.`);
      setAdjustmentModalOpen(false);
      window.location.reload();
    } catch (err: any) {
      setAdjustError(err.message || 'Stock adjustment failed');
    } finally {
      setAdjusting(false);
    }
  };

  const filteredSummary = summary.filter((s) => {
    const matchesSearch =
      s.productName.toLowerCase().includes(search.toLowerCase()) ||
      s.sku.toLowerCase().includes(search.toLowerCase()) ||
      s.variantTitle.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'IN_STOCK' && s.availableStock > 0) ||
      (statusFilter === 'OUT_OF_STOCK' && s.availableStock <= 0);

    return matchesSearch && matchesStatus;
  });

  const totalValuation = summary.reduce((sum, item) => sum + item.inventoryValuation, 0);
  const totalPhysicalUnits = summary.reduce((sum, item) => sum + item.physicalStock, 0);

  return (
    <div className="space-y-6">
      {/* Top Header & CTAs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-3">
            <Boxes className="w-6 h-6 text-neutral-400" />
            <span>Inventory & FIFO Costing</span>
          </h1>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            Physical Stock, Available Balance & FIFO Cost Layers
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleOpenAdjustment()}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-white text-black font-medium text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors shadow-lg"
          id="stock-adjustment-btn"
        >
          <Plus className="w-4 h-4" />
          <span>Stock Adjustment</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/40">
          <div className="text-xs font-mono tracking-wider uppercase text-neutral-500 mb-1">
            Total Inventory Valuation (FIFO)
          </div>
          <div className="text-2xl font-semibold font-mono text-white">
            ₹{totalValuation.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1 font-light">
            Based on acquisition FIFO layer costs
          </div>
        </div>

        <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/40">
          <div className="text-xs font-mono tracking-wider uppercase text-neutral-500 mb-1">
            Physical Stock Units
          </div>
          <div className="text-2xl font-semibold font-mono text-white">
            {totalPhysicalUnits.toLocaleString('en-IN')} units
          </div>
          <div className="text-[11px] text-neutral-500 mt-1 font-light">
            Total physical inventory owned
          </div>
        </div>

        <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/40">
          <div className="text-xs font-mono tracking-wider uppercase text-neutral-500 mb-1">
            Tracked Sellable Variants
          </div>
          <div className="text-2xl font-semibold font-mono text-white">
            {summary.length} variants
          </div>
          <div className="text-[11px] text-neutral-500 mt-1 font-light">
            Inventory tracked per ProductVariant
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-4 border-b border-neutral-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('OVERVIEW')}
          className={cn(
            'flex items-center space-x-2 py-2 px-4 rounded-lg text-xs font-medium tracking-wider uppercase transition-colors',
            activeTab === 'OVERVIEW'
              ? 'bg-neutral-800 text-white border border-neutral-700'
              : 'text-neutral-400 hover:text-white'
          )}
        >
          <Boxes className="w-4 h-4" />
          <span>Stock Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('LEDGER')}
          className={cn(
            'flex items-center space-x-2 py-2 px-4 rounded-lg text-xs font-medium tracking-wider uppercase transition-colors',
            activeTab === 'LEDGER'
              ? 'bg-neutral-800 text-white border border-neutral-700'
              : 'text-neutral-400 hover:text-white'
          )}
        >
          <History className="w-4 h-4" />
          <span>Movement Ledger</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-4">
          {/* Search Toolbar */}
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60 backdrop-blur-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search variant by product name or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-600"
            >
              <option value="ALL">All Stock Statuses</option>
              <option value="IN_STOCK">In Stock (&gt; 0)</option>
              <option value="OUT_OF_STOCK">Out of Stock (0)</option>
            </select>
          </div>

          {/* Table */}
          <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-900 text-neutral-400 font-mono uppercase text-[10px] tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="py-3.5 px-4">Product Variant</th>
                  <th className="py-3.5 px-4">SKU</th>
                  <th className="py-3.5 px-4 text-center">Physical Stock</th>
                  <th className="py-3.5 px-4 text-center">Reserved Stock</th>
                  <th className="py-3.5 px-4 text-center">Available Stock</th>
                  <th className="py-3.5 px-4 text-right">FIFO Valuation (₹)</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 text-neutral-300 font-light">
                {filteredSummary.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-neutral-500 font-mono text-xs">
                      No variants match the criteria.
                    </td>
                  </tr>
                ) : (
                  filteredSummary.map((item) => (
                    <tr key={item.variantId} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-white">
                        <div>
                          <div>{item.productName}</div>
                          <div className="text-[11px] font-mono text-neutral-400 font-normal">
                            Variant: {item.variantTitle}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-neutral-400">{item.sku}</td>
                      <td className="py-3.5 px-4 text-center font-mono text-white font-medium">
                        {item.physicalStock}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-neutral-400">
                        {item.reservedStock}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-semibold',
                            item.availableStock > 0
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                              : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                          )}
                        >
                          {item.availableStock}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-white">
                        ₹{item.inventoryValuation.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(item.variantId)}
                          className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-[11px] font-mono transition-colors"
                        >
                          FIFO Layers
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenAdjustment(item.variantId)}
                          className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-[11px] font-mono transition-colors"
                        >
                          Adjust
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: LEDGER */}
      {activeTab === 'LEDGER' && (
        <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900 text-neutral-400 font-mono uppercase text-[10px] tracking-wider border-b border-neutral-800">
              <tr>
                <th className="py-3.5 px-4">Date & Time</th>
                <th className="py-3.5 px-4">Movement Type</th>
                <th className="py-3.5 px-4">Product Variant</th>
                <th className="py-3.5 px-4 text-center">Qty Change</th>
                <th className="py-3.5 px-4 text-right">Unit / Total Cost</th>
                <th className="py-3.5 px-4">Reason & Notes</th>
                <th className="py-3.5 px-4 font-mono">Idempotency Key</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-neutral-300 font-light">
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-500 font-mono text-xs">
                    No movements recorded in inventory ledger yet.
                  </td>
                </tr>
              ) : (
                ledger.map((m) => {
                  const isPositive = m.quantity > 0;
                  return (
                    <tr key={m.id} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-neutral-400 whitespace-nowrap">
                        {new Date(m.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-mono uppercase border',
                            isPositive
                              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                              : 'bg-rose-950/60 border-rose-800 text-rose-300'
                          )}
                        >
                          {m.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-white">{m.variant.product.name}</div>
                        <div className="text-[11px] font-mono text-neutral-400">{m.variant.sku} ({m.variant.title})</div>
                      </td>
                      <td className={cn('py-3.5 px-4 text-center font-mono font-semibold', isPositive ? 'text-emerald-400' : 'text-rose-400')}>
                        {isPositive ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-white">
                        {m.totalCost ? `₹${Number(m.totalCost).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {m.reason && (
                          <div className="text-[10px] font-mono text-amber-400 uppercase">{m.reason}</div>
                        )}
                        <div className="text-neutral-400 text-[11px] truncate max-w-xs">{m.notes || '—'}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[10px] text-neutral-500 truncate max-w-[120px]">
                        {m.idempotencyKey || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {adjustmentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-lg rounded-2xl p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <h3 className="text-base font-semibold text-white tracking-wide">
                Perform Stock Adjustment
              </h3>
              <button
                type="button"
                onClick={() => setAdjustmentModalOpen(false)}
                className="text-neutral-400 hover:text-white text-xs font-mono"
              >
                CLOSE [×]
              </button>
            </div>

            <form onSubmit={handleAdjustmentSubmit} className="space-y-4">
              {adjustError && (
                <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-900 text-rose-300 text-xs">
                  {adjustError}
                </div>
              )}

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                  Product Variant *
                </label>
                <select
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none"
                >
                  {summary.map((s) => (
                    <option key={s.variantId} value={s.variantId}>
                      {s.productName} — {s.variantTitle} ({s.sku}) [Stock: {s.physicalStock}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                    Direction *
                  </label>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as any)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="IN">IN (+ Add Physical Stock)</option>
                    <option value="OUT">OUT (- Consume FIFO Stock)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white font-mono focus:outline-none"
                  />
                </div>
              </div>

              {direction === 'IN' && (
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                    Unit Acquisition Cost (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value ? Number(e.target.value) : '')}
                    placeholder="e.g. 500"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white font-mono focus:outline-none"
                  />
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Required for IN adjustments to create the new FIFO acquisition cost layer.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                  Adjustment Reason *
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as any)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="DAMAGED">DAMAGED</option>
                  <option value="MISHANDLING">MISHANDLING</option>
                  <option value="SPOILAGE">SPOILAGE</option>
                  <option value="PHYSICAL_CORRECTION">PHYSICAL_CORRECTION</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                  Audit Notes / Reason Explanation *
                </label>
                <textarea
                  rows={2}
                  required
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Mandatory notes explaining stock movement..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                  Idempotency Key (Server Enforced) *
                </label>
                <input
                  type="text"
                  required
                  value={idempotencyKey}
                  onChange={(e) => setIdempotencyKey(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white font-mono focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setAdjustmentModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-neutral-400 hover:text-white text-xs font-mono uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjusting}
                  className="inline-flex items-center space-x-2 px-5 py-2 rounded-lg bg-white text-black font-medium text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors disabled:opacity-50"
                >
                  <span>{adjusting ? 'Processing...' : 'Apply Adjustment'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Variant Detail Drawer */}
      {detailDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end">
          <div className="bg-neutral-900 border-l border-neutral-800 w-full max-w-2xl h-full p-6 space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div>
                <h3 className="text-base font-semibold text-white tracking-wide">
                  Variant FIFO Layers & Ledger
                </h3>
                {selectedVariantDetail && (
                  <p className="text-xs font-mono text-neutral-400 mt-1">
                    {selectedVariantDetail.variant.product.name} — {selectedVariantDetail.variant.sku}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailDrawerOpen(false)}
                className="text-neutral-400 hover:text-white text-xs font-mono"
              >
                CLOSE [×]
              </button>
            </div>

            {loadingDetail || !selectedVariantDetail ? (
              <div className="py-20 text-center font-mono text-xs text-neutral-500">
                Loading FIFO layers...
              </div>
            ) : (
              <div className="space-y-6">
                {/* Stock Stats */}
                <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-xs">
                  <div>
                    <span className="text-neutral-500 block text-[10px]">PHYSICAL STOCK</span>
                    <span className="text-white font-semibold">{selectedVariantDetail.physicalStock}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[10px]">AVAILABLE STOCK</span>
                    <span className="text-emerald-400 font-semibold">{selectedVariantDetail.availableStock}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[10px]">VALUATION</span>
                    <span className="text-white font-semibold">₹{selectedVariantDetail.inventoryValuation.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Active FIFO Layers */}
                <div className="space-y-3">
                  <h4 className="text-xs font-mono uppercase tracking-widest text-neutral-400 flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-sky-400" />
                    <span>Active FIFO Cost Layers (Ordered createdAt ASC)</span>
                  </h4>

                  <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-neutral-900 text-neutral-400 uppercase text-[10px] border-b border-neutral-800">
                        <tr>
                          <th className="py-2.5 px-3">Created At</th>
                          <th className="py-2.5 px-3 text-center">Initial Qty</th>
                          <th className="py-2.5 px-3 text-center">Remaining Qty</th>
                          <th className="py-2.5 px-3 text-right">Unit Cost (₹)</th>
                          <th className="py-2.5 px-3 text-right">Layer Value (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800/60 font-light text-neutral-300">
                        {selectedVariantDetail.fifoLayers.map((l: any) => (
                          <tr key={l.id} className={cn(l.remainingQuantity === 0 && 'opacity-40 bg-neutral-900/40')}>
                            <td className="py-2.5 px-3 text-neutral-400">{new Date(l.createdAt).toLocaleString()}</td>
                            <td className="py-2.5 px-3 text-center">{l.initialQuantity}</td>
                            <td className="py-2.5 px-3 text-center font-semibold text-white">{l.remainingQuantity}</td>
                            <td className="py-2.5 px-3 text-right">₹{Number(l.unitCost).toLocaleString('en-IN')}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-white">
                              ₹{(l.remainingQuantity * Number(l.unitCost)).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Movement History */}
                <div className="space-y-3">
                  <h4 className="text-xs font-mono uppercase tracking-widest text-neutral-400 flex items-center space-x-2">
                    <History className="w-4 h-4 text-amber-400" />
                    <span>Variant Movement Ledger</span>
                  </h4>

                  <div className="space-y-2">
                    {selectedVariantDetail.movements.map((m: any) => (
                      <div key={m.id} className="p-3 rounded-lg border border-neutral-800 bg-neutral-950 flex items-center justify-between text-xs font-mono">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className={cn('font-semibold uppercase text-[10px]', m.quantity > 0 ? 'text-emerald-400' : 'text-rose-400')}>
                              {m.type}
                            </span>
                            <span className="text-neutral-500 text-[10px]">{new Date(m.createdAt).toLocaleString()}</span>
                          </div>
                          <div className="text-neutral-400 text-[11px] mt-0.5">{m.notes || '—'}</div>
                        </div>

                        <div className="text-right">
                          <div className={cn('font-semibold', m.quantity > 0 ? 'text-emerald-400' : 'text-rose-400')}>
                            {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                          </div>
                          {m.totalCost && (
                            <div className="text-[10px] text-neutral-400">
                              ₹{Number(m.totalCost).toLocaleString('en-IN')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
