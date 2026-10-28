import React, { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { LogOut, Sun, Moon, Wallet, X, Monitor, Search } from 'lucide-react';
import { NAV_GROUPS, ViewId } from '../lib/navigation.ts';
import { ThemePreference } from '../hooks/useTheme.ts';

interface SidebarProps {
  currentView: ViewId;
  onViewChange: (view: ViewId) => void;
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenCommandPalette: () => void;
  onPrefetch?: (view: ViewId) => void;
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Automático', icon: Monitor },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onViewChange,
  themePreference,
  onThemeChange,
  isOpen,
  onClose,
  onOpenCommandPalette,
  onPrefetch,
}) => {
  const { user, logout } = useAuth();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  // Mobile drawer: Escape closes it, focus moves inside when it opens and Tab stays inside while open
  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !asideRef.current) return;
      const focusables = asideRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleNavClick = (viewId: ViewId) => {
    onViewChange(viewId);
    onClose(); // Auto-close on mobile when selecting a view
  };

  return (
    <aside
      ref={asideRef}
      id="main-sidebar"
      aria-label="Menu principal"
      className={`w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-dvh fixed left-0 top-0 transition-transform duration-300 ease-out z-40 lg:translate-x-0 ${
        isOpen ? 'translate-x-0 shadow-2xl lg:shadow-none' : '-translate-x-full'
      }`}
    >
      {/* Brand / Logo */}
      <div className="px-5 py-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-sm shadow-emerald-600/30">
            <Wallet className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-bold text-base text-gray-900 dark:text-white leading-tight">Finanças K</p>
            <span className="text-xs text-gray-500 dark:text-gray-400">Gestão financeira</span>
          </div>
        </div>

        {/* Mobile close button */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          className="p-2.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl lg:hidden cursor-pointer"
          aria-label="Fechar menu de navegação"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {/* Quick search / command palette */}
      <div className="px-4 pt-4">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/50 text-sm text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 transition-colors cursor-pointer"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
          <span className="flex-1 text-left">Ir para…</span>
          <kbd className="text-xs font-sans text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-md px-1.5 py-0.5 bg-white dark:bg-gray-900">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Navigation, grouped by purpose */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5" aria-label="Seções do aplicativo">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p
              id={`nav-group-${group.label}`}
              className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
            >
              {group.label}
            </p>
            <ul className="space-y-0.5" aria-labelledby={`nav-group-${group.label}`}>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <li key={item.id}>
                    <a
                      href={`#/${item.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        handleNavClick(item.id);
                      }}
                      onMouseEnter={() => onPrefetch?.(item.id)}
                      onFocus={() => onPrefetch?.(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-emerald-700 dark:bg-emerald-400" aria-hidden="true" />
                      )}
                      <Icon
                        className={`w-5 h-5 shrink-0 ${isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}
                        aria-hidden="true"
                      />
                      {item.name}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User Session & Theme controls */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-4">
        {/* Theme: Light / Dark / Automatic */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800/70" role="group" aria-label="Tema de cores">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
              const checked = themePreference === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => onThemeChange(value)}
                  className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    checked
                      ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
        </div>

        {/* User Info */}
        {user && (
          <div className="flex items-center gap-3 px-1">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-9 h-9 rounded-full border border-gray-200 dark:border-gray-700" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-semibold text-sm" aria-hidden="true">
                {user.email?.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {user.displayName || 'Usuário'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {user.email}
              </p>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
        >
          <LogOut className="w-5 h-5" aria-hidden="true" />
          Sair da conta
        </button>
      </div>
    </aside>
  );
};
