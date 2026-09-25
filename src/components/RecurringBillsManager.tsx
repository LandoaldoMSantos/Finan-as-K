import React, { useState, useMemo } from 'react';
import { Transaction, Account, Category, Tag, Payee } from '../types.ts';
import { api } from '../lib/api.ts';
import { formatCurrency, formatDate } from '../lib/utils.ts';
import { 
  CalendarClock, 
  CheckSquare, 
  AlertCircle, 
  TrendingDown, 
  TrendingUp, 
  Clock, 
  RefreshCw, 
  Info, 
  Plus, 
  X, 
  Edit2, 
  Trash2, 
  Tag as TagIcon, 
  Check, 
  Users, 
  Copy, 
  CornerDownRight 
} from 'lucide-react';
import { useToast } from '../context/ToastContext.tsx';
import { EmptyState } from './common/EmptyState.tsx';

const calculateEndDate = (nextDueDate: string | null, recurrenceInterval: string | null, remainingOccurrences: number | null) => {
  if (!nextDueDate || !remainingOccurrences || remainingOccurrences <= 0) return null;
  let current = new Date(nextDueDate + 'T12:00:00');
  const steps = remainingOccurrences - 1;
  if (steps > 0) {
    if (recurrenceInterval === 'diario') {
      current.setDate(current.getDate() + steps);
    } else if (recurrenceInterval === 'semanal') {
      current.setDate(current.getDate() + steps * 7);
    } else if (recurrenceInterval === 'quinzenal') {
      current.setDate(current.getDate() + steps * 14);
    } else if (recurrenceInterval === 'mensal') {
      current.setMonth(current.getMonth() + steps);
    } else if (recurrenceInterval === 'anual') {
      current.setFullYear(current.getFullYear() + steps);
    }
  }
  return current.toISOString().split('T')[0]; // Return YYYY-MM-DD
};

interface RecurringBillsManagerProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  payees: Payee[];
  onRefresh: () => Promise<void>;
}

export const RecurringBillsManager: React.FC<RecurringBillsManagerProps> = ({
  transactions,
  accounts,
  categories,
  tags,
  payees,
  onRefresh
}) => {
  const { toast } = useToast();
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Form Visibility & States
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState<'debito' | 'credito'>('debito');
  const [payee, setPayee] = useState('');
  const [selectedPayeeId, setSelectedPayeeId] = useState<string>('');
  const [isCustomPayee, setIsCustomPayee] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [recurrenceInterval, setRecurrenceInterval] = useState<'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'anual'>('mensal');
  const [remainingOccurrences, setRemainingOccurrences] = useState<string>('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [memo, setMemo] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  // Split (multiple categories) support
  const [isSplit, setIsSplit] = useState(false);
  const [formSplits, setFormSplits] = useState<{ categoryId: string; amountInput: string; memo: string }[]>([]);

  const toggleSplit = (checked: boolean) => {
    setIsSplit(checked);
    if (checked && formSplits.length === 0) {
      setFormSplits([
        { categoryId: '', amountInput: '', memo: '' },
        { categoryId: '', amountInput: '', memo: '' }
      ]);
    }
  };

  // Calculate estimated end date when remaining occurrences are specified
  const estimatedEndDate = useMemo(() => {
    const num = parseInt(remainingOccurrences);
    if (isNaN(num) || num <= 0 || !nextDueDate) return null;
    
    let current = new Date(nextDueDate + 'T12:00:00');
    const steps = num - 1;
    if (steps > 0) {
      if (recurrenceInterval === 'diario') {
        current.setDate(current.getDate() + steps);
      } else if (recurrenceInterval === 'semanal') {
        current.setDate(current.getDate() + steps * 7);
      } else if (recurrenceInterval === 'quinzenal') {
        current.setDate(current.getDate() + steps * 14);
      } else if (recurrenceInterval === 'mensal') {
        current.setMonth(current.getMonth() + steps);
      } else if (recurrenceInterval === 'anual') {
        current.setFullYear(current.getFullYear() + steps);
      }
    }
    return current.toLocaleDateString('pt-BR');
  }, [remainingOccurrences, nextDueDate, recurrenceInterval]);

  // Confirmation Modal states
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [triggerTarget, setTriggerTarget] = useState<Transaction | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Settlement Edit States (Dar Baixa)
  const [triggerDate, setTriggerDate] = useState('');
  const [triggerAmountInput, setTriggerAmountInput] = useState('');
  const [triggerAccountId, setTriggerAccountId] = useState('');
  const [triggerCategoryId, setTriggerCategoryId] = useState('');
  const [triggerMemo, setTriggerMemo] = useState('');
  const [triggerIsSplit, setTriggerIsSplit] = useState(false);
  const [triggerSplits, setTriggerSplits] = useState<{ categoryId: string; amountInput: string; memo: string }[]>([]);
  const [triggerIsLastOccurrence, setTriggerIsLastOccurrence] = useState(false);

  // Filter templates that are marked as recurring
  const recurringTemplates = useMemo(() => {
    return transactions.filter(t => t.isRecurring);
  }, [transactions]);

  // Handle triggering / checking off a bill
  const handleTriggerPayment = (t: Transaction) => {
    setTriggerTarget(t);
    setTriggerDate(t.nextDueDate || new Date().toISOString().split('T')[0]);
    setTriggerAmountInput((t.amount / 100).toFixed(2).replace('.', ','));
    setTriggerAccountId(t.accountId ? String(t.accountId) : '');
    setTriggerCategoryId(t.categoryId ? String(t.categoryId) : '');
    setTriggerMemo(t.memo || '');
    setTriggerIsLastOccurrence(t.remainingOccurrences === 1);
    
    if (t.splits && t.splits.length > 0) {
      setTriggerIsSplit(true);
      setTriggerSplits(t.splits.map(s => ({
        categoryId: s.categoryId ? String(s.categoryId) : '',
        amountInput: (s.amount / 100).toFixed(2).replace('.', ','),
        memo: s.memo || ''
      })));
    } else {
      setTriggerIsSplit(false);
      setTriggerSplits([]);
    }
  };

  const toggleTriggerSplit = (checked: boolean) => {
    setTriggerIsSplit(checked);
    if (checked && triggerSplits.length === 0) {
      setTriggerSplits([
        { categoryId: '', amountInput: '', memo: '' },
        { categoryId: '', amountInput: '', memo: '' }
      ]);
    }
  };

  const confirmTriggerPayment = async () => {
    if (!triggerTarget) return;
    setLoadingId(triggerTarget.id);

    const cents = parseAmountToCents(triggerAmountInput);
    if (isNaN(cents) || cents <= 0) {
      setErrorMessage('Por favor, informe um valor numérico válido.');
      setLoadingId(null);
      return;
    }

    if (!triggerAccountId) {
      setErrorMessage('Por favor, selecione uma conta de lançamento.');
      setLoadingId(null);
      return;
    }

    let payloadSplits: any[] | undefined = undefined;
    if (triggerIsSplit) {
      const totalSplitCents = triggerSplits.reduce((acc, s) => acc + parseAmountToCents(s.amountInput), 0);
      if (totalSplitCents !== cents) {
        setErrorMessage(`A soma das categorias divididas (R$ ${(totalSplitCents / 100).toFixed(2).replace('.', ',')}) deve ser exatamente igual ao valor total informado (R$ ${(cents / 100).toFixed(2).replace('.', ',')}).`);
        setLoadingId(null);
        return;
      }

      const hasEmptyCategory = triggerSplits.some(s => !s.categoryId);
      if (hasEmptyCategory) {
        setErrorMessage('Por favor, selecione uma categoria para cada divisão (split).');
        setLoadingId(null);
        return;
      }

      payloadSplits = triggerSplits.map(s => ({
        categoryId: parseInt(s.categoryId),
        amount: parseAmountToCents(s.amountInput),
        memo: s.memo.trim() || null,
      }));
    }

    const payload = {
      date: triggerDate,
      amount: cents,
      accountId: parseInt(triggerAccountId),
      categoryId: triggerIsSplit ? null : (triggerCategoryId ? parseInt(triggerCategoryId) : null),
      memo: triggerMemo.trim() || null,
      splits: payloadSplits,
      isLastOccurrence: triggerIsLastOccurrence,
    };

    try {
      await api.triggerRecurringTransaction(triggerTarget.id, payload);
      await onRefresh();
      toast.success('Baixa registrada e transação lançada com sucesso!');
    } catch (err: any) {
      setErrorMessage('Erro ao processar baixa: ' + err.message);
      toast.error('Erro ao processar baixa: ' + err.message);
    } finally {
      setLoadingId(null);
      setTriggerTarget(null);
    }
  };

  // Sort by next due date
  const sortedTemplates = useMemo(() => {
    return [...recurringTemplates].sort((a, b) => {
      const dateA = a.nextDueDate || '';
      const dateB = b.nextDueDate || '';
      return dateA.localeCompare(dateB);
    });
  }, [recurringTemplates]);

  // Helper to sort payees alphabetically
  const sortedPayees = useMemo(() => {
    return [...payees].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [payees]);

  // Helper to build hierarchy display
  const categoryTreeOptions = useMemo(() => {
    const parents = [...categories]
      .filter(c => c.parentId === null)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const options: { id: number; displayName: string; type: 'despesa' | 'receita' }[] = [];

    parents.forEach(p => {
      options.push({ id: p.id, displayName: p.name, type: p.type });
      const children = [...categories]
        .filter(c => c.parentId === p.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      children.forEach(c => {
        options.push({ id: c.id, displayName: `${p.name} → ${c.name}`, type: c.type });
      });
    });

    return options;
  }, [categories]);

  // Parse amount input to cents
  const parseAmountToCents = (val: string): number => {
    const clean = val.replace(/[^\d.,]/g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : Math.round(parsed * 100);
  };

  // Toggle tag selection
  const toggleTagSelection = (tagId: number) => {
    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds(selectedTagIds.filter(id => id !== tagId));
    } else {
      setSelectedTagIds([...selectedTagIds, tagId]);
    }
  };

  // Open Form for new Recurring schedule
  const openNewForm = () => {
    setEditingId(null);
    setIsDuplicating(false);
    setAccountId(accounts.length > 0 ? String(accounts[0].id) : '');
    setType('debito');
    setPayee('');
    setSelectedPayeeId('');
    setIsCustomPayee(false);
    setAmountInput('');
    setCategoryId('');
    setRecurrenceInterval('mensal');
    setRemainingOccurrences('');
    setNextDueDate(new Date().toISOString().split('T')[0]);
    setMemo('');
    setSelectedTagIds([]);
    setIsSplit(false);
    setFormSplits([]);
    setShowForm(true);
  };

  // Edit schedule
  const handleEditClick = (t: Transaction) => {
    setEditingId(t.id);
    setIsDuplicating(false);
    setAccountId(String(t.accountId));
    setType(t.type);
    setPayee(t.payee);

    const matchedPayee = payees.find(p => p.name.toLowerCase() === t.payee.toLowerCase());
    if (matchedPayee) {
      setSelectedPayeeId(String(matchedPayee.id));
      setIsCustomPayee(false);
    } else {
      setSelectedPayeeId('custom');
      setIsCustomPayee(true);
    }

    setAmountInput((t.amount / 100).toFixed(2).replace('.', ','));
    setCategoryId(t.categoryId ? String(t.categoryId) : '');
    setRecurrenceInterval((t.recurrenceInterval as any) || 'mensal');
    setRemainingOccurrences(t.remainingOccurrences !== null && t.remainingOccurrences !== undefined ? String(t.remainingOccurrences) : '');
    setNextDueDate(t.nextDueDate || t.date || new Date().toISOString().split('T')[0]);
    setMemo(t.memo || '');
    setSelectedTagIds((t.tags || []).map(tag => tag.id));

    if (t.splits && t.splits.length > 0) {
      setIsSplit(true);
      setFormSplits(t.splits.map(s => ({
        categoryId: s.categoryId ? String(s.categoryId) : '',
        amountInput: (s.amount / 100).toFixed(2).replace('.', ','),
        memo: s.memo || ''
      })));
    } else {
      setIsSplit(false);
      setFormSplits([]);
    }

    setShowForm(true);
  };

  // Delete schedule
  const handleDeleteClick = (t: Transaction) => {
    setDeleteTarget(t);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteTransaction(deleteTarget.id);
      await onRefresh();
      toast.success('Agendamento excluído com sucesso!');
    } catch (err: any) {
      setErrorMessage('Erro ao excluir agendamento: ' + err.message);
      toast.error('Erro ao excluir agendamento: ' + err.message);
    } finally {
      setDeleteTarget(null);
    }
  };

  const triggerDuplicate = (t: Transaction) => {
    setEditingId(null);
    setIsDuplicating(true);
    setAccountId(String(t.accountId));
    setType(t.type);
    setPayee(t.payee);

    const matchedPayee = payees.find(p => p.name.toLowerCase() === t.payee.toLowerCase());
    if (matchedPayee) {
      setSelectedPayeeId(String(matchedPayee.id));
      setIsCustomPayee(false);
    } else {
      setSelectedPayeeId('custom');
      setIsCustomPayee(true);
    }

    setAmountInput((t.amount / 100).toFixed(2).replace('.', ','));
    setCategoryId(t.categoryId ? String(t.categoryId) : '');
    setRecurrenceInterval((t.recurrenceInterval as any) || 'mensal');
    setRemainingOccurrences(t.remainingOccurrences !== null && t.remainingOccurrences !== undefined ? String(t.remainingOccurrences) : '');
    const todayStr = new Date().toLocaleDateString('en-CA');
    setNextDueDate(todayStr);
    setMemo(t.memo || '');
    setSelectedTagIds((t.tags || []).map(tag => tag.id));

    if (t.splits && t.splits.length > 0) {
      setIsSplit(true);
      setFormSplits(t.splits.map(s => ({
        categoryId: s.categoryId ? String(s.categoryId) : '',
        amountInput: (s.amount / 100).toFixed(2).replace('.', ','),
        memo: s.memo || ''
      })));
    } else {
      setIsSplit(false);
      setFormSplits([]);
    }

    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setIsDuplicating(false);
    setAccountId('');
    setType('debito');
    setPayee('');
    setSelectedPayeeId('');
    setIsCustomPayee(false);
    setAmountInput('');
    setCategoryId('');
    setRecurrenceInterval('mensal');
    setRemainingOccurrences('');
    setNextDueDate('');
    setMemo('');
    setSelectedTagIds([]);
    setIsSplit(false);
    setFormSplits([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !payee || !amountInput || !nextDueDate) {
      toast.error('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    const cents = parseAmountToCents(amountInput);
    if (cents <= 0) {
      toast.error('Por favor, insira um valor válido maior que zero.');
      return;
    }

    setFormLoading(true);

    let payloadSplits: any[] | undefined = undefined;
    if (isSplit) {
      const totalSplitCents = formSplits.reduce((acc, s) => acc + parseAmountToCents(s.amountInput), 0);
      if (totalSplitCents !== cents) {
        toast.error(`A soma das categorias divididas (R$ ${(totalSplitCents / 100).toFixed(2).replace('.', ',')}) deve ser igual ao total (R$ ${(cents / 100).toFixed(2).replace('.', ',')}).`);
        setFormLoading(false);
        return;
      }

      const hasEmptyCategory = formSplits.some(s => !s.categoryId);
      if (hasEmptyCategory) {
        toast.error('Por favor, selecione uma categoria para cada divisão (split).');
        setFormLoading(false);
        return;
      }

      payloadSplits = formSplits.map(s => ({
        categoryId: parseInt(s.categoryId),
        amount: parseAmountToCents(s.amountInput),
        memo: s.memo.trim() || null,
      }));
    }

    const payload = {
      accountId: parseInt(accountId),
      date: nextDueDate, // Create template initially on nextDueDate or current date
      payee: payee.trim(),
      amount: cents,
      type,
      categoryId: isSplit ? null : (categoryId ? parseInt(categoryId) : null),
      memo: memo.trim(),
      isRecurring: true,
      recurrenceInterval,
      remainingOccurrences: remainingOccurrences ? parseInt(remainingOccurrences) : null,
      nextDueDate,
      tagIds: selectedTagIds,
      splits: payloadSplits,
    };

    try {
      // Auto-register payee name if custom and doesn't exist
      const payeeName = payee.trim();
      const payeeExists = payees.some(p => p.name.toLowerCase() === payeeName.toLowerCase());
      if (payeeName && !payeeExists) {
        try {
          await api.createPayee({ name: payeeName });
        } catch (errPayee) {
          console.error('Erro ao cadastrar novo beneficiário:', errPayee);
        }
      }

      if (editingId !== null) {
        await api.updateTransaction(editingId, payload);
        toast.success('Agendamento atualizado com sucesso!');
      } else {
        await api.createTransaction(payload);
        toast.success('Compromisso agendado com sucesso!');
      }

      resetForm();
      await onRefresh();
    } catch (err: any) {
      toast.error('Erro ao salvar agendamento: ' + err.message);
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Agenda de Transações Recorrentes
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gerencie despesas e receitas programadas (aluguel, salários, convênios). Dê baixa para registrar o pagamento real.
          </p>
        </div>

        {accounts.length > 0 && !showForm && (
          <button
            onClick={openNewForm}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all shadow-md shadow-emerald-600/10 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Agendar Compromisso
          </button>
        )}
      </div>

      {/* Form Area Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="recurring-form-title">
          <form onSubmit={handleSubmit} className="relative bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 id="recurring-form-title" className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-base">
                <CalendarClock className="w-5 h-5 text-emerald-600" />
                {isDuplicating 
                  ? 'Duplicar Agendamento Recorrente' 
                  : editingId !== null 
                    ? 'Editar Compromisso Recorrente' 
                    : 'Novo Compromisso Recorrente'}
              </h3>
              <button
                type="button"
                onClick={resetForm}
                aria-label="Fechar formulário de agendamento"
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Account Selector */}
            <div>
              <label htmlFor="recurring-account-id" className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Conta Corrente *
              </label>
              <select
                id="recurring-account-id"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-850 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                required
              >
                <option value="">Selecione uma conta...</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>

            {/* Next Due Date Picker */}
            <div>
              <label htmlFor="recurring-next-due-date" className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Próximo Vencimento *
              </label>
              <input
                id="recurring-next-due-date"
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-850 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                required
              />
            </div>

            {/* Type selector (Debit / Credit) */}
            <div>
              <span className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Tipo do Lançamento *
              </span>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de lançamento recorrente">
                <button
                  type="button"
                  onClick={() => setType('debito')}
                  aria-pressed={type === 'debito'}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border focus-visible:ring-2 focus-visible:ring-rose-500 ${
                    type === 'debito'
                      ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 font-extrabold'
                      : 'bg-gray-50 dark:bg-gray-800/40 border-gray-150 dark:border-gray-800 text-gray-500 hover:text-gray-700 dark:text-gray-400'
                  }`}
                >
                  Despesa (Débito)
                </button>
                <button
                  type="button"
                  onClick={() => setType('credito')}
                  aria-pressed={type === 'credito'}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    type === 'credito'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 font-extrabold'
                      : 'bg-gray-50 dark:bg-gray-800/40 border-gray-150 dark:border-gray-800 text-gray-500 hover:text-gray-700 dark:text-gray-400'
                  }`}
                >
                  Receita (Crédito)
                </button>
              </div>
            </div>

            {/* Payee / Origin */}
            <div>
              <label htmlFor={isCustomPayee ? "recurring-payee-input" : "recurring-payee-select"} className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Beneficiário / Origem *
              </label>
              {!isCustomPayee ? (
                <div className="flex gap-2">
                  <select
                    id="recurring-payee-select"
                    value={selectedPayeeId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedPayeeId(val);
                      if (val === 'custom') {
                        setIsCustomPayee(true);
                        setPayee('');
                      } else if (val === '') {
                        setPayee('');
                      } else {
                        const found = payees.find(p => String(p.id) === val);
                        setPayee(found ? found.name : '');
                      }
                    }}
                    className="flex-1 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-850 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    required
                  >
                    <option value="">Selecione um beneficiário...</option>
                    {sortedPayees.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                    <option value="custom" className="font-semibold text-emerald-600 dark:text-emerald-400">+ Novo Beneficiário (escrever)...</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomPayee(true);
                      setSelectedPayeeId('custom');
                      setPayee('');
                    }}
                    className="px-3.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 rounded-xl border border-emerald-200 dark:border-emerald-900/50 text-xs font-semibold shrink-0 focus-visible:ring-2 focus-visible:ring-emerald-500"
                    title="Escrever novo"
                    aria-label="Escrever novo beneficiário manualmente"
                  >
                    Escrever
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    id="recurring-payee-input"
                    type="text"
                    value={payee}
                    onChange={(e) => setPayee(e.target.value)}
                    placeholder="Ex: Supermercado Pão de Açúcar, Salário"
                    className="flex-1 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-850 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomPayee(false);
                      setSelectedPayeeId('');
                      setPayee('');
                    }}
                    className="px-3 bg-gray-50 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-700 shrink-0 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-emerald-500"
                    aria-label="Voltar para seleção de beneficiários existentes"
                  >
                    Voltar
                  </button>
                </div>
              )}
            </div>

            {/* Amount */}
            <div>
              <label htmlFor="recurring-amount-input" className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Valor (R$) *
              </label>
              <input
                id="recurring-amount-input"
                type="text"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0,00"
                className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-850 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono font-bold"
                required
              />
            </div>

            {/* Recurrence Interval */}
            <div>
              <label htmlFor="recurring-interval-select" className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Frequência de Recorrência *
              </label>
              <select
                id="recurring-interval-select"
                value={recurrenceInterval}
                onChange={(e) => setRecurrenceInterval(e.target.value as any)}
                className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-850 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                required
              >
                <option value="diario">Diário</option>
                <option value="semanal">Semanal</option>
                <option value="quinzenal">Quinzenal</option>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </select>
            </div>

            {/* Category selection */}
            <div className="md:col-span-3">
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor={!isSplit ? "recurring-category-select" : undefined} className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider">
                  Categoria de Conta
                </label>
                <label htmlFor="recurring-split-toggle" className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    id="recurring-split-toggle"
                    type="checkbox"
                    checked={isSplit}
                    onChange={(e) => toggleSplit(e.target.checked)}
                    className="w-3.5 h-3.5 text-emerald-600 bg-gray-100 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    Dividir em Múltiplas Categorias (Split)
                  </span>
                </label>
              </div>

              {!isSplit ? (
                <div>
                  <select
                    id="recurring-category-select"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-850 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">Sem categoria (lançamento avulso)</option>
                    {categoryTreeOptions
                      .filter(opt => opt.type === (type === 'debito' ? 'despesa' : 'receita'))
                      .map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.displayName}</option>
                      ))
                    }
                  </select>
                </div>
              ) : (
                <div className="space-y-3 bg-gray-50/50 dark:bg-gray-950/20 p-4 rounded-2xl border border-gray-150 dark:border-gray-850 animate-fade-in">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Divisão de Categorias (Splits)
                  </span>
                  
                  {formSplits.map((s, sidx) => (
                    <div key={sidx} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-850 p-3 rounded-xl shadow-sm relative">
                      {/* Split Category */}
                      <div>
                        <label htmlFor={`form-split-cat-${sidx}`} className="block text-[9px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1">
                          Categoria {sidx + 1}
                        </label>
                        <select
                          id={`form-split-cat-${sidx}`}
                          value={s.categoryId}
                          onChange={(e) => {
                            const updated = [...formSplits];
                            updated[sidx].categoryId = e.target.value;
                            setFormSplits(updated);
                          }}
                          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-white"
                        >
                          <option value="">Selecione a categoria...</option>
                          {categoryTreeOptions
                            .filter(opt => opt.type === (type === 'debito' ? 'despesa' : 'receita'))
                            .map(opt => (
                              <option key={opt.id} value={opt.id}>{opt.displayName}</option>
                            ))
                          }
                        </select>
                      </div>

                      {/* Split Amount */}
                      <div>
                        <label htmlFor={`form-split-amount-${sidx}`} className="block text-[9px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1">
                          Valor (R$)
                        </label>
                        <input
                          id={`form-split-amount-${sidx}`}
                          type="text"
                          value={s.amountInput}
                          onChange={(e) => {
                            const updated = [...formSplits];
                            updated[sidx].amountInput = e.target.value;
                            setFormSplits(updated);
                          }}
                          placeholder="0,00"
                          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-white font-mono font-bold"
                        />
                      </div>

                      {/* Split Memo / Description */}
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label htmlFor={`form-split-memo-${sidx}`} className="block text-[9px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1">
                            Descrição / Memo
                          </label>
                          <input
                            id={`form-split-memo-${sidx}`}
                            type="text"
                            value={s.memo}
                            onChange={(e) => {
                              const updated = [...formSplits];
                              updated[sidx].memo = e.target.value;
                              setFormSplits(updated);
                            }}
                            placeholder="Memo do split..."
                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-white"
                          />
                        </div>
                        {formSplits.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormSplits(formSplits.filter((_, i) => i !== sidx));
                            }}
                            className="text-rose-500 hover:text-rose-600 p-1 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-lg self-end h-[30px] w-[30px] flex items-center justify-center cursor-pointer mb-0.5 focus-visible:ring-2 focus-visible:ring-rose-500"
                            title="Remover Categoria"
                            aria-label={`Remover divisão de categoria ${sidx + 1}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFormSplits([...formSplits, { categoryId: '', amountInput: '', memo: '' }]);
                      }}
                      className="bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
                      aria-label="Adicionar outra divisão de categoria"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar Categoria
                    </button>

                    <div className="text-[11px] font-mono font-bold text-gray-500 dark:text-gray-400 flex items-center gap-3">
                      <span>Total: R$ {amountInput || '0,00'}</span>
                      <span>Dividido: R$ {
                        (formSplits.reduce((acc, s) => acc + parseAmountToCents(s.amountInput), 0) / 100).toFixed(2).replace('.', ',')
                      }</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Remaining Transactions */}
            <div>
              <label htmlFor="recurring-remaining-occurrences" className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Transações Restantes
              </label>
              <input
                id="recurring-remaining-occurrences"
                type="number"
                min="0"
                value={remainingOccurrences}
                onChange={(e) => setRemainingOccurrences(e.target.value)}
                placeholder="Ex: 12 (vazio = Indefinida)"
                className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-850 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono font-bold"
              />
              <span className="text-[10px] text-gray-400 dark:text-gray-400 mt-1 block">
                Zerar ou deixar em branco para recorrência sem fim.
              </span>
            </div>

            {/* Estimated End Date / Status */}
            <div>
              <span className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Término da Recorrência
              </span>
              <div className="w-full bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white flex items-center h-[42px]">
                {estimatedEndDate ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                    📅 Final: {estimatedEndDate}
                  </span>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5">
                    ♾️ Recorrência Indefinida
                  </span>
                )}
              </div>
            </div>

            {/* Memo */}
            <div className="md:col-span-3">
              <label htmlFor="recurring-memo-input" className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Observações
              </label>
              <input
                id="recurring-memo-input"
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Ex: Aluguel mensal do imóvel, Assinatura de streaming"
                className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-850 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {/* Tags Checkbox Area */}
          {tags.length > 0 && (
            <div className="space-y-2 bg-gray-50/50 dark:bg-gray-950/20 p-4 rounded-xl border border-gray-150 dark:border-gray-850">
              <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Vincular Etiquetas (Tags)
              </span>
              <div className="flex flex-wrap gap-2">
                {tags.map(t => {
                  const isSelected = selectedTagIds.includes(t.id);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => toggleTagSelection(t.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all border ${
                        isSelected
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      <span>#</span>
                      <span>{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800 pt-4">
            <button
              type="button"
              onClick={resetForm}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-850 rounded-xl"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={formLoading}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-6 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all shadow-md shadow-emerald-600/10 font-bold"
            >
              {formLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
              {isDuplicating 
                ? 'Confirmar Duplicação' 
                : editingId !== null 
                  ? 'Salvar Alterações' 
                  : 'Criar Agendamento'}
            </button>
          </div>
        </form>
      </div>
      )}

      {sortedTemplates.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-8 shadow-sm">
          <EmptyState
            icon={CalendarClock}
            title="Nenhum compromisso agendado"
            description="Cadastre receitas e despesas recorrentes (aluguel, salário, assinaturas) para controlar vencimentos e dar baixa com 1 clique."
            actionLabel="Agendar Primeiro Compromisso"
            onAction={openNewForm}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-250 dark:border-emerald-900 p-4 rounded-2xl flex gap-3 text-xs text-emerald-800 dark:text-emerald-300">
            <Info className="w-5 h-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p>
              <strong>O que é dar baixa?</strong> Ao clicar em "Confirmar Baixa", o sistema criará uma transação financeira real na data atual do agendamento, descontando ou somando o saldo correspondente, e avançará automaticamente a próxima data de vencimento da regra recorrente.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {sortedTemplates.map((item) => {
              const isOverdue = item.nextDueDate ? item.nextDueDate < new Date().toISOString().split('T')[0] : false;
              const isRevenue = item.type === 'credito';
              const isLoading = loadingId === item.id;

              return (
                <div 
                  key={item.id} 
                  className={`bg-white dark:bg-gray-900 border rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all shadow-sm ${
                    isOverdue 
                      ? 'border-rose-300 ring-2 ring-rose-500/5 dark:border-rose-900' 
                      : 'border-gray-200 dark:border-gray-800'
                  }`}
                >
                  <div className="flex items-start md:items-center gap-4 flex-1">
                    {/* Icon indicator */}
                    <div className={`p-3 rounded-xl ${
                      isRevenue 
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' 
                        : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                    }`}>
                      {isRevenue ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    </div>

                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                          {item.payee}
                        </h3>
                        <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 font-mono px-2 py-0.5 rounded-md border border-gray-150">
                          CONTA: {item.account?.name}
                        </span>
                        <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                          {item.recurrenceInterval === 'diario' ? 'Diário' :
                           item.recurrenceInterval === 'semanal' ? 'Semanal' :
                           item.recurrenceInterval === 'quinzenal' ? 'Quinzenal' :
                           item.recurrenceInterval === 'mensal' ? 'Mensal' :
                           item.recurrenceInterval === 'anual' ? 'Anual' :
                           item.recurrenceInterval || 'Mensal'}
                        </span>
                        {item.remainingOccurrences !== null && item.remainingOccurrences !== undefined && item.remainingOccurrences > 0 ? (
                          <>
                            <span className="text-[10px] bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 font-bold px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-0.5">
                              Restam: {item.remainingOccurrences} {item.remainingOccurrences === 1 ? 'vez' : 'vezes'}
                            </span>
                            {(() => {
                              const finalDate = calculateEndDate(item.nextDueDate, item.recurrenceInterval, item.remainingOccurrences);
                              return finalDate ? (
                                <span className="text-[10px] bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                                  Final: {formatDate(finalDate)}
                                </span>
                              ) : null;
                            })()}
                          </>
                        ) : (
                          <span className="text-[10px] bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                            ♾️ Indefinida
                          </span>
                        )}
                      </div>

                      {item.splits && item.splits.length > 0 ? (
                        <div className="flex flex-col gap-1 mt-1">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200/55 w-fit">
                            Múltiplas Categorias ({item.splits.length})
                          </span>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {item.splits.map((s: any, sidx: number) => (
                              <div key={sidx} className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                <span>• {s.category?.name || 'Sem nome'}</span>
                                <span className="font-mono font-semibold">({formatCurrency(s.amount)})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">
                          {item.category ? item.category.name : 'Sem Categoria'} {item.memo && `• ${item.memo}`}
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 pt-0.5 text-xs">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-gray-500">Próximo vencimento:</span>
                        <span className={`font-mono font-bold ${isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-gray-800 dark:text-gray-200'}`}>
                          {item.nextDueDate ? formatDate(item.nextDueDate) : 'N/A'}
                        </span>
                        {isOverdue && (
                          <span className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200/50 text-rose-600 dark:text-rose-400 text-[9px] font-bold px-1.5 py-0.5 rounded">
                            VENCIDO
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-gray-100 dark:border-gray-800 pt-3 md:pt-0">
                    {/* Expected Value */}
                    <div className="text-left md:text-right font-mono mr-2">
                      <span className="block text-[9px] font-sans font-bold text-gray-400 uppercase tracking-wider">
                        Valor Previsto
                      </span>
                      <span className={`text-base font-bold ${isRevenue ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isRevenue ? '+' : '-'}{formatCurrency(item.amount)}
                      </span>
                    </div>

                    {/* Action buttons (Maintenance: edit, delete) */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => triggerDuplicate(item)}
                        className="p-2 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-all border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus-visible:ring-2 focus-visible:ring-amber-500"
                        title="Duplicar Agendamento"
                        aria-label={`Duplicar agendamento de ${item.payee}`}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEditClick(item)}
                        className="p-2 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-all border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus-visible:ring-2 focus-visible:ring-emerald-500"
                        title="Editar Agendamento"
                        aria-label={`Editar agendamento de ${item.payee}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(item)}
                        className="p-2 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-all border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus-visible:ring-2 focus-visible:ring-rose-500"
                        title="Excluir Agendamento"
                        aria-label={`Excluir agendamento de ${item.payee}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleTriggerPayment(item)}
                        disabled={isLoading}
                        aria-label={`Dar baixa no agendamento de ${item.payee}`}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-3.5 py-2 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/10 ml-2 focus-visible:ring-2 focus-visible:ring-emerald-500"
                      >
                        {isLoading ? (
                          <RefreshCw className="w-3 animate-spin" />
                        ) : (
                          <CheckSquare className="w-3 h-3" />
                        )}
                        Dar Baixa
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Custom Confirmation Modals */}
      {(deleteTarget || triggerTarget || errorMessage) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">

          {deleteTarget && (
            <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 border border-gray-150 dark:border-gray-800 shadow-xl space-y-4" role="dialog" aria-modal="true" aria-labelledby="recurring-delete-title">
              <div className="flex items-center gap-3 text-rose-600">
                <div className="p-2 bg-rose-50 dark:bg-rose-950/30 rounded-xl">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 id="recurring-delete-title" className="text-lg font-bold text-gray-900 dark:text-white font-sans">Excluir Agendamento</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Deseja realmente excluir o agendamento recorrente de <strong className="text-gray-950 dark:text-white">"{deleteTarget.payee}"</strong> no valor de <strong className="text-gray-950 dark:text-white">{formatCurrency(deleteTarget.amount)}</strong>?
              </p>
              <p className="text-xs text-rose-500/80 bg-rose-50/50 dark:bg-rose-950/10 p-2.5 rounded-lg">
                Esta ação é irreversível. Lançamentos reais anteriores criados a partir deste agendamento não serão alterados.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-850 text-gray-700 dark:text-gray-300 font-medium text-xs transition-colors focus-visible:ring-2 focus-visible:ring-gray-400"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-md shadow-rose-600/15 transition-all focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  Excluir
                </button>
              </div>
            </div>
          )}

          {triggerTarget && (
            <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-lg w-full p-6 border border-gray-150 dark:border-gray-800 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="recurring-trigger-title">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
                <div className="flex items-center gap-3 text-emerald-600">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl">
                    <CheckSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 id="recurring-trigger-title" className="text-base font-bold text-gray-900 dark:text-white font-sans">Dar Baixa no Compromisso</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-400">"{triggerTarget.payee}"</p>
                  </div>
                </div>
                <button
                  onClick={() => setTriggerTarget(null)}
                  aria-label="Fechar janela de baixa"
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 pt-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Confirme ou ajuste os dados reais da movimentação antes de registrar a transação no fluxo de caixa.
                </p>

                {/* Date, Value & Account Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor="trigger-payment-date" className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Data da Transação
                    </label>
                    <input
                      id="trigger-payment-date"
                      type="date"
                      value={triggerDate}
                      onChange={(e) => setTriggerDate(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-750 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div>
                    <label htmlFor="trigger-payment-amount" className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Valor Real (R$)
                    </label>
                    <input
                      id="trigger-payment-amount"
                      type="text"
                      value={triggerAmountInput}
                      onChange={(e) => setTriggerAmountInput(e.target.value)}
                      placeholder="0,00"
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-750 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="trigger-payment-account" className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Conta de Lançamento
                    </label>
                    <select
                      id="trigger-payment-account"
                      value={triggerAccountId}
                      onChange={(e) => setTriggerAccountId(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-750 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="">Selecione uma conta...</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="trigger-payment-memo" className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Memo / Descrição Adicional
                    </label>
                    <input
                      id="trigger-payment-memo"
                      type="text"
                      value={triggerMemo}
                      onChange={(e) => setTriggerMemo(e.target.value)}
                      placeholder="Ex: Baixa de energia elétrica do mês"
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-750 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>

                {/* Checkbox for Last Occurrence */}
                <div className="flex items-center gap-2.5 p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-150 dark:border-emerald-900/40">
                  <input
                    id="trigger-is-last-occurrence"
                    type="checkbox"
                    checked={triggerIsLastOccurrence}
                    onChange={(e) => setTriggerIsLastOccurrence(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 dark:border-gray-600 cursor-pointer"
                  />
                  <label htmlFor="trigger-is-last-occurrence" className="text-xs font-semibold text-gray-800 dark:text-gray-200 cursor-pointer select-none">
                    Esta é a última parcela (encerrar agendamento e não gerar novas cobranças)
                  </label>
                </div>

                {/* Category selection */}
                <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor={!triggerIsSplit ? "trigger-payment-category" : undefined} className="block text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider">
                      Categoria do Lançamento
                    </label>
                    <label htmlFor="trigger-split-toggle" className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        id="trigger-split-toggle"
                        type="checkbox"
                        checked={triggerIsSplit}
                        onChange={(e) => toggleTriggerSplit(e.target.checked)}
                        className="w-3.5 h-3.5 text-emerald-600 bg-gray-100 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        Dividir em Múltiplas Categorias (Split)
                      </span>
                    </label>
                  </div>

                  {!triggerIsSplit ? (
                    <div>
                      <select
                        id="trigger-payment-category"
                        value={triggerCategoryId}
                        onChange={(e) => setTriggerCategoryId(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-750 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="">Sem categoria (lançamento avulso)</option>
                        {categoryTreeOptions
                          .filter(opt => opt.type === (triggerTarget.type === 'debito' ? 'despesa' : 'receita'))
                          .map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.displayName}</option>
                          ))
                        }
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-3 bg-gray-50/50 dark:bg-gray-950/20 p-3 rounded-2xl border border-gray-150 dark:border-gray-800/80 max-h-[220px] overflow-y-auto">
                      {triggerSplits.map((s, sidx) => (
                        <div key={sidx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 p-2.5 rounded-xl shadow-xs relative">
                          {/* Split Category */}
                          <div>
                            <label htmlFor={`trigger-split-cat-${sidx}`} className="block text-[9px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-0.5">
                              Categoria {sidx + 1}
                            </label>
                            <select
                              id={`trigger-split-cat-${sidx}`}
                              value={s.categoryId}
                              onChange={(e) => {
                                const updated = [...triggerSplits];
                                updated[sidx].categoryId = e.target.value;
                                setTriggerSplits(updated);
                              }}
                              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-white"
                            >
                              <option value="">Selecione...</option>
                              {categoryTreeOptions
                                .filter(opt => opt.type === (triggerTarget.type === 'debito' ? 'despesa' : 'receita'))
                                .map(opt => (
                                  <option key={opt.id} value={opt.id}>{opt.displayName}</option>
                                ))
                              }
                            </select>
                          </div>

                          {/* Split Amount */}
                          <div>
                            <label htmlFor={`trigger-split-amount-${sidx}`} className="block text-[9px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-0.5">
                              Valor (R$)
                            </label>
                            <input
                              id={`trigger-split-amount-${sidx}`}
                              type="text"
                              value={s.amountInput}
                              onChange={(e) => {
                                const updated = [...triggerSplits];
                                updated[sidx].amountInput = e.target.value;
                                setTriggerSplits(updated);
                              }}
                              placeholder="0,00"
                              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-white font-mono font-bold"
                            />
                          </div>

                          {/* Split Memo / Delete */}
                          <div className="flex gap-1.5">
                            <div className="flex-1">
                              <label htmlFor={`trigger-split-memo-${sidx}`} className="block text-[9px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-0.5">
                                Memo
                              </label>
                              <input
                                id={`trigger-split-memo-${sidx}`}
                                type="text"
                                value={s.memo}
                                onChange={(e) => {
                                  const updated = [...triggerSplits];
                                  updated[sidx].memo = e.target.value;
                                  setTriggerSplits(updated);
                                }}
                                placeholder="Memo..."
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-white"
                              />
                            </div>
                            {triggerSplits.length > 2 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTriggerSplits(triggerSplits.filter((_, i) => i !== sidx));
                                }}
                                className="text-rose-500 hover:text-rose-600 p-1 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 rounded-lg self-end h-[28px] w-[28px] flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-500"
                                title="Remover"
                                aria-label={`Remover divisão de categoria ${sidx + 1}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setTriggerSplits([...triggerSplits, { categoryId: '', amountInput: '', memo: '' }]);
                          }}
                          className="bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
                          aria-label="Adicionar divisão de categoria"
                        >
                          <Plus className="w-3 h-3" />
                          Adicionar Categoria
                        </button>

                        <div className="text-[10px] font-mono font-bold text-gray-500 dark:text-gray-400 flex flex-col items-end">
                          <span>Total: R$ {triggerAmountInput || '0,00'}</span>
                          <span className={
                            parseAmountToCents(triggerAmountInput) === triggerSplits.reduce((acc, s) => acc + parseAmountToCents(s.amountInput), 0)
                              ? 'text-emerald-600'
                              : 'text-amber-600'
                          }>
                            Dividido: R$ {
                              (triggerSplits.reduce((acc, s) => acc + parseAmountToCents(s.amountInput), 0) / 100).toFixed(2).replace('.', ',')
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800 pt-4">
                <button
                  type="button"
                  onClick={() => setTriggerTarget(null)}
                  className="px-4 py-2 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-850 text-gray-700 dark:text-gray-300 font-medium text-xs transition-colors focus-visible:ring-2 focus-visible:ring-gray-400"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmTriggerPayment}
                  disabled={loadingId !== null}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/15 flex items-center gap-1.5 transition-all focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  {loadingId !== null ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5" />}
                  Confirmar Baixa
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 border border-gray-150 dark:border-gray-800 shadow-xl space-y-4" role="alertdialog" aria-modal="true" aria-labelledby="recurring-error-title" aria-live="polite">
              <div className="flex items-center gap-3 text-rose-600">
                <div className="p-2 bg-rose-50 dark:bg-rose-950/30 rounded-xl">
                  <X className="w-6 h-6" />
                </div>
                <h3 id="recurring-error-title" className="text-lg font-bold text-gray-900 dark:text-white font-sans">Aviso</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {errorMessage}
              </p>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setErrorMessage(null)}
                  className="px-5 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-bold text-xs transition-all focus-visible:ring-2 focus-visible:ring-gray-400"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
