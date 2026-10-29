import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../lib/api.ts';
import JSZip from 'jszip';
import { 
  Cloud, 
  CloudUpload, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Shield, 
  Database, 
  FolderSync, 
  Settings, 
  RefreshCw, 
  ExternalLink,
  Download,
  Upload,
  FileJson,
  FileArchive,
  History,
  AlertTriangle,
  X,
  Folder,
  FolderOpen,
  FolderPlus,
  Check,
  Search,
  ChevronRight,
  Home,
  ArrowLeft,
  HardDrive,
  Plus
} from 'lucide-react';
import { useToast } from '../context/ToastContext.tsx';

interface DriveFile {
  id: string;
  name: string;
  size?: string;
  createdTime: string;
  modifiedTime?: string;
}

interface ParsedBackupPreview {
  fileName: string;
  fileSize: number;
  exportedAt?: string;
  accountsCount: number;
  categoriesCount: number;
  transactionsCount: number;
  tagsCount: number;
  payeesCount: number;
  rawPayload: any;
}

interface BackupManagerProps {
  onRefresh?: () => Promise<void>;
}

export const BackupManager: React.FC<BackupManagerProps> = ({ onRefresh }) => {
  const { user, googleToken, connectGoogleDrive, refreshUserSync } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Google Drive backups & directory state
  const [driveFolder, setDriveFolder] = useState('Finanças K - Backups');
  const [savedFolder, setSavedFolder] = useState('Finanças K - Backups');
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [savedFolderId, setSavedFolderId] = useState<string | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);
  const [availableFolders, setAvailableFolders] = useState<Array<{ id: string; name: string; parents?: string[] }>>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderSearch, setFolderSearch] = useState('');
  // Hierarchical navigation state: breadcrumb stack
  const [folderBreadcrumbs, setFolderBreadcrumbs] = useState<Array<{ id: string; name: string }>>([
    { id: 'root', name: 'Meu Google Drive' }
  ]);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
  const [selectedDriveFileForRestore, setSelectedDriveFileForRestore] = useState<DriveFile | null>(null);
  const [restoringDrive, setRestoringDrive] = useState(false);

  // Local file backup & restore state
  const [exportingLocal, setExportingLocal] = useState(false);
  const [localFilePreview, setLocalFilePreview] = useState<ParsedBackupPreview | null>(null);
  const [parsingLocalFile, setParsingLocalFile] = useState(false);
  const [restoringLocal, setRestoringLocal] = useState(false);
  const [showLocalRestoreModal, setShowLocalRestoreModal] = useState(false);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch initial backup status from backend
  const fetchBackupStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await api.getBackupStatus();
      setBackupEnabled(res.backupEnabled);
      setLastBackupAt(res.lastBackupAt);
      if (res.backupDriveFolder) {
        setDriveFolder(res.backupDriveFolder);
        setSavedFolder(res.backupDriveFolder);
      }
      if (res.backupDriveFolderId) {
        setDriveFolderId(res.backupDriveFolderId);
        setSavedFolderId(res.backupDriveFolderId);
      } else {
        setDriveFolderId(null);
        setSavedFolderId(null);
      }
    } catch (error) {
      console.error('Erro ao buscar status do backup:', error);
    } finally {
      setStatusLoading(false);
    }
  };

  // Fetch Google Drive backups list for configured directory
  const fetchDriveBackups = async (token?: string, folderToUse?: string, folderIdToUse?: string | null) => {
    const tokenToUse = token || googleToken;
    if (!tokenToUse) return;

    setLoadingDriveFiles(true);
    try {
      const targetFolder = folderToUse !== undefined ? folderToUse : (savedFolder || driveFolder);
      const targetFolderId = folderIdToUse !== undefined ? folderIdToUse : (savedFolderId || driveFolderId);
      const res = await api.listDriveBackups(tokenToUse, targetFolder, targetFolderId);
      setDriveFiles(res.files || []);
    } catch (error: any) {
      console.error('Erro ao listar backups do Google Drive:', error);
    } finally {
      setLoadingDriveFiles(false);
    }
  };

  // Save Google Drive destination directory (name + stable folder ID)
  const handleSaveDriveFolder = async (folderToSaveOverride?: string, folderIdToSave?: string | null) => {
    const targetFolder = (folderToSaveOverride !== undefined ? folderToSaveOverride : driveFolder).trim() || 'Finanças K - Backups';
    const targetFolderId = folderIdToSave !== undefined ? folderIdToSave : driveFolderId;
    setSavingFolder(true);
    try {
      const res = await api.updateBackupFolder(targetFolder, targetFolderId);
      setDriveFolder(res.backupDriveFolder);
      setSavedFolder(res.backupDriveFolder);
      setDriveFolderId(res.backupDriveFolderId || null);
      setSavedFolderId(res.backupDriveFolderId || null);
      toast.success(`Pasta do Google Drive definida como "${res.backupDriveFolder}"!`);
      if (googleToken) {
        fetchDriveBackups(googleToken, res.backupDriveFolder, res.backupDriveFolderId);
      }
    } catch (err: any) {
      console.error('Erro ao salvar pasta de backup:', err);
      toast.error(`Erro ao salvar diretório: ${err.message}`);
    } finally {
      setSavingFolder(false);
    }
  };

  // Fetch folders for a specific parent directory or global search
  const loadDriveFoldersForParent = async (
    token: string, 
    parentId: string = 'root', 
    searchQuery: string = ''
  ) => {
    setLoadingFolders(true);
    try {
      const pId = parentId === 'root' ? undefined : parentId;
      const res = await api.listDriveFolders(token, searchQuery ? undefined : pId, searchQuery || undefined);
      setAvailableFolders(res.folders || []);
    } catch (err: any) {
      console.error('Erro ao buscar pastas do Drive:', err);
      toast.error(`Erro ao carregar pastas: ${err.message}`);
    } finally {
      setLoadingFolders(false);
    }
  };

  // Open Drive folder explorer / picker starting from root
  const handleOpenFolderPicker = async () => {
    let tokenToUse = googleToken;
    if (!tokenToUse) {
      toast.info('Conectando ao Google Drive...');
      try {
        const freshToken = await connectGoogleDrive();
        if (!freshToken) return;
        tokenToUse = freshToken;
      } catch (e) {
        return;
      }
    }

    setFolderBreadcrumbs([{ id: 'root', name: 'Meu Google Drive' }]);
    setFolderSearch('');
    setShowNewFolderInput(false);
    setShowFolderModal(true);
    await loadDriveFoldersForParent(tokenToUse, 'root', '');
  };

  // Navigate deeper into a subfolder
  const handleNavigateIntoFolder = async (folder: { id: string; name: string }) => {
    const tokenToUse = googleToken;
    if (!tokenToUse) return;
    setFolderSearch('');
    const newCrumbs = [...folderBreadcrumbs, folder];
    setFolderBreadcrumbs(newCrumbs);
    await loadDriveFoldersForParent(tokenToUse, folder.id, '');
  };

  // Navigate back to a specific crumb in history
  const handleNavigateToCrumb = async (index: number) => {
    const tokenToUse = googleToken;
    if (!tokenToUse) return;
    const targetCrumb = folderBreadcrumbs[index];
    const newCrumbs = folderBreadcrumbs.slice(0, index + 1);
    setFolderBreadcrumbs(newCrumbs);
    setFolderSearch('');
    await loadDriveFoldersForParent(tokenToUse, targetCrumb.id, '');
  };

  // Navigate one level up
  const handleNavigateUp = async () => {
    if (folderBreadcrumbs.length <= 1) return;
    handleNavigateToCrumb(folderBreadcrumbs.length - 2);
  };

  // Create a brand new folder inside the current parent in Google Drive
  const handleCreateNewFolder = async () => {
    const tokenToUse = googleToken;
    const trimmed = newFolderName.trim();
    if (!tokenToUse || !trimmed) return;

    setCreatingFolder(true);
    try {
      const currentParent = folderBreadcrumbs[folderBreadcrumbs.length - 1];
      const parentId = currentParent.id === 'root' ? undefined : currentParent.id;
      const res = await api.createDriveFolder(tokenToUse, trimmed, parentId);
      toast.success(`Pasta "${trimmed}" criada com sucesso no Google Drive!`);
      setNewFolderName('');
      setShowNewFolderInput(false);
      // Reload current directory
      await loadDriveFoldersForParent(tokenToUse, currentParent.id, '');
    } catch (err: any) {
      console.error('Erro ao criar pasta no Drive:', err);
      toast.error(`Erro ao criar pasta: ${err.message}`);
    } finally {
      setCreatingFolder(false);
    }
  };

  // Select a folder from the list: builds path from breadcrumbs + uses the real Drive folder ID
  const handleSelectFolderFromPicker = (folder: { id: string; name: string }) => {
    // Build human-readable path: omit root, join path components
    const pathParts = folderBreadcrumbs
      .slice(1) // remove root
      .map(c => c.name);

    // Add selected folder name if it's not already the last breadcrumb
    if (folder.name && folder.name !== folderBreadcrumbs[folderBreadcrumbs.length - 1]?.name) {
      pathParts.push(folder.name);
    }

    const finalPath = pathParts.length > 0 ? pathParts.join('/') : (folder.name || 'Finanças K - Backups');
    setDriveFolder(finalPath);
    setDriveFolderId(folder.id);
    handleSaveDriveFolder(finalPath, folder.id);
    setShowFolderModal(false);
  };

  // Select the currently open folder (uses the breadcrumb ID — the stable Drive ID)
  const handleSelectCurrentOpenFolder = () => {
    const currentParent = folderBreadcrumbs[folderBreadcrumbs.length - 1];
    if (currentParent.id === 'root') {
      toast.info('Selecione ou crie uma pasta específica dentro do seu Drive para manter seus backups organizados.');
      return;
    }
    const pathParts = folderBreadcrumbs.slice(1).map(c => c.name);
    const finalPath = pathParts.join('/');
    setDriveFolder(finalPath);
    setDriveFolderId(currentParent.id);
    handleSaveDriveFolder(finalPath, currentParent.id);
    setShowFolderModal(false);
  };

  useEffect(() => {
    if (user) {
      fetchBackupStatus();
    }
  }, [user]);

  useEffect(() => {
    if (googleToken) {
      fetchDriveBackups(googleToken, savedFolder, savedFolderId);
    }
  }, [googleToken, savedFolder, savedFolderId]);

  // Handle escape key to dismiss restore modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedDriveFileForRestore(null);
        setShowLocalRestoreModal(false);
        setShowFolderModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle toggle change
  const handleToggleBackup = async () => {
    try {
      const nextVal = !backupEnabled;
      const res = await api.toggleBackupSetting(nextVal);
      setBackupEnabled(res.backupEnabled);
      const msg = nextVal 
        ? 'Backup automático semanal ativado com sucesso!' 
        : 'Backup automático desativado.';
      setStatusMessage({
        type: 'success',
        text: msg
      });
      toast.success(msg);
      refreshUserSync();
    } catch (err: any) {
      const errMsg = `Erro ao salvar preferência: ${err.message}`;
      setStatusMessage({
        type: 'error',
        text: errMsg
      });
      toast.error(errMsg);
    }
  };

  // Perform active backup to Google Drive
  const handleRunBackup = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      let tokenToUse = googleToken;

      if (!tokenToUse) {
        setStatusMessage({
          type: 'success',
          text: 'Conectando ao Google Drive... Por favor, autorize na janela de login.'
        });
        toast.info('Conectando ao Google Drive...');
        const freshToken = await connectGoogleDrive();
        if (!freshToken) {
          throw new Error('Permissão do Google Drive não concedida.');
        }
        tokenToUse = freshToken;
      }

      setStatusMessage({
        type: 'success',
        text: 'Compactando a base de dados financeira em .zip...'
      });

      const targetFolder = savedFolder || driveFolder;
      const targetFolderId = savedFolderId || driveFolderId;
      const res = await api.runBackup(tokenToUse, targetFolder, targetFolderId);
      setLastBackupAt(res.lastBackupAt);
      const destinationFolder = res.folderName || targetFolder;
      const successMsg = `Backup realizado com sucesso! Arquivo salvo na pasta "${destinationFolder}" do Google Drive: "${res.filename}"`;
      setStatusMessage({
        type: 'success',
        text: successMsg
      });
      toast.success(`Backup salvo com sucesso na pasta "${destinationFolder}" do Google Drive!`);
      refreshUserSync();
      // Refresh list using the stable folder ID when available
      fetchDriveBackups(tokenToUse, destinationFolder, targetFolderId);
    } catch (err: any) {
      console.error(err);
      const errMsg = `Falha no backup: ${err.message || 'Erro desconhecido'}`;
      setStatusMessage({
        type: 'error',
        text: errMsg
      });
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Export the database only, compressed as a .zip, directly to the user's computer
  const handleExportLocalZip = async () => {
    setExportingLocal(true);
    try {
      const { blob, filename } = await api.exportBackupZip();
      const dateStr = new Date().toISOString().split('T')[0];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `backup_financas_k_${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Backup da base de dados (.zip) exportado com sucesso!');
    } catch (err: any) {
      console.error('Erro ao exportar backup local:', err);
      toast.error(`Falha ao exportar backup: ${err.message}`);
    } finally {
      setExportingLocal(false);
    }
  };

  // Parse dropped or selected backup file (.json or .zip)
  const processSelectedFile = async (file: File) => {
    setParsingLocalFile(true);
    setLocalFilePreview(null);
    try {
      let rawJsonText = '';
      if (file.name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        const dbFile = zip.file('database_backup.json');
        if (dbFile) {
          rawJsonText = await dbFile.async('string');
        } else {
          const anyJson = Object.keys(zip.files).find(n => n.toLowerCase().endsWith('.json'));
          if (anyJson) {
            rawJsonText = await zip.file(anyJson)!.async('string');
          } else {
            throw new Error('O arquivo ZIP não contém database_backup.json.');
          }
        }
      } else {
        rawJsonText = await file.text();
      }

      const parsed = JSON.parse(rawJsonText);
      const payload = parsed.data || parsed;

      const accountsCount = Array.isArray(payload.accounts) ? payload.accounts.length : 0;
      const categoriesCount = Array.isArray(payload.categories) ? payload.categories.length : 0;
      const transactionsCount = Array.isArray(payload.transactions) ? payload.transactions.length : 0;
      const tagsCount = Array.isArray(payload.tags) ? payload.tags.length : 0;
      const payeesCount = Array.isArray(payload.payees) ? payload.payees.length : 0;

      if (accountsCount === 0 && categoriesCount === 0 && transactionsCount === 0) {
        throw new Error('O arquivo fornecido não parece conter dados válidos do Finanças K.');
      }

      setLocalFilePreview({
        fileName: file.name,
        fileSize: file.size,
        exportedAt: parsed.exportedAt,
        accountsCount,
        categoriesCount,
        transactionsCount,
        tagsCount,
        payeesCount,
        rawPayload: parsed,
      });

      toast.success(`Arquivo analisado: ${transactionsCount} transações e ${accountsCount} contas encontradas.`);
    } catch (err: any) {
      console.error('Erro ao ler arquivo de backup:', err);
      toast.error(`Erro ao carregar arquivo: ${err.message}`);
    } finally {
      setParsingLocalFile(false);
    }
  };

  // Confirm and run local file restore
  const handleConfirmLocalRestore = async () => {
    if (!localFilePreview) return;
    setRestoringLocal(true);
    try {
      const res = await api.restoreBackup(localFilePreview.rawPayload, restoreMode);
      toast.success(
        `Restauração concluída! ${res.summary.transactionsCount} transações e ${res.summary.accountsCount} contas restauradas.`
      );
      setShowLocalRestoreModal(false);
      setLocalFilePreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      refreshUserSync();
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: any) {
      console.error('Erro ao restaurar backup:', err);
      toast.error(`Falha na restauração: ${err.message}`);
    } finally {
      setRestoringLocal(false);
    }
  };

  // Confirm and run Google Drive restore
  const handleConfirmDriveRestore = async () => {
    if (!selectedDriveFileForRestore || !googleToken) return;
    setRestoringDrive(true);
    try {
      const res = await api.restoreDriveBackup(selectedDriveFileForRestore.id, googleToken, restoreMode);
      toast.success(
        `Backup do Google Drive restaurado! ${res.summary.transactionsCount} transações e ${res.summary.accountsCount} contas importadas.`
      );
      setSelectedDriveFileForRestore(null);
      refreshUserSync();
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: any) {
      console.error('Erro ao restaurar backup do Google Drive:', err);
      toast.error(`Falha ao restaurar do Drive: ${err.message}`);
    } finally {
      setRestoringDrive(false);
    }
  };

  // Format date helper
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Nunca realizado';
    const d = new Date(dateStr);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes?: string | number) => {
    if (!bytes) return 'N/A';
    const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (isNaN(num)) return 'N/A';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isBackupPending = () => {
    if (!backupEnabled) return false;
    if (!lastBackupAt) return true;
    const lastDate = new Date(lastBackupAt);
    const diffTime = Math.abs(new Date().getTime() - lastDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 7;
  };

  return (
    <div className="space-y-8 max-w-5xl animate-fade-in" id="backup-manager-container">
      {/* Page Header */}
      <div>
        <h1 tabIndex={-1} data-page-heading className="outline-none text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
          <Cloud className="w-8 h-8 text-emerald-700 dark:text-emerald-500" />
          Backup & Restauração de Dados
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
          Exporte ou restaure bases completas de dados financeiros entre ambientes (Produção e Desenvolvimento) ou utilize o salvamento em nuvem com o Google Drive.
        </p>
      </div>

      {statusMessage && (
        <div 
          role={statusMessage.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`p-4 rounded-2xl flex items-start gap-3 border text-sm transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-300'
              : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900/50 dark:text-rose-300'
          }`}
          id="backup-status-banner"
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-700 dark:text-rose-400" aria-hidden="true" />
          )}
          <div>
            <p className="font-semibold">{statusMessage.type === 'success' ? 'Aviso do Sistema' : 'Ocorreu um Erro'}</p>
            <p className="mt-0.5 opacity-90 leading-relaxed">{statusMessage.text}</p>
          </div>
        </div>
      )}

      {/* SEÇÃO 1: MUDANÇA DIRETA DE DADOS ENTRE PRODUÇÃO E DESENVOLVIMENTO (ARQUIVO JSON/ZIP) */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-5">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
              <FileJson className="w-5 h-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              Migração e Arquivos Locais (ZIP)
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Método mais rápido para transferir dados: baixe o arquivo em Produção e restaure aqui em Desenvolvimento.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportLocalZip}
            disabled={exportingLocal}
            className="self-start sm:self-auto bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 text-xs transition-all cursor-pointer border border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-emerald-500"
            id="btn-export-local-json"
          >
            {exportingLocal ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <Download className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            )}
            <span>{exportingLocal ? 'Compactando base de dados...' : 'Exportar Backup da Base (.zip)'}</span>
          </button>
        </div>

        {/* Upload and Restore Box */}
        <div className="space-y-4">
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Restaurar Base a partir de Arquivo (.json ou .zip)
          </label>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                processSelectedFile(e.dataTransfer.files[0]);
              }
            }}
            className="border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-6 sm:p-8 text-center transition-all bg-gray-50/50 dark:bg-gray-950/40 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
                aria-label="Selecionar arquivo de backup (.json ou .zip)"
              accept=".json,.zip"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  processSelectedFile(e.target.files[0]);
                }
              }}
              className="hidden"
              id="input-file-backup-restore"
            />
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
                {parsingLocalFile ? (
                  <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="w-6 h-6" aria-hidden="true" />
                )}
              </div>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                Clique para selecionar ou arraste o arquivo de backup aqui
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Formatos aceitos: backups <span className="font-semibold text-emerald-700 dark:text-emerald-400">.zip</span> (download ou Google Drive) e arquivos <span className="font-semibold text-emerald-700 dark:text-emerald-400">.json</span> de backups antigos
              </p>
            </div>
          </div>

          {/* Preview of loaded file */}
          {localFilePreview && (
            <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-5 space-y-4 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <FileArchive className="w-6 h-6 text-emerald-700 dark:text-emerald-400 flex-shrink-0" />
                  <div>
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                      {localFilePreview.fileName}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Tamanho: {formatFileSize(localFilePreview.fileSize)} • Exportado em: {formatDate(localFilePreview.exportedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLocalFilePreview(null)}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer"
                  >
                    Remover
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLocalRestoreModal(true)}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
                    id="btn-open-restore-confirm-modal"
                  >
                    Restaurar Dados na Base Atual
                  </button>
                </div>
              </div>

              {/* Counts Badge Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                <div className="bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-center">
                  <span className="text-xs uppercase font-bold text-gray-500">Contas</span>
                  <p className="text-base font-black text-gray-900 dark:text-white font-mono">{localFilePreview.accountsCount}</p>
                </div>
                <div className="bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-center">
                  <span className="text-xs uppercase font-bold text-gray-500">Categorias</span>
                  <p className="text-base font-black text-gray-900 dark:text-white font-mono">{localFilePreview.categoriesCount}</p>
                </div>
                <div className="bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-center">
                  <span className="text-xs uppercase font-bold text-gray-500">Transações</span>
                  <p className="text-base font-black text-emerald-700 dark:text-emerald-400 font-mono">{localFilePreview.transactionsCount}</p>
                </div>
                <div className="bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-center">
                  <span className="text-xs uppercase font-bold text-gray-500">Etiquetas</span>
                  <p className="text-base font-black text-gray-900 dark:text-white font-mono">{localFilePreview.tagsCount}</p>
                </div>
                <div className="bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-center col-span-2 sm:col-span-1">
                  <span className="text-xs uppercase font-bold text-gray-500">Beneficiários</span>
                  <p className="text-base font-black text-gray-900 dark:text-white font-mono">{localFilePreview.payeesCount}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SEÇÃO 2: GOOGLE DRIVE (NUVEM) */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-5">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
              <Cloud className="w-5 h-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              Backup & Restauração pelo Google Drive
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Backups salvos no diretório configurado do seu Google Drive. Pasta ativa:{' '}
              <span className="font-bold text-emerald-700 dark:text-emerald-400 font-mono">"{savedFolder}"</span>
            </p>
          </div>

          <span className={`self-start sm:self-auto px-3 py-1 rounded-full text-xs font-semibold ${
            googleToken 
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
          }`}>
            {googleToken ? 'Drive Conectado' : 'Drive não Conectado'}
          </span>
        </div>

        {/* Configuração do Diretório de Destino no Google Drive */}
        <div className="bg-gray-50/70 dark:bg-gray-950/40 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-lg">
                <Folder className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <label htmlFor="input-drive-folder" className="text-xs font-bold text-gray-900 dark:text-white">
                  Diretório de Backup no Google Drive
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Defina a pasta onde os backups serão gerados e consultados
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              <span className="text-xs uppercase font-bold text-gray-500">Status:</span>
              <span className={`text-xs font-mono px-2 py-0.5 rounded-md font-semibold ${
                driveFolder.trim() === savedFolder
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60'
                  : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60'
              }`}>
                {driveFolder.trim() === savedFolder ? '✓ Ativo e Salvo' : '● Alteração não salva'}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                <FolderOpen className="w-4 h-4" />
              </div>
              <input
                type="text"
                id="input-drive-folder"
                value={driveFolder}
                onChange={(e) => setDriveFolder(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveDriveFolder();
                  }
                }}
                placeholder="Ex: Finanças K - Backups ou Backups/Finanças"
                className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl text-xs sm:text-sm font-mono text-gray-900 dark:text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSaveDriveFolder()}
                disabled={savingFolder || (driveFolder.trim() === savedFolder && driveFolder.trim().length > 0)}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500 whitespace-nowrap"
                id="btn-save-drive-folder"
                title="Salvar diretório de destino"
              >
                {savingFolder ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : driveFolder.trim() === savedFolder ? (
                  <Check className="w-4 h-4 text-emerald-300" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                <span>{savingFolder ? 'Salvando...' : driveFolder.trim() === savedFolder ? 'Diretório Salvo' : 'Salvar Diretório'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenFolderPicker}
                disabled={loadingFolders}
                className="px-3.5 py-2.5 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-xs rounded-xl border border-gray-300 dark:border-gray-700 transition-all cursor-pointer flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500 whitespace-nowrap shadow-xs"
                id="btn-browse-drive-folders"
                title="Listar e escolher pastas existentes no seu Google Drive"
              >
                {loadingFolders ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-700 dark:text-emerald-400" />
                ) : (
                  <FolderPlus className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                )}
                <span>Explorar Pastas do Drive</span>
              </button>
            </div>
          </div>

          {/* Sugestões rápidas de diretórios */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs uppercase font-bold text-gray-500 tracking-wider mr-1">Sugestões:</span>
            {[
              'Finanças K - Backups',
              'Backups/Finanças K',
              'Meus Backups',
              'Financeiro'
            ].map((suggested) => (
              <button
                key={suggested}
                type="button"
                onClick={() => {
                  setDriveFolder(suggested);
                  handleSaveDriveFolder(suggested);
                }}
                className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  savedFolder === suggested
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 font-semibold shadow-xs'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                }`}
              >
                {suggested}
              </button>
            ))}
          </div>
        </div>

        {/* Actions bar for Google Drive */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="button"
            onClick={handleRunBackup}
            disabled={loading}
            className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-600/50 text-white font-bold py-3 px-5 rounded-2xl flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-lg shadow-emerald-600/10 focus-visible:ring-2 focus-visible:ring-emerald-500"
            id="btn-trigger-backup"
            aria-label={loading ? 'Executando backup no Google Drive' : 'Fazer backup agora para o Google Drive'}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            ) : (
              <CloudUpload className="w-5 h-5" aria-hidden="true" />
            )}
            <span>{loading ? 'Executando Backup...' : 'Fazer Backup Agora no Google Drive'}</span>
          </button>

          {googleToken ? (
            <button
              type="button"
              onClick={() => fetchDriveBackups(googleToken, savedFolder, savedFolderId)}
              disabled={loadingDriveFiles}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer border border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-emerald-500 text-xs"
              id="btn-refresh-drive-backups"
              title="Recarregar lista de backups do Google Drive"
            >
              <RefreshCw className={`w-4 h-4 ${loadingDriveFiles ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Atualizar Lista do Drive</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                try {
                  const token = await connectGoogleDrive();
                  if (token) {
                    toast.success('Conectado com sucesso ao seu Google Drive!');
                    fetchDriveBackups(token, savedFolder, savedFolderId);
                  }
                } catch (e) {
                  console.error(e);
                }
              }}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold py-3 px-5 rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer border border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-emerald-500"
              id="btn-connect-drive-auth"
            >
              Conectar Conta Google
            </button>
          )}
        </div>

        {/* Drive Backups List */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-4 h-4 text-gray-500" />
              <span>Backups Disponíveis no Google Drive</span>
              <span className="font-normal lowercase text-gray-500 font-mono text-xs">
                (pasta: {savedFolder})
              </span>
            </h3>
            {driveFiles.length > 0 && (
              <span className="text-xs text-gray-500 font-mono">
                {driveFiles.length} arquivo(s) encontrado(s)
              </span>
            )}
          </div>

          {!googleToken ? (
            <div className="p-6 text-center border border-gray-150 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-gray-950/20 text-xs text-gray-500 space-y-2">
              <p>Conecte sua conta Google para listar e restaurar os backups armazenados no seu Drive.</p>
            </div>
          ) : loadingDriveFiles ? (
            <div className="p-8 text-center border border-gray-150 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-gray-950/20 text-xs text-gray-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-700 dark:text-emerald-400" />
              <span>Buscando backups salvos na pasta "{savedFolder}"...</span>
            </div>
          ) : driveFiles.length === 0 ? (
            <div className="p-6 text-center border border-gray-150 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-gray-950/20 text-xs text-gray-500 space-y-1">
              <p className="font-semibold text-gray-700 dark:text-gray-300">Nenhum backup encontrado na pasta "{savedFolder}".</p>
              <p>Clique no botão acima para gerar um backup nesta pasta ou altere o diretório desejado.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-150 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
              {driveFiles.map((file) => (
                <div 
                  key={file.id} 
                  className="p-3.5 sm:p-4 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-850/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <FileArchive className="w-5 h-5 text-emerald-700 dark:text-emerald-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-gray-900 dark:text-white font-mono">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatDate(file.createdTime)} • {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedDriveFileForRestore(file)}
                    className="self-end sm:self-auto bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
                    id={`btn-restore-drive-${file.id}`}
                  >
                    <FolderSync className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Restaurar Este Backup</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SEÇÃO 3: PREFERÊNCIAS & AGENDAMENTO AUTOMÁTICO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-500" aria-hidden="true" />
              Agendamento Automático
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              O aplicativo verifica se o intervalo semanal foi atingido e sincroniza silenciosamente uma cópia no Google Drive.
            </p>
          </div>

          <label htmlFor="checkbox-weekly-backup" className="flex items-center gap-3 cursor-pointer p-3.5 bg-gray-50 dark:bg-gray-950 border border-gray-150 dark:border-gray-850 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-900 transition-all select-none">
            <input
              type="checkbox"
              checked={backupEnabled}
              onChange={handleToggleBackup}
              disabled={statusLoading}
              className="w-5 h-5 accent-emerald-600 rounded cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
              id="checkbox-weekly-backup"
            />
            <div className="flex-1">
              <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Backup Semanal no Google Drive</span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Executado em segundo plano quando conectado.</p>
            </div>
          </label>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              Segurança e Privacidade
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Todos os seus backups contêm apenas a base de dados (database_backup.json), compactada em .zip e gravada exclusivamente na sua própria conta privada do Google Drive.
            </p>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-950 border border-gray-150 dark:border-gray-850 rounded-2xl text-xs text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Status atual:</span>{' '}
            {!backupEnabled ? 'Agendamento desativado' : isBackupPending() ? 'Pendente de sincronização' : 'Ativo e atualizado'}
          </div>
        </div>
      </div>

      {/* MODAL 1: CONFIRMAR RESTAURAÇÃO DE ARQUIVO LOCAL */}
      {showLocalRestoreModal && localFilePreview && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-restore-local-title"
        >
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-7 max-w-lg w-full space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="modal-restore-local-title" className="font-bold text-gray-900 dark:text-white text-base">
                    Confirmar Restauração de Dados
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Arquivo: {localFilePreview.fileName}
                  </p>
                </div>
              </div>
              <button
            aria-label="Fechar"
                type="button"
                onClick={() => setShowLocalRestoreModal(false)}
                className="text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-950 p-4 rounded-2xl border border-gray-200 dark:border-gray-800">
              <p className="leading-relaxed">
                Você está prestes a restaurar <strong className="text-gray-900 dark:text-white">{localFilePreview.transactionsCount} transações</strong>, <strong className="text-gray-900 dark:text-white">{localFilePreview.accountsCount} contas</strong> e <strong className="text-gray-900 dark:text-white">{localFilePreview.categoriesCount} categorias</strong> nesta área de desenvolvimento.
              </p>
              
              <div className="pt-2 border-t border-gray-200 dark:border-gray-800 space-y-2">
                <span className="font-bold text-gray-800 dark:text-gray-200 block">Modo de Restauração:</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="restoreMode"
                    value="replace"
                    checked={restoreMode === 'replace'}
                    onChange={() => setRestoreMode('replace')}
                    className="accent-emerald-600"
                  />
                  <span><strong>Substituir Base Atual (Recomendado):</strong> Limpa os dados de teste existentes nesta área e replica a base do backup.</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="restoreMode"
                    value="merge"
                    checked={restoreMode === 'merge'}
                    onChange={() => setRestoreMode('merge')}
                    className="accent-emerald-600"
                  />
                  <span><strong>Mesclar:</strong> Adiciona os dados do backup sem apagar os existentes.</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLocalRestoreModal(false)}
                disabled={restoringLocal}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmLocalRestore}
                disabled={restoringLocal}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
                id="btn-confirm-execute-restore"
              >
                {restoringLocal ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Restaurando Dados...</span>
                  </>
                ) : (
                  <span>Confirmar e Restaurar Agora</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRMAR RESTAURAÇÃO DO GOOGLE DRIVE */}
      {selectedDriveFileForRestore && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-restore-drive-title"
        >
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-7 max-w-lg w-full space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
                  <FolderSync className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="modal-restore-drive-title" className="font-bold text-gray-900 dark:text-white text-base">
                    Restaurar Backup do Google Drive
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                    {selectedDriveFileForRestore.name}
                  </p>
                </div>
              </div>
              <button
            aria-label="Fechar"
                type="button"
                onClick={() => setSelectedDriveFileForRestore(null)}
                className="text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-950 p-4 rounded-2xl border border-gray-200 dark:border-gray-800">
              <p className="leading-relaxed">
                O arquivo será baixado diretamente do seu Google Drive e os dados financeiros (<strong className="text-gray-900 dark:text-white">database_backup.json</strong>) serão importados para este ambiente.
              </p>
              
              <div className="pt-2 border-t border-gray-200 dark:border-gray-800 space-y-2">
                <span className="font-bold text-gray-800 dark:text-gray-200 block">Modo de Restauração:</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="restoreDriveMode"
                    value="replace"
                    checked={restoreMode === 'replace'}
                    onChange={() => setRestoreMode('replace')}
                    className="accent-emerald-600"
                  />
                  <span><strong>Substituir Base Atual (Recomendado):</strong> Limpa os dados de teste nesta área e restaura fielmente o backup do Drive.</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="restoreDriveMode"
                    value="merge"
                    checked={restoreMode === 'merge'}
                    onChange={() => setRestoreMode('merge')}
                    className="accent-emerald-600"
                  />
                  <span><strong>Mesclar:</strong> Mantém transações existentes e adiciona as do backup.</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedDriveFileForRestore(null)}
                disabled={restoringDrive}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDriveRestore}
                disabled={restoringDrive}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
                id="btn-confirm-execute-drive-restore"
              >
                {restoringDrive ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Baixando e Restaurando...</span>
                  </>
                ) : (
                  <span>Restaurar do Drive Agora</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: EXPLORADOR HIERÁRQUICO DE PASTAS DO GOOGLE DRIVE */}
      {showFolderModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-folder-picker-title"
        >
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3.5 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-2xl">
                  <FolderOpen className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="modal-folder-picker-title" className="font-bold text-gray-900 dark:text-white text-base">
                    Navegar no Google Drive
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Explore pastas, subpastas ou crie uma nova pasta para seus backups
                  </p>
                </div>
              </div>
              <button
            aria-label="Fechar"
                type="button"
                onClick={() => setShowFolderModal(false)}
                className="p-1.5 text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                id="btn-close-folder-modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Breadcrumb path navigation */}
            <div className="bg-gray-50 dark:bg-gray-950/60 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 flex items-center gap-1.5 overflow-x-auto text-xs flex-shrink-0 scrollbar-none">
              <button
                type="button"
                onClick={() => handleNavigateToCrumb(0)}
                className="flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-semibold cursor-pointer whitespace-nowrap p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                title="Ir para a Raiz do Google Drive"
              >
                <HardDrive className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                <span>Meu Drive</span>
              </button>

              {folderBreadcrumbs.slice(1).map((crumb, idx) => {
                const isLast = idx === folderBreadcrumbs.length - 2;
                return (
                  <div key={crumb.id} className="flex items-center gap-1.5 flex-shrink-0">
                    <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                    <button
                      type="button"
                      onClick={() => handleNavigateToCrumb(idx + 1)}
                      className={`px-1.5 py-0.5 rounded font-mono font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        isLast 
                          ? 'bg-emerald-100/70 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 font-bold' 
                          : 'text-gray-600 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-200 dark:hover:bg-gray-800'
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Search & Actions Bar */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  aria-label="Pesquisar pastas no Google Drive"
                  value={folderSearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFolderSearch(val);
                    if (googleToken) {
                      loadDriveFoldersForParent(
                        googleToken, 
                        val ? undefined : folderBreadcrumbs[folderBreadcrumbs.length - 1].id,
                        val
                      );
                    }
                  }}
                  placeholder="Buscar pasta por nome em todo o Drive..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono placeholder:text-gray-500"
                  id="input-search-drive-folders"
                />
              </div>

              {folderBreadcrumbs.length > 1 && !folderSearch && (
                <button
                  type="button"
                  onClick={handleNavigateUp}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="Voltar um nível acima"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Subir</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowNewFolderInput(!showNewFolderInput)}
                className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                title="Criar nova subpasta neste local"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                <span>Nova Pasta</span>
              </button>
            </div>

            {/* In-place New Folder Creator */}
            {showNewFolderInput && (
              <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150 flex-shrink-0">
                <FolderPlus className="w-4 h-4 text-emerald-700 dark:text-emerald-400 flex-shrink-0" />
                <input
                  type="text"
                  aria-label="Nome da nova pasta"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateNewFolder();
                    }
                  }}
                  placeholder="Nome da nova pasta (ex: Backups)..."
                  className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-gray-900 border border-emerald-300 dark:border-emerald-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreateNewFolder}
                  disabled={creatingFolder || !newFolderName.trim()}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 text-white font-bold text-xs rounded-lg cursor-pointer flex items-center gap-1"
                >
                  {creatingFolder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Criar</span>
                </button>
                <button
            aria-label="Fechar"
                  type="button"
                  onClick={() => setShowNewFolderInput(false)}
                  className="p-1.5 text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Folder list body */}
            <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[360px] border border-gray-100 dark:border-gray-800 rounded-2xl divide-y divide-gray-100 dark:divide-gray-800/60 p-1">
              {loadingFolders ? (
                <div className="p-12 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2.5">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-700 dark:text-emerald-400" />
                  <span>Navegando no Google Drive...</span>
                </div>
              ) : availableFolders.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500 space-y-2">
                  <Folder className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto" />
                  <p className="font-semibold text-gray-700 dark:text-gray-300">
                    {folderSearch ? 'Nenhuma pasta encontrada com esse termo.' : 'Nenhuma subpasta encontrada aqui.'}
                  </p>
                  <p className="text-xs">
                    Você pode usar o botão <strong>"Nova Pasta"</strong> acima para criar uma subpasta aqui ou selecionar esta pasta aberta como destino.
                  </p>
                </div>
              ) : (
                availableFolders.map((f) => {
                  const currentPath = folderBreadcrumbs.slice(1).map(c => c.name).concat([f.name]).join('/');
                  // Prefer matching by stable Drive folder ID; fall back to path/name for older saved configs
                  const isSelected =
                    (savedFolderId && savedFolderId === f.id) ||
                    (driveFolderId && driveFolderId === f.id) ||
                    savedFolder === currentPath ||
                    driveFolder === currentPath ||
                    savedFolder === f.name;

                  return (
                    <div
                      key={f.id}
                      className={`group p-2.5 rounded-xl flex items-center justify-between gap-2 transition-all ${
                        isSelected
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      {/* Folder open / navigation button */}
                      <button
                        type="button"
                        onClick={() => handleNavigateIntoFolder(f)}
                        className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer p-2 rounded hover:opacity-80 transition-opacity"
                        title={`Entrar na pasta "${f.name}"`}
                      >
                        <Folder className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-500'}`} />
                        <span className="text-xs font-semibold font-mono text-gray-900 dark:text-gray-100 truncate">
                          {f.name}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-emerald-500 transition-colors ml-auto mr-2" />
                      </button>

                      {/* Action buttons: choose as destination */}
                      <button
                        type="button"
                        onClick={() => handleSelectFolderFromPicker(f)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-emerald-700 text-white shadow-xs'
                            : 'bg-gray-100 dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-300 border border-gray-200 dark:border-gray-700'
                        }`}
                        title="Escolher esta pasta como destino dos backups"
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Ativa</span>
                          </>
                        ) : (
                          <span>Selecionar</span>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal footer with current folder confirmation and dismissal */}
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 flex-shrink-0">
              <div className="text-xs text-gray-500 truncate">
                Pasta aberta:{' '}
                <span className="font-mono font-bold text-gray-800 dark:text-gray-200">
                  {folderBreadcrumbs.length > 1 
                    ? folderBreadcrumbs.slice(1).map(c => c.name).join('/') 
                    : '(Raiz do Drive)'}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2">
                {folderBreadcrumbs.length > 1 && (
                  <button
                    type="button"
                    onClick={handleSelectCurrentOpenFolder}
                    className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Usar Pasta Atual Aberta</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowFolderModal(false)}
                  className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs rounded-xl cursor-pointer whitespace-nowrap"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
