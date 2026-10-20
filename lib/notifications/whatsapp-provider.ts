import { NotificationResultClass } from '@prisma/client';

export interface SendWhatsAppMessageInput {
  providerIdempotencyKey: string; // e.g. NOTIF:{orderId}:{eventType}
  toMobile: string;
  templateName: string;
  templateParameters: string[];
}

export interface SendWhatsAppMessageResult {
  resultClass: NotificationResultClass;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  rawResponseJson?: string;
}

export interface WhatsAppProviderAdapter {
  providerName: string;
  sendMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult>;
}

/**
 * Deterministic Mock WhatsApp Provider for Local Dev & Automated Verification
 */
export type MockProviderBehaviorMode = 'NORMAL' | 'TIMEOUT' | 'PERMANENT_FAIL' | 'RETRYABLE_FAIL';

class MockWhatsAppProviderImpl implements WhatsAppProviderAdapter {
  public providerName = 'MOCK_WHATSAPP';
  private sentMessagesMap = new Map<string, SendWhatsAppMessageResult>();
  private behaviorMode: MockProviderBehaviorMode = 'NORMAL';
  public callCount = 0;

  public setBehaviorMode(mode: MockProviderBehaviorMode) {
    this.behaviorMode = mode;
  }

  public reset() {
    this.sentMessagesMap.clear();
    this.behaviorMode = 'NORMAL';
    this.callCount = 0;
  }

  async sendMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult> {
    this.callCount++;

    // Provider-level Idempotency Check:
    // If the provider already processed this providerIdempotencyKey, return identical successful result
    if (this.sentMessagesMap.has(input.providerIdempotencyKey)) {
      return this.sentMessagesMap.get(input.providerIdempotencyKey)!;
    }

    if (this.behaviorMode === 'TIMEOUT') {
      return {
        resultClass: 'UNKNOWN',
        errorCode: 'ETIMEDOUT',
        errorMessage: 'Provider HTTP request timed out waiting for socket response',
        rawResponseJson: JSON.stringify({ error: 'ETIMEDOUT', timeoutMs: 5000 }),
      };
    }

    if (this.behaviorMode === 'PERMANENT_FAIL') {
      return {
        resultClass: 'PERMANENT_FAILURE',
        errorCode: 'INVALID_RECIPIENT_MOBILE',
        errorMessage: `Mobile ${input.toMobile} is not registered on WhatsApp`,
        rawResponseJson: JSON.stringify({ code: 400, message: 'Invalid recipient' }),
      };
    }

    if (this.behaviorMode === 'RETRYABLE_FAIL') {
      return {
        resultClass: 'RETRYABLE_FAILURE',
        errorCode: 'RATE_LIMIT_EXCEEDED',
        errorMessage: 'WhatsApp Provider API 429 Too Many Requests',
        rawResponseJson: JSON.stringify({ code: 429, message: 'Rate limit exceeded' }),
      };
    }

    // Default NORMAL success path
    const mockMessageId = `mock_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const result: SendWhatsAppMessageResult = {
      resultClass: 'SUCCESS',
      providerMessageId: mockMessageId,
      rawResponseJson: JSON.stringify({
        status: 'sent',
        sid: mockMessageId,
        to: input.toMobile,
        template: input.templateName,
        params: input.templateParameters,
      }),
    };

    this.sentMessagesMap.set(input.providerIdempotencyKey, result);
    return result;
  }
}

export const mockWhatsAppProvider = new MockWhatsAppProviderImpl();

/**
 * Twilio WhatsApp Provider Adapter
 */
class TwilioWhatsAppProviderImpl implements WhatsAppProviderAdapter {
  public providerName = 'TWILIO_WHATSAPP';

  async sendMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

    if (!accountSid || !authToken) {
      return {
        resultClass: 'PERMANENT_FAILURE',
        errorCode: 'MISSING_TWILIO_CREDENTIALS',
        errorMessage: 'TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is not configured',
      };
    }

    try {
      const bodyParams = input.templateParameters.join(', ');
      const messageBody = `[SIFR Notification - ${input.templateName}] ${bodyParams}`;
      
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': input.providerIdempotencyKey,
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: `whatsapp:${input.toMobile}`,
          Body: messageBody,
        }),
      });

      const responseText = await response.text();
      let responseJson: any = {};
      try { responseJson = JSON.parse(responseText); } catch {}

      if (response.ok) {
        return {
          resultClass: 'SUCCESS',
          providerMessageId: responseJson.sid || `tw_${Date.now()}`,
          rawResponseJson: responseText,
        };
      }

      if (response.status === 429 || response.status >= 500) {
        return {
          resultClass: 'RETRYABLE_FAILURE',
          errorCode: String(responseJson.code || response.status),
          errorMessage: responseJson.message || 'Twilio server error / rate limit',
          rawResponseJson: responseText,
        };
      }

      return {
        resultClass: 'PERMANENT_FAILURE',
        errorCode: String(responseJson.code || response.status),
        errorMessage: responseJson.message || 'Twilio client request error',
        rawResponseJson: responseText,
      };
    } catch (err: any) {
      return {
        resultClass: 'UNKNOWN',
        errorCode: 'NETWORK_ERROR',
        errorMessage: err.message || 'Network error connecting to Twilio',
      };
    }
  }
}

/**
 * Meta Cloud API WhatsApp Provider Adapter
 */
class MetaCloudApiWhatsAppProviderImpl implements WhatsAppProviderAdapter {
  public providerName = 'META_WHATSAPP_CLOUD';

  async sendMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult> {
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
    const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      return {
        resultClass: 'PERMANENT_FAILURE',
        errorCode: 'MISSING_META_CREDENTIALS',
        errorMessage: 'META_PHONE_NUMBER_ID or META_WHATSAPP_ACCESS_TOKEN is not configured',
      };
    }

    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': input.providerIdempotencyKey,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: input.toMobile.replace('+', ''),
          type: 'template',
          template: {
            name: input.templateName,
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: input.templateParameters.map((p) => ({ type: 'text', text: p })),
              },
            ],
          },
        }),
      });

      const responseText = await response.text();
      let responseJson: any = {};
      try { responseJson = JSON.parse(responseText); } catch {}

      if (response.ok) {
        return {
          resultClass: 'SUCCESS',
          providerMessageId: responseJson.messages?.[0]?.id || `meta_${Date.now()}`,
          rawResponseJson: responseText,
        };
      }

      if (response.status === 429 || response.status >= 500) {
        return {
          resultClass: 'RETRYABLE_FAILURE',
          errorCode: String(responseJson.error?.code || response.status),
          errorMessage: responseJson.error?.message || 'Meta API server error / rate limit',
          rawResponseJson: responseText,
        };
      }

      return {
        resultClass: 'PERMANENT_FAILURE',
        errorCode: String(responseJson.error?.code || response.status),
        errorMessage: responseJson.error?.message || 'Meta API request error',
        rawResponseJson: responseText,
      };
    } catch (err: any) {
      return {
        resultClass: 'UNKNOWN',
        errorCode: 'NETWORK_ERROR',
        errorMessage: err.message || 'Network error connecting to Meta WhatsApp API',
      };
    }
  }
}

export function getWhatsAppProvider(): WhatsAppProviderAdapter {
  const providerType = (process.env.WHATSAPP_PROVIDER || 'MOCK').toUpperCase();

  if (providerType === 'TWILIO') {
    return new TwilioWhatsAppProviderImpl();
  }
  if (providerType === 'META') {
    return new MetaCloudApiWhatsAppProviderImpl();
  }
  return mockWhatsAppProvider;
}
