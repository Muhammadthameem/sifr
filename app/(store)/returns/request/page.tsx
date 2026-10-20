import { prisma } from '@/lib/db/prisma';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, Package, CheckCircle, ShieldAlert } from 'lucide-react';
import { submitReturnRequestAction } from '@/lib/actions/return-actions';

export const dynamic = 'force-dynamic';

export default async function CustomerReturnRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ orderNumber?: string; token?: string }>;
}) {
  const params = await searchParams;
  const orderNumber = params.orderNumber || '';
  const token = params.token || '';

  let order: any = null;
  let errorMsg = '';

  if (orderNumber) {
    order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    variants: true,
                  },
                },
              },
            },
          },
        },
        returnRequests: {
          include: { items: true },
        },
      },
    });

    if (!order) {
      errorMsg = `Order '${orderNumber}' not found.`;
    } else if (order.status !== 'DELIVERED') {
      errorMsg = `Return requests can only be initiated for DELIVERED orders (current: ${order.status}).`;
    } else if (token && order.guestAccessToken !== token) {
      errorMsg = 'Invalid guest access token.';
    } else {
      const deliveryDate = order.deliveredAt || order.createdAt;
      const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
      if (Date.now() - deliveryDate.getTime() > fourteenDaysMs) {
        errorMsg = '14-day return window has expired for this order.';
      }
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Storefront
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <RotateCcw className="w-8 h-8 text-amber-400" />
          Request Return or Exchange
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Delivered items are eligible for return or same-product exchange within 14 calendar days of delivery.
        </p>
      </div>

      {/* Lookup Form if order not provided */}
      {!order && (
        <form className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Look Up Delivered Order</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-zinc-400 block mb-1">Order Number</label>
              <input
                type="text"
                name="orderNumber"
                placeholder="ORD-YYYYMMDD-XXXX"
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">Access Token (Optional for Guest)</label>
              <input
                type="text"
                name="token"
                placeholder="Guest access token"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <button type="submit" className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-xs transition-colors">
            Look Up Order
          </button>
        </form>
      )}

      {errorMsg && (
        <div className="bg-rose-950/30 border border-rose-900/50 rounded-xl p-4 text-xs text-rose-300 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Order Details & Return Form */}
      {order && !errorMsg && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
            <div>
              <p className="text-xs text-zinc-400">Order</p>
              <p className="text-lg font-bold font-mono text-amber-400">{order.orderNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-400">Delivered On</p>
              <p className="text-xs font-medium text-white">{new Date(order.deliveredAt || order.createdAt).toLocaleDateString('en-IN')}</p>
            </div>
          </div>

          <form action={async (formData: FormData) => {
            'use server';
            const reason = formData.get('reason') as any;
            const reasonDetails = formData.get('reasonDetails') as string;

            const selectedItems: Array<{ orderItemId: string; quantityRequested: number }> = [];

            for (const item of order.items) {
              const qty = parseInt(formData.get(`qty_${item.id}`) as string || '0', 10);
              if (qty > 0) {
                selectedItems.push({
                  orderItemId: item.id,
                  quantityRequested: qty,
                });
              }
            }

            if (selectedItems.length > 0 && reason) {
              await submitReturnRequestAction({
                orderId: order.id,
                reason,
                reasonDetails,
                items: selectedItems,
                submissionIdempotencyKey: `ret-sub-${order.id}-${Date.now()}`,
                guestAccessToken: token || undefined,
              });
            }
          }} className="space-y-6 text-xs">
            {/* Selectable Items */}
            <div className="space-y-3">
              <h3 className="font-semibold text-white uppercase tracking-wider">Select Items to Return</h3>
              {order.items.map((item: any) => {
                let alreadyReturned = 0;
                for (const ret of order.returnRequests) {
                  if (ret.status !== 'REJECTED') {
                    const match = ret.items.find((ri: any) => ri.orderItemId === item.id);
                    if (match) alreadyReturned += match.quantityRequested;
                  }
                }
                const maxAvailable = item.quantity - alreadyReturned;

                return (
                  <div key={item.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex justify-between items-center gap-4">
                    <div>
                      <p className="font-semibold text-white">{item.productNameSnapshot} - {item.variantTitleSnapshot}</p>
                      <p className="font-mono text-[11px] text-zinc-400 mt-0.5">SKU: {item.skuSnapshot} | Unit Price: ₹{Number(item.unitPrice).toFixed(2)}</p>
                      {alreadyReturned > 0 && (
                        <p className="text-[10px] text-amber-400 mt-1">Already returned: {alreadyReturned} unit(s)</p>
                      )}
                    </div>
                    <div>
                      {maxAvailable > 0 ? (
                        <select name={`qty_${item.id}`} className="bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-white font-mono text-xs">
                          <option value={0}>0 (Skip)</option>
                          {Array.from({ length: maxAvailable }, (_, i) => i + 1).map((num) => (
                            <option key={num} value={num}>Return {num} unit(s)</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-zinc-500 italic">Fully returned</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reason Selection */}
            <div className="space-y-3">
              <h3 className="font-semibold text-white uppercase tracking-wider">Return Reason</h3>
              <select name="reason" required className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white text-xs">
                <option value="SIZE_FIT_ISSUE">Size or Fit Issue</option>
                <option value="DEFECTIVE">Defective or Damaged Item</option>
                <option value="WRONG_ITEM">Wrong Item Received</option>
                <option value="NOT_AS_DESCRIBED">Item Not as Described</option>
                <option value="CHANGE_OF_MIND">Change of Mind</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* Reason Details */}
            <div className="space-y-3">
              <h3 className="font-semibold text-white uppercase tracking-wider">Additional Details (Optional)</h3>
              <textarea
                name="reasonDetails"
                rows={3}
                placeholder="Provide additional details about fit, defect, or comments..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <button type="submit" className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4" />
              Submit Return & Exchange Request
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
