import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { getAdminOrderDetails } from '@/lib/ordering/order-query';
import { getStoreSettings } from '@/lib/settings/settings-service';
import { generateOrderBillPdf } from '@/lib/ordering/bill-pdf';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Authorization: Requires authenticated admin session
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized: Admin authentication required' }, { status: 401 });
  }

  const orderId = params.id;
  if (!orderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
  }

  const order = await getAdminOrderDetails(orderId);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Bills can be generated for confirmed, dispatched, or delivered orders
  if (order.status === 'CONTACTED') {
    return NextResponse.json(
      { error: 'Cannot generate bill for unconfirmed CONTACTED order' },
      { status: 400 }
    );
  }

  const settings = await getStoreSettings();
  const pdfBuffer = await generateOrderBillPdf(order, settings);

  const isDownload = request.nextUrl.searchParams.get('download') === '1';
  const disposition = isDownload ? 'attachment' : 'inline';

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="SIFR-Bill-${order.orderNumber}.pdf"`,
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
