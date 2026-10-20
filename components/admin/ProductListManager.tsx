'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { duplicateProduct, archiveProduct, unarchiveProduct, deleteProduct } from '@/lib/actions/product-actions';
import { Plus, Search, Shirt, Filter, Edit3, Copy, Archive, ArchiveRestore, Trash2, CheckCircle2, AlertCircle, Eye, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  gender: 'MEN' | 'WOMEN' | 'BOTH';
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  updatedAt: Date;
  category: { id: string; name: string };
  images: { url: string; altText: string | null }[];
  variants: { id: string; sellingPrice: any; mrp: any }[];
  _count: { variants: number };
  shippingCharge?: number | null;
}

interface ProductListManagerProps {
  initialProducts: ProductListItem[];
  categories: { id: string; name: string }[];
}

export function ProductListManager({ initialProducts, categories }: ProductListManagerProps) {
  const [products, setProducts] = useState<ProductListItem[]>(initialProducts);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [genderFilter, setGenderFilter] = useState('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<ProductListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDuplicate = async (p: ProductListItem) => {
    if (!confirm(`Duplicate product '${p.name}'? A new DRAFT product with fresh SKUs will be created.`)) {
      return;
    }

    setActionLoadingId(p.id);
    try {
      const duplicated = await duplicateProduct(p.id);
      alert(`Product duplicated successfully as '${duplicated.name}'.`);
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Failed to duplicate product');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleArchiveToggle = async (p: ProductListItem) => {
    const isArchiving = p.status !== 'ARCHIVED';
    const actionName = isArchiving ? 'Archive' : 'Unarchive';

    setActionLoadingId(p.id);
    try {
      if (isArchiving) {
        await archiveProduct(p.id);
        setProducts((prev) =>
          prev.map((item) => (item.id === p.id ? { ...item, status: 'ARCHIVED' } : item))
        );
      } else {
        await unarchiveProduct(p.id);
        setProducts((prev) =>
          prev.map((item) => (item.id === p.id ? { ...item, status: 'ACTIVE' } : item))
        );
      }
    } catch (err: any) {
      alert(err.message || `Failed to ${actionName.toLowerCase()} product`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenDeleteModal = (p: ProductListItem) => {
    setDeletingProduct(p);
    setDeleteError(null);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      await deleteProduct(deletingProduct.id);
      setProducts((prev) => prev.filter((p) => p.id !== deletingProduct.id));
      setDeleteModalOpen(false);
      setDeletingProduct(null);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete product.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    const matchesCategory = categoryFilter === 'ALL' || p.category.id === categoryFilter;
    const matchesGender = genderFilter === 'ALL' || p.gender === genderFilter;

    return matchesSearch && matchesStatus && matchesCategory && matchesGender;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Create CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-3">
            <Shirt className="w-6 h-6 text-neutral-400" />
            <span>Product Catalog</span>
          </h1>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            Distinct Catalog Products & Variant Management
          </p>
        </div>

        <Link
          href="/admin/products/create"
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-white text-black font-medium text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors shadow-lg"
          id="create-product-link"
        >
          <Plus className="w-4 h-4" />
          <span>Create Product</span>
        </Link>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/60 backdrop-blur-sm grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by name or slug..."
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
            <option value="DRAFT">DRAFT</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </div>

        {/* Category Filter */}
        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-600"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Gender Filter */}
        <div>
          <select
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-600"
          >
            <option value="ALL">All Genders</option>
            <option value="MEN">MEN</option>
            <option value="WOMEN">WOMEN</option>
            <option value="BOTH">MEN + WOMEN (BOTH)</option>
          </select>
        </div>
      </div>

      {/* Product Table */}
      <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-900 text-neutral-400 font-mono uppercase text-[10px] tracking-wider border-b border-neutral-800">
            <tr>
              <th className="py-3.5 px-4">Product</th>
              <th className="py-3.5 px-4">Category</th>
              <th className="py-3.5 px-4 text-center">Gender</th>
              <th className="py-3.5 px-4 text-center">Variants</th>
              <th className="py-3.5 px-4 text-center">Price Range</th>
              <th className="py-3.5 px-4 text-center">Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60 text-neutral-300 font-light">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-neutral-500 font-mono text-xs">
                  No products match the selected criteria.
                </td>
              </tr>
            ) : (
              filteredProducts.map((p) => {
                const prices = p.variants.map((v) => Number(v.sellingPrice));
                const minPrice = prices.length ? Math.min(...prices) : 0;
                const maxPrice = prices.length ? Math.max(...prices) : 0;
                const priceDisplay =
                  minPrice === maxPrice ? `₹${minPrice}` : `₹${minPrice} - ₹${maxPrice}`;

                return (
                  <tr key={p.id} className="hover:bg-neutral-800/30 transition-colors">
                    {/* Thumbnail + Name */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-lg bg-neutral-950 border border-neutral-800 overflow-hidden flex-shrink-0 relative">
                          {p.images[0] ? (
                            <Image
                              src={p.images[0].url}
                              alt={p.images[0].altText || p.name}
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-600 text-[10px] font-mono">
                              NO IMG
                            </div>
                          )}
                        </div>
                        <div>
                          <Link
                            href={`/admin/products/${p.id}/edit`}
                            className="font-medium text-white hover:underline transition-colors block"
                          >
                            {p.name}
                          </Link>
                          <span className="text-[10px] font-mono text-neutral-500">
                            /{p.slug}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[10px] font-mono text-neutral-300">
                        {p.category.name}
                      </span>
                    </td>

                    {/* Gender */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-wider bg-neutral-900 border border-neutral-800 text-neutral-300 uppercase">
                        {p.gender === 'BOTH' ? 'MEN + WOMEN' : p.gender}
                      </span>
                    </td>

                    {/* Variant Count */}
                    <td className="py-3.5 px-4 text-center font-mono text-neutral-300">
                      {p._count.variants} variants
                    </td>

                    {/* Price Range */}
                    <td className="py-3.5 px-4 text-center font-mono text-white">
                      <div>{priceDisplay}</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        Shipping: ₹{Number(p.shippingCharge ?? 0).toFixed(2)}
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase border',
                          p.status === 'ACTIVE'
                            ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                            : p.status === 'DRAFT'
                            ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                            : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                        )}
                      >
                        {p.status === 'ACTIVE' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                        {p.status === 'DRAFT' && <AlertCircle className="w-3 h-3 text-amber-400" />}
                        {p.status === 'ARCHIVED' && <Archive className="w-3 h-3 text-neutral-400" />}
                        <span>{p.status}</span>
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        {p.status === 'ACTIVE' && (
                          <Link
                            href={`/products/${p.slug}`}
                            target="_blank"
                            className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                            title="View on Storefront"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                        )}

                        <Link
                          href={`/admin/products/${p.id}/edit`}
                          className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                          title="Edit Product"
                        >
                          <Edit3 className="w-4 h-4" />
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleDuplicate(p)}
                          disabled={actionLoadingId === p.id}
                          className="p-1.5 rounded text-neutral-400 hover:text-sky-300 hover:bg-neutral-800 transition-colors"
                          title="Duplicate Product"
                        >
                          <Copy className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleArchiveToggle(p)}
                          disabled={actionLoadingId === p.id}
                          className="p-1.5 rounded text-neutral-400 hover:text-amber-300 hover:bg-neutral-800 transition-colors"
                          title={p.status === 'ARCHIVED' ? 'Unarchive Product' : 'Archive Product'}
                        >
                          {p.status === 'ARCHIVED' ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenDeleteModal(p)}
                          disabled={actionLoadingId === p.id}
                          className="p-1.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors"
                          title="Delete Product"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Product Confirmation Modal */}
      {deleteModalOpen && deletingProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl p-6 space-y-6 shadow-2xl">
            <div className="flex items-center space-x-3 border-b border-neutral-800 pb-4">
              <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-900 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white tracking-wide">
                  DELETE PRODUCT
                </h3>
                <p className="text-xs font-mono text-neutral-400">
                  {deletingProduct.name} ({deletingProduct.slug})
                </p>
              </div>
            </div>

            {deleteError ? (
              <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-900 text-rose-300 text-xs space-y-2">
                <div className="font-semibold text-rose-200">Deletion Blocked</div>
                <div>{deleteError}</div>
              </div>
            ) : (
              <div className="space-y-4 text-xs text-neutral-300 leading-relaxed">
                <p>
                  Are you sure you want to permanently delete <strong className="text-white">&quot;{deletingProduct.name}&quot;</strong>?
                </p>
                <p className="text-[11px] font-mono text-neutral-400 bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                  This action cannot be undone. Product variants and product-owned configuration will be permanently removed.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 rounded-lg text-neutral-400 hover:text-white text-xs font-mono uppercase"
              >
                {deleteError ? 'Close' : 'Cancel'}
              </button>
              {!deleteError && (
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={handleConfirmDelete}
                  className="inline-flex items-center space-x-2 px-5 py-2 rounded-lg bg-rose-600 text-white font-medium text-xs tracking-widest uppercase hover:bg-rose-700 transition-colors disabled:opacity-50"
                >
                  <span>{deleteLoading ? 'Deleting...' : 'Delete Product'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
