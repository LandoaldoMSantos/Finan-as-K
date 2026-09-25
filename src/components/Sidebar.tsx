import React from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { 
  LayoutDashboard, 
  Landmark, 
  ArrowLeftRight, 
  FolderTree, 
  Tag, 
  Upload, 
  LogOut, 
  Sun, 
  Moon,
  Wallet,
  CalendarClock,
  X,
  Users,
  LineChart,
  FileSpreadsheet,
  Cloud
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  isDark: boolean;
  onThemeToggle: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onViewChange, 
  isDark, 
  onThemeToggle,
  isOpen,
  onClose
}) => {
  const { user, logout } = useAuth();

  // Close sidebar on Escape key when open on mobile
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'accounts', name: 'Contas Correntes', icon: Landmark },
    { id: 'transactions', name: 'Transações', icon: ArrowLeftRight },
    { id: 'categories', name: 'Categorias', icon: FolderTree },
    { id: 'tags', name: 'Etiquetas', icon: Tag },
    { id: 'payees', name: 'Beneficiários', icon: Users },
    { id: 'recurring', name: 'Agenda Recorrente', icon: CalendarClock },
    { id: 'forecast', name: 'Previsão de Caixa', icon: LineChart },
    { id: 'report', name: 'Relatório de Caixa', icon: FileSpreadsheet },
    { id: 'import', name: 'Importação QIF/CSV', icon: Upload },
    { id: 'backup', name: 'Backup & Restauração', icon: Cloud },
  ];

  const handleNavClick = (viewId: string) => {
    onViewChange(viewId);
    onClose(); // Auto-close on mobile when selecting a view
  };

  return (
    <aside 
      id="main-sidebar"
      aria-label="Menu Principal de Navegação"
      className={`w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-screen fixed left-0 top-0 transition-transform duration-300 ease-in-out z-40 lg:translate-x-0 ${
      isOpen ? 'translate-x-0' : '-translate-x-full'
    }`}>
      {/* Brand / Logo */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Wallet className="w-6 h-6 text-emerald-600 dark:text-emerald-500" aria-hidden="true" />
          <div>
            <h1 className="font-bold text-lg text-gray-900 dark:text-white leading-tight">Finanças K</h1>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">KMyMoney Web</span>
          </div>
        </div>

        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg lg:hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
          title="Fechar Menu"
          aria-label="Fechar menu de navegação"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto" aria-label="Seções do Aplicativo">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                isActive 
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`} aria-hidden="true" />
              {item.name}
            </button>
          );
        })}
      </nav>

      {/* User Session & Theme controls */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-4">
        {/* Theme Toggle */}
        <button
          onClick={onThemeToggle}
          aria-label={`Alternar para tema ${isDark ? 'claro' : 'escuro'}`}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <div className="flex items-center gap-3">
            {isDark ? <Sun className="w-5 h-5 text-amber-500" aria-hidden="true" /> : <Moon className="w-5 h-5 text-blue-600" aria-hidden="true" />}
            <span>Tema {isDark ? 'Claro' : 'Escuro'}</span>
          </div>
          <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md">
            {isDark ? 'DARK' : 'LIGHT'}
          </span>
        </button>

        {/* User Info */}
        {user && (
          <div className="flex items-center gap-3 px-2 py-1">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName ? `Foto de ${user.displayName}` : 'Foto de perfil'} className="w-9 h-9 rounded-full border border-gray-200 dark:border-gray-700" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-semibold text-sm" aria-hidden="true">
                {user.email?.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                {user.displayName || 'Usuário'}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                {user.email}
              </p>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={logout}
          aria-label="Sair da Conta"
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <LogOut className="w-5 h-5" aria-hidden="true" />
          Sair da Conta
        </button>
      </div>
    </aside>
  );
};
