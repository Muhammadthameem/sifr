'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { reconcileOrRetryNotification } from '@/lib/notifications/notification-engine';

export async function retryNotificationAction(input: { notificationId: string }) {
  try {
    await requireAdminAuth();
    const notification = await reconcileOrRetryNotification(input.notificationId);
    revalidatePath('/admin/orders');
    if (notification) {
      revalidatePath(`/admin/orders/${notification.orderId}`);
    }
    return { success: true, notification };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to retry notification' };
  }
}

export async function getNotificationsByOrderIdAction(orderId: string) {
  try {
    await requireAdminAuth();
    const notifications = await prisma.notification.findMany({
      where: { orderId },
      include: {
        attempts: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, notifications };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch notifications' };
  }
}
