import { Prisma, OrderStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/**
 * Idempotent Reservation Cleanup Worker
 * Discovers online orders where status is RECEIVED, paymentStatus is PENDING,
 * and reservationExpiresAt <= now().
 * Reverts reservedStock, reverses coupon usage, and sets order status to CANCELLED.
 */
export async function cleanupExpiredReservations(targetOrderId?: string) {
  const now = new Date();

  // Find candidate expired orders
  const candidateOrders = await prisma.order.findMany({
    where: {
      status: OrderStatus.RECEIVED,
      paymentStatus: PaymentStatus.PENDING,
      reservationExpiresAt: { lte: now },
      ...(targetOrderId ? { id: targetOrderId } : {}),
    },
    include: {
      items: true,
      couponUsage: true,
      payments: {
        where: {
          status: { in: ['INITIATED', 'PROCESSING'] },
        },
      },
    },
  });

  const processedOrderIds: string[] = [];

  for (const candidate of candidateOrders) {
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Lock InventoryItem rows in deterministic ascending variantId order
        const variantIds = Array.from(new Set(candidate.items.map((i) => i.variantId))).sort();
        for (const vId of variantIds) {
          await tx.$queryRaw`SELECT * FROM inventory_items WHERE variant_id = ${vId} FOR UPDATE`;
        }

        // 2. Lock Coupon row (if coupon was used)
        if (candidate.couponId) {
          await tx.$queryRaw`SELECT * FROM coupons WHERE id = ${candidate.couponId} FOR UPDATE`;
        }

        // 3. Lock Order row FOR UPDATE
        const orderArr = await tx.$queryRaw<Array<any>>`
          SELECT * FROM orders WHERE id = ${candidate.id} FOR UPDATE
        `;
        if (!orderArr || orderArr.length === 0) return;
        const currentOrder = orderArr[0];

        // Re-verify status inside lock
        if (currentOrder.status !== OrderStatus.RECEIVED || currentOrder.payment_status !== PaymentStatus.PENDING) {
          return; // Already updated or paid by concurrent transaction
        }

        // 4. Revert reservedStock on InventoryItems
        for (const item of candidate.items) {
          await tx.inventoryItem.update({
            where: { variantId: item.variantId },
            data: {
              reservedStock: { decrement: item.quantity },
            },
          });
        }

        // 5. Revert Coupon Usage (if active)
        if (candidate.couponUsage && candidate.couponUsage.status === 'ACTIVE') {
          await tx.couponUsage.update({
            where: { id: candidate.couponUsage.id },
            data: {
              status: 'REVERSED',
              reversedAt: now,
              reversalReason: 'UNPAID_ORDER_EXPIRED',
            },
          });

          await tx.coupon.update({
            where: { id: candidate.couponUsage.couponId },
            data: {
              usageCountGlobal: { decrement: 1 },
            },
          });
        }

        // 6. Mark active Payment attempts as EXPIRED
        for (const paymentAttempt of candidate.payments) {
          await tx.payment.update({
            where: { id: paymentAttempt.id },
            data: {
              status: 'EXPIRED',
              errorMessage: 'Payment window expired before completion',
            },
          });
        }

        // 7. Update Order status to CANCELLED and paymentStatus to FAILED
        await tx.order.update({
          where: { id: candidate.id },
          data: {
            status: OrderStatus.CANCELLED,
            paymentStatus: PaymentStatus.FAILED,
            cancelledAt: now,
          },
        });

        // 8. Log OrderStatusTransition
        await tx.orderStatusTransition.create({
          data: {
            orderId: candidate.id,
            idempotencyKey: `cleanup-cancel-${candidate.id}-${Date.now()}`,
            fromStatus: OrderStatus.RECEIVED,
            toStatus: OrderStatus.CANCELLED,
            notes: 'Automated reservation cleanup: 30-minute unpaid payment window expired',
          },
        });

        processedOrderIds.push(candidate.id);
      });
    } catch (err) {
      console.error(`Error cleaning up expired order ${candidate.id}:`, err);
    }
  }

  return { processedCount: processedOrderIds.length, processedOrderIds };
}
