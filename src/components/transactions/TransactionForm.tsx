import React, { useState, useEffect, useMemo } from 'react';
import { Account, Category, Tag, Payee, Transaction } from '../../types.ts';
import { formatCurrency, parseAmountToCents } from '../../lib/utils.ts';
import { TransactionSplitForm, SplitFormItem } from './TransactionSplitForm.tsx';
import { 
  ArrowLeftRight, 
  Calendar, 
  Wallet, 
  Tag as TagIcon, 
  Repeat, 
  Layers, 
  AlertCircle,
  Copy,
  Edit3,
  PlusCircle,
  Check,
  UserCheck
} from 'lucide-react';

interface TransactionFormProps {
  editingTransaction: Transaction | null;
  isDuplicating: boolean;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  payees: Payee[];
  onSave: (payload: any) => Promise<void>;
  onCancel: () => void;
}

export const TransactionForm: React.FC<TransactionFormProps> = ({
  editingTransaction,
  isDuplicating,
  accounts,
  categories,
  tags,
  payees,
  onSave,
  onCancel,
}) => {
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState('');
  const [payee, setPayee] = useState('');
  const [selectedPayeeId, setSelectedPayeeId] = useState('');
  const [isCustomPayee, setIsCustomPayee] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [type, setType] = useState<'debito' | 'credito'>('debito');
  const [categoryId, setCategoryId] = useState('');
  const [memo, setMemo] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'anual'>('mensal');
  const [remainingOccurrences, setRemainingOccurrences] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [isSplit, setIsSplit] = useState(false);
  const [formSplits, setFormSplits] = useState<SplitFormItem[]>([]);
  
  // Validation and submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});

  // Initialize or reset form based on editingTransaction or isDuplicating
  useEffect(() => {
    if (editingTransaction) {
      setAccountId(String(editingTransaction.accountId));
      const txDate = isDuplicating
        ? new Date().toLocaleDateString('en-CA')
        : (editingTransaction.isRecurring ? (editingTransaction.nextDueDate || editingTransaction.date) : editingTransaction.date);
      setDate(txDate);
      setPayee(editingTransaction.payee);

      const matchedPayee = payees.find(p => p.name.toLowerCase() === editingTransaction.payee.toLowerCase());
      if (matchedPayee) {
        setSelectedPayeeId(String(matchedPayee.id));
        setIsCustomPayee(false);
      } else {
        setSelectedPayeeId('custom');
        setIsCustomPayee(true);
      }

      setAmountInput((editingTransaction.amount / 100).toFixed(2).replace('.', ','));
      setType(editingTransaction.type);
      setCategoryId(editingTransaction.categoryId ? String(editingTransaction.categoryId) : '');
      setMemo(editingTransaction.memo || '');
      setIsRecurring(isDuplicating ? false : Boolean(editingTransaction.isRecurring));
      setRecurrenceInterval((editingTransaction.recurrenceInterval as any) || 'mensal');
      setRemainingOccurrences(
        isDuplicating
          ? ''
          : (editingTransaction.remainingOccurrences !== null && editingTransaction.remainingOccurrences !== undefined
              ? String(editingTransaction.remainingOccurrences)
              : '')
      );
      setNextDueDate(isDuplicating ? txDate : (editingTransaction.nextDueDate || txDate));
      setSelectedTagIds((editingTransaction.tags || []).map(tag => tag.id));

      if (editingTransaction.splits && editingTransaction.splits.length > 0) {
        setIsSplit(true);
        setFormSplits(editingTransaction.splits.map(s => ({
          categoryId: s.categoryId ? String(s.categoryId) : '',
          amountInput: (s.amount / 100).toFixed(2).replace('.', ','),
          memo: s.memo || '',
        })));
      } else {
        setIsSplit(false);
        setFormSplits([]);
      }
    } else {
      // New transaction defaults
      const todayStr = new Date().toLocaleDateString('en-CA');
      setAccountId(accounts.length > 0 ? String(accounts[0].id) : '');
      setDate(todayStr);
      setPayee('');
      setSelectedPayeeId('');
      setIsCustomPayee(false);
      setAmountInput('');
      setType('debito');
      setCategoryId('');
      setMemo('');
      setIsRecurring(false);
      setRecurrenceInterval('mensal');
      setRemainingOccurrences('');
      setNextDueDate(todayStr);
      setSelectedTagIds([]);
      setIsSplit(false);
      setFormSplits([]);
    }
    setValidationError(null);
    setTouchedFields({});
  }, [editingTransaction, isDuplicating, payees, accounts]);

  // Handle date change and sync nextDueDate if new recurring
  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    if (!editingTransaction && isRecurring) {
      setNextDueDate(newDate);
    }
  };

  // Toggle split mode
  const handleToggleSplit = (checked: boolean) => {
    setIsSplit(checked);
    if (checked && formSplits.length === 0) {
      const totalCents = parseAmountToCents(amountInput);
      const halfCents = Math.floor(totalCents / 2);
      const otherHalfCents = totalCents - halfCents;
      setFormSplits([
        {
          categoryId: categoryId || '',
          amountInput: halfCents > 0 ? (halfCents / 100).toFixed(2).replace('.', ',') : '',
          memo: ''
        },
        {
          categoryId: '',
          amountInput: otherHalfCents > 0 ? (otherHalfCents / 100).toFixed(2).replace('.', ',') : '',
          memo: ''
        }
      ]);
    }
  };

  const toggleTagSelection = (tagId: number) => {
    setSelectedTagIds(prev => 
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  // Sorted payees list
  const sortedPayees = useMemo(() => {
    return [...payees].sort((a, b) => a.name.localeCompare(b.name));
  }, [payees]);

  // Frequent / top 4 payees for quick click
  const quickPayees = useMemo(() => {
    return sortedPayees.slice(0, 4);
  }, [sortedPayees]);

  // Hierarchical category options formatted with indicators
  const categoryTreeOptions = useMemo(() => {
    const parents = categories.filter(c => c.parentId === null);
    const result: { id: number; displayName: string; type: string }[] = [];

    parents.forEach(p => {
      result.push({ id: p.id, displayName: p.name, type: p.type });
      const children = categories.filter(c => c.parentId === p.id);
      children.forEach(c => {
        result.push({ id: c.id, displayName: `↳ ${c.name} (${p.name})`, type: c.type });
      });
    });

    return result;
  }, [categories]);

  // Filter categories by type
  const availableCategories = useMemo(() => {
    const targetType = type === 'debito' ? 'despesa' : 'receita';
    return categoryTreeOptions.filter(opt => opt.type === targetType);
  }, [categoryTreeOptions, type]);

  // Estimated end date for recurring
  const estimatedEndDate = useMemo(() => {
    if (!isRecurring) return null;
    const num = parseInt(remainingOccurrences);
    if (isNaN(num) || num <= 0) return null;

    const base = new Date(nextDueDate || date);
    if (isNaN(base.getTime())) return null;

    const targetDate = new Date(base);
    for (let i = 1; i < num; i++) {
      if (recurrenceInterval === 'diario') {
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (recurrenceInterval === 'semanal') {
        targetDate.setDate(targetDate.getDate() + 7);
      } else if (recurrenceInterval === 'quinzenal') {
        targetDate.setDate(targetDate.getDate() + 15);
      } else if (recurrenceInterval === 'mensal') {
        targetDate.setMonth(targetDate.getMonth() + 1);
      } else if (recurrenceInterval === 'anual') {
        targetDate.setFullYear(targetDate.getFullYear() + 1);
      }
    }

    return targetDate.toLocaleDateString('pt-BR');
  }, [isRecurring, remainingOccurrences, nextDueDate, date, recurrenceInterval]);

  const currentTotalCents = useMemo(() => {
    return parseAmountToCents(amountInput);
  }, [amountInput]);

  const markFieldTouched = (field: string) => {
    setTouchedFields(prev => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Validate account
    if (!accountId) {
      setValidationError('Por favor, selecione uma conta corrente.');
      markFieldTouched('accountId');
      return;
    }

    // Validate date
    if (!date) {
      setValidationError('Por favor, informe a data do lançamento.');
      markFieldTouched('date');
      return;
    }

    // Validate payee
    const finalPayee = payee.trim();
    if (!finalPayee) {
      setValidationError('Por favor, informe o beneficiário ou origem do lançamento.');
      markFieldTouched('payee');
      return;
    }

    // Validate amount
    const cents = parseAmountToCents(amountInput);
    if (cents <= 0) {
      setValidationError('Por favor, informe um valor monetário válido maior que zero.');
      markFieldTouched('amount');
      return;
    }

    // Validate splits if active
    let payloadSplits: any[] | undefined = undefined;
    if (isSplit) {
      if (formSplits.length < 2) {
        setValidationError('A divisão (split) requer pelo menos duas categorias.');
        return;
      }

      const totalSplitCents = formSplits.reduce((acc, s) => acc + parseAmountToCents(s.amountInput), 0);
      if (totalSplitCents !== cents) {
        const diff = Math.abs(cents - totalSplitCents);
        setValidationError(
          `A soma dos splits (${formatCurrency(totalSplitCents)}) deve ser exatamente igual ao valor total (${formatCurrency(cents)}). Diferença: ${formatCurrency(diff)}.`
        );
        return;
      }

      const hasEmptyCategory = formSplits.some(s => !s.categoryId);
      if (hasEmptyCategory) {
        setValidationError('Todas as linhas de divisão de categoria precisam ter uma categoria selecionada.');
        return;
      }

      payloadSplits = formSplits.map(s => ({
        categoryId: s.categoryId ? parseInt(s.categoryId) : null,
        amount: parseAmountToCents(s.amountInput),
        memo: s.memo.trim() || null
      }));
    }

    const effectiveDateVal = isRecurring ? (nextDueDate || date) : date;
    const effectiveNextDueDateVal = isRecurring ? (nextDueDate || date) : null;

    const payload = {
      accountId: parseInt(accountId),
      date: effectiveDateVal,
      payee: finalPayee,
      amount: cents,
      type,
      categoryId: isSplit ? null : (categoryId ? parseInt(categoryId) : null),
      memo: memo.trim(),
      isRecurring,
      recurrenceInterval: isRecurring ? recurrenceInterval : null,
      remainingOccurrences: isRecurring && remainingOccurrences ? parseInt(remainingOccurrences) : null,
      nextDueDate: effectiveNextDueDateVal,
      tagIds: selectedTagIds,
      splits: payloadSplits,
    };

    setIsSubmitting(true);
    try {
      await onSave(payload);
    } catch (err: any) {
      setValidationError(err.message || 'Erro ao salvar lançamento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Mode Banner Indicator */}
      <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
        isDuplicating
          ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
          : editingTransaction
            ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60 text-blue-900 dark:text-blue-200'
            : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200'
      }`}>
        <div className="flex items-center gap-2.5">
          {isDuplicating ? (
            <Copy className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : editingTransaction ? (
            <Edit3 className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
          ) : (
            <PlusCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          )}
          <div>
            <h4 className="text-sm font-bold">
              {isDuplicating
                ? 'Duplicando Lançamento'
                : editingTransaction
                  ? `Editando Lançamento #${editingTransaction.id}`
                  : 'Novo Lançamento Financeiro'}
            </h4>
            <p className="text-xs opacity-80">
              {isDuplicating
                ? 'Será criado um novo registro independente com os dados pré-preenchidos.'
                : editingTransaction
                  ? 'As alterações substituirão os dados do registro existente.'
                  : 'Preencha os campos abaixo para registrar sua despesa ou receita.'}
            </p>
          </div>
        </div>

        {/* Selected Account balance pill if exists */}
        {accountId && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/70 dark:bg-gray-900/60 border border-current/20 text-xs font-mono font-semibold shrink-0">
            <Wallet className="w-3.5 h-3.5 opacity-70" />
            <span>Saldo Atual: {formatCurrency(accounts.find(a => a.id === parseInt(accountId))?.currentBalance ?? 0)}</span>
          </div>
        )}
      </div>

      {/* Validation Error Banner */}
      {validationError && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-xs font-medium flex items-start gap-2.5 animate-fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Section 1: Informações Principais */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-gray-150 dark:border-gray-800 pb-2">
          <ArrowLeftRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
            1. Dados Principais
          </h3>
        </div>

        {/* Type selector (Débito vs Crédito) */}
        <div>
          <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Tipo de Lançamento *
          </label>
          <div className="grid grid-cols-2 gap-3 p-1 bg-gray-100 dark:bg-gray-850 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setType('debito');
                // If current category doesn't match new type, clear category
                if (categoryId) {
                  const cat = categories.find(c => c.id === parseInt(categoryId));
                  if (cat && cat.type !== 'despesa') setCategoryId('');
                }
              }}
              aria-pressed={type === 'debito'}
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                type === 'debito'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current" />
              Débito (Despesa / Saída)
            </button>
            <button
              type="button"
              onClick={() => {
                setType('credito');
                // If current category doesn't match new type, clear category
                if (categoryId) {
                  const cat = categories.find(c => c.id === parseInt(categoryId));
                  if (cat && cat.type !== 'receita') setCategoryId('');
                }
              }}
              aria-pressed={type === 'credito'}
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                type === 'credito'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current" />
              Crédito (Receita / Entrada)
            </button>
          </div>
        </div>

        {/* Primary Row: Account, Date, Amount */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Account */}
          <div>
            <label htmlFor="form-account-id" className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Conta Corrente *
            </label>
            <select
              id="form-account-id"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                markFieldTouched('accountId');
              }}
              className={`w-full bg-gray-50 dark:bg-gray-800/70 border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                !accountId && touchedFields.accountId
                  ? 'border-rose-400 dark:border-rose-600'
                  : 'border-gray-200 dark:border-gray-750'
              }`}
              required
            >
              <option value="">Selecione uma conta...</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({formatCurrency(acc.currentBalance ?? 0)})
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label htmlFor="form-tx-date" className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Data do Lançamento *
            </label>
            <div className="relative">
              <input
                id="form-tx-date"
                type="date"
                value={date}
                onChange={(e) => {
                  handleDateChange(e.target.value);
                  markFieldTouched('date');
                }}
                className={`w-full bg-gray-50 dark:bg-gray-800/70 border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                  !date && touchedFields.date
                    ? 'border-rose-400 dark:border-rose-600'
                    : 'border-gray-200 dark:border-gray-750'
                }`}
                required
              />
            </div>
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="form-tx-amount" className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Valor (R$) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-sm font-bold text-gray-400 dark:text-gray-500 select-none">
                R$
              </span>
              <input
                id="form-tx-amount"
                type="text"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  markFieldTouched('amount');
                }}
                placeholder="0,00"
                className={`w-full bg-gray-50 dark:bg-gray-800/70 border rounded-xl pl-10 pr-3 py-2.5 text-sm text-gray-900 dark:text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                  (!amountInput || parseAmountToCents(amountInput) <= 0) && touchedFields.amount
                    ? 'border-rose-400 dark:border-rose-600'
                    : 'border-gray-200 dark:border-gray-750'
                }`}
                required
              />
            </div>
          </div>
        </div>

        {/* Beneficiário (Payee) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor={!isCustomPayee ? "form-payee-select" : "form-payee-input"} className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Beneficiário / Origem *
            </label>
            <button
              type="button"
              onClick={() => {
                setIsCustomPayee(!isCustomPayee);
                if (!isCustomPayee) {
                  setSelectedPayeeId('custom');
                } else {
                  setSelectedPayeeId('');
                  setPayee('');
                }
              }}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              {!isCustomPayee ? '+ Escrever novo beneficiário' : 'Selecionar da lista salva'}
            </button>
          </div>

          {!isCustomPayee ? (
            <div className="space-y-2">
              <select
                id="form-payee-select"
                value={selectedPayeeId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedPayeeId(val);
                  markFieldTouched('payee');
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
                className={`w-full bg-gray-50 dark:bg-gray-800/70 border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                  !payee && touchedFields.payee
                    ? 'border-rose-400 dark:border-rose-600'
                    : 'border-gray-200 dark:border-gray-750'
                }`}
                required
              >
                <option value="">Selecione um beneficiário salvo...</option>
                {sortedPayees.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                <option value="custom" className="font-semibold text-emerald-600 dark:text-emerald-400">
                  + Outro beneficiário (digitar livremente)...
                </option>
              </select>

              {/* Quick payee suggestion chips */}
              {quickPayees.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider mr-1">Sugestões:</span>
                  {quickPayees.map(p => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        setSelectedPayeeId(String(p.id));
                        setPayee(p.name);
                        setIsCustomPayee(false);
                      }}
                      className={`text-[11px] px-2.5 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                        payee.toLowerCase() === p.name.toLowerCase()
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-300'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <input
                id="form-payee-input"
                type="text"
                value={payee}
                onChange={(e) => {
                  setPayee(e.target.value);
                  markFieldTouched('payee');
                }}
                placeholder="Ex: Supermercado Pão de Açúcar, Salário Mensal, Posto Shell..."
                className={`w-full bg-gray-50 dark:bg-gray-800/70 border rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                  !payee && touchedFields.payee
                    ? 'border-rose-400 dark:border-rose-600'
                    : 'border-gray-200 dark:border-gray-750'
                }`}
                required
                autoFocus
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Ao salvar, este beneficiário será automaticamente adicionado ao catálogo para futuros lançamentos.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Categorização e Divisão */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-gray-150 dark:border-gray-800 pb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
              2. Classificação & Categorização
            </h3>
          </div>

          {/* Split Mode Toggle Button */}
          <label htmlFor="form-is-split-toggle" className="flex items-center gap-2 cursor-pointer select-none">
            <input
              id="form-is-split-toggle"
              type="checkbox"
              checked={isSplit}
              onChange={(e) => handleToggleSplit(e.target.checked)}
              className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer"
            />
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
              Dividir em Múltiplas Categorias (Split)
            </span>
          </label>
        </div>

        {!isSplit ? (
          <div>
            <label htmlFor="form-category-id" className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Categoria Principal ({type === 'debito' ? 'Despesa' : 'Receita'})
            </label>
            <select
              id="form-category-id"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-750 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Sem categoria definida (lançamento avulso)</option>
              {availableCategories.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.displayName}</option>
              ))}
            </select>
          </div>
        ) : (
          <TransactionSplitForm
            splits={formSplits}
            totalCents={currentTotalCents}
            categoryOptions={categoryTreeOptions}
            transactionType={type}
            onChange={setFormSplits}
            hasErrors={Boolean(validationError)}
          />
        )}

        {/* Memo / Observações */}
        <div>
          <label htmlFor="form-tx-memo" className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Observações / Detalhes (Memo)
          </label>
          <input
            id="form-tx-memo"
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Ex: Almoço de negócios com equipe, Parcela 03/10 notebook, etc."
            className="w-full bg-gray-50 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-750 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {/* Tags / Etiquetas Multi-selection */}
        {tags.length > 0 && (
          <div className="space-y-2 bg-gray-50/60 dark:bg-gray-950/20 p-3.5 rounded-2xl border border-gray-150 dark:border-gray-800">
            <div className="flex items-center gap-1.5">
              <TagIcon className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Vincular Etiquetas (Tags)
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(t => {
                const isSelected = selectedTagIds.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => toggleTagSelection(t.id)}
                    aria-pressed={isSelected}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      isSelected
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                        : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700'
                    }`}
                  >
                    <span className="text-[10px] opacity-70">#</span>
                    <span>{t.name}</span>
                    {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Recorrência e Agendamento */}
      <div className="space-y-3 bg-gray-50/60 dark:bg-gray-950/30 p-4 rounded-2xl border border-gray-200 dark:border-gray-800">
        <label htmlFor="form-tx-recurring" className="flex items-center gap-3 cursor-pointer select-none">
          <input
            id="form-tx-recurring"
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer"
          />
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <Repeat className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Lançamento Agendado e Recorrente (Aluguel, Assinaturas, Salários)
            </span>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Gere transações automáticas conforme o intervalo e número de ocorrências desejado.
            </p>
          </div>
        </label>

        {isRecurring && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-gray-200 dark:border-gray-800 animate-fade-in">
            {/* Interval */}
            <div>
              <label htmlFor="form-recurrence-interval" className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Frequência *
              </label>
              <select
                id="form-recurrence-interval"
                value={recurrenceInterval}
                onChange={(e) => setRecurrenceInterval(e.target.value as any)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-750 rounded-xl px-2.5 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="diario">Diário</option>
                <option value="semanal">Semanal</option>
                <option value="quinzenal">Quinzenal</option>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </select>
            </div>

            {/* Next Due Date */}
            <div>
              <label htmlFor="form-next-due-date" className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Próximo Vencimento *
              </label>
              <input
                id="form-next-due-date"
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-750 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                required={isRecurring}
              />
            </div>

            {/* Remaining Occurrences */}
            <div>
              <label htmlFor="form-remaining-occurrences" className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Ocorrências Restantes
              </label>
              <input
                id="form-remaining-occurrences"
                type="number"
                min="0"
                value={remainingOccurrences}
                onChange={(e) => setRemainingOccurrences(e.target.value)}
                placeholder="Vazio = Sem fim"
                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-750 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            {/* Calculated End Date */}
            <div>
              <span className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Previsão de Término
              </span>
              <div className="w-full bg-white dark:bg-gray-900 border border-dashed border-gray-200 dark:border-gray-750 rounded-xl px-3 py-1.5 text-xs text-gray-900 dark:text-white flex items-center h-[34px]">
                {estimatedEndDate ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 truncate text-[11px]">
                    📅 Final: {estimatedEndDate}
                  </span>
                ) : (
                  <span className="text-gray-400 text-[11px] font-medium flex items-center gap-1">
                    ♾️ Indefinida
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Form Action Buttons */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-4 border-t border-gray-150 dark:border-gray-800">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="w-full sm:w-auto bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 px-5 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          Cancelar
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          {isSubmitting ? (
            <span>Salvando Lançamento...</span>
          ) : isDuplicating ? (
            <>
              <Copy className="w-4 h-4" />
              Confirmar Duplicação
            </>
          ) : editingTransaction !== null ? (
            <>
              <Edit3 className="w-4 h-4" />
              Salvar Alterações
            </>
          ) : (
            <>
              <PlusCircle className="w-4 h-4" />
              Salvar Lançamento
            </>
          )}
        </button>
      </div>
    </form>
  );
};
