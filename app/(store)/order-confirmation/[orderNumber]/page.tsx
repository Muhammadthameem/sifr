import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle2, Package, MapPin, Phone, Mail, Clock, ArrowRight, ExternalLink } from 'lucide-react';

interface OrderConfirmationPageProps {
  params: {
    orderNumber: string;
  };
  searchParams: {
    token?: string;
  };
}

export default async function OrderConfirmationPage({ params, searchParams }: OrderConfirmationPageProps) {
  const token = searchParams.token;
  if (!token) {
    notFound();
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber: params.orderNumber },
    include: {
      items: {
        include: {
          variant: {
            include: {
              product: {
                include: {
                  images: {
                    orderBy: { sortOrder: 'asc' },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
      customer: true,
      shipment: true,
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  const now = new Date();
  if (!order || !order.guestAccessToken || order.guestAccessToken !== token || now > order.guestAccessTokenExpiresAt) {
    notFound(); // 404 Access Denied for missing, mismatched, or expired tokens
  }

  // Payment method string helper
  const latestPayment = order.payments[0];
  const paymentMethodDisplay = latestPayment
    ? latestPayment.provider
    : (order.salesChannel === 'DIRECT' ? 'Direct Sale' : 'COD / Pay on Delivery');

  return (
    <div className="bg-white text-[#111111] min-h-screen py-12 sm:py-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        
        {/* Header / Success State */}
        <div className="text-center space-y-4 mb-10 pb-8 border-b border-[#EAEAEA]">
          <div className="w-14 h-14 bg-[#FAFAF8] border border-[#EAEAEA] text-[#111111] rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7 stroke-[1.5]" />
          </div>
          <p className="text-xs uppercase tracking-widest text-[#666666] font-medium">Thank You For Your Order</p>
          <h1 className="text-3xl sm:text-4xl font-serif text-[#111111] font-normal tracking-tight">
            Order Confirmed
          </h1>
          <p className="text-sm text-[#666666] max-w-md mx-auto">
            Your order <span className="font-mono text-[#111111] font-semibold">{order.orderNumber}</span> has been received and is being processed.
          </p>
        </div>

        {/* Status Summary Banner */}
        <div className="bg-[#FAFAF8] border border-[#EAEAEA] p-4 sm:p-5 rounded-none mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="flex items-center space-x-2.5">
            <Clock className="w-4 h-4 text-[#666666]" />
            <div>
              <span className="text-[#666666] block text-[11px] uppercase tracking-wider">Order Status</span>
              <span className="font-medium text-[#111111] uppercase tracking-wide">{order.status}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2.5">
            <Package className="w-4 h-4 text-[#666666]" />
            <div>
              <span className="text-[#666666] block text-[11px] uppercase tracking-wider">Payment Status</span>
              <span className="font-medium text-[#111111] uppercase tracking-wide">
                {order.paymentStatus} ({paymentMethodDisplay})
              </span>
            </div>
          </div>
        </div>

        {/* Phase 10 Customer Shipment & Live Tracking Details (if available) */}
        {order.shipment && (
          <div className="bg-[#FAFAF8] border border-[#EAEAEA] p-6 mb-8 space-y-4">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
              <div className="flex items-center space-x-2">
                <Package className="w-4 h-4 text-[#111111]" />
                <h2 className="font-serif text-lg font-medium text-[#111111]">Shipment & Tracking</h2>
              </div>
              <span className="px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-wider bg-white border border-[#EAEAEA] text-[#111111]">
                {order.shipment.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[#666666] block text-[11px] uppercase tracking-wider">Courier Partner</span>
                <span className="text-[#111111] font-medium">{order.shipment.courierName}</span>
              </div>
              <div>
                <span className="text-[#666666] block text-[11px] uppercase tracking-wider">Tracking Number / AWB</span>
                <span className="text-[#111111] font-mono font-medium">{order.shipment.trackingId}</span>
              </div>
              <div>
                <span className="text-[#666666] block text-[11px] uppercase tracking-wider">Dispatched Date</span>
                <span className="text-[#111111] font-mono">
                  {new Date(order.shipment.dispatchedAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              {order.shipment.deliveredAt && (
                <div>
                  <span className="text-[#666666] block text-[11px] uppercase tracking-wider">Delivered Date</span>
                  <span className="text-[#111111] font-mono">
                    {new Date(order.shipment.deliveredAt).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              )}
            </div>

            {order.shipment.trackingUrl && (
              <div className="pt-2">
                <a
                  href={order.shipment.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center space-x-2 px-5 py-2.5 bg-[#111111] text-white text-xs font-medium uppercase tracking-widest hover:bg-black/80 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#111111]"
                >
                  <span>Track Package Live</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Shipping Address & Contact Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 py-6 border-y border-[#EAEAEA] text-xs mb-8">
          <div className="space-y-2">
            <h2 className="font-serif text-base font-medium text-[#111111] flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-[#666666]" />
              <span>Shipping Address</span>
            </h2>
            <p className="font-medium text-[#111111] text-sm">{order.customerNameSnapshot}</p>
            <p className="text-[#666666] whitespace-pre-line leading-relaxed">{order.shippingAddressSnapshot}</p>
          </div>

          <div className="space-y-2">
            <h2 className="font-serif text-base font-medium text-[#111111] flex items-center space-x-2">
              <Phone className="w-4 h-4 text-[#666666]" />
              <span>Contact Information</span>
            </h2>
            <p className="text-[#666666] flex items-center space-x-2">
              <Phone className="w-3.5 h-3.5 text-[#666666]" />
              <span>{order.customerMobileSnapshot}</span>
            </p>
            {order.customerEmailSnapshot && (
              <p className="text-[#666666] flex items-center space-x-2">
                <Mail className="w-3.5 h-3.5 text-[#666666]" />
                <span>{order.customerEmailSnapshot}</span>
              </p>
            )}
          </div>
        </div>

        {/* Order Items */}
        <div className="space-y-4 mb-8">
          <h2 className="font-serif text-xl font-medium text-[#111111]">Items Ordered</h2>
          <div className="divide-y divide-[#EAEAEA] border-t border-b border-[#EAEAEA]">
            {order.items.map((item) => {
              const imageUrl = item.variant?.product?.images?.[0]?.url;

              return (
                <div key={item.id} className="py-4 flex items-center justify-between text-xs gap-4">
                  <div className="flex items-center space-x-4 min-w-0">
                    <div className="relative w-16 h-20 bg-[#FAFAF8] border border-[#EAEAEA] flex-shrink-0 overflow-hidden">
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={item.productNameSnapshot}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#666666] font-mono text-[10px]">
                          SIFR
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-[#111111] text-sm truncate">{item.productNameSnapshot}</p>
                      <p className="text-[#666666] mt-0.5">
                        {item.variantTitleSnapshot} <span className="text-[#666666] font-mono">({item.skuSnapshot})</span>
                      </p>
                      <p className="text-[#666666] mt-1">
                        Qty: <span className="font-medium text-[#111111]">{item.quantity}</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono text-sm font-semibold text-[#111111]">
                      ₹{Number(item.lineTotal).toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-[#666666] mt-0.5">
                      ₹{Number(item.unitPrice).toLocaleString('en-IN')} / unit
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Financial Totals Summary */}
        <div className="bg-[#FAFAF8] border border-[#EAEAEA] p-6 space-y-3 text-xs mb-10">
          <div className="flex justify-between text-[#666666]">
            <span>Subtotal</span>
            <span className="font-mono text-[#111111]">₹{Number(order.subtotal).toLocaleString('en-IN')}</span>
          </div>
          {Number(order.discountTotal) > 0 && (
            <div className="flex justify-between text-[#666666]">
              <span>Discount</span>
              <span className="font-mono text-[#111111]">-₹{Number(order.discountTotal).toLocaleString('en-IN')}</span>
            </div>
          )}
          <div className="flex justify-between text-[#666666]">
            <span>Shipping Fee</span>
            <span className="font-mono text-[#111111]">
              {Number(order.shippingFee) === 0 ? 'FREE' : `₹${Number(order.shippingFee).toLocaleString('en-IN')}`}
            </span>
          </div>
          <div className="flex justify-between text-base font-semibold text-[#111111] pt-3 border-t border-[#EAEAEA]">
            <span>Total Amount</span>
            <span className="font-mono text-[#111111]">₹{Number(order.grandTotal).toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Continue Shopping Action CTA */}
        <div className="text-center pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center space-x-2 px-8 py-3.5 bg-[#111111] text-white font-medium text-xs uppercase tracking-widest hover:bg-black/90 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#111111]"
          >
            <span>Continue Shopping</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

      </div>
    </div>
  );
}

