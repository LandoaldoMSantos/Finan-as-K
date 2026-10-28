import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean, primaryKey, index } from 'drizzle-orm/pg-core';

// Users table (UID is Firebase UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  lastBackupAt: timestamp('last_backup_at'),
  backupEnabled: boolean('backup_enabled').default(false),
  backupDriveFolder: text('backup_drive_folder').default('Finanças K - Backups'),
  backupDriveFolderId: text('backup_drive_folder_id'), // Google Drive folder ID (stable)
  createdAt: timestamp('created_at').defaultNow(),
});

// Accounts table
export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  type: text('type').default('Corrente').notNull(), // "Corrente" is default
  initialBalance: integer('initial_balance').default(0).notNull(), // Store in cents (e.g. $10.00 = 1000)
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  index('accounts_user_idx').on(t.userId),
]);

// Categories table (with parent-child hierarchy)
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'despesa' or 'receita'
  parentId: integer('parent_id'), // Self-reference for subcategories
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  index('categories_user_idx').on(t.userId),
]);

// Transactions table
export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  accountId: integer('account_id')
    .references(() => accounts.id, { onDelete: 'cascade' })
    .notNull(),
  date: text('date').notNull(), // Format: YYYY-MM-DD
  payee: text('payee').notNull(), // Beneficiário
  amount: integer('amount').notNull(), // Store in cents (positive value)
  type: text('type').notNull(), // 'debito' (expense/outflow) or 'credito' (income/inflow)
  categoryId: integer('category_id')
    .references(() => categories.id, { onDelete: 'set null' }),
  memo: text('memo'), // Observações
  isRecurring: boolean('is_recurring').default(false).notNull(),
  recurrenceInterval: text('recurrence_interval'), // 'diario', 'semanal', 'mensal', 'anual' etc.
  remainingOccurrences: integer('remaining_occurrences'), // number of remaining occurrences (null or 0 means infinite)
  nextDueDate: text('next_due_date'), // Format: YYYY-MM-DD (for planned/scheduled transactions)
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  index('transactions_user_recurring_date_idx').on(t.userId, t.isRecurring, t.date.desc(), t.id.desc()),
  index('transactions_account_date_idx').on(t.accountId, t.date, t.id),
  index('transactions_category_idx').on(t.categoryId),
]);

// Tags table
export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  index('tags_user_idx').on(t.userId),
]);

// Payees table
export const payees = pgTable('payees', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  index('payees_user_idx').on(t.userId),
]);

// Many-to-many relationship table between Transactions and Tags
export const transactionTags = pgTable('transaction_tags', {
  transactionId: integer('transaction_id')
    .references(() => transactions.id, { onDelete: 'cascade' })
    .notNull(),
  tagId: integer('tag_id')
    .references(() => tags.id, { onDelete: 'cascade' })
    .notNull(),
}, (t) => [
  primaryKey({ columns: [t.transactionId, t.tagId] }),
  index('transaction_tags_tx_idx').on(t.transactionId),
]);

// Transaction splits (for multi-category/split transactions)
export const transactionSplits = pgTable('transaction_splits', {
  id: serial('id').primaryKey(),
  transactionId: integer('transaction_id')
    .references(() => transactions.id, { onDelete: 'cascade' })
    .notNull(),
  categoryId: integer('category_id')
    .references(() => categories.id, { onDelete: 'set null' }),
  amount: integer('amount').notNull(), // Store in cents
  memo: text('memo'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  index('transaction_splits_tx_idx').on(t.transactionId),
]);

// Relationships
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  categories: many(categories),
  transactions: many(transactions),
  tags: many(tags),
  payees: many(payees),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, {
    fields: [categories.userId],
    references: [users.id],
  }),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'subcategoryOf',
  }),
  subcategories: many(categories, {
    relationName: 'subcategoryOf',
  }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  transactionTags: many(transactionTags),
  splits: many(transactionSplits),
}));

export const transactionSplitsRelations = relations(transactionSplits, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionSplits.transactionId],
    references: [transactions.id],
  }),
  category: one(categories, {
    fields: [transactionSplits.categoryId],
    references: [categories.id],
  }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(users, {
    fields: [tags.userId],
    references: [users.id],
  }),
  transactionTags: many(transactionTags),
}));

export const transactionTagsRelations = relations(transactionTags, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionTags.transactionId],
    references: [transactions.id],
  }),
  tag: one(tags, {
    fields: [transactionTags.tagId],
    references: [tags.id],
  }),
}));

export const payeesRelations = relations(payees, ({ one }) => ({
  user: one(users, {
    fields: [payees.userId],
    references: [users.id],
  }),
}));
