import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { MobileNav } from './components/MobileNav.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { AccountsManager } from './components/AccountsManager.tsx';
import { CategoriesManager } from './components/CategoriesManager.tsx';
import { TagsManager } from './components/TagsManager.tsx';
import { PayeesManager } from './components/PayeesManager.tsx';
import { Wallet, RefreshCw, LogIn, CheckCircle2, AlertTriangle, Sun, Moon, Search } from 'lucide-react';
import { useHashView } from './hooks/useHashView.ts';
import { useTheme } from './hooks/useTheme.ts';
import { useFinanceData, queryClient, prefetchView } from './hooks/useFinanceData.ts';
import { useModalFocusManager } from './hooks/useModalFocusManager.ts';
import { ViewId, getNavItem } from './lib/navigation.ts';
import { api } from './lib/api.ts';

// Lazy load heavy views to optimize initial bundle size and startup speed
const TransactionsManager = lazy(() => import('./components/TransactionsManager.tsx').then(m => ({ default: m.TransactionsManager })));
const RecurringBillsManager = lazy(() => import('./components/RecurringBillsManager.tsx').then(m => ({ default: m.RecurringBillsManager })));
const CashFlowForecast = lazy(() => import('./components/CashFlowForecast.tsx').then(m => ({ default: m.CashFlowForecast })));
const FinanceReport = lazy(() => import('./components/FinanceReport.tsx').then(m => ({ default: m.FinanceReport })));
const ImportWizard = lazy(() => import('./components/ImportWizard.tsx').then(m => ({ default: m.ImportWizard })));
const BackupManager = lazy(() => import('./components/BackupManager.tsx').then(m => ({ default: m.BackupManager })));

/** Placeholder shaped like a screen (title, KPI cards, list) while data or code loads. */
function ViewSkeleton({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-6 animate-pulse">
      <span className="sr-only">{label}</span>
      <div className="h-8 w-56 rounded-xl bg-gray-200 dark:bg-gray-800" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-gray-200/80 dark:bg-gray-800/80" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-gray-200/60 dark:bg-gray-800/60" />
    </div>
  );
}

function AppContent() {
  const { user, dbUser, googleToken, loading, loginWithGoogle, refreshUserSync } = useAuth();
  const [currentView, setCurrentView] = useHashView();
  const { preference: themePreference, isDark, setPreference: setThemePreference } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const lastView = useRef<ViewId>(currentView);

  useModalFocusManager();

  const {
    accounts,
    transactions,
    recurringTransactions,
    allTransactions,
    categories,
    tags,
    payees,
    isLoading: dataLoading,
    isFetching,
    error: dataError,
    refresh: fetchAllData,
  } = useFinanceData(currentView, !!user);

  // Drop cached data when the user signs out
  useEffect(() => {
    if (!user) queryClient.clear();
  }, [user]);

  // Page title, screen-reader announcement and focus on the new screen's heading (WCAG 2.4.2 / 2.4.3)
  useEffect(() => {
    const name = getNavItem(currentView).name;
    document.title = `${name} · Finanças K`;
    if (lastView.current === currentView) return; // initial load: leave focus at the top of the page
    lastView.current = currentView;
    setAnnouncement(`Tela ${name} aberta`);
    window.scrollTo({ top: 0 });
    // Lazy screens render their heading a little later: keep looking for up to ~2s
    let frame = 0;
    let tries = 0;
    const focusHeading = () => {
      const heading = document.querySelector<HTMLElement>(`#conteudo [data-view="${currentView}"] [data-page-heading]`);
      // Wait while a closing dialog still keeps the page inert
      if (heading && !heading.closest('[inert]') && heading.offsetParent !== null) heading.focus({ preventScroll: true });
      else if (tries++ < 120) frame = requestAnimationFrame(focusHeading);
    };
    frame = requestAnimationFrame(focusHeading);
    return () => cancelAnimationFrame(frame);
  }, [currentView]);

  // Ctrl+K / ⌘K opens the quick switcher
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen((wasOpen) => {
      if (wasOpen) requestAnimationFrame(() => menuButtonRef.current?.focus());
      return false;
    });
  }, []);

  const handlePrefetch = useCallback((view: ViewId) => {
    if (user) prefetchView(queryClient, view);
  }, [user]);

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

  // Loading Screen: show the app's shape right away instead of a blank spinner
  if (loading) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex">
        <div className="hidden lg:block w-64 shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900" aria-hidden="true" />
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          <ViewSkeleton label="Iniciando Finanças K…" />
        </div>
      </div>
    );
  }

  // Login Screen (Unauthenticated)
  if (!user) {
    return (
      <main className="min-h-dvh bg-gradient-to-br from-emerald-50 via-gray-50 to-teal-50 dark:from-gray-950 dark:via-gray-950 dark:to-emerald-950/40 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/90 dark:bg-gray-900/90 backdrop-blur border border-gray-200 dark:border-gray-800 rounded-3xl p-8 space-y-6 shadow-xl shadow-emerald-900/5 animate-fade-in">
          {/* Logo */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="p-4 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-3xl shadow-lg shadow-emerald-600/30">
              <Wallet className="w-10 h-10" aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Finanças K</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 max-w-xs leading-relaxed">
              Gestão financeira pessoal e empresarial inspirada no KMyMoney. Banco de dados online e multiplataforma.
            </p>
          </div>

          {/* Features Checklist */}
          <ul className="bg-gray-50 dark:bg-gray-950/40 border border-gray-200 dark:border-gray-800 p-4 rounded-2xl space-y-2.5">
            {[
              'Saldos de contas correntes calculados em tempo real',
              'Importador inteligente de arquivos CSV e extratos QIF',
              'Categorização hierárquica e controle de etiquetas',
              'Agenda de compromissos e cobranças recorrentes',
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          {/* Action Button */}
          <button
            onClick={() => loginWithGoogle().catch(() => {})}
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3.5 px-5 rounded-2xl flex items-center justify-center gap-3 transition-colors shadow-lg shadow-emerald-700/20 cursor-pointer"
          >
            <LogIn className="w-5 h-5" aria-hidden="true" />
            Entrar com Google
          </button>

          {/* Footnotes */}
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            Armazenamento seguro em nuvem (Google Cloud Run + PostgreSQL).
          </p>
        </div>
      </main>
    );
  }

  // Render Subview inside layout
  const renderView = () => {
    if (dataError) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-900 border border-red-200 dark:border-red-950/60 rounded-3xl text-center shadow-lg max-w-lg mx-auto my-12 animate-fade-in"
        >
          <div className="p-4 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-3xl mb-4">
            <AlertTriangle className="w-8 h-8" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Erro ao carregar dados</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
            {dataError}
          </p>
          <button
            onClick={() => fetchAllData()}
            className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold py-2.5 px-6 rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      );
    }

    if (dataLoading) {
      return <ViewSkeleton label={`Carregando ${getNavItem(currentView).name}…`} />;
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
        return <CashFlowForecast accounts={accounts} transactions={allTransactions} onRefresh={fetchAllData} onNavigate={setCurrentView} />;
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
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex transition-colors duration-200">
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>

      {/* Screen-reader announcements for screen changes */}
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>

      {/* Mobile backdrop overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-30 lg:hidden animate-fade-in"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        themePreference={themePreference}
        onThemeChange={setThemePreference}
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        onOpenCommandPalette={() => {
          setIsSidebarOpen(false);
          setIsPaletteOpen(true);
        }}
        onPrefetch={handlePrefetch}
      />

      {/* Main Content Stage (inert behind the open mobile drawer) */}
      <div
        className="flex-1 lg:pl-64 pl-0 min-h-dvh relative flex flex-col w-full min-w-0"
        inert={isSidebarOpen || undefined}
      >
        {/* Mobile Header Bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-2.5 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 sticky top-0 z-20 transition-colors duration-200">
          <div className="flex items-center gap-2">
            <button
              ref={menuButtonRef}
              onClick={() => setIsSidebarOpen(true)}
              className="p-2.5 -ml-2 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl cursor-pointer"
              id="sidebar-toggle"
              aria-label="Abrir menu de navegação"
              aria-expanded={isSidebarOpen}
              aria-controls="main-sidebar"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <span className="font-bold text-sm text-gray-900 dark:text-white">Finanças K</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsPaletteOpen(true)}
              className="p-2.5 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl cursor-pointer"
              aria-label="Buscar tela"
            >
              <Search className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              onClick={() => setThemePreference(isDark ? 'light' : 'dark')}
              className="p-2.5 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl cursor-pointer"
              aria-label={isDark ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
            >
              {isDark ? <Sun className="w-5 h-5 text-amber-400" aria-hidden="true" /> : <Moon className="w-5 h-5 text-blue-700" aria-hidden="true" />}
            </button>
          </div>
        </header>

        {/* Background refresh indicator */}
        {isFetching && !dataLoading && (
          <div
            role="status"
            className="fixed lg:absolute top-16 lg:top-4 right-4 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xs border border-gray-200 dark:border-gray-800 shadow-md rounded-xl py-1.5 px-3 flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 z-50"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <span>Sincronizando dados…</span>
          </div>
        )}

        <main id="conteudo" tabIndex={-1} className="p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-7xl mx-auto w-full flex-1 outline-none">
          <Suspense fallback={<ViewSkeleton label="Carregando módulo…" />}>
            <div key={currentView} data-view={currentView} className="animate-slide-up">
              {renderView()}
            </div>
          </Suspense>
        </main>

        <MobileNav
          currentView={currentView}
          onViewChange={setCurrentView}
          onOpenMenu={() => setIsSidebarOpen(true)}
          isMenuOpen={isSidebarOpen}
        />
      </div>

      <CommandPalette open={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} onNavigate={setCurrentView} />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
