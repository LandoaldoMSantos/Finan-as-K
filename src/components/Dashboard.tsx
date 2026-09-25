import React, { useState, useMemo } from 'react';
import { Account, Transaction, Category } from '../types.ts';
import { formatCurrency, formatDate } from '../lib/utils.ts';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  Clock,
  LayoutDashboard,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  PieChart,
  Scale,
  Plus,
  ArrowRight,
  Sparkles,
  Building2,
  FileSpreadsheet,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EmptyState } from './common/EmptyState.tsx';

interface DashboardProps {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  onNavigate?: (view: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  accounts, 
  transactions,
  categories,
  onNavigate 
}) => {
  const [periodType, setPeriodType] = useState<'diario' | 'semanal' | 'mensal'>('mensal');
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);

  // 1. Calculate Consolidated Total Balance (including all non-recurring transactions)
  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + (acc.currentBalance !== undefined ? acc.currentBalance : acc.initialBalance), 0);
  }, [accounts]);

  // Calculate Consolidated Today Balance (transactions up to today's date)
  const totalTodayBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + (acc.todayBalance !== undefined ? acc.todayBalance : (acc.currentBalance !== undefined ? acc.currentBalance : acc.initialBalance)), 0);
  }, [accounts]);

  // Non-recurring, non-scheduled transactions
  const concreteTransactions = useMemo(() => {
    return transactions.filter(t => !t.isRecurring && !(t.memo && t.memo.includes('[Agendado]')));
  }, [transactions]);

  const creditTransactions = useMemo(() => {
    return concreteTransactions.filter(t => t.type === 'credito');
  }, [concreteTransactions]);

  const debitTransactions = useMemo(() => {
    return concreteTransactions.filter(t => t.type === 'debito');
  }, [concreteTransactions]);

  const totalCredits = useMemo(() => {
    return creditTransactions.reduce((sum, t) => sum + t.amount, 0);
  }, [creditTransactions]);

  const totalDebits = useMemo(() => {
    return debitTransactions.reduce((sum, t) => sum + t.amount, 0);
  }, [debitTransactions]);

  const netResult = useMemo(() => {
    return totalCredits - totalDebits;
  }, [totalCredits, totalDebits]);

  // Colors for Category progress bars
  const COLORS = [
    '#10b981', // emerald
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
    '#64748b'  // slate
  ];

  // 2. Expenses by Category (breakdown with percentage and amounts)
  const categoryBreakdown = useMemo(() => {
    const grouped: Record<string, number> = {};

    debitTransactions.forEach(t => {
      let catName = 'Sem Categoria';
      if (t.categoryId) {
        const cat = categories.find(c => c.id === t.categoryId);
        if (cat) {
          if (cat.parentId !== null) {
            const parent = categories.find(p => p.id === cat.parentId);
            catName = parent ? parent.name : cat.name;
          } else {
            catName = cat.name;
          }
        }
      }
      grouped[catName] = (grouped[catName] || 0) + (t.amount / 100);
    });

    const sortedData = Object.entries(grouped).map(([name, value]) => ({
      name,
      value: Math.round(value * 100) / 100,
    })).sort((a, b) => b.value - a.value);

    const totalDebitsInDollars = totalDebits / 100;

    return sortedData.map((item, index) => {
      const percentage = totalDebitsInDollars > 0 ? (item.value / totalDebitsInDollars) * 100 : 0;
      return {
        ...item,
        percentage: Math.round(percentage * 10) / 10,
        color: COLORS[index % COLORS.length]
      };
    });
  }, [debitTransactions, categories, totalDebits]);

  // 3. Receitas vs Despesas by period (List detail)
  const periodData = useMemo(() => {
    const grouped: Record<string, { receitas: number; despesas: number; txs: Transaction[] }> = {};

    concreteTransactions.forEach(t => {
      let key = '';
      if (periodType === 'diario') {
        key = t.date;
      } else if (periodType === 'semanal') {
        const d = new Date(t.date + 'T12:00:00');
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        key = `Semana de ${formatDate(monday.toISOString().split('T')[0])}`;
      } else {
        const [y, m] = t.date.split('-');
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        key = `${monthNames[parseInt(m) - 1]}/${y}`;
      }

      if (!grouped[key]) {
        grouped[key] = { receitas: 0, despesas: 0, txs: [] };
      }

      if (t.type === 'credito') {
        grouped[key].receitas += t.amount / 100;
      } else {
        grouped[key].despesas += t.amount / 100;
      }
      grouped[key].txs.push(t);
    });

    return Object.entries(grouped).map(([period, data]) => ({
      period,
      receitas: Math.round(data.receitas * 100) / 100,
      despesas: Math.round(data.despesas * 100) / 100,
      resultado: Math.round((data.receitas - data.despesas) * 100) / 100,
      txs: data.txs,
    })).sort((a, b) => {
      return b.period.localeCompare(a.period);
    });
  }, [concreteTransactions, periodType]);

  const togglePeriodExpand = (period: string) => {
    setExpandedPeriod(prev => prev === period ? null : period);
  };

  // Recent 6 transactions
  const recentTransactions = useMemo(() => {
    return [...concreteTransactions]
      .sort((a, b) => {
        const dateComp = b.date.localeCompare(a.date);
        if (dateComp !== 0) return dateComp;

        if (a.type !== b.type) {
          return a.type === 'credito' ? -1 : 1;
        }

        const amtComp = b.amount - a.amount;
        if (amtComp !== 0) return amtComp;

        return b.id - a.id;
      })
      .slice(0, 6);
  }, [concreteTransactions]);

  return (
    <div className="space-y-7 animate-fade-in">
      {/* Top Header & Quick Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <LayoutDashboard className="w-7 h-7 text-emerald-600 dark:text-emerald-500 shrink-0" />
            Visão Geral Financeira
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Saldos consolidados, fluxo de caixa e panorama em tempo real de suas contas
          </p>
        </div>

        {/* Quick actions for user convenience */}
        {onNavigate && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-600/20 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Novo Lançamento</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('forecast')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>Ver Previsão</span>
            </button>
          </div>
        )}
      </div>

      {/* Zero accounts onboarding banner */}
      {accounts.length === 0 && (
        <div className="p-6 bg-gradient-to-r from-emerald-50/80 via-white to-emerald-50/40 dark:from-emerald-950/30 dark:via-gray-900 dark:to-emerald-950/10 border border-emerald-200/80 dark:border-emerald-800/60 rounded-3xl shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="space-y-1.5 max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                Primeiros Passos
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Cadastre sua primeira conta corrente para começar
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                Adicione suas contas bancárias, carteira ou cartões para acompanhar saldos consolidados e registrar lançamentos financeiros no Finanças K.
              </p>
            </div>

            {onNavigate && (
              <div className="flex flex-wrap gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('accounts')}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
                >
                  <Building2 className="w-4 h-4" />
                  Cadastrar Conta
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('import')}
                  className="px-4 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Importar Extrato
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4-Card Summary Grid with High Readability & Visual Rhythm */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* 1. Saldo Disponível Hoje */}
        <motion.div 
          whileHover={{ y: -2 }}
          transition={{ duration: 0.15 }}
          className="bg-white dark:bg-gray-900 border border-emerald-200/60 dark:border-emerald-900/40 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col justify-between transition-all relative overflow-hidden"
        >
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Saldo Disponível (Hoje)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
              {accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}
            </span>
          </div>

          <div className="pt-3.5 space-y-2.5">
            <div className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${
              totalTodayBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {formatCurrency(totalTodayBalance)}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-800/80 text-xs">
              <span className="text-gray-500 dark:text-gray-400 text-[11px]">Projetado no mês:</span>
              <span className={`font-mono font-bold text-xs ${
                totalBalance >= 0 ? 'text-gray-800 dark:text-gray-200' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {formatCurrency(totalBalance)}
              </span>
            </div>
          </div>
        </motion.div>

        {/* 2. Total de Receitas */}
        <motion.div 
          whileHover={{ y: -2 }}
          transition={{ duration: 0.15 }}
          className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col justify-between transition-all"
        >
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Total de Receitas
            </span>
            <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="pt-3.5 space-y-2.5">
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
              +{formatCurrency(totalCredits)}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-800/80 text-xs text-gray-500 dark:text-gray-400 text-[11px]">
              <span>Entradas registradas:</span>
              <span className="font-mono font-bold text-gray-800 dark:text-gray-200">
                {creditTransactions.length} {creditTransactions.length === 1 ? 'item' : 'itens'}
              </span>
            </div>
          </div>
        </motion.div>

        {/* 3. Total de Despesas */}
        <motion.div 
          whileHover={{ y: -2 }}
          transition={{ duration: 0.15 }}
          className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col justify-between transition-all"
        >
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              Total de Despesas
            </span>
            <div className="w-6 h-6 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="pt-3.5 space-y-2.5">
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-rose-600 dark:text-rose-400">
              -{formatCurrency(totalDebits)}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-800/80 text-xs text-gray-500 dark:text-gray-400 text-[11px]">
              <span>Saídas registradas:</span>
              <span className="font-mono font-bold text-gray-800 dark:text-gray-200">
                {debitTransactions.length} {debitTransactions.length === 1 ? 'item' : 'itens'}
              </span>
            </div>
          </div>
        </motion.div>

        {/* 4. Resultado Líquido Operacional */}
        <motion.div 
          whileHover={{ y: -2 }}
          transition={{ duration: 0.15 }}
          className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col justify-between transition-all"
        >
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Resultado Operacional
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
              netResult >= 0 
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60'
            }`}>
              {netResult >= 0 ? 'Superávit' : 'Déficit'}
            </span>
          </div>

          <div className="pt-3.5 space-y-2.5">
            <div className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${
              netResult >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {netResult >= 0 ? '+' : ''}{formatCurrency(netResult)}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-800/80 text-xs text-gray-500 dark:text-gray-400 text-[11px]">
              <span>Taxa de economia:</span>
              <span className="font-mono font-bold text-gray-800 dark:text-gray-200">
                {totalCredits > 0 ? `${Math.round((netResult / totalCredits) * 100)}%` : '0%'}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main Content Grid: Despesas por Categoria + Últimos Lançamentos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Despesas por Categoria (7 cols on desktop) */}
        <div className="lg:col-span-7 bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 sm:p-6 shadow-xs space-y-5 flex flex-col justify-between">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="space-y-0.5">
                <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Despesas por Categoria
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Distribuição percentual e valores do total de saídas registradas
                </p>
              </div>

              {categoryBreakdown.length > 0 && (
                <span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-xl border border-gray-200/60 dark:border-gray-700/60">
                  {categoryBreakdown.length} {categoryBreakdown.length === 1 ? 'categoria' : 'categorias'}
                </span>
              )}
            </div>

            {/* Distribution Stacked Bar (Visual preview of top slices) */}
            {categoryBreakdown.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div 
                  className="w-full h-3 rounded-full overflow-hidden flex bg-gray-100 dark:bg-gray-800 shadow-inner"
                  role="progressbar"
                  aria-label="Distribuição percentual de despesas por categoria"
                  aria-valuenow={100}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  {categoryBreakdown.slice(0, 6).map((item) => (
                    <div
                      key={item.name}
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: item.color,
                      }}
                      title={`${item.name}: ${item.percentage}%`}
                      className="h-full transition-all duration-500 hover:opacity-85"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Breakdown List or Empty State */}
          {categoryBreakdown.length === 0 ? (
            <div className="py-8">
              <EmptyState 
                icon={PieChart}
                compact
                title="Nenhuma despesa para classificar"
                description="Quando registrar despesas associadas a categorias, elas aparecerão aqui organizadas com porcentagem, valores e barras de progresso."
                actionLabel={onNavigate ? "Lançar Despesa" : undefined}
                onAction={onNavigate ? () => onNavigate('transactions') : undefined}
              />
            </div>
          ) : (
            <div className="space-y-3.5 max-h-[360px] overflow-y-auto pr-1">
              {categoryBreakdown.map((item) => (
                <div key={item.name} className="space-y-1.5 p-2 rounded-xl hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span 
                        className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: item.color }} 
                        aria-hidden="true"
                      />
                      <span className="font-semibold text-gray-800 dark:text-gray-200 truncate">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 font-mono">
                      <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md">
                        {item.percentage}%
                      </span>
                      <span className="font-bold text-gray-900 dark:text-white">
                        R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Individual progress bar */}
                  <div 
                    role="progressbar"
                    aria-valuenow={item.percentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${item.name}: ${item.percentage}% do total de despesas, R$ ${item.value.toFixed(2)}`}
                    className="w-full bg-gray-100 dark:bg-gray-800 h-2 rounded-full overflow-hidden"
                  >
                    <div 
                      className="h-full rounded-full transition-all duration-500" 
                      style={{ 
                        width: `${item.percentage}%`,
                        backgroundColor: item.color 
                      }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Card footer info */}
          {categoryBreakdown.length > 0 && (
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Total de despesas categorizadas:</span>
              <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                {formatCurrency(totalDebits)}
              </span>
            </div>
          )}
        </div>

        {/* Right Column: Últimos Lançamentos (5 cols on desktop) */}
        <div className="lg:col-span-5 bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="space-y-0.5">
                <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Últimos Lançamentos
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Últimas movimentações financeiras</p>
              </div>

              {onNavigate && concreteTransactions.length > 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate('transactions')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  <span>Ver todas</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {recentTransactions.length === 0 ? (
              <div className="py-8">
                <EmptyState 
                  icon={Clock}
                  compact
                  title="Nenhum lançamento recente"
                  description="Quando você adicionar suas primeiras movimentações ou importar extratos, os lançamentos mais recentes serão exibidos aqui."
                  actionLabel={onNavigate ? "Lançar Movimentação" : undefined}
                  onAction={onNavigate ? () => onNavigate('transactions') : undefined}
                />
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800/80 border border-gray-150 dark:border-gray-800 rounded-2xl overflow-hidden">
                {recentTransactions.map((tx) => (
                  <div 
                    key={tx.id} 
                    className="p-3 hover:bg-gray-50/70 dark:hover:bg-gray-800/30 transition-colors flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] bg-gray-100 dark:bg-gray-800 border border-gray-200/60 dark:border-gray-700/60 text-gray-600 dark:text-gray-400 font-mono px-1.5 py-0.5 rounded-md shrink-0">
                          {formatDate(tx.date)}
                        </span>
                        <h4 className="font-bold text-gray-900 dark:text-white truncate">
                          {tx.payee}
                        </h4>
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 truncate">
                        <span className="truncate">{tx.account ? tx.account.name : 'Sem conta'}</span>
                        <span>•</span>
                        <span className="truncate">{tx.category ? tx.category.name : 'Sem Categoria'}</span>
                      </div>
                    </div>

                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-bold shrink-0 ${
                      tx.type === 'credito' 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60' 
                        : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60'
                    }`}>
                      {tx.type === 'credito' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {recentTransactions.length > 0 && onNavigate && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('transactions')}
                className="w-full py-2 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl transition-all border border-gray-200/60 dark:border-gray-700/60 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Acessar Extrato Completo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Histórico por Período (Revenues vs Expenses Collapsible Grid) */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-4">
          <div className="space-y-0.5">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Histórico Comparativo por Período
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Resumo comparativo de receitas, despesas e saldo líquido do intervalo. Clique em um período para expandir seus itens.
            </p>
          </div>

          {/* Segmented control for Diário, Semanal, Mensal */}
          <div role="group" aria-label="Tipo de período" className="flex gap-1 bg-gray-100 dark:bg-gray-800/80 p-1 rounded-2xl self-start sm:self-auto border border-gray-200/60 dark:border-gray-700/60">
            {(['diario', 'semanal', 'mensal'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => { setPeriodType(mode); setExpandedPeriod(null); }}
                aria-pressed={periodType === mode}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500 capitalize ${
                  periodType === mode 
                    ? 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 shadow-xs' 
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                {mode === 'diario' ? 'Diário' : mode === 'semanal' ? 'Semanal' : 'Mensal'}
              </button>
            ))}
          </div>
        </div>

        {/* Period Collapsible details list */}
        <div className="space-y-2.5">
          {periodData.length === 0 ? (
            <div className="py-6">
              <EmptyState 
                icon={Calendar}
                compact
                title="Sem lançamentos no período"
                description="Nenhum dado financeiro encontrado para o agrupamento selecionado."
                actionLabel={onNavigate ? "Lançar Transação" : undefined}
                onAction={onNavigate ? () => onNavigate('transactions') : undefined}
              />
            </div>
          ) : (
            <div className="space-y-2.5">
              {periodData.slice(0, 8).map((item, idx) => {
                const isExpanded = expandedPeriod === item.period;
                const contentId = `period-details-${idx}`;

                return (
                  <div 
                    key={item.period} 
                    className="border border-gray-200/80 dark:border-gray-800 rounded-2xl overflow-hidden transition-all shadow-2xs hover:border-gray-300 dark:hover:border-gray-700"
                  >
                    {/* Row Header Button */}
                    <button 
                      type="button"
                      onClick={() => togglePeriodExpand(item.period)}
                      aria-expanded={isExpanded}
                      aria-controls={contentId}
                      aria-label={`${item.period}, receitas de ${item.receitas.toFixed(2)} reais, despesas de ${item.despesas.toFixed(2)} reais, saldo de ${item.resultado.toFixed(2)} reais, ${item.txs.length} itens. Clique para ${isExpanded ? 'recolher' : 'expandir'}`}
                      className="w-full text-left flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50/50 dark:bg-gray-950/30 hover:bg-gray-100/50 dark:hover:bg-gray-800/40 cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 gap-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white font-mono">
                          {item.period}
                        </span>
                        <span className="font-bold text-gray-600 dark:text-gray-300 bg-gray-200/60 dark:bg-gray-800 px-2 py-0.5 rounded-full text-[10px] font-mono">
                          {item.txs.length} {item.txs.length === 1 ? 'item' : 'itens'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 font-mono text-xs">
                        {/* Receitas */}
                        <div className="text-left sm:text-right">
                          <span className="text-[9px] font-sans font-bold text-gray-400 dark:text-gray-500 block uppercase tracking-wider">
                            Receitas
                          </span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            +R$ {item.receitas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        {/* Despesas */}
                        <div className="text-left sm:text-right">
                          <span className="text-[9px] font-sans font-bold text-gray-400 dark:text-gray-500 block uppercase tracking-wider">
                            Despesas
                          </span>
                          <span className="font-bold text-rose-600 dark:text-rose-400">
                            -R$ {item.despesas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        {/* Saldo Líquido do Período */}
                        <div className="text-right pl-1 sm:border-l sm:border-gray-200 dark:sm:border-gray-800 sm:pl-4">
                          <span className="text-[9px] font-sans font-bold text-gray-400 dark:text-gray-500 block uppercase tracking-wider">
                            Saldo
                          </span>
                          <span className={`font-bold ${
                            item.resultado >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}>
                            {item.resultado >= 0 ? '+' : ''}R$ {item.resultado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        <div className="shrink-0 text-gray-400 ml-1">
                          {isExpanded ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
                        </div>
                      </div>
                    </button>

                    {/* Expanded Transaction Items */}
                    {isExpanded && (
                      <div id={contentId} className="bg-white dark:bg-gray-900 border-t border-gray-200/80 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                        {item.txs.map((tx) => (
                          <div 
                            key={tx.id} 
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 hover:bg-gray-50/60 dark:hover:bg-gray-800/30 text-xs font-medium transition-colors gap-2"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] bg-gray-100 dark:bg-gray-800 border border-gray-200/60 dark:border-gray-700/60 px-2 py-0.5 rounded-md text-gray-600 dark:text-gray-400 font-mono font-semibold">
                                  {formatDate(tx.date)}
                                </span>
                                <span className="font-bold text-gray-900 dark:text-white">
                                  {tx.payee}
                                </span>
                              </div>
                              <span className="text-[11px] text-gray-500 dark:text-gray-400 block truncate max-w-[240px] sm:max-w-lg">
                                {tx.account && `${tx.account.name} • `}{tx.category ? tx.category.name : 'Sem categoria'} {tx.memo && `• ${tx.memo}`}
                              </span>
                            </div>

                            <span className={`font-mono font-bold text-xs sm:text-right ${
                              tx.type === 'credito' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            }`}>
                              {tx.type === 'credito' ? '+' : '-'}{formatCurrency(tx.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
