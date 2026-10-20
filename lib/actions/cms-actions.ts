'use server';

import { requireAdminAuth } from '@/lib/auth/admin-auth';
import {
  getAdminSections,
  getAdminSectionById,
  getPublishedSections,
  upsertCmsSection,
  publishCmsSection,
  reorderCmsSections,
  toggleCmsSectionActive,
  deleteCmsSection,
} from '@/lib/cms/cms-service';
import { UpsertCmsSectionInput } from '@/lib/validation/cms';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';

export async function getAdminSectionsAction() {
  try {
    await requireAdminAuth();
    const sections = await getAdminSections();
    return { success: true, sections };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch admin sections' };
  }
}

export async function getAdminSectionByIdAction(sectionId: string) {
  try {
    await requireAdminAuth();
    const section = await getAdminSectionById(sectionId);
    if (!section) {
      return { success: false, error: 'Section not found' };
    }
    return { success: true, section };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch section' };
  }
}

export async function upsertCmsSectionAction(input: UpsertCmsSectionInput) {
  try {
    await requireAdminAuth();
    const section = await upsertCmsSection(input);
    revalidatePath('/admin/website');
    revalidatePath('/');
    return { success: true, section };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to save section draft' };
  }
}

export async function publishCmsSectionAction(sectionId: string) {
  try {
    await requireAdminAuth();
    const section = await publishCmsSection(sectionId);
    revalidatePath('/admin/website');
    revalidatePath('/');
    return { success: true, section };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to publish section' };
  }
}

export async function reorderCmsSectionsAction(orderedIds: string[]) {
  try {
    await requireAdminAuth();
    await reorderCmsSections(orderedIds);
    revalidatePath('/admin/website');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to reorder sections' };
  }
}

export async function toggleCmsSectionActiveAction(sectionId: string, isActive: boolean) {
  try {
    await requireAdminAuth();
    const section = await toggleCmsSectionActive(sectionId, isActive);
    revalidatePath('/admin/website');
    revalidatePath('/');
    return { success: true, section };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update section active state' };
  }
}

export async function deleteCmsSectionAction(sectionId: string) {
  try {
    await requireAdminAuth();
    await deleteCmsSection(sectionId);
    revalidatePath('/admin/website');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete section' };
  }
}

export async function getPublishedSectionsAction() {
  try {
    const sections = await getPublishedSections();
    return { success: true, sections };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch published sections' };
  }
}

export async function searchProductsForCmsAction(query: string) {
  try {
    await requireAdminAuth();
    const cleanQuery = query.trim();
    const products = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { name: { contains: cleanQuery, mode: 'insensitive' } },
          { slug: { contains: cleanQuery, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        category: { select: { id: true, name: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
      },
      take: 20,
    });
    return { success: true, products };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to search products for CMS' };
  }
}
