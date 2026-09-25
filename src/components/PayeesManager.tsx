import React, { useState } from 'react';
import { Payee as PayeeType } from '../types.ts';
import { api } from '../lib/api.ts';
import { Users, Plus, Trash2, Edit2, X, Check, Search } from 'lucide-react';
import { useToast } from '../context/ToastContext.tsx';
import { EmptyState } from './common/EmptyState.tsx';

interface PayeesManagerProps {
  payees: PayeeType[];
  onRefresh: () => Promise<void>;
}

export const PayeesManager: React.FC<PayeesManagerProps> = ({ payees, onRefresh }) => {
  const { toast } = useToast();
  const [newPayeeName, setNewPayeeName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayeeName.trim() || loading) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      await api.createPayee({ name: newPayeeName.trim() });
      setNewPayeeName('');
      await onRefresh();
      toast.success('Beneficiário cadastrado com sucesso!');
    } catch (err: any) {
      setErrorMsg('Erro ao criar beneficiário: ' + err.message);
      toast.error('Erro ao criar beneficiário: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (payee: PayeeType) => {
    setEditingId(payee.id);
    setEditingName(payee.name);
    setDeleteConfirmId(null);
    setErrorMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleUpdate = async (id: number) => {
    if (!editingName.trim() || loading) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      await api.updatePayee(id, { name: editingName.trim() });
      setEditingId(null);
      setEditingName('');
      await onRefresh();
      toast.success('Beneficiário atualizado com sucesso!');
    } catch (err: any) {
      setErrorMsg('Erro ao atualizar beneficiário: ' + err.message);
      toast.error('Erro ao atualizar beneficiário: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const executeDelete = async (id: number) => {
    setErrorMsg(null);
    try {
      await api.deletePayee(id);
      await onRefresh();
      toast.success('Beneficiário excluído com sucesso!');
    } catch (err: any) {
      setErrorMsg('Erro ao excluir beneficiário: ' + err.message);
      toast.error('Erro ao excluir beneficiário: ' + err.message);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const filteredPayees = [...payees]
    .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-6 h-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Cadastro de Beneficiários e Origens
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gerencie a lista de beneficiários de despesas ou origens de receitas para preenchimento automático rápido e consistente nas transações.
        </p>
      </div>

      {errorMsg && (
        <div role="alert" aria-live="polite" className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-rose-750 dark:text-rose-400 px-4 py-3 rounded-xl flex justify-between items-center text-sm">
          <span>{errorMsg}</span>
          <button 
            type="button" 
            onClick={() => setErrorMsg(null)} 
            aria-label="Fechar mensagem de erro"
            className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 p-1 rounded-lg focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Grid of Add Form & Search */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Add form */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col sm:flex-row gap-3 items-end sm:items-center">
          <div className="flex-1 w-full relative">
            <label htmlFor="new-payee-name" className="sr-only">
              Nome do beneficiário
            </label>
            <Users className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
            <input
              id="new-payee-name"
              type="text"
              value={newPayeeName}
              onChange={(e) => setNewPayeeName(e.target.value)}
              placeholder="Nome do beneficiário (ex: Posto Ipiranga)"
              className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              required
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-5 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/10 shrink-0 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                <span aria-live="polite">Salvando...</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Cadastrar</span>
              </>
            )}
          </button>
        </form>

        {/* Search Input */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center">
          <div className="flex-1 relative">
            <label htmlFor="search-payee" className="sr-only">
              Buscar beneficiário
            </label>
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
            <input
              id="search-payee"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar beneficiário..."
              className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Payees List */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/55 dark:bg-gray-900/50 flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 font-sans">
            Beneficiários Cadastrados ({filteredPayees.length})
          </span>
        </div>

        {filteredPayees.length === 0 ? (
          <div className="py-6">
            <EmptyState
              icon={Users}
              title={searchTerm ? "Nenhum beneficiário encontrado" : "Nenhum beneficiário cadastrado"}
              description={searchTerm ? `Nenhum resultado corresponde à busca "${searchTerm}".` : "Cadastre pessoas, fornecedores e empresas para autocompletar e identificar seus lançamentos."}
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800" role="list" aria-label="Lista de beneficiários">
            {filteredPayees.map((payee) => (
              <div
                key={payee.id}
                role="listitem"
                className="flex items-center justify-between p-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors"
              >
                {editingId === payee.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-4">
                    <label htmlFor={`edit-payee-${payee.id}`} className="sr-only">
                      Editar nome do beneficiário
                    </label>
                    <input
                      id={`edit-payee-${payee.id}`}
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-1 max-w-md bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-750 rounded-lg px-3 py-1.5 text-sm text-gray-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdate(payee.id)}
                      disabled={loading}
                      aria-label={`Salvar alteração para ${payee.name}`}
                      className="p-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <Check className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      aria-label="Cancelar edição"
                      className="p-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-gray-400"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center font-bold text-sm" aria-hidden="true">
                      {payee.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{payee.name}</span>
                    </div>
                  </div>
                )}

                {editingId !== payee.id && (
                  <div className="flex items-center gap-1.5">
                    {deleteConfirmId === payee.id ? (
                      <div className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/20 px-2 py-1 rounded-xl border border-rose-100 dark:border-rose-900/30">
                        <span className="text-xs text-rose-700 dark:text-rose-400 font-medium">Excluir?</span>
                        <button
                          type="button"
                          onClick={() => executeDelete(payee.id)}
                          aria-label={`Confirmar exclusão de ${payee.name}`}
                          className="text-[11px] bg-rose-600 hover:bg-rose-700 text-white px-2 py-0.5 rounded-md font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-rose-500"
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          aria-label="Cancelar exclusão"
                          className="text-[11px] bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-md font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-gray-400 cursor-pointer"
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteConfirmId(null);
                            startEdit(payee);
                          }}
                          aria-label={`Renomear beneficiário ${payee.name}`}
                          className="p-2 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-emerald-500"
                        >
                          <Edit2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            cancelEdit();
                            setDeleteConfirmId(payee.id);
                          }}
                          aria-label={`Excluir beneficiário ${payee.name}`}
                          className="p-2 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-rose-500"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
