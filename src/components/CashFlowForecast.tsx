import React, { useState, useMemo } from 'react';
import { Account, Transaction } from '../types.ts';
import { formatCurrency, formatDate } from '../lib/utils.ts';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  HelpCircle, 
  Info, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ChevronRight, 
  ChevronDown, 
  Layers,
  LineChart as LineIcon,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  Eye,
  EyeOff,
  Table,
  ListFilter,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  ReferenceLine
} from 'recharts';

interface CashFlowForecastProps {
  accounts: Account[];
  transactions: Transaction[];
  onRefresh: () => Promise<void>;
  onNavigate?: (view: string) => void;
}

interface EventOccurrence {
  date: string;
  amount: number;
  type: 'debito' | 'credito';
  payee: string;
  categoryName: string;
  accountId: number;
  isRecurring: boolean;
  isOverdue?: boolean;
}

export const CashFlowForecast: React.FC<CashFlowForecastProps> = ({
  accounts,
  transactions,
  onRefresh,
  onNavigate
}) => {
  const [projectionDays, setProjectionDays] = useState<number>(15);
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [isChartVisible, setIsChartVisible] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');
  const [eventFilter, setEventFilter] = useState<'all' | 'credito' | 'debito' | 'recurring'>('all');

  // Toggle groups in the KMyMoney grid
  const [isTotalExpanded, setIsTotalExpanded] = useState(true);
  const [isAssetsExpanded, setIsAssetsExpanded] = useState(true);
  const [isLiabilitiesExpanded, setIsLiabilitiesExpanded] = useState(true);

  // Date utility to format to YYYY-MM-DD
  const formatDateToString = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = useMemo(() => {
    return formatDateToString(new Date());
  }, []);

  // 1. Calculate actual balances up to today for each account (excluding scheduled/recurring items)
  const accountTodayBalances = useMemo(() => {
    const balances: { [accountId: number]: number } = {};
    accounts.forEach(acc => {
      let bal = acc.initialBalance;
      // All non-recurring actual transactions up to today (excluding scheduled [Agendado] items)
      const accTxs = transactions.filter(t => 
        t.accountId === acc.id && 
        !t.isRecurring && 
        !(t.memo && t.memo.includes('[Agendado]')) && 
        t.date <= todayStr
      );
      accTxs.forEach(t => {
        if (t.type === 'credito') {
          bal += t.amount;
        } else if (t.type === 'debito') {
          bal -= t.amount;
        }
      });
      balances[acc.id] = bal;
    });
    return balances;
  }, [accounts, transactions, todayStr]);

  // 2. Generate date range for projection: [today (Day 0), Day 1, ..., Day N]
  const dateStrings = useMemo(() => {
    const dates: string[] = [];
    const today = new Date();
    for (let i = 0; i <= projectionDays; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      dates.push(formatDateToString(d));
    }
    return dates;
  }, [projectionDays]);

  // 3. Generate all events (recurring occurrences & future actual transactions) within the projection period
  const futureEvents = useMemo(() => {
    const events: EventOccurrence[] = [];
    const endDateStr = dateStrings[dateStrings.length - 1]; // End of projection

    if (!endDateStr) return events;

    // A. Filter recurring templates (isRecurring === true)
    const recurringTemplates = transactions.filter(t => t.isRecurring && (t.nextDueDate || t.date));

    recurringTemplates.forEach(t => {
      if (t.remainingOccurrences === 0) return;

      const initialDueDate = t.nextDueDate || t.date;
      if (!initialDueDate) return;
      
      let curr = new Date(initialDueDate + 'T12:00:00');
      const end = new Date(endDateStr + 'T12:00:00');
      
      let overdueSum = 0;
      let occurrencesGenerated = 0;
      const maxOccurrences = t.remainingOccurrences !== null && t.remainingOccurrences !== undefined && t.remainingOccurrences > 0
        ? t.remainingOccurrences
        : 365;
      
      while (curr <= end && occurrencesGenerated < maxOccurrences) {
        occurrencesGenerated++;
        const currStr = formatDateToString(curr);
        
        if (currStr < todayStr) {
          // Overdue transaction occurrence from template
          overdueSum += t.amount;
        } else {
          // Future or today's transaction occurrence
          events.push({
            date: currStr,
            amount: t.amount,
            type: t.type,
            payee: t.payee,
            categoryName: t.category?.name || 'Recorrente',
            accountId: t.accountId,
            isRecurring: true,
            isOverdue: false
          });
        }

        // Advance date according to recurrence interval
        if (t.recurrenceInterval === 'diario') {
          curr.setDate(curr.getDate() + 1);
        } else if (t.recurrenceInterval === 'semanal') {
          curr.setDate(curr.getDate() + 7);
        } else if (t.recurrenceInterval === 'quinzenal') {
          curr.setDate(curr.getDate() + 14);
        } else if (t.recurrenceInterval === 'mensal') {
          curr.setMonth(curr.getMonth() + 1);
        } else if (t.recurrenceInterval === 'anual') {
          curr.setFullYear(curr.getFullYear() + 1);
        } else {
          break; // Single future template or unknown
        }
      }

      // If there is any overdue sum, aggregate as a single combined item today
      if (overdueSum > 0) {
        events.push({
          date: todayStr,
          amount: overdueSum,
          type: t.type,
          payee: `[Atrasado] ${t.payee}`,
          categoryName: t.category?.name || 'Recorrente',
          accountId: t.accountId,
          isRecurring: true,
          isOverdue: true
        });
      }
    });

    // B. Add single non-recurring scheduled agenda items (memo contains [Agendado]) with future dates
    const scheduledSingleTxs = transactions.filter(t => 
      !t.isRecurring && 
      t.memo && 
      t.memo.includes('[Agendado]') && 
      t.date > todayStr && 
      t.date <= endDateStr
    );

    scheduledSingleTxs.forEach(t => {
      events.push({
        date: t.date,
        amount: t.amount,
        type: t.type,
        payee: t.payee,
        categoryName: t.category?.name || 'Agendado',
        accountId: t.accountId,
        isRecurring: true,
        isOverdue: false
      });
    });

    // C. Add actual future-dated non-recurring transactions
    const futureActuals = transactions.filter(t => 
      !t.isRecurring && 
      !(t.memo && t.memo.includes('[Agendado]')) && 
      t.date > todayStr && 
      t.date <= endDateStr
    );

    futureActuals.forEach(t => {
      events.push({
        date: t.date,
        amount: t.amount,
        type: t.type,
        payee: t.payee,
        categoryName: t.category?.name || 'Geral',
        accountId: t.accountId,
        isRecurring: false,
        isOverdue: false
      });
    });

    // Sort chronologically
    return events.sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions, dateStrings, todayStr]);

  // 4. Compute daily balances for each account and group totals
  const dailyBalances = useMemo(() => {
    const map: { [date: string]: { [accountId: number]: number } } = {};

    // Initialize Day 0 (Hoje) balances
    const dayZero = dateStrings[0];
    map[dayZero] = { ...accountTodayBalances };

    // Apply simulated events on Day 0 (Hoje) so they are reflected in today's projection balance
    const todayEvents = futureEvents.filter(e => e.date === dayZero);
    todayEvents.forEach(e => {
      if (map[dayZero][e.accountId] !== undefined) {
        if (e.type === 'credito') {
          map[dayZero][e.accountId] += e.amount;
        } else if (e.type === 'debito') {
          map[dayZero][e.accountId] -= e.amount;
        }
      }
    });

    // Advance day by day to calculate running balances
    for (let i = 1; i < dateStrings.length; i++) {
      const prevDay = dateStrings[i - 1];
      const currDay = dateStrings[i];
      
      // Start with previous day's balances
      map[currDay] = { ...map[prevDay] };

      // Filter events on this specific day
      const dayEvents = futureEvents.filter(e => e.date === currDay);

      // Apply changes to balances
      dayEvents.forEach(e => {
        if (map[currDay][e.accountId] !== undefined) {
          if (e.type === 'credito') {
            map[currDay][e.accountId] += e.amount;
          } else if (e.type === 'debito') {
            map[currDay][e.accountId] -= e.amount;
          }
        }
      });
    }

    return map;
  }, [dateStrings, accountTodayBalances, futureEvents]);

  // Filter accounts and prepare group classifications
  const assetsAccounts = useMemo(() => {
    return accounts.filter(acc => (accountTodayBalances[acc.id] ?? 0) >= 0);
  }, [accounts, accountTodayBalances]);

  const liabilitiesAccounts = useMemo(() => {
    return accounts.filter(acc => (accountTodayBalances[acc.id] ?? 0) < 0);
  }, [accounts, accountTodayBalances]);

  // Compute values for rendering groups and charts
  const projectionData = useMemo(() => {
    return dateStrings.map(date => {
      let totalAssets = 0;
      let totalLiabilities = 0;
      let totalFiltered = 0;

      accounts.forEach(acc => {
        const bal = dailyBalances[date]?.[acc.id] ?? 0;
        
        // Group values
        if (assetsAccounts.some(a => a.id === acc.id)) {
          totalAssets += bal;
        } else {
          totalLiabilities += bal;
        }

        // Filtered account value
        if (filterAccount === 'all' || String(acc.id) === filterAccount) {
          totalFiltered += bal;
        }
      });

      return {
        date,
        formattedDate: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'short'
        }),
        assets: totalAssets,
        liabilities: totalLiabilities,
        total: totalAssets + totalLiabilities,
        filtered: totalFiltered,
        rawTotal: totalAssets + totalLiabilities
      };
    });
  }, [dateStrings, accounts, dailyBalances, assetsAccounts, filterAccount]);

  // Statistics summaries
  const stats = useMemo(() => {
    if (projectionData.length === 0) return { start: 0, end: 0, min: 0, max: 0, variation: 0, minDate: '' };
    
    const start = projectionData[0].filtered;
    const end = projectionData[projectionData.length - 1].filtered;
    const variation = end - start;
    
    const allFilteredVals = projectionData.map(d => d.filtered);
    const min = Math.min(...allFilteredVals);
    const max = Math.max(...allFilteredVals);

    const minItem = projectionData.find(d => d.filtered === min);
    const minDate = minItem ? minItem.date : '';

    return {
      start,
      end,
      min,
      max,
      variation,
      minDate
    };
  }, [projectionData]);

  // Projected Incomes vs Expenses in this horizon
  const { totalFutureIncomes, totalFutureExpenses } = useMemo(() => {
    let incomes = 0;
    let expenses = 0;
    const relevantEvents = filterAccount === 'all' 
      ? futureEvents 
      : futureEvents.filter(e => String(e.accountId) === filterAccount);

    relevantEvents.forEach(e => {
      if (e.type === 'credito') incomes += e.amount;
      else expenses += e.amount;
    });

    return { totalFutureIncomes: incomes, totalFutureExpenses: expenses };
  }, [futureEvents, filterAccount]);

  // Detect first critical negative day if any
  const criticalNegativeDay = useMemo(() => {
    const firstNeg = projectionData.find(d => d.filtered < 0);
    return firstNeg ? firstNeg.date : null;
  }, [projectionData]);

  // Portuguese weekday capitalization helper
  const capitalizeWeekday = (str: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const getPTColumnHeader = (dateStr: string, index: number) => {
    if (index === 0) return 'Hoje (Atual)';
    const d = new Date(dateStr + 'T12:00:00');
    const parts = d.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
    return capitalizeWeekday(parts);
  };

  // Helper to format currency for cells (KMyMoney standard)
  const formatCellAmount = (val: number) => {
    const formatted = formatCurrency(val);
    return val < 0 ? (
      <span className="text-rose-700 dark:text-rose-400 font-bold font-mono">
        {formatted}
      </span>
    ) : (
      <span className="text-gray-900 dark:text-gray-100 font-medium font-mono">
        {formatted}
      </span>
    );
  };

  // Filter events for the agenda timeline
  const displayedEvents = useMemo(() => {
    let list = filterAccount === 'all' 
      ? futureEvents 
      : futureEvents.filter(e => String(e.accountId) === filterAccount);

    if (eventFilter === 'credito') {
      list = list.filter(e => e.type === 'credito');
    } else if (eventFilter === 'debito') {
      list = list.filter(e => e.type === 'debito');
    } else if (eventFilter === 'recurring') {
      list = list.filter(e => e.isRecurring);
    }

    return list;
  }, [futureEvents, filterAccount, eventFilter]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 tabIndex={-1} data-page-heading className="outline-none text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Calendar className="w-7 h-7 text-emerald-700 dark:text-emerald-500 shrink-0" />
            Previsão de Fluxo de Caixa
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Simulação de saldos futuros com base em compromissos recorrentes e lançamentos agendados
          </p>
        </div>

        {/* Filter controls & horizon switcher */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          {/* Account selector */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl py-1 px-3 shadow-xs text-xs font-semibold">
            <Filter className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
            <label htmlFor="forecast-filter-account" className="text-gray-500 dark:text-gray-400 font-medium">
              Conta:
            </label>
            <select
              id="forecast-filter-account"
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="bg-transparent border-0 py-1 pl-1 pr-6 text-gray-800 dark:text-gray-200 font-bold cursor-pointer focus:ring-0 outline-none rounded-lg"
            >
              <option value="all">Consolidado (Todas as Contas)</option>
              {accounts.map(acc => (
                <option key={acc.id} value={String(acc.id)}>{acc.name}</option>
              ))}
            </select>
          </div>

          {/* Period Selection */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800/80 border border-gray-200/60 dark:border-gray-700/60 rounded-xl p-1 text-xs font-semibold" role="group" aria-label="Período de projeção em dias">
            {[7, 15, 30, 60].map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={projectionDays === days}
                onClick={() => setProjectionDays(days)}
                className={`px-3 py-1 rounded-lg cursor-pointer transition-all font-bold ${
                  projectionDays === days
                    ? 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>

          {/* Toggle visual chart */}
          <button
            type="button"
            onClick={() => setIsChartVisible(!isChartVisible)}
            aria-pressed={isChartVisible}
            aria-label={isChartVisible ? "Ocultar gráfico de tendência" : "Exibir gráfico de tendência"}
            className={`p-2 rounded-xl border transition-all cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              isChartVisible
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-800 dark:hover:bg-gray-800'
            }`}
            title="Alternar Visibilidade do Gráfico"
          >
            <LineIcon className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 2. Critical Alert Banner (Highlights days in red or confirms safety) */}
      {criticalNegativeDay ? (
        <div className="p-4 sm:p-5 bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-3xl shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-slide-down">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 rounded-2xl shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                Alerta de Caixa: Risco de Saldo Negativo
              </h3>
              <p className="text-xs text-rose-700 dark:text-rose-300">
                O saldo projetado entrará no vermelho a partir de <strong>{formatDate(criticalNegativeDay)}</strong>, atingindo a mínima de <strong className="font-mono">{formatCurrency(stats.min)}</strong> em {stats.minDate ? formatDate(stats.minDate) : ''}. Considere antecipar recebimentos ou reagendar despesas.
              </p>
            </div>
          </div>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('recurring')}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shrink-0 self-end sm:self-auto cursor-pointer shadow-xs"
            >
              Revisar Contas Recorrentes
            </button>
          )}
        </div>
      ) : (
        <div className="p-3.5 sm:p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50 rounded-2xl flex items-center justify-between gap-3 text-xs text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span>
              <strong>Fluxo Positivo:</strong> O saldo projetado permanece seguro e positivo ao longo de todo o período de {projectionDays} dias.
            </span>
          </div>
          <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300 hidden sm:inline">
            Mínima: {formatCurrency(stats.min)}
          </span>
        </div>
      )}

      {/* 3. Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Saldo Inicial */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Saldo Inicial (Hoje)
            </span>
            <span className={`text-xl font-black font-mono block ${stats.start >= 0 ? 'text-gray-900 dark:text-white' : 'text-rose-700 dark:text-rose-400'}`}>
              {formatCurrency(stats.start)}
            </span>
            <span className="text-xs text-gray-500 block">Ponto de partida atual</span>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-850 rounded-2xl text-gray-500">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Saldo Final Previsto */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Saldo Final Previsto (+{projectionDays}d)
            </span>
            <span className={`text-xl font-black font-mono block ${stats.end >= 0 ? 'text-gray-900 dark:text-white' : 'text-rose-700 dark:text-rose-400'}`}>
              {formatCurrency(stats.end)}
            </span>
            <span className={`text-xs font-mono font-bold flex items-center gap-1 ${
              stats.variation >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
            }`}>
              {stats.variation >= 0 ? '+' : ''}{formatCurrency(stats.variation)} ({stats.start > 0 ? `${Math.round((stats.variation / stats.start) * 100)}%` : '—'})
            </span>
          </div>
          <div className={`p-3 rounded-2xl ${
            stats.end >= stats.start
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400'
          }`}>
            {stats.end >= stats.start ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          </div>
        </div>

        {/* Entradas e Saídas Futuras */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Movimentação Futura
            </span>
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                +{formatCurrency(totalFutureIncomes)}
              </span>
              <span className="text-gray-300 dark:text-gray-600">/</span>
              <span className="text-rose-700 dark:text-rose-400 font-bold">
                -{formatCurrency(totalFutureExpenses)}
              </span>
            </div>
            <span className="text-xs text-gray-500 block">
              {futureEvents.length} compromissos agendados
            </span>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-850 rounded-2xl text-gray-500">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Ponto Crítico / Menor Saldo */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Menor Saldo do Período
            </span>
            <span className={`text-xl font-black font-mono block ${stats.min >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
              {formatCurrency(stats.min)}
            </span>
            <span className="text-xs text-gray-500 block">
              Ocorrência em: {stats.minDate ? formatDate(stats.minDate) : '—'}
            </span>
          </div>
          <div className={`p-3 rounded-2xl ${
            stats.min < 0 
              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' 
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
          }`}>
            {stats.min < 0 ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          </div>
        </div>
      </div>

      {/* 4. Recharts Area Chart */}
      {isChartVisible && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Curva de Tendência de Saldo Diário
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                Projeção cumulativa para {projectionDays} dias ({filterAccount === 'all' ? 'Todas as Contas' : accounts.find(a => String(a.id) === filterAccount)?.name})
              </p>
            </div>
          </div>

          <div
            className="h-[250px] w-full"
            role="img"
            aria-label={`Gráfico de saldo previsto para ${projectionDays} dias: começa em ${formatCurrency(stats.start)}, termina em ${formatCurrency(stats.end)}, mínimo de ${formatCurrency(stats.min)}${stats.minDate ? ` em ${stats.minDate.split('-').reverse().join('/')}` : ''} e máximo de ${formatCurrency(stats.max)}. Os valores diários estão na planilha de saldos projetados abaixo.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02}/>
                  </linearGradient>
                  <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100 dark:stroke-gray-800" vertical={false} />
                <XAxis 
                  dataKey="formattedDate" 
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                />
                <YAxis 
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${(v / 100).toFixed(0)}`}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                />
                <Tooltip 
                  formatter={(value: any) => [formatCurrency(Number(value)), 'Saldo Previsto']}
                  labelFormatter={(label) => `Data: ${label}`}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.96)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '16px',
                    fontSize: '11px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    color: '#0f172a'
                  }}
                  itemStyle={{ color: '#0f172a', fontWeight: 'bold' }}
                />
                <ReferenceLine y={0} stroke="#e11d48" strokeDasharray="3 3" opacity={0.7} />
                <Area 
                  type="monotone" 
                  dataKey="filtered" 
                  stroke={stats.min < 0 ? "#f43f5e" : "#10b981"} 
                  strokeWidth={2.5}
                  fillOpacity={1} 
                  fill={stats.min < 0 ? "url(#colorNegative)" : "url(#colorTotal)"} 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 5. The KMyMoney Style Balance Grid with Mobile-Friendly View Mode Switcher */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl overflow-hidden shadow-xs">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              Planilha de Saldos Projetados (KMyMoney Style)
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Evolução diária dos saldos por conta. Valores negativos destacados em vermelho.
            </p>
          </div>

          {/* View mode buttons for mobile comfort */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl self-start sm:self-auto border border-gray-200/60 dark:border-gray-700/60 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              className={`px-3 py-1 font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              Grade Completa
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              aria-pressed={viewMode === 'timeline'}
              className={`px-3 py-1 font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              Visão Diária
            </button>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <>
            <div className="block sm:hidden text-center py-1.5 text-xs text-gray-500 bg-emerald-50/40 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/30">
              ← Deslize horizontalmente para navegar entre as datas →
            </div>

            {/* Scrollable grid container */}
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela com rolagem horizontal">
              <table className="w-full border-collapse border-spacing-0" aria-label="Planilha de Saldos Projetados">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
                    {/* Sticky Left Column */}
                    <th scope="col" className="sticky left-0 bg-gray-50 dark:bg-gray-950 border-r border-b border-gray-200 dark:border-gray-800 text-left py-3 px-4 text-xs font-bold uppercase text-gray-500 dark:text-gray-400 tracking-wider z-20 min-w-[190px] shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                      Conta
                    </th>
                    {dateStrings.map((date, idx) => (
                      <th key={date} scope="col" className="py-3 px-4 border-b border-r border-gray-150 dark:border-gray-800 text-center font-bold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[140px]">
                        {getPTColumnHeader(date, idx)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Row: TOTAL (Top of grid) */}
                  <tr className="bg-emerald-50/20 dark:bg-emerald-950/15 font-bold border-b border-gray-200 dark:border-gray-800">
                    <td className="sticky left-0 bg-emerald-50/95 dark:bg-emerald-950/80 border-r border-b border-gray-200 dark:border-gray-800 py-2 px-3 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                      <button
                        type="button"
                        onClick={() => setIsTotalExpanded(!isTotalExpanded)}
                        aria-expanded={isTotalExpanded}
                        aria-label={isTotalExpanded ? "Recolher grupo Total" : "Expandir grupo Total"}
                        className="w-full flex items-center gap-1.5 text-left text-xs text-gray-900 dark:text-white font-bold cursor-pointer rounded-lg p-2 hover:bg-emerald-100/40 dark:hover:bg-emerald-950/50"
                      >
                        {isTotalExpanded ? <ChevronDown className="w-4 h-4 text-emerald-700 shrink-0 dark:text-emerald-400" aria-hidden="true" /> : <ChevronRight className="w-4 h-4 text-emerald-700 shrink-0 dark:text-emerald-400" aria-hidden="true" />}
                        <span>Total Geral</span>
                      </button>
                    </td>
                    {dateStrings.map(date => {
                      let cellTotal = 0;
                      accounts.forEach(acc => {
                        cellTotal += dailyBalances[date]?.[acc.id] ?? 0;
                      });
                      return (
                        <td key={date} className="py-2.5 px-4 text-center border-r border-b border-gray-150 dark:border-gray-800 text-xs font-mono">
                          {formatCellAmount(cellTotal)}
                        </td>
                      );
                    })}
                  </tr>

                  {isTotalExpanded && (
                    <>
                      {/* Row Group: ATIVO */}
                      <tr className="bg-gray-50/50 dark:bg-gray-850/30 border-b border-gray-150 dark:border-gray-800">
                        <td className="sticky left-0 bg-gray-50/95 dark:bg-gray-850/95 border-r border-b border-gray-200 dark:border-gray-800 py-1.5 px-3 z-10 pl-6 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                          <button
                            type="button"
                            onClick={() => setIsAssetsExpanded(!isAssetsExpanded)}
                            aria-expanded={isAssetsExpanded}
                            aria-label={isAssetsExpanded ? "Recolher grupo Ativo" : "Expandir grupo Ativo"}
                            className="w-full flex items-center gap-1.5 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide cursor-pointer rounded-lg p-2 hover:bg-gray-100/50 dark:hover:bg-gray-800"
                          >
                            {isAssetsExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" />}
                            <span>Ativo ({assetsAccounts.length})</span>
                          </button>
                        </td>
                        {dateStrings.map(date => {
                          let groupSum = 0;
                          assetsAccounts.forEach(acc => {
                            groupSum += dailyBalances[date]?.[acc.id] ?? 0;
                          });
                          return (
                            <td key={date} className="py-2 px-4 text-center border-r border-b border-gray-150 dark:border-gray-800 text-xs font-mono font-bold bg-gray-50/10 dark:bg-gray-850/5">
                              {formatCellAmount(groupSum)}
                            </td>
                          );
                        })}
                      </tr>

                      {/* Indented Asset Accounts */}
                      {isAssetsExpanded && assetsAccounts.map(acc => (
                        <tr key={acc.id} className="hover:bg-gray-50/40 dark:hover:bg-gray-850/20 border-b border-gray-100 dark:border-gray-800 transition-colors">
                          <td className="sticky left-0 bg-white dark:bg-gray-900 border-r border-b border-gray-150 dark:border-gray-800 py-2 px-4 pl-12 text-xs font-medium text-gray-700 dark:text-gray-300 z-10 truncate max-w-[190px] shadow-[2px_0_5px_rgba(0,0,0,0.01)]">
                            {acc.name}
                          </td>
                          {dateStrings.map(date => {
                            const cellVal = dailyBalances[date]?.[acc.id] ?? 0;
                            return (
                              <td key={date} className="py-2 px-4 text-center border-r border-b border-gray-100 dark:border-gray-800 text-xs font-mono">
                                {formatCellAmount(cellVal)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}

                      {/* Row Group: PASSIVO */}
                      <tr className="bg-gray-50/50 dark:bg-gray-850/30 border-b border-gray-150 dark:border-gray-800">
                        <td className="sticky left-0 bg-gray-50/95 dark:bg-gray-850/95 border-r border-b border-gray-200 dark:border-gray-800 py-1.5 px-3 z-10 pl-6 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                          <button
                            type="button"
                            onClick={() => setIsLiabilitiesExpanded(!isLiabilitiesExpanded)}
                            aria-expanded={isLiabilitiesExpanded}
                            aria-label={isLiabilitiesExpanded ? "Recolher grupo Passivo" : "Expandir grupo Passivo"}
                            className="w-full flex items-center gap-1.5 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide cursor-pointer rounded-lg p-2 hover:bg-gray-100/50 dark:hover:bg-gray-800"
                          >
                            {isLiabilitiesExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" />}
                            <span>Passivo ({liabilitiesAccounts.length})</span>
                          </button>
                        </td>
                        {dateStrings.map(date => {
                          let groupSum = 0;
                          liabilitiesAccounts.forEach(acc => {
                            groupSum += dailyBalances[date]?.[acc.id] ?? 0;
                          });
                          return (
                            <td key={date} className="py-2 px-4 text-center border-r border-b border-gray-150 dark:border-gray-800 text-xs font-mono font-bold bg-gray-50/10 dark:bg-gray-850/5">
                              {formatCellAmount(groupSum)}
                            </td>
                          );
                        })}
                      </tr>

                      {/* Indented Liability Accounts */}
                      {isLiabilitiesExpanded && liabilitiesAccounts.map(acc => (
                        <tr key={acc.id} className="hover:bg-gray-50/40 dark:hover:bg-gray-850/20 border-b border-gray-100 dark:border-gray-800 transition-colors">
                          <td className="sticky left-0 bg-white dark:bg-gray-900 border-r border-b border-gray-150 dark:border-gray-800 py-2 px-4 pl-12 text-xs font-medium text-gray-700 dark:text-gray-300 z-10 truncate max-w-[190px] shadow-[2px_0_5px_rgba(0,0,0,0.01)]">
                            {acc.name}
                          </td>
                          {dateStrings.map(date => {
                            const cellVal = dailyBalances[date]?.[acc.id] ?? 0;
                            return (
                              <td key={date} className="py-2 px-4 text-center border-r border-b border-gray-100 dark:border-gray-800 text-xs font-mono">
                                {formatCellAmount(cellVal)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          /* Mobile Timeline Cards view */
          <div className="p-5 space-y-3 max-h-[420px] overflow-y-auto">
            {projectionData.map((d, index) => {
              const dayEvents = futureEvents.filter(e => e.date === d.date);
              const isNegative = d.filtered < 0;

              return (
                <div 
                  key={d.date} 
                  className={`p-4 rounded-2xl border transition-all ${
                    isNegative 
                      ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60' 
                      : 'bg-gray-50/60 dark:bg-gray-850/30 border-gray-200/70 dark:border-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-gray-900 dark:text-white">
                        {getPTColumnHeader(d.date, index)}
                      </span>
                      <span className="text-xs text-gray-500 block font-mono">
                        {formatDate(d.date)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                        Saldo Projetado
                      </span>
                      <span className={`text-sm font-bold font-mono ${isNegative ? 'text-rose-700 dark:text-rose-400' : 'text-gray-900 dark:text-white'}`}>
                        {formatCurrency(d.filtered)}
                      </span>
                    </div>
                  </div>

                  {dayEvents.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-gray-200/50 dark:border-gray-800 space-y-1.5">
                      {dayEvents.map((ev, evIdx) => (
                        <div key={evIdx} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className={`w-1.5 h-1.5 rounded-full ${ev.type === 'credito' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <span className="text-gray-700 dark:text-gray-300 font-medium truncate">
                              {ev.payee}
                            </span>
                            {ev.isRecurring && (
                              <span className="text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.2 rounded font-semibold">
                                Recorrente
                              </span>
                            )}
                          </div>
                          <span className={`font-mono font-bold shrink-0 ${ev.type === 'credito' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                            {ev.type === 'credito' ? '+' : '-'}{formatCurrency(ev.amount)}
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

      {/* 6. Chronological events list */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl overflow-hidden shadow-xs p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              Agenda Cronológica de Eventos ({projectionDays} Dias)
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Todos os compromissos futuros, repetições agendadas e parcelas detectadas
            </p>
          </div>

          {/* Event Filters */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-xs font-semibold self-start sm:self-auto border border-gray-200/60 dark:border-gray-700/60">
            <button
              type="button"
              onClick={() => setEventFilter('all')}
              aria-pressed={eventFilter === 'all'}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                eventFilter === 'all'
                  ? 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              Todos ({futureEvents.length})
            </button>
            <button
              type="button"
              onClick={() => setEventFilter('credito')}
              aria-pressed={eventFilter === 'credito'}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                eventFilter === 'credito'
                  ? 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              Entradas
            </button>
            <button
              type="button"
              onClick={() => setEventFilter('debito')}
              aria-pressed={eventFilter === 'debito'}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                eventFilter === 'debito'
                  ? 'bg-white dark:bg-gray-900 text-rose-700 shadow-xs dark:text-rose-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              Saídas
            </button>
            <button
              type="button"
              onClick={() => setEventFilter('recurring')}
              aria-pressed={eventFilter === 'recurring'}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                eventFilter === 'recurring'
                  ? 'bg-white dark:bg-gray-900 text-amber-700 shadow-xs dark:text-amber-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              Recorrentes
            </button>
          </div>
        </div>
        
        {displayedEvents.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-500 bg-gray-50 dark:bg-gray-850/50 rounded-2xl border border-gray-150 dark:border-gray-800 flex flex-col items-center justify-center gap-2 p-4">
            <Info className="w-5 h-5 text-gray-500" />
            <p className="font-semibold text-gray-700 dark:text-gray-300">
              Nenhuma movimentação encontrada para o filtro selecionado nos próximos {projectionDays} dias.
            </p>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('recurring')}
                className="mt-2 text-emerald-700 dark:text-emerald-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>Cadastrar Contas Recorrentes</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {displayedEvents.map((e, idx) => {
              const account = accounts.find(acc => acc.id === e.accountId);
              const formattedDate = new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                weekday: 'short',
                day: '2-digit',
                month: 'short'
              });
              
              return (
                <div 
                  key={idx}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-gray-50/70 dark:bg-gray-850/40 border border-gray-150 dark:border-gray-800 rounded-2xl hover:border-emerald-500/30 dark:hover:border-emerald-500/30 transition-all gap-2.5"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="font-mono text-xs font-bold bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-750 text-gray-600 dark:text-gray-300 px-2.5 py-1 rounded-xl shadow-2xs text-center shrink-0 min-w-[95px]">
                      {formattedDate}
                    </span>
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                        {e.payee}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">{e.categoryName}</span>
                        <span>•</span>
                        <span className="truncate">{account?.name || 'Conta desconhecida'}</span>
                        {e.isOverdue && (
                          <>
                            <span>•</span>
                            <span className="bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 font-bold px-1.5 py-0.2 rounded-md text-xs">
                              Atrasado
                            </span>
                          </>
                        )}
                        {e.isRecurring && !e.isOverdue && (
                          <>
                            <span>•</span>
                            <span className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 font-bold px-1.5 py-0.2 rounded-md text-xs">
                              Recorrente
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right shrink-0">
                    <span className={`font-mono font-bold text-xs ${
                      e.type === 'credito' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                    }`}>
                      {e.type === 'credito' ? '+' : '-'}{formatCurrency(e.amount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
