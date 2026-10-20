import { prisma } from '@/lib/db/prisma';
import { Prisma, Expense, ExpensePaymentMethod } from '@prisma/client';

export interface CreateExpenseInput {
  expenseDate: Date | string;
  description: string;
  amount: number | string | Prisma.Decimal;
  paymentMethod: ExpensePaymentMethod;
  payee?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
}

export interface UpdateExpenseInput {
  expenseDate?: Date | string;
  description?: string;
  amount?: number | string | Prisma.Decimal;
  paymentMethod?: ExpensePaymentMethod;
  payee?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
}

export type ExpenseSortOption = 'newest' | 'oldest' | 'highest_amount' | 'lowest_amount';

export interface QueryExpensesParams {
  search?: string;
  paymentMethod?: ExpensePaymentMethod | 'ALL';
  startDate?: Date | string;
  endDate?: Date | string;
  sortBy?: ExpenseSortOption;
  page?: number;
  pageSize?: number;
}

export interface PaginatedExpenses {
  expenses: Expense[];
  totalCount: number;
  totalExpensesAmount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ExpenseSummaryMetrics {
  totalExpenses: number;
  thisMonthExpenses: number;
  thisYearExpenses: number;
}

/**
 * Generates an authoritative sequential expense number (e.g. EXP-20261015-1001).
 * Uses DocumentSequence with row-level transaction safety.
 */
export async function generateExpenseNumber(tx?: Prisma.TransactionClient): Promise<string> {
  const client = tx || prisma;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const sequence = await client.documentSequence.upsert({
    where: { code: 'EXPENSE' },
    create: {
      code: 'EXPENSE',
      nextValue: 1002,
    },
    update: {
      nextValue: { increment: 1 },
    },
  });

  const seqNum = sequence.nextValue - 1;
  const seqPadded = String(seqNum).padStart(4, '0');

  return `EXP-${dateStr}-${seqPadded}`;
}

/**
 * Atomically creates a new already-paid business expense.
 */
export async function createExpense(data: CreateExpenseInput): Promise<Expense> {
  const expenseDate = new Date(data.expenseDate);
  if (isNaN(expenseDate.getTime())) {
    throw new Error('VALIDATION_ERROR: Invalid expense date provided.');
  }

  const trimmedDesc = data.description?.trim();
  if (!trimmedDesc) {
    throw new Error('VALIDATION_ERROR: Description is required.');
  }

  const numAmount = Number(data.amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('VALIDATION_ERROR: Expense amount must be a positive number greater than zero.');
  }

  const validMethods = Object.values(ExpensePaymentMethod);
  if (!validMethods.includes(data.paymentMethod)) {
    throw new Error(`VALIDATION_ERROR: Invalid payment method: ${data.paymentMethod}`);
  }

  return prisma.$transaction(async (tx) => {
    const expenseNumber = await generateExpenseNumber(tx);

    const expense = await tx.expense.create({
      data: {
        expenseNumber,
        expenseDate,
        description: trimmedDesc,
        amount: new Prisma.Decimal(numAmount.toFixed(2)),
        paymentMethod: data.paymentMethod,
        payee: data.payee?.trim() || null,
        referenceNumber: data.referenceNumber?.trim() || null,
        notes: data.notes?.trim() || null,
      },
    });

    return expense;
  });
}

/**
 * Updates an existing expense and ensures the updated value is immediately active.
 */
export async function updateExpense(id: string, data: UpdateExpenseInput): Promise<Expense> {
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`NOT_FOUND: Expense with ID "${id}" not found.`);
  }

  const updatePayload: Prisma.ExpenseUpdateInput = {};

  if (data.expenseDate !== undefined) {
    const d = new Date(data.expenseDate);
    if (isNaN(d.getTime())) {
      throw new Error('VALIDATION_ERROR: Invalid expense date provided.');
    }
    updatePayload.expenseDate = d;
  }

  if (data.description !== undefined) {
    const trimmed = data.description.trim();
    if (!trimmed) {
      throw new Error('VALIDATION_ERROR: Description cannot be empty.');
    }
    updatePayload.description = trimmed;
  }

  if (data.amount !== undefined) {
    const num = Number(data.amount);
    if (isNaN(num) || num <= 0) {
      throw new Error('VALIDATION_ERROR: Expense amount must be a positive number greater than zero.');
    }
    updatePayload.amount = new Prisma.Decimal(num.toFixed(2));
  }

  if (data.paymentMethod !== undefined) {
    const validMethods = Object.values(ExpensePaymentMethod);
    if (!validMethods.includes(data.paymentMethod)) {
      throw new Error(`VALIDATION_ERROR: Invalid payment method: ${data.paymentMethod}`);
    }
    updatePayload.paymentMethod = data.paymentMethod;
  }

  if (data.payee !== undefined) {
    updatePayload.payee = data.payee?.trim() || null;
  }

  if (data.referenceNumber !== undefined) {
    updatePayload.referenceNumber = data.referenceNumber?.trim() || null;
  }

  if (data.notes !== undefined) {
    updatePayload.notes = data.notes?.trim() || null;
  }

  return prisma.expense.update({
    where: { id },
    data: updatePayload,
  });
}

/**
 * Permanently removes an expense from active expense calculations.
 */
export async function deleteExpense(id: string): Promise<Expense> {
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`NOT_FOUND: Expense with ID "${id}" not found.`);
  }

  return prisma.expense.delete({
    where: { id },
  });
}

/**
 * Retrieves a single expense record by its ID.
 */
export async function getExpenseById(id: string): Promise<Expense | null> {
  return prisma.expense.findUnique({
    where: { id },
  });
}

/**
 * Server-side paginated, filterable, and searchable query for expenses.
 */
export async function queryExpenses(params: QueryExpensesParams = {}): Promise<PaginatedExpenses> {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.ExpenseWhereInput = {};

  // Search filter across expenseNumber, description, payee, referenceNumber
  if (params.search && params.search.trim()) {
    const term = params.search.trim();
    where.OR = [
      { expenseNumber: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      { payee: { contains: term, mode: 'insensitive' } },
      { referenceNumber: { contains: term, mode: 'insensitive' } },
    ];
  }

  // Payment method filter
  if (params.paymentMethod && params.paymentMethod !== 'ALL') {
    where.paymentMethod = params.paymentMethod;
  }

  // Date range filter on expenseDate
  if (params.startDate || params.endDate) {
    where.expenseDate = {};
    if (params.startDate) {
      const start = new Date(params.startDate);
      if (!isNaN(start.getTime())) {
        where.expenseDate.gte = start;
      }
    }
    if (params.endDate) {
      const end = new Date(params.endDate);
      if (!isNaN(end.getTime())) {
        where.expenseDate.lte = end;
      }
    }
  }

  // Sorting
  let orderBy: Prisma.ExpenseOrderByWithRelationInput = { expenseDate: 'desc' };
  switch (params.sortBy) {
    case 'oldest':
      orderBy = { expenseDate: 'asc' };
      break;
    case 'highest_amount':
      orderBy = { amount: 'desc' };
      break;
    case 'lowest_amount':
      orderBy = { amount: 'asc' };
      break;
    case 'newest':
    default:
      orderBy = { expenseDate: 'desc' };
      break;
  }

  const [expenses, totalCount, aggregate] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: [orderBy, { createdAt: 'desc' }],
      skip,
      take: pageSize,
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({
      where,
      _sum: {
        amount: true,
      },
    }),
  ]);

  const totalExpensesAmount = Number(aggregate._sum.amount ?? 0);
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return {
    expenses,
    totalCount,
    totalExpensesAmount,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Returns summary metrics: Total Expenses, This Month, and This Year.
 */
export async function getExpenseSummaryMetrics(): Promise<ExpenseSummaryMetrics> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const [totalAgg, monthAgg, yearAgg] = await Promise.all([
    prisma.expense.aggregate({
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: {
        expenseDate: { gte: startOfMonth },
      },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: {
        expenseDate: { gte: startOfYear },
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    totalExpenses: Number(totalAgg._sum.amount ?? 0),
    thisMonthExpenses: Number(monthAgg._sum.amount ?? 0),
    thisYearExpenses: Number(yearAgg._sum.amount ?? 0),
  };
}

/**
 * Returns total expenses for a specific date range (used by reporting and financial calculations).
 */
export async function getTotalExpenses(dateRange?: { startDate?: Date; endDate?: Date }): Promise<number> {
  const where: Prisma.ExpenseWhereInput = {};
  if (dateRange?.startDate || dateRange?.endDate) {
    where.expenseDate = {};
    if (dateRange.startDate) where.expenseDate.gte = dateRange.startDate;
    if (dateRange.endDate) where.expenseDate.lt = dateRange.endDate;
  }

  const agg = await prisma.expense.aggregate({
    where,
    _sum: { amount: true },
  });

  return Number(agg._sum.amount ?? 0);
}
