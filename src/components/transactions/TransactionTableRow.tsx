import React from 'react';
import { Transaction } from '../../types.ts';
import { formatCurrency, formatDate } from '../../lib/utils.ts';
import { CornerDownRight, Copy, Edit3, Trash2, Calendar } from 'lucide-react';

interface TransactionTableRowProps {
  transaction: Transaction;
  runningBalance: number | undefined;
  onDuplicate: (t: Transaction) => void;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
}

export const TransactionTableRow: React.FC<TransactionTableRowProps> = React.memo(({
  transaction: t,
  runningBalance,
  onDuplicate,
  onEdit,
  onDelete,
}) => {
  return (
    <tr 
      key={t.id} 
      className="hover:bg-gray-50/70 dark:hover:bg-gray-800/30 transition-colors group"
    >
      {/* Date */}
      <td className="py-4 px-4 whitespace-nowrap align-middle">
        <div className="flex items-center gap-1.5 font-mono text-xs text-gray-700 dark:text-gray-300">
          <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
          <span>{formatDate(t.date)}</span>
        </div>
      </td>

      {/* Payee / Details */}
      <td className="py-4 px-4 min-w-[200px] align-middle">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-sm text-gray-900 dark:text-white">
              {t.payee}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            {t.account && (
              <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                {t.account.name}
              </span>
            )}
            {t.account && t.memo && <span>•</span>}
            {t.memo ? (
              <span className="text-[11px] truncate max-w-[220px]" title={t.memo}>
                {t.memo}
              </span>
            ) : null}
          </div>
        </div>
      </td>

      {/* Category / Tags */}
      <td className="py-4 px-4 min-w-[180px] align-middle">
        <div className="space-y-1.5">
          {t.splits && t.splits.length > 0 ? (
            <div className="flex flex-col gap-1 max-w-[210px]">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 w-fit">
                Múltiplas categorias ({t.splits.length})
              </span>
              <div className="flex flex-col gap-0.5 pl-1">
                {t.splits.map((s: any, sidx: number) => (
                  <div key={sidx} className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <span className="truncate max-w-[130px]" title={s.category?.name || 'Sem nome'}>
                      • {s.category?.name || 'Sem nome'}
                    </span>
                    <span className="font-mono font-medium text-gray-700 dark:text-gray-300">({formatCurrency(s.amount)})</span>
                  </div>
                ))}
              </div>
            </div>
          ) : t.category ? (
            <div className="flex items-center gap-1.5 text-xs text-gray-800 dark:text-gray-200 font-medium">
              {t.category.parentId && <CornerDownRight className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />}
              <span className="truncate max-w-[170px] bg-gray-50 dark:bg-gray-800/60 px-2 py-0.5 rounded-md border border-gray-200/50 dark:border-gray-700/50">
                {t.category.name}
              </span>
            </div>
          ) : (
            <span className="text-gray-400 italic text-xs block">Sem categoria</span>
          )}

          {(t.tags && t.tags.length > 0) && (
            <div className="flex flex-wrap gap-1 max-w-[180px]">
              {t.tags.map(tag => (
                <span 
                  key={tag.id} 
                  className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-mono font-semibold border border-emerald-200/50 dark:border-emerald-800/50"
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </td>

      {/* Amount */}
      <td className="py-4 px-4 text-right whitespace-nowrap align-middle">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-mono font-bold text-xs ${
          t.type === 'credito' 
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60' 
            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60'
        }`}>
          {t.type === 'credito' ? '+' : '-'}{formatCurrency(t.amount)}
        </span>
      </td>

      {/* Saldo Parcial */}
      <td className="py-4 px-4 text-right whitespace-nowrap align-middle">
        <span className={`font-mono font-semibold text-xs ${
          (runningBalance ?? 0) >= 0
            ? 'text-gray-900 dark:text-gray-100' 
            : 'text-rose-600 dark:text-rose-400'
        }`}>
          {formatCurrency(runningBalance ?? 0)}
        </span>
      </td>

      {/* Actions */}
      <td className="py-4 px-4 text-right whitespace-nowrap align-middle">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => onDuplicate(t)}
            className="p-2 text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30 rounded-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-95"
            title="Duplicar"
            aria-label={`Duplicar lançamento de ${t.payee}`}
          >
            <Copy className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => onEdit(t)}
            className="p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30 rounded-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-95"
            title="Editar"
            aria-label={`Editar lançamento de ${t.payee}`}
          >
            <Edit3 className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => onDelete(t)}
            className="p-2 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 rounded-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-95"
            title="Excluir"
            aria-label={`Excluir lançamento de ${t.payee}`}
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
});

TransactionTableRow.displayName = 'TransactionTableRow';

