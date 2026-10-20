import crypto from 'crypto';

export interface CreateGatewayOrderParams {
  orderId: string;
  amount: number; // in INR
  currency: string;
  receipt?: string;
}

export interface GatewayOrderResult {
  providerOrderId: string;
  amountPaise: number;
  currency: string;
}

export interface VerifyWebhookParams {
  rawBody: string;
  signature: string;
  secret: string;
}

export class MockPaymentAdapter {
  static readonly MOCK_SECRET = 'mock_webhook_secret_key_sifr_phase8';

  static createGatewayOrder(params: CreateGatewayOrderParams): GatewayOrderResult {
    const amountPaise = Math.round(params.amount * 100);
    const providerOrderId = `mock_order_${crypto.randomBytes(8).toString('hex')}`;
    return {
      providerOrderId,
      amountPaise,
      currency: params.currency || 'INR',
    };
  }

  static verifyWebhookSignature(params: VerifyWebhookParams): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', params.secret)
      .update(params.rawBody)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(params.signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  static generateMockWebhookPayload(params: {
    eventId: string;
    eventType: string;
    providerOrderId: string;
    providerPaymentId: string;
    amountPaise: number;
    status: string;
    secret?: string;
  }) {
    const secret = params.secret || MockPaymentAdapter.MOCK_SECRET;
    const bodyObj = {
      event: params.eventType,
      event_id: params.eventId,
      payload: {
        payment: {
          entity: {
            id: params.providerPaymentId,
            order_id: params.providerOrderId,
            amount: params.amountPaise,
            currency: 'INR',
            status: params.status,
            method: 'upi',
          },
        },
      },
    };

    const rawBody = JSON.stringify(bodyObj);
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    return { rawBody, signature, bodyObj };
  }
}
