import { auth } from './firebase.ts';

let apiToken: string | null = null;

export function setAuthToken(token: string | null) {
  apiToken = token;
}

async function fetchAPI<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  
  // Proactively fetch a fresh token if the user is authenticated
  if (auth.currentUser) {
    try {
      apiToken = await auth.currentUser.getIdToken();
    } catch (e) {
      console.warn('Could not proactively get fresh ID token:', e);
    }
  }
  
  if (apiToken) {
    headers.set('Authorization', `Bearer ${apiToken}`);
  }
  
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(endpoint, {
    ...options,
    headers,
  });

  // If unauthorized, attempt to force refresh the token and retry once
  if (response.status === 401 && auth.currentUser) {
    try {
      console.warn('Encountered 401, forcing token refresh and retrying...');
      const freshToken = await auth.currentUser.getIdToken(true);
      apiToken = freshToken;
      headers.set('Authorization', `Bearer ${freshToken}`);
      response = await fetch(endpoint, {
        ...options,
        headers,
      });
    } catch (refreshErr) {
      console.error('Failed to refresh token on 401:', refreshErr);
    }
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('text/html')) {
    throw new Error(`O servidor retornou HTML ao invés de JSON. A rota '${endpoint}' pode não estar configurada ou o servidor está em reinicialização.`);
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Erro HTTP! status: ${response.status}`);
  }

  try {
    return await response.json();
  } catch (err) {
    throw new Error(`Falha ao decodificar a resposta JSON para o endpoint '${endpoint}'.`);
  }
}

export const api = {
  // Auth Sync
  getCurrentUser: () => fetchAPI('/api/me'),

  // Accounts
  getAccounts: () => fetchAPI('/api/accounts'),
  createAccount: (data: { name: string; type: string; initialBalance: number }) => 
    fetchAPI('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateAccount: (id: number, data: { name: string; type: string; initialBalance: number }) => 
    fetchAPI(`/api/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteAccount: (id: number) => 
    fetchAPI(`/api/accounts/${id}`, {
      method: 'DELETE',
    }),

  // Categories
  getCategories: () => fetchAPI('/api/categories'),
  createCategory: (data: { name: string; type: 'despesa' | 'receita'; parentId: number | null }) => 
    fetchAPI('/api/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCategory: (id: number, data: { name: string; type: 'despesa' | 'receita'; parentId: number | null }) => 
    fetchAPI(`/api/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: number) => 
    fetchAPI(`/api/categories/${id}`, {
      method: 'DELETE',
    }),
  transferCategoryTransactions: (data: {
    fromCategoryId: number;
    toCategoryId?: number;
    newCategory?: { name: string; type: 'despesa' | 'receita'; parentId?: number | null };
    startDate?: string | null;
    endDate?: string | null;
  }) =>
    fetchAPI('/api/categories/transfer-transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Tags
  getTags: () => fetchAPI('/api/tags'),
  createTag: (data: { name: string }) => 
    fetchAPI('/api/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteTag: (id: number) => 
    fetchAPI(`/api/tags/${id}`, {
      method: 'DELETE',
    }),

  // Payees
  getPayees: () => fetchAPI('/api/payees'),
  createPayee: (data: { name: string }) => 
    fetchAPI('/api/payees', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updatePayee: (id: number, data: { name: string }) => 
    fetchAPI(`/api/payees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deletePayee: (id: number) => 
    fetchAPI(`/api/payees/${id}`, {
      method: 'DELETE',
    }),

  // Transactions
  getTransactions: (params?: {
    page?: number;
    limit?: number;
    accountId?: number | string;
    startDate?: string;
    endDate?: string;
    type?: string;
    search?: string;
    categoryId?: number | string;
    isRecurring?: boolean;
  }) => {
    if (!params) return fetchAPI('/api/transactions');
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.accountId) query.set('accountId', String(params.accountId));
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    if (params.type) query.set('type', params.type);
    if (params.search) query.set('search', params.search);
    if (params.categoryId) query.set('categoryId', String(params.categoryId));
    if (params.isRecurring !== undefined) query.set('isRecurring', String(params.isRecurring));
    const qs = query.toString();
    return fetchAPI(qs ? `/api/transactions?${qs}` : '/api/transactions');
  },
  createTransaction: (data: {
    accountId: number;
    date: string;
    payee: string;
    amount: number;
    type: 'debito' | 'credito';
    categoryId: number | null;
    memo: string;
    isRecurring?: boolean;
    recurrenceInterval?: string | null;
    nextDueDate?: string | null;
    tagIds?: number[];
  }) => 
    fetchAPI('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTransaction: (id: number, data: {
    accountId: number;
    date: string;
    payee: string;
    amount: number;
    type: 'debito' | 'credito';
    categoryId: number | null;
    memo: string;
    isRecurring?: boolean;
    recurrenceInterval?: string | null;
    nextDueDate?: string | null;
    tagIds?: number[];
  }) => 
    fetchAPI(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteTransaction: (id: number) => 
    fetchAPI(`/api/transactions/${id}`, {
      method: 'DELETE',
    }),

  // Import
  parseImportFile: (fileContent: string, fileName: string) => 
    fetchAPI('/api/import/parse', {
      method: 'POST',
      body: JSON.stringify({ fileContent, fileName }),
    }),
  confirmImport: (accountId: number, txs: any[], overwriteDuplicates?: boolean) => 
    fetchAPI('/api/import/confirm', {
      method: 'POST',
      body: JSON.stringify({ accountId, txs, overwriteDuplicates }),
    }),

  // Trigger Recurring Bill
  triggerRecurringTransaction: (id: number, payload?: any) =>
    fetchAPI(`/api/transactions/recurring/${id}/trigger`, {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined,
    }),
  // Clear Database
  clearAllData: (keepRecurring?: boolean) =>
    fetchAPI('/api/danger/clear-all', {
      method: 'POST',
      body: JSON.stringify({ keepRecurring }),
    }),

  // Google Drive Backup & Restore
  getBackupStatus: () =>
    fetchAPI<{
      backupEnabled: boolean;
      lastBackupAt: string | null;
      backupDriveFolder?: string;
      backupDriveFolderId?: string | null;
    }>('/api/backup/status'),
  toggleBackupSetting: (enabled: boolean) =>
    fetchAPI<{ success: boolean; backupEnabled: boolean }>('/api/backup/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
  updateBackupFolder: (folder: string, folderId?: string | null) =>
    fetchAPI<{ success: boolean; backupDriveFolder: string; backupDriveFolderId?: string | null }>('/api/backup/folder', {
      method: 'POST',
      body: JSON.stringify({ folder, folderId: folderId || null }),
    }),
  listDriveFolders: (accessToken: string, parentId?: string, search?: string) => {
    let url = `/api/backup/drive/folders?accessToken=${encodeURIComponent(accessToken)}`;
    if (parentId) url += `&parentId=${encodeURIComponent(parentId)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return fetchAPI<{ folders: Array<{ id: string; name: string; parents?: string[]; modifiedTime?: string }> }>(url);
  },
  createDriveFolder: (accessToken: string, folderName: string, parentId?: string) =>
    fetchAPI<{ success: boolean; folder: { id: string; name: string } }>('/api/backup/drive/create-folder', {
      method: 'POST',
      body: JSON.stringify({ accessToken, folderName, parentId }),
    }),
  runBackup: (accessToken: string, folder?: string, folderId?: string | null) =>
    fetchAPI<{ success: boolean; message: string; filename: string; fileId: string; folderName?: string; lastBackupAt: string }>('/api/backup/run', {
      method: 'POST',
      body: JSON.stringify({ accessToken, folder, folderId: folderId || null }),
    }),
  exportBackupJson: () =>
    fetchAPI<any>('/api/backup/export'),
  restoreBackup: (backupData: any, mode: 'replace' | 'merge' = 'replace') =>
    fetchAPI<{ success: boolean; message: string; summary: any }>('/api/backup/restore', {
      method: 'POST',
      body: JSON.stringify({ backupData, mode }),
    }),
  listDriveBackups: (accessToken: string, folder?: string, folderId?: string | null) => {
    let url = `/api/backup/drive/list?accessToken=${encodeURIComponent(accessToken)}`;
    if (folder) url += `&folder=${encodeURIComponent(folder)}`;
    if (folderId) url += `&folderId=${encodeURIComponent(folderId)}`;
    return fetchAPI<{ 
      files: Array<{ id: string; name: string; size?: string; createdTime: string }>;
      folder?: string;
      folderId?: string | null;
    }>(url);
  },
  restoreDriveBackup: (fileId: string, accessToken: string, mode: 'replace' | 'merge' = 'replace') =>
    fetchAPI<{ success: boolean; message: string; summary: any }>('/api/backup/drive/restore', {
      method: 'POST',
      body: JSON.stringify({ fileId, accessToken, mode }),
    }),
};
