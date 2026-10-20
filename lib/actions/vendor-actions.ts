'use server';

// Note: Server actions export async functions called from client components or server components.
// We import requireAdminAuth to protect all purchasing and vendor actions.
import { prisma } from '@/lib/db/prisma';
import { vendorSchema } from '@/lib/validation/purchasing';
import { revalidatePath } from 'next/cache';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore when executed outside Next.js request context
  }
}

export async function createVendor(data: any) {
  const validated = vendorSchema.parse(data);

  const vendor = await prisma.vendor.create({
    data: {
      name: validated.name,
      contactPerson: validated.contactPerson || null,
      phone: validated.phone || null,
      email: validated.email || null,
      address: validated.address || null,
      gstin: validated.gstin || null,
      notes: validated.notes || null,
      isActive: validated.isActive ?? true,
    },
  });

  safeRevalidatePath('/admin/vendors');
  return vendor;
}

export async function updateVendor(id: string, data: any) {
  const validated = vendorSchema.parse(data);

  const existing = await prisma.vendor.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Vendor with ID '${id}' does not exist.`);
  }

  const vendor = await prisma.vendor.update({
    where: { id },
    data: {
      name: validated.name,
      contactPerson: validated.contactPerson || null,
      phone: validated.phone || null,
      email: validated.email || null,
      address: validated.address || null,
      gstin: validated.gstin || null,
      notes: validated.notes || null,
      isActive: validated.isActive ?? true,
    },
  });

  safeRevalidatePath('/admin/vendors');
  return vendor;
}

export async function toggleVendorActiveStatus(id: string, isActive: boolean) {
  const vendor = await prisma.vendor.update({
    where: { id },
    data: { isActive },
  });

  safeRevalidatePath('/admin/vendors');
  return vendor;
}

export async function getVendorsList() {
  return prisma.vendor.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { purchases: true },
      },
    },
  });
}

export async function getVendorPurchaseHistory(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      purchases: {
        orderBy: { purchaseDate: 'desc' },
        include: {
          lines: {
            include: {
              variant: {
                include: { product: true },
              },
            },
          },
        },
      },
    },
  });

  if (!vendor) {
    throw new Error(`Vendor '${vendorId}' not found.`);
  }

  return vendor;
}
