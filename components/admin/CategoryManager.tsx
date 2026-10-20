'use client';

import React, { useState, useMemo } from 'react';
import { createCategory, updateCategory, toggleCategoryActive, deleteCategory } from '@/lib/actions/category-actions';
import { Plus, Search, FolderTree, Edit2, CheckCircle2, XCircle, ArrowRight, CornerDownRight, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  parent?: { id: string; name: string } | null;
  _count?: { products: number };
}

interface CategoryManagerProps {
  initialCategories: CategoryItem[];
}

type ModalMode = 'create-parent' | 'create-subcategory' | 'edit';

export function CategoryManager({ initialCategories }: CategoryManagerProps) {
  const [categories, setCategories] = useState<CategoryItem[]>(initialCategories);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create-parent');
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);

  // Delete Modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<CategoryItem | null>(null);
  const [deleteBlockedReason, setDeleteBlockedReason] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Map for fast parent name lookups
  const categoryMap = useMemo(() => {
    const map = new Map<string, CategoryItem>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  // Filter top-level categories for subcategory parent dropdowns
  const topLevelCategories = useMemo(() => {
    return categories.filter((c) => !c.parentId);
  }, [categories]);

  // Hierarchically sorted categories for clean table display
  const hierarchicalCategories = useMemo(() => {
    const parents = categories.filter((c) => !c.parentId);
    parents.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    const result: CategoryItem[] = [];
    for (const parent of parents) {
      result.push(parent);
      const children = categories.filter((c) => c.parentId === parent.id);
      children.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      result.push(...children);
    }

    // Add any orphaned subcategories (whose parent doesn't exist in top level)
    const processedIds = new Set(result.map((c) => c.id));
    const remaining = categories.filter((c) => !processedIds.has(c.id));
    result.push(...remaining);

    return result;
  }, [categories]);

  const filteredCategories = hierarchicalCategories.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenCreateParent = () => {
    setEditingCategory(null);
    setModalMode('create-parent');
    setName('');
    setSlug('');
    setDescription('');
    setParentId('');
    setSortOrder(0);
    setIsActive(true);
    setError(null);
    setModalOpen(true);
  };

  const handleOpenCreateSubcategory = () => {
    setEditingCategory(null);
    setModalMode('create-subcategory');
    setName('');
    setSlug('');
    setDescription('');
    setParentId(topLevelCategories[0]?.id || '');
    setSortOrder(0);
    setIsActive(true);
    setError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (cat: CategoryItem) => {
    setEditingCategory(cat);
    setModalMode('edit');
    setName(cat.name);
    setSlug(cat.slug);
    setDescription(cat.description || '');
    setParentId(cat.parentId || '');
    setSortOrder(cat.sortOrder);
    setIsActive(cat.isActive);
    setError(null);
    setModalOpen(true);
  };

  const handleOpenDelete = (cat: CategoryItem) => {
    setDeletingCategory(cat);
    setError(null);

    // Count children categories in local state
    const childCount = categories.filter((c) => c.parentId === cat.id).length;
    const productCount = cat._count?.products ?? 0;

    if (productCount > 0 && childCount > 0) {
      setDeleteBlockedReason(
        `Cannot delete this category because it contains ${productCount} product(s) and ${childCount} subcategory(ies). Reassign products and move/delete subcategories before deleting.`
      );
    } else if (productCount > 0) {
      setDeleteBlockedReason(
        `Cannot delete this category because it contains ${productCount} product(s). Reassign the products before deleting the category.`
      );
    } else if (childCount > 0) {
      setDeleteBlockedReason(
        `Cannot delete this category because it contains ${childCount} subcategory(ies). Remove or move the subcategories before deleting the category.`
      );
    } else {
      setDeleteBlockedReason(null);
    }

    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingCategory || deleteBlockedReason) return;

    setDeleteLoading(true);
    setError(null);

    try {
      await deleteCategory(deletingCategory.id);
      setCategories((prev) => prev.filter((c) => c.id !== deletingCategory.id));
      setDeleteModalOpen(false);
      setDeletingCategory(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete category.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const generateSlug = (val: string) => {
    return val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!editingCategory) {
      setSlug(generateSlug(val));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let effectiveParentId: string | null = null;
    if (modalMode === 'create-parent') {
      effectiveParentId = null;
    } else if (modalMode === 'create-subcategory') {
      if (!parentId) {
        setError('Please select a Parent Category.');
        setLoading(false);
        return;
      }
      effectiveParentId = parentId;
    } else {
      effectiveParentId = parentId || null;
    }

    try {
      if (editingCategory) {
        const updated = await updateCategory({
          id: editingCategory.id,
          name,
          slug,
          description: description || null,
          parentId: effectiveParentId,
          sortOrder: Number(sortOrder),
          isActive,
        });

        setCategories((prev) =>
          prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
        );
      } else {
        const created = await createCategory({
          name,
          slug,
          description: description || null,
          parentId: effectiveParentId,
          sortOrder: Number(sortOrder),
          isActive,
        });

        setCategories((prev) => [...prev, created as any]);
      }

      setModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save category');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (cat: CategoryItem) => {
    try {
      const updated = await toggleCategoryActive(cat.id);
      setCategories((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, isActive: updated.isActive } : c))
      );
    } catch (err: any) {
      alert(err.message || 'Failed to toggle status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-3">
            <FolderTree className="w-6 h-6 text-neutral-400" />
            <span>Category Management</span>
          </h1>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            Dynamic Store Taxonomy & Parent-Child Hierarchy
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleOpenCreateParent}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-white text-black font-medium text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors shadow-lg"
            id="create-parent-category-btn"
          >
            <Plus className="w-4 h-4" />
            <span>Add Parent Category</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateSubcategory}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-neutral-800 border border-neutral-700 text-white font-medium text-xs tracking-widest uppercase hover:bg-neutral-700 transition-colors shadow-lg"
            id="create-subcategory-btn"
          >
            <CornerDownRight className="w-4 h-4 text-neutral-400" />
            <span>Add Subcategory</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60 backdrop-blur-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search categories by name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 transition-colors"
          />
        </div>
        <div className="text-xs font-mono text-neutral-400">
          Total Categories: <strong className="text-white">{categories.length}</strong> (
          <span className="text-emerald-400">{topLevelCategories.length} Top-Level</span>,{' '}
          <span className="text-neutral-300">{categories.length - topLevelCategories.length} Subcategories</span>)
        </div>
      </div>

      {/* Categories Table / Tree */}
      <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-900 text-neutral-400 font-mono uppercase text-[10px] tracking-wider border-b border-neutral-800">
            <tr>
              <th className="py-3.5 px-4">Category Name</th>
              <th className="py-3.5 px-4">Slug</th>
              <th className="py-3.5 px-4">Parent Category</th>
              <th className="py-3.5 px-4 text-center">Products</th>
              <th className="py-3.5 px-4 text-center">Sort Order</th>
              <th className="py-3.5 px-4 text-center">Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60 text-neutral-300 font-light">
            {filteredCategories.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-neutral-500 font-mono text-xs">
                  No categories found. Click &quot;+ Add Parent Category&quot; to create one.
                </td>
              </tr>
            ) : (
              filteredCategories.map((cat) => {
                const parentName = cat.parent?.name || categoryMap.get(cat.parentId || '')?.name;
                const isSubcategory = Boolean(cat.parentId);
                const hasChildren = categories.some((c) => c.parentId === cat.id);
                const hasProducts = (cat._count?.products ?? 0) > 0;
                const isDeletable = !hasChildren && !hasProducts;

                return (
                  <tr key={cat.id} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-white">
                      <div className="flex items-center space-x-2">
                        {isSubcategory ? (
                          <div className="flex items-center text-neutral-500 pl-3">
                            <CornerDownRight className="w-3.5 h-3.5 mr-1 text-neutral-400" />
                            <span className="text-white">{cat.name}</span>
                          </div>
                        ) : (
                          <span className="font-semibold text-white tracking-wide">{cat.name}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-neutral-400">{cat.slug}</td>
                    <td className="py-3.5 px-4">
                      {isSubcategory ? (
                        <span className="px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[10px] font-mono text-neutral-300">
                          {parentName || 'Parent'}
                        </span>
                      ) : (
                        <span className="text-neutral-500 text-[10px] font-mono">Top-Level</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-neutral-300">
                      {cat._count?.products ?? 0}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-neutral-400">
                      {cat.sortOrder}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(cat)}
                        className={cn(
                          'inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase border transition-colors',
                          cat.isActive
                            ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-emerald-900/60'
                            : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700'
                        )}
                        title={cat.isActive ? 'Click to Deactivate' : 'Click to Activate'}
                      >
                        {cat.isActive ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-neutral-500" />}
                        <span>{cat.isActive ? 'Active' : 'Inactive'}</span>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(cat)}
                          className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                          title="Edit Category"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDelete(cat)}
                          className={cn(
                            'p-1.5 rounded transition-colors',
                            isDeletable
                              ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-950/40'
                              : 'text-neutral-600 hover:text-rose-400 hover:bg-neutral-800'
                          )}
                          title={isDeletable ? 'Delete Category' : 'Category cannot be deleted'}
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

      {/* Delete Confirmation / Blocked Modal */}
      {deleteModalOpen && deletingCategory && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl p-6 space-y-6 shadow-2xl">
            <div className="flex items-center space-x-3 border-b border-neutral-800 pb-4">
              <div className={cn('p-2.5 rounded-xl border', deleteBlockedReason ? 'bg-amber-950/60 border-amber-900 text-amber-400' : 'bg-rose-950/60 border-rose-900 text-rose-400')}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white tracking-wide">
                  {deleteBlockedReason ? 'CANNOT DELETE CATEGORY' : 'DELETE CATEGORY'}
                </h3>
                <p className="text-xs font-mono text-neutral-400">
                  {deletingCategory.name} ({deletingCategory.slug})
                </p>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-900 text-rose-300 text-xs">
                {error}
              </div>
            )}

            {deleteBlockedReason ? (
              <div className="space-y-4">
                <p className="text-xs text-neutral-300 leading-relaxed bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                  {deleteBlockedReason}
                </p>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setDeleteModalOpen(false)}
                    className="px-5 py-2.5 rounded-lg bg-white text-black font-medium text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors"
                  >
                    Got It
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Are you sure you want to permanently delete <strong className="text-white">&quot;{deletingCategory.name}&quot;</strong>?
                </p>
                <p className="text-[11px] font-mono text-neutral-400 bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                  This category has no products or subcategories. This action cannot be undone.
                </p>

                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setDeleteModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-neutral-400 hover:text-white text-xs font-mono uppercase"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleteLoading}
                    onClick={handleConfirmDelete}
                    className="inline-flex items-center space-x-2 px-5 py-2 rounded-lg bg-rose-600 text-white font-medium text-xs tracking-widest uppercase hover:bg-rose-700 transition-colors disabled:opacity-50"
                  >
                    <span>{deleteLoading ? 'Deleting...' : 'Delete Category'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal / Drawer for Create & Edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-lg rounded-2xl p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <h3 className="text-base font-semibold text-white tracking-wide">
                {modalMode === 'create-parent' && 'CREATE PARENT CATEGORY'}
                {modalMode === 'create-subcategory' && 'CREATE SUBCATEGORY'}
                {modalMode === 'edit' && `Edit Category: ${editingCategory?.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-neutral-400 hover:text-white text-xs font-mono"
              >
                CLOSE [×]
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-900 text-rose-300 text-xs">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={modalMode === 'create-parent' ? 'e.g. Apparel, Footwear' : 'e.g. Shirts, T-shirts'}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
                  id="category-name-input"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                  URL Slug *
                </label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={modalMode === 'create-parent' ? 'e.g. apparel' : 'e.g. shirts'}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
                  id="category-slug-input"
                />
              </div>

              {/* Subcategory Parent Selection */}
              {modalMode === 'create-subcategory' && (
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                    Parent Category *
                  </label>
                  <select
                    required
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-neutral-500"
                    id="parent-category-select"
                  >
                    <option value="" disabled>
                      [ Select Parent Category ]
                    </option>
                    {topLevelCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.slug})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Edit Mode Parent Selection */}
              {modalMode === 'edit' && (
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                    Parent Category (Optional)
                  </label>
                  <select
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-neutral-500"
                  >
                    <option value="">None (Top-Level Category)</option>
                    {categories
                      .filter((c) => c.id !== editingCategory?.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.slug})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Category summary or editorial note..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-1">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-neutral-500"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-6">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-neutral-800 bg-neutral-950 text-white focus:ring-0"
                  />
                  <label htmlFor="isActive" className="text-xs text-neutral-300">
                    Active in Storefront
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-neutral-400 hover:text-white text-xs font-mono uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center space-x-2 px-5 py-2 rounded-lg bg-white text-black font-medium text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors disabled:opacity-50"
                  id="save-category-submit-btn"
                >
                  <span>{loading ? 'Saving...' : 'Save Category'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
