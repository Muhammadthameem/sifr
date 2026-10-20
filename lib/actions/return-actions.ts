'use server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import {
  createReturnRequest,
  approveReturnRequest,
  rejectReturnRequest,
  recordPhysicalReceipt,
  processIncrementalInspection,
  resolvePartialReturn,
  approveSameProductExchange,
  dispatchExchangeItem,
  cancelExchangeItem,
  CreateReturnInput,
  PhysicalReceiptInput,
  InspectionInput,
  PartialClosureItemInput,
  ApproveExchangeInput,
  findOrderByNumber,
  findOrdersByPhone,
  createAdminFullReturn,
  acceptAdminReturn,
  rejectAdminReturn,
  CreateAdminFullReturnInput,
  AcceptAdminReturnInput,
  RejectAdminReturnInput,
} from '@/lib/returns/return-engine';

import {
  createRefundIntent,
  dispatchGatewayRefund,
  retryRefundAction as retryRefundEngineAction,
  resolveFailedRefundAction as resolveFailedEngineAction,
  executeManualOfflineRefund,
  CreateRefundIntentInput,
  ResolveFailedRefundInput,
  ExecuteManualOfflineRefundInput,
} from '@/lib/returns/refund-engine';
import { revalidatePath } from 'next/cache';

export async function submitReturnRequestAction(input: CreateReturnInput) {
  try {
    const result = await createReturnRequest(input);
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to submit return request' };
  }
}

export async function approveReturnRequestAction(returnRequestId: string, adminNotes?: string) {
  try {
    await requireAdminAuth();
    const updated = await approveReturnRequest(returnRequestId, adminNotes);
    return { success: true, returnRequest: updated };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to approve return request' };
  }
}

export async function rejectReturnRequestAction(returnRequestId: string, adminNotes?: string) {
  try {
    await requireAdminAuth();
    const updated = await rejectReturnRequest(returnRequestId, adminNotes);
    return { success: true, returnRequest: updated };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to reject return request' };
  }
}

export async function recordPhysicalReceiptAction(input: PhysicalReceiptInput) {
  try {
    await requireAdminAuth();
    const result = await recordPhysicalReceipt(input);
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to record physical receipt' };
  }
}

export async function inspectAndRestockAction(input: InspectionInput) {
  try {
    await requireAdminAuth();
    const result = await processIncrementalInspection(input);
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to process inspection' };
  }
}

export async function resolvePartialReturnAction(
  returnRequestId: string,
  closures: PartialClosureItemInput[]
) {
  try {
    await requireAdminAuth();
    const updated = await resolvePartialReturn(returnRequestId, closures);
    return { success: true, returnRequest: updated };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to resolve partial return' };
  }
}

export async function approveSameProductExchangeAction(input: ApproveExchangeInput) {
  try {
    await requireAdminAuth();
    const exchangeItem = await approveSameProductExchange(input);
    return { success: true, exchangeItem };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to approve exchange' };
  }
}

export async function dispatchExchangeItemAction(exchangeItemId: string) {
  try {
    await requireAdminAuth();
    const updated = await dispatchExchangeItem(exchangeItemId);
    return { success: true, exchangeItem: updated };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to dispatch exchange item' };
  }
}

export async function cancelExchangeItemAction(exchangeItemId: string) {
  try {
    await requireAdminAuth();
    const updated = await cancelExchangeItem(exchangeItemId);
    return { success: true, exchangeItem: updated };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to cancel exchange item' };
  }
}

export async function createRefundIntentAction(input: CreateRefundIntentInput) {
  try {
    await requireAdminAuth();
    const result = await createRefundIntent(input);
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create refund intent' };
  }
}

export async function dispatchGatewayRefundAction(refundId: string) {
  try {
    await requireAdminAuth();
    const result = await dispatchGatewayRefund(refundId);
    return { success: true, refund: result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to dispatch gateway refund' };
  }
}

export async function retryRefundAction(refundId: string) {
  try {
    await requireAdminAuth();
    const updated = await retryRefundEngineAction(refundId);
    await dispatchGatewayRefund(refundId);
    return { success: true, refund: updated };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to retry refund' };
  }
}

export async function resolveFailedRefundAction(input: ResolveFailedRefundInput) {
  try {
    await requireAdminAuth();
    const updated = await resolveFailedEngineAction(input);
    return { success: true, refund: updated };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to manually resolve failed refund' };
  }
}

export async function executeManualOfflineRefundAction(input: ExecuteManualOfflineRefundInput) {
  try {
    await requireAdminAuth();
    const refund = await executeManualOfflineRefund(input);
    revalidatePath('/admin/returns');
    revalidatePath('/admin/reports/returns');
    return { success: true, refund };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to execute manual offline refund' };
  }
}

export async function findOrderByNumberAction(orderNumber: string) {
  try {
    await requireAdminAuth();
    const result = await findOrderByNumber(orderNumber);
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to search order by number' };
  }
}

export async function findOrdersByPhoneAction(phone: string) {
  try {
    await requireAdminAuth();
    const orders = await findOrdersByPhone(phone);
    return { success: true, data: orders };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to search orders by phone' };
  }
}

export async function createAdminFullReturnAction(input: CreateAdminFullReturnInput) {
  try {
    await requireAdminAuth();
    const returnReq = await createAdminFullReturn(input);
    revalidatePath('/admin/returns');
    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${input.orderId}`);
    return { success: true, returnRequest: returnReq };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create return' };
  }
}

export async function acceptAdminReturnAction(input: AcceptAdminReturnInput) {
  try {
    const session = await requireAdminAuth();
    const result = await acceptAdminReturn({
      ...input,
      adminId: session.adminId,
    });
    revalidatePath('/admin/returns');
    revalidatePath(`/admin/returns/${input.returnRequestId}`);
    revalidatePath('/admin/orders');
    revalidatePath('/admin/inventory');
    revalidatePath('/admin/reports/returns');
    revalidatePath('/admin/reports/sales');
    revalidatePath('/admin/dashboard');
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to accept return' };
  }
}

export async function rejectAdminReturnAction(input: RejectAdminReturnInput) {
  try {
    await requireAdminAuth();
    const result = await rejectAdminReturn(input);
    revalidatePath('/admin/returns');
    revalidatePath(`/admin/returns/${input.returnRequestId}`);
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to reject return' };
  }
}


