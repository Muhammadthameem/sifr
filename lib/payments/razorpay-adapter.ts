import crypto from 'crypto';

export interface CreateRazorpayOrderParams {
  amount: number; // in INR
  currency?: string;
  orderNumber: string;
}

export class RazorpayAdapter {
  static verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  static async createOrder(params: CreateRazorpayOrderParams): Promise<{ providerOrderId: string; amountPaise: number; currency: string }> {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    const amountPaise = Math.round(params.amount * 100);
    const currency = params.currency || 'INR';

    if (!keyId || !keySecret) {
      // In development/test mode without API keys, fallback safely to a generated order token
      const fallbackId = `order_rzp_${crypto.randomBytes(8).toString('hex')}`;
      return { providerOrderId: fallbackId, amountPaise, currency };
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency,
        receipt: params.orderNumber,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`RAZORPAY_API_ERROR: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return {
      providerOrderId: data.id,
      amountPaise: data.amount,
      currency: data.currency,
    };
  }
}
