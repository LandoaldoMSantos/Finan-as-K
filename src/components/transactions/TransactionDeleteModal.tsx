import React, { useEffect } from 'react';
import { Transaction } from '../../types.ts';
import { formatCurrency, formatDate } from '../../lib/utils.ts';
import { Trash2, AlertTriangle, X, Calendar, Wallet } from 'lucide-react';

interface TransactionDeleteModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting?: boolean;
}

export const TransactionDeleteModal: React.FC<TransactionDeleteModalProps> = ({
  isOpen,
  transaction,
  onClose,
  onConfirm,
  isDeleting = false,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen || !transaction) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-tx-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
    >
      <div className="relative bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-md w-full space-y-5 animate-scale-in">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
              <Trash2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 id="delete-tx-title" className="text-base font-bold text-gray-900 dark:text-white">
                Excluir Lançamento
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Tem certeza que deseja excluir esta transação?
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 rounded-lg transition-colors cursor-pointer"
            aria-label="Fechar janela"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Transaction Card details */}
        <div className="p-4 bg-gray-50 dark:bg-gray-950/40 rounded-2xl border border-gray-200 dark:border-gray-800 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                Beneficiário / Origem
              </span>
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                {transaction.payee}
              </h4>
            </div>

            <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-mono font-bold text-xs shrink-0 ${
              transaction.type === 'credito'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60'
            }`}>
              {transaction.type === 'credito' ? '+' : '-'}{formatCurrency(transaction.amount)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-200/60 dark:border-gray-800/60">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span>{formatDate(transaction.isRecurring ? (transaction.nextDueDate || transaction.date) : transaction.date)}</span>
            </div>

            {transaction.account && (
              <div className="flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5 text-gray-400" />
                <span>{transaction.account.name}</span>
              </div>
            )}

            {transaction.category && (
              <span className="bg-gray-200/60 dark:bg-gray-800 px-2 py-0.5 rounded text-[10px] font-medium text-gray-700 dark:text-gray-300">
                {transaction.category.name}
              </span>
            )}
          </div>
        </div>

        {/* Warning text */}
        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Esta operação atualizará o saldo da conta e não poderá ser desfeita.</span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors shadow-sm shadow-rose-600/20 flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isDeleting ? 'Excluindo...' : 'Excluir Definitivamente'}
          </button>
        </div>
      </div>
    </div>
  );
};
