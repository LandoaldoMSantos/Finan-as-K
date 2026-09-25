import React, { useState, useMemo } from 'react';
import { Category } from '../types.ts';
import { api } from '../lib/api.ts';
import { 
  FolderTree, 
  Plus, 
  Trash2, 
  Edit3, 
  ChevronRight, 
  ChevronDown, 
  Check, 
  X,
  PlusCircle,
  ArrowLeftRight,
  Calendar,
  Info,
  Sparkles,
  FolderPlus
} from 'lucide-react';
import { useToast } from '../context/ToastContext.tsx';
import { EmptyState } from './common/EmptyState.tsx';

interface CategoriesManagerProps {
  categories: Category[];
  onRefresh: () => Promise<void>;
}

export const CategoriesManager: React.FC<CategoriesManagerProps> = ({ 
  categories, 
  onRefresh 
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'despesa' | 'receita'>('despesa');
  
  // Create state
  const [newCatName, setNewCatName] = useState('');
  const [newCatParentId, setNewCatParentId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editParentId, setEditParentId] = useState<number | null>(null);

  // Collapsed parents state
  const [collapsedParents, setCollapsedParents] = useState<Record<number, boolean>>({});

  // Delete & error state
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Transfer Modal State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFromId, setTransferFromId] = useState<number | ''>('');
  const [destinationMode, setDestinationMode] = useState<'existing' | 'new'>('existing');
  const [transferToId, setTransferToId] = useState<number | ''>('');
  
  // New target category state
  const [newTargetName, setNewTargetName] = useState('');
  const [newTargetParentId, setNewTargetParentId] = useState<number | null>(null);
  const [newTargetType, setNewTargetType] = useState<'despesa' | 'receita'>('despesa');

  // Period state
  const [periodPreset, setPeriodPreset] = useState<'all' | 'this_month' | 'this_year' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Transfer action status
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferModalError, setTransferModalError] = useState<string | null>(null);
  const [transferModalSuccess, setTransferModalSuccess] = useState<string | null>(null);

  // Keyboard shortcut (Escape to close modals/confirmations)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showTransferModal) {
          setShowTransferModal(false);
        } else if (deleteConfirmId !== null) {
          setDeleteConfirmId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTransferModal, deleteConfirmId]);

  const filteredCategories = categories.filter(c => c.type === activeTab);
  const parentCategories = [...filteredCategories]
    .filter(c => c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  
  const getSubcategories = (parentId: number) => {
    return [...filteredCategories]
      .filter(c => c.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  };

  const toggleParent = (parentId: number) => {
    setCollapsedParents(prev => ({ ...prev, [parentId]: !prev[parentId] }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    setErrorMsg(null);
    try {
      await api.createCategory({
        name: newCatName.trim(),
        type: activeTab,
        parentId: newCatParentId,
      });
      setNewCatName('');
      setNewCatParentId(null);
      setShowAddForm(false);
      await onRefresh();
      toast.success('Categoria cadastrada com sucesso!');
    } catch (err: any) {
      setErrorMsg('Erro ao criar categoria: ' + err.message);
      toast.error('Erro ao criar categoria: ' + err.message);
    }
  };

  const handleUpdate = async (id: number) => {
    if (!editName.trim()) return;
    setErrorMsg(null);
    try {
      await api.updateCategory(id, {
        name: editName.trim(),
        type: activeTab,
        parentId: editParentId,
      });
      setEditingId(null);
      setEditName('');
      setEditParentId(null);
      await onRefresh();
      toast.success('Categoria atualizada com sucesso!');
    } catch (err: any) {
      setErrorMsg('Erro ao editar categoria: ' + err.message);
      toast.error('Erro ao editar categoria: ' + err.message);
    }
  };

  const executeDelete = async (id: number) => {
    setErrorMsg(null);
    try {
      await api.deleteCategory(id);
      await onRefresh();
      toast.success('Categoria excluída com sucesso!');
    } catch (err: any) {
      setErrorMsg('Erro ao excluir categoria: ' + err.message);
      toast.error('Erro ao excluir categoria: ' + err.message);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditParentId(cat.parentId);
    setDeleteConfirmId(null);
    setErrorMsg(null);
  };

  // Formatted hierarchical list for category select dropdowns
  const formattedCategoryOptions = useMemo(() => {
    const parents = [...categories]
      .filter(c => c.parentId === null)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    
    const options: { id: number; label: string; type: 'despesa' | 'receita'; name: string }[] = [];

    parents.forEach(p => {
      options.push({
        id: p.id,
        label: `[${p.type === 'despesa' ? 'Despesa' : 'Receita'}] ${p.name}`,
        type: p.type,
        name: p.name
      });
      const subs = [...categories]
        .filter(c => c.parentId === p.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      
      subs.forEach(s => {
        options.push({
          id: s.id,
          label: `[${s.type === 'despesa' ? 'Despesa' : 'Receita'}] ${p.name} > ${s.name}`,
          type: s.type,
          name: s.name
        });
      });
    });

    return options;
  }, [categories]);

  // Open transfer modal
  const openTransferModal = (initialFromId?: number | null) => {
    setErrorMsg(null);
    setTransferModalError(null);
    setTransferModalSuccess(null);
    const fromId = initialFromId || (categories.length > 0 ? categories[0].id : '');
    setTransferFromId(fromId);
    setDestinationMode('existing');
    setTransferToId('');
    setNewTargetName('');
    setNewTargetParentId(null);

    if (fromId) {
      const srcCat = categories.find(c => c.id === Number(fromId));
      if (srcCat) {
        setNewTargetType(srcCat.type);
      }
    } else {
      setNewTargetType(activeTab);
    }

    setPeriodPreset('all');
    setStartDate('');
    setEndDate('');
    setShowTransferModal(true);
  };

  // Handle period preset button clicks
  const handlePeriodPresetChange = (preset: 'all' | 'this_month' | 'this_year' | 'custom') => {
    setPeriodPreset(preset);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'this_month') {
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      setStartDate(`${year}-${month}-01`);
      setEndDate(`${year}-${month}-${String(lastDay).padStart(2, '0')}`);
    } else if (preset === 'this_year') {
      setStartDate(`${year}-01-01`);
      setEndDate(`${year}-12-31`);
    } else if (preset === 'custom') {
      if (!startDate) setStartDate(`${year}-01-01`);
      if (!endDate) setEndDate(`${year}-${month}-${String(now.getDate()).padStart(2, '0')}`);
    }
  };

  // Handle source category change in modal
  const handleSourceCategoryChange = (catIdVal: string) => {
    const id = catIdVal === '' ? '' : Number(catIdVal);
    setTransferFromId(id);
    if (id !== '') {
      const srcCat = categories.find(c => c.id === id);
      if (srcCat) {
        setNewTargetType(srcCat.type);
      }
    }
  };

  // Execute transfer action
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferModalError(null);
    setTransferModalSuccess(null);

    if (!transferFromId) {
      setTransferModalError('Selecione a categoria de origem.');
      return;
    }

    if (destinationMode === 'existing') {
      if (!transferToId) {
        setTransferModalError('Selecione a categoria de destino.');
        return;
      }
      if (transferFromId === transferToId) {
        setTransferModalError('A categoria de origem e de destino devem ser diferentes.');
        return;
      }
    } else {
      if (!newTargetName.trim()) {
        setTransferModalError('Informe o nome da nova categoria de destino.');
        return;
      }
    }

    setIsTransferring(true);

    try {
      const payload: any = {
        fromCategoryId: Number(transferFromId),
        startDate: startDate.trim() || null,
        endDate: endDate.trim() || null,
      };

      if (destinationMode === 'existing') {
        payload.toCategoryId = Number(transferToId);
      } else {
        payload.newCategory = {
          name: newTargetName.trim(),
          type: newTargetType,
          parentId: newTargetParentId,
        };
      }

      const res = await api.transferCategoryTransactions(payload);

      if (res.success) {
        const total = res.totalTransferred || 0;
        const msg = total > 0
          ? `Sucesso! ${total} movimentação(ões) foram transferidas para a nova categoria com sucesso.`
          : 'Transferência concluída. Nenhuma movimentação foi encontrada para a categoria no período selecionado.';
        setTransferModalSuccess(msg);
        toast.success(total > 0 ? `${total} transações transferidas com sucesso!` : 'Transferência processada.');
        await onRefresh();
      }
    } catch (err: any) {
      setTransferModalError(err.message || 'Erro ao transferir lançamentos.');
      toast.error('Erro ao transferir lançamentos: ' + (err.message || ''));
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FolderTree className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Categorias de Fluxo
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Organize suas receitas e despesas em uma estrutura hierárquica (Pai e Filho)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={() => openTransferModal(null)}
            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all shadow-md shadow-amber-500/10"
          >
            <ArrowLeftRight className="w-4 h-4" />
            Transferir Movimentações
          </button>

          <button
            onClick={() => {
              setNewCatParentId(null);
              setShowAddForm(!showAddForm);
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all shadow-md shadow-emerald-600/10"
          >
            <Plus className="w-4 h-4" />
            Nova Categoria Pai
          </button>
        </div>
      </div>

      {errorMsg && (
        <div role="alert" aria-live="polite" className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-rose-700 dark:text-rose-400 px-4 py-3 rounded-xl flex justify-between items-center text-sm">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} aria-label="Fechar mensagem de erro" className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 p-1 rounded-lg focus-visible:ring-2 focus-visible:ring-rose-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Type Tabs */}
      <div role="tablist" aria-label="Tipo de categoria" className="flex border-b border-gray-200 dark:border-gray-800">
        <button
          role="tab"
          id="tab-despesa"
          aria-selected={activeTab === 'despesa'}
          aria-controls="categories-panel"
          onClick={() => { setActiveTab('despesa'); setShowAddForm(false); }}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 ${
            activeTab === 'despesa'
              ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Categorias de Despesas
        </button>
        <button
          role="tab"
          id="tab-receita"
          aria-selected={activeTab === 'receita'}
          aria-controls="categories-panel"
          onClick={() => { setActiveTab('receita'); setShowAddForm(false); }}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 ${
            activeTab === 'receita'
              ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Categorias de Receitas
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 space-y-4 animate-fade-in shadow-sm">
          <label htmlFor="new-category-name" className="block text-sm font-bold text-gray-800 dark:text-white">
            {newCatParentId 
              ? `Nova Subcategoria de: "${categories.find(c => c.id === newCatParentId)?.name}"` 
              : `Nova Categoria Principal de ${activeTab === 'despesa' ? 'Despesas' : 'Receitas'}`
            }
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="new-category-name"
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Nome da categoria (ex: Supermercado, Aluguel, Salário)"
              className="flex-1 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              required
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                Adicionar
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setNewCatParentId(null); }}
                className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-750 text-gray-600 dark:text-gray-400 px-4 py-2.5 rounded-xl font-medium text-sm transition-all focus-visible:ring-2 focus-visible:ring-gray-400"
              >
                Cancelar
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Category List */}
      <div id="categories-panel" role="tabpanel" aria-labelledby={activeTab === 'despesa' ? 'tab-despesa' : 'tab-receita'} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
        {parentCategories.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={FolderTree}
              title={`Nenhuma categoria de ${activeTab === 'despesa' ? 'despesa' : 'receita'} cadastrada`}
              description={`Crie categorias e subcategorias para classificar seus lançamentos de ${activeTab === 'despesa' ? 'despesa' : 'receita'} e visualizar relatórios detalhados.`}
              actionLabel="Criar Primeira Categoria"
              onAction={() => {
                setNewCatParentId(null);
                setShowAddForm(true);
              }}
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {parentCategories.map(parent => {
              const subs = getSubcategories(parent.id);
              const isCollapsed = collapsedParents[parent.id];
              const isEditing = editingId === parent.id;

              return (
                <div key={parent.id} className="transition-colors">
                  {/* Parent Row */}
                  <div className="flex items-center justify-between p-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 group">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <button 
                        onClick={() => toggleParent(parent.id)}
                        aria-label={subs.length > 0 ? (isCollapsed ? `Expandir subcategorias de ${parent.name}` : `Recolher subcategorias de ${parent.name}`) : `Categoria ${parent.name} sem subcategorias`}
                        className="p-1 hover:bg-gray-150 dark:hover:bg-gray-800 rounded-lg text-gray-400 dark:text-gray-500 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500"
                      >
                        {subs.length > 0 ? (
                          isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        ) : (
                          <div className="w-4 h-4" />
                        )}
                      </button>

                      {isEditing ? (
                        <div className="flex items-center gap-2 flex-1 max-w-md">
                          <label htmlFor={`edit-category-${parent.id}`} className="sr-only">Nome da Categoria</label>
                          <input
                            id={`edit-category-${parent.id}`}
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            required
                          />
                          <button 
                            onClick={() => handleUpdate(parent.id)}
                            aria-label={`Salvar alteração de ${parent.name}`}
                            className="p-1.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 rounded-lg hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-500"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setEditingId(null)}
                            aria-label="Cancelar edição"
                            className="p-1.5 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded-lg hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-gray-400"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                            {parent.name}
                          </span>
                          <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 px-2 py-0.5 rounded-full border border-gray-100 dark:border-gray-800">
                            {subs.length === 1 ? '1 subcategoria' : `${subs.length} subcategorias`}
                          </span>
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        {deleteConfirmId === parent.id ? (
                          <div className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/20 px-2 py-1 rounded-xl border border-rose-100 dark:border-rose-900/30">
                            <span className="text-xs text-rose-700 dark:text-rose-400 font-medium">Excluir?</span>
                            <button
                              onClick={() => executeDelete(parent.id)}
                              aria-label={`Confirmar exclusão de ${parent.name}`}
                              className="text-[11px] bg-rose-600 hover:bg-rose-700 text-white px-2 py-0.5 rounded-md font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-rose-500"
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              aria-label="Cancelar exclusão"
                              className="text-[11px] bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-md font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-gray-400"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => openTransferModal(parent.id)}
                              title="Transferir movimentações desta categoria"
                              aria-label={`Transferir movimentações da categoria ${parent.name}`}
                              className="p-2 text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/20 rounded-xl transition-all flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-amber-500"
                            >
                              <ArrowLeftRight className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setNewCatParentId(parent.id);
                                setShowAddForm(true);
                              }}
                              title="Adicionar subcategoria"
                              aria-label={`Adicionar subcategoria em ${parent.name}`}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/20 rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-emerald-500"
                            >
                              <PlusCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => startEdit(parent)}
                              title="Editar"
                              aria-label={`Editar categoria ${parent.name}`}
                              className="p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/20 rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setDeleteConfirmId(parent.id);
                                setErrorMsg(null);
                              }}
                              title="Excluir"
                              aria-label={`Excluir categoria ${parent.name}`}
                              className="p-2 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/20 rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-rose-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Subcategories (Children) List */}
                  {subs.length > 0 && !isCollapsed && (
                    <div className="bg-gray-50/40 dark:bg-gray-950/20 pl-10 pr-4 divide-y divide-gray-100 dark:divide-gray-800">
                      {subs.map(sub => {
                        const isSubEditing = editingId === sub.id;

                        return (
                          <div key={sub.id} className="flex items-center justify-between py-3 hover:bg-gray-50/80 dark:hover:bg-gray-900/30 group">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-gray-300 dark:text-gray-700" aria-hidden="true">└─</span>
                              {isSubEditing ? (
                                <div className="flex items-center gap-2 flex-1 max-w-sm">
                                  <label htmlFor={`edit-subcategory-${sub.id}`} className="sr-only">Nome da Subcategoria</label>
                                  <input
                                    id={`edit-subcategory-${sub.id}`}
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    required
                                  />
                                  <button 
                                    onClick={() => handleUpdate(sub.id)}
                                    aria-label={`Salvar alteração de ${sub.name}`}
                                    className="p-1.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 rounded-lg hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-500"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => setEditingId(null)}
                                    aria-label="Cancelar edição"
                                    className="p-1.5 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded-lg hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-gray-400"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                                  {sub.name}
                                </span>
                              )}
                            </div>

                            {!isSubEditing && (
                              <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                {deleteConfirmId === sub.id ? (
                                  <div className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/20 px-2 py-1 rounded-xl border border-rose-100 dark:border-rose-900/30">
                                    <span className="text-xs text-rose-700 dark:text-rose-400 font-medium">Excluir?</span>
                                    <button
                                      onClick={() => executeDelete(sub.id)}
                                      aria-label={`Confirmar exclusão de ${sub.name}`}
                                      className="text-[11px] bg-rose-600 hover:bg-rose-700 text-white px-2 py-0.5 rounded-md font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-rose-500"
                                    >
                                      Sim
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirmId(null)}
                                      aria-label="Cancelar exclusão"
                                      className="text-[11px] bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-md font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-gray-400 cursor-pointer"
                                    >
                                      Não
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => openTransferModal(sub.id)}
                                      title="Transferir movimentações desta subcategoria"
                                      aria-label={`Transferir movimentações da subcategoria ${sub.name}`}
                                      className="p-1.5 text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/20 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-amber-500"
                                    >
                                      <ArrowLeftRight className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => startEdit(sub)}
                                      title="Editar subcategoria"
                                      aria-label={`Editar subcategoria ${sub.name}`}
                                      className="p-1.5 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/20 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-blue-500"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setDeleteConfirmId(sub.id);
                                        setErrorMsg(null);
                                      }}
                                      title="Excluir subcategoria"
                                      aria-label={`Excluir subcategoria ${sub.name}`}
                                      className="p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/20 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-rose-500"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Transfer Category Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div role="dialog" aria-modal="true" aria-labelledby="transfer-modal-title" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-fade-in my-8">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-150 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-200/40">
                  <ArrowLeftRight className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="transfer-modal-title" className="text-lg font-bold text-gray-900 dark:text-white">
                    Transferir Movimentações
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Reatribua lançamentos de uma categoria para outra
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                aria-label="Fechar modal de transferência"
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error & Success Messages */}
            {transferModalError && (
              <div role="alert" aria-live="polite" className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 p-3.5 rounded-xl text-xs flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{transferModalError}</span>
              </div>
            )}

            {transferModalSuccess && (
              <div role="status" aria-live="polite" className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 p-3.5 rounded-xl text-xs flex items-start gap-2">
                <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                <span>{transferModalSuccess}</span>
              </div>
            )}

            <form onSubmit={handleExecuteTransfer} className="space-y-4">
              
              {/* 1. Categoria de Origem (De) */}
              <div className="space-y-1.5">
                <label htmlFor="transfer-source-cat" className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                  Categoria de Origem (De) <span className="text-rose-500">*</span>
                </label>
                <select
                  id="transfer-source-cat"
                  value={transferFromId}
                  onChange={(e) => handleSourceCategoryChange(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  required
                >
                  <option value="">-- Selecione a Categoria de Origem --</option>
                  {formattedCategoryOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Categoria de Destino (Para) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor={destinationMode === 'existing' ? "transfer-dest-cat" : undefined} className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Categoria de Destino (Para) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg text-[10px]" role="group" aria-label="Modo de destino da categoria">
                    <button
                      type="button"
                      aria-pressed={destinationMode === 'existing'}
                      onClick={() => setDestinationMode('existing')}
                      className={`px-2 py-1 rounded-md font-semibold transition-all focus-visible:ring-2 focus-visible:ring-amber-500 ${
                        destinationMode === 'existing'
                          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
                      }`}
                    >
                      Existente
                    </button>
                    <button
                      type="button"
                      aria-pressed={destinationMode === 'new'}
                      onClick={() => setDestinationMode('new')}
                      className={`px-2 py-1 rounded-md font-semibold transition-all flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-amber-500 ${
                        destinationMode === 'new'
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
                      }`}
                    >
                      <Plus className="w-3 h-3" />
                      Criar Nova
                    </button>
                  </div>
                </div>

                {destinationMode === 'existing' ? (
                  <select
                    id="transfer-dest-cat"
                    value={transferToId}
                    onChange={(e) => setTransferToId(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    required
                  >
                    <option value="">-- Selecione a Categoria de Destino --</option>
                    {formattedCategoryOptions.map(opt => (
                      <option 
                        key={opt.id} 
                        value={opt.id}
                        disabled={opt.id === Number(transferFromId)}
                      >
                        {opt.label} {opt.id === Number(transferFromId) ? '(Origem)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3.5 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 rounded-xl space-y-3">
                    <div className="space-y-1">
                      <label htmlFor="new-target-name" className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                        Nome da Nova Categoria
                      </label>
                      <input
                        id="new-target-name"
                        type="text"
                        value={newTargetName}
                        onChange={(e) => setNewTargetName(e.target.value)}
                        placeholder="Ex: Contas > Internet ou Internet"
                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        required={destinationMode === 'new'}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label htmlFor="new-target-parent" className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                          Categoria Pai (Opcional)
                        </label>
                        <select
                          id="new-target-parent"
                          value={newTargetParentId || ''}
                          onChange={(e) => setNewTargetParentId(e.target.value ? Number(e.target.value) : null)}
                          className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white"
                        >
                          <option value="">Nenhuma (Categoria Principal)</option>
                          {categories
                            .filter(c => c.parentId === null)
                            .map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.type})
                              </option>
                            ))
                          }
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="new-target-flow-type" className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                          Tipo de Fluxo
                        </label>
                        <select
                          id="new-target-flow-type"
                          value={newTargetType}
                          onChange={(e) => setNewTargetType(e.target.value as 'despesa' | 'receita')}
                          className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white"
                        >
                          <option value="despesa">Despesa</option>
                          <option value="receita">Receita</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Período das Movimentações */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  Período dos Lançamentos a Transferir
                </label>

                <div className="grid grid-cols-4 gap-1.5 bg-gray-50 dark:bg-gray-800/60 p-1 rounded-xl border border-gray-200 dark:border-gray-700" role="group" aria-label="Predefinições de período">
                  <button
                    type="button"
                    aria-pressed={periodPreset === 'all'}
                    onClick={() => handlePeriodPresetChange('all')}
                    className={`py-1.5 px-2 text-[10px] font-semibold rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-amber-500 ${
                      periodPreset === 'all'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    Todo o Histórico
                  </button>
                  <button
                    type="button"
                    aria-pressed={periodPreset === 'this_month'}
                    onClick={() => handlePeriodPresetChange('this_month')}
                    className={`py-1.5 px-2 text-[10px] font-semibold rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-amber-500 ${
                      periodPreset === 'this_month'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    Este Mês
                  </button>
                  <button
                    type="button"
                    aria-pressed={periodPreset === 'this_year'}
                    onClick={() => handlePeriodPresetChange('this_year')}
                    className={`py-1.5 px-2 text-[10px] font-semibold rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-amber-500 ${
                      periodPreset === 'this_year'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    Ano Atual
                  </button>
                  <button
                    type="button"
                    aria-pressed={periodPreset === 'custom'}
                    onClick={() => handlePeriodPresetChange('custom')}
                    className={`py-1.5 px-2 text-[10px] font-semibold rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-amber-500 ${
                      periodPreset === 'custom'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    Personalizado
                  </button>
                </div>

                {periodPreset === 'custom' && (
                  <div className="grid grid-cols-2 gap-3 pt-1 animate-fade-in">
                    <div className="space-y-1">
                      <label htmlFor="transfer-start-date" className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400">Data Inicial</label>
                      <input
                        id="transfer-start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="transfer-end-date" className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400">Data Final</label>
                      <input
                        id="transfer-end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Informative Note */}
              <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 p-3 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p>
                  Considera lançamentos simples (categoria única) e parcelas em lançamentos múltiplos (splits). Os registros serão migrados para a categoria de destino mantendo valores e observações intactos.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-150 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-gray-400"
                >
                  {transferModalSuccess ? 'Fechar' : 'Cancelar'}
                </button>

                <button
                  type="submit"
                  disabled={isTransferring}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-amber-500/10 flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  {isTransferring ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Transferindo...
                    </>
                  ) : (
                    <>
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      Confirmar Transferência
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
