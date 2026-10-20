'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  Tag,
  X,
  Plus,
  Minus,
  Trash2,
  MessageCircle,
  Truck,
  CheckCircle2,
} from 'lucide-react';
import { SearchableStateSelect } from './SearchableStateSelect';
import {
  getWhatsAppProductOrderDetails,
  getWhatsAppCartOrderDetails,
  calculateWhatsAppShippingAction,
  previewWhatsAppCouponAction,
  WhatsAppOrderItemData,
  WhatsAppOrderDetailsResult,
} from '@/lib/actions/whatsapp-order-actions';
import {
  updateCartItemAction,
  removeFromCartAction,
  removeSubmittedCartItemsAction,
  applyCartCouponAction,
  removeCartCouponAction,
} from '@/lib/actions/cart-actions';
import { createWhatsAppOrderAction } from '@/lib/actions/order-actions';
import { isValidIndianState } from '@/lib/constants/states';

interface WhatsAppOrderViewProps {
  searchParams: {
    variantId?: string;
    quantity?: string;
    slug?: string;
    from?: string;
  };
}

export function WhatsAppOrderView({ searchParams }: WhatsAppOrderViewProps) {
  const router = useRouter();

  const isCartMode = searchParams.from === 'cart';
  const variantIdParam = searchParams.variantId;
  const slugParam = searchParams.slug;
  const initialQtyParam = parseInt(searchParams.quantity || '1', 10) || 1;

  // Loading & Data states
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [orderData, setOrderData] = useState<WhatsAppOrderDetailsResult | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    email: '',
  });

  // Validation & Submission States
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [validationSuccessNotice, setValidationSuccessNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<{
    id: string;
    orderNumber: string;
    grandTotal: number;
    subtotal: number;
    shippingFee: number;
    status: string;
    salesChannel: string;
    paymentStatus: string;
  } | null>(null);
  const [whatsAppUrl, setWhatsAppUrl] = useState<string | null>(null);

  // Coupon Input State (local input)
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  // Initial Data Fetch
  const loadOrderDetails = async () => {
    try {
      setLoading(true);
      setDataError(null);

      if (isCartMode) {
        const res = await getWhatsAppCartOrderDetails();
        if (!res.success) {
          setDataError(res.error || 'Failed to load cart items.');
        } else {
          setOrderData(res);
        }
      } else if (variantIdParam && slugParam) {
        const res = await getWhatsAppProductOrderDetails({
          slug: slugParam,
          variantId: variantIdParam,
          quantity: initialQtyParam,
        });
        if (!res.success) {
          setDataError(res.error || 'Product variant is not available.');
        } else {
          setOrderData(res);
        }
      } else {
        setDataError('Invalid order parameters. Please select a product or order from your cart.');
      }
    } catch {
      setDataError('An unexpected error occurred while loading order details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrderDetails();
  }, [isCartMode, variantIdParam, slugParam]);

  // Handle Form Change
  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear field-level error as user types
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (topLevelError) setTopLevelError(null);
    if (validationSuccessNotice) setValidationSuccessNotice(null);
  };

  // Quantity Change Handler
  const handleQuantityChange = async (variantId: string, currentQty: number, delta: number) => {
    const newQty = currentQty + delta;
    if (newQty < 1) return;

    if (isCartMode) {
      // In cart mode, update via existing cart action
      setTopLevelError(null);
      const res = await updateCartItemAction({ variantId, quantity: newQty });
      if (!res.success) {
        setTopLevelError(res.message || 'Could not update quantity');
      } else {
        await loadOrderDetails();
      }
    } else {
      // In product mode, update local state and recompute authoritative shipping and totals
      if (!orderData || orderData.items.length === 0) return;

      const item = orderData.items[0];
      const updatedItem: WhatsAppOrderItemData = {
        ...item,
        quantity: newQty,
        lineTotal: item.unitPrice * newQty,
        isOutOfStock: item.availableStock < newQty,
      };

      const newSubtotal = updatedItem.lineTotal;

      // Recompute authoritative shipping fee for the new quantity
      const shipRes = await calculateWhatsAppShippingAction([
        { variantId: item.variantId, quantity: newQty },
      ]);
      const newShippingFee = shipRes.success ? shipRes.shippingFee : orderData.shippingFee;

      // If a coupon was applied, re-evaluate discount
      let newDiscount = 0;
      let appliedCoupon = orderData.appliedCoupon;

      if (orderData.appliedCouponCode) {
        const couponRes = await previewWhatsAppCouponAction({
          couponCode: orderData.appliedCouponCode,
          items: [{ variantId: item.variantId, quantity: newQty }],
          customerMobile: formData.phone.trim() || undefined,
        });
        if (couponRes.valid) {
          newDiscount = couponRes.discountTotal;
        } else {
          // Invalidate coupon if minimum requirement no longer met
          appliedCoupon = {
            code: orderData.appliedCouponCode,
            isValid: false,
            reason: couponRes.reason,
          };
        }
      }

      const newGrandTotal = Math.max(0, newSubtotal - newDiscount) + newShippingFee;

      setOrderData({
        ...orderData,
        items: [updatedItem],
        subtotal: newSubtotal,
        shippingFee: newShippingFee,
        discountTotal: newDiscount,
        appliedCoupon,
        grandTotal: newGrandTotal,
        hasUnavailableItems: updatedItem.isOutOfStock || !updatedItem.isAvailable,
      });
    }
  };

  // Remove Item Handler (Cart mode only)
  const handleRemoveItem = async (variantId: string) => {
    if (!isCartMode) return;
    setTopLevelError(null);
    await removeFromCartAction(variantId);
    await loadOrderDetails();
  };

  // Coupon Apply Handler
  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = couponInput.trim();
    if (!code) return;

    setCouponError(null);
    setApplyingCoupon(true);

    try {
      if (isCartMode) {
        const res = await applyCartCouponAction(code);
        if (!res.success) {
          setCouponError(res.reason || 'Invalid promo code');
        } else {
          setCouponInput('');
          await loadOrderDetails();
        }
      } else {
        // Product Mode
        if (!orderData || orderData.items.length === 0) return;
        const item = orderData.items[0];

        const res = await previewWhatsAppCouponAction({
          couponCode: code,
          items: [{ variantId: item.variantId, quantity: item.quantity }],
          customerMobile: formData.phone.trim() || undefined,
        });

        if (!res.valid) {
          setCouponError(res.reason || 'Invalid or inapplicable coupon code');
        } else {
          const discountTotal = res.discountTotal;
          const grandTotal = Math.max(0, orderData.subtotal - discountTotal) + orderData.shippingFee;
          setOrderData({
            ...orderData,
            appliedCouponCode: res.code || code.toUpperCase(),
            discountTotal,
            appliedCoupon: {
              code: res.code || code.toUpperCase(),
              isValid: true,
              discountTotal,
            },
            grandTotal,
          });
          setCouponInput('');
        }
      }
    } catch {
      setCouponError('Failed to apply coupon');
    } finally {
      setApplyingCoupon(false);
    }
  };

  // Coupon Remove Handler
  const handleRemoveCoupon = async () => {
    setCouponError(null);

    if (isCartMode) {
      await removeCartCouponAction();
      await loadOrderDetails();
    } else {
      if (!orderData) return;
      const grandTotal = orderData.subtotal + orderData.shippingFee;
      setOrderData({
        ...orderData,
        appliedCouponCode: null,
        appliedCoupon: null,
        discountTotal: 0,
        grandTotal,
      });
    }
  };

  // Form Validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // 1. Name
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      newErrors.name = 'Full name is required';
    } else if (trimmedName.length > 100) {
      newErrors.name = 'Name cannot exceed 100 characters';
    }

    // 2. Phone (strictly 10 digits Indian mobile starting with 6, 7, 8, 9)
    const cleanedPhone = formData.phone.trim().replace(/[\s\-\(\)]/g, '');
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!cleanedPhone) {
      newErrors.phone = 'Phone number is required';
    } else if (!phoneRegex.test(cleanedPhone)) {
      newErrors.phone = 'Enter a valid 10-digit Indian mobile number (e.g. 9876543210)';
    }

    // 3. Address (Single multiline field)
    const trimmedAddress = formData.address.trim();
    if (!trimmedAddress) {
      newErrors.address = 'Delivery address is required';
    } else if (trimmedAddress.length > 500) {
      newErrors.address = 'Address cannot exceed 500 characters';
    }

    // 4. City
    const trimmedCity = formData.city.trim();
    if (!trimmedCity) {
      newErrors.city = 'City is required';
    } else if (trimmedCity.length > 100) {
      newErrors.city = 'City cannot exceed 100 characters';
    }

    // 5. State (Searchable dropdown, must be valid Indian State / UT)
    if (!formData.state) {
      newErrors.state = 'Please select a State or Union Territory';
    } else if (!isValidIndianState(formData.state)) {
      newErrors.state = 'Please select a valid Indian State or Union Territory from the list';
    }

    // 6. Pincode (strictly 6 digits, cannot start with 0)
    const pincodeRegex = /^[1-9][0-9]{5}$/;
    if (!formData.pincode.trim()) {
      newErrors.pincode = 'PIN code is required';
    } else if (!pincodeRegex.test(formData.pincode.trim())) {
      newErrors.pincode = 'Enter a valid 6-digit Indian PIN code';
    }

    // 7. Email (Optional)
    const trimmedEmail = formData.email.trim();
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        newErrors.email = 'Enter a valid email address';
      }
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      setTopLevelError('Please correct the highlighted fields before proceeding.');
      return false;
    }

    setTopLevelError(null);
    return true;
  };

  // Submit Handler for Step 3: Server-side WhatsApp Order Creation
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setTopLevelError(null);
    setValidationSuccessNotice(null);

    const isValid = validateForm();
    if (!isValid) return;

    if (!orderData || orderData.items.length === 0) {
      setTopLevelError('Your order has no items to submit.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Generate one unique UUID idempotency key for this intentional submission attempt
      const creationIdempotencyKey =
        typeof window !== 'undefined' && window.crypto?.randomUUID
          ? window.crypto.randomUUID()
          : `wa-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const customerPayload = {
        name: formData.name.trim(),
        mobile: formData.phone.trim(),
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        pincode: formData.pincode.trim(),
        email: formData.email.trim() || null,
      };

      const itemsPayload = orderData.items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
      }));

      const res = await createWhatsAppOrderAction({
        creationIdempotencyKey,
        customer: customerPayload,
        items: itemsPayload,
        couponCode: orderData.appliedCouponCode || undefined,
        paymentMethod: null,
      });

      if (!res.success || !res.order) {
        if (res.error?.includes('INSUFFICIENT_STOCK')) {
          setTopLevelError(
            'Some items are no longer available in the requested quantity. Please adjust your order and try again.'
          );
        } else {
          setTopLevelError(res.error || 'Failed to create WhatsApp order. Please try again.');
        }
      } else {
        // Step 4: If order originated from Cart Mode, remove only the submitted items from the cart
        if (isCartMode) {
          const submittedVariantIds = orderData.items.map((i) => i.variantId);
          try {
            await removeSubmittedCartItemsAction(submittedVariantIds);
          } catch (cartErr) {
            console.warn('Failed to remove submitted items from cart:', cartErr);
          }
        }

        setCreatedOrder({
          id: res.order.id,
          orderNumber: res.order.orderNumber,
          grandTotal: res.order.grandTotal,
          subtotal: res.order.subtotal,
          shippingFee: res.order.shippingFee,
          status: res.order.status,
          salesChannel: res.order.salesChannel,
          paymentStatus: res.order.paymentStatus,
        });

        if (res.whatsAppUrl) {
          setWhatsAppUrl(res.whatsAppUrl);
          // Attempt automatic redirection/opening of WhatsApp
          try {
            window.location.href = res.whatsAppUrl;
          } catch (redirectErr) {
            console.warn('Automatic redirect failed:', redirectErr);
          }
        }
      }
    } catch (err: any) {
      setTopLevelError(err.message || 'An unexpected error occurred while creating your order.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading Screen
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <div className="inline-block w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">
          Preparing WhatsApp Order...
        </p>
      </div>
    );
  }

  // Error / Empty State
  const hasNoItems = !orderData || orderData.items.length === 0;

  if (dataError || hasNoItems) {
    return (
      <div className="bg-white min-h-[70vh] flex items-center justify-center">
        <div className="max-w-md mx-auto px-4 py-16 text-center space-y-6">
          <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto text-neutral-400">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h1 className="font-serif text-3xl font-normal text-neutral-900">
            {isCartMode ? 'Your Cart is Empty' : 'Product Not Available'}
          </h1>
          <p className="text-xs font-mono text-neutral-500 leading-relaxed">
            {dataError ||
              (isCartMode
                ? 'There are no active items in your shopping cart to order.'
                : 'The requested product or variant could not be found or is sold out.')}
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/men"
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3 bg-neutral-900 text-white font-mono text-xs uppercase tracking-widest rounded hover:bg-neutral-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Explore Collection</span>
            </Link>
            {isCartMode && (
              <Link
                href="/cart"
                className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 border border-neutral-300 text-neutral-900 font-mono text-xs uppercase tracking-widest rounded hover:bg-neutral-50 transition-colors"
              >
                <span>View Cart</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const backLinkHref =
    isCartMode
      ? '/cart'
      : orderData.items[0]?.productSlug
      ? `/products/${orderData.items[0].productSlug}`
      : '/shop';

  const backLinkLabel = isCartMode ? 'Back to Cart' : 'Back to Product';

  return (
    <div className="bg-white min-h-screen text-neutral-900 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-14">
        {/* Header & Breadcrumb */}
        <div className="mb-8 pb-6 border-b border-neutral-200 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <Link
              href={backLinkHref}
              className="inline-flex items-center space-x-2 text-xs font-mono text-neutral-500 hover:text-neutral-900 uppercase tracking-widest transition-colors mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{backLinkLabel}</span>
            </Link>
            <h1 className="font-serif text-3xl md:text-4xl font-normal text-neutral-900 tracking-tight flex items-center space-x-3">
              <span>Complete WhatsApp Order</span>
            </h1>
            <p className="text-xs font-mono text-neutral-500 mt-1">
              Provide delivery details to initiate your personalized WhatsApp order with our team.
            </p>
          </div>
          <div className="flex items-center space-x-2 text-xs font-mono text-neutral-600 bg-neutral-50 border border-neutral-200 px-3 py-1.5 rounded-full self-start md:self-auto">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Direct Brand Support</span>
          </div>
        </div>

        {/* Global/Top-level Alerts */}
        {topLevelError && (
          <div
            id="whatsapp-order-top-error"
            className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono rounded-lg flex items-center space-x-3"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
            <span>{topLevelError}</span>
          </div>
        )}

        {validationSuccessNotice && (
          <div
            id="whatsapp-order-validation-success"
            className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-mono rounded-lg flex items-center space-x-3"
          >
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
            <span>{validationSuccessNotice}</span>
          </div>
        )}

        {createdOrder && (
          <div
            id="whatsapp-order-created-card"
            className="mb-8 p-6 md:p-8 bg-emerald-50 border border-emerald-300 rounded-2xl space-y-4"
          >
            <div className="flex items-start space-x-3">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="font-serif text-2xl font-normal text-emerald-950">
                  Order Placed Successfully: #{createdOrder.orderNumber}
                </h2>
                <p className="text-xs font-mono text-emerald-800">
                  Status: <span className="font-bold">{createdOrder.status}</span> &nbsp;|&nbsp;
                  Channel: <span className="font-bold">{createdOrder.salesChannel}</span> &nbsp;|&nbsp;
                  Payment: <span className="font-bold">{createdOrder.paymentStatus}</span> &nbsp;|&nbsp;
                  Total: <span className="font-bold">₹{createdOrder.grandTotal.toLocaleString('en-IN')}</span>
                </p>
              </div>
            </div>

            <p className="text-xs font-mono text-emerald-900 leading-relaxed">
              Your order request is saved. You are being redirected to WhatsApp to share your prefilled order details with our support team.
            </p>

            {whatsAppUrl && (
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <a
                  href={whatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  id="whatsapp-order-open-btn"
                  className="inline-flex items-center justify-center space-x-2 py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-mono text-xs uppercase tracking-widest shadow-md transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Open WhatsApp</span>
                </a>
                <span className="text-[11px] font-mono text-emerald-700">
                  If WhatsApp did not open automatically, click the button above to start your chat.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Two-Column Responsive Grid (Desktop: Left Form 60%, Right Summary 40% | Mobile: Stacked) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* ================================================================ */}
          {/* LEFT COLUMN: Customer Details Form                               */}
          {/* ================================================================ */}
          <div className="lg:col-span-7 space-y-6">
            <form onSubmit={handleSubmitOrder} noValidate className="space-y-6">
              <div className="bg-neutral-50 border border-neutral-200 p-6 md:p-8 rounded-2xl space-y-6">
                <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                  <h2 className="font-serif text-xl font-normal text-neutral-900 flex items-center space-x-2">
                    <Truck className="w-5 h-5 text-neutral-700" />
                    <span>Customer & Delivery Details</span>
                  </h2>
                  <span className="text-[11px] font-mono text-neutral-400">
                    <span className="text-rose-600">*</span> Required
                  </span>
                </div>

                <div className="space-y-4 text-xs font-mono">
                  {/* 1. Name */}
                  <div>
                    <label
                      htmlFor="customer-name"
                      className="block text-neutral-700 uppercase tracking-wider mb-1"
                    >
                      Full Name <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="customer-name"
                      name="name"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="e.g. Amina Al-Mansoor"
                      className={`w-full bg-white border rounded px-3 py-2 text-neutral-900 focus:outline-none transition-colors ${
                        errors.name
                          ? 'border-rose-400 focus:border-rose-600 ring-1 ring-rose-100'
                          : 'border-neutral-300 focus:border-neutral-900'
                      }`}
                    />
                    {errors.name && (
                      <p className="text-[11px] text-rose-600 mt-1">{errors.name}</p>
                    )}
                  </div>

                  {/* 2. Phone */}
                  <div>
                    <label
                      htmlFor="customer-phone"
                      className="block text-neutral-700 uppercase tracking-wider mb-1"
                    >
                      Phone Number <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="tel"
                      id="customer-phone"
                      name="phone"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="10-digit mobile number (e.g. 9876543210)"
                      maxLength={10}
                      className={`w-full bg-white border rounded px-3 py-2 text-neutral-900 focus:outline-none transition-colors ${
                        errors.phone
                          ? 'border-rose-400 focus:border-rose-600 ring-1 ring-rose-100'
                          : 'border-neutral-300 focus:border-neutral-900'
                      }`}
                    />
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      Enter 10-digit Indian mobile number without +91.
                    </p>
                    {errors.phone && (
                      <p className="text-[11px] text-rose-600 mt-1">{errors.phone}</p>
                    )}
                  </div>

                  {/* 3. Address (Single multiline field) */}
                  <div>
                    <label
                      htmlFor="customer-address"
                      className="block text-neutral-700 uppercase tracking-wider mb-1"
                    >
                      Delivery Address <span className="text-rose-600">*</span>
                    </label>
                    <textarea
                      id="customer-address"
                      name="address"
                      rows={3}
                      value={formData.address}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      placeholder="Flat/House No., Building, Street, Area / Landmark"
                      className={`w-full bg-white border rounded px-3 py-2 text-neutral-900 focus:outline-none transition-colors resize-y ${
                        errors.address
                          ? 'border-rose-400 focus:border-rose-600 ring-1 ring-rose-100'
                          : 'border-neutral-300 focus:border-neutral-900'
                      }`}
                    />
                    {errors.address && (
                      <p className="text-[11px] text-rose-600 mt-1">{errors.address}</p>
                    )}
                  </div>

                  {/* 4. City, 5. State, 6. Pincode Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* City */}
                    <div>
                      <label
                        htmlFor="customer-city"
                        className="block text-neutral-700 uppercase tracking-wider mb-1"
                      >
                        City <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        id="customer-city"
                        name="city"
                        value={formData.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        placeholder="City"
                        className={`w-full bg-white border rounded px-3 py-2 text-neutral-900 focus:outline-none transition-colors ${
                          errors.city
                            ? 'border-rose-400 focus:border-rose-600 ring-1 ring-rose-100'
                            : 'border-neutral-300 focus:border-neutral-900'
                        }`}
                      />
                      {errors.city && (
                        <p className="text-[11px] text-rose-600 mt-1">{errors.city}</p>
                      )}
                    </div>

                    {/* State (Searchable Dropdown) */}
                    <div>
                      <label
                        htmlFor="customer-state"
                        className="block text-neutral-700 uppercase tracking-wider mb-1"
                      >
                        State <span className="text-rose-600">*</span>
                      </label>
                      <SearchableStateSelect
                        id="customer-state"
                        value={formData.state}
                        onChange={(val) => handleInputChange('state', val)}
                        error={errors.state}
                      />
                    </div>

                    {/* Pincode */}
                    <div>
                      <label
                        htmlFor="customer-pincode"
                        className="block text-neutral-700 uppercase tracking-wider mb-1"
                      >
                        PIN Code <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        id="customer-pincode"
                        name="pincode"
                        maxLength={6}
                        value={formData.pincode}
                        onChange={(e) => handleInputChange('pincode', e.target.value)}
                        placeholder="6-digit PIN"
                        className={`w-full bg-white border rounded px-3 py-2 text-neutral-900 focus:outline-none transition-colors ${
                          errors.pincode
                            ? 'border-rose-400 focus:border-rose-600 ring-1 ring-rose-100'
                            : 'border-neutral-300 focus:border-neutral-900'
                        }`}
                      />
                      {errors.pincode && (
                        <p className="text-[11px] text-rose-600 mt-1">{errors.pincode}</p>
                      )}
                    </div>
                  </div>

                  {/* 7. Email (Optional) */}
                  <div>
                    <label
                      htmlFor="customer-email"
                      className="block text-neutral-700 uppercase tracking-wider mb-1"
                    >
                      Email (Optional)
                    </label>
                    <input
                      type="email"
                      id="customer-email"
                      name="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="e.g. amina@example.com"
                      className={`w-full bg-white border rounded px-3 py-2 text-neutral-900 focus:outline-none transition-colors ${
                        errors.email
                          ? 'border-rose-400 focus:border-rose-600 ring-1 ring-rose-100'
                          : 'border-neutral-300 focus:border-neutral-900'
                      }`}
                    />
                    {errors.email && (
                      <p className="text-[11px] text-rose-600 mt-1">{errors.email}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Button Section */}
              <div className="pt-2">
                <button
                  type="submit"
                  id="whatsapp-order-submit-btn"
                  disabled={isSubmitting || createdOrder !== null}
                  className="w-full py-4 px-6 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-600 text-white rounded-xl font-mono text-xs uppercase tracking-widest flex items-center justify-center space-x-2 shadow-lg transition-all"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-400" />
                  <span>
                    {isSubmitting
                      ? 'Processing...'
                      : createdOrder
                      ? `Order #${createdOrder.orderNumber} Created`
                      : 'Order on WhatsApp'}
                  </span>
                </button>
                <p className="text-[11px] font-mono text-neutral-400 text-center mt-2">
                  No payment is processed now. Your order details will be shared on WhatsApp for direct confirmation.
                </p>
              </div>
            </form>
          </div>

          {/* ================================================================ */}
          {/* RIGHT COLUMN: Order Summary & Coupon UI                          */}
          {/* ================================================================ */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-neutral-50 border border-neutral-200 p-6 md:p-8 rounded-2xl space-y-6 sticky top-24 shadow-sm">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
                <h2 className="font-serif text-2xl font-normal text-neutral-900 tracking-tight">
                  Order Summary
                </h2>
                <span className="text-xs font-mono text-neutral-500 uppercase tracking-widest">
                  {orderData.items.length} {orderData.items.length === 1 ? 'Item' : 'Items'}
                </span>
              </div>

              {/* Items List */}
              <div className="divide-y divide-neutral-200 max-h-[380px] overflow-y-auto pr-1">
                {orderData.items.map((item) => (
                  <div key={item.variantId} className="py-4 flex space-x-4">
                    {/* Item Image with link */}
                    <div className="w-20 aspect-[4/5] bg-neutral-100 border border-neutral-200 rounded-lg overflow-hidden flex-shrink-0 relative">
                      <Link href={`/products/${item.productSlug}`}>
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.productName}
                            fill
                            sizes="80px"
                            className="object-cover hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[9px] font-mono text-neutral-400 uppercase tracking-widest">
                            SIFR
                          </div>
                        )}
                      </Link>
                    </div>

                    {/* Item Details */}
                    <div className="flex-1 flex flex-col justify-between py-0.5">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <Link
                              href={`/products/${item.productSlug}`}
                              className="font-serif text-base font-normal text-neutral-900 hover:underline tracking-tight leading-snug line-clamp-1"
                            >
                              {item.productName}
                            </Link>
                            <p className="text-xs font-mono text-neutral-500 mt-0.5">
                              Option: <span className="text-neutral-800 font-medium">{item.variantTitle}</span>
                            </p>
                            <p className="text-[10px] font-mono text-neutral-400">SKU: {item.sku}</p>
                          </div>
                          <span className="font-mono text-xs font-bold text-neutral-900 whitespace-nowrap">
                            ₹{item.unitPrice.toLocaleString('en-IN')}
                          </span>
                        </div>

                        {item.isOutOfStock && (
                          <p className="mt-1 text-[11px] font-mono text-rose-600">
                            Stock alert: Only {item.availableStock} unit(s) available
                          </p>
                        )}
                      </div>

                      {/* Quantity Controls & Remove */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100">
                        <div className="flex items-center space-x-2">
                          <div className="inline-flex items-center border border-neutral-300 rounded bg-white px-1.5 py-0.5">
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(item.variantId, item.quantity, -1)}
                              disabled={item.quantity <= 1}
                              className="p-1 text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono text-xs font-bold text-neutral-900 px-2.5">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(item.variantId, item.quantity, 1)}
                              className="p-1 text-neutral-600 hover:text-neutral-900 transition-colors"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          {isCartMode && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.variantId)}
                              className="p-1 text-neutral-400 hover:text-rose-600 transition-colors"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="text-[9px] font-mono text-neutral-400 block uppercase">
                            Subtotal
                          </span>
                          <span className="font-mono text-xs font-bold text-neutral-900">
                            ₹{item.lineTotal.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Coupon Code Section */}
              <div className="pt-2 pb-2 border-t border-b border-neutral-200">
                {orderData.appliedCouponCode ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Tag className="w-4 h-4 text-emerald-600" />
                      <span className="font-mono font-bold text-emerald-900 text-xs">
                        {orderData.appliedCouponCode}
                      </span>
                      {orderData.appliedCoupon?.isValid ? (
                        <span className="text-[11px] font-mono text-emerald-700">
                          (-₹{orderData.discountTotal.toLocaleString('en-IN')})
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono text-rose-600">
                          Invalid: {orderData.appliedCoupon?.reason}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="text-neutral-400 hover:text-neutral-900 p-1 transition-colors"
                      aria-label="Remove coupon"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} className="space-y-2">
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        name="couponCode"
                        value={couponInput}
                        onChange={(e) => {
                          setCouponInput(e.target.value.toUpperCase());
                          if (couponError) setCouponError(null);
                        }}
                        placeholder="COUPON CODE"
                        className="flex-1 bg-white border border-neutral-300 rounded px-3 py-2 text-xs font-mono uppercase focus:outline-none focus:border-neutral-900 placeholder-neutral-400"
                      />
                      <button
                        type="submit"
                        disabled={applyingCoupon || !couponInput.trim()}
                        className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-400 text-white text-xs font-mono uppercase tracking-widest rounded transition-colors whitespace-nowrap"
                      >
                        {applyingCoupon ? '...' : 'Apply'}
                      </button>
                    </div>
                    {couponError && (
                      <p className="text-[11px] font-mono text-rose-600">{couponError}</p>
                    )}
                  </form>
                )}
              </div>

              {/* Price Breakdown */}
              <div className="space-y-2.5 text-xs font-mono">
                <div className="flex justify-between text-neutral-600">
                  <span>Subtotal</span>
                  <span className="font-bold text-neutral-900">
                    ₹{orderData.subtotal.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="flex justify-between text-neutral-600">
                  <div className="flex items-center space-x-1">
                    <span>Shipping</span>
                    <span className="text-[10px] text-neutral-400">(Delivery)</span>
                  </div>
                  <span className="font-bold text-neutral-900">
                    {orderData.shippingFee === 0
                      ? 'FREE'
                      : `₹${orderData.shippingFee.toLocaleString('en-IN')}`}
                  </span>
                </div>

                {orderData.discountTotal > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Discount ({orderData.appliedCouponCode})</span>
                    <span>-₹{orderData.discountTotal.toLocaleString('en-IN')}</span>
                  </div>
                )}

                <div className="pt-3 border-t border-neutral-200 flex justify-between items-baseline">
                  <span className="font-serif text-lg font-normal text-neutral-900">
                    Estimated Total
                  </span>
                  <span className="font-mono text-xl font-bold text-neutral-900">
                    ₹{orderData.grandTotal.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
