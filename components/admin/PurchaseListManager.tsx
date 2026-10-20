/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Eye,
  Building2,
  Calendar,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface PurchaseListItem {
  id: string;
  purchaseNumber: string;
  purchaseDate: Date;
  status: 'DRAFT' | 'RECEIVED' | 'CANCELLED';
  subtotal: any;
  freight: any;
  totalLandedCost: any;
  totalUnits: number;
  vendorNameSnapshot: string;
  vendor: { id: string; name: string };
  lines: { id: string; quantity: number }[];
  createdAt: Date;
}

interface PurchaseListManagerProps {
  initialPurchases: PurchaseListItem[];
  vendors: { id: string; name: string }[];
}

export function PurchaseListManager({ initialPurchases, vendors }: PurchaseListManagerProps) {
  const [purchases] = useState<PurchaseListItem[]>(initialPurchases);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');

  const filteredPurchases = purchases.filter((p) => {
    const matchesSearch =
      p.purchaseNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.vendorNameSnapshot.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    const matchesVendor = vendorFilter === 'ALL' || p.vendor.id === vendorFilter;

    return matchesSearch && matchesStatus && matchesVendor;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-3">
            <ShoppingBag className="w-6 h-6 text-sky-400" />
            <span>Purchase Documents</span>
          </h1>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            Supplier Purchases, Equal Freight Allocation & Landed Costs
          </p>
        </div>

        <Link
          href="/admin/purchases/create"
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-white text-black font-medium text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors shadow-lg"
          id="create-purchase-link"
        >
          <Plus className="w-4 h-4" />
          <span>Create Purchase</span>
        </Link>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/60 backdrop-blur-sm grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by purchase number or vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
          />
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-600"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">DRAFT (Unreceived)</option>
            <option value="RECEIVED">RECEIVED (Inventory Added)</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        {/* Vendor Filter */}
        <div>
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-600"
          >
            <option value="ALL">All Vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Purchases Table */}
      <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-900 text-neutral-400 font-mono uppercase text-[10px] tracking-wider border-b border-neutral-800">
            <tr>
              <th className="py-3.5 px-4">PO Number</th>
              <th className="py-3.5 px-4">Vendor</th>
              <th className="py-3.5 px-4 text-center">Date</th>
              <th className="py-3.5 px-4 text-center">Units</th>
              <th className="py-3.5 px-4 text-right">Subtotal</th>
              <th className="py-3.5 px-4 text-right">Freight</th>
              <th className="py-3.5 px-4 text-right">Total Landed</th>
              <th className="py-3.5 px-4 text-center">Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60 text-neutral-300 font-light">
            {filteredPurchases.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-neutral-500 font-mono text-xs">
                  No purchase documents match the selected criteria.
                </td>
              </tr>
            ) : (
              filteredPurchases.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-semibold text-white">
                    <Link href={`/admin/purchases/${p.id}`} className="hover:underline">
                      {p.purchaseNumber}
                    </Link>
                  </td>

                  <td className="py-3.5 px-4 font-medium text-white">
                    {p.vendorNameSnapshot}
                  </td>

                  <td className="py-3.5 px-4 text-center font-mono text-neutral-400">
                    {new Date(p.purchaseDate).toLocaleDateString('en-IN')}
                  </td>

                  <td className="py-3.5 px-4 text-center font-mono text-neutral-300">
                    {p.totalUnits} units
                  </td>

                  <td className="py-3.5 px-4 text-right font-mono text-neutral-300">
                    ₹{Number(p.subtotal).toLocaleString('en-IN')}
                  </td>

                  <td className="py-3.5 px-4 text-right font-mono text-neutral-400">
                    ₹{Number(p.freight).toLocaleString('en-IN')}
                  </td>

                  <td className="py-3.5 px-4 text-right font-mono font-semibold text-white">
                    ₹{Number(p.totalLandedCost).toLocaleString('en-IN')}
                  </td>

                  <td className="py-3.5 px-4 text-center">
                    <span
                      className={cn(
                        'inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase border',
                        p.status === 'RECEIVED'
                          ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                          : p.status === 'DRAFT'
                          ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                          : 'bg-rose-950/60 border-rose-800 text-rose-400'
                      )}
                    >
                      {p.status === 'RECEIVED' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                      {p.status === 'DRAFT' && <AlertCircle className="w-3 h-3 text-amber-400" />}
                      {p.status === 'CANCELLED' && <XCircle className="w-3 h-3 text-rose-400" />}
                      <span>{p.status}</span>
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <Link
                      href={`/admin/purchases/${p.id}`}
                      className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors inline-block"
                      title="View Details / Receive"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
