import React from 'react';
import { Menu } from 'lucide-react';
import { MOBILE_PRIMARY, ViewId, getNavItem } from '../lib/navigation.ts';

interface MobileNavProps {
  currentView: ViewId;
  onViewChange: (view: ViewId) => void;
  onOpenMenu: () => void;
  isMenuOpen: boolean;
}

/** Bottom tab bar for phones: the four most used screens plus the full menu. */
export const MobileNav: React.FC<MobileNavProps> = ({ currentView, onViewChange, onOpenMenu, isMenuOpen }) => {
  const inPrimary = MOBILE_PRIMARY.includes(currentView);

  return (
    <nav
      aria-label="Navegação rápida"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-800 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {MOBILE_PRIMARY.map((id) => {
          const item = getNavItem(id);
          const Icon = item.icon;
          const active = currentView === id;
          return (
            <li key={id}>
              <a
                href={`#/${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onViewChange(id);
                }}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-14 text-xs font-medium ${
                  active ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                {item.shortName ?? item.name}
              </a>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onOpenMenu}
            aria-expanded={isMenuOpen}
            aria-controls="main-sidebar"
            className={`w-full flex flex-col items-center justify-center gap-0.5 min-h-14 text-xs font-medium cursor-pointer ${
              !inPrimary ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
            Mais
          </button>
        </li>
      </ul>
    </nav>
  );
};
