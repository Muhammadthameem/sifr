import { Prisma, NotificationEventType, NotificationStatus, NotificationResultClass } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { isTargetConstraint } from '@/lib/ordering/order-engine';
import { normalizeIndiaMobile } from '@/lib/validation/mobile';
import { getWhatsAppProvider, SendWhatsAppMessageInput } from './whatsapp-provider';

/**
 * Creates a Notification outbox record inside an existing Prisma transaction.
 * Idempotent: Catches P2002 unique constraint on (orderId, eventType) and returns existing notification.
 */
export async function createNotificationInOutbox(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    eventType: NotificationEventType;
    recipientMobile: string;
    payload: Record<string, any>;
  }
) {
  const normalizedMobile = normalizeIndiaMobile(input.recipientMobile);
  const payloadJson = JSON.stringify(input.payload);

  try {
    return await tx.notification.create({
      data: {
        orderId: input.orderId,
        eventType: input.eventType,
        channel: 'WHATSAPP',
        recipientMobile: normalizedMobile,
        payloadJson,
        status: NotificationStatus.PENDING,
        attemptCount: 0,
        nextAttemptAt: new Date(),
      },
    });
  } catch (err: any) {
    if (isTargetConstraint(err, 'order_event_unique') || err?.code === 'P2002') {
      return await tx.notification.findUniqueOrThrow({
        where: {
          order_event_unique: {
            orderId: input.orderId,
            eventType: input.eventType,
          },
        },
      });
    }
    throw err;
  }
}

/**
 * Concurrency-Safe Atomic Claim:
 * Transitions a notification from PENDING to PROCESSING using PostgreSQL row locks.
 * Returns true if successfully claimed, false if locked/claimed by another worker.
 */
export async function claimNotificationForProcessing(notificationId: string): Promise<boolean> {
  return await prisma.$transaction(async (tx) => {
    // Acquire FOR UPDATE SKIP LOCKED on PENDING notification row
    const rows = await tx.$queryRaw<any[]>`
      SELECT id FROM notifications 
      WHERE id = ${notificationId} AND status = 'PENDING' 
      FOR UPDATE SKIP LOCKED;
    `;

    if (!rows || rows.length === 0) {
      // Failed to claim (already claimed, processing, or locked by another worker)
      return false;
    }

    // Mark status PROCESSING inside the transaction
    await tx.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.PROCESSING,
        updatedAt: new Date(),
      },
    });

    return true; // Successfully owned claim
  });
}

/**
 * Formulates WhatsApp template parameters from event payload JSON.
 */
export function buildTemplatePayload(eventType: NotificationEventType, payloadJsonStr: string) {
  const payload = JSON.parse(payloadJsonStr);

  const envTemplates: Record<NotificationEventType, string> = {
    ORDER_RECEIVED: process.env.WHATSAPP_TEMPLATE_ORDER_RECEIVED || 'sifr_order_received_v1',
    ORDER_CONFIRMED: process.env.WHATSAPP_TEMPLATE_ORDER_CONFIRMED || 'sifr_order_confirmed_v1',
    ORDER_DISPATCHED: process.env.WHATSAPP_TEMPLATE_ORDER_DISPATCHED || 'sifr_order_dispatched_v1',
  };

  const templateName = envTemplates[eventType];
  let templateParameters: string[] = [];

  if (eventType === 'ORDER_RECEIVED') {
    templateParameters = [
      payload.customerName || 'Customer',
      payload.orderNumber || '',
      String(payload.grandTotal || '0.00'),
    ];
  } else if (eventType === 'ORDER_CONFIRMED') {
    templateParameters = [
      payload.customerName || 'Customer',
      payload.orderNumber || '',
    ];
  } else if (eventType === 'ORDER_DISPATCHED') {
    templateParameters = [
      payload.customerName || 'Customer',
      payload.orderNumber || '',
      payload.courierName || 'Courier',
      payload.trackingId || '',
      payload.trackingUrl || 'N/A',
    ];
  }

  return { templateName, templateParameters };
}

/**
 * Outbox Notification Processor:
 * Atomically claims notification, invokes provider API, and transactionally updates status + attempt history.
 */
export async function processNotification(notificationId: string) {
  // 1. ATOMIC CLAIM: Must succeed before invoking provider API
  const claimed = await claimNotificationForProcessing(notificationId);
  if (!claimed) {
    // Worker failed to acquire claim; DO NOT CALL PROVIDER!
    return null;
  }

  const notification = await prisma.notification.findUniqueOrThrow({
    where: { id: notificationId },
  });

  const { templateName, templateParameters } = buildTemplatePayload(
    notification.eventType,
    notification.payloadJson
  );

  const providerIdempotencyKey = `NOTIF:${notification.orderId}:${notification.eventType}`;
  const provider = getWhatsAppProvider();

  const messageInput: SendWhatsAppMessageInput = {
    providerIdempotencyKey,
    toMobile: notification.recipientMobile,
    templateName,
    templateParameters,
  };

  // 2. PROVIDER API CALL (Outside core transaction)
  const providerResult = await provider.sendMessage(messageInput);

  const now = new Date();
  let nextStatus: NotificationStatus;
  let nextAttemptAt = now;

  if (providerResult.resultClass === 'SUCCESS') {
    nextStatus = NotificationStatus.SENT;
  } else if (providerResult.resultClass === 'RETRYABLE_FAILURE') {
    const nextAttemptCount = notification.attemptCount + 1;
    if (nextAttemptCount < 3) {
      nextStatus = NotificationStatus.PENDING;
      // Exponential backoff: Attempt 1 -> +5 mins, Attempt 2 -> +30 mins
      const backoffMs = nextAttemptCount === 1 ? 5 * 60 * 1000 : 30 * 60 * 1000;
      nextAttemptAt = new Date(now.getTime() + backoffMs);
    } else {
      nextStatus = NotificationStatus.FAILED;
    }
  } else if (providerResult.resultClass === 'PERMANENT_FAILURE') {
    nextStatus = NotificationStatus.FAILED;
  } else {
    // UNKNOWN result class (Network timeout / ETIMEDOUT / lost response)
    nextStatus = NotificationStatus.REQUIRES_RECONCILIATION;
  }

  // 3. TRANSACTIONAL UPDATE: Increment attemptCount & log attempt row
  return await prisma.$transaction(async (tx) => {
    return await tx.notification.update({
      where: { id: notificationId },
      data: {
        status: nextStatus,
        attemptCount: { increment: 1 },
        nextAttemptAt,
        lastAttemptAt: now,
        sentAt: nextStatus === NotificationStatus.SENT ? now : notification.sentAt,
        failedAt: nextStatus === NotificationStatus.FAILED ? now : notification.failedAt,
        attempts: {
          create: {
            attemptNumber: notification.attemptCount + 1,
            status: nextStatus,
            resultClass: providerResult.resultClass,
            providerName: provider.providerName,
            providerMessageId: providerResult.providerMessageId || null,
            errorCode: providerResult.errorCode || null,
            errorMessage: providerResult.errorMessage || null,
            providerResponseJson: providerResult.rawResponseJson || null,
          },
        },
      },
      include: { attempts: true },
    });
  });
}

/**
 * Authoritative Poller Runner:
 * Queries PENDING notifications due for processing and processes them.
 */
export async function processPendingNotifications(limit: number = 10) {
  const pendingNotifications = await prisma.notification.findMany({
    where: {
      status: NotificationStatus.PENDING,
      nextAttemptAt: { lte: new Date() },
      attemptCount: { lt: 3 },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  const results = [];
  for (const notif of pendingNotifications) {
    const res = await processNotification(notif.id);
    if (res) results.push(res);
  }

  return results;
}

/**
 * Reconciles or Retries a Notification in FAILED or REQUIRES_RECONCILIATION state.
 */
export async function reconcileOrRetryNotification(notificationId: string) {
  const notification = await prisma.notification.findUniqueOrThrow({
    where: { id: notificationId },
  });

  if (notification.status === NotificationStatus.SENT) {
    return notification;
  }

  // Reset status to PENDING transactionally so claimNotificationForProcessing can claim it
  await prisma.notification.update({
    where: { id: notificationId },
    data: {
      status: NotificationStatus.PENDING,
      nextAttemptAt: new Date(),
    },
  });

  return await processNotification(notificationId);
}
