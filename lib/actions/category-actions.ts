'use server';

import { prisma } from '@/lib/db/prisma';
import { createCategorySchema, updateCategorySchema, CreateCategoryInput, UpdateCategoryInput } from '@/lib/validation/category';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { revalidatePath } from 'next/cache';

export async function getCategories() {
  return prisma.category.findMany({
    include: {
      parent: true,
      children: true,
      _count: {
        select: { products: true },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export interface ActiveCategoryNode {
  id: string;
  name: string;
  slug: string;
  children: {
    id: string;
    name: string;
    slug: string;
    count?: number;
  }[];
  count?: number;
}

export async function getActiveCategories() {
  return prisma.category.findMany({
    where: { isActive: true },
    include: {
      parent: true,
      children: {
        where: { isActive: true },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getActiveCategoryTree(gender?: 'MEN' | 'WOMEN'): Promise<ActiveCategoryNode[]> {
  try {
    const genderCondition = gender ? [gender, 'BOTH'] : undefined;
    const productWhere: any = {
      status: 'ACTIVE',
      ...(genderCondition ? { gender: { in: genderCondition } } : {}),
    };

    const parentCategories = await prisma.category.findMany({
      where: {
        isActive: true,
        parentId: null,
      },
      include: {
        children: {
          where: { isActive: true },
          include: {
            _count: {
              select: {
                products: {
                  where: productWhere,
                },
              },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        _count: {
          select: {
            products: {
              where: productWhere,
            },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const tree: ActiveCategoryNode[] = [];

    for (const parent of parentCategories) {
      let matchingChildren = parent.children.map((child) => ({
        id: child.id,
        name: child.name,
        slug: child.slug,
        count: child._count.products,
      }));

      if (gender) {
        matchingChildren = matchingChildren.filter((c) => (c.count || 0) > 0);
      }

      const childrenCount = matchingChildren.reduce((sum, c) => sum + (c.count || 0), 0);
      const totalCount = parent._count.products + childrenCount;

      if (!gender || totalCount > 0) {
        tree.push({
          id: parent.id,
          name: parent.name,
          slug: parent.slug,
          children: matchingChildren,
          count: totalCount,
        });
      }
    }

    return tree;
  } catch (error) {
    console.error('Failed to get active category tree:', error);
    return [];
  }
}

export async function getSelectableCategories() {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    include: {
      parent: true,
      children: {
        where: { isActive: true },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  // Filter ONLY leaf categories (children.length === 0)
  const selectable = categories.filter((c) => c.children.length === 0);

  return selectable.map((c) => {
    const parentName = c.parent?.name;
    const label = parentName ? `${parentName} › ${c.name}` : c.name;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      parentId: c.parentId,
      parentName,
      label,
    };
  });
}

export async function createCategory(input: CreateCategoryInput) {
  await requireAdminAuth();

  const validated = createCategorySchema.parse(input);

  // Check unique slug
  const existingSlug = await prisma.category.findUnique({
    where: { slug: validated.slug },
  });
  if (existingSlug) {
    throw new Error(`Category slug '${validated.slug}' is already in use.`);
  }

  // If parentId provided, verify parent exists
  if (validated.parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: validated.parentId },
    });
    if (!parent) {
      throw new Error('Selected parent category does not exist.');
    }
  }

  const category = await prisma.category.create({
    data: {
      name: validated.name,
      slug: validated.slug,
      description: validated.description,
      parentId: validated.parentId || null,
      sortOrder: validated.sortOrder,
      isActive: validated.isActive,
    },
    include: {
      parent: true,
      children: true,
      _count: {
        select: { products: true },
      },
    },
  });

  revalidatePath('/admin/categories');
  revalidatePath('/admin/products');
  return category;
}

export async function updateCategory(input: UpdateCategoryInput) {
  await requireAdminAuth();

  const validated = updateCategorySchema.parse(input);

  // Check category exists
  const existing = await prisma.category.findUnique({
    where: { id: validated.id },
  });
  if (!existing) {
    throw new Error('Category not found.');
  }

  // Check unique slug if changed
  if (validated.slug && validated.slug !== existing.slug) {
    const slugConflict = await prisma.category.findUnique({
      where: { slug: validated.slug },
    });
    if (slugConflict) {
      throw new Error(`Category slug '${validated.slug}' is already taken.`);
    }
  }

  // Prevent self-parenting and circular hierarchy
  if (validated.parentId) {
    if (validated.parentId === validated.id) {
      throw new Error('A category cannot be its own parent.');
    }

    // Check circular relationship (whether selected parent is a child/descendant of this category)
    let currentParentId: string | null = validated.parentId;
    while (currentParentId) {
      if (currentParentId === validated.id) {
        throw new Error('Circular category hierarchy detected. A category cannot select its descendant as a parent.');
      }
      const p: { parentId: string | null } | null = await prisma.category.findUnique({
        where: { id: currentParentId },
        select: { parentId: true },
      });
      currentParentId = p?.parentId || null;
    }
  }

  const category = await prisma.category.update({
    where: { id: validated.id },
    data: {
      name: validated.name,
      slug: validated.slug,
      description: validated.description,
      parentId: validated.parentId === undefined ? undefined : (validated.parentId || null),
      sortOrder: validated.sortOrder,
      isActive: validated.isActive,
    },
    include: {
      parent: true,
      children: true,
      _count: {
        select: { products: true },
      },
    },
  });

  revalidatePath('/admin/categories');
  revalidatePath('/admin/products');
  return category;
}

export async function toggleCategoryActive(id: string) {
  await requireAdminAuth();

  const existing = await prisma.category.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new Error('Category not found.');
  }

  const updated = await prisma.category.update({
    where: { id },
    data: { isActive: !existing.isActive },
    include: {
      parent: true,
      children: true,
      _count: {
        select: { products: true },
      },
    },
  });

  revalidatePath('/admin/categories');
  revalidatePath('/admin/products');
  return updated;
}

export async function deleteCategory(id: string) {
  await requireAdminAuth();

  const category = await prisma.category.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          products: true,
          children: true,
        },
      },
    },
  });

  if (!category) {
    throw new Error('Category not found.');
  }

  const hasProducts = category._count.products > 0;
  const hasChildren = category._count.children > 0;

  if (hasProducts && hasChildren) {
    throw new Error('Cannot delete this category because it contains products and subcategories.');
  }

  if (hasProducts) {
    throw new Error('Cannot delete this category because it contains products. Reassign the products before deleting the category.');
  }

  if (hasChildren) {
    throw new Error('Cannot delete this category because it contains subcategories. Remove or move the subcategories before deleting the category.');
  }

  await prisma.category.delete({
    where: { id },
  });

  revalidatePath('/admin/categories');
  revalidatePath('/admin/products');
  return { success: true, id };
}
