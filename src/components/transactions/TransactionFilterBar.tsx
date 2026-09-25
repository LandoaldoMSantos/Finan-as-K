import React, { useState, useMemo } from 'react';
import { Account, Category, Tag } from '../../types.ts';
import { Search, Filter, X, SlidersHorizontal, ChevronDown, ChevronUp, Calendar, Tag as TagIcon, Layers, Wallet } from 'lucide-react';

export interface TransactionFilterBarProps {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  filterAccount: string;
  setFilterAccount: (val: string) => void;
  filterCategory: string;
  setFilterCategory: (val: string) => void;
  filterTag: string;
  setFilterTag: (val: string) => void;
  filterType: string;
  setFilterType: (val: string) => void;
  filterStartDate: string;
  setFilterStartDate: (val: string) => void;
  filterEndDate: string;
  setFilterEndDate: (val: string) => void;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export const TransactionFilterBar: React.FC<TransactionFilterBarProps> = React.memo(({
  searchTerm,
  setSearchTerm,
  filterAccount,
  setFilterAccount,
  filterCategory,
  setFilterCategory,
  filterTag,
  setFilterTag,
  filterType,
  setFilterType,
  filterStartDate,
  setFilterStartDate,
  filterEndDate,
  setFilterEndDate,
  accounts,
  categories,
  tags,
  onClearFilters,
  hasActiveFilters,
}) => {
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  // Count active advanced filters (excluding search)
  const activeAdvancedCount = useMemo(() => {
    let count = 0;
    if (filterAccount) count++;
    if (filterCategory) count++;
    if (filterTag) count++;
    if (filterType) count++;
    if (filterStartDate) count++;
    if (filterEndDate) count++;
    return count;
  }, [filterAccount, filterCategory, filterTag, filterType, filterStartDate, filterEndDate]);

  // Format category hierarchy for dropdown
  const categoryTreeOptions = useMemo(() => {
    const parents = categories.filter(c => c.parentId === null);
    const result: { id: number; displayName: string }[] = [];

    parents.forEach(p => {
      result.push({ id: p.id, displayName: p.name });
      const children = categories.filter(c => c.parentId === p.id);
      children.forEach(c => {
        result.push({ id: c.id, displayName: `↳ ${c.name} (${p.name})` });
      });
    });

    return result;
  }, [categories]);

  // Selected names for filter pills
  const selectedAccountName = accounts.find(a => String(a.id) === filterAccount)?.name;
  const selectedCategoryName = categories.find(c => String(c.id) === filterCategory)?.name;
  const selectedTagName = tags.find(t => String(t.id) === filterTag)?.name;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
      {/* Top Search Bar & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search input with clear button */}
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por beneficiário, detalhes ou memo..."
            aria-label="Buscar transações por beneficiário ou detalhes"
            className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-750 rounded-xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder:text-gray-400"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg cursor-pointer"
              aria-label="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter toggles & Clear button */}
        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
          {/* Mobile toggle button for advanced filters */}
          <button
            type="button"
            onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
            className={`sm:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              activeAdvancedCount > 0 || isMobileFiltersOpen
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
            }`}
            aria-expanded={isMobileFiltersOpen}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filtros {activeAdvancedCount > 0 ? `(${activeAdvancedCount})` : ''}</span>
            {isMobileFiltersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Filtrar</span>
          </div>

          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              type="button"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-500"
              aria-label="Limpar todos os filtros ativos"
            >
              <X className="w-3.5 h-3.5" />
              Limpar tudo
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filters Grid (Always visible on sm+, expandable on mobile) */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 pt-1 ${
        isMobileFiltersOpen ? 'block' : 'hidden sm:grid'
      }`}>
        {/* Account Filter */}
        <div>
          <label htmlFor="filter-account" className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Conta Corrente
          </label>
          <select
            id="filter-account"
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-750 rounded-xl px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Todas as contas</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>

        {/* Category Filter */}
        <div>
          <label htmlFor="filter-category" className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Categoria
          </label>
          <select
            id="filter-category"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-750 rounded-xl px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Todas as categorias</option>
            {categoryTreeOptions.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.displayName}</option>
            ))}
          </select>
        </div>

        {/* Tag Filter */}
        <div>
          <label htmlFor="filter-tag" className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Etiqueta (Tag)
          </label>
          <select
            id="filter-tag"
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-750 rounded-xl px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Todas as tags</option>
            {tags.map(tag => (
              <option key={tag.id} value={tag.id}>#{tag.name}</option>
            ))}
          </select>
        </div>

        {/* Type Filter */}
        <div>
          <label htmlFor="filter-type" className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Tipo
          </label>
          <select
            id="filter-type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-750 rounded-xl px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Todos os tipos</option>
            <option value="debito">Débitos (Despesas)</option>
            <option value="credito">Créditos (Receitas)</option>
          </select>
        </div>

        {/* Start Date */}
        <div>
          <label htmlFor="filter-start-date" className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Data Inicial
          </label>
          <input
            id="filter-start-date"
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-750 rounded-xl px-2.5 py-1 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {/* End Date */}
        <div>
          <label htmlFor="filter-end-date" className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Data Final
          </label>
          <input
            id="filter-end-date"
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-750 rounded-xl px-2.5 py-1 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </div>

      {/* Active Filter Badges with Quick (X) Removal */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-150 dark:border-gray-800/60">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mr-1">Filtros ativos:</span>
          
          {selectedAccountName && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <Wallet className="w-3 h-3" />
              <span>Conta: {selectedAccountName}</span>
              <button
                type="button"
                onClick={() => setFilterAccount('')}
                className="hover:text-emerald-950 dark:hover:text-white p-0.5 cursor-pointer"
                aria-label="Remover filtro de conta"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {selectedCategoryName && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              <Layers className="w-3 h-3" />
              <span>Cat: {selectedCategoryName}</span>
              <button
                type="button"
                onClick={() => setFilterCategory('')}
                className="hover:text-blue-950 dark:hover:text-white p-0.5 cursor-pointer"
                aria-label="Remover filtro de categoria"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {selectedTagName && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              <TagIcon className="w-3 h-3" />
              <span>Tag: #{selectedTagName}</span>
              <button
                type="button"
                onClick={() => setFilterTag('')}
                className="hover:text-purple-950 dark:hover:text-white p-0.5 cursor-pointer"
                aria-label="Remover filtro de tag"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filterType && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              <span>Tipo: {filterType === 'debito' ? 'Débitos' : 'Créditos'}</span>
              <button
                type="button"
                onClick={() => setFilterType('')}
                className="hover:text-amber-950 dark:hover:text-white p-0.5 cursor-pointer"
                aria-label="Remover filtro de tipo"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {(filterStartDate || filterEndDate) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-700">
              <Calendar className="w-3 h-3" />
              <span>Período: {filterStartDate || '...'} até {filterEndDate || '...'}</span>
              <button
                type="button"
                onClick={() => {
                  setFilterStartDate('');
                  setFilterEndDate('');
                }}
                className="hover:text-gray-950 dark:hover:text-white p-0.5 cursor-pointer"
                aria-label="Remover filtro de período"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
});

TransactionFilterBar.displayName = 'TransactionFilterBar';
