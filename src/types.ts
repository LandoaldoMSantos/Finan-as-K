export interface User {
  id: number;
  uid: string;
  email: string;
  lastBackupAt: string | null;
  backupEnabled: boolean;
  createdAt: string;
}

export interface Account {
  id: number;
  userId: number;
  name: string;
  type: string;
  initialBalance: number; // in cents
  currentBalance?: number; // in cents, computed on server
  todayBalance?: number; // in cents, computed on server
  createdAt: string;
}

export interface Category {
  id: number;
  userId: number;
  name: string;
  type: 'despesa' | 'receita';
  parentId: number | null;
  createdAt: string;
}

export interface Tag {
  id: number;
  userId: number;
  name: string;
  createdAt: string;
}

export interface Payee {
  id: number;
  userId: number;
  name: string;
  createdAt: string;
}

export interface TransactionSplit {
  id: number;
  transactionId: number;
  categoryId: number | null;
  amount: number; // in cents
  memo: string | null;
  createdAt: string;
  category?: Category | null;
}

export interface Transaction {
  id: number;
  userId: number;
  accountId: number;
  date: string; // YYYY-MM-DD
  payee: string;
  amount: number; // in cents
  type: 'debito' | 'credito';
  categoryId: number | null;
  memo: string | null;
  isRecurring: boolean;
  recurrenceInterval: 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'anual' | null;
  remainingOccurrences: number | null;
  nextDueDate: string | null;
  createdAt: string;
  category?: Category | null;
  account?: Account;
  tags?: Tag[];
  splits?: TransactionSplit[];
  runningBalance?: number; // in cents, computed running balance from bank statements
}

export interface ParsedSplit {
  categoryName: string;
  subcategoryName?: string;
  amount: number; // in cents
  memo?: string;
}

export interface ImportPreview {
  format: 'csv' | 'qif';
  headers: string[];
  transactions: {
    date: string;
    payee: string;
    amount: number; // in cents
    type: 'debito' | 'credito';
    memo: string;
    categoryName?: string;
    subcategoryName?: string;
    splits?: ParsedSplit[];
  }[];
}
