import React, { useState, useMemo, useEffect } from 'react';
import { Account, Transaction } from '../types.ts';
import { api } from '../lib/api.ts';
import { formatCurrency, formatDate } from '../lib/utils.ts';
import { 
  Landmark, 
  Plus, 
  Trash2, 
  Edit3, 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  Calendar,
  X,
  Check,
  ChevronRight,
  Info,
  AlertTriangle
} from 'lucide-react';
import { useToast } from '../context/ToastContext.tsx';
import { EmptyState } from './common/EmptyState.tsx';

interface AccountsManagerProps {
  accounts: Account[];
  transactions: Transaction[];
  onRefresh: () => Promise<void>;
}

export const AccountsManager: React.FC<AccountsManagerProps> = ({ 
  accounts, 
  transactions, 
  onRefresh 
}) => {
  const { toast } = useToast();

  // Account Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [initialBalanceInput, setInitialBalanceInput] = useState('0,00');
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // Statement (Extrato) states
  const [selectedExtratoAccount, setSelectedExtratoAccount] = useState<Account | null>(null);
  const [periodType, setPeriodType] = useState<'thisMonth' | 'lastMonth' | 'last30' | 'custom'>('thisMonth');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Auto set custom dates to today
  useEffect(() => {
    if (!customStartDate) {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const lastDay = today.toISOString().split('T')[0];
      setCustomStartDate(firstDay);
      setCustomEndDate(lastDay);
    }
  }, [customStartDate]);

  // Handle escape key to dismiss modal or statement view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deleteTargetId !== null) {
          setDeleteTargetId(null);
        } else if (selectedExtratoAccount !== null) {
          setSelectedExtratoAccount(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteTargetId, selectedExtratoAccount]);

  // Parse formatted balance to integer cents
  const parseInputToCents = (val: string): number => {
    const clean = val.replace(/[^\d,\-]/g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : Math.round(parsed * 100);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const balanceCents = parseInputToCents(initialBalanceInput);
      await api.createAccount({
        name: name.trim(),
        type: 'Corrente',
        initialBalance: balanceCents,
      });
      setName('');
      setInitialBalanceInput('0,00');
      setShowAddForm(false);
      await onRefresh();
      toast.success('Conta bancária cadastrada com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao criar conta: ' + err.message);
    }
  };

  const handleUpdate = async (id: number) => {
    if (!name.trim()) return;
    try {
      const balanceCents = parseInputToCents(initialBalanceInput);
      await api.updateAccount(id, {
        name: name.trim(),
        type: 'Corrente',
        initialBalance: balanceCents,
      });
      setEditingId(null);
      setName('');
      setInitialBalanceInput('0,00');
      await onRefresh();
      toast.success('Conta atualizada com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao editar conta: ' + err.message);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await api.deleteAccount(deleteTargetId);
      if (selectedExtratoAccount?.id === deleteTargetId) {
        setSelectedExtratoAccount(null);
      }
      await onRefresh();
      toast.success('Conta e transações vinculadas excluídas!');
    } catch (err: any) {
      toast.error('Erro ao excluir conta: ' + err.message);
    } finally {
      setDeleteTargetId(null);
    }
  };

  const startEdit = (acc: Account) => {
    setEditingId(acc.id);
    setName(acc.name);
    setInitialBalanceInput((acc.initialBalance / 100).toFixed(2).replace('.', ','));
  };

  // Compute Statement Period Date boundaries
  const dateRange = useMemo(() => {
    const today = new Date();
    let start = '';
    let end = '';

    if (periodType === 'thisMonth') {
      const y = today.getFullYear();
      const m = today.getMonth();
      start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      end = new Date(y, m + 1, 0).toISOString().split('T')[0];
    } else if (periodType === 'lastMonth') {
      const y = today.getFullYear();
      const m = today.getMonth() - 1;
      // Handle January
      const adjustedYear = m < 0 ? y - 1 : y;
      const adjustedMonth = m < 0 ? 11 : m;
      start = `${adjustedYear}-${String(adjustedMonth + 1).padStart(2, '0')}-01`;
      end = new Date(adjustedYear, adjustedMonth + 1, 0).toISOString().split('T')[0];
    } else if (periodType === 'last30') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);
      start = thirtyDaysAgo.toISOString().split('T')[0];
      end = today.toISOString().split('T')[0];
    } else {
      start = customStartDate;
      end = customEndDate;
    }

    return { start, end };
  }, [periodType, customStartDate, customEndDate]);

  // Compute Period-Based Statement Balances
  const extratoData = useMemo(() => {
    if (!selectedExtratoAccount) return null;

    const accId = selectedExtratoAccount.id;
    const initialBal = selectedExtratoAccount.initialBalance;
    const { start, end } = dateRange;

    // 1. All past transactions before the start date
    const pastTx = transactions.filter(t => t.accountId === accId && !t.isRecurring && !(t.memo && t.memo.includes('[Agendado]')) && t.date < start);
    const pastCredits = pastTx.filter(t => t.type === 'credito').reduce((sum, t) => sum + t.amount, 0);
    const pastDebits = pastTx.filter(t => t.type === 'debito').reduce((sum, t) => sum + t.amount, 0);
    
    // Period Initial Balance
    const periodInitialBalance = initialBal + pastCredits - pastDebits;

    // 2. Transactions during the period
    const periodTx = transactions.filter(t => 
      t.accountId === accId && 
      !t.isRecurring && 
      !(t.memo && t.memo.includes('[Agendado]')) &&
      t.date >= start && 
      t.date <= end
    );

    // Period Revenues & Expenses
    const periodRevenues = periodTx.filter(t => t.type === 'credito').reduce((sum, t) => sum + t.amount, 0);
    const periodExpenses = periodTx.filter(t => t.type === 'debito').reduce((sum, t) => sum + t.amount, 0);

    // Period Final Balance
    const periodFinalBalance = periodInitialBalance + periodRevenues - periodExpenses;

    // Sort period transactions date desc
    const sortedPeriodTx = [...periodTx].sort((a, b) => b.date.localeCompare(a.date));

    return {
      initialBalance: periodInitialBalance,
      revenues: periodRevenues,
      expenses: periodExpenses,
      finalBalance: periodFinalBalance,
      transactions: sortedPeriodTx,
    };
  }, [selectedExtratoAccount, transactions, dateRange]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 tabIndex={-1} data-page-heading className="outline-none text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Landmark className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
            Contas Correntes
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Cadastre e edite suas contas bancárias para apurar saldos automáticos de qualquer dispositivo
          </p>
        </div>

        {!showAddForm && (
          <button
            onClick={() => {
              setEditingId(null);
              setName('');
              setInitialBalanceInput('0,00');
              setShowAddForm(true);
            }}
            className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all shadow-md shadow-emerald-600/10 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Nova Conta Corrente
          </button>
        )}
      </div>

      {/* Account Creation/Edition Form */}
      {showAddForm || editingId !== null ? (
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (editingId !== null) {
              handleUpdate(editingId);
            } else {
              handleCreate(e);
            }
          }} 
          className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 space-y-4 shadow-sm max-w-xl"
        >
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
            <h3 className="font-bold text-gray-900 dark:text-white">
              {editingId !== null ? 'Editar Conta Corrente' : 'Cadastrar Nova Conta Corrente'}
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setEditingId(null);
              }}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 rounded-lg"
              aria-label="Fechar formulário de conta"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="account-name" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Nome da Conta
              </label>
              <input
                id="account-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Itaú Uniclass, Banco do Brasil, Carteira"
                className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="account-initial-balance" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Saldo Inicial (R$)
              </label>
              <input
                id="account-initial-balance"
                type="text"
                value={initialBalanceInput}
                onChange={(e) => setInitialBalanceInput(e.target.value)}
                placeholder="0,00"
                className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Use sinal negativo (-) para contas que começam negativas (ex: limite especial usado).</p>
            </div>
          </div>

          <div className="flex gap-2 pt-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setEditingId(null);
              }}
              className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-750 text-gray-600 dark:text-gray-400 px-4 py-2.5 rounded-xl font-medium text-sm transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-md shadow-emerald-600/10 cursor-pointer"
            >
              Salvar Conta
            </button>
          </div>
        </form>
      ) : null}

      {/* Accounts List Grid */}
      {accounts.length === 0 && !showAddForm ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6">
          <EmptyState
            icon={Landmark}
            title="Nenhuma conta bancária cadastrada"
            description="Cadastre sua primeira conta corrente, investimento ou carteira para começar a conciliar seus lançamentos e apurar saldos com precisão."
            actionLabel="Cadastrar Primeira Conta"
            onAction={() => {
              setEditingId(null);
              setName('');
              setInitialBalanceInput('0,00');
              setShowAddForm(true);
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {accounts.map(acc => {
            const isSelectedForExtrato = selectedExtratoAccount?.id === acc.id;

            return (
              <div 
                key={acc.id} 
                className={`bg-white dark:bg-gray-900 border rounded-2xl p-5 flex flex-col justify-between transition-all shadow-sm group ${
                  isSelectedForExtrato 
                    ? 'border-emerald-500 ring-2 ring-emerald-500/10' 
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-750'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 rounded-xl">
                        <Landmark className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {acc.name}
                        </h3>
                        <span className="text-xs bg-gray-50 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-md font-mono">
                          CORRENTE
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(acc)}
                        title="Editar"
                        aria-label={`Editar conta ${acc.name}`}
                        className="p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/20 rounded-lg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <Edit3 className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => setDeleteTargetId(acc.id)}
                        title="Excluir"
                        aria-label={`Excluir conta ${acc.name}`}
                        className="p-2 text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/20 rounded-lg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-500"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 border-t border-b border-gray-100 dark:border-gray-800 py-3 font-mono text-xs sm:text-xs">
                    <div>
                      <span className="block text-xs sm:text-xs font-sans font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Inicial
                      </span>
                      <span className="font-semibold text-gray-600 dark:text-gray-300">
                        {formatCurrency(acc.initialBalance)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs sm:text-xs font-sans font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Saldo Atual
                      </span>
                      <span className={`font-bold ${
                        (acc.todayBalance ?? acc.initialBalance) >= 0 
                          ? 'text-emerald-700 dark:text-emerald-400' 
                          : 'text-rose-700 dark:text-rose-400'
                      }`}>
                        {formatCurrency(acc.todayBalance ?? acc.initialBalance)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs sm:text-xs font-sans font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Previsto
                      </span>
                      <span className={`font-bold ${
                        (acc.currentBalance ?? acc.initialBalance) >= 0 
                          ? 'text-emerald-700 dark:text-emerald-400' 
                          : 'text-rose-700 dark:text-rose-400'
                      }`}>
                        {formatCurrency(acc.currentBalance ?? acc.initialBalance)}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedExtratoAccount(acc)}
                  className={`mt-4 w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isSelectedForExtrato
                      ? 'bg-emerald-700 text-white shadow-md shadow-emerald-600/10'
                      : 'bg-gray-50 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-750'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {isSelectedForExtrato ? 'Vendo Extrato Periódico' : 'Ver Extrato por Período'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Account Statement (Extrato) Area */}
      {selectedExtratoAccount && extratoData && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 space-y-6 shadow-sm animate-fade-in">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-5">
            <div className="space-y-1">
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Extrato Bancário de Período
              </span>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Landmark className="w-5 h-5 text-gray-500" />
                {selectedExtratoAccount.name}
              </h3>
            </div>

            {/* Period Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPeriodType('thisMonth')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  periodType === 'thisMonth'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-750'
                }`}
              >
                Este Mês
              </button>
              <button
                onClick={() => setPeriodType('lastMonth')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  periodType === 'lastMonth'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-750'
                }`}
              >
                Mês Passado
              </button>
              <button
                onClick={() => setPeriodType('last30')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  periodType === 'last30'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-750'
                }`}
              >
                Últimos 30 Dias
              </button>
              <button
                onClick={() => setPeriodType('custom')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  periodType === 'custom'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-750'
                }`}
              >
                Personalizado
              </button>

              <button
                onClick={() => setSelectedExtratoAccount(null)}
                className="p-2 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20 text-gray-500 dark:text-gray-500 rounded-lg ml-auto lg:ml-2"
                title="Fechar extrato"
                aria-label="Fechar extrato bancário"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Custom Dates Picker */}
          {periodType === 'custom' && (
            <div className="flex flex-wrap gap-4 bg-gray-50 dark:bg-gray-950/40 p-4 rounded-xl border border-gray-150 dark:border-gray-800 max-w-lg">
              <div className="flex-1 min-w-[150px]">
                <label htmlFor="extrato-start-date" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Data de Início
                </label>
                <input
                  id="extrato-start-date"
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label htmlFor="extrato-end-date" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Data de Fim
                </label>
                <input
                  id="extrato-end-date"
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* Statement Calculations Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-sm">
            {/* Saldo Inicial */}
            <div className="bg-gray-50 dark:bg-gray-950/40 border border-gray-150 dark:border-gray-850 p-4 rounded-xl">
              <span className="block text-xs font-sans font-bold text-gray-500 uppercase tracking-wider mb-1">
                Saldo Inicial do Período
              </span>
              <span className="text-base font-bold text-gray-900 dark:text-white">
                {formatCurrency(extratoData.initialBalance)}
              </span>
              <span className="block text-xs font-sans text-gray-500 mt-1">
                Saldo em {formatDate(dateRange.start)}
              </span>
            </div>

            {/* Receitas */}
            <div className="bg-emerald-50/20 dark:bg-emerald-950/5 border border-emerald-100/40 dark:border-emerald-950/25 p-4 rounded-xl">
              <span className="block text-xs font-sans font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Receitas do Período
              </span>
              <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(extratoData.revenues)}
              </span>
              <span className="block text-xs font-sans text-gray-500 mt-1">
                Soma de créditos no intervalo
              </span>
            </div>

            {/* Despesas */}
            <div className="bg-rose-50/20 dark:bg-rose-950/5 border border-rose-100/40 dark:border-rose-950/25 p-4 rounded-xl">
              <span className="block text-xs font-sans font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" /> Despesas do Período
              </span>
              <span className="text-base font-bold text-rose-700 dark:text-rose-400">
                {formatCurrency(extratoData.expenses)}
              </span>
              <span className="block text-xs font-sans text-gray-500 mt-1">
                Soma de débitos no intervalo
              </span>
            </div>

            {/* Saldo Final */}
            <div className="bg-gray-50 dark:bg-gray-950/40 border border-gray-150 dark:border-gray-850 p-4 rounded-xl">
              <span className="block text-xs font-sans font-bold text-gray-500 uppercase tracking-wider mb-1">
                Saldo Final do Período
              </span>
              <span className={`text-base font-bold ${
                extratoData.finalBalance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
              }`}>
                {formatCurrency(extratoData.finalBalance)}
              </span>
              <span className="block text-xs font-sans text-gray-500 mt-1">
                Saldo em {formatDate(dateRange.end)}
              </span>
            </div>
          </div>

          {/* Transactions List within Statement */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Transações ocorridas neste período ({extratoData.transactions.length})
            </h4>

            {extratoData.transactions.length === 0 ? (
              <div className="bg-gray-50 dark:bg-gray-950/20 rounded-xl p-8 text-center text-sm text-gray-500 dark:text-gray-500">
                <Calendar className="w-10 h-10 mx-auto mb-2 text-gray-300 dark:text-gray-800" />
                Nenhuma transação registrada entre {formatDate(dateRange.start)} e {formatDate(dateRange.end)}.
              </div>
            ) : (
              <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                {extratoData.transactions.map((t) => (
                  <div key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white dark:bg-gray-900 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 text-xs font-medium transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/40 px-2 py-0.5 rounded-md border border-gray-100 dark:border-gray-800">
                          {formatDate(t.date)}
                        </span>
                        <span className="font-bold text-gray-900 dark:text-white">
                          {t.payee}
                        </span>
                      </div>
                      <div className="text-gray-500 dark:text-gray-500 text-xs flex items-center gap-1">
                        <span>{t.category ? t.category.name : 'Sem Categoria'}</span>
                        {t.memo && (
                          <>
                            <span>•</span>
                            <span className="italic truncate max-w-[200px]">{t.memo}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <span className={`font-mono font-bold text-sm sm:text-right mt-1 sm:mt-0 ${
                      t.type === 'credito' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                    }`}>
                      {t.type === 'credito' ? '+' : '-'}{formatCurrency(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTargetId !== null && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-modal-title"
        >
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-rose-700 dark:text-rose-400">
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 rounded-xl">
                <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 id="delete-account-modal-title" className="font-bold text-gray-900 dark:text-white">
                Excluir Conta Bancária?
              </h3>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              Excluir esta conta apagará permanentemente todos os lançamentos e transferências vinculados a ela. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-750 rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-sm shadow-rose-600/20 cursor-pointer"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
