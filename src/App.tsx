import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { AccountsManager } from './components/AccountsManager.tsx';
import { CategoriesManager } from './components/CategoriesManager.tsx';
import { TagsManager } from './components/TagsManager.tsx';
import { PayeesManager } from './components/PayeesManager.tsx';
import { api } from './lib/api.ts';
import { Account, Transaction, Category, Tag, Payee } from './types.ts';
import { Wallet, RefreshCw, LogIn, CheckCircle2, ChevronRight, HelpCircle, Sun, Moon, Loader2 } from 'lucide-react';
import { ToastProvider } from './context/ToastContext.tsx';
import { motion, AnimatePresence } from 'motion/react';

// Lazy load heavy views to optimize initial bundle size and startup speed
const TransactionsManager = lazy(() => import('./components/TransactionsManager.tsx').then(m => ({ default: m.TransactionsManager })));
const RecurringBillsManager = lazy(() => import('./components/RecurringBillsManager.tsx').then(m => ({ default: m.RecurringBillsManager })));
const CashFlowForecast = lazy(() => import('./components/CashFlowForecast.tsx').then(m => ({ default: m.CashFlowForecast })));
const FinanceReport = lazy(() => import('./components/FinanceReport.tsx').then(m => ({ default: m.FinanceReport })));
const ImportWizard = lazy(() => import('./components/ImportWizard.tsx').then(m => ({ default: m.ImportWizard })));
const BackupManager = lazy(() => import('./components/BackupManager.tsx').then(m => ({ default: m.BackupManager })));

function ViewFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[360px] text-gray-400 space-y-3">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      <p className="text-xs font-medium">Carregando módulo...</p>
    </div>
  );
}

function AppContent() {
  const { user, dbUser, googleToken, loading, loginWithGoogle, refreshUserSync } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');
  const [isDark, setIsDark] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // App Data States
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurringTransactions, setRecurringTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Manage Dark Theme
  useEffect(() => {
    // Check local preferences
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const handleThemeToggle = () => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      return next;
    });
  };

  // Fetch all domain data
  const fetchAllData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    setDataError(null);
    try {
      const [accs, txs, recTxs, cats, tgs, pys] = await Promise.all([
        api.getAccounts(),
        api.getTransactions({ isRecurring: false }),
        api.getTransactions({ isRecurring: true }),
        api.getCategories(),
        api.getTags(),
        api.getPayees(),
      ]);
      setAccounts(accs);
      setTransactions(txs);
      setRecurringTransactions(recTxs);
      setCategories(cats);
      setTags(tgs);
      setPayees(pys);
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      setDataError(err.message || 'Falha ao carregar os dados do painel de controle.');
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  // Initial fetch on mount or user login change
  useEffect(() => {
    if (user) {
      fetchAllData();
    }
  }, [user, fetchAllData]);

  // Background Automated Weekly Backup Checker
  useEffect(() => {
    if (user && dbUser && dbUser.backupEnabled && googleToken) {
      const checkAndRunBackgroundBackup = async () => {
        const lastBackup = dbUser.lastBackupAt;
        let needsBackup = false;
        
        if (!lastBackup) {
          needsBackup = true;
        } else {
          const lastDate = new Date(lastBackup);
          const diffTime = Math.abs(new Date().getTime() - lastDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays >= 7) {
            needsBackup = true;
          }
        }

        if (needsBackup) {
          console.log('Automated weekly backup check: Initiating silent background backup to Google Drive...');
          try {
            const res = await api.runBackup(googleToken);
            console.log('Automated weekly backup check: Silent background backup completed successfully!', res.filename);
            refreshUserSync();
          } catch (err) {
            console.error('Automated weekly backup check: Background backup failed:', err);
          }
        }
      };

      checkAndRunBackgroundBackup();
    }
  }, [user, dbUser, googleToken, refreshUserSync]);

  // Loading Screen
  if (loading) {
    return (
      <div 
        role="status" 
        aria-live="polite" 
        className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center space-y-4"
      >
        <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin" aria-hidden="true" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Iniciando Finanças K...</p>
      </div>
    );
  }

  // Login Screen (Unauthenticated)
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-8 space-y-6 shadow-xl animate-fade-in">
          {/* Logo */}
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-3xl shadow-sm">
              <Wallet className="w-10 h-10" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Finanças K</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed">
              Gestão financeira pessoal e empresarial inspirada no KMyMoney. Banco de dados online e multiplataforma.
            </p>
          </div>

          {/* Features Checklist */}
          <div className="bg-gray-50 dark:bg-gray-950/40 border border-gray-150 dark:border-gray-850 p-4 rounded-2xl space-y-2.5">
            <div className="flex items-start gap-2.5 text-xs text-gray-700 dark:text-gray-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>Saldos de Contas Correntes calculados em tempo real</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-gray-700 dark:text-gray-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>Importador inteligente de arquivos CSV e extratos QIF</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-gray-700 dark:text-gray-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>Categorização hierárquica e controle de etiquetas</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-gray-700 dark:text-gray-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>Agenda de compromissos e cobranças recorrentes</span>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => loginWithGoogle().catch(() => {})}
            aria-label="Acessar com autenticação Google"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-5 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-emerald-600/10 cursor-pointer"
          >
            <LogIn className="w-5 h-5" aria-hidden="true" />
            Acessar com Google Auth
          </button>

          {/* Footnotes */}
          <div className="text-center text-[10px] text-gray-400">
            Armazenamento seguro persistente em Nuvem (Google Cloud Run + PostgreSQL us-west1).
          </div>
        </div>
      </div>
    );
  }

  // Render Subview inside layout
  const renderView = () => {
    if (dataError) {
      return (
        <div 
          role="alert" 
          aria-live="assertive"
          className="flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-900 border border-red-100 dark:border-red-950/40 rounded-3xl text-center shadow-lg max-w-lg mx-auto my-12 animate-fade-in"
        >
          <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-3xl mb-4">
            <HelpCircle className="w-8 h-8" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Erro ao carregar dados</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
            {dataError}
          </p>
          <button
            onClick={fetchAllData}
            aria-label="Tentar recarregar os dados novamente"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-2.5 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-600/10"
          >
            <RefreshCw className="w-4 h-4 animate-spin-once" aria-hidden="true" />
            Tentar Novamente
          </button>
        </div>
      );
    }

    switch (currentView) {
      case 'dashboard':
        return <Dashboard accounts={accounts} transactions={transactions} categories={categories} onNavigate={setCurrentView} />;
      case 'accounts':
        return <AccountsManager accounts={accounts} transactions={transactions} onRefresh={fetchAllData} />;
      case 'transactions':
        return <TransactionsManager transactions={transactions} accounts={accounts} categories={categories} tags={tags} payees={payees} onRefresh={fetchAllData} />;
      case 'categories':
        return <CategoriesManager categories={categories} onRefresh={fetchAllData} />;
      case 'tags':
        return <TagsManager tags={tags} onRefresh={fetchAllData} />;
      case 'payees':
        return <PayeesManager payees={payees} onRefresh={fetchAllData} />;
      case 'recurring':
        return <RecurringBillsManager transactions={recurringTransactions} accounts={accounts} categories={categories} tags={tags} payees={payees} onRefresh={fetchAllData} />;
      case 'forecast':
        return <CashFlowForecast accounts={accounts} transactions={[...transactions, ...recurringTransactions]} onRefresh={fetchAllData} onNavigate={setCurrentView} />;
      case 'report':
        return <FinanceReport categories={categories} transactions={transactions} onRefresh={fetchAllData} onNavigate={setCurrentView} />;
      case 'import':
        return <ImportWizard accounts={accounts} categories={categories} onRefresh={fetchAllData} />;
      case 'backup':
        return <BackupManager onRefresh={fetchAllData} />;
      default:
        return <Dashboard accounts={accounts} transactions={transactions} categories={categories} onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex transition-colors duration-200">
      {/* Mobile backdrop overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <Sidebar 
        currentView={currentView} 
        onViewChange={setCurrentView} 
        isDark={isDark} 
        onThemeToggle={handleThemeToggle} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content Stage */}
      <main className="flex-1 lg:pl-64 pl-0 min-h-screen relative flex flex-col w-full min-w-0">
        {/* Mobile Header Bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-20 transition-colors duration-200">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl cursor-pointer"
              id="sidebar-toggle"
              aria-label="Abrir Menu de Navegação"
              aria-expanded={isSidebarOpen}
              aria-controls="main-sidebar"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-500" aria-hidden="true" />
              <span className="font-bold text-sm text-gray-900 dark:text-white font-sans">Finanças K</span>
            </div>
          </div>
          
          <button
            onClick={handleThemeToggle}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl cursor-pointer"
            aria-label={isDark ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-500" aria-hidden="true" /> : <Moon className="w-4 h-4 text-blue-600" aria-hidden="true" />}
          </button>
        </header>

        {/* Loading overlay for background refreshes */}
        {dataLoading && (
          <div 
            role="status" 
            aria-live="polite"
            className="absolute top-4 right-4 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xs border border-gray-200 dark:border-gray-800 shadow-md rounded-xl py-1.5 px-3 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 z-50"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>Sincronizando dados...</span>
          </div>
        )}

        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full flex-1">
          <Suspense fallback={<ViewFallback />}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentView}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
