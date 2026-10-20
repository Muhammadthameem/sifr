'use server';

import { prisma } from '@/lib/db/prisma';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { normalizeIndiaMobile } from '@/lib/validation/mobile';
import {
  queryAdminCustomers,
  getAdminCustomerDetails,
  updateCustomerProfile,
  GetCustomersParams,
  UpdateCustomerInput,
} from '@/lib/customer/customer-service';
import { revalidatePath } from 'next/cache';

/**
 * Server action to query admin customers list with search, sorting, and pagination.
 */
export async function getCustomersAction(params?: GetCustomersParams) {
  await requireAdminAuth();
  return queryAdminCustomers(params);
}

/**
 * Server action to fetch full customer details and order history.
 */
export async function getCustomerDetailsAction(id: string) {
  await requireAdminAuth();
  return getAdminCustomerDetails(id);
}

/**
 * Server action to update a customer's profile (name, email, address, city, state, pincode).
 * Phone is strictly read-only.
 */
export async function updateCustomerAction(input: UpdateCustomerInput) {
  try {
    await requireAdminAuth();
    const updated = await updateCustomerProfile(input);
    revalidatePath('/admin/customers');
    revalidatePath(`/admin/customers/${input.customerId}`);
    return { success: true, customer: updated };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update customer' };
  }
}

/**
 * Legacy lookup helper for Direct Sales / POS terminal.
 */
export async function lookupCustomerByMobile(mobile: string) {
  try {
    await requireAdminAuth();
    const normalized = normalizeIndiaMobile(mobile);
    const customer = await prisma.customer.findUnique({
      where: { mobile: normalized },
    });
    return { success: true, customer };
  } catch (error: any) {
    return { success: false, error: error.message || 'Invalid mobile number' };
  }
}

/**
 * Legacy quick-search helper.
 */
export async function searchCustomers(query: string) {
  await requireAdminAuth();

  const trimmed = query.trim();
  if (!trimmed) return [];

  return await prisma.customer.findMany({
    where: {
      OR: [
        { name: { contains: trimmed, mode: 'insensitive' } },
        { mobile: { contains: trimmed, mode: 'insensitive' } },
        { email: { contains: trimmed, mode: 'insensitive' } },
      ],
    },
    take: 10,
    orderBy: { updatedAt: 'desc' },
  });
}
