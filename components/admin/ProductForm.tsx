'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  createProduct,
  updateProduct,
  generateVariantCombinations,
  GeneratedVariant,
} from '@/lib/actions/product-actions';
import {
  Shirt,
  Upload,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Link2,
  Layers,
  Image as ImageIcon,
  DollarSign,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
}

interface ProductTargetOption {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface ProductFormProps {
  categories: CategoryOption[];
  existingProducts: ProductTargetOption[];
  initialData?: any; // If editing
}

export function ProductForm({ categories, existingProducts, initialData }: ProductFormProps) {
  const router = useRouter();
  const isEditing = Boolean(initialData);

  const [activeStep, setActiveStep] = useState<number>(1);

  // Step 1: Basic Info
  const [name, setName] = useState(initialData?.name || '');
  const [slug, setSlug] = useState(initialData?.slug || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [gender, setGender] = useState<'MEN' | 'WOMEN' | 'BOTH'>(initialData?.gender || 'BOTH');
  const [categoryId, setCategoryId] = useState(initialData?.categoryId || (categories[0]?.id || ''));
  const [status, setStatus] = useState<'DRAFT' | 'ACTIVE' | 'ARCHIVED'>(initialData?.status || 'DRAFT');
  const [shippingCharge, setShippingCharge] = useState<string>(() => {
    if (initialData?.shippingCharge !== undefined && initialData?.shippingCharge !== null) {
      return String(initialData.shippingCharge);
    }
    return '0.00';
  });

  // Step 2: Images
  const [images, setImages] = useState<{ id?: string; url: string; storageKey?: string | null; altText?: string | null; sortOrder: number }[]>(
    initialData?.images || []
  );
  const [uploadingImage, setUploadingImage] = useState(false);

  // Step 3: Options
  const [options, setOptions] = useState<{ id?: string; name: string; position: number; values: string[] }[]>(
    initialData?.options?.map((o: any) => ({
      id: o.id,
      name: o.name,
      position: o.position,
      values: o.values.map((v: any) => v.value),
    })) || [
      { name: 'Size', position: 0, values: ['S', 'M', 'L'] },
    ]
  );

  // Step 4: Variants
  const [variants, setVariants] = useState<{
    id?: string;
    title: string;
    sku: string;
    costPrice: number | null;
    mrp: number;
    sellingPrice: number;
    isAvailable: boolean;
  }[]>(
    initialData?.variants?.map((v: any) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      costPrice: v.costPrice ? Number(v.costPrice) : null,
      mrp: Number(v.mrp),
      sellingPrice: Number(v.sellingPrice),
      isAvailable: v.isAvailable,
    })) || [
      { title: 'S', sku: 'SKU-S', costPrice: null, mrp: 1999, sellingPrice: 1999, isAvailable: true },
      { title: 'M', sku: 'SKU-M', costPrice: null, mrp: 1999, sellingPrice: 1999, isAvailable: true },
      { title: 'L', sku: 'SKU-L', costPrice: null, mrp: 1999, sellingPrice: 1999, isAvailable: true },
    ]
  );

  // Step 5: Product Buttons
  const [buttons, setButtons] = useState<{
    id?: string;
    targetProductId: string;
    label: string;
    sortOrder: number;
    isActive: boolean;
  }[]>(
    initialData?.sourceButtons?.map((b: any) => ({
      id: b.id,
      targetProductId: b.targetProductId,
      label: b.label,
      sortOrder: b.sortOrder,
      isActive: b.isActive,
    })) || []
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<{ variantTitle: string; warningMessage: string }[]>([]);

  // Slug generator helper
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
    if (!isEditing) {
      setSlug(generateSlug(val));
    }
  };

  // Image upload handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingImage(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to upload image');
        }

        setImages((prev) => [
          ...prev,
          {
            url: data.data.url,
            storageKey: data.data.storageKey,
            altText: data.data.altText,
            sortOrder: prev.length,
          },
        ]);
      }
    } catch (err: any) {
      alert(err.message || 'Image upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Option handlers
  const handleAddOption = () => {
    setOptions((prev) => [...prev, { name: '', position: prev.length, values: [''] }]);
  };

  const handleRemoveOption = (index: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddOptionValue = (optionIndex: number) => {
    setOptions((prev) =>
      prev.map((opt, i) => (i === optionIndex ? { ...opt, values: [...opt.values, ''] } : opt))
    );
  };

  const handleRemoveOptionValue = (optionIndex: number, valIndex: number) => {
    setOptions((prev) =>
      prev.map((opt, i) =>
        i === optionIndex
          ? { ...opt, values: opt.values.filter((_, j) => j !== valIndex) }
          : opt
      )
    );
  };

  const handleOptionValueChange = (optionIndex: number, valIndex: number, value: string) => {
    setOptions((prev) =>
      prev.map((opt, i) =>
        i === optionIndex
          ? {
              ...opt,
              values: opt.values.map((v, j) => (j === valIndex ? value : v)),
            }
          : opt
      )
    );
  };

  // Cartesian Variant Matrix Generator
  const handleGenerateVariants = async () => {
    const productRef = slug || name || 'PRODUCT';
    const excludeIds = isEditing && initialData?.variants ? initialData.variants.map((v: any) => v.id).filter(Boolean) : [];
    const generated = await generateVariantCombinations(options, productRef, 1999, 1999, excludeIds);
    setVariants(generated as any);
  };

  // Variant change handler
  const handleVariantFieldChange = (index: number, field: string, value: any) => {
    setVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v))
    );
  };

  // Product Button handlers
  const handleAddButton = () => {
    const selectableTargets = existingProducts.filter((p) => p.id !== initialData?.id && p.status !== 'ARCHIVED');
    if (selectableTargets.length === 0) {
      alert('No other target products available to link.');
      return;
    }

    const defaultTarget = selectableTargets[0];
    setButtons((prev) => [
      ...prev,
      {
        targetProductId: defaultTarget.id,
        label: defaultTarget.name.replace(/^Oxford Shirt\s*/i, ''),
        sortOrder: prev.length,
        isActive: true,
      },
    ]);
  };

  const handleRemoveButton = (index: number) => {
    setButtons((prev) => prev.filter((_, i) => i !== index));
  };

  const handleButtonChange = (index: number, field: string, value: any) => {
    setButtons((prev) =>
      prev.map((b, i) => (i === index ? { ...b, [field]: value } : b))
    );
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setWarnings([]);

    try {
      const shippingChargeNum = Number(shippingCharge);
      if (shippingCharge.trim() === '' || isNaN(shippingChargeNum)) {
        setError('Shipping charge must be a valid number.');
        setLoading(false);
        return;
      }
      if (shippingChargeNum < 0) {
        setError('Shipping charge cannot be negative.');
        setLoading(false);
        return;
      }

      const payload = {
        name,
        slug,
        description: description || null,
        gender,
        categoryId,
        status,
        shippingCharge: shippingChargeNum,
        images,
        options,
        variants: variants.map((v) => ({
          id: v.id,
          title: v.title,
          sku: v.sku,
          costPrice: v.costPrice ? Number(v.costPrice) : null,
          mrp: Number(v.mrp),
          sellingPrice: Number(v.sellingPrice),
          isAvailable: v.isAvailable,
        })),
        buttons,
      };

      if (isEditing) {
        const result = await updateProduct({ ...payload, id: initialData.id });
        if (result.warnings && result.warnings.length > 0) {
          setWarnings(result.warnings);
        }
        alert('Product updated successfully.');
        router.push('/admin/products');
      } else {
        const result = await createProduct(payload);
        if (result.warnings && result.warnings.length > 0) {
          setWarnings(result.warnings);
        }
        alert('Product created successfully.');
        router.push('/admin/products');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save product.');
    } finally {
      setLoading(false);
    }
  };

  const STEPS = [
    { num: 1, title: 'Basic Info', icon: Shirt },
    { num: 2, title: 'Images', icon: ImageIcon },
    { num: 3, title: 'Options', icon: Layers },
    { num: 4, title: 'Variants', icon: Tag },
    { num: 5, title: 'Product Buttons', icon: Link2 },
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            {isEditing ? `Edit Product: ${initialData.name}` : 'Create New Product'}
          </h1>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            Single-Brand Fashion Product Architecture
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push('/admin/products')}
          className="text-xs font-mono text-neutral-400 hover:text-white uppercase tracking-wider"
        >
          ← Back to Products
        </button>
      </div>

      {/* Wizard Step Tabs */}
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

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-900 text-rose-300 text-xs flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="block font-semibold">Validation Error</strong>
              <span>{error}</span>
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-900/60 text-amber-300 text-xs space-y-2">
            <div className="flex items-center space-x-2 font-semibold text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Pricing Warning Notices</span>
            </div>
            <ul className="list-disc list-inside space-y-1 font-light">
              {warnings.map((w, idx) => (
                <li key={idx}>
                  <strong>{w.variantTitle}</strong>: {w.warningMessage}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* STEP 1: Basic Info */}
        {activeStep === 1 && (
          <div className="bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl space-y-6">
            <h3 className="text-sm font-semibold text-white tracking-wider uppercase border-b border-neutral-800 pb-3">
              Step 1 — Basic Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Oxford Shirt White"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
                  id="product-name-input"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                  URL Slug *
                </label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="e.g. oxford-shirt-white"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
                  id="product-slug-input"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                  Category *
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-neutral-500"
                >
                  {categories.map((c) => {
                    const parent = c.parentId ? categories.find((p) => p.id === c.parentId) : null;
                    const label = parent ? `${parent.name} › ${c.name}` : c.name;
                    return (
                      <option key={c.id} value={c.id}>
                        {label} ({c.slug})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                  Gender Target *
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-neutral-500"
                >
                  <option value="MEN">MEN</option>
                  <option value="WOMEN">WOMEN</option>
                  <option value="BOTH">MEN + WOMEN (BOTH)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                  Product Status *
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-neutral-500"
                >
                  <option value="DRAFT">DRAFT (Hidden from Storefront)</option>
                  <option value="ACTIVE">ACTIVE (Visible on Storefront)</option>
                  <option value="ARCHIVED">ARCHIVED (Archived Product)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                  Shipping Charge *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-neutral-500 font-mono text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={shippingCharge}
                    onChange={(e) => setShippingCharge(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-8 pr-3.5 py-2.5 text-sm text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
                    id="product-shipping-charge-input"
                  />
                </div>
                <p className="text-[11px] text-neutral-500 mt-1.5 font-light">
                  Shipping charge per unit of this product. The final order shipping is subject to the global shipping cap.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                Product Description
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed fashion description, fabric specification, and fit notes..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
              />
            </div>
          </div>
        )}

        {/* STEP 2: Images */}
        {activeStep === 2 && (
          <div className="bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl space-y-6">
            <div className="border-b border-neutral-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white tracking-wider uppercase">
                  Step 2 — Product Gallery Images
                </h3>
                <p className="text-xs text-neutral-400 mt-1 font-light">
                  Images belong to the <strong>Product</strong> (shared by size variants). Do not duplicate images per size.
                </p>
              </div>

              <label className="cursor-pointer inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-white text-black font-medium text-xs uppercase tracking-widest hover:bg-neutral-200 transition-colors">
                <Upload className="w-4 h-4" />
                <span>{uploadingImage ? 'Uploading...' : 'Upload Image'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploadingImage}
                  id="product-image-file-input"
                />
              </label>
            </div>

            {/* Gallery Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {images.map((img, idx) => (
                <div key={idx} className="group relative rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden h-40">
                  <Image src={img.url} alt={img.altText || 'Product image'} fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover" />
                  <div className="absolute top-2 right-2 flex space-x-1">
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="p-1 rounded bg-black/70 text-rose-400 hover:text-white transition-colors"
                      title="Remove Image"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-2 bg-neutral-900 border-t border-neutral-800">
                    <input
                      type="text"
                      placeholder="Alt text..."
                      value={img.altText || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setImages((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, altText: val } : item))
                        );
                      }}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[11px] text-neutral-300 placeholder-neutral-600 focus:outline-none"
                    />
                  </div>
                </div>
              ))}

              {images.length === 0 && (
                <div className="col-span-full py-12 text-center border-2 border-dashed border-neutral-800 rounded-xl text-neutral-500 text-xs font-mono">
                  No product images uploaded yet. Click &quot;Upload Image&quot; to add gallery items.
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Options */}
        {activeStep === 3 && (
          <div className="bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl space-y-6">
            <div className="border-b border-neutral-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white tracking-wider uppercase">
                  Step 3 — Dynamic Product Options
                </h3>
                <p className="text-xs text-neutral-400 mt-1 font-light">
                  Define product options (e.g. Size, Material, Fit). Color is NOT automatically a variant.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddOption}
                className="inline-flex items-center space-x-2 px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700 text-xs font-medium uppercase tracking-wider text-white hover:bg-neutral-700"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Option</span>
              </button>
            </div>

            <div className="space-y-6">
              {options.map((opt, optIndex) => (
                <div key={optIndex} className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-xs font-mono text-neutral-500">Option {optIndex + 1}</span>
                      <input
                        type="text"
                        placeholder="Option Name (e.g. Size, Fit)"
                        value={opt.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOptions((prev) =>
                            prev.map((o, i) => (i === optIndex ? { ...o, name: val } : o))
                          );
                        }}
                        className="bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-neutral-600"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveOption(optIndex)}
                      className="text-neutral-500 hover:text-rose-400 text-xs font-mono"
                    >
                      Delete Option
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-neutral-500 uppercase mb-2">
                      Option Values (e.g. S, M, L, XL)
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {opt.values.map((val, valIndex) => (
                        <div key={valIndex} className="flex items-center space-x-1 bg-neutral-900 border border-neutral-800 rounded px-2 py-1">
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => handleOptionValueChange(optIndex, valIndex, e.target.value)}
                            className="bg-transparent text-xs text-white w-20 focus:outline-none font-mono"
                            placeholder="Value..."
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveOptionValue(optIndex, valIndex)}
                            className="text-neutral-500 hover:text-rose-400 text-xs"
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => handleAddOptionValue(optIndex)}
                        className="px-2 py-1 rounded bg-neutral-800 text-neutral-300 hover:text-white text-xs font-mono"
                      >
                        + Add Value
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: Variants */}
        {activeStep === 4 && (
          <div className="bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl space-y-6">
            <div className="border-b border-neutral-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white tracking-wider uppercase">
                  Step 4 — Product Variants & Pricing
                </h3>
                <p className="text-xs text-neutral-400 mt-1 font-light">
                  Exact sellable combinations. MRP, Selling Price, and Cost Price validation.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerateVariants}
                className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-xs font-medium uppercase tracking-wider text-white hover:bg-neutral-700"
              >
                <Layers className="w-4 h-4 text-sky-400" />
                <span>Generate Combinations</span>
              </button>
            </div>

            {/* Product-Level Shipping Charge */}
            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <label className="block text-xs font-mono text-neutral-300 uppercase font-medium">
                  Shipping Charge *
                </label>
                <p className="text-[11px] text-neutral-500 mt-0.5 font-light">
                  Shipping charge per unit of this product. The final order shipping is subject to the global shipping cap.
                </p>
              </div>
              <div className="relative w-full sm:w-44 flex-shrink-0">
                <span className="absolute left-3 top-2 text-neutral-500 font-mono text-xs">₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={shippingCharge}
                  onChange={(e) => setShippingCharge(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 pl-6 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-neutral-600"
                />
              </div>
            </div>

            {/* Variants Table */}
            <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-900 text-neutral-400 font-mono uppercase text-[10px] tracking-wider border-b border-neutral-800">
                  <tr>
                    <th className="py-3 px-4">Variant Title</th>
                    <th className="py-3 px-4">SKU *</th>
                    <th className="py-3 px-4">Cost Price (₹)</th>
                    <th className="py-3 px-4">MRP (₹) *</th>
                    <th className="py-3 px-4">Selling Price (₹) *</th>
                    <th className="py-3 px-4 text-center">Discount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-light">
                  {variants.map((v, vIdx) => {
                    const mrp = Number(v.mrp) || 0;
                    const sp = Number(v.sellingPrice) || 0;
                    const discountPct = mrp > 0 && sp < mrp ? Math.round(((mrp - sp) / mrp) * 100) : 0;
                    const isPriceBlocked = sp > mrp;

                    return (
                      <tr key={vIdx} className={cn('hover:bg-neutral-900/40', isPriceBlocked && 'bg-rose-950/20')}>
                        <td className="py-3 px-4 font-medium text-white">{v.title}</td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            required
                            value={v.sku}
                            onChange={(e) => handleVariantFieldChange(vIdx, 'sku', e.target.value)}
                            className="bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1 text-xs font-mono text-white w-32 focus:outline-none"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="number"
                            placeholder="Optional"
                            value={v.costPrice ?? ''}
                            onChange={(e) =>
                              handleVariantFieldChange(vIdx, 'costPrice', e.target.value ? Number(e.target.value) : null)
                            }
                            className="bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1 text-xs font-mono text-white w-24 focus:outline-none"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="number"
                            required
                            value={v.mrp}
                            onChange={(e) => handleVariantFieldChange(vIdx, 'mrp', Number(e.target.value))}
                            className="bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1 text-xs font-mono text-white w-24 focus:outline-none"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="number"
                            required
                            value={v.sellingPrice}
                            onChange={(e) => handleVariantFieldChange(vIdx, 'sellingPrice', Number(e.target.value))}
                            className={cn(
                              'bg-neutral-900 border rounded px-2.5 py-1 text-xs font-mono text-white w-24 focus:outline-none',
                              isPriceBlocked ? 'border-rose-500 bg-rose-950/40' : 'border-neutral-800'
                            )}
                          />
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {discountPct > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-[10px]">
                              {discountPct}% OFF
                            </span>
                          ) : (
                            <span className="text-neutral-500 text-[10px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STEP 5: Product Buttons */}
        {activeStep === 5 && (
          <div className="bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl space-y-6">
            <div className="border-b border-neutral-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white tracking-wider uppercase">
                  Step 5 — Product Buttons (Linked Products)
                </h3>
                <p className="text-xs text-neutral-400 mt-1 font-light">
                  Connect distinct products (e.g. <em>Oxford Shirt White</em> displays <code>[ Black ]</code> button linking to target product <em>Oxford Shirt Black</em>).
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddButton}
                className="inline-flex items-center space-x-2 px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700 text-xs font-medium uppercase tracking-wider text-white hover:bg-neutral-700"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Product Button</span>
              </button>
            </div>

            <div className="space-y-4">
              {buttons.map((btn, bIdx) => (
                <div key={bIdx} className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    <div>
                      <label className="block text-[11px] font-mono text-neutral-400 uppercase mb-1">
                        Button Display Text *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Black, Navy Blue"
                        value={btn.label}
                        onChange={(e) => handleButtonChange(bIdx, 'label', e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono text-neutral-400 uppercase mb-1">
                        Target Linked Product *
                      </label>
                      <select
                        value={btn.targetProductId}
                        onChange={(e) => handleButtonChange(bIdx, 'targetProductId', e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none"
                      >
                        {existingProducts
                          .filter((p) => p.id !== initialData?.id && p.status !== 'ARCHIVED')
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.slug})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveButton(bIdx)}
                    className="text-neutral-500 hover:text-rose-400 text-xs font-mono pt-4 md:pt-0"
                  >
                    Delete Button
                  </button>
                </div>
              ))}

              {buttons.length === 0 && (
                <div className="py-8 text-center border-2 border-dashed border-neutral-800 rounded-xl text-neutral-500 text-xs font-mono">
                  No product buttons configured. Click &quot;Add Product Button&quot; to link related products.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Wizard Controls */}
        <div className="flex items-center justify-between border-t border-neutral-800 pt-6">
          <button
            type="button"
            disabled={activeStep === 1}
            onClick={() => setActiveStep((prev) => Math.max(1, prev - 1))}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-neutral-800 text-white text-xs font-mono uppercase hover:bg-neutral-700 disabled:opacity-30"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Previous Step</span>
          </button>

          {activeStep < 5 ? (
            <button
              type="button"
              onClick={() => setActiveStep((prev) => Math.min(5, prev + 1))}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-white text-black font-medium text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors"
            >
              <span>Next Step</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center space-x-2 px-6 py-2.5 rounded-lg bg-emerald-500 text-black font-semibold text-xs tracking-widest uppercase hover:bg-emerald-400 transition-colors disabled:opacity-50 shadow-lg shadow-emerald-500/20"
              id="save-product-submit-btn"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Saving Product...' : isEditing ? 'Update Product' : 'Save & Publish Product'}</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
