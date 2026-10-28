import React from 'react';
import { formatCurrency } from '../../lib/utils.ts';
import { TrendingUp, TrendingDown, ArrowLeftRight, Wallet } from 'lucide-react';

interface TransactionSummaryCardsProps {
  credit: number;
  debit: number;
  sum: number;
  todayBalance: number;
  filterAccount?: string;
}

export const TransactionSummaryCards: React.FC<TransactionSummaryCardsProps> = React.memo(({
  credit,
  debit,
  sum,
  todayBalance,
  filterAccount,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs animate-fade-in">
      {/* Total Crédito */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 shadow-sm flex items-center justify-between">
        <div className="space-y-1">
          <span className="block text-xs font-sans font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Total de Receitas (Crédito)
          </span>
          <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
            {formatCurrency(credit)}
          </span>
        </div>
        <div className="p-3 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 rounded-2xl">
          <TrendingUp className="w-5 h-5" aria-hidden="true" />
        </div>
      </div>

      {/* Total Débito */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 shadow-sm flex items-center justify-between">
        <div className="space-y-1">
          <span className="block text-xs font-sans font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Total de Despesas (Débito)
          </span>
          <span className="text-xl font-bold text-rose-700 dark:text-rose-400">
            {formatCurrency(debit)}
          </span>
        </div>
        <div className="p-3 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 rounded-2xl">
          <TrendingDown className="w-5 h-5" aria-hidden="true" />
        </div>
      </div>

      {/* Somatória / Líquido */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 shadow-sm flex items-center justify-between">
        <div className="space-y-1">
          <span className="block text-xs font-sans font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Resultado Líquido (Somatória)
          </span>
          <span className={`text-xl font-bold ${sum >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
            {formatCurrency(sum)}
          </span>
        </div>
        <div className={`p-3 rounded-2xl ${
          sum >= 0 
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
        }`}>
          <ArrowLeftRight className="w-5 h-5" aria-hidden="true" />
        </div>
      </div>

      {/* Saldo Atual (Real) */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 shadow-sm flex items-center justify-between">
        <div className="space-y-1">
          <span className="block text-xs font-sans font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {filterAccount ? 'Saldo de Hoje na Conta' : 'Saldo Atual (Hoje)'}
          </span>
          <span className={`text-xl font-bold ${todayBalance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
            {formatCurrency(todayBalance)}
          </span>
        </div>
        <div className={`p-3 rounded-2xl ${
          todayBalance >= 0 
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
        }`}>
          <Wallet className="w-5 h-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
});

TransactionSummaryCards.displayName = 'TransactionSummaryCards';
