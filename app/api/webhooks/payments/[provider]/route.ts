import { NextRequest, NextResponse } from 'next/server';
import { processPaymentWebhook } from '@/lib/payments/payment-engine';

export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const providerUpper = params.provider.toUpperCase() as 'RAZORPAY' | 'MOCK';

  if (providerUpper !== 'RAZORPAY' && providerUpper !== 'MOCK') {
    return NextResponse.json({ error: 'Unsupported payment provider' }, { status: 400 });
  }

  try {
    const rawBody = await request.text();
    const signature =
      request.headers.get('x-razorpay-signature') ||
      request.headers.get('x-mock-signature') ||
      '';

    const result = await processPaymentWebhook({
      provider: providerUpper,
      rawBody,
      signature,
    });

    return NextResponse.json({ status: 'ok', result }, { status: 200 });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    if (err.message?.includes('CONFLICTING_WEBHOOK_EVENT') || err.message?.includes('INVALID_WEBHOOK')) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Internal webhook error' }, { status: 500 });
  }
}
