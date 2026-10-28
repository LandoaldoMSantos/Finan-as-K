import React, { useEffect } from 'react';
import { Account, Category, Tag, Payee, Transaction } from '../../types.ts';
import { TransactionForm } from './TransactionForm.tsx';
import { ArrowLeftRight, X } from 'lucide-react';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
  editingTransaction: Transaction | null;
  isDuplicating: boolean;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  payees: Payee[];
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingTransaction,
  isDuplicating,
  accounts,
  categories,
  tags,
  payees,
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSaveAndClose = async (payload: any) => {
    await onSave(payload);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-modal-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in"
    >
      <div className="relative bg-white dark:bg-gray-900 p-5 sm:p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto my-auto space-y-4">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-gray-150 dark:border-gray-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
              <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
            </div>
            <h3 id="tx-modal-title" className="font-bold text-gray-900 dark:text-white text-base">
              {isDuplicating
                ? 'Duplicar Lançamento Financeiro'
                : editingTransaction !== null
                  ? 'Editar Lançamento Financeiro'
                  : 'Novo Lançamento Financeiro'}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label="Fechar janela de lançamento"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Transaction Form Content */}
        <TransactionForm
          editingTransaction={editingTransaction}
          isDuplicating={isDuplicating}
          accounts={accounts}
          categories={categories}
          tags={tags}
          payees={payees}
          onSave={handleSaveAndClose}
          onCancel={onClose}
        />
      </div>
    </div>
  );
};
