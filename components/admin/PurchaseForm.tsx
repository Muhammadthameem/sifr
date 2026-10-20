'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPurchaseAction, receivePurchaseAction } from '@/lib/actions/purchase-actions';
import { calculateLandedCosts } from '@/lib/purchasing/landed-cost';
import {
  ShoppingBag,
  Building2,
  Calendar,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ArrowRight,
  ArrowLeft,
  Truck,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface VendorOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface VariantOption {
  id: string;
  title: string;
  sku: string;
  product: { name: string };
}

interface PurchaseFormProps {
  vendors: VendorOption[];
  variants: VariantOption[];
}

export function PurchaseForm({ vendors, variants }: PurchaseFormProps) {
  const router = useRouter();
  const activeVendors = vendors.filter((v) => v.isActive);

  const [activeStep, setActiveStep] = useState<number>(1);

  // Form State
  const [vendorId, setVendorId] = useState(activeVendors[0]?.id || '');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [freight, setFreight] = useState(0);

  const [lines, setLines] = useState<{ variantId: string; quantity: number; unitPurchasePrice: number }[]>([
    { variantId: variants[0]?.id || '', quantity: 100, unitPurchasePrice: 500 },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Landed Cost Preview
  const calculation = calculateLandedCosts(lines, freight);

  // Line Handlers
  const handleAddLine = () => {
    const unusedVariant = variants.find((v) => !lines.some((l) => l.variantId === v.id));
    if (!unusedVariant) {
      alert('All available variants are already added to this purchase document.');
      return;
    }

    setLines((prev) => [...prev, { variantId: unusedVariant.id, quantity: 10, unitPurchasePrice: 500 }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) {
      alert('A purchase document must contain at least one line item.');
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    );
  };

  // Submit Handler
  const handleSaveDraft = async () => {
    setLoading(true);
    setError(null);

    try {
      const created = await createPurchaseAction({
        vendorId,
        purchaseDate,
        freight,
        notes,
        lines,
      });

      alert(`Purchase Draft '${created.purchaseNumber}' created successfully.`);
      router.push(`/admin/purchases/${created.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to save purchase draft.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndReceive = async () => {
    if (!confirm('Receive physical stock for this purchase immediately? Physical inventory will be increased and FIFO layers generated at landed costs.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Create Draft
      const draft = await createPurchaseAction({
        vendorId,
        purchaseDate,
        freight,
        notes,
        lines,
      });

      // 2. Receive Draft
      const idempotencyKey = `idempotency-receive-${draft.id}-${Date.now()}`;
      await receivePurchaseAction({
        purchaseId: draft.id,
        idempotencyKey,
      });

      alert(`Purchase '${draft.purchaseNumber}' received successfully into inventory!`);
      router.push(`/admin/purchases/${draft.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to receive purchase.');
    } finally {
      setLoading(false);
    }
  };

  const STEPS = [
    { num: 1, title: 'Vendor', icon: Building2 },
    { num: 2, title: 'Date & Notes', icon: Calendar },
    { num: 3, title: 'Line Items', icon: ShoppingBag },
    { num: 4, title: 'Freight & Landed Cost', icon: Truck },
    { num: 5, title: 'Review & Submit', icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Create Purchase Document</h1>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            Supplier Purchase Order & Equal-Per-Unit Landed Cost Engine
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push('/admin/purchases')}
          className="text-xs font-mono text-neutral-400 hover:text-white uppercase tracking-wider"
        >
          ← Back to Purchases
        </button>
      </div>

      {/* Step Tabs */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        {STEPS.map((s) => {
          const Icon = s.icon;
          const isActive = activeStep === s.num;
          return (
            <button
              key={s.num}
              type="button"
              onClick={() => setActiveStep(s.num)}
              className={cn(
                'flex items-center space-x-2 py-2 px-3 rounded-lg text-xs font-medium tracking-wider transition-all',
                isActive
                  ? 'bg-neutral-800 text-white border border-neutral-700'
                  : 'text-neutral-500 hover:text-neutral-300'
              )}
            >
              <Icon className={cn('w-4 h-4', isActive ? 'text-white' : 'text-neutral-500')} />
              <span>
                {s.num}. {s.title}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-900 text-rose-300 text-xs flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="block font-semibold">Validation Error</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* STEP 1: Select Vendor */}
      {activeStep === 1 && (
        <div className="bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl space-y-6">
          <h3 className="text-sm font-semibold text-white tracking-wider uppercase border-b border-neutral-800 pb-3">
            Step 1 — Select Supplier Vendor
          </h3>

          <div>
            <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
              Select Active Vendor *
            </label>
            {activeVendors.length === 0 ? (
              <div className="p-4 rounded-lg bg-amber-950/40 border border-amber-900 text-amber-300 text-xs">
                No active vendors found. Please create an active vendor in the Vendor Master first.
              </div>
            ) : (
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-neutral-500"
              >
                {activeVendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: Date & Notes */}
      {activeStep === 2 && (
        <div className="bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl space-y-6">
          <h3 className="text-sm font-semibold text-white tracking-wider uppercase border-b border-neutral-800 pb-3">
            Step 2 — Purchase Details & Notes
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                Purchase Date *
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-neutral-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                Purchase Notes / Invoice Ref
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Supplier Invoice #, Shipping Bill, Batch notes..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neutral-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Line Items */}
      {activeStep === 3 && (
        <div className="bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl space-y-6">
          <div className="border-b border-neutral-800 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wider uppercase">
                Step 3 — Purchased Product Variants
              </h3>
              <p className="text-xs text-neutral-400 mt-1 font-light">
                Add distinct ProductVariants purchased from the vendor. Duplicate variants are blocked.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAddLine}
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-xs font-medium uppercase tracking-wider text-white hover:bg-neutral-700"
            >
              <Plus className="w-4 h-4" />
              <span>Add Line Item</span>
            </button>
          </div>

          <div className="space-y-4">
            {lines.map((line, lIdx) => {
              const selectedVariant = variants.find((v) => v.id === line.variantId);
              const lineSubtotal = line.quantity * line.unitPurchasePrice;

              return (
                <div
                  key={lIdx}
                  className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                >
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                    <div>
                      <label className="block text-[11px] font-mono text-neutral-400 uppercase mb-1">
                        Product Variant *
                      </label>
                      <select
                        value={line.variantId}
                        onChange={(e) => handleLineChange(lIdx, 'variantId', e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-xs text-white focus:outline-none"
                      >
                        {variants.map((v) => {
                          const isAlreadySelected = lines.some(
                            (other, idx) => idx !== lIdx && other.variantId === v.id
                          );
                          return (
                            <option key={v.id} value={v.id} disabled={isAlreadySelected}>
                              {v.product.name} — {v.title} ({v.sku})
                              {isAlreadySelected ? ' (Already Selected)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono text-neutral-400 uppercase mb-1">
                        Quantity *
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={line.quantity}
                        onChange={(e) =>
                          handleLineChange(lIdx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))
                        }
                        className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-xs text-white font-mono focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono text-neutral-400 uppercase mb-1">
                        Vendor Unit Cost (₹) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={line.unitPurchasePrice}
                        onChange={(e) =>
                          handleLineChange(
                            lIdx,
                            'unitPurchasePrice',
                            Math.max(0, parseFloat(e.target.value) || 0)
                          )
                        }
                        className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-xs text-white font-mono focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-neutral-800">
                    <div className="text-right">
                      <span className="text-[10px] font-mono text-neutral-500 uppercase block">Line Subtotal</span>
                      <span className="font-mono text-xs font-semibold text-white">
                        ₹{lineSubtotal.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveLine(lIdx)}
                      className="p-1.5 rounded bg-neutral-900 text-neutral-500 hover:text-rose-400 transition-colors"
                      title="Remove Line"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 4: Freight & Landed Cost Calculation */}
      {activeStep === 4 && (
        <div className="bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl space-y-6">
          <div className="border-b border-neutral-800 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wider uppercase">
                Step 4 — Freight & Landed Cost Calculation
              </h3>
              <p className="text-xs text-neutral-400 mt-1 font-light">
                Freight is distributed <strong>equally across all physical units purchased</strong>. Fractional paise sub-layers are handled deterministically.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                Single Purchase Freight Amount (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={freight}
                onChange={(e) => setFreight(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-neutral-500"
              />
            </div>

            {/* Landed Summary */}
            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 space-y-2 font-mono text-xs">
              <div className="flex justify-between text-neutral-400">
                <span>Total Physical Units:</span>
                <span className="text-white font-semibold">{calculation.totalUnits} units</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Purchase Subtotal:</span>
                <span className="text-white">₹{calculation.subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Freight:</span>
                <span className="text-white">₹{calculation.freight.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-neutral-400 border-t border-neutral-800 pt-2 font-semibold">
                <span>Total Landed Cost:</span>
                <span className="text-emerald-400 text-sm">₹{calculation.totalLandedCost.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Sub-Layer Preview Table */}
          <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950">
            <div className="p-3 bg-neutral-900 border-b border-neutral-800 font-mono text-xs font-semibold text-white uppercase">
              Target FIFO Cost Layers & Landed Costs Preview
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-900/60 text-neutral-400 font-mono uppercase text-[10px] tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="py-2.5 px-4">Variant</th>
                  <th className="py-2.5 px-4 text-center">Sub-Layer Qty</th>
                  <th className="py-2.5 px-4 text-right">Vendor Unit Price</th>
                  <th className="py-2.5 px-4 text-right">Landed Unit Cost (₹)</th>
                  <th className="py-2.5 px-4 text-right">Sub-Layer Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 font-mono text-neutral-300">
                {calculation.lines.map((line, idx) => {
                  const variant = variants.find((v) => v.id === line.variantId);
                  return line.subLayers.map((sl, slIdx) => (
                    <tr key={`${idx}-${slIdx}`}>
                      <td className="py-2.5 px-4 font-sans text-white">
                        {variant ? `${variant.product.name} — ${variant.title}` : line.variantId}
                      </td>
                      <td className="py-2.5 px-4 text-center text-neutral-200">{sl.quantity}</td>
                      <td className="py-2.5 px-4 text-right text-neutral-400">₹{line.unitPurchasePrice}</td>
                      <td className="py-2.5 px-4 text-right font-semibold text-emerald-400">₹{sl.unitCost}</td>
                      <td className="py-2.5 px-4 text-right text-white">₹{sl.totalCost.toLocaleString('en-IN')}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STEP 5: Review & Submit */}
      {activeStep === 5 && (
        <div className="bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl space-y-6">
          <h3 className="text-sm font-semibold text-white tracking-wider uppercase border-b border-neutral-800 pb-3">
            Step 5 — Final Review & Submission
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 space-y-2 font-mono text-xs">
              <h4 className="font-sans font-semibold text-white text-sm border-b border-neutral-800 pb-2">
                Purchase Summary
              </h4>
              <div className="flex justify-between">
                <span className="text-neutral-400">Supplier Vendor:</span>
                <span className="text-white font-semibold">
                  {vendors.find((v) => v.id === vendorId)?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Purchase Date:</span>
                <span className="text-white">{purchaseDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Line Items:</span>
                <span className="text-white">{lines.length} variants</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Total Physical Units:</span>
                <span className="text-white">{calculation.totalUnits} units</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 space-y-2 font-mono text-xs">
              <h4 className="font-sans font-semibold text-white text-sm border-b border-neutral-800 pb-2">
                Financial Breakdown
              </h4>
              <div className="flex justify-between">
                <span className="text-neutral-400">Purchase Subtotal:</span>
                <span className="text-white">₹{calculation.subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Freight:</span>
                <span className="text-white">₹{calculation.freight.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-800 pt-2 font-semibold">
                <span className="text-white">Total Landed Cost:</span>
                <span className="text-emerald-400 text-sm">₹{calculation.totalLandedCost.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-end gap-4">
            <button
              type="button"
              disabled={loading}
              onClick={handleSaveDraft}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-neutral-800 text-white font-mono text-xs uppercase tracking-wider hover:bg-neutral-700 transition-colors"
            >
              {loading ? 'Processing...' : 'Save As Draft (No Stock Change)'}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={handleSaveAndReceive}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white text-black font-mono text-xs uppercase font-semibold tracking-wider hover:bg-neutral-200 transition-colors shadow-lg"
            >
              {loading ? 'Processing...' : 'Save & Receive Stock Immediately'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
