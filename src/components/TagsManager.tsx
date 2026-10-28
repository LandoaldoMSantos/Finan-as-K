import React, { useState } from 'react';
import { Tag as TagType } from '../types.ts';
import { api } from '../lib/api.ts';
import { Tag, Plus, Trash2, Hash, AlertCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext.tsx';
import { EmptyState } from './common/EmptyState.tsx';

interface TagsManagerProps {
  tags: TagType[];
  onRefresh: () => Promise<void>;
}

export const TagsManager: React.FC<TagsManagerProps> = ({ tags, onRefresh }) => {
  const { toast } = useToast();
  const [newTagName, setNewTagName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim() || loading) return;

    setErrorMsg(null);
    setLoading(true);
    try {
      await api.createTag({ name: newTagName.trim() });
      setNewTagName('');
      await onRefresh();
      toast.success('Etiqueta criada com sucesso!');
    } catch (err: any) {
      setErrorMsg('Erro ao criar etiqueta: ' + err.message);
      toast.error('Erro ao criar etiqueta: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    setErrorMsg(null);
    try {
      await api.deleteTag(id);
      await onRefresh();
      toast.success(`Etiqueta "${name}" excluída com sucesso!`);
    } catch (err: any) {
      setErrorMsg('Erro ao excluir etiqueta: ' + err.message);
      toast.error('Erro ao excluir etiqueta: ' + err.message);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 tabIndex={-1} data-page-heading className="outline-none text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Tag className="w-6 h-6 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
          Etiquetas e Tags
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Crie etiquetas para agrupar despesas cruzando categorias (ex: #Ferias2026, #Casamento, #Reembolso)
        </p>
      </div>

      {/* Error alert */}
      {errorMsg && (
        <div role="alert" aria-live="polite" className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Add form */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <label htmlFor="new-tag-name" className="sr-only">
            Nome da etiqueta
          </label>
          <Hash className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-500 dark:text-gray-500" aria-hidden="true" />
          <input
            id="new-tag-name"
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Nome da etiqueta (ex: Ferias2026)"
            className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            required
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white px-5 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/10 focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
              <span aria-live="polite">Adicionando...</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Adicionar Etiqueta</span>
            </>
          )}
        </button>
      </form>

      {/* Tags grid */}
      <div className="bg-white dark:bg-gray-900 p-6 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm">
        {tags.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="Nenhuma etiqueta cadastrada"
            description="Crie tags para agrupar e cruzar dados de suas despesas e receitas por projetos ou ocasiões (ex: #Viagem, #Reforma)."
          />
        ) : (
          <div className="flex flex-wrap gap-3" role="list" aria-label="Lista de etiquetas cadastradas">
            {tags.map((tag) => (
              <div
                key={tag.id}
                role="listitem"
                className="flex items-center gap-2 px-3.5 py-2 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-gray-800 dark:text-gray-200 transition-all hover:border-gray-300 dark:hover:border-gray-700"
              >
                <span className="text-emerald-700 dark:text-emerald-400" aria-hidden="true">#</span>
                <span>{tag.name}</span>
                {deleteConfirmId === tag.id ? (
                  <div className="flex items-center gap-1.5 ml-1 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-lg border border-rose-200 dark:border-rose-900/50 animate-in fade-in">
                    <span className="text-xs text-rose-700 dark:text-rose-400 font-medium">Excluir?</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(tag.id, tag.name)}
                      aria-label={`Confirmar exclusão de ${tag.name}`}
                      className="text-xs bg-rose-600 hover:bg-rose-700 text-white px-2 py-0.5 rounded-md font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(null)}
                      aria-label="Cancelar exclusão"
                      className="text-xs bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-md font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-gray-400 cursor-pointer"
                    >
                      Não
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(tag.id)}
                    aria-label={`Excluir etiqueta ${tag.name}`}
                    className="p-2 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
