import { Prisma, SalesChannel } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export async function generateOrderNumber(
  salesChannel: 'ONLINE' | 'DIRECT' | 'WHATSAPP' | SalesChannel,
  tx?: Prisma.TransactionClient
): Promise<string> {
  const client = tx || prisma;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  let code = 'ORDER_ONLINE';
  let prefix = 'ORD';

  if (salesChannel === 'DIRECT') {
    code = 'ORDER_DIRECT';
    prefix = 'DS';
  } else if (salesChannel === 'WHATSAPP') {
    code = 'ORDER_WHATSAPP';
    prefix = 'WA';
  }

  const sequence = await client.documentSequence.upsert({
    where: { code },
    create: {
      code,
      nextValue: 1002, // First sequence used will be 1001
    },
    update: {
      nextValue: { increment: 1 },
    },
  });

  const seqNum = sequence.nextValue - 1;
  const seqPadded = String(seqNum).padStart(4, '0');

  return `${prefix}-${dateStr}-${seqPadded}`;
}
