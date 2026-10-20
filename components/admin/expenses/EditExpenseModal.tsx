'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ExpensePaymentMethod } from '@prisma/client';
import { updateExpenseAction } from '@/lib/actions/expense-actions';
import { X, Edit3, AlertCircle, Loader2 } from 'lucide-react';

export interface SerializedExpense {
  id: string;
  expenseNumber: string;
  expenseDate: string;
  description: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  payee: string | null;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EditExpenseModalProps {
  isOpen: boolean;
  expense: SerializedExpense | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditExpenseModal({ isOpen, expense, onClose, onSuccess }: EditExpenseModalProps) {
  const router = useRouter();

  const [expenseDate, setExpenseDate] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>('UPI');
  const [payee, setPayee] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (expense) {
      setExpenseDate(new Date(expense.expenseDate).toISOString().split('T')[0]);
      setDescription(expense.description);
      setAmount(String(expense.amount));
      setPaymentMethod(expense.paymentMethod);
      setPayee(expense.payee || '');
      setReferenceNumber(expense.referenceNumber || '');
      setNotes(expense.notes || '');
      setError(null);
    }
  }, [expense]);

  if (!isOpen || !expense) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);

    if (!expenseDate) {
      setError('Expense date is required.');
      return;
    }

    if (!description.trim()) {
      setError('Description is required.');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Amount must be a valid positive number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await updateExpenseAction(expense.id, {
        expenseDate,
        description: description.trim(),
        amount: numAmount,
        paymentMethod,
        payee: payee.trim() || null,
        referenceNumber: referenceNumber.trim() || null,
        notes: notes.trim() || null,
      });

      if (!res.success) {
        setError(res.error || 'Failed to update expense.');
        setIsSubmitting(false);
        return;
      }

      router.refresh();
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-950/80 border border-blue-800 text-blue-400 flex items-center justify-center">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-semibold text-white">Expense Details</h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300">
                  {expense.expenseNumber}
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-mono">View or modify expense information</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {error && (
            <div className="flex items-center space-x-2.5 p-3 rounded-lg bg-rose-950/50 border border-rose-900 text-rose-300 text-xs font-mono">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Metadata badges */}
          <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 text-[11px] font-mono text-neutral-400 flex flex-wrap gap-x-4 gap-y-1">
            <span>Created: {new Date(expense.createdAt).toLocaleDateString('en-IN')}</span>
            <span>Last Updated: {new Date(expense.updatedAt).toLocaleDateString('en-IN')}</span>
          </div>

          {/* Date & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-neutral-300 mb-1.5">
                Expense Date <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-neutral-600 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-neutral-300 mb-1.5">
                Payment Method <span className="text-rose-400">*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as ExpensePaymentMethod)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-neutral-600 transition-colors"
              >
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-neutral-300 mb-1.5">
              Description <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Instagram Ads, Office Rent, Packaging Boxes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-neutral-600 transition-colors"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-neutral-300 mb-1.5">
              Amount (₹) <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-mono text-sm">₹</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-neutral-600 transition-colors"
              />
            </div>
          </div>

          {/* Payee & Reference Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
                Payee <span className="text-neutral-500 text-[10px] lowercase">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Meta, Landlord"
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-neutral-600 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
                Reference Number <span className="text-neutral-500 text-[10px] lowercase">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. INV-9021"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-neutral-600 transition-colors"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
              Notes <span className="text-neutral-500 text-[10px] lowercase">(optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="Additional context or details regarding this expenditure..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-neutral-600 transition-colors resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-mono uppercase tracking-wider text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center space-x-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono uppercase tracking-wider font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
