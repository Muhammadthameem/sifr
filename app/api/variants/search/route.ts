import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.trim();

  if (!query) {
    return NextResponse.json([]);
  }

  const variants = await prisma.productVariant.findMany({
    where: {
      isAvailable: true,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
        { product: { name: { contains: query, mode: 'insensitive' } } },
      ],
    },
    include: {
      product: true,
      inventoryItem: true,
    },
    take: 20,
  });

  return NextResponse.json(variants);
}
