/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { receivePurchaseAction, cancelPurchaseAction } from '@/lib/actions/purchase-actions';
import {
  ShoppingBag,
  Building2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Truck,
  Layers,
  ArrowLeft,
  FileText,
  Lock,
  Phone,
  Mail,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface PurchaseDetailProps {
  purchase: {
    id: string;
    purchaseNumber: string;
    purchaseDate: Date;
    status: 'DRAFT' | 'RECEIVED' | 'CANCELLED';
    subtotal: any;
    freight: any;
    totalLandedCost: any;
    totalUnits: number;
    vendorNameSnapshot: string;
    vendorContactSnapshot: string | null;
    vendorPhoneSnapshot: string | null;
    vendorEmailSnapshot: string | null;
    vendorAddressSnapshot: string | null;
    vendorGstinSnapshot: string | null;
    receivedAt: Date | null;
    notes: string | null;
    lines: {
      id: string;
      quantity: number;
      unitPurchasePrice: any;
      lineSubtotal: any;
      landedUnitCost: any;
      variant: {
        id: string;
        title: string;
        sku: string;
        product: { name: string };
      };
    }[];
    fifoLayers: {
      id: string;
      variantId: string;
      initialQuantity: number;
      remainingQuantity: number;
      unitCost: any;
      createdAt: Date;
    }[];
    inventoryMovements: {
      id: string;
      variantId: string;
      type: string;
      quantity: number;
      unitCost: any;
      totalCost: any;
      createdAt: Date;
    }[];
  };
}

export function PurchaseDetailView({ purchase }: PurchaseDetailProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReceive = async () => {
    if (
      !confirm(
        `Receive physical stock for Purchase '${purchase.purchaseNumber}'? Physical inventory will be increased immediately.`
      )
    ) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const idempotencyKey = `idempotency-receive-${purchase.id}-${Date.now()}`;
      await receivePurchaseAction({
        purchaseId: purchase.id,
        idempotencyKey,
      });

      alert(`Purchase '${purchase.purchaseNumber}' received successfully!`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to receive purchase.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm(`Cancel purchase draft '${purchase.purchaseNumber}'?`)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await cancelPurchaseAction(purchase.id);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel purchase.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-semibold text-white tracking-tight font-mono">
              {purchase.purchaseNumber}
            </h1>
            <span
              className={cn(
                'px-2.5 py-0.5 rounded-full text-xs font-mono uppercase border inline-flex items-center space-x-1',
                purchase.status === 'RECEIVED'
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : purchase.status === 'DRAFT'
                  ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                  : 'bg-rose-950/60 border-rose-800 text-rose-400'
              )}
            >
              {purchase.status === 'RECEIVED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
              {purchase.status === 'DRAFT' && <AlertCircle className="w-3.5 h-3.5 text-amber-400" />}
              {purchase.status === 'CANCELLED' && <XCircle className="w-3.5 h-3.5 text-rose-400" />}
              <span>{purchase.status}</span>
            </span>
          </div>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            Purchase Date: {new Date(purchase.purchaseDate).toLocaleDateString('en-IN')}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/admin/purchases"
            className="text-xs font-mono text-neutral-400 hover:text-white uppercase tracking-wider"
          >
            ← Back to Purchases
          </Link>

          {purchase.status === 'DRAFT' && (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={handleCancel}
                className="px-3.5 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-rose-400 hover:text-rose-300 text-xs font-mono uppercase"
              >
                Cancel Draft
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={handleReceive}
                className="px-4 py-2 rounded-lg bg-white text-black font-semibold text-xs uppercase tracking-wider hover:bg-neutral-200 shadow-lg"
              >
                {loading ? 'Receiving...' : 'Receive Stock Now'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-900 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Immutable Notice Banner */}
      {purchase.status === 'RECEIVED' && (
        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center space-x-3 text-xs text-neutral-300">
          <Lock className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <div>
            <strong className="font-semibold text-white">Immutable Received Document</strong>
            <p className="text-neutral-400 font-light mt-0.5">
              This purchase document was received on{' '}
              {purchase.receivedAt ? new Date(purchase.receivedAt).toLocaleString('en-IN') : 'N/A'}. Historical vendor snapshots, lines, and landed costs are immutable to preserve audit integrity.
            </p>
          </div>
        </div>
      )}

      {/* Grid: Vendor Snapshot & Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Vendor Snapshot */}
        <div className="p-5 rounded-2xl border border-neutral-800 bg-neutral-900/40 space-y-3">
          <h3 className="text-xs font-mono text-neutral-400 uppercase tracking-wider border-b border-neutral-800 pb-2 flex items-center space-x-2">
            <Building2 className="w-4 h-4 text-sky-400" />
            <span>Historical Vendor Snapshot</span>
          </h3>

          <div className="space-y-1.5 text-xs text-neutral-300">
            <div className="font-semibold text-white text-base">{purchase.vendorNameSnapshot}</div>
            {purchase.vendorContactSnapshot && (
              <div className="text-neutral-400 font-light">Attn: {purchase.vendorContactSnapshot}</div>
            )}
            {purchase.vendorPhoneSnapshot && (
              <div className="flex items-center space-x-2 text-neutral-400 font-mono">
                <Phone className="w-3.5 h-3.5 text-neutral-500" />
                <span>{purchase.vendorPhoneSnapshot}</span>
              </div>
            )}
            {purchase.vendorEmailSnapshot && (
              <div className="flex items-center space-x-2 text-neutral-400 font-mono">
                <Mail className="w-3.5 h-3.5 text-neutral-500" />
                <span>{purchase.vendorEmailSnapshot}</span>
              </div>
            )}
            {purchase.vendorGstinSnapshot && (
              <div className="flex items-center space-x-2 text-neutral-400 font-mono">
                <FileText className="w-3.5 h-3.5 text-neutral-500" />
                <span>GSTIN: {purchase.vendorGstinSnapshot}</span>
              </div>
            )}
          </div>
        </div>

        {/* Financial Totals */}
        <div className="p-5 rounded-2xl border border-neutral-800 bg-neutral-900/40 space-y-3 font-mono text-xs">
          <h3 className="text-xs font-mono text-neutral-400 uppercase tracking-wider border-b border-neutral-800 pb-2 flex items-center space-x-2">
            <Truck className="w-4 h-4 text-emerald-400" />
            <span>Document Totals & Freight Allocation</span>
          </h3>

          <div className="flex justify-between text-neutral-300">
            <span>Total Physical Units:</span>
            <span className="text-white font-semibold">{purchase.totalUnits} units</span>
          </div>
          <div className="flex justify-between text-neutral-300">
            <span>Subtotal:</span>
            <span className="text-white">₹{Number(purchase.subtotal).toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between text-neutral-300">
            <span>Freight Amount:</span>
            <span className="text-white">₹{Number(purchase.freight).toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between border-t border-neutral-800 pt-2 font-semibold">
            <span className="text-white">Total Landed Cost:</span>
            <span className="text-emerald-400 text-sm">
              ₹{Number(purchase.totalLandedCost).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* Line Items Breakdown Table */}
      <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40 space-y-0">
        <div className="p-4 bg-neutral-900 border-b border-neutral-800 font-mono text-xs font-semibold text-white uppercase flex items-center justify-between">
          <span>Purchase Line Items</span>
          <span className="text-neutral-400 text-[11px] font-normal">
            Equal Freight per unit = ₹
            {purchase.totalUnits > 0
              ? (Number(purchase.freight) / purchase.totalUnits).toFixed(2)
              : '0.00'}
          </span>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-900/60 text-neutral-400 font-mono uppercase text-[10px] tracking-wider border-b border-neutral-800">
            <tr>
              <th className="py-3 px-4">Product Variant</th>
              <th className="py-3 px-4">SKU</th>
              <th className="py-3 px-4 text-center">Quantity</th>
              <th className="py-3 px-4 text-right">Vendor Unit Price</th>
              <th className="py-3 px-4 text-right">Line Subtotal</th>
              <th className="py-3 px-4 text-right">Landed Unit Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60 text-neutral-300 font-light">
            {purchase.lines.map((l) => (
              <tr key={l.id} className="hover:bg-neutral-800/30">
                <td className="py-3 px-4 font-medium text-white">
                  {l.variant.product.name} — {l.variant.title}
                </td>
                <td className="py-3 px-4 font-mono text-neutral-400">{l.variant.sku}</td>
                <td className="py-3 px-4 text-center font-mono text-white">{l.quantity}</td>
                <td className="py-3 px-4 text-right font-mono text-neutral-300">
                  ₹{Number(l.unitPurchasePrice).toLocaleString('en-IN')}
                </td>
                <td className="py-3 px-4 text-right font-mono text-neutral-300">
                  ₹{Number(l.lineSubtotal).toLocaleString('en-IN')}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-400">
                  {l.landedUnitCost ? `₹${Number(l.landedUnitCost).toFixed(2)}` : 'Pending'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Linked Inventory & Audit Records (For Received Purchases) */}
      {purchase.status === 'RECEIVED' && (
        <div className="space-y-6 pt-4 border-t border-neutral-800">
          <h3 className="text-sm font-semibold text-white tracking-wider uppercase flex items-center space-x-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <span>Traceable Inventory & Audit Ledger Entries</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Generated FIFO Layers */}
            <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950">
              <div className="p-3 bg-neutral-900 border-b border-neutral-800 font-mono text-xs font-semibold text-neutral-300 uppercase">
                Generated FIFO Cost Layers ({purchase.fifoLayers.length})
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-900/60 text-neutral-400 font-mono uppercase text-[10px] border-b border-neutral-800">
                  <tr>
                    <th className="py-2 px-3">Layer ID</th>
                    <th className="py-2 px-3 text-center">Qty</th>
                    <th className="py-2 px-3 text-right">Landed Unit Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-mono text-neutral-300">
                  {purchase.fifoLayers.map((fl) => (
                    <tr key={fl.id}>
                      <td className="py-2 px-3 text-[10px] text-neutral-500">{fl.id.slice(0, 8)}...</td>
                      <td className="py-2 px-3 text-center text-white">{fl.initialQuantity}</td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-400">
                        ₹{Number(fl.unitCost).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Generated Inventory Movements */}
            <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950">
              <div className="p-3 bg-neutral-900 border-b border-neutral-800 font-mono text-xs font-semibold text-neutral-300 uppercase">
                Inventory Movements ({purchase.inventoryMovements.length})
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-900/60 text-neutral-400 font-mono uppercase text-[10px] border-b border-neutral-800">
                  <tr>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3 text-center">Qty</th>
                    <th className="py-2 px-3 text-right">Unit Cost</th>
                    <th className="py-2 px-3 text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-mono text-neutral-300">
                  {purchase.inventoryMovements.map((im) => (
                    <tr key={im.id}>
                      <td className="py-2 px-3 text-[10px] text-emerald-400 font-semibold">{im.type}</td>
                      <td className="py-2 px-3 text-center text-white">+{im.quantity}</td>
                      <td className="py-2 px-3 text-right text-neutral-300">
                        ₹{im.unitCost ? Number(im.unitCost).toFixed(2) : '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-white">
                        ₹{im.totalCost ? Number(im.totalCost).toLocaleString('en-IN') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
