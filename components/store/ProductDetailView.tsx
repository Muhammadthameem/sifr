'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  ShoppingBag,
  MessageCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Ruler,
  Truck,
  RotateCcw,
  ShieldCheck,
  AlertCircle,
  ChevronLeft,
} from 'lucide-react';
import { addToCartAction } from '@/lib/actions/cart-actions';
import { ProductCard } from '@/components/store/ProductCard';
import { SizeGuideModal } from '@/components/store/SizeGuideModal';
import { getVariantAvailability, getAvailabilityDisplay } from '@/lib/inventory/availability';

interface ProductDetailProps {
  product: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    gender: 'MEN' | 'WOMEN' | 'BOTH';
    category: { id: string; name: string; slug: string };
    images: { url: string; altText: string | null }[];
    options: { name: string; values: { value: string }[] }[];
    variants: {
      id: string;
      title: string;
      sku: string;
      mrp: any;
      sellingPrice: any;
      isAvailable: boolean;
      availableStock?: number;
      inventoryItem?: { physicalStock?: number | null; reservedStock?: number | null } | null;
    }[];
    sourceButtons: { label: string; targetProduct: { id: string; name: string; slug: string } }[];
    availableStock?: number;
  };
  relatedProducts?: any[];
}

export function ProductDetailView({ product, relatedProducts = [] }: ProductDetailProps) {
  const router = useRouter();

  // Image Gallery Index
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Size Guide Modal State
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);

  // Accordion Expand/Collapse States
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    description: true,
    details: false,
    shipping: false,
  });

  // Quantity State (min = 1)
  const [quantity, setQuantity] = useState(1);

  // Loading States
  const [addingToCart, setAddingToCart] = useState(false);
  const [orderingWhatsApp, setOrderingWhatsApp] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Default option choices
  const defaultChoices: Record<string, string> = {};
  product.options.forEach((opt) => {
    if (opt.values.length > 0) {
      defaultChoices[opt.name] = opt.values[0].value;
    }
  });

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(defaultChoices);

  // Resolve matching variant combination
  const selectedCombinationTitle = Object.values(selectedOptions).join(' / ');
  const matchedVariant = product.variants.find((v) => v.title === selectedCombinationTitle);

  // Determine availability strictly from the selected variant
  const selectedVariantAvailability = matchedVariant
    ? getVariantAvailability(matchedVariant)
    : getAvailabilityDisplay(0);

  const isPurchasable = Boolean(
    matchedVariant &&
    matchedVariant.isAvailable &&
    selectedVariantAvailability.isAvailable &&
    selectedVariantAvailability.availableStock > 0
  );

  const mrp = matchedVariant ? Number(matchedVariant.mrp) : (product.variants[0] ? Number(product.variants[0].mrp) : 0);
  const sellingPrice = matchedVariant
    ? Number(matchedVariant.sellingPrice)
    : (product.variants[0] ? Number(product.variants[0].sellingPrice) : 0);
  const hasDiscount = mrp > sellingPrice;
  const discountPct = hasDiscount ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;

  const handleOptionSelect = (optionName: string, value: string) => {
    const nextOptions = {
      ...selectedOptions,
      [optionName]: value,
    };
    setSelectedOptions(nextOptions);
    setErrorMessage(null);

    const nextTitle = Object.values(nextOptions).join(' / ');
    const nextVariant = product.variants.find((v) => v.title === nextTitle);
    const nextAvail = nextVariant ? getVariantAvailability(nextVariant) : getAvailabilityDisplay(0);

    // Auto-adjust quantity if next variant has lower stock limit
    if (nextAvail.availableStock > 0 && quantity > nextAvail.availableStock) {
      setQuantity(nextAvail.availableStock);
    } else if (nextAvail.availableStock <= 0) {
      setQuantity(1);
    }
  };

  const toggleAccordion = (key: string) => {
    setOpenAccordions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleAddToCart = async () => {
    if (!matchedVariant || !isPurchasable || selectedVariantAvailability.availableStock <= 0) {
      setErrorMessage('The selected variant is currently out of stock.');
      return;
    }

    if (quantity > selectedVariantAvailability.availableStock) {
      setErrorMessage(`Only ${selectedVariantAvailability.availableStock} units available in stock.`);
      return;
    }

    setAddingToCart(true);
    setErrorMessage(null);

    try {
      const res = await addToCartAction({
        variantId: matchedVariant.id,
        quantity,
      });

      if (res.success) {
        setAddedSuccess(true);
        setTimeout(() => setAddedSuccess(false), 2500);
      } else {
        setErrorMessage(res.message || 'Failed to add item to cart');
      }
    } catch {
      setErrorMessage('An unexpected error occurred while adding to cart.');
    } finally {
      setAddingToCart(false);
    }
  };

  const handleOrderOnWhatsApp = () => {
    if (!matchedVariant || !isPurchasable || selectedVariantAvailability.availableStock <= 0) {
      setErrorMessage('The selected variant is currently out of stock.');
      return;
    }

    if (quantity > selectedVariantAvailability.availableStock) {
      setErrorMessage(`Only ${selectedVariantAvailability.availableStock} units available in stock.`);
      return;
    }

    setOrderingWhatsApp(true);
    setErrorMessage(null);

    // Carry forward selected variant, quantity, and product context to future dedicated WhatsApp order flow
    const targetUrl = `/whatsapp-order?variantId=${encodeURIComponent(matchedVariant.id)}&quantity=${quantity}&slug=${encodeURIComponent(product.slug)}`;
    router.push(targetUrl);
  };

  const activeImage = product.images[selectedImageIndex]?.url;

  return (
    <div className="w-full bg-white text-neutral-900 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-16">
        
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="text-xs font-mono text-neutral-400 uppercase tracking-widest">
          <ol className="flex items-center space-x-2">
            <li>
              <Link href="/" className="hover:text-neutral-900 transition-colors">Home</Link>
            </li>
            <li>/</li>
            <li>
              <Link
                href={product.gender === 'WOMEN' ? '/women' : '/men'}
                className="hover:text-neutral-900 transition-colors"
              >
                {product.gender === 'BOTH' ? 'COLLECTION' : product.gender}
              </Link>
            </li>
            <li>/</li>
            <li>
              <Link
                href={`/categories/${product.category.slug}`}
                className="hover:text-neutral-900 transition-colors"
              >
                {product.category.name}
              </Link>
            </li>
            <li>/</li>
            <li className="text-neutral-900 font-semibold truncate max-w-[200px] sm:max-w-none">
              {product.name}
            </li>
          </ol>
        </nav>

        {/* Desktop PDP Structure: 60% Gallery (col-span-7) / 40% Info (col-span-5) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Left Column: Product Image Gallery */}
          <div className="lg:col-span-7 flex flex-col-reverse md:flex-row gap-4">
            
            {/* Gallery Thumbnails (Desktop side list / Mobile scroll bar) */}
            {product.images.length > 1 && (
              <div className="flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto max-h-[650px] scrollbar-none pb-2 md:pb-0">
                {product.images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedImageIndex(idx)}
                    aria-label={`View Image ${idx + 1}`}
                    className={`relative aspect-[4/5] w-16 md:w-20 rounded-lg overflow-hidden border bg-neutral-100 flex-shrink-0 transition-all ${
                      selectedImageIndex === idx
                        ? 'border-neutral-900 ring-1 ring-neutral-900'
                        : 'border-neutral-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Image src={img.url} alt={img.altText || product.name} fill sizes="80px" className="object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Main Image Viewer (4:5 Aspect Ratio Standard) */}
            <div className="flex-1 relative aspect-[4/5] bg-neutral-100 rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
              {activeImage ? (
                <Image
                  src={activeImage}
                  alt={product.images[selectedImageIndex]?.altText || product.name}
                  priority
                  fill
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  className="object-cover object-center"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-serif text-neutral-300 text-3xl tracking-widest uppercase">
                  SIFR
                </div>
              )}

              {/* Discount Badge */}
              {hasDiscount && (
                <div className="absolute top-4 left-4 bg-neutral-900 text-white font-mono text-[11px] font-bold px-3 py-1 uppercase tracking-widest rounded shadow-sm">
                  -{discountPct}% OFF
                </div>
              )}

              {/* Mobile Carousel Indicators */}
              {product.images.length > 1 && (
                <div className="absolute bottom-4 inset-x-0 flex items-center justify-center space-x-2 md:hidden">
                  {product.images.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImageIndex(idx)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        selectedImageIndex === idx ? 'bg-neutral-900 w-4' : 'bg-neutral-400/60'
                      }`}
                      aria-label={`Slide ${idx + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Product Information & Purchase Controls */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Category Tag */}
            <span className="text-xs font-mono tracking-widest text-neutral-400 uppercase block">
              {product.category.name}
            </span>

            {/* Product Title */}
            <h1 className="font-serif text-3xl sm:text-4xl text-neutral-900 font-normal uppercase tracking-tight leading-tight">
              {product.name}
            </h1>

            {/* Price & Availability Row */}
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-neutral-200 pb-6">
              <div className="flex items-baseline space-x-4">
                <span className="font-mono text-3xl font-semibold text-neutral-900">
                  ₹{sellingPrice.toLocaleString('en-IN')}
                </span>
                {hasDiscount && (
                  <>
                    <span className="font-mono text-lg text-neutral-400 line-through">
                      ₹{mrp.toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs font-mono text-emerald-600 uppercase tracking-wider font-semibold">
                      Save ₹{(mrp - sellingPrice).toLocaleString('en-IN')} ({discountPct}%)
                    </span>
                  </>
                )}
              </div>

              {/* Selected Variant Availability Indicator */}
              <div className="flex items-center">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded font-mono text-xs font-semibold uppercase tracking-wider ${
                    selectedVariantAvailability.status === 'OUT_OF_STOCK'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : selectedVariantAvailability.status === 'LOW_STOCK'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }`}
                  data-testid="pdp-stock-status"
                >
                  {selectedVariantAvailability.badgeText}
                </span>
              </div>
            </div>

            {/* Error / Validation Message */}
            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Product Buttons (Linked Variation Links e.g. Colors) */}
            {product.sourceButtons && product.sourceButtons.length > 0 && (
              <div className="space-y-3 pt-2">
                <label className="block text-xs font-mono uppercase tracking-widest text-neutral-500">
                  Color / Variations:
                </label>
                <div className="flex flex-wrap gap-2">
                  {/* Current Active Product Tag */}
                  <span className="px-3.5 py-2 rounded border-2 border-neutral-900 bg-neutral-900 text-white font-mono text-xs uppercase tracking-wider flex items-center space-x-1.5 shadow-xs">
                    <Check className="w-3.5 h-3.5" />
                    <span>Current</span>
                  </span>

                  {/* Linked Product Buttons */}
                  {product.sourceButtons.map((btn, idx) => (
                    <Link
                      key={idx}
                      href={`/products/${btn.targetProduct.slug}`}
                      className="px-3.5 py-2 rounded border border-neutral-200 bg-white text-neutral-700 hover:text-neutral-900 hover:border-neutral-900 font-mono text-xs uppercase tracking-wider flex items-center space-x-1 transition-all"
                    >
                      <span>{btn.label}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-neutral-400" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Dynamic Product Options (e.g., Size, Material, Strap) */}
            {product.options.map((opt) => (
              <div key={opt.name} className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-mono uppercase tracking-widest">
                  <span className="text-neutral-500">{opt.name}:</span>
                  <div className="flex items-center space-x-4">
                    <span className="text-neutral-900 font-bold">{selectedOptions[opt.name]}</span>
                    {/* Size Guide Trigger */}
                    {opt.name.toLowerCase().includes('size') && (
                      <button
                        type="button"
                        onClick={() => setSizeGuideOpen(true)}
                        className="inline-flex items-center space-x-1 text-neutral-600 hover:text-neutral-900 underline text-[11px] transition-colors"
                        id="btn-open-size-guide"
                      >
                        <Ruler className="w-3.5 h-3.5" />
                        <span>Size Guide</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {opt.values.map((v) => {
                    const isSelected = selectedOptions[opt.name] === v.value;

                    // Check if choosing this value leads to a valid variant
                    const testOptions = { ...selectedOptions, [opt.name]: v.value };
                    const testTitle = Object.values(testOptions).join(' / ');
                    const optionVariant = product.variants.find((varItem) => varItem.title === testTitle);
                    const optAvail = optionVariant ? getVariantAvailability(optionVariant) : null;
                    const isOptionInStock = optAvail ? optAvail.availableStock > 0 && (optionVariant?.isAvailable ?? true) : false;

                    return (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => handleOptionSelect(opt.name, v.value)}
                        className={`px-4 py-2.5 rounded font-mono text-xs uppercase tracking-wider border transition-all ${
                          isSelected
                            ? 'bg-neutral-900 text-white border-neutral-900 font-bold shadow-sm'
                            : !isOptionInStock
                            ? 'bg-neutral-50 text-neutral-400 border-neutral-200 cursor-pointer hover:border-neutral-400'
                            : 'bg-white text-neutral-800 border-neutral-200 hover:border-neutral-900'
                        }`}
                      >
                        {v.value}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Quantity Selector */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-mono uppercase tracking-widest text-neutral-500">
                  Quantity:
                </label>
                {selectedVariantAvailability.availableStock > 0 && selectedVariantAvailability.availableStock <= 5 && (
                  <span className="text-[11px] font-mono text-amber-600 uppercase tracking-wider font-semibold">
                    Max {selectedVariantAvailability.availableStock} per order
                  </span>
                )}
              </div>
              <div className="inline-flex items-center border border-neutral-200 rounded overflow-hidden font-mono text-sm bg-white">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1 || selectedVariantAvailability.availableStock <= 0}
                  className="px-3.5 py-2 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="px-4 py-2 text-neutral-900 font-bold">
                  {selectedVariantAvailability.availableStock <= 0 ? 0 : quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(selectedVariantAvailability.availableStock, q + 1))}
                  disabled={quantity >= selectedVariantAvailability.availableStock || selectedVariantAvailability.availableStock <= 0}
                  className="px-3.5 py-2 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>

            {/* Action Buttons: Add to Cart & Order on WhatsApp */}
            <div className="space-y-3 pt-4 border-t border-neutral-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Primary Add to Cart Button */}
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!isPurchasable || addingToCart || orderingWhatsApp}
                  className={`w-full py-4 px-6 rounded text-xs font-mono tracking-widest uppercase transition-all flex items-center justify-center space-x-2 shadow-sm ${
                    !isPurchasable
                      ? 'bg-neutral-200 text-neutral-400 border border-neutral-200 cursor-not-allowed'
                      : addedSuccess
                      ? 'bg-emerald-700 text-white'
                      : 'bg-white text-neutral-900 border border-neutral-900 hover:bg-neutral-900 hover:text-white'
                  }`}
                  id="btn-add-to-cart-main"
                >
                  {addingToCart ? (
                    <span>Adding to Cart...</span>
                  ) : addedSuccess ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Added to Cart</span>
                    </>
                  ) : !isPurchasable ? (
                    <span>OUT OF STOCK</span>
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4" />
                      <span>Add to Cart</span>
                    </>
                  )}
                </button>

                {/* Secondary Order on WhatsApp Button */}
                <button
                  type="button"
                  onClick={handleOrderOnWhatsApp}
                  disabled={!isPurchasable || addingToCart || orderingWhatsApp}
                  className={`w-full py-4 px-6 rounded text-xs font-mono tracking-widest uppercase transition-all flex items-center justify-center space-x-2 shadow-md ${
                    !isPurchasable
                      ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      : 'bg-neutral-900 text-white hover:bg-neutral-800'
                  }`}
                  id="btn-order-whatsapp-main"
                >
                  {orderingWhatsApp ? (
                    <span>Redirecting...</span>
                  ) : !isPurchasable ? (
                    <span>OUT OF STOCK</span>
                  ) : (
                    <>
                      <MessageCircle className="w-4 h-4 text-emerald-400" />
                      <span>Order on WhatsApp</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Shipping & Policy Badges */}
            <div className="grid grid-cols-2 gap-4 py-4 border-y border-neutral-100 text-xs text-neutral-600 font-light">
              <div className="flex items-center space-x-2.5">
                <Truck className="w-4 h-4 text-neutral-800 flex-shrink-0" />
                <span>Standard Delivery (Capped at ₹199)</span>
              </div>
              <div className="flex items-center space-x-2.5">
                <RotateCcw className="w-4 h-4 text-neutral-800 flex-shrink-0" />
                <span>14-Day Hassle-Free Returns</span>
              </div>
            </div>

            {/* Editorial Accordions */}
            <div className="space-y-3 pt-2 divide-y divide-neutral-200/80">
              
              {/* Description Accordion */}
              {product.description && (
                <div className="pt-3">
                  <button
                    onClick={() => toggleAccordion('description')}
                    className="w-full flex items-center justify-between text-xs font-mono tracking-widest uppercase text-neutral-900 font-semibold py-1 text-left"
                  >
                    <span>Product Details & Overview</span>
                    {openAccordions.description ? (
                      <ChevronDown className="w-4 h-4 text-neutral-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-neutral-500" />
                    )}
                  </button>
                  {openAccordions.description && (
                    <p className="mt-3 text-xs text-neutral-600 font-light leading-relaxed whitespace-pre-line">
                      {product.description}
                    </p>
                  )}
                </div>
              )}

              {/* Shipping & Returns Details Accordion */}
              <div className="pt-3">
                <button
                  onClick={() => toggleAccordion('shipping')}
                  className="w-full flex items-center justify-between text-xs font-mono tracking-widest uppercase text-neutral-900 font-semibold py-1 text-left"
                >
                  <span>Shipping & Returns Policy</span>
                  {openAccordions.shipping ? (
                    <ChevronDown className="w-4 h-4 text-neutral-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-neutral-500" />
                  )}
                </button>
                {openAccordions.shipping && (
                  <div className="mt-3 text-xs text-neutral-600 font-light leading-relaxed space-y-2">
                    <p>
                      <strong>Shipping Rule:</strong> Calculated at checkout as the sum of variant shipping costs, capped at a maximum of ₹199 per order.
                    </p>
                    <p>
                      <strong>Returns Policy:</strong> SIFR offers a 14-day customer return window for unused, unwashed garments with tags intact.
                    </p>
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>

        {/* Related Products Section ("You May Also Like") */}
        {relatedProducts.length > 0 && (
          <section className="pt-16 border-t border-neutral-200/80">
            <div className="mb-8 text-center sm:text-left">
              <span className="text-[10px] font-mono tracking-widest uppercase text-neutral-400 block mb-1">
                CURATED SELECTION
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-normal text-neutral-900">
                You May Also Like
              </h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {relatedProducts.slice(0, 4).map((relProd) => (
                <ProductCard key={relProd.id} product={relProd} />
              ))}
            </div>
          </section>
        )}

      </div>

      {/* Mobile Sticky Add To Cart CTA Bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-neutral-200 p-3 shadow-lg flex sm:hidden items-center justify-between gap-3">
        <div className="flex flex-col truncate">
          <span className="font-serif text-xs font-medium text-neutral-900 truncate">
            {product.name}
          </span>
          <span className="font-mono text-xs font-semibold text-neutral-900">
            ₹{sellingPrice.toLocaleString('en-IN')}
          </span>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!isPurchasable || addingToCart || orderingWhatsApp}
            className="px-4 py-2.5 rounded bg-neutral-900 text-white font-mono text-xs tracking-wider uppercase hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
            id="btn-sticky-mobile-add"
          >
            {addingToCart ? 'Adding...' : !isPurchasable ? 'Out of Stock' : 'Add'}
          </button>
          <button
            type="button"
            onClick={handleOrderOnWhatsApp}
            disabled={!isPurchasable || addingToCart || orderingWhatsApp}
            className="px-4 py-2.5 rounded bg-neutral-900 text-white font-mono text-xs font-semibold tracking-wider uppercase hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1.5"
            id="btn-sticky-mobile-order-whatsapp"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>{!isPurchasable ? 'Out of Stock' : 'Order on WhatsApp'}</span>
          </button>
        </div>
      </div>

      {/* Size Guide Modal */}
      <SizeGuideModal
        isOpen={sizeGuideOpen}
        onClose={() => setSizeGuideOpen(false)}
        categoryName={product.category.name}
      />
    </div>
  );
}
