'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { CmsSectionType } from '@prisma/client';
import {
  upsertCmsSectionAction,
  publishCmsSectionAction,
  searchProductsForCmsAction,
} from '@/lib/actions/cms-actions';
import {
  Layout,
  Plus,
  Trash2,
  Upload,
  Eye,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  Image as ImageIcon,
  Link as LinkIcon,
  Sparkles,
} from 'lucide-react';

export interface CmsSectionEditorProps {
  initialData?: any;
  onClose: () => void;
  onSaved: () => void;
}

export function CmsSectionEditor({ initialData, onClose, onSaved }: CmsSectionEditorProps) {
  const [type, setType] = useState<CmsSectionType>(initialData?.type || 'HERO');
  const [internalTitle, setInternalTitle] = useState(initialData?.internalTitle || '');
  const [heading, setHeading] = useState(initialData?.heading || '');
  const [subheading, setSubheading] = useState(initialData?.subheading || '');
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || '');
  const [imageStorageKey, setImageStorageKey] = useState(initialData?.imageStorageKey || '');
  const [altText, setAltText] = useState(initialData?.altText || '');
  const [viewAllUrl, setViewAllUrl] = useState(initialData?.viewAllUrl || '');
  const [sortOrder, setSortOrder] = useState<number>(initialData?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState<boolean>(initialData?.isActive ?? true);

  // Buttons
  const [buttons, setButtons] = useState<
    { id?: string; label: string; url: string; style: 'PRIMARY' | 'SECONDARY'; sortOrder: number }[]
  >(
    initialData?.buttons?.map((b: any, idx: number) => ({
      id: b.id,
      label: b.label,
      url: b.url,
      style: b.style || 'PRIMARY',
      sortOrder: b.sortOrder ?? idx,
    })) || []
  );

  // Products
  const [selectedProducts, setSelectedProducts] = useState<any[]>(
    initialData?.productLinks?.map((pl: any) => pl.product).filter(Boolean) || []
  );

  // Feature Cards
  const [featureCards, setFeatureCards] = useState<
    {
      id?: string;
      title: string;
      imageUrl: string;
      imageStorageKey?: string;
      buttonLabel: string;
      buttonUrl: string;
      sortOrder: number;
    }[]
  >(
    initialData?.featureCards?.map((fc: any, idx: number) => ({
      id: fc.id,
      title: fc.title,
      imageUrl: fc.imageUrl,
      imageStorageKey: fc.imageStorageKey || '',
      buttonLabel: fc.buttonLabel,
      buttonUrl: fc.buttonUrl,
      sortOrder: fc.sortOrder ?? idx,
    })) || []
  );

  // Product Search Modal
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  // Status & Notifications
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [cardUploadingIdx, setCardUploadingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!productSearchOpen) return;
    let isMounted = true;
    async function search() {
      setSearchingProducts(true);
      const res = await searchProductsForCmsAction(productQuery);
      if (isMounted && res.success && res.products) {
        setSearchResults(res.products);
      }
      if (isMounted) setSearchingProducts(false);
    }
    const timer = setTimeout(search, 250);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [productQuery, productSearchOpen]);

  // Image Upload helper
  const handleFileUpload = async (file: File, target: 'main' | number) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('subfolder', 'cms');

    if (target === 'main') {
      setUploadingImage(true);
    } else {
      setCardUploadingIdx(target);
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success && data.data) {
        if (target === 'main') {
          setImageUrl(data.data.url);
          setImageStorageKey(data.data.storageKey);
          if (!altText) setAltText(data.data.altText);
        } else {
          setFeatureCards((prev) =>
            prev.map((c, idx) =>
              idx === target
                ? { ...c, imageUrl: data.data.url, imageStorageKey: data.data.storageKey }
                : c
            )
          );
        }
      } else {
        setError(data.error || 'Failed to upload image');
      }
    } catch {
      setError('Image upload failed');
    } finally {
      setUploadingImage(false);
      setCardUploadingIdx(null);
    }
  };

  const handleAddButton = () => {
    if ((type === 'HERO' || type === 'IMAGE_BANNER') && buttons.length >= 2) {
      setError(`${type} section supports a maximum of 2 buttons.`);
      return;
    }
    setButtons([...buttons, { label: '', url: '', style: 'PRIMARY', sortOrder: buttons.length }]);
  };

  const handleRemoveButton = (index: number) => {
    setButtons(buttons.filter((_, idx) => idx !== index));
  };

  const handleAddFeatureCard = () => {
    if (featureCards.length >= 3) {
      setError('FEATURE_CARDS section requires exactly 3 cards.');
      return;
    }
    setFeatureCards([
      ...featureCards,
      {
        title: '',
        imageUrl: '',
        buttonLabel: 'Shop Now',
        buttonUrl: '/men',
        sortOrder: featureCards.length,
      },
    ]);
  };

  const handleRemoveFeatureCard = (index: number) => {
    setFeatureCards(featureCards.filter((_, idx) => idx !== index));
  };

  const handleAddProduct = (product: any) => {
    if (selectedProducts.some((p) => p.id === product.id)) return;

    if (type === 'PRODUCT_CAROUSEL' && selectedProducts.length >= 10) {
      setError('PRODUCT_CAROUSEL supports a maximum of 10 products.');
      return;
    }
    if (type === 'SPLIT_FEATURE' && selectedProducts.length >= 4) {
      setError('SPLIT_FEATURE supports exactly 4 products.');
      return;
    }

    setSelectedProducts([...selectedProducts, product]);
    setError(null);
  };

  const handleRemoveProduct = (productId: string) => {
    setSelectedProducts(selectedProducts.filter((p) => p.id !== productId));
  };

  const getPayloadInput = () => {
    return {
      id: initialData?.id,
      type,
      internalTitle: internalTitle.trim() || `${type} Section`,
      heading: heading.trim() || null,
      subheading: subheading.trim() || null,
      imageUrl: imageUrl.trim() || null,
      imageStorageKey: imageStorageKey.trim() || null,
      altText: altText.trim() || null,
      viewAllUrl: viewAllUrl.trim() || null,
      sortOrder,
      isActive,
      buttons,
      productIds: selectedProducts.map((p) => p.id),
      featureCards,
    };
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const input = getPayloadInput();
    const res = await upsertCmsSectionAction(input);

    if (res.success) {
      setSuccess('Draft section saved successfully!');
      setTimeout(() => {
        onSaved();
      }, 800);
    } else {
      setError(res.error || 'Failed to save draft');
    }
    setSaving(false);
  };

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    setSuccess(null);

    // First save latest draft
    const input = getPayloadInput();
    const saveRes = await upsertCmsSectionAction(input);

    if (!saveRes.success || !saveRes.section?.id) {
      setError(saveRes.error || 'Failed to save draft before publishing');
      setPublishing(false);
      return;
    }

    // Then execute explicit publish action
    const pubRes = await publishCmsSectionAction(saveRes.section.id);
    if (pubRes.success) {
      setSuccess('Section published successfully to live storefront!');
      setTimeout(() => {
        onSaved();
      }, 1000);
    } else {
      setError(pubRes.error || 'Publish failed');
    }
    setPublishing(false);
  };

  // Dimensional guidelines
  const getDimensionGuideline = () => {
    switch (type) {
      case 'HERO':
        return 'Recommended dimensions: 2400 × 1050 px (Desktop ~16:7) | 1080 × 1350 px (Mobile 4:5 optional)';
      case 'IMAGE_BANNER':
        return 'Recommended dimensions: 2400 × 1200 px (2:1 Banner Ratio)';
      case 'SPLIT_FEATURE':
        return 'Recommended dimensions: 1200 × 1500 px (4:5 Feature Ratio)';
      case 'FEATURE_CARDS':
        return 'Recommended dimensions for cards: 900 × 1200 px (3:4 Card Ratio)';
      default:
        return 'Recommended aspect ratio: 4:5 or 16:7';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400">
              <Layout className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {initialData ? `Edit Section: ${initialData.internalTitle}` : 'Create New CMS Section'}
              </h2>
              <p className="text-xs text-neutral-400">
                Configure content, buttons, products, and images for the storefront.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notifications */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-950/50 border border-rose-800/60 rounded-lg text-xs text-rose-300 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mx-6 mt-4 p-3 bg-emerald-950/50 border border-emerald-800/60 rounded-lg text-xs text-emerald-300 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Form Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
          {/* Section Type Selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-neutral-300 font-medium mb-1.5">Section Type *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CmsSectionType)}
                disabled={!!initialData}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
              >
                <option value="HERO">HERO — Main Hero Banner (Up to 2 Buttons)</option>
                <option value="PRODUCT_CAROUSEL">PRODUCT_CAROUSEL — 10 Product Horizontal Scroll</option>
                <option value="IMAGE_BANNER">IMAGE_BANNER — Promotional Full Width Banner</option>
                <option value="SPLIT_FEATURE">SPLIT_FEATURE — 50/50 Feature Image + 4 Products</option>
                <option value="FEATURE_CARDS">FEATURE_CARDS — 3 Promotional Cards</option>
              </select>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1.5">Internal Identification Title *</label>
              <input
                type="text"
                placeholder="e.g., Spring 2026 Hero Banner"
                value={internalTitle}
                onChange={(e) => setInternalTitle(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder-neutral-600 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Guidelines Banner */}
          <div className="p-3 bg-neutral-950 border border-neutral-800/80 rounded-lg flex items-center space-x-2 text-[11px] text-amber-400/90 font-mono">
            <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{getDimensionGuideline()}</span>
          </div>

          {/* Heading & Subheading */}
          {(type === 'HERO' || type === 'IMAGE_BANNER' || type === 'PRODUCT_CAROUSEL' || type === 'SPLIT_FEATURE' || type === 'FEATURE_CARDS') && (
            <div className="space-y-4 pt-2 border-t border-neutral-800/60">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">
                    Section Heading {type === 'PRODUCT_CAROUSEL' ? '*' : '(Optional)'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., NEW ARRIVALS"
                    value={heading}
                    onChange={(e) => setHeading(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder-neutral-600 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {type === 'PRODUCT_CAROUSEL' && (
                  <div>
                    <label className="block text-neutral-300 font-medium mb-1.5">View All Destination Link</label>
                    <input
                      type="text"
                      placeholder="e.g., /men or /women"
                      value={viewAllUrl}
                      onChange={(e) => setViewAllUrl(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder-neutral-600 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {(type === 'HERO' || type === 'IMAGE_BANNER' || type === 'SPLIT_FEATURE') && (
                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">Subheading / Description</label>
                  <textarea
                    rows={2}
                    placeholder="e.g., Crafted for precision. Designed for movement."
                    value={subheading}
                    onChange={(e) => setSubheading(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder-neutral-600 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Section Main Image Upload (for HERO, IMAGE_BANNER, SPLIT_FEATURE) */}
          {(type === 'HERO' || type === 'IMAGE_BANNER' || type === 'SPLIT_FEATURE') && (
            <div className="space-y-3 pt-2 border-t border-neutral-800/60">
              <label className="block text-neutral-300 font-medium">
                Main Image {type === 'IMAGE_BANNER' || type === 'SPLIT_FEATURE' ? '*' : '(Optional)'}
              </label>

              <div className="flex flex-col sm:flex-row items-start gap-4">
                {imageUrl ? (
                  <div className="relative w-40 h-24 rounded-lg overflow-hidden border border-neutral-700 bg-neutral-950 group">
                    <Image src={imageUrl} alt={altText || 'Section Image'} fill sizes="160px" className="object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        setImageUrl('');
                        setImageStorageKey('');
                      }}
                      className="absolute top-1 right-1 p-1 bg-black/80 text-rose-400 rounded hover:bg-black"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="w-40 h-24 rounded-lg border border-dashed border-neutral-700 bg-neutral-950/60 flex flex-col items-center justify-center text-neutral-500">
                    <ImageIcon className="w-6 h-6 mb-1" />
                    <span className="text-[10px]">No image set</span>
                  </div>
                )}

                <div className="flex-1 space-y-2 w-full">
                  <div className="flex items-center space-x-2">
                    <label className="inline-flex items-center space-x-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg cursor-pointer transition-colors text-xs font-medium border border-neutral-700">
                      <Upload className="w-4 h-4 text-neutral-400" />
                      <span>{uploadingImage ? 'Uploading...' : 'Upload Image'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, 'main');
                        }}
                      />
                    </label>

                    <span className="text-neutral-500 text-[11px]">OR enter URL below</span>
                  </div>

                  <input
                    type="text"
                    placeholder="Image URL (e.g. /uploads/cms/banner.jpg)"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-white text-xs placeholder-neutral-600 focus:border-amber-500 focus:outline-none"
                  />

                  <input
                    type="text"
                    placeholder="Alt Text (accessibility)"
                    value={altText}
                    onChange={(e) => setAltText(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-white text-xs placeholder-neutral-600 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Buttons Manager (for HERO & IMAGE_BANNER) */}
          {(type === 'HERO' || type === 'IMAGE_BANNER') && (
            <div className="space-y-3 pt-2 border-t border-neutral-800/60">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-neutral-300 font-medium">CTA Buttons (Max 2)</label>
                  <p className="text-[11px] text-neutral-500">Configure action buttons for hero or banner section.</p>
                </div>
                {buttons.length < 2 && (
                  <button
                    type="button"
                    onClick={handleAddButton}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 text-xs font-medium rounded-lg border border-neutral-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Button</span>
                  </button>
                )}
              </div>

              {buttons.length === 0 ? (
                <div className="p-3 text-center text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
                  No CTA buttons added. Click &quot;Add Button&quot; above.
                </div>
              ) : (
                <div className="space-y-2">
                  {buttons.map((btn, idx) => (
                    <div key={idx} className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg flex flex-col sm:flex-row items-center gap-3">
                      <span className="font-mono text-neutral-500 text-[11px]">#{idx + 1}</span>
                      <input
                        type="text"
                        placeholder="Label (e.g. SHOP MEN)"
                        value={btn.label}
                        onChange={(e) =>
                          setButtons(buttons.map((b, i) => (i === idx ? { ...b, label: e.target.value } : b)))
                        }
                        className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-white focus:border-amber-500 focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Destination URL (e.g. /men)"
                        value={btn.url}
                        onChange={(e) =>
                          setButtons(buttons.map((b, i) => (i === idx ? { ...b, url: e.target.value } : b)))
                        }
                        className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-white focus:border-amber-500 focus:outline-none"
                      />
                      <select
                        value={btn.style}
                        onChange={(e) =>
                          setButtons(
                            buttons.map((b, i) => (i === idx ? { ...b, style: e.target.value as 'PRIMARY' | 'SECONDARY' } : b))
                          )
                        }
                        className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-white focus:outline-none"
                      >
                        <option value="PRIMARY">PRIMARY (Black/Filled)</option>
                        <option value="SECONDARY">SECONDARY (Bordered)</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRemoveButton(idx)}
                        className="p-1.5 text-neutral-500 hover:text-rose-400 rounded hover:bg-neutral-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Product Links Picker (for PRODUCT_CAROUSEL & SPLIT_FEATURE) */}
          {(type === 'PRODUCT_CAROUSEL' || type === 'SPLIT_FEATURE') && (
            <div className="space-y-3 pt-2 border-t border-neutral-800/60">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-neutral-300 font-medium">
                    Linked Storefront Products ({selectedProducts.length} / {type === 'PRODUCT_CAROUSEL' ? 10 : 4})
                  </label>
                  <p className="text-[11px] text-neutral-500">
                    {type === 'PRODUCT_CAROUSEL'
                      ? 'Select up to 10 active products to display in the carousel.'
                      : 'Select exactly 4 active products for the 2×2 split feature grid.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setProductSearchOpen(true)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 text-xs font-medium rounded-lg border border-neutral-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Select Products</span>
                </button>
              </div>

              {selectedProducts.length === 0 ? (
                <div className="p-4 text-center text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
                  No products linked. Click &quot;Select Products&quot; to choose active catalog products.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedProducts.map((p, idx) => (
                    <div
                      key={p.id}
                      className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <span className="font-mono text-neutral-500 text-[10px]">#{idx + 1}</span>
                        {p.images?.[0]?.url && (
                          <div className="w-8 h-10 relative overflow-hidden rounded bg-neutral-900 flex-shrink-0">
                            <Image src={p.images[0].url} alt={p.name} fill sizes="32px" className="object-cover" />
                          </div>
                        )}
                        <div className="truncate">
                          <div className="font-medium text-white truncate">{p.name}</div>
                          <div className="text-[10px] text-neutral-400 font-mono">/{p.slug}</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveProduct(p.id)}
                        className="p-1 text-neutral-500 hover:text-rose-400 rounded hover:bg-neutral-800"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Feature Cards Manager (for FEATURE_CARDS) */}
          {type === 'FEATURE_CARDS' && (
            <div className="space-y-3 pt-2 border-t border-neutral-800/60">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-neutral-300 font-medium">Promotional Feature Cards (Exactly 3)</label>
                  <p className="text-[11px] text-neutral-500">Configure 3 cards displayed side-by-side on desktop.</p>
                </div>

                {featureCards.length < 3 && (
                  <button
                    type="button"
                    onClick={handleAddFeatureCard}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 text-xs font-medium rounded-lg border border-neutral-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Card</span>
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {featureCards.map((card, idx) => (
                  <div key={idx} className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                      <span className="font-mono text-amber-400 font-bold">Feature Card #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFeatureCard(idx)}
                        className="p-1 text-neutral-500 hover:text-rose-400 rounded hover:bg-neutral-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-neutral-400 mb-1">Card Title *</label>
                        <input
                          type="text"
                          placeholder="e.g., SUMMER OVERSIZED TEES"
                          value={card.title}
                          onChange={(e) =>
                            setFeatureCards(
                              featureCards.map((c, i) => (i === idx ? { ...c, title: e.target.value } : c))
                            )
                          }
                          className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-neutral-400 mb-1">Button Label *</label>
                        <input
                          type="text"
                          placeholder="e.g., EXPLORE TEES"
                          value={card.buttonLabel}
                          onChange={(e) =>
                            setFeatureCards(
                              featureCards.map((c, i) => (i === idx ? { ...c, buttonLabel: e.target.value } : c))
                            )
                          }
                          className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-neutral-400 mb-1">Button URL *</label>
                        <input
                          type="text"
                          placeholder="e.g., /categories/t-shirts"
                          value={card.buttonUrl}
                          onChange={(e) =>
                            setFeatureCards(
                              featureCards.map((c, i) => (i === idx ? { ...c, buttonUrl: e.target.value } : c))
                            )
                          }
                          className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-neutral-400 mb-1">Card Image URL (900×1200 px - 3:4) *</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            placeholder="Image URL"
                            value={card.imageUrl}
                            onChange={(e) =>
                              setFeatureCards(
                                featureCards.map((c, i) => (i === idx ? { ...c, imageUrl: e.target.value } : c))
                              )
                            }
                            className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-white focus:border-amber-500 focus:outline-none"
                          />
                          <label className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded cursor-pointer border border-neutral-700">
                            <Upload className="w-4 h-4" />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(file, idx);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPreviewOpen(!previewOpen)}
            className="inline-flex items-center space-x-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-medium border border-neutral-700"
          >
            <Eye className="w-4 h-4 text-amber-400" />
            <span>{previewOpen ? 'Hide Draft Preview' : 'Preview Draft State'}</span>
          </button>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-medium"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || publishing}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 rounded-lg text-xs font-medium transition-colors"
            >
              {saving ? 'Saving Draft...' : 'Save Draft'}
            </button>

            <button
              type="button"
              onClick={handlePublish}
              disabled={saving || publishing}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-neutral-950 font-semibold rounded-lg text-xs transition-colors shadow-sm"
            >
              {publishing ? 'Publishing...' : 'Publish to Live'}
            </button>
          </div>
        </div>

        {/* Live Preview Drawer Overlay */}
        {previewOpen && (
          <div className="p-4 bg-white text-neutral-900 border-t border-neutral-700 overflow-y-auto max-h-64">
            <div className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Storefront Draft Preview Mode</span>
              <span className="text-amber-600 font-bold">Unpublished Draft</span>
            </div>
            <div className="p-4 border border-neutral-200 rounded-lg space-y-2">
              <h3 className="font-serif text-xl font-bold text-neutral-900">{heading || 'Section Heading'}</h3>
              {subheading && <p className="text-sm text-neutral-600">{subheading}</p>}
              {imageUrl && (
                <Image src={imageUrl} alt={altText || 'Preview'} width={600} height={160} unoptimized className="w-full max-h-40 object-cover rounded" />
              )}
              {buttons.length > 0 && (
                <div className="flex gap-2 pt-2">
                  {buttons.map((b, i) => (
                    <span
                      key={i}
                      className={`px-4 py-1.5 text-xs font-medium rounded ${
                        b.style === 'PRIMARY' ? 'bg-neutral-900 text-white' : 'border border-neutral-900 text-neutral-900'
                      }`}
                    >
                      {b.label || 'CTA Button'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Product Search Dialog */}
      {productSearchOpen && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Select Catalog Product</h3>
              <button onClick={() => setProductSearchOpen(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                placeholder="Search active products by name..."
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {searchingProducts ? (
                <div className="p-4 text-center text-xs text-neutral-500">Searching products...</div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-neutral-500">No active products found</div>
              ) : (
                searchResults.map((prod) => {
                  const isSelected = selectedProducts.some((p) => p.id === prod.id);
                  return (
                    <div
                      key={prod.id}
                      onClick={() => {
                        if (!isSelected) {
                          handleAddProduct(prod);
                        }
                      }}
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-neutral-950/50 border-neutral-800 opacity-50 cursor-not-allowed'
                          : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        {prod.images?.[0]?.url && (
                          <div className="w-8 h-10 relative overflow-hidden rounded flex-shrink-0">
                            <Image src={prod.images[0].url} alt={prod.name} fill sizes="32px" className="object-cover" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-white">{prod.name}</div>
                          <div className="text-[10px] text-neutral-400">Category: {prod.category?.name}</div>
                        </div>
                      </div>

                      {isSelected ? (
                        <span className="text-[10px] text-emerald-400 font-mono">Selected</span>
                      ) : (
                        <button className="px-2 py-1 bg-amber-500 text-neutral-950 text-[10px] font-semibold rounded">
                          Select
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
