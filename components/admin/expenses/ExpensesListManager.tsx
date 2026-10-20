'use client';

import React, { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ExpensePaymentMethod } from '@prisma/client';
import { AddExpenseModal } from './AddExpenseModal';
import { EditExpenseModal, SerializedExpense } from './EditExpenseModal';
import { DeleteExpenseModal } from './DeleteExpenseModal';
import {
  Wallet,
  Plus,
  Search,
  Filter,
  Calendar,
  CreditCard,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Clock,
  ArrowUpDown,
} from 'lucide-react';

interface ExpensesListManagerProps {
  expenses: SerializedExpense[];
  totalCount: number;
  totalExpensesAmount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summaryMetrics: {
    totalExpenses: number;
    thisMonthExpenses: number;
    thisYearExpenses: number;
  };
  filters: {
    search?: string;
    paymentMethod?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
  };
}

export function ExpensesListManager({
  expenses,
  totalCount,
  totalExpensesAmount,
  page,
  pageSize,
  totalPages,
  summaryMetrics,
  filters,
}: ExpensesListManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<SerializedExpense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<SerializedExpense | null>(null);

  // Local filter states
  const [search, setSearch] = useState(filters.search || '');
  const [paymentMethod, setPaymentMethod] = useState(filters.paymentMethod || 'ALL');
  const [startDate, setStartDate] = useState(filters.startDate || '');
  const [endDate, setEndDate] = useState(filters.endDate || '');
  const [sortBy, setSortBy] = useState(filters.sortBy || 'newest');

  const applyFilters = (newParams: Record<string, string | undefined>) => {
    const current = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v && v !== 'ALL') {
        current.set(k, v);
      } else {
        current.delete(k);
      }
    });
    // Reset to page 1 on filter change
    current.set('page', '1');
    router.push(`${pathname}?${current.toString()}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters({ search: search.trim() || undefined });
  };

  const handleResetFilters = () => {
    setSearch('');
    setPaymentMethod('ALL');
    setStartDate('');
    setEndDate('');
    setSortBy('newest');
    router.push(pathname);
  };

  const handlePageChange = (newPage: number) => {
    const current = new URLSearchParams(searchParams.toString());
    current.set('page', String(newPage));
    router.push(`${pathname}?${current.toString()}`);
  };

  const formatCurrency = (amount: number) =>
    `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getMethodBadgeClass = (method: ExpensePaymentMethod) => {
    switch (method) {
      case 'UPI':
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-800';
      case 'CASH':
        return 'bg-amber-950/80 text-amber-400 border-amber-800';
      case 'BANK_TRANSFER':
        return 'bg-blue-950/80 text-blue-400 border-blue-800';
      case 'CARD':
        return 'bg-purple-950/80 text-purple-400 border-purple-800';
      default:
        return 'bg-neutral-800 text-neutral-300 border-neutral-700';
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-3">
            <Wallet className="w-6 h-6 text-neutral-400" />
            <span>Expenses</span>
          </h1>
          <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
            Track business expenses and their impact on profit.
          </p>
        </div>

        <div>
          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono uppercase tracking-wider font-semibold shadow-sm transition-all"
            id="admin-add-expense-btn"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Expense</span>
          </button>
        </div>
      </div>

      {/* 2. Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Total Expenses */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-mono uppercase tracking-wider">Total Expenses</span>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-mono font-bold text-white">
            {formatCurrency(summaryMetrics.totalExpenses)}
          </div>
          <div className="text-[11px] text-neutral-500 font-sans">Lifetime operating expenditure</div>
        </div>

        {/* This Month */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-mono uppercase tracking-wider">This Month</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-mono font-bold text-white">
            {formatCurrency(summaryMetrics.thisMonthExpenses)}
          </div>
          <div className="text-[11px] text-neutral-500 font-sans">Current calendar month</div>
        </div>

        {/* This Year */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-mono uppercase tracking-wider">This Year</span>
            <TrendingDown className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-mono font-bold text-white">
            {formatCurrency(summaryMetrics.thisYearExpenses)}
          </div>
          <div className="text-[11px] text-neutral-500 font-sans">Current calendar year</div>
        </div>
      </div>

      {/* 3. Search and Filter Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="md:col-span-4 relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Expense #, Description, Payee..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 font-mono transition-colors"
            />
          </form>

          {/* Payment Method Filter */}
          <div className="md:col-span-3">
            <select
              value={paymentMethod}
              onChange={(e) => {
                setPaymentMethod(e.target.value);
                applyFilters({ paymentMethod: e.target.value });
              }}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-neutral-600 transition-colors"
            >
              <option value="ALL">Payment: All Methods</option>
              <option value="UPI">UPI</option>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CARD">Card</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          {/* Sort By Filter */}
          <div className="md:col-span-3">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                applyFilters({ sortBy: e.target.value });
              }}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-neutral-600 transition-colors"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="oldest">Sort: Oldest First</option>
              <option value="highest_amount">Sort: Highest Amount</option>
              <option value="lowest_amount">Sort: Lowest Amount</option>
            </select>
          </div>

          {/* Search Action / Reset Button */}
          <div className="md:col-span-2 flex items-center space-x-2">
            <button
              onClick={handleSearchSubmit}
              type="button"
              className="flex-1 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-mono transition-colors"
            >
              Search
            </button>
            {(filters.search || filters.paymentMethod || filters.startDate || filters.endDate || filters.sortBy) && (
              <button
                onClick={handleResetFilters}
                type="button"
                className="px-3 py-2 bg-neutral-950 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg text-xs font-mono border border-neutral-800 transition-colors"
                title="Reset Filters"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Date Range Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-neutral-800/60 text-xs font-mono">
          <span className="text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-neutral-400" />
            <span>Date Range:</span>
          </span>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                applyFilters({ startDate: e.target.value || undefined });
              }}
              className="px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-neutral-600"
            />
            <span className="text-neutral-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                applyFilters({ endDate: e.target.value || undefined });
              }}
              className="px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-neutral-600"
            />
          </div>
        </div>
      </div>

      {/* 4. Expense Table / Ledger */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-semibold text-white font-mono uppercase tracking-wider">Expense Ledger</h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
              {totalCount} {totalCount === 1 ? 'record' : 'records'}
            </span>
          </div>
          {totalCount > 0 && (
            <div className="text-xs font-mono text-neutral-400">
              Filtered Total:{' '}
              <span className="text-amber-400 font-semibold">{formatCurrency(totalExpensesAmount)}</span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-neutral-950/70 border-b border-neutral-800 text-neutral-400 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5 font-medium">Expense #</th>
                <th className="px-6 py-3.5 font-medium">Date</th>
                <th className="px-6 py-3.5 font-medium">Description</th>
                <th className="px-6 py-3.5 font-medium">Amount</th>
                <th className="px-6 py-3.5 font-medium">Method</th>
                <th className="px-6 py-3.5 font-medium">Payee</th>
                <th className="px-6 py-3.5 font-medium">Reference</th>
                <th className="px-6 py-3.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-neutral-500 font-sans">
                    <Wallet className="w-8 h-8 mx-auto mb-2 text-neutral-600" />
                    <p className="font-medium text-neutral-400">No expenses recorded yet.</p>
                    <p className="text-xs text-neutral-600 mt-1">
                      Click &quot;+ Add Expense&quot; above to record your first business expenditure.
                    </p>
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => (
                  <tr
                    key={expense.id}
                    className="hover:bg-neutral-800/40 transition-colors cursor-pointer group"
                    onClick={() => setEditingExpense(expense)}
                  >
                    <td className="px-6 py-4 font-semibold text-white group-hover:text-cyan-400 transition-colors">
                      {expense.expenseNumber}
                    </td>
                    <td className="px-6 py-4 text-neutral-400">
                      {new Date(expense.expenseDate).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-6 py-4 text-white font-sans font-medium max-w-xs truncate">
                      {expense.description}
                    </td>
                    <td className="px-6 py-4 font-bold text-amber-300">
                      {formatCurrency(expense.amount)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] rounded border uppercase font-medium ${getMethodBadgeClass(
                          expense.paymentMethod
                        )}`}
                      >
                        {expense.paymentMethod}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-neutral-400 font-sans truncate max-w-[120px]">
                      {expense.payee || '—'}
                    </td>
                    <td className="px-6 py-4 text-neutral-400 truncate max-w-[120px]">
                      {expense.referenceNumber || '—'}
                    </td>
                    <td
                      className="px-6 py-4 text-right space-x-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => setEditingExpense(expense)}
                        className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
                        title="View / Edit Expense"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingExpense(expense)}
                        className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-rose-950/50 rounded transition-colors"
                        title="Delete Expense"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between text-xs font-mono">
            <span className="text-neutral-500">
              Page {page} of {totalPages} ({totalCount} total)
            </span>
            <div className="flex items-center space-x-2">
              <button
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
                className="px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-300 hover:text-white disabled:opacity-40 disabled:hover:text-neutral-300 flex items-center space-x-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => handlePageChange(page + 1)}
                className="px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-300 hover:text-white disabled:opacity-40 disabled:hover:text-neutral-300 flex items-center space-x-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      <AddExpenseModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={() => router.refresh()}
      />

      {/* Edit/View Expense Modal */}
      <EditExpenseModal
        isOpen={Boolean(editingExpense)}
        expense={editingExpense}
        onClose={() => setEditingExpense(null)}
        onSuccess={() => router.refresh()}
      />

      {/* Delete Expense Modal */}
      <DeleteExpenseModal
        isOpen={Boolean(deletingExpense)}
        expense={deletingExpense}
        onClose={() => setDeletingExpense(null)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
