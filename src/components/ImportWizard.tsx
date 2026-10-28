import React, { useState, useRef, useMemo } from 'react';
import { Account, Category } from '../types.ts';
import { api } from '../lib/api.ts';
import { formatCurrency, formatDate } from '../lib/utils.ts';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  HelpCircle, 
  RefreshCw, 
  Check, 
  Play,
  FileSpreadsheet
} from 'lucide-react';
import { autoDetectMapping, mapCSVTransactions, parseCSV } from '../lib/parsers.ts';
import { useToast } from '../context/ToastContext.tsx';

interface ImportWizardProps {
  accounts: Account[];
  categories: Category[];
  onRefresh: () => Promise<void>;
}

export const ImportWizard: React.FC<ImportWizardProps> = ({
  accounts,
  categories,
  onRefresh
}) => {
  const { toast } = useToast();
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [clearingDb, setClearingDb] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearSuccess, setClearSuccess] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [keepRecurringInClear, setKeepRecurringInClear] = useState(true);

  // Parse result states
  const [detectedFormat, setDetectedFormat] = useState<'csv' | 'qif' | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [parsedTransactions, setParsedTransactions] = useState<any[]>([]);
  const [overwriteDuplicates, setOverwriteDuplicates] = useState(false);

  // Manual Mapping State (for CSV)
  const [mapping, setMapping] = useState({
    dateIdx: 0,
    payeeIdx: 1,
    amountIdx: 2,
    typeIdx: -1,
    memoIdx: -1,
    categoryIdx: -1,
    isRecurringIdx: -1,
    recurrenceIntervalIdx: -1,
    remainingOccurrencesIdx: -1,
    nextDueDateIdx: -1,
  });

  // Success stats state
  const [importStats, setImportStats] = useState<{
    importedCount: number;
    duplicateCount: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    setLoading(true);
    setImportStats(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      setFileContent(text);

      try {
        // Send file to parser API
        const res = await api.parseImportFile(text, file.name);
        setDetectedFormat(res.format);
        setCsvHeaders(res.headers);
        
        if (res.format === 'csv') {
          const rows = parseCSV(text);
          setCsvRows(rows);
          
          // Auto detect mapping indexes
          const auto = autoDetectMapping(res.headers);
          setMapping(auto);
          
          // Apply initial auto mapping
          const mapped = mapCSVTransactions(rows, auto, true);
          setParsedTransactions(mapped);
        } else {
          // QIF parses directly
          setParsedTransactions(res.transactions);
        }
      } catch (err) {
        toast.error('Erro ao processar arquivo: ' + (err as Error).message);
        resetState();
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleClearDatabase = async () => {
    setClearingDb(true);
    setClearError(null);
    setClearSuccess(null);
    try {
      await api.clearAllData(keepRecurringInClear);
      const msg = keepRecurringInClear 
        ? "Histórico de movimentações limpo com sucesso! Os lançamentos agendados foram preservados." 
        : "Base de dados limpa com sucesso! Categorias padrão restauradas.";
      setClearSuccess(msg);
      toast.success(msg);
      await onRefresh();
    } catch (err: any) {
      const errMsg = "Erro ao limpar base de dados: " + err.message;
      setClearError(errMsg);
      toast.error(errMsg);
    } finally {
      setClearingDb(false);
      setShowClearConfirm(false);
    }
  };

  // Re-run CSV mapping when indexes change
  const handleMappingChange = (field: keyof typeof mapping, index: number) => {
    const newMapping = { ...mapping, [field]: index };
    setMapping(newMapping);
    
    if (csvRows.length > 0) {
      const mapped = mapCSVTransactions(csvRows, newMapping, true);
      setParsedTransactions(mapped);
    }
  };

  const handleConfirmImport = async () => {
    if (!selectedAccountId) {
      toast.error('Por favor, selecione a conta de destino.');
      return;
    }
    if (parsedTransactions.length === 0) {
      toast.error('Nenhuma transação válida para importar.');
      return;
    }

    setLoading(true);
    setImportError(null);
    setImportProgress({ current: 0, total: parsedTransactions.length });

    try {
      const chunkSize = 200;
      let totalImported = 0;
      let totalDuplicates = 0;

      for (let i = 0; i < parsedTransactions.length; i += chunkSize) {
        const chunk = parsedTransactions.slice(i, i + chunkSize);
        
        const res = await api.confirmImport(parseInt(selectedAccountId), chunk, overwriteDuplicates);
        
        totalImported += res.importedCount;
        totalDuplicates += res.duplicateCount;

        setImportProgress({
          current: Math.min(i + chunkSize, parsedTransactions.length),
          total: parsedTransactions.length
        });
      }

      setImportStats({
        importedCount: totalImported,
        duplicateCount: totalDuplicates,
      });
      toast.success(`Importação finalizada com sucesso! ${totalImported} transações inseridas.`);
      await onRefresh();
    } catch (err: any) {
      console.error('Error confirming import:', err);
      const msg = err.message || 'Erro inesperado ao processar as transações.';
      setImportError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setImportProgress(null);
    }
  };

  const resetState = () => {
    setFileContent(null);
    setFileName('');
    setDetectedFormat(null);
    setCsvHeaders([]);
    setCsvRows([]);
    setParsedTransactions([]);
    setImportStats(null);
    setOverwriteDuplicates(false);
    setImportProgress(null);
    setImportError(null);
    setMapping({
      dateIdx: 0,
      payeeIdx: 1,
      amountIdx: 2,
      typeIdx: -1,
      memoIdx: -1,
      categoryIdx: -1,
      isRecurringIdx: -1,
      recurrenceIntervalIdx: -1,
      remainingOccurrencesIdx: -1,
      nextDueDateIdx: -1,
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 tabIndex={-1} data-page-heading className="outline-none text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Upload className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
          Importador de Transações
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Importe seus extratos antigos no formato CSV ou arquivos QIF nativos do KMyMoney / Quicken
        </p>
      </div>

      {accounts.length === 0 ? (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-250 dark:border-amber-900 p-5 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 dark:text-amber-400 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm text-amber-800 dark:text-amber-300">Nenhuma Conta Cadastrada</h4>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">
              Antes de prosseguir com a importação de dados, você precisa cadastrar pelo menos uma Conta Corrente ativa para servir de destino. Acesse a seção "Contas Correntes" no menu lateral.
            </p>
          </div>
        </div>
      ) : importStats ? (
        /* Success Report Card */
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8 rounded-3xl text-center space-y-6 shadow-sm animate-fade-in">
          <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Importação Concluída com Sucesso!</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              O arquivo <strong>{fileName}</strong> foi processado e adicionado à conta <strong>{accounts.find(a => String(a.id) === selectedAccountId)?.name}</strong>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto bg-gray-50 dark:bg-gray-950/40 border border-gray-150 dark:border-gray-850 p-4 rounded-2xl font-mono text-sm">
            <div className="p-2 border-r border-gray-200 dark:border-gray-800">
              <span className="block text-xs font-sans font-bold text-gray-500 uppercase tracking-wider mb-1">
                Lançados
              </span>
              <span className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">
                {importStats.importedCount}
              </span>
              <span className="block text-xs font-sans text-gray-500 mt-1">
                Novas transações
              </span>
            </div>
            <div className="p-2">
              <span className="block text-xs font-sans font-bold text-gray-500 uppercase tracking-wider mb-1">
                {overwriteDuplicates ? 'Duplicados Atualizados' : 'Duplicados Somados'}
              </span>
              <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                {importStats.duplicateCount}
              </span>
              <span className="block text-xs font-sans text-gray-500 mt-1">
                {overwriteDuplicates ? 'Substituiu valores' : 'Somado ao valor original'}
              </span>
            </div>
          </div>

          <button
            onClick={resetState}
            className="bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-all"
          >
            Importar Outro Arquivo
          </button>
        </div>
      ) : !fileContent ? (
        /* Dropzone Upload Section */
        <div className="space-y-5">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-sm">
            <label htmlFor="import-destination-account" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              1. Escolha a Conta Corrente de Destino
            </label>
            <select
              id="import-destination-account"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full max-w-md bg-gray-55 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <option value="">Selecione uma conta...</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.currentBalance ?? 0)})</option>
              ))}
            </select>
          </div>

          <div
            role="button"
            tabIndex={0}
            aria-label="Selecionar ou arrastar arquivo CSV ou QIF para importação"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`bg-white dark:bg-gray-900 border-2 border-dashed rounded-3xl p-12 text-center space-y-4 cursor-pointer transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none ${
              dragOver 
                ? 'border-emerald-500 bg-emerald-50/10' 
                : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-750'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".csv,.qif"
              aria-label="Upload de extrato financeiro"
              className="hidden"
            />

            <div className="w-14 h-14 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-500 rounded-full flex items-center justify-center mx-auto shadow-inner" aria-hidden="true">
              {loading ? (
                <RefreshCw className="w-7 h-7 animate-spin text-emerald-700 dark:text-emerald-400" />
              ) : (
                <Upload className="w-7 h-7" />
              )}
            </div>

            <div className="space-y-1">
              <p className="font-bold text-sm text-gray-800 dark:text-white">
                Arraste o extrato aqui ou clique para selecionar
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                Formatos suportados: arquivos <strong>.CSV</strong> genéricos ou arquivos <strong>.QIF</strong> exportados do KMyMoney, Quicken ou Microsoft Money.
              </p>
            </div>
          </div>

          {/* Danger Zone: Clean Database Card */}
          <div className="bg-rose-50/50 dark:bg-rose-950/10 border border-rose-150 dark:border-rose-950/30 rounded-3xl p-6 shadow-sm space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-950 flex items-center justify-center text-rose-700 dark:text-rose-400 shrink-0" aria-hidden="true">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-800 dark:text-rose-400">
                  {showClearConfirm ? "CONFIRMAR: Excluir Todos os Dados" : "Zona de Perigo: Limpar Base de Dados (Recomeçar)"}
                </h3>
                <p className="text-xs text-rose-700/80 dark:text-rose-400/80 mt-1 leading-relaxed">
                  {showClearConfirm 
                    ? "ATENÇÃO! Esta ação é irreversível. Todas as transações, contas correntes, etiquetas e categorias personalizadas cadastradas serão apagadas permanentemente do servidor, e as categorias padrão serão restauradas."
                    : "Se houver duplicatas ou valores incorretos no seu banco de dados, você pode apagar todos os lançamentos, etiquetas e categorias personalizadas para reiniciar sua base do zero. Esta ação recriará as categorias padrão e os saldos das suas contas serão recalculados."}
                </p>

                <div className="flex items-center gap-2 mt-3 select-none">
                  <input
                    type="checkbox"
                    id="keepRecurringInClear"
                    checked={keepRecurringInClear}
                    onChange={(e) => setKeepRecurringInClear(e.target.checked)}
                    className="w-4 h-4 text-emerald-700 bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 rounded focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer dark:text-emerald-400"
                  />
                  <label htmlFor="keepRecurringInClear" className="text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer">
                    Preservar Lançamentos Agendados (Agenda Recorrente)
                  </label>
                </div>
              </div>
            </div>

            {clearSuccess && (
              <div role="status" aria-live="polite" className="mt-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-xl p-3">
                {clearSuccess}
              </div>
            )}

            {clearError && (
              <div role="alert" aria-live="polite" className="mt-2 text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-xl p-3">
                {clearError}
              </div>
            )}
            
            <div className="pt-1 pl-12 flex flex-wrap gap-2">
              {showClearConfirm ? (
                <>
                  <button
                    type="button"
                    onClick={handleClearDatabase}
                    disabled={clearingDb}
                    className="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-rose-600/10 cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-500"
                  >
                    {clearingDb ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        Limpando dados...
                      </>
                    ) : (
                      <>Sim, Apagar Tudo Permanentemente</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    disabled={clearingDb}
                    className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setClearSuccess(null);
                    setClearError(null);
                    setShowClearConfirm(true);
                  }}
                  disabled={loading}
                  className="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-rose-600/10 cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  Apagar Tudo e Recomeçar do Zero
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Preview / Mapping Section */
        <div className="space-y-6">
          {/* File Info Title */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
              <div>
                <p className="font-bold text-sm text-gray-900 dark:text-white">{fileName}</p>
                <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2.5 py-0.5 rounded-md border border-gray-200/50">
                  FORMATO: {detectedFormat?.toUpperCase()}
                </span>
              </div>
            </div>

            <button
              onClick={resetState}
              className="text-xs text-rose-700 dark:text-rose-400 font-semibold hover:underline"
            >
              Trocar arquivo
            </button>
          </div>

          {/* CSV Mapping UI Panel */}
          {detectedFormat === 'csv' && csvHeaders.length > 0 && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="border-b border-gray-100 dark:border-gray-800 pb-3 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                <h3 className="font-bold text-sm text-gray-800 dark:text-white">
                  Mapeamento de Colunas do CSV (Ajuste se necessário)
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Date */}
                <div>
                  <label htmlFor="mapping-date" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Coluna de Data *
                  </label>
                  <select
                    id="mapping-date"
                    value={mapping.dateIdx}
                    onChange={(e) => handleMappingChange('dateIdx', parseInt(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg p-2 text-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    {csvHeaders.map((h, i) => (
                      <option key={i} value={i}>{h || `Coluna ${i+1}`}</option>
                    ))}
                  </select>
                </div>

                {/* Payee */}
                <div>
                  <label htmlFor="mapping-payee" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Coluna de Beneficiário *
                  </label>
                  <select
                    id="mapping-payee"
                    value={mapping.payeeIdx}
                    onChange={(e) => handleMappingChange('payeeIdx', parseInt(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg p-2 text-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    {csvHeaders.map((h, i) => (
                      <option key={i} value={i}>{h || `Coluna ${i+1}`}</option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label htmlFor="mapping-amount" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Coluna de Valor (R$) *
                  </label>
                  <select
                    id="mapping-amount"
                    value={mapping.amountIdx}
                    onChange={(e) => handleMappingChange('amountIdx', parseInt(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg p-2 text-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    {csvHeaders.map((h, i) => (
                      <option key={i} value={i}>{h || `Coluna ${i+1}`}</option>
                    ))}
                  </select>
                </div>

                {/* Type */}
                <div>
                  <label htmlFor="mapping-type" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Coluna de Tipo (Débito/Crédito)
                  </label>
                  <select
                    id="mapping-type"
                    value={mapping.typeIdx}
                    onChange={(e) => handleMappingChange('typeIdx', parseInt(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg p-2 text-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <option value="-1">Automático (pelo sinal +/- do valor)</option>
                    {csvHeaders.map((h, i) => (
                      <option key={i} value={i}>{h || `Coluna ${i+1}`}</option>
                    ))}
                  </select>
                </div>

                {/* Memo */}
                <div>
                  <label htmlFor="mapping-memo" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Coluna de Observações (Memo)
                  </label>
                  <select
                    id="mapping-memo"
                    value={mapping.memoIdx}
                    onChange={(e) => handleMappingChange('memoIdx', parseInt(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg p-2 text-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <option value="-1">Nenhuma (Vazio)</option>
                    {csvHeaders.map((h, i) => (
                      <option key={i} value={i}>{h || `Coluna ${i+1}`}</option>
                    ))}
                  </select>
                </div>

                {/* Category */}
                <div>
                  <label htmlFor="mapping-category" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Coluna de Categoria
                  </label>
                  <select
                    id="mapping-category"
                    value={mapping.categoryIdx}
                    onChange={(e) => handleMappingChange('categoryIdx', parseInt(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg p-2 text-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <option value="-1">Nenhuma (Vazio)</option>
                    {csvHeaders.map((h, i) => (
                      <option key={i} value={i}>{h || `Coluna ${i+1}`}</option>
                    ))}
                  </select>
                </div>

                {/* Is Recurring */}
                <div>
                  <label htmlFor="mapping-recurring" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Coluna de Recorrente (Sim/Não)
                  </label>
                  <select
                    id="mapping-recurring"
                    value={mapping.isRecurringIdx}
                    onChange={(e) => handleMappingChange('isRecurringIdx', parseInt(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg p-2 text-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <option value="-1">Nenhuma (Não recorrente por padrão)</option>
                    {csvHeaders.map((h, i) => (
                      <option key={i} value={i}>{h || `Coluna ${i+1}`}</option>
                    ))}
                  </select>
                </div>

                {/* Recurrence Interval */}
                <div>
                  <label htmlFor="mapping-recurrence-interval" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Coluna de Intervalo (Frequência)
                  </label>
                  <select
                    id="mapping-recurrence-interval"
                    value={mapping.recurrenceIntervalIdx}
                    onChange={(e) => handleMappingChange('recurrenceIntervalIdx', parseInt(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg p-2 text-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <option value="-1">Nenhuma (Vazio)</option>
                    {csvHeaders.map((h, i) => (
                      <option key={i} value={i}>{h || `Coluna ${i+1}`}</option>
                    ))}
                  </select>
                </div>

                {/* Remaining Occurrences */}
                <div>
                  <label htmlFor="mapping-remaining-occurrences" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Coluna de Parcelas Restantes
                  </label>
                  <select
                    id="mapping-remaining-occurrences"
                    value={mapping.remainingOccurrencesIdx}
                    onChange={(e) => handleMappingChange('remainingOccurrencesIdx', parseInt(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg p-2 text-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <option value="-1">Nenhuma (Sem limite)</option>
                    {csvHeaders.map((h, i) => (
                      <option key={i} value={i}>{h || `Coluna ${i+1}`}</option>
                    ))}
                  </select>
                </div>

                {/* Next Due Date */}
                <div>
                  <label htmlFor="mapping-next-due-date" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Coluna de Próximo Vencimento
                  </label>
                  <select
                    id="mapping-next-due-date"
                    value={mapping.nextDueDateIdx}
                    onChange={(e) => handleMappingChange('nextDueDateIdx', parseInt(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg p-2 text-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <option value="-1">Nenhuma (Mesma data por padrão)</option>
                    {csvHeaders.map((h, i) => (
                      <option key={i} value={i}>{h || `Coluna ${i+1}`}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Transactions Preview Table */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl overflow-hidden shadow-sm space-y-4 p-6">
            <h3 className="font-bold text-sm text-gray-800 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-3">
              Preview dos Dados ({parsedTransactions.length} transações detectadas)
            </h3>

            {parsedTransactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500 dark:text-gray-500">
                Nenhuma transação válida pôde ser lida com as configurações atuais.
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto border border-gray-150 dark:border-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-850">
                {parsedTransactions.slice(0, 50).map((t, idx) => (
                  <div key={idx} className="p-3 bg-white dark:bg-gray-900 hover:bg-gray-50/50 dark:hover:bg-gray-800/10 flex items-center justify-between text-xs font-semibold">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gray-500">{formatDate(t.date)}</span>
                        <span className="text-gray-900 dark:text-white truncate max-w-[200px]">{t.payee}</span>
                        {t.isRecurring && (
                          <span className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1">
                            Agendado ({t.recurrenceInterval === 'diario' ? 'Diário' : t.recurrenceInterval === 'semanal' ? 'Semanal' : t.recurrenceInterval === 'quinzenal' ? 'Quinzenal' : t.recurrenceInterval === 'mensal' ? 'Mensal' : t.recurrenceInterval === 'anual' ? 'Anual' : t.recurrenceInterval || 'Recorrente'}{t.remainingOccurrences ? ` - ${t.remainingOccurrences} parcelas` : ''})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 flex flex-col gap-0.5 mt-0.5">
                        {t.splits && t.splits.length > 0 ? (
                          <div className="flex flex-col gap-1 mt-1">
                            <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs">
                              Múltiplas Categorias ({t.splits.length} splits):
                            </span>
                            <div className="pl-2 border-l-2 border-emerald-500/20 dark:border-emerald-500/40 flex flex-col gap-1">
                              {t.splits.map((s: any, sidx: number) => (
                                <span key={sidx} className="text-xs text-gray-500 dark:text-gray-450">
                                  {s.categoryName}{s.subcategoryName ? ` → ${s.subcategoryName}` : ''}: <strong className="font-mono text-gray-700 dark:text-gray-300">{formatCurrency(s.amount)}</strong>
                                  {s.memo && <span className="text-gray-500 font-normal"> ({s.memo})</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span>{t.categoryName ? `${t.categoryName}${t.subcategoryName ? ` → ${t.subcategoryName}` : ''}` : 'Sem categoria'}</span>
                            {t.memo && (
                              <>
                                <span>•</span>
                                <span className="italic truncate max-w-[150px]">{t.memo}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className={`font-mono font-bold text-xs ${t.type === 'credito' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                      {t.type === 'credito' ? '+' : '-'}{formatCurrency(t.amount)}
                    </span>
                  </div>
                ))}
                {parsedTransactions.length > 50 && (
                  <div className="p-3 text-center text-xs text-gray-500 bg-gray-50 dark:bg-gray-950/20">
                    ...e mais {parsedTransactions.length - 50} transações.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Progress / Error display */}
          {(importProgress || importError) && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 rounded-3xl shadow-sm space-y-3">
              {importProgress && (
                <div role="status" aria-live="polite" className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-gray-700 dark:text-gray-300">
                    <span>Processando importação...</span>
                    <span>{importProgress.current} de {importProgress.total} ({Math.round((importProgress.current / importProgress.total) * 100)}%)</span>
                  </div>
                  <div 
                    role="progressbar" 
                    aria-valuenow={importProgress.current} 
                    aria-valuemin={0} 
                    aria-valuemax={importProgress.total} 
                    aria-valuetext={`${importProgress.current} de ${importProgress.total} transações processadas`}
                    className="w-full bg-gray-100 dark:bg-gray-800 h-2 rounded-full overflow-hidden"
                  >
                    <div 
                      className="bg-emerald-500 h-full transition-all duration-300" 
                      style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {importError && (
                <div role="alert" aria-live="assertive" className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 p-4 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-700 dark:text-red-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <h4 className="font-bold text-sm text-red-800 dark:text-red-300">Falha ao Importar</h4>
                    <p className="text-xs text-red-700/90 dark:text-red-400/90 mt-1">
                      {importError}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom Confirmation Bar */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 rounded-3xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="space-y-1">
                <label htmlFor="import-confirm-account" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Confirmar destino
                </label>
                <select
                  id="import-confirm-account"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 dark:text-gray-300 focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <option value="">Selecione a conta...</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 select-none border-l border-gray-100 dark:border-gray-800 sm:pl-4 mt-2 sm:mt-0">
                <input
                  type="checkbox"
                  id="overwrite-dup"
                  checked={overwriteDuplicates}
                  onChange={(e) => setOverwriteDuplicates(e.target.checked)}
                  className="w-4 h-4 text-emerald-700 bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 rounded focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer dark:text-emerald-400"
                />
                <label htmlFor="overwrite-dup" className="text-left cursor-pointer">
                  <span className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                    Atualizar transações existentes
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    Substitui duplicados para recuperar splits e categorias corretas
                  </span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 self-end md:self-auto">
              <button
                type="button"
                onClick={resetState}
                className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-5 py-2.5 rounded-xl font-semibold text-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={!selectedAccountId || parsedTransactions.length === 0 || loading}
                className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white px-6 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition-all shadow-md shadow-emerald-600/10 focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                    {importProgress 
                      ? `Processando (${importProgress.current}/${importProgress.total})...`
                      : 'Processando...'}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" aria-hidden="true" />
                    Confirmar Importação
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
