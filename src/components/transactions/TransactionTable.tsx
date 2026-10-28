import React, { useMemo } from 'react';
import { Transaction } from '../../types.ts';
import { TransactionTableRow } from './TransactionTableRow.tsx';
import { useVirtualTable } from './useVirtualTable.ts';
import { EmptyState } from '../common/EmptyState.tsx';
import { formatCurrency, formatDate } from '../../lib/utils.ts';
import { 
  ArrowLeftRight, 
  Loader2, 
  Calendar, 
  Copy, 
  Edit3, 
  Trash2, 
  ChevronDown
} from 'lucide-react';

interface TransactionTableProps {
  transactions: Transaction[];
  totalCount: number;
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  limit: number;
  balancesMap: Map<number, number>;
  onDuplicate: (t: Transaction) => void;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onNewTransaction: () => void;
  canCreateTransaction: boolean;
}

export const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  totalCount,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
  limit,
  balancesMap,
  onDuplicate,
  onEdit,
  onDelete,
  hasActiveFilters,
  onClearFilters,
  onNewTransaction,
  canCreateTransaction,
}) => {
  // Virtualization hook for high-performance rendering of large lists
  const {
    containerRef,
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    isVirtual,
  } = useVirtualTable({
    itemCount: transactions.length,
    itemHeight: 72,
    overscan: 8,
    minItemsToVirtualize: 40,
  });

  const visibleRows = useMemo(() => {
    if (!isVirtual) return transactions;
    return transactions.slice(startIndex, endIndex);
  }, [isVirtual, transactions, startIndex, endIndex]);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl overflow-hidden shadow-xs">
      {/* Table Sub-header Status Info */}
      <div className="px-5 py-3 border-b border-gray-150 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-950/30">
        <div className="flex items-center gap-2">
          <span>
            Mostrando <strong className="text-gray-900 dark:text-white font-mono font-bold">{transactions.length}</strong> de <strong className="text-gray-900 dark:text-white font-mono font-bold">{totalCount}</strong> transações
          </span>
          {isLoading && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700 dark:text-emerald-400 ml-1" aria-hidden="true" />
          )}
        </div>

        {isVirtual && (
          <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
            Virtualização Ativa ({startIndex + 1}–{Math.min(endIndex, transactions.length)})
          </span>
        )}
      </div>

      {/* Empty State */}
      {transactions.length === 0 && !isLoading ? (
        <div className="py-12 px-4">
          <EmptyState
            icon={ArrowLeftRight}
            title={hasActiveFilters ? "Nenhuma transação encontrada" : "Nenhuma transação registrada"}
            description={hasActiveFilters 
              ? "Nenhum lançamento corresponde aos filtros ou termos de pesquisa selecionados. Tente ajustar ou limpar os filtros." 
              : "Lance sua primeira despesa ou receita para começar a acompanhar suas finanças com clareza e precisão."}
            actionLabel={hasActiveFilters ? "Limpar Filtros" : (canCreateTransaction ? "Lançar Primeira Transação" : undefined)}
            onAction={hasActiveFilters ? onClearFilters : onNewTransaction}
          />
        </div>
      ) : (
        <div 
          ref={containerRef}
          className="overflow-x-auto max-h-[660px] overflow-y-auto"
        >
          {/* Desktop Table */}
          <table className="hidden md:table w-full border-collapse text-left text-xs font-medium text-gray-600 dark:text-gray-400">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-bold">
                <th scope="col" className="py-3.5 px-4">Data</th>
                <th scope="col" className="py-3.5 px-4">Beneficiário / Detalhes</th>
                <th scope="col" className="py-3.5 px-4">Categoria / Etiquetas</th>
                <th scope="col" className="py-3.5 px-4 text-right">Valor</th>
                <th scope="col" className="py-3.5 px-4 text-right">Saldo Parcial</th>
                <th scope="col" className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
              {/* Top Spacer for virtualized scroll */}
              {isVirtual && topSpacerHeight > 0 && (
                <tr style={{ height: `${topSpacerHeight}px` }}>
                  <td colSpan={6} style={{ padding: 0, border: 0 }} />
                </tr>
              )}

              {/* Table Rows */}
              {visibleRows.map(t => (
                <TransactionTableRow
                  key={t.id}
                  transaction={t}
                  runningBalance={t.runningBalance ?? balancesMap.get(t.id)}
                  onDuplicate={onDuplicate}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}

              {/* Bottom Spacer for virtualized scroll */}
              {isVirtual && bottomSpacerHeight > 0 && (
                <tr style={{ height: `${bottomSpacerHeight}px` }}>
                  <td colSpan={6} style={{ padding: 0, border: 0 }} />
                </tr>
              )}
            </tbody>
          </table>

          {/* Mobile Card List View */}
          <div className="md:hidden divide-y divide-gray-150 dark:divide-gray-800">
            {visibleRows.map(t => {
              const bal = t.runningBalance ?? balancesMap.get(t.id);

              return (
                <div 
                  key={t.id} 
                  className="p-4 space-y-3 hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors"
                >
                  {/* Top line: Date, Account, Amount */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
                        <span>{formatDate(t.date)}</span>
                        {t.account && (
                          <>
                            <span>•</span>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">{t.account.name}</span>
                          </>
                        )}
                      </div>
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                        {t.payee}
                      </h4>
                    </div>

                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-mono font-bold text-xs shrink-0 ${
                      t.type === 'credito' 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60' 
                        : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60'
                    }`}>
                      {t.type === 'credito' ? '+' : '-'}{formatCurrency(t.amount)}
                    </span>
                  </div>

                  {/* Middle line: Category, Splits, Memo & Balance */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {t.splits && t.splits.length > 0 ? (
                        <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
                          {t.splits.length} Categorias
                        </span>
                      ) : t.category ? (
                        <span className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-md text-xs font-medium">
                          {t.category.name}
                        </span>
                      ) : (
                        <span className="italic text-gray-500 text-xs">Sem categoria</span>
                      )}

                      {t.memo && (
                        <span className="text-xs text-gray-500 truncate max-w-[180px]">
                          • {t.memo}
                        </span>
                      )}
                    </div>

                    {bal !== undefined && (
                      <div className="text-xs font-mono text-gray-500 dark:text-gray-400 ml-auto">
                        Saldo: <span className="font-bold text-gray-800 dark:text-gray-200">{formatCurrency(bal)}</span>
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  {t.tags && t.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {t.tags.map(tag => (
                        <span
                          key={tag.id}
                          className="text-xs bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-mono font-semibold"
                        >
                          #{tag.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Action Buttons (Mobile friendly >= 44px touch targets) */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800/80">
                    <button
                      type="button"
                      onClick={() => onDuplicate(t)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-xl hover:bg-amber-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                      aria-label={`Duplicar lançamento ${t.payee}`}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Duplicar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(t)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 rounded-xl hover:bg-blue-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                      aria-label={`Editar lançamento ${t.payee}`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(t)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 rounded-xl hover:bg-rose-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                      aria-label={`Excluir lançamento ${t.payee}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination: Load More button */}
      {hasMore && (
        <div className="p-4 border-t border-gray-150 dark:border-gray-800 flex justify-center bg-gray-50/50 dark:bg-gray-950/20">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-800 dark:text-gray-200 font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                Carregando mais lançamentos...
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                Carregar mais ({Math.min(limit, totalCount - transactions.length)} restantes)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
