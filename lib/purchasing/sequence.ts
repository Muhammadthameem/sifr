import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/**
 * Concurrency-safe server-side purchase number generator.
 * Format: PO-YYYYMMDD-XXXX (e.g. PO-20260921-1001)
 */
export async function generatePurchaseNumber(tx?: Prisma.TransactionClient): Promise<string> {
  const client = tx || prisma;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  // Upsert and increment sequence counter atomically
  const sequence = await client.documentSequence.upsert({
    where: { code: 'PURCHASE' },
    create: {
      code: 'PURCHASE',
      nextValue: 1002, // First created sequence returns 1001
    },
    update: {
      nextValue: { increment: 1 },
    },
  });

  // If created, nextValue was set to 1002, so actual used number is 1001. If updated, used number is previous nextValue.
  const seqNum = sequence.nextValue - 1;
  const seqPadded = String(seqNum).padStart(4, '0');

  return `PO-${dateStr}-${seqPadded}`;
}
