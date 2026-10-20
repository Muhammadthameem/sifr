'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import {
  createExpense,
  updateExpense,
  deleteExpense,
  CreateExpenseInput,
  UpdateExpenseInput,
} from '@/lib/expenses/expense-service';
import { ExpensePaymentMethod } from '@prisma/client';
import { z } from 'zod';

const ExpenseSchema = z.object({
  expenseDate: z.string().min(1, 'Expense date is required'),
  description: z.string().trim().min(1, 'Description is required').max(255, 'Description is too long'),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  paymentMethod: z.nativeEnum(ExpensePaymentMethod, {
    message: 'Invalid payment method',
  }),
  payee: z.string().trim().max(100).optional().nullable(),
  referenceNumber: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

const UpdateExpenseSchema = ExpenseSchema.partial();

export async function createExpenseAction(data: CreateExpenseInput) {
  try {
    await requireAdminAuth();

    const validated = ExpenseSchema.parse({
      ...data,
      amount: Number(data.amount),
    });

    const expense = await createExpense({
      expenseDate: new Date(validated.expenseDate),
      description: validated.description,
      amount: validated.amount,
      paymentMethod: validated.paymentMethod,
      payee: validated.payee || null,
      referenceNumber: validated.referenceNumber || null,
      notes: validated.notes || null,
    });

    revalidatePath('/admin/expenses');
    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/reports');
    revalidatePath('/admin/reports/sales');

    return {
      success: true,
      expense: {
        ...expense,
        amount: Number(expense.amount),
        expenseDate: expense.expenseDate.toISOString(),
        createdAt: expense.createdAt.toISOString(),
        updatedAt: expense.updatedAt.toISOString(),
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to record expense.',
    };
  }
}

export async function updateExpenseAction(id: string, data: UpdateExpenseInput) {
  try {
    await requireAdminAuth();

    if (!id || typeof id !== 'string') {
      return { success: false, error: 'Invalid expense ID' };
    }

    const validated = UpdateExpenseSchema.parse({
      ...data,
      ...(data.amount !== undefined ? { amount: Number(data.amount) } : {}),
    });

    const expense = await updateExpense(id, {
      ...(validated.expenseDate ? { expenseDate: new Date(validated.expenseDate) } : {}),
      ...(validated.description ? { description: validated.description } : {}),
      ...(validated.amount !== undefined ? { amount: validated.amount } : {}),
      ...(validated.paymentMethod ? { paymentMethod: validated.paymentMethod } : {}),
      ...(validated.payee !== undefined ? { payee: validated.payee || null } : {}),
      ...(validated.referenceNumber !== undefined ? { referenceNumber: validated.referenceNumber || null } : {}),
      ...(validated.notes !== undefined ? { notes: validated.notes || null } : {}),
    });

    revalidatePath('/admin/expenses');
    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/reports');
    revalidatePath('/admin/reports/sales');

    return {
      success: true,
      expense: {
        ...expense,
        amount: Number(expense.amount),
        expenseDate: expense.expenseDate.toISOString(),
        createdAt: expense.createdAt.toISOString(),
        updatedAt: expense.updatedAt.toISOString(),
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to update expense.',
    };
  }
}

export async function deleteExpenseAction(id: string) {
  try {
    await requireAdminAuth();

    if (!id || typeof id !== 'string') {
      return { success: false, error: 'Invalid expense ID' };
    }

    const expense = await deleteExpense(id);

    revalidatePath('/admin/expenses');
    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/reports');
    revalidatePath('/admin/reports/sales');

    return {
      success: true,
      deletedId: expense.id,
      expenseNumber: expense.expenseNumber,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to delete expense.',
    };
  }
}
