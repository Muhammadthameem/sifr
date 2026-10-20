import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import {
  queryExpenses,
  getExpenseSummaryMetrics,
  ExpenseSortOption,
} from '@/lib/expenses/expense-service';
import { ExpensePaymentMethod } from '@prisma/client';
import { ExpensesListManager } from '@/components/admin/expenses/ExpensesListManager';

interface ExpensesPageProps {
  searchParams: {
    search?: string;
    paymentMethod?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    page?: string;
  };
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  await requireAdminAuth();

  const search = searchParams.search || '';
  const paymentMethod = searchParams.paymentMethod as ExpensePaymentMethod | 'ALL' | undefined;
  const startDate = searchParams.startDate || '';
  const endDate = searchParams.endDate || '';
  const sortBy = (searchParams.sortBy as ExpenseSortOption) || 'newest';
  const page = parseInt(searchParams.page || '1', 10) || 1;

  const [paginatedData, summaryMetrics] = await Promise.all([
    queryExpenses({
      search: search || undefined,
      paymentMethod: paymentMethod || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      sortBy,
      page,
      pageSize: 20,
    }),
    getExpenseSummaryMetrics(),
  ]);

  // Serialize Prisma Decimals & Dates for React Client Component
  const serializedExpenses = paginatedData.expenses.map((exp) => ({
    id: exp.id,
    expenseNumber: exp.expenseNumber,
    expenseDate: exp.expenseDate.toISOString(),
    description: exp.description,
    amount: Number(exp.amount),
    paymentMethod: exp.paymentMethod,
    payee: exp.payee,
    referenceNumber: exp.referenceNumber,
    notes: exp.notes,
    createdAt: exp.createdAt.toISOString(),
    updatedAt: exp.updatedAt.toISOString(),
  }));

  return (
    <ExpensesListManager
      expenses={serializedExpenses}
      totalCount={paginatedData.totalCount}
      totalExpensesAmount={paginatedData.totalExpensesAmount}
      page={paginatedData.page}
      pageSize={paginatedData.pageSize}
      totalPages={paginatedData.totalPages}
      summaryMetrics={summaryMetrics}
      filters={{
        search,
        paymentMethod: paymentMethod || 'ALL',
        startDate,
        endDate,
        sortBy,
      }}
    />
  );
}
