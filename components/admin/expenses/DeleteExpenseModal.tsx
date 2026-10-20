'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteExpenseAction } from '@/lib/actions/expense-actions';
import { SerializedExpense } from './EditExpenseModal';
import { Trash2, AlertTriangle, X, Loader2 } from 'lucide-react';

interface DeleteExpenseModalProps {
  isOpen: boolean;
  expense: SerializedExpense | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function DeleteExpenseModal({ isOpen, expense, onClose, onSuccess }: DeleteExpenseModalProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !expense) return null;

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(null);

    try {
      const res = await deleteExpenseAction(expense.id);
      if (!res.success) {
        setError(res.error || 'Failed to delete expense.');
        setIsDeleting(false);
        return;
      }

      router.refresh();
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-850 text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Delete Expense?</h3>
              <p className="text-xs text-neutral-400 font-mono">Irreversible operational deletion</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-900 text-rose-300 text-xs font-mono">
            {error}
          </div>
        )}

        {/* Expense Summary Details */}
        <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-neutral-500">Expense:</span>
            <span className="text-white font-semibold">{expense.expenseNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Date:</span>
            <span className="text-white">{new Date(expense.expenseDate).toLocaleDateString('en-IN')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Description:</span>
            <span className="text-white truncate max-w-[200px]">{expense.description}</span>
          </div>
          <div className="flex justify-between border-t border-neutral-850 pt-2">
            <span className="text-neutral-500">Amount:</span>
            <span className="text-rose-400 font-bold text-sm">
              ₹{expense.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <p className="text-xs text-neutral-400 leading-relaxed font-sans">
          This action will permanently remove this expense from active expense calculations and net profit deductions.
        </p>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-mono uppercase tracking-wider text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex items-center space-x-2 px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono uppercase tracking-wider font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Expense</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
