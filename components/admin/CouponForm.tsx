'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createCouponAction, updateCouponAction } from '@/lib/actions/coupon-actions';
import { Tag, ArrowLeft, Save, AlertCircle } from 'lucide-react';

interface CouponFormProps {
  initialData?: any;
  isEdit?: boolean;
}

export function CouponForm({ initialData, isEdit = false }: CouponFormProps) {
  const router = useRouter();

  const [code, setCode] = useState(initialData?.code || '');
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>(
    initialData?.discountType || 'PERCENTAGE'
  );
  const [discountValue, setDiscountValue] = useState(initialData?.discountValue ? Number(initialData.discountValue) : '');
  const [minOrderValue, setMinOrderValue] = useState(initialData?.minOrderValue ? Number(initialData.minOrderValue) : '');
  const [maxDiscountAmount, setMaxDiscountAmount] = useState(
    initialData?.maxDiscountAmount ? Number(initialData.maxDiscountAmount) : ''
  );
  const [startDate, setStartDate] = useState(
    initialData?.startDate ? new Date(initialData.startDate).toISOString().slice(0, 16) : ''
  );
  const [endDate, setEndDate] = useState(
    initialData?.endDate ? new Date(initialData.endDate).toISOString().slice(0, 16) : ''
  );
  const [usageLimitGlobal, setUsageLimitGlobal] = useState(
    initialData?.usageLimitGlobal ? Number(initialData.usageLimitGlobal) : ''
  );
  const [usageLimitPerCustomer, setUsageLimitPerCustomer] = useState(
    initialData?.usageLimitPerCustomer ? Number(initialData.usageLimitPerCustomer) : ''
  );
  const [status, setStatus] = useState(initialData?.status || 'ACTIVE');

  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    initialData?.applicableProducts?.map((ap: any) => ap.productId) || []
  );
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    initialData?.applicableCategories?.map((ac: any) => ac.categoryId) || []
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLocked = isEdit && (initialData?.usageCountGlobal || 0) > 0;

  useEffect(() => {
    // Fetch products and categories for pickers
    async function fetchCatalogData() {
      try {
        const prodRes = await fetch('/api/admin/products').then((r) => r.json()).catch(() => null);
        if (prodRes?.products) setProducts(prodRes.products);

        const catRes = await fetch('/api/admin/categories').then((r) => r.json()).catch(() => null);
        if (catRes?.categories) setCategories(catRes.categories);
      } catch {}
    }
    fetchCatalogData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload: any = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || null,
        discountType,
        discountValue: Number(discountValue),
        minOrderValue: minOrderValue !== '' ? Number(minOrderValue) : null,
        maxDiscountAmount: maxDiscountAmount !== '' ? Number(maxDiscountAmount) : null,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
        usageLimitGlobal: usageLimitGlobal !== '' ? Number(usageLimitGlobal) : null,
        usageLimitPerCustomer: usageLimitPerCustomer !== '' ? Number(usageLimitPerCustomer) : null,
        status,
        productIds: selectedProductIds,
        categoryIds: selectedCategoryIds,
      };

      let res;
      if (isEdit && initialData?.id) {
        res = await updateCouponAction(initialData.id, payload);
      } else {
        res = await createCouponAction(payload);
      }

      if (res.success) {
        router.push('/admin/coupons');
        router.refresh();
      } else {
        setError(res.error || 'Failed to save coupon');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-amber-500" />
              {isEdit ? `Edit Coupon '${initialData?.code}'` : 'Create New Coupon'}
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              Define promotional discount codes, validity windows, and target applicability.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center space-x-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-neutral-950 font-medium text-xs rounded-lg transition-colors shadow-sm"
          id="btn-save-coupon"
        >
          <Save className="w-4 h-4" />
          <span>{loading ? 'Saving...' : isEdit ? 'Update Coupon' : 'Create Coupon'}</span>
        </button>
      </div>

      {isLocked && (
        <div className="p-4 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Core Fields Locked</p>
            <p className="text-amber-400/80 mt-0.5">
              This coupon has already been redeemed in orders. Code, discount values, minimum order value, and target restrictions cannot be modified to preserve historical predictability.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Form Fields */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider font-mono border-b border-neutral-800 pb-3">
          1. Basic Details
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Coupon Code <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              disabled={isLocked}
              placeholder="e.g. SAVE20"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-500 uppercase disabled:opacity-60"
            />
            <p className="text-[10px] text-neutral-500 mt-1">Alphanumeric characters, hyphens, and underscores only.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Coupon Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Summer Festival Special 20% Off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-neutral-700"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-neutral-300 mb-1">Description</label>
            <textarea
              rows={2}
              placeholder="Internal notes or customer promotion details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-neutral-700"
            />
          </div>
        </div>

        <h2 className="text-sm font-semibold text-white uppercase tracking-wider font-mono border-b border-neutral-800 pb-3 pt-4">
          2. Discount Configuration
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Discount Type <span className="text-rose-500">*</span>
            </label>
            <select
              disabled={isLocked}
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as any)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-neutral-700 disabled:opacity-60"
            >
              <option value="PERCENTAGE">PERCENTAGE (% Off)</option>
              <option value="FIXED_AMOUNT">FIXED_AMOUNT (₹ Flat Off)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Discount Value ({discountType === 'PERCENTAGE' ? '%' : '₹'}) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              required
              disabled={isLocked}
              placeholder={discountType === 'PERCENTAGE' ? '20' : '500'}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-neutral-700 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Min Order Value (₹) <span className="text-neutral-500">(Optional)</span>
            </label>
            <input
              type="number"
              step="0.01"
              disabled={isLocked}
              placeholder="e.g. 1000"
              value={minOrderValue}
              onChange={(e) => setMinOrderValue(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-neutral-700 disabled:opacity-60"
            />
          </div>

          {discountType === 'PERCENTAGE' && (
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Max Discount Cap (₹) <span className="text-neutral-500">(Optional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                disabled={isLocked}
                placeholder="e.g. 500"
                value={maxDiscountAmount}
                onChange={(e) => setMaxDiscountAmount(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-neutral-700 disabled:opacity-60"
              />
            </div>
          )}
        </div>

        <h2 className="text-sm font-semibold text-white uppercase tracking-wider font-mono border-b border-neutral-800 pb-3 pt-4">
          3. Validity & Limits
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Start Date & Time</label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-neutral-700"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">End Date & Time</label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-neutral-700"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Global Total Usage Limit</label>
            <input
              type="number"
              placeholder="e.g. 100 (Leave empty for unlimited)"
              value={usageLimitGlobal}
              onChange={(e) => setUsageLimitGlobal(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-neutral-700"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Per-Customer Usage Limit</label>
            <input
              type="number"
              placeholder="e.g. 1 (Leave empty for unlimited)"
              value={usageLimitPerCustomer}
              onChange={(e) => setUsageLimitPerCustomer(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-neutral-700"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-neutral-700"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="DRAFT">DRAFT</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </div>
        </div>

        <h2 className="text-sm font-semibold text-white uppercase tracking-wider font-mono border-b border-neutral-800 pb-3 pt-4">
          4. Applicability Restrictions (Optional)
        </h2>

        <p className="text-xs text-neutral-400">
          Leave both selections empty to make this coupon <strong>unrestricted</strong> (applies to all products in catalog).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Category Picker */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-2">Target Categories</label>
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
              {categories.length === 0 ? (
                <p className="text-xs text-neutral-500">No categories found.</p>
              ) : (
                categories.map((cat) => (
                  <label key={cat.id} className="flex items-center space-x-2 text-xs text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={isLocked}
                      checked={selectedCategoryIds.includes(cat.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCategoryIds([...selectedCategoryIds, cat.id]);
                        } else {
                          setSelectedCategoryIds(selectedCategoryIds.filter((id) => id !== cat.id));
                        }
                      }}
                      className="rounded border-neutral-700 bg-neutral-900 text-amber-500 focus:ring-amber-500"
                    />
                    <span>{cat.name}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">Includes all subcategories/descendants automatically.</p>
          </div>

          {/* Product Picker */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-2">Target Specific Products</label>
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
              {products.length === 0 ? (
                <p className="text-xs text-neutral-500">No products found.</p>
              ) : (
                products.map((prod) => (
                  <label key={prod.id} className="flex items-center space-x-2 text-xs text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={isLocked}
                      checked={selectedProductIds.includes(prod.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProductIds([...selectedProductIds, prod.id]);
                        } else {
                          setSelectedProductIds(selectedProductIds.filter((id) => id !== prod.id));
                        }
                      }}
                      className="rounded border-neutral-700 bg-neutral-900 text-amber-500 focus:ring-amber-500"
                    />
                    <span>{prod.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
