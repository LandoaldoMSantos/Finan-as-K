import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import { NAV_GROUPS, NAV_ITEMS, ViewId } from '../lib/navigation.ts';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: ViewId) => void;
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const groupOf = (id: ViewId) => NAV_GROUPS.find((g) => g.items.some((i) => i.id === id))?.label ?? '';

/** Ctrl+K / ⌘K quick switcher: type to filter, arrows to move, Enter to open. */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const titleId = useId();

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return NAV_ITEMS;
    return NAV_ITEMS.filter((item) => normalize(`${item.name} ${item.keywords ?? ''} ${groupOf(item.id)}`).includes(q));
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const choose = (id: ViewId) => {
    onNavigate(id);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      choose(results[active].id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-gray-950/50 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh] animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden animate-scale-in"
      >
        <h2 id={titleId} className="sr-only">Ir para uma tela</h2>
        <div className="flex items-center gap-3 px-4 border-b border-gray-200 dark:border-gray-800">
          <Search className="w-5 h-5 text-gray-500 dark:text-gray-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
            aria-autocomplete="list"
            aria-label="Buscar tela"
            placeholder="Buscar tela… (ex.: transações, backup)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex-1 py-4 bg-transparent text-base text-gray-900 dark:text-white outline-none focus-visible:!outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar busca"
            className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-md px-1.5 py-0.5 cursor-pointer"
          >
            Esc
          </button>
        </div>

        <ul id={listId} role="listbox" aria-label="Telas" className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400" role="presentation">
              Nenhuma tela encontrada para “{query}”.
            </li>
          )}
          {results.map((item, i) => {
            const Icon = item.icon;
            const selected = i === active;
            return (
              <li
                key={item.id}
                id={`${listId}-${item.id}`}
                role="option"
                aria-selected={selected}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(item.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm ${
                  selected
                    ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span className="flex-1">{item.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{groupOf(item.id)}</span>
                {selected && <CornerDownLeft className="w-4 h-4 text-gray-500" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
