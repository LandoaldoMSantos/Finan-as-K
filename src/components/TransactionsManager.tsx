import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Transaction, Account, Category, Tag, Payee } from '../types.ts';
import { api } from '../lib/api.ts';
import { formatDate } from '../lib/utils.ts';
import { 
  ArrowLeftRight, 
  Plus, 
  FileSpreadsheet
} from 'lucide-react';
import { TransactionFilterBar } from './transactions/TransactionFilterBar.tsx';
import { TransactionSummaryCards } from './transactions/TransactionSummaryCards.tsx';
import { TransactionTable } from './transactions/TransactionTable.tsx';
import { TransactionModal } from './transactions/TransactionModal.tsx';
import { TransactionDeleteModal } from './transactions/TransactionDeleteModal.tsx';
import { useToast } from '../context/ToastContext.tsx';

interface TransactionsManagerProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  payees: Payee[];
  onRefresh: () => Promise<void>;
}

export const TransactionsManager: React.FC<TransactionsManagerProps> = ({
  transactions: initialTransactions,
  accounts,
  categories,
  tags,
  payees,
  onRefresh
}) => {
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const { toast } = useToast();

  // Search and Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Pagination states
  const [page, setPage] = useState(1);
  const limit = 50;
  const [loadedTransactions, setLoadedTransactions] = useState<Transaction[]>(() => {
    return initialTransactions ? initialTransactions.filter(t => !t.isRecurring) : [];
  });
  const [totalTransactionsCount, setTotalTransactionsCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [serverTotals, setServerTotals] = useState<{ credit: number; debit: number; sum: number } | null>(null);

  // Deletion Modal state
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search term to prevent excessive API requests
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch paginated transactions from server
  const fetchPage = useCallback(async (
    targetPage: number,
    append: boolean = false
  ) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    try {
      const res = await api.getTransactions({
        page: targetPage,
        limit,
        accountId: filterAccount || undefined,
        categoryId: filterCategory || undefined,
        type: filterType || undefined,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
        search: debouncedSearch || undefined,
        isRecurring: false, // Strictly fetch only real, launched/settled transactions
      });

      if (res && res.data && res.pagination) {
        const cleanData = res.data.filter((t: Transaction) => !t.isRecurring);
        if (append) {
          setLoadedTransactions(prev => [...prev, ...cleanData]);
        } else {
          setLoadedTransactions(cleanData);
        }
        setTotalTransactionsCount(res.pagination.total);
        setHasMore(res.pagination.hasMore);
        if (res.totals) {
          setServerTotals(res.totals);
        }
      } else if (Array.isArray(res)) {
        // Fallback if backend returned array directly
        const cleanArray = res.filter((t: Transaction) => !t.isRecurring);
        setLoadedTransactions(cleanArray);
        setTotalTransactionsCount(cleanArray.length);
        setHasMore(false);
      }
    } catch (err) {
      console.error('Erro ao buscar transações paginadas:', err);
      // Fallback to client-side initialTransactions if offline
      if (!append && initialTransactions.length > 0) {
        const cleanInitial = initialTransactions.filter(t => !t.isRecurring);
        setLoadedTransactions(cleanInitial);
        setTotalTransactionsCount(cleanInitial.length);
        setHasMore(false);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [
    limit,
    filterAccount,
    filterCategory,
    filterType,
    filterStartDate,
    filterEndDate,
    debouncedSearch,
    initialTransactions
  ]);

  // Re-fetch from page 1 whenever filters change
  useEffect(() => {
    setPage(1);
    fetchPage(1, false);
  }, [fetchPage]);

  // Load more button handler
  const handleLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(nextPage, true);
  }, [hasMore, isLoadingMore, page, fetchPage]);

  // Additional client-side filter for Tag (since tags are many-to-many)
  const displayTransactions = useMemo(() => {
    let list = loadedTransactions.filter(t => !t.isRecurring);
    if (filterTag) {
      const tagIdNum = parseInt(filterTag);
      list = list.filter(t => t.tags && t.tags.some(tag => tag.id === tagIdNum));
    }
    return list;
  }, [loadedTransactions, filterTag]);

  // 1. Calculate Account/Total Today Balance strictly matching Dashboard logic
  const accountTodayBalance = useMemo(() => {
    if (filterAccount) {
      const selectedAcc = accounts.find(a => a.id === parseInt(filterAccount));
      if (selectedAcc) {
        return selectedAcc.todayBalance !== undefined 
          ? selectedAcc.todayBalance 
          : (selectedAcc.currentBalance !== undefined ? selectedAcc.currentBalance : (selectedAcc.initialBalance || 0));
      }
    }
    return accounts.reduce((sum, acc) => {
      const bal = acc.todayBalance !== undefined 
        ? acc.todayBalance 
        : (acc.currentBalance !== undefined ? acc.currentBalance : (acc.initialBalance || 0));
      return sum + bal;
    }, 0);
  }, [accounts, filterAccount]);

  // Calculate Running Balances chronologically from database runningBalance
  const transactionBalances = useMemo(() => {
    const balancesMap = new Map<number, number>();

    displayTransactions.forEach(t => {
      if (t.runningBalance !== undefined && t.runningBalance !== null) {
        balancesMap.set(t.id, t.runningBalance);
      }
    });

    return {
      balancesMap,
      todayBalance: accountTodayBalance
    };
  }, [displayTransactions, accountTodayBalance]);

  // Compute or use server totals for summary cards
  const filterTotals = useMemo(() => {
    if (serverTotals && !filterTag) {
      return serverTotals;
    }
    const credit = displayTransactions
      .filter(t => t.type === 'credito')
      .reduce((sum, t) => sum + t.amount, 0);

    const debit = displayTransactions
      .filter(t => t.type === 'debito')
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      credit,
      debit,
      sum: credit - debit
    };
  }, [serverTotals, filterTag, displayTransactions]);

  // Action callbacks
  const handleEdit = useCallback((t: Transaction) => {
    setEditingTransaction(t);
    setIsDuplicating(false);
    setShowModal(true);
  }, []);

  const handleDuplicate = useCallback((t: Transaction) => {
    setEditingTransaction(t);
    setIsDuplicating(true);
    setShowModal(true);
    toast.info('Dados copiados para nova transação.');
  }, [toast]);

  const handleDelete = useCallback((t: Transaction) => {
    setDeleteTarget(t);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.deleteTransaction(deleteTarget.id);
      await onRefresh();
      fetchPage(1, false);
      toast.success('Transação excluída com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao excluir transação: ' + err.message);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, onRefresh, fetchPage, toast]);

  // Handle save from modal
  const handleSaveTransaction = useCallback(async (payload: any) => {
    const payeeName = payload.payee;
    const payeeExists = payees.some(p => p.name.toLowerCase() === payeeName.toLowerCase());
    if (payeeName && !payeeExists) {
      try {
        await api.createPayee({ name: payeeName });
      } catch (payeeErr) {
        console.error('Erro ao auto-cadastrar beneficiário:', payeeErr);
      }
    }

    try {
      if (editingTransaction && !isDuplicating) {
        await api.updateTransaction(editingTransaction.id, payload);
        toast.success('Transação atualizada com sucesso!');
      } else {
        await api.createTransaction(payload);
        toast.success('Transação salva com sucesso!');
      }

      await onRefresh();
      fetchPage(1, false);
    } catch (err: any) {
      toast.error('Erro ao salvar transação: ' + err.message);
      throw err;
    }
  }, [editingTransaction, isDuplicating, payees, onRefresh, fetchPage, toast]);

  // Open modal for new transaction
  const openNewTransactionModal = useCallback(() => {
    setEditingTransaction(null);
    setIsDuplicating(false);
    setShowModal(true);
  }, []);

  // Clear filters helper
  const handleClearFilters = useCallback(() => {
    setSearchTerm('');
    setDebouncedSearch('');
    setFilterAccount('');
    setFilterCategory('');
    setFilterTag('');
    setFilterType('');
    setFilterStartDate('');
    setFilterEndDate('');
  }, []);

  const hasActiveFilters = Boolean(
    searchTerm ||
    filterAccount ||
    filterCategory ||
    filterTag ||
    filterType ||
    filterStartDate ||
    filterEndDate
  );

  // CSV Export helper
  const handleExportCSV = useCallback(() => {
    if (displayTransactions.length === 0) {
      toast.info('Nenhuma transação disponível para exportação.');
      return;
    }

    const headers = ['ID', 'Data', 'Conta', 'Beneficiário', 'Valor (R$)', 'Tipo', 'Saldo (R$)', 'Categoria', 'Observações', 'Etiquetas'];
    const rows = displayTransactions.map(t => [
      t.id,
      formatDate(t.date),
      t.account?.name || '',
      t.payee,
      `${t.type === 'credito' ? '' : '-'}${(t.amount / 100).toFixed(2)}`,
      t.type === 'credito' ? 'Crédito' : 'Débito',
      (((t.runningBalance ?? transactionBalances.balancesMap.get(t.id) ?? 0)) / 100).toFixed(2),
      t.category?.name || '',
      t.memo || '',
      (t.tags || []).map(tag => tag.name).join('; ')
    ]);

    const csvContent = '\uFEFF' + [
      headers.join(';'),
      ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `financas_extrato_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Extrato CSV exportado com sucesso!');
  }, [displayTransactions, transactionBalances, toast]);

  return (
    <div className="space-y-6">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 tabIndex={-1} data-page-heading className="outline-none text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
            Transações Financeiras
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Lance despesas, receitas, configure cobranças recorrentes agendadas e consulte seu histórico
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExportCSV}
            className="border border-gray-200 dark:border-gray-800 bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-850 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm flex items-center gap-2 transition-all shadow-2xs cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700 dark:text-emerald-500" aria-hidden="true" />
            Exportar CSV
          </button>
          
          {accounts.length === 0 ? (
            <div className="text-xs text-rose-700 max-w-xs self-center dark:text-rose-400">
              * Cadastre uma Conta Corrente antes de criar transações.
            </div>
          ) : (
            <button
              type="button"
              onClick={openNewTransactionModal}
              className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-md shadow-emerald-600/15 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-98"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Lançar Transação
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar Component */}
      <TransactionFilterBar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filterAccount={filterAccount}
        setFilterAccount={setFilterAccount}
        filterCategory={filterCategory}
        setFilterCategory={setFilterCategory}
        filterTag={filterTag}
        setFilterTag={setFilterTag}
        filterType={filterType}
        setFilterType={setFilterType}
        filterStartDate={filterStartDate}
        setFilterStartDate={setFilterStartDate}
        filterEndDate={filterEndDate}
        setFilterEndDate={setFilterEndDate}
        accounts={accounts}
        categories={categories}
        tags={tags}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Summary Cards Component */}
      {(displayTransactions.length > 0 || totalTransactionsCount > 0) && (
        <TransactionSummaryCards
          credit={filterTotals.credit}
          debit={filterTotals.debit}
          sum={filterTotals.sum}
          todayBalance={transactionBalances.todayBalance}
          filterAccount={filterAccount}
        />
      )}

      {/* Modular Transactions Table / List View */}
      <TransactionTable
        transactions={displayTransactions}
        totalCount={totalTransactionsCount}
        isLoading={isLoading}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={handleLoadMore}
        limit={limit}
        balancesMap={transactionBalances.balancesMap}
        onDuplicate={handleDuplicate}
        onEdit={handleEdit}
        onDelete={handleDelete}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={handleClearFilters}
        onNewTransaction={openNewTransactionModal}
        canCreateTransaction={accounts.length > 0}
      />

      {/* Transaction Add/Edit/Duplicate Modal */}
      <TransactionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSaveTransaction}
        editingTransaction={editingTransaction}
        isDuplicating={isDuplicating}
        accounts={accounts}
        categories={categories}
        tags={tags}
        payees={payees}
      />

      {/* Dedicated Accessible Delete Confirmation Modal */}
      <TransactionDeleteModal
        isOpen={Boolean(deleteTarget)}
        transaction={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
};
