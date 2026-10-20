/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState } from 'react';
import {
  createVendor,
  updateVendor,
  toggleVendorActiveStatus,
  getVendorPurchaseHistory,
} from '@/lib/actions/vendor-actions';
import {
  Building2,
  Plus,
  Search,
  UserCheck,
  UserX,
  Edit3,
  History,
  AlertTriangle,
  Phone,
  Mail,
  MapPin,
  FileText,
  X,
  ShoppingBag,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface VendorItem {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  _count: { purchases: number };
}

interface VendorManagerProps {
  initialVendors: VendorItem[];
}

export function VendorManager({ initialVendors }: VendorManagerProps) {
  const [vendors, setVendors] = useState<VendorItem[]>(initialVendors);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<VendorItem | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // History Drawer State
  const [historyDrawerVendor, setHistoryDrawerVendor] = useState<any | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const openCreateModal = () => {
    setEditingVendor(null);
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setGstin('');
    setNotes('');
    setIsActive(true);
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (v: VendorItem) => {
    setEditingVendor(v);
    setName(v.name);
    setContactPerson(v.contactPerson || '');
    setPhone(v.phone || '');
    setEmail(v.email || '');
    setAddress(v.address || '');
    setGstin(v.gstin || '');
    setNotes(v.notes || '');
    setIsActive(v.isActive);
    setError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        name,
        contactPerson: contactPerson || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        gstin: gstin || null,
        notes: notes || null,
        isActive,
      };

      if (editingVendor) {
        const updated = await updateVendor(editingVendor.id, payload);
        setVendors((prev) =>
          prev.map((item) =>
            item.id === editingVendor.id ? { ...item, ...updated, _count: item._count } : item
          )
        );
      } else {
        const created = await createVendor(payload);
        setVendors((prev) => [{ ...created, _count: { purchases: 0 } }, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save vendor');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (v: VendorItem) => {
    const nextState = !v.isActive;
    try {
      await toggleVendorActiveStatus(v.id, nextState);
      setVendors((prev) =>
        prev.map((item) => (item.id === v.id ? { ...item, isActive: nextState } : item))
      );
    } catch (err: any) {
      alert(err.message || 'Failed to update vendor status');
    }
  };

  const handleOpenHistory = async (v: VendorItem) => {
    setLoadingHistory(true);
    try {
      const data = await getVendorPurchaseHistory(v.id);
      setHistoryDrawerVendor(data);
    } catch (err: any) {
      alert(err.message || 'Failed to load vendor history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const filteredVendors = vendors.filter((v) => {
    const matchesSearch =
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.contactPerson && v.contactPerson.toLowerCase().includes(search.toLowerCase())) ||
      (v.gstin && v.gstin.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && v.isActive) ||
      (statusFilter === 'INACTIVE' && !v.isActive);

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top CTA Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-3">
            <Building2 className="w-6 h-6 text-sky-400" />
            <span>Vendor Master Records</span>
          </h1>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            Supplier Directory & Purchase Relationship Management
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-white text-black font-medium text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors shadow-lg"
        >
          <Plus className="w-4 h-4" />
          <span>Add Vendor</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/60 backdrop-blur-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by vendor name, contact, or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
          />
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono text-neutral-400 uppercase">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
          >
            <option value="ALL">All Vendors</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Vendors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredVendors.map((v) => (
          <div
            key={v.id}
            className={cn(
              'p-5 rounded-2xl border bg-neutral-900/40 flex flex-col justify-between space-y-4 transition-all',
              v.isActive ? 'border-neutral-800 hover:border-neutral-700' : 'border-neutral-900 opacity-60'
            )}
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-white text-base tracking-tight">{v.name}</h3>
                  {v.contactPerson && (
                    <p className="text-xs text-neutral-400 font-light mt-0.5">
                      Attn: {v.contactPerson}
                    </p>
                  )}
                </div>

                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border',
                    v.isActive
                      ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/60 border-rose-800 text-rose-300'
                  )}
                >
                  {v.isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-neutral-300 font-light">
                {v.phone && (
                  <div className="flex items-center space-x-2 text-neutral-400 font-mono">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{v.phone}</span>
                  </div>
                )}
                {v.email && (
                  <div className="flex items-center space-x-2 text-neutral-400 font-mono">
                    <Mail className="w-3.5 h-3.5" />
                    <span>{v.email}</span>
                  </div>
                )}
                {v.gstin && (
                  <div className="flex items-center space-x-2 text-neutral-400 font-mono">
                    <FileText className="w-3.5 h-3.5" />
                    <span>GSTIN: {v.gstin}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => handleOpenHistory(v)}
                className="text-neutral-400 hover:text-white flex items-center space-x-1.5 font-mono text-[11px]"
              >
                <History className="w-3.5 h-3.5" />
                <span>{v._count.purchases} Purchases</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => openEditModal(v)}
                  className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                  title="Edit Vendor Details"
                >
                  <Edit3 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleActive(v)}
                  className={cn(
                    'p-1.5 rounded transition-colors',
                    v.isActive
                      ? 'text-neutral-400 hover:text-rose-400 hover:bg-rose-950/30'
                      : 'text-neutral-400 hover:text-emerald-400 hover:bg-emerald-950/30'
                  )}
                  title={v.isActive ? 'Deactivate Vendor' : 'Activate Vendor'}
                >
                  {v.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Create / Edit Vendor */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-lg font-semibold text-white">
                {editingVendor ? `Edit Vendor: ${editingVendor.name}` : 'Add New Vendor'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-900 text-rose-300 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                  Vendor Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Apex Textiles Pvt Ltd"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="e.g. Rajesh Kumar"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-neutral-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="supplier@apex.com"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-neutral-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="27AAAAA0000A1Z5"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-neutral-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                  Address
                </label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Factory Address, Industrial Estate, City..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-600"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="vendor-active-check"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-neutral-800 bg-neutral-950 text-white focus:ring-0"
                />
                <label htmlFor="vendor-active-check" className="text-xs text-neutral-300 font-mono">
                  Active Supplier Status
                </label>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-300 text-xs hover:bg-neutral-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-white text-black font-semibold text-xs uppercase tracking-wider hover:bg-neutral-200"
                >
                  {loading ? 'Saving...' : 'Save Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer: Vendor Purchase History */}
      {historyDrawerVendor && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
          <div className="bg-neutral-900 border-l border-neutral-800 w-full max-w-2xl h-full p-6 space-y-6 overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">{historyDrawerVendor.name}</h3>
                <p className="text-xs text-neutral-400 font-mono mt-0.5">
                  Historical Purchase Orders Ledger ({historyDrawerVendor.purchases.length} total)
                </p>
              </div>

              <button
                type="button"
                onClick={() => setHistoryDrawerVendor(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {historyDrawerVendor.purchases.length === 0 ? (
                <div className="py-12 text-center text-neutral-500 font-mono text-xs">
                  No historical purchases found for this vendor.
                </div>
              ) : (
                historyDrawerVendor.purchases.map((p: any) => (
                  <div key={p.id} className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="font-mono text-sm font-semibold text-white">{p.purchaseNumber}</span>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-mono uppercase border',
                            p.status === 'RECEIVED'
                              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                              : p.status === 'DRAFT'
                              ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                              : 'bg-neutral-800 border-neutral-700 text-neutral-500'
                          )}
                        >
                          {p.status}
                        </span>
                      </div>

                      <span className="text-xs font-mono text-neutral-400">
                        {new Date(p.purchaseDate).toLocaleDateString('en-IN')}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-neutral-900 p-2.5 rounded-lg border border-neutral-800/80">
                      <div>
                        <span className="text-[10px] text-neutral-500 block uppercase">Subtotal</span>
                        <span className="text-neutral-200">₹{Number(p.subtotal).toLocaleString('en-IN')}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-500 block uppercase">Freight</span>
                        <span className="text-neutral-200">₹{Number(p.freight).toLocaleString('en-IN')}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-500 block uppercase">Total Landed</span>
                        <span className="text-white font-semibold">₹{Number(p.totalLandedCost).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
