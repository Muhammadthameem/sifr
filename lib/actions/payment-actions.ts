'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import {
  queryAdminPayments,
  queryAdminRefunds,
  getAdminPaymentDetail,
  GetPaymentsParams,
  GetRefundsParams,
} from '@/lib/payments/payment-query';
import {
  updateOrderPaymentAdmin,
  UpdateOrderPaymentAdminInput,
} from '@/lib/ordering/order-engine';
import {
  executeManualOfflineRefund,
  ExecuteManualOfflineRefundInput,
} from '@/lib/returns/refund-engine';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore when executed outside Next.js request context (e.g. tests/scripts)
  }
}

export async function getAdminPaymentsAction(params?: GetPaymentsParams) {
  await requireAdminAuth();
  return queryAdminPayments(params);
}

export async function getAdminRefundsAction(params?: GetRefundsParams) {
  await requireAdminAuth();
  return queryAdminRefunds(params);
}

export async function getAdminPaymentDetailAction(orderId: string) {
  await requireAdminAuth();
  return getAdminPaymentDetail(orderId);
}

export async function updateOrderPaymentAdminAction(input: UpdateOrderPaymentAdminInput) {
  try {
    await requireAdminAuth();
    const order = await updateOrderPaymentAdmin(input);
    safeRevalidatePath('/admin/payments');
    safeRevalidatePath('/admin/orders');
    safeRevalidatePath(`/admin/orders/${input.orderId}`);
    return { success: true, order };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update order payment' };
  }
}

export async function executeManualOfflineRefundPaymentAction(input: ExecuteManualOfflineRefundInput) {
  try {
    const session = await requireAdminAuth();
    const refund = await executeManualOfflineRefund({
      ...input,
      adminId: session.adminId,
    });
    safeRevalidatePath('/admin/payments');
    safeRevalidatePath('/admin/orders');
    safeRevalidatePath('/admin/returns');
    return { success: true, refund };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to execute manual offline refund' };
  }
}
