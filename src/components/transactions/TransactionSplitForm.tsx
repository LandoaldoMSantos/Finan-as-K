import React from 'react';
import { parseAmountToCents, formatCurrency } from '../../lib/utils.ts';
import { Plus, Trash2, CheckCircle2, AlertTriangle, AlertCircle, Divide } from 'lucide-react';

export interface SplitFormItem {
  categoryId: string;
  amountInput: string;
  memo: string;
}

interface TransactionSplitFormProps {
  splits: SplitFormItem[];
  totalCents: number;
  categoryOptions: { id: number; displayName: string; type: string }[];
  transactionType: 'debito' | 'credito';
  onChange: (splits: SplitFormItem[]) => void;
  hasErrors?: boolean;
}

export const TransactionSplitForm: React.FC<TransactionSplitFormProps> = ({
  splits,
  totalCents,
  categoryOptions,
  transactionType,
  onChange,
  hasErrors = false,
}) => {
  const currentCategoryType = transactionType === 'debito' ? 'despesa' : 'receita';
  const filteredCategories = categoryOptions.filter(opt => opt.type === currentCategoryType);

  // Compute total of splits in cents
  const totalSplitCents = splits.reduce((acc, s) => acc + parseAmountToCents(s.amountInput), 0);
  const diffCents = totalCents - totalSplitCents;
  const isBalanced = totalCents > 0 && diffCents === 0;
  const isUnder = diffCents > 0;
  const isOver = diffCents < 0;

  const handleUpdateItem = (index: number, field: keyof SplitFormItem, value: string) => {
    const updated = [...splits];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handleAddSplit = (suggestedAmountCents?: number) => {
    const amountVal = suggestedAmountCents && suggestedAmountCents > 0
      ? (suggestedAmountCents / 100).toFixed(2).replace('.', ',')
      : '';
    onChange([...splits, { categoryId: '', amountInput: amountVal, memo: '' }]);
  };

  const handleRemoveSplit = (index: number) => {
    if (splits.length <= 2) return;
    onChange(splits.filter((_, i) => i !== index));
  };

  // Quick action: divide total equally among all current split lines
  const handleDivideEqually = () => {
    if (splits.length === 0 || totalCents <= 0) return;
    const basePerItem = Math.floor(totalCents / splits.length);
    let remainder = totalCents % splits.length;

    const updated = splits.map((s, idx) => {
      const itemAmount = basePerItem + (idx < remainder ? 1 : 0);
      return {
        ...s,
        amountInput: (itemAmount / 100).toFixed(2).replace('.', ','),
      };
    });
    onChange(updated);
  };

  // Quick action: fill remaining difference in the last split or add one
  const handleFillRemaining = () => {
    if (diffCents <= 0) return;
    if (splits.length === 0) {
      handleAddSplit(diffCents);
      return;
    }
    const lastIdx = splits.length - 1;
    const lastAmount = parseAmountToCents(splits[lastIdx].amountInput);
    const newAmount = lastAmount + diffCents;
    handleUpdateItem(lastIdx, 'amountInput', (newAmount / 100).toFixed(2).replace('.', ','));
  };

  return (
    <div className={`space-y-4 rounded-2xl border p-4 transition-colors ${
      hasErrors 
        ? 'border-rose-300 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-950/15'
        : 'border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/20 dark:bg-emerald-950/10'
    }`}>
      {/* Header & Status Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-150 dark:border-gray-800 pb-3">
        <div>
          <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
            Divisão por Categorias (Splits)
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Distribua o valor total do lançamento entre duas ou mais categorias financeiras.
          </p>
        </div>

        {/* Balance Status Badge */}
        <div className="flex items-center gap-2">
          {isBalanced ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              100% Distribuído ({formatCurrency(totalCents)})
            </span>
          ) : isUnder ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
              Faltam {formatCurrency(diffCents)}
            </span>
          ) : isOver ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300/60 dark:border-rose-700">
              <AlertCircle className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
              Excede em {formatCurrency(Math.abs(diffCents))}
            </span>
          ) : null}
        </div>
      </div>

      {/* Split Rows */}
      <div className="space-y-3">
        {splits.map((s, idx) => (
          <div
            key={idx}
            className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3 rounded-xl shadow-xs relative hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
          >
            {/* Category Select */}
            <div className="sm:col-span-5">
              <label htmlFor={`split-category-${idx}`} className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Categoria #{idx + 1} *
              </label>
              <select
                id={`split-category-${idx}`}
                value={s.categoryId}
                onChange={(e) => handleUpdateItem(idx, 'categoryId', e.target.value)}
                className={`w-full bg-gray-50 dark:bg-gray-800/60 border rounded-xl px-2.5 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                  !s.categoryId && hasErrors
                    ? 'border-rose-400 dark:border-rose-600'
                    : 'border-gray-200 dark:border-gray-750'
                }`}
                required
              >
                <option value="">Selecione a categoria...</option>
                {filteredCategories.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.displayName}</option>
                ))}
              </select>
            </div>

            {/* Amount Input */}
            <div className="sm:col-span-3">
              <label htmlFor={`split-amount-${idx}`} className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Valor (R$) *
              </label>
              <input
                id={`split-amount-${idx}`}
                type="text"
                value={s.amountInput}
                onChange={(e) => handleUpdateItem(idx, 'amountInput', e.target.value)}
                placeholder="0,00"
                className={`w-full bg-gray-50 dark:bg-gray-800/60 border rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                  (!s.amountInput || parseAmountToCents(s.amountInput) <= 0) && hasErrors
                    ? 'border-rose-400 dark:border-rose-600'
                    : 'border-gray-200 dark:border-gray-750'
                }`}
                required
              />
            </div>

            {/* Memo / Description */}
            <div className="sm:col-span-3">
              <label htmlFor={`split-memo-${idx}`} className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Descrição Específica
              </label>
              <input
                id={`split-memo-${idx}`}
                type="text"
                value={s.memo}
                onChange={(e) => handleUpdateItem(idx, 'memo', e.target.value)}
                placeholder="Ex: Refeição, Bebidas..."
                className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-750 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            {/* Delete button (only if > 2 splits) */}
            <div className="sm:col-span-1 flex justify-end items-end pt-1 sm:pt-4">
              {splits.length > 2 ? (
                <button
                  type="button"
                  onClick={() => handleRemoveSplit(idx)}
                  className="p-2 text-rose-700 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-rose-400"
                  title="Remover este split"
                  aria-label={`Remover divisão de categoria ${idx + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : (
                <div className="w-8 h-8" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Split Actions & Helpers */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleAddSplit(diffCents > 0 ? diffCents : undefined)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-900 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold rounded-xl transition-all shadow-2xs cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar Categoria
          </button>

          {splits.length >= 2 && totalCents > 0 && (
            <button
              type="button"
              onClick={handleDivideEqually}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-xl transition-all shadow-2xs cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
              title="Dividir o valor total igualmente entre todas as linhas"
            >
              <Divide className="w-3.5 h-3.5 text-gray-500" />
              Dividir Igualmente
            </button>
          )}

          {isUnder && (
            <button
              type="button"
              onClick={handleFillRemaining}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 text-amber-800 dark:text-amber-300 text-xs font-semibold rounded-xl transition-all shadow-2xs cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              Preencher Restante ({formatCurrency(diffCents)})
            </button>
          )}
        </div>

        {/* Totals Summary */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="text-gray-500 dark:text-gray-400">
            Total Lançamento: <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(totalCents)}</span>
          </div>
          <div className="text-gray-500 dark:text-gray-400">
            Soma dos Splits: <span className={`font-bold ${
              isBalanced ? 'text-emerald-700 dark:text-emerald-400' : isOver ? 'text-rose-700 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400'
            }`}>{formatCurrency(totalSplitCents)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
