import express from 'express';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';
import compression from 'compression';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';
import { db } from './src/db/index.ts';
import { users, accounts, categories, transactions, tags, transactionTags, payees, transactionSplits } from './src/db/schema.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { eq, and, or, sql, desc, inArray, lte, gte, like } from 'drizzle-orm';
import { detectFormat, parseQIF, parseCSV, mapCSVTransactions, autoDetectMapping, ParsedTransaction } from './src/lib/parsers.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.disable('x-powered-by');

  // Security headers. CSP stays off because Vite dev, Firebase Auth popups and Google APIs
  // need inline scripts and several origins; the popup-friendly COOP keeps Google sign-in working.
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginEmbedderPolicy: false,
  }));

  // gzip/brotli-negotiated compression for JSON and static assets
  app.use(compression());

  // Large bodies are only accepted where files/backups are uploaded; everything else stays small
  const largeBodyRoutes = ['/api/import', '/api/backup/restore'];
  app.use(largeBodyRoutes, express.json({ limit: '100mb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Indexes for the queries every screen runs (safe, idempotent)
  try {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS transactions_user_recurring_date_idx ON transactions (user_id, is_recurring, date DESC, id DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS transactions_account_date_idx ON transactions (account_id, date, id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions (category_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS transaction_tags_tx_idx ON transaction_tags (transaction_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS transaction_splits_tx_idx ON transaction_splits (transaction_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS accounts_user_idx ON accounts (user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS categories_user_idx ON categories (user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS tags_user_idx ON tags (user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS payees_user_idx ON payees (user_id)`);
    console.log('Schema check: indexes ensured.');
  } catch (e) {
    console.warn('Index creation skipped or failed:', e);
  }

  // Trigram indexes make the "contains" search on payee/memo use an index (needs pg_trgm)
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS transactions_payee_trgm_idx ON transactions USING gin (lower(payee) gin_trgm_ops)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS transactions_memo_trgm_idx ON transactions USING gin (lower(coalesce(memo, '')) gin_trgm_ops)`);
  } catch (e) {
    console.warn('pg_trgm search indexes skipped (extension not available):', e);
  }

  // Ensure new schema columns exist (safe, idempotent)
  try {
    await db.execute(sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS backup_drive_folder_id text
    `);
    console.log('Schema check: backup_drive_folder_id column ensured.');
  } catch (e) {
    console.warn('Schema ensure (backup_drive_folder_id) skipped or failed:', e);
  }

  // Helper: auto-generate standard categories for a new user if none exist
  async function ensureDefaultCategories(dbUserId: number) {
    try {
      const existing = await db.select().from(categories).where(eq(categories.userId, dbUserId)).limit(1);
      if (existing.length > 0) return;

      console.log(`Generating default categories for user ${dbUserId}`);

      const defaultCats = [
        { name: 'Receitas', type: 'receita', subs: ['Salário', 'Investimentos', 'Outras Receitas'] },
        { name: 'Alimentação', type: 'despesa', subs: ['Supermercado', 'Restaurante', 'Lanches'] },
        { name: 'Transporte', type: 'despesa', subs: ['Combustível', 'Transporte Público', 'Uber/Táxi'] },
        { name: 'Moradia', type: 'despesa', subs: ['Aluguel/Financiamento', 'Condomínio', 'Luz/Água/Gás', 'Internet/TV'] },
        { name: 'Saúde', type: 'despesa', subs: ['Plano de Saúde', 'Farmácia', 'Consultas/Exames'] },
        { name: 'Lazer & Cultura', type: 'despesa', subs: ['Cinema/Teatro', 'Viagens', 'Shows/Eventos'] },
        { name: 'Educação', type: 'despesa', subs: ['Mensalidade Escolar', 'Cursos/Palestras', 'Livros/Materiais'] },
        { name: 'Outras Despesas', type: 'despesa', subs: ['Tarifas Bancárias', 'Impostos', 'Diversos'] }
      ];

      for (const cat of defaultCats) {
        // Insert parent
        const parentResult = await db.insert(categories).values({
          userId: dbUserId,
          name: cat.name,
          type: cat.type,
          parentId: null,
        }).returning();

        const parentId = parentResult[0].id;

        // Insert subcategories
        for (const sub of cat.subs) {
          await db.insert(categories).values({
            userId: dbUserId,
            name: sub,
            type: cat.type,
            parentId: parentId,
          });
        }
      }
    } catch (e) {
      console.error('Error generating default categories:', e);
    }
  }

  // Recurring transaction templates are managed in "Contas e Agendamentos Recorrentes"
  // and are converted into real bank statement entries only upon explicit user settlement ("Dar Baixa").

  // API Route: Check auth status / User sync
  app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = req.dbUser;
      if (!dbUser) {
        return res.status(401).json({ error: 'User synchronization failed.' });
      }

      // Auto create defaults
      await ensureDefaultCategories(dbUser.id);

      res.json({
        user: req.user,
        dbUser: dbUser,
      });
    } catch (error: any) {
      console.error('Error in /api/me:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Routes: Accounts
  app.get('/api/accounts', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      
      // Load accounts
      const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, userId));
      
      // Aggregate balances in SQL instead of loading every transaction into memory.
      // Scheduled items ([Agendado]) are excluded, as before.
      const todayStr = new Date().toISOString().split('T')[0];
      const sums = await db.select({
        accountId: transactions.accountId,
        total: sql<number>`cast(coalesce(sum(case when ${transactions.type} = 'credito' then ${transactions.amount} else -${transactions.amount} end), 0) as bigint)`,
        untilToday: sql<number>`cast(coalesce(sum(case when ${transactions.date} <= ${todayStr} then (case when ${transactions.type} = 'credito' then ${transactions.amount} else -${transactions.amount} end) else 0 end), 0) as bigint)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.userId, userId),
        eq(transactions.isRecurring, false),
        sql`(${transactions.memo} IS NULL OR ${transactions.memo} NOT LIKE '%[Agendado]%')`
      ))
      .groupBy(transactions.accountId);

      const sumsByAccount = new Map(sums.map((r) => [r.accountId, r]));

      const accountsWithBalances = userAccounts.map(acc => {
        const agg = sumsByAccount.get(acc.id);
        return {
          ...acc,
          currentBalance: acc.initialBalance + Number(agg?.total ?? 0),
          todayBalance: acc.initialBalance + Number(agg?.untilToday ?? 0),
        };
      });

      res.json(accountsWithBalances);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/accounts', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const { name, type, initialBalance } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Account name is required' });
      }

      const balanceCents = typeof initialBalance === 'number' ? initialBalance : Math.round(parseFloat(initialBalance || '0') * 100);

      const result = await db.insert(accounts).values({
        userId,
        name,
        type: type || 'Corrente',
        initialBalance: balanceCents,
      }).returning();

      res.status(201).json(result[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/accounts/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const id = parseInt(req.params.id);
      const { name, type, initialBalance } = req.body;

      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const balanceCents = typeof initialBalance === 'number' ? initialBalance : Math.round(parseFloat(initialBalance || '0') * 100);

      const result = await db.update(accounts)
        .set({
          name,
          type: type || 'Corrente',
          initialBalance: balanceCents,
        })
        .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: 'Account not found or access denied' });
      }

      res.json(result[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/accounts/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const id = parseInt(req.params.id);

      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      // First check if there are other accounts
      const remaining = await db.select().from(accounts).where(eq(accounts.userId, userId));
      if (remaining.length <= 1 && remaining.some(acc => acc.id === id)) {
        return res.status(400).json({ error: 'Não é possível excluir a única conta cadastrada. Você precisa de pelo menos uma conta.' });
      }

      const result = await db.delete(accounts)
        .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: 'Account not found or access denied' });
      }

      res.json({ message: 'Account deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API Routes: Categories
  app.get('/api/categories', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const userCategories = await db.select().from(categories).where(eq(categories.userId, userId));
      res.json(userCategories);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/categories', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const { name, type, parentId } = req.body;

      if (!name || !type) {
        return res.status(400).json({ error: 'Name and Type are required' });
      }

      const result = await db.insert(categories).values({
        userId,
        name,
        type,
        parentId: parentId ? parseInt(parentId) : null,
      }).returning();

      res.status(201).json(result[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/categories/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const id = parseInt(req.params.id);
      const { name, type, parentId } = req.body;

      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const result = await db.update(categories)
        .set({
          name,
          type,
          parentId: parentId ? parseInt(parentId) : null,
        })
        .where(and(eq(categories.id, id), eq(categories.userId, userId)))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.json(result[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/categories/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const id = parseInt(req.params.id);

      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      // 1. Get all subcategories to check them as well
      const subCategories = await db.select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.parentId, id), eq(categories.userId, userId)));
      
      const allCategoryIds = [id, ...subCategories.map(sub => sub.id)];

      // 2. Validate if there are any transactions associated with these categories
      const linkedTransactions = await db.select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            inArray(transactions.categoryId, allCategoryIds)
          )
        )
        .limit(1);

      if (linkedTransactions.length > 0) {
        return res.status(400).json({
          error: 'Não é possível excluir esta categoria pois existem transações vinculadas a ela ou a suas subcategorias.'
        });
      }

      // Find children categories and null their parents (if we allow deleting when empty of transactions)
      await db.update(categories)
        .set({ parentId: null })
        .where(and(eq(categories.parentId, id), eq(categories.userId, userId)));

      const result = await db.delete(categories)
        .where(and(eq(categories.id, id), eq(categories.userId, userId)))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.json({ message: 'Category deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Transfer transactions between categories
  app.post('/api/categories/transfer-transactions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      let { fromCategoryId, toCategoryId, newCategory, startDate, endDate } = req.body;

      fromCategoryId = parseInt(fromCategoryId);
      if (isNaN(fromCategoryId)) {
        return res.status(400).json({ error: 'Categoria de origem inválida.' });
      }

      // If requested to create a new category directly
      if (newCategory && newCategory.name) {
        const created = await db.insert(categories).values({
          userId,
          name: newCategory.name.trim(),
          type: newCategory.type || 'despesa',
          parentId: newCategory.parentId ? parseInt(newCategory.parentId) : null,
        }).returning();
        toCategoryId = created[0].id;
      } else {
        toCategoryId = parseInt(toCategoryId);
      }

      if (isNaN(toCategoryId)) {
        return res.status(400).json({ error: 'Categoria de destino inválida.' });
      }

      if (fromCategoryId === toCategoryId) {
        return res.status(400).json({ error: 'A categoria de origem e de destino devem ser diferentes.' });
      }

      // Verify source category belongs to user
      const sourceCat = await db.select().from(categories).where(and(eq(categories.id, fromCategoryId), eq(categories.userId, userId))).limit(1);
      if (sourceCat.length === 0) {
        return res.status(404).json({ error: 'Categoria de origem não encontrada.' });
      }

      // Source category and child categories if any
      const subCats = await db.select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.parentId, fromCategoryId), eq(categories.userId, userId)));
      
      const sourceCategoryIds = [fromCategoryId, ...subCats.map(sc => sc.id)];

      // 1. Update single-category transactions
      const txConditions = [
        eq(transactions.userId, userId),
        inArray(transactions.categoryId, sourceCategoryIds)
      ];
      if (startDate && typeof startDate === 'string' && startDate.trim() !== '') {
        txConditions.push(gte(transactions.date, startDate.trim()));
      }
      if (endDate && typeof endDate === 'string' && endDate.trim() !== '') {
        txConditions.push(lte(transactions.date, endDate.trim()));
      }

      const updatedTx = await db.update(transactions)
        .set({ categoryId: toCategoryId })
        .where(and(...txConditions))
        .returning({ id: transactions.id });

      // 2. Update multi-category split transactions (transactionSplits)
      const userTxQueryConditions = [eq(transactions.userId, userId)];
      if (startDate && typeof startDate === 'string' && startDate.trim() !== '') {
        userTxQueryConditions.push(gte(transactions.date, startDate.trim()));
      }
      if (endDate && typeof endDate === 'string' && endDate.trim() !== '') {
        userTxQueryConditions.push(lte(transactions.date, endDate.trim()));
      }

      const matchingUserTx = await db.select({ id: transactions.id })
        .from(transactions)
        .where(and(...userTxQueryConditions));

      let updatedSplitsCount = 0;
      if (matchingUserTx.length > 0) {
        const matchingTxIds = matchingUserTx.map(t => t.id);
        
        const updatedSplits = await db.update(transactionSplits)
          .set({ categoryId: toCategoryId })
          .where(and(
            inArray(transactionSplits.transactionId, matchingTxIds),
            inArray(transactionSplits.categoryId, sourceCategoryIds)
          ))
          .returning({ id: transactionSplits.id });

        updatedSplitsCount = updatedSplits.length;
      }

      res.json({
        success: true,
        updatedTransactionsCount: updatedTx.length,
        updatedSplitsCount,
        totalTransferred: updatedTx.length + updatedSplitsCount,
        toCategoryId
      });
    } catch (error: any) {
      console.error('Error transferring category transactions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Routes: Tags
  app.get('/api/tags', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const userTags = await db.select().from(tags).where(eq(tags.userId, userId));
      res.json(userTags);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/tags', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const { name } = req.body;

      if (!name) return res.status(400).json({ error: 'Tag name is required' });

      // Check if tag already exists (case-insensitive)
      const existing = await db.select().from(tags).where(
        and(
          eq(tags.userId, userId),
          sql`LOWER(${tags.name}) = LOWER(${name})`
        )
      ).limit(1);

      if (existing.length > 0) {
        return res.json(existing[0]);
      }

      const result = await db.insert(tags).values({
        userId,
        name,
      }).returning();

      res.status(201).json(result[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/tags/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const id = parseInt(req.params.id);

      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const result = await db.delete(tags)
        .where(and(eq(tags.id, id), eq(tags.userId, userId)))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: 'Tag not found' });
      }

      res.json({ message: 'Tag deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API Routes: Payees
  app.get('/api/payees', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      
      // Get currently registered payees
      let userPayees = await db.select().from(payees).where(eq(payees.userId, userId));
      
      // Get all unique payee names from existing transactions
      const txPayeesResult = await db.select({ payee: transactions.payee })
        .from(transactions)
        .where(eq(transactions.userId, userId));
      
      const uniqueTxPayees = Array.from(new Set(
        txPayeesResult
          .map(t => t.payee ? t.payee.trim() : '')
          .filter(name => name.length > 0)
      ));

      // Find any payee name that is in the transactions but not in the payees table
      const existingPayeeNamesLower = new Set(userPayees.map(p => p.name.toLowerCase()));
      const payeesToInsert = uniqueTxPayees.filter(name => !existingPayeeNamesLower.has(name.toLowerCase()));

      if (payeesToInsert.length > 0) {
        // Insert missing payees
        const insertPromises = payeesToInsert.map(name => 
          db.insert(payees).values({
            userId,
            name,
          }).returning()
        );
        await Promise.all(insertPromises);
        
        // Re-fetch to get the complete list with correct IDs and dates
        userPayees = await db.select().from(payees).where(eq(payees.userId, userId));
      }

      res.json(userPayees);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/payees', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const { name } = req.body;

      if (!name) return res.status(400).json({ error: 'Payee name is required' });

      // Check if payee already exists (case-insensitive)
      const existing = await db.select().from(payees).where(
        and(
          eq(payees.userId, userId),
          sql`LOWER(${payees.name}) = LOWER(${name})`
        )
      ).limit(1);

      if (existing.length > 0) {
        return res.json(existing[0]);
      }

      const result = await db.insert(payees).values({
        userId,
        name: name.trim(),
      }).returning();

      res.status(201).json(result[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/payees/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const id = parseInt(req.params.id);
      const { name } = req.body;

      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      if (!name) return res.status(400).json({ error: 'Payee name is required' });

      // Get the current payee to know its old name
      const currentPayee = await db.select().from(payees).where(and(eq(payees.id, id), eq(payees.userId, userId))).limit(1);
      if (currentPayee.length === 0) {
        return res.status(404).json({ error: 'Payee not found' });
      }
      const oldName = currentPayee[0].name;

      const result = await db.update(payees)
        .set({ name: name.trim() })
        .where(and(eq(payees.id, id), eq(payees.userId, userId)))
        .returning();

      // If the name actually changed, update all transactions that had this payee
      if (oldName.trim().toLowerCase() !== name.trim().toLowerCase()) {
        await db.update(transactions)
          .set({ payee: name.trim() })
          .where(and(eq(transactions.userId, userId), eq(transactions.payee, oldName)));
      }

      res.json(result[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/payees/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const id = parseInt(req.params.id);

      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      // Get the payee to know if it exists
      const currentPayee = await db.select().from(payees).where(and(eq(payees.id, id), eq(payees.userId, userId))).limit(1);
      if (currentPayee.length === 0) {
        return res.status(404).json({ error: 'Payee not found' });
      }

      await db.delete(payees)
        .where(and(eq(payees.id, id), eq(payees.userId, userId)))
        .returning();

      res.json({ message: 'Payee deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API Routes: Transactions
  app.get('/api/transactions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;

      // Extract query parameters
      const isPaginated = req.query.page !== undefined || req.query.limit !== undefined;
      const conditions: any[] = [eq(transactions.userId, userId)];

      if (req.query.accountId) {
        const accId = parseInt(req.query.accountId as string);
        if (!isNaN(accId)) {
          conditions.push(eq(transactions.accountId, accId));
        }
      }

      if (req.query.type === 'credito' || req.query.type === 'debito') {
        conditions.push(eq(transactions.type, req.query.type));
      }

      if (req.query.startDate && typeof req.query.startDate === 'string') {
        conditions.push(gte(transactions.date, req.query.startDate));
      }

      if (req.query.endDate && typeof req.query.endDate === 'string') {
        conditions.push(lte(transactions.date, req.query.endDate));
      }

      if (req.query.categoryId) {
        const catId = parseInt(req.query.categoryId as string);
        if (!isNaN(catId)) {
          conditions.push(eq(transactions.categoryId, catId));
        }
      }

      if (req.query.isRecurring !== undefined) {
        if (req.query.isRecurring === 'all') {
          // Explicitly requested both recurring templates and real transactions
        } else {
          const isRec = req.query.isRecurring === 'true';
          conditions.push(eq(transactions.isRecurring, isRec));
        }
      } else {
        // By default, transactions view ONLY returns real executed/launched/settled transactions
        // Recurring schedule templates must never pollute the bank statement view or balances
        conditions.push(eq(transactions.isRecurring, false));
        conditions.push(sql`(${transactions.memo} IS NULL OR ${transactions.memo} NOT LIKE '%[Agendado]%')`);
      }

      if (req.query.search && typeof req.query.search === 'string') {
        const searchPattern = `%${req.query.search.trim()}%`;
        conditions.push(
          or(
            sql`LOWER(${transactions.payee}) LIKE LOWER(${searchPattern})`,
            sql`LOWER(COALESCE(${transactions.memo}, '')) LIKE LOWER(${searchPattern})`
          )
        );
      }

      let total = 0;
      let totalCredit = 0;
      let totalDebit = 0;
      let page = 1;
      let limit = 50;
      let offset = 0;

      if (isPaginated) {
        page = Math.max(1, parseInt(req.query.page as string) || 1);
        limit = Math.max(1, Math.min(200, parseInt(req.query.limit as string) || 50));
        offset = (page - 1) * limit;

        // Total count and totals matching the filters
        const [totalsRes] = await db
          .select({
            count: sql<number>`cast(count(*) as int)`,
            creditSum: sql<number>`cast(coalesce(sum(case when ${transactions.type} = 'credito' then ${transactions.amount} else 0 end), 0) as int)`,
            debitSum: sql<number>`cast(coalesce(sum(case when ${transactions.type} = 'debito' then ${transactions.amount} else 0 end), 0) as int)`,
          })
          .from(transactions)
          .where(and(...conditions));

        total = totalsRes?.count || 0;
        totalCredit = totalsRes?.creditSum || 0;
        totalDebit = totalsRes?.debitSum || 0;
      }

      // Build main query
      let query = db.select({
        transaction: transactions,
        category: categories,
        account: accounts,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.id));

      const results = isPaginated 
        ? await query.limit(limit).offset(offset)
        : await query;

      const txIds = results.map(r => r.transaction.id);
      const safeTxIds = txIds.length > 0 ? txIds : [0];

      // For each transaction, load its tags only for the queried items
      const allTxTags = await db.select({
        txId: transactionTags.transactionId,
        tag: tags,
      })
      .from(transactionTags)
      .innerJoin(tags, eq(transactionTags.tagId, tags.id))
      .where(inArray(transactionTags.transactionId, safeTxIds));

      // For each transaction, load its splits and their categories only for the queried items
      const allTxSplits = await db.select({
        split: transactionSplits,
        category: categories,
      })
      .from(transactionSplits)
      .leftJoin(categories, eq(transactionSplits.categoryId, categories.id))
      .where(inArray(transactionSplits.transactionId, safeTxIds));

      // Compute exact running balances chronologically per account
      const balanceMap = new Map<number, number>();
      if (txIds.length > 0 && req.query.isRecurring !== 'true') {
        // The window is partitioned by account, so only the accounts present on this page matter
        const pageAccountIds = [...new Set(results.map(r => r.transaction.accountId))];
        try {
          const balanceQuery = sql`
            WITH tx_balance AS (
              SELECT 
                t.id,
                (a.initial_balance + SUM(CASE WHEN t.type = 'credito' THEN t.amount ELSE -t.amount END) OVER (
                  PARTITION BY t.account_id
                  ORDER BY t.date ASC, t.id ASC
                )) AS running_balance
              FROM ${transactions} t
              JOIN ${accounts} a ON t.account_id = a.id
              WHERE t.user_id = ${userId} 
                AND t.account_id IN (${sql.join(pageAccountIds.map(id => sql`${id}`), sql`, `)})
                AND t.is_recurring = false 
                AND (t.memo IS NULL OR t.memo NOT LIKE '%[Agendado]%')
            )
            SELECT id, running_balance 
            FROM tx_balance 
            WHERE id IN (${sql.join(txIds.map(id => sql`${id}`), sql`, `)})
          `;
          const res = await db.execute<{ id: number; running_balance: string }>(balanceQuery);
          for (const row of res.rows) {
            balanceMap.set(Number(row.id), Number(row.running_balance));
          }
        } catch (balErr) {
          console.error('Error computing running balances:', balErr);
        }
      }

      // Group tags and splits by transaction once (O(n) instead of filtering per row)
      const tagsByTx = new Map<number, (typeof allTxTags)[number]['tag'][]>();
      for (const t of allTxTags) {
        const list = tagsByTx.get(t.txId);
        if (list) list.push(t.tag); else tagsByTx.set(t.txId, [t.tag]);
      }
      const splitsByTx = new Map<number, any[]>();
      for (const s of allTxSplits) {
        const item = { ...s.split, category: s.category };
        const list = splitsByTx.get(s.split.transactionId);
        if (list) list.push(item); else splitsByTx.set(s.split.transactionId, [item]);
      }

      // Construct return objects
      const formatted = results.map(r => {
        const itemTags = tagsByTx.get(r.transaction.id) ?? [];
        const itemSplits = splitsByTx.get(r.transaction.id) ?? [];

        return {
          ...r.transaction,
          category: r.category,
          account: r.account,
          tags: itemTags,
          splits: itemSplits,
          runningBalance: balanceMap.get(r.transaction.id),
        };
      });

      // Keep exact chronological order (date desc, id desc) matching SQL and runningBalance calculation
      if (isPaginated) {
        res.setHeader('X-Total-Count', String(total));
        return res.json({
          data: formatted,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasMore: offset + formatted.length < total,
          },
          totals: {
            credit: totalCredit,
            debit: totalDebit,
            sum: totalCredit - totalDebit,
          }
        });
      }

      res.json(formatted);
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Helpers shared by create/update: build rows for batched inserts
  function buildSplitRows(transactionId: number, splits: any[]) {
    return splits.map((s) => ({
      transactionId,
      categoryId: s.categoryId ? parseInt(s.categoryId) : null,
      amount: Math.round(parseFloat(s.amount)),
      memo: s.memo || null,
    }));
  }

  async function buildTagRows(executor: Pick<typeof db, 'select'>, userId: number, transactionId: number, tagIds: unknown) {
    if (!Array.isArray(tagIds) || tagIds.length === 0) return [];
    const parsed = [...new Set(tagIds.map((t) => parseInt(String(t))).filter((t) => !isNaN(t)))];
    if (parsed.length === 0) return [];
    const owned = await executor.select({ id: tags.id }).from(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.id, parsed)));
    return owned.map((t) => ({ transactionId, tagId: t.id }));
  }

  app.post('/api/transactions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const {
        accountId,
        date,
        payee,
        amount, // number in cents
        type, // 'debito' | 'credito'
        categoryId,
        memo,
        isRecurring,
        recurrenceInterval,
        remainingOccurrences,
        nextDueDate,
        tagIds, // array of tag IDs
        splits, // array of splits
      } = req.body;

      if (!accountId || !date || !payee || amount === undefined || !type) {
        return res.status(400).json({ error: 'Missing required transaction fields' });
      }

      // Check account validity
      const acc = await db.select().from(accounts).where(and(eq(accounts.id, parseInt(accountId)), eq(accounts.userId, userId))).limit(1);
      if (acc.length === 0) {
        return res.status(400).json({ error: 'Selected account does not exist or access is denied' });
      }

      const parsedRemaining = isRecurring && remainingOccurrences !== undefined && remainingOccurrences !== null && remainingOccurrences !== '' && parseInt(remainingOccurrences.toString()) > 0
        ? parseInt(remainingOccurrences.toString())
        : null;

      const hasSplits = Array.isArray(splits) && splits.length > 0;

      const targetTxDate = isRecurring ? (nextDueDate || date) : date;
      const targetNextDueDate = isRecurring ? (nextDueDate || date) : null;

      // Insert transaction, splits and tags atomically (all or nothing)
      const newTx = await db.transaction(async (trx) => {
      const result = await trx.insert(transactions).values({
        userId,
        accountId: parseInt(accountId),
        date: targetTxDate,
        payee,
        amount: Math.round(parseFloat(amount)),
        type,
        categoryId: hasSplits ? null : (categoryId ? parseInt(categoryId) : null),
        memo: memo || null,
        isRecurring: !!isRecurring,
        recurrenceInterval: isRecurring ? recurrenceInterval : null,
        remainingOccurrences: parsedRemaining,
        nextDueDate: targetNextDueDate,
      }).returning();

      const created = result[0];

      // Handle splits (single batched insert)
      if (hasSplits) {
        await trx.insert(transactionSplits).values(buildSplitRows(created.id, splits));
      }

      // Handle tags mapping (single batched insert, only tags owned by this user)
      const tagRows = await buildTagRows(trx, userId, created.id, tagIds);
      if (tagRows.length > 0) {
        await trx.insert(transactionTags).values(tagRows).onConflictDoNothing();
      }

      return created;
      });

      res.status(201).json(newTx);
    } catch (error: any) {
      console.error('Error in POST /api/transactions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/transactions/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const id = parseInt(req.params.id);
      const {
        accountId,
        date,
        payee,
        amount,
        type,
        categoryId,
        memo,
        isRecurring,
        recurrenceInterval,
        remainingOccurrences,
        nextDueDate,
        tagIds,
        splits, // array of splits
      } = req.body;

      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      // Verify transaction belongs to user
      const existing = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId))).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Transaction not found or access denied' });
      }

      const finalIsRecurring = isRecurring !== undefined ? !!isRecurring : existing[0].isRecurring;
      let finalRemaining = null;
      if (finalIsRecurring) {
        if (remainingOccurrences !== undefined) {
          finalRemaining = remainingOccurrences !== null && remainingOccurrences !== '' && parseInt(remainingOccurrences.toString()) > 0
            ? parseInt(remainingOccurrences.toString())
            : null;
        } else {
          finalRemaining = existing[0].remainingOccurrences;
        }
      }

      if (accountId) {
        const targetAcc = await db.select({ id: accounts.id }).from(accounts)
          .where(and(eq(accounts.id, parseInt(accountId)), eq(accounts.userId, userId))).limit(1);
        if (targetAcc.length === 0) {
          return res.status(400).json({ error: 'Selected account does not exist or access is denied' });
        }
      }

      const hasSplits = Array.isArray(splits) && splits.length > 0;

      // Calculate synchronized date and nextDueDate for recurring vs non-recurring
      let effectiveDate = date || existing[0].date;
      let effectiveNextDueDate = finalIsRecurring ? (nextDueDate || existing[0].nextDueDate || date) : null;

      if (finalIsRecurring) {
        // When updating a recurring schedule, both date and nextDueDate should be synchronized to the target schedule date
        const targetDate = nextDueDate || date || existing[0].nextDueDate || existing[0].date;
        effectiveDate = targetDate;
        effectiveNextDueDate = targetDate;
      }

      // Update fields, splits and tags atomically (all or nothing)
      const updated = await db.transaction(async (trx) => {
      const result = await trx.update(transactions)
        .set({
          accountId: accountId ? parseInt(accountId) : existing[0].accountId,
          date: effectiveDate,
          payee: payee || existing[0].payee,
          amount: amount !== undefined ? Math.round(parseFloat(amount)) : existing[0].amount,
          type: type || existing[0].type,
          categoryId: hasSplits ? null : (categoryId !== undefined ? (categoryId ? parseInt(categoryId) : null) : existing[0].categoryId),
          memo: memo !== undefined ? memo : existing[0].memo,
          isRecurring: finalIsRecurring,
          recurrenceInterval: finalIsRecurring ? recurrenceInterval : null,
          remainingOccurrences: finalRemaining,
          nextDueDate: effectiveNextDueDate,
        })
        .where(eq(transactions.id, id))
        .returning();

      // Clear existing splits and insert updated ones
      await trx.delete(transactionSplits).where(eq(transactionSplits.transactionId, id));
      if (hasSplits) {
        await trx.insert(transactionSplits).values(buildSplitRows(id, splits));
      }

      // Clear existing tags and insert updated ones
      await trx.delete(transactionTags).where(eq(transactionTags.transactionId, id));
      const tagRows = await buildTagRows(trx, userId, id, tagIds);
      if (tagRows.length > 0) {
        await trx.insert(transactionTags).values(tagRows).onConflictDoNothing();
      }

      return result[0];
      });

      res.json(updated);
    } catch (error: any) {
      console.error('Error in PUT /api/transactions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/transactions/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const id = parseInt(req.params.id);

      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const result = await db.delete(transactions)
        .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: 'Transaction not found or access denied' });
      }

      res.json({ message: 'Transaction deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API Routes: Trigger/Baixa on a Recurring Template
  app.post('/api/transactions/recurring/:id/trigger', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const id = parseInt(req.params.id);

      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      // Find the recurring template
      const existing = await db.select()
        .from(transactions)
        .where(and(eq(transactions.id, id), eq(transactions.userId, userId), eq(transactions.isRecurring, true)))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ error: 'Recurring transaction not found or access denied' });
      }

      const template = existing[0];
      const currentDueDate = template.nextDueDate || template.date;

      // Extract optional custom overrides from body
      const { date, amount, accountId, categoryId, memo, splits, isLastOccurrence } = req.body || {};

      // 1. Create concrete transaction with optional overrides
      const settledDate = date !== undefined ? date : currentDueDate;
      const newTxResult = await db.insert(transactions).values({
        userId: template.userId,
        accountId: accountId !== undefined ? parseInt(accountId) : template.accountId,
        date: settledDate,
        payee: template.payee,
        amount: amount !== undefined ? parseInt(amount) : template.amount,
        type: template.type,
        categoryId: categoryId !== undefined ? (categoryId ? parseInt(categoryId) : null) : template.categoryId,
        memo: memo !== undefined ? memo : `[Baixa] ${template.memo || ''}`.trim(),
        isRecurring: false,
      }).returning();

      // Clean up any placeholder/scheduled transaction on the original schedule date (currentDueDate)
      // to avoid leaving duplicate or ghost transactions on the old date when the user changes the date or finalizes the bill.
      try {
        await db.delete(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.accountId, template.accountId),
              eq(transactions.date, currentDueDate),
              eq(transactions.payee, template.payee),
              eq(transactions.isRecurring, false),
              like(transactions.memo, '%[Agendado]%')
            )
          );
      } catch (cleanupErr) {
        console.warn('Warning cleaning up scheduled placeholder:', cleanupErr);
      }

      // Copy splits or use overrides if provided
      if (splits !== undefined) {
        if (Array.isArray(splits) && splits.length > 0) {
          for (const s of splits) {
            await db.insert(transactionSplits).values({
              transactionId: newTxResult[0].id,
              categoryId: s.categoryId ? parseInt(s.categoryId) : null,
              amount: s.amount ? parseInt(s.amount) : 0,
              memo: s.memo || null,
            });
          }
        }
      } else {
        const templateSplits = await db.select()
          .from(transactionSplits)
          .where(eq(transactionSplits.transactionId, id));

        if (templateSplits.length > 0) {
          for (const split of templateSplits) {
            await db.insert(transactionSplits).values({
              transactionId: newTxResult[0].id,
              categoryId: split.categoryId,
              amount: split.amount,
              memo: split.memo,
            });
          }
        }
      }

      // 2. Copy tags if any
      const templateTags = await db.select()
        .from(transactionTags)
        .where(eq(transactionTags.transactionId, id));

      if (templateTags.length > 0) {
        for (const tTag of templateTags) {
          await db.insert(transactionTags).values({
            transactionId: newTxResult[0].id,
            tagId: tTag.tagId,
          }).onConflictDoNothing();
        }
      }

      // 3. Calculate next due date
      let nextDate = new Date(currentDueDate + 'T12:00:00');
      if (template.recurrenceInterval === 'diario') {
        nextDate.setDate(nextDate.getDate() + 1);
      } else if (template.recurrenceInterval === 'semanal') {
        nextDate.setDate(nextDate.getDate() + 7);
      } else if (template.recurrenceInterval === 'quinzenal') {
        nextDate.setDate(nextDate.getDate() + 14);
      } else if (template.recurrenceInterval === 'mensal') {
        nextDate.setMonth(nextDate.getMonth() + 1);
      } else if (template.recurrenceInterval === 'anual') {
        nextDate.setFullYear(nextDate.getFullYear() + 1);
      }

      const nextDueDateStr = nextDate.toISOString().split('T')[0];

      // Update template nextDueDate and decrement remainingOccurrences if applicable
      let remaining = template.remainingOccurrences;
      let shouldKeepRecurring = true;

      if (isLastOccurrence === true) {
        shouldKeepRecurring = false;
      } else if (remaining !== null && remaining > 0) {
        remaining = remaining - 1;
        if (remaining <= 0) {
          shouldKeepRecurring = false;
        }
      }

      if (shouldKeepRecurring) {
        await db.update(transactions)
          .set({ 
            nextDueDate: nextDueDateStr,
            remainingOccurrences: remaining
          })
          .where(eq(transactions.id, id));
      } else {
        // The recurring schedule is completed (last occurrence baixada).
        // Delete the template so it doesn't accidentally persist as an un-baixada duplicate transaction.
        await db.delete(transactions)
          .where(eq(transactions.id, id));
      }

      res.json({ message: 'Baixa realizada com sucesso', transaction: newTxResult[0] });
    } catch (error: any) {
      console.error('Error in POST /api/transactions/recurring/:id/trigger:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Routes: Import parsing & confirming
  app.post('/api/import/parse', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { fileContent, fileName } = req.body;
      if (!fileContent) {
        return res.status(400).json({ error: 'File content is required' });
      }

      const format = detectFormat(fileContent);
      if (format === 'unknown') {
        return res.status(400).json({ error: 'Formato de arquivo não reconhecido. Use arquivos CSV ou QIF.' });
      }

      let parsed: ParsedTransaction[] = [];
      let headers: string[] = [];

      if (format === 'qif') {
        parsed = parseQIF(fileContent);
      } else {
        const rows = parseCSV(fileContent);
        if (rows.length > 0) {
          headers = rows[0];
          const autoMapping = autoDetectMapping(headers);
          parsed = mapCSVTransactions(rows, autoMapping, true);
        }
      }

      res.json({
        format,
        headers,
        transactions: parsed,
      });
    } catch (error: any) {
      console.error('Error in /api/import/parse:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/import/confirm', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const { accountId, txs, overwriteDuplicates } = req.body; // array of ParsedTransaction to insert

      if (!accountId || !Array.isArray(txs)) {
        return res.status(400).json({ error: 'Account ID and transactions list are required' });
      }

      // Load user accounts & categories to map/find existing categories
      const userAccounts = await db.select().from(accounts).where(and(eq(accounts.id, parseInt(accountId)), eq(accounts.userId, userId))).limit(1);
      if (userAccounts.length === 0) {
        return res.status(400).json({ error: 'Account not found or access denied' });
      }

      const userCategories = await db.select().from(categories).where(eq(categories.userId, userId));
      const userPayees = await db.select().from(payees).where(eq(payees.userId, userId));

      // Fetch existing transactions for duplicate detection (ignore recurring templates)
      const existingTx = await db.select().from(transactions).where(and(
        eq(transactions.userId, userId),
        eq(transactions.accountId, parseInt(accountId)),
        eq(transactions.isRecurring, false)
      ));

      // Index existing transactions by (date, payee, amount, type) for O(1) duplicate lookups
      const dupKey = (date: string, payee: string, amount: number, type: string) =>
        `${date}|${(payee || '').trim().toLowerCase()}|${amount}|${type}`;
      const existingByKey = new Map<string, typeof existingTx>();
      for (const e of existingTx) {
        const key = dupKey(e.date, e.payee, e.amount, e.type);
        const list = existingByKey.get(key);
        if (list) list.push(e); else existingByKey.set(key, [e]);
      }

      let importedCount = 0;
      let duplicateCount = 0;

      // The whole import runs in one SQL transaction: a failure halfway leaves no partial data
      await db.transaction(async (trx) => {

      const getOrCreateCategory = async (catName: string, subName?: string, txType?: string) => {
        if (!catName) return null;
        let catRecord = userCategories.find(c => c.name.toLowerCase() === catName.toLowerCase() && c.parentId === null);
        if (!catRecord) {
          const newCat = await trx.insert(categories).values({
            userId,
            name: catName,
            type: txType === 'credito' ? 'receita' : 'despesa',
            parentId: null,
          }).returning();
          catRecord = newCat[0];
          userCategories.push(catRecord);
        }

        let finalCatId = catRecord.id;
        if (subName) {
          let subRecord = userCategories.find(c => c.name.toLowerCase() === subName.toLowerCase() && c.parentId === catRecord!.id);
          if (!subRecord) {
            const newSub = await trx.insert(categories).values({
              userId,
              name: subName,
              type: txType === 'credito' ? 'receita' : 'despesa',
              parentId: catRecord.id,
            }).returning();
            subRecord = newSub[0];
            userCategories.push(subRecord);
          }
          finalCatId = subRecord.id;
        }
        return finalCatId;
      };

      for (const t of txs) {
        // Simple duplicate detection: check if there exists an identical transaction
        const candidates = existingByKey.get(dupKey(t.date, t.payee, t.amount, t.type));
        const foundDuplicate = candidates?.shift(); // Removed so it doesn't get matched again

        if (foundDuplicate) {

          if (overwriteDuplicates) {
            // Delete the duplicate transaction so we can insert the newly parsed one (with splits/categories)
            await trx.delete(transactions).where(eq(transactions.id, foundDuplicate.id));
          } else {
            // Sum the value of the duplicate transaction to the existing transaction
            const newAmount = foundDuplicate.amount + t.amount;
            await trx.update(transactions)
              .set({ amount: newAmount })
              .where(eq(transactions.id, foundDuplicate.id));

            duplicateCount++;
            continue;
          }
        }

        // Auto-register payee if it does not exist
        const payeeName = t.payee ? t.payee.trim() : '';
        if (payeeName) {
          const payeeExists = userPayees.some(p => p.name.toLowerCase() === payeeName.toLowerCase());
          if (!payeeExists) {
            const newPayee = await trx.insert(payees).values({
              userId,
              name: payeeName,
            }).returning();
            userPayees.push(newPayee[0]);
          }
        }

        const hasSplits = t.splits && t.splits.length > 0;
        let mainCatId: number | null = null;
        if (!hasSplits && t.categoryName) {
          mainCatId = await getOrCreateCategory(t.categoryName, t.subcategoryName, t.type);
        }

        // Insert transaction (this acts as the template if isRecurring is true)
        const insertedTx = await trx.insert(transactions).values({
          userId,
          accountId: parseInt(accountId),
          date: t.date,
          payee: t.payee,
          amount: t.amount,
          type: t.type,
          categoryId: mainCatId,
          memo: t.memo || null,
          isRecurring: !!t.isRecurring,
          recurrenceInterval: t.recurrenceInterval || null,
          remainingOccurrences: t.remainingOccurrences !== undefined ? t.remainingOccurrences : null,
          nextDueDate: t.nextDueDate || null,
        }).returning();

        const txId = insertedTx[0].id;

        // If it has splits, insert them
        if (hasSplits) {
          for (const s of t.splits!) {
            const splitCatId = s.categoryName ? await getOrCreateCategory(s.categoryName, s.subcategoryName, t.type) : null;
            await trx.insert(transactionSplits).values({
              transactionId: txId,
              categoryId: splitCatId,
              amount: s.amount,
              memo: s.memo || null,
            });
          }
        }

        // If it is a recurring template, it is registered as an active recurring schedule
        // in Agenda Recorrente with its nextDueDate. Users give "Baixa" to generate the concrete transaction,
        // preventing duplicate entries across dates.

        importedCount++;
      }
      });

      res.json({
        importedCount,
        duplicateCount,
      });
    } catch (error: any) {
      console.error('Error in /api/import/confirm:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Danger Zone: Clear database (Delete transactions, tags, and categories, resetting default categories)
  app.post('/api/danger/clear-all', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const { keepRecurring } = req.body || {};

      if (keepRecurring) {
        // Delete only actual (non-recurring) transactions
        await db.delete(transactions).where(and(
          eq(transactions.userId, userId),
          eq(transactions.isRecurring, false)
        ));
        return res.json({ message: 'Histórico de transações limpo com sucesso! Os lançamentos agendados foram preservados.' });
      }

      // 1-3. Delete all transactions, tags and categories atomically
      await db.transaction(async (trx) => {
        await trx.delete(transactions).where(eq(transactions.userId, userId));
        await trx.delete(tags).where(eq(tags.userId, userId));
        await trx.delete(categories).where(eq(categories.userId, userId));
      });

      // 4. Re-create default categories
      await ensureDefaultCategories(userId);

      res.json({ message: 'Base de dados limpa com sucesso. Categorias padrão restauradas.' });
    } catch (error: any) {
      console.error('Error clearing database:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- GOOGLE DRIVE BACKUP ENDPOINTS ---

  // GET: Retrieve the backup status for the current user
  app.get('/api/backup/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUserId = req.dbUser!.id;
      const [userRecord] = await db.select().from(users).where(eq(users.id, dbUserId)).limit(1);
      
      if (!userRecord) {
        return res.status(404).json({ error: 'User record not found.' });
      }

      res.json({
        backupEnabled: userRecord.backupEnabled ?? false,
        lastBackupAt: userRecord.lastBackupAt ?? null,
        backupDriveFolder: userRecord.backupDriveFolder || 'Finanças K - Backups',
        backupDriveFolderId: userRecord.backupDriveFolderId || null
      });
    } catch (error: any) {
      console.error('Error fetching backup status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Toggle automated weekly backup
  app.post('/api/backup/toggle', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUserId = req.dbUser!.id;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Field "enabled" must be a boolean.' });
      }

      await db.update(users)
        .set({ backupEnabled: enabled })
        .where(eq(users.id, dbUserId));

      res.json({ success: true, backupEnabled: enabled });
    } catch (error: any) {
      console.error('Error toggling backup setting:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Update backup destination folder on Google Drive
  app.post('/api/backup/folder', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUserId = req.dbUser!.id;
      let { folder, folderId } = req.body;

      if (typeof folder !== 'string' || !folder.trim()) {
        folder = 'Finanças K - Backups';
      }

      // Sanitize folder path: normalize slashes, remove leading and trailing slashes
      const cleanFolder = folder.trim().replace(/^[/\\]+|[/\\]+$/g, '');
      const finalFolder = cleanFolder || 'Finanças K - Backups';

      // folderId is optional for backward compatibility; when provided it is the stable Drive ID
      const finalFolderId = (typeof folderId === 'string' && folderId.trim()) ? folderId.trim() : null;

      await db.update(users)
        .set({
          backupDriveFolder: finalFolder,
          backupDriveFolderId: finalFolderId
        })
        .where(eq(users.id, dbUserId));

      res.json({
        success: true,
        backupDriveFolder: finalFolder,
        backupDriveFolderId: finalFolderId
      });
    } catch (error: any) {
      console.error('Error updating backup folder:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Helper function to resolve or create a folder path on Google Drive (supports nested like 'Backups/Financeiro')
  async function getOrCreateDriveFolder(accessToken: string, folderPath: string): Promise<string> {
    const parts = (folderPath || 'Finanças K - Backups')
      .split('/')
      .map(p => p.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      parts.push('Finanças K - Backups');
    }

    let parentId = 'root';
    for (const part of parts) {
      const escapedName = part.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const queryParam = encodeURIComponent(
        `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`
      );

      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${queryParam}&fields=files(id,name)`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!searchRes.ok) {
        const searchErr = await searchRes.text();
        throw new Error(`Falha ao buscar pasta "${part}" no Google Drive: ${searchErr}`);
      }

      const searchData: any = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        parentId = searchData.files[0].id;
      } else {
        // Create folder inside current parentId
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: part,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
          })
        });

        if (!createRes.ok) {
          const createErr = await createRes.text();
          throw new Error(`Falha ao criar pasta "${part}" no Google Drive: ${createErr}`);
        }

        const createData: any = await createRes.json();
        parentId = createData.id;
      }
    }

    return parentId;
  }

  // Helper function to find existing folder ID without creating new ones
  async function findDriveFolder(accessToken: string, folderPath: string): Promise<string | null> {
    const parts = (folderPath || 'Finanças K - Backups')
      .split('/')
      .map(p => p.trim())
      .filter(Boolean);

    if (parts.length === 0) return null;

    let parentId = 'root';
    for (const part of parts) {
      const escapedName = part.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const queryParam = encodeURIComponent(
        `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`
      );

      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${queryParam}&fields=files(id,name)`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!searchRes.ok) return null;

      const searchData: any = await searchRes.json();
      if (!searchData.files || searchData.files.length === 0) {
        return null;
      }
      parentId = searchData.files[0].id;
    }

    return parentId;
  }

  // Helper function to generate full backup payload for a user
  async function getUserBackupPayload(dbUserId: number, userEmail: string) {
    const [
      userAccounts,
      userCategories,
      userTransactions,
      userTags,
      userPayees
    ] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.userId, dbUserId)),
      db.select().from(categories).where(eq(categories.userId, dbUserId)),
      db.select().from(transactions).where(eq(transactions.userId, dbUserId)),
      db.select().from(tags).where(eq(tags.userId, dbUserId)),
      db.select().from(payees).where(eq(payees.userId, dbUserId))
    ]);

    const txIds = userTransactions.map(t => t.id);
    let userTxTags: any[] = [];
    let userTxSplits: any[] = [];
    if (txIds.length > 0) {
      [userTxTags, userTxSplits] = await Promise.all([
        db.select().from(transactionTags).where(inArray(transactionTags.transactionId, txIds)),
        db.select().from(transactionSplits).where(inArray(transactionSplits.transactionId, txIds))
      ]);
    }

    return {
      exportedAt: new Date().toISOString(),
      userEmail,
      schemaVersion: '1.0.0',
      data: {
        accounts: userAccounts,
        categories: userCategories,
        transactions: userTransactions,
        tags: userTags,
        payees: userPayees,
        transactionTags: userTxTags,
        transactionSplits: userTxSplits,
      }
    };
  }

  // Helper function to safely restore a backup payload into the database for a user
  async function restoreUserBackup(dbUserId: number, rawData: any, mode: 'replace' | 'merge' = 'replace') {
    const payload = rawData?.data || rawData;
    const bAccounts: any[] = Array.isArray(payload?.accounts) ? payload.accounts : [];
    const bCategories: any[] = Array.isArray(payload?.categories) ? payload.categories : [];
    const bTags: any[] = Array.isArray(payload?.tags) ? payload.tags : [];
    const bPayees: any[] = Array.isArray(payload?.payees) ? payload.payees : [];
    const bTransactions: any[] = Array.isArray(payload?.transactions) ? payload.transactions : [];
    const bTxTags: any[] = Array.isArray(payload?.transactionTags) ? payload.transactionTags : [];
    const bTxSplits: any[] = Array.isArray(payload?.transactionSplits) ? payload.transactionSplits : [];

    // Everything runs in one SQL transaction: in 'replace' mode a failure halfway
    // must never leave the user with their old data deleted and the new data missing.
    return db.transaction(async (trx) => {
      if (mode === 'replace') {
        const existingTxs = await trx.select({ id: transactions.id }).from(transactions).where(eq(transactions.userId, dbUserId));
        const txIds = existingTxs.map(t => t.id);
        if (txIds.length > 0) {
          await trx.delete(transactionTags).where(inArray(transactionTags.transactionId, txIds));
          await trx.delete(transactionSplits).where(inArray(transactionSplits.transactionId, txIds));
        }
        await trx.delete(transactions).where(eq(transactions.userId, dbUserId));
        await trx.delete(categories).where(eq(categories.userId, dbUserId));
        await trx.delete(accounts).where(eq(accounts.userId, dbUserId));
        await trx.delete(tags).where(eq(tags.userId, dbUserId));
        await trx.delete(payees).where(eq(payees.userId, dbUserId));
      }

      // 1. Insert accounts and build mapping (oldId -> newId)
      const accountIdMap = new Map<number, number>();
      for (const acc of bAccounts) {
        const [inserted] = await trx.insert(accounts).values({
          userId: dbUserId,
          name: acc.name,
          type: acc.type || 'Corrente',
          initialBalance: Number(acc.initialBalance) || 0,
        }).returning();
        if (acc.id != null) {
          accountIdMap.set(acc.id, inserted.id);
        }
      }

      // Safety fallback: if no accounts were in the backup, create a default one
      if (accountIdMap.size === 0) {
        const [defaultAcc] = await trx.insert(accounts).values({
          userId: dbUserId,
          name: 'Conta Principal',
          type: 'Corrente',
          initialBalance: 0,
        }).returning();
        accountIdMap.set(0, defaultAcc.id);
      }

      // 2. Insert categories (parents first, then subcategories)
      const categoryIdMap = new Map<number, number>();
      const parentCats = bCategories.filter((c: any) => !c.parentId);
      const childCats = bCategories.filter((c: any) => !!c.parentId);

      for (const cat of parentCats) {
        const [inserted] = await trx.insert(categories).values({
          userId: dbUserId,
          name: cat.name,
          type: cat.type || 'despesa',
          parentId: null,
        }).returning();
        if (cat.id != null) {
          categoryIdMap.set(cat.id, inserted.id);
        }
      }

      for (const cat of childCats) {
        const newParentId = cat.parentId ? categoryIdMap.get(cat.parentId) ?? null : null;
        const [inserted] = await trx.insert(categories).values({
          userId: dbUserId,
          name: cat.name,
          type: cat.type || 'despesa',
          parentId: newParentId,
        }).returning();
        if (cat.id != null) {
          categoryIdMap.set(cat.id, inserted.id);
        }
      }

      // 3. Insert tags
      const tagIdMap = new Map<number, number>();
      for (const tag of bTags) {
        const [inserted] = await trx.insert(tags).values({
          userId: dbUserId,
          name: tag.name,
        }).returning();
        if (tag.id != null) {
          tagIdMap.set(tag.id, inserted.id);
        }
      }

      // 4. Insert payees in batches
      const payeeChunkSize = 500;
      for (let i = 0; i < bPayees.length; i += payeeChunkSize) {
        const chunk = bPayees.slice(i, i + payeeChunkSize).map(p => ({
          userId: dbUserId,
          name: p.name,
        }));
        if (chunk.length > 0) {
          await trx.insert(payees).values(chunk);
        }
      }

      // 5. Insert transactions in high-performance chunks (500 per batch)
      const txIdMap = new Map<number, number>();
      const defaultAccountId = Array.from(accountIdMap.values())[0];
      const txChunkSize = 500;

      for (let i = 0; i < bTransactions.length; i += txChunkSize) {
        const chunk = bTransactions.slice(i, i + txChunkSize);
        const rowsToInsert = chunk.map(tx => {
          let targetAccId = accountIdMap.get(tx.accountId);
          if (!targetAccId) {
            targetAccId = defaultAccountId;
          }
          const targetCatId = tx.categoryId ? categoryIdMap.get(tx.categoryId) ?? null : null;

          return {
            userId: dbUserId,
            accountId: targetAccId,
            date: tx.date || new Date().toISOString().split('T')[0],
            payee: tx.payee || '',
            amount: Math.abs(Number(tx.amount) || 0),
            type: tx.type === 'credito' ? 'credito' as const : 'debito' as const,
            categoryId: targetCatId,
            memo: tx.memo || null,
            isRecurring: !!tx.isRecurring,
            recurrenceInterval: tx.recurrenceInterval || null,
            remainingOccurrences: tx.remainingOccurrences ?? null,
            nextDueDate: tx.nextDueDate || null,
          };
        });

        if (rowsToInsert.length > 0) {
          const insertedRows = await trx.insert(transactions).values(rowsToInsert).returning({ id: transactions.id });
          for (let j = 0; j < chunk.length; j++) {
            if (chunk[j].id != null && insertedRows[j]) {
              txIdMap.set(chunk[j].id, insertedRows[j].id);
            }
          }
        }
      }

      // 6. Insert transactionTags in batches
      const validTxTags: { transactionId: number; tagId: number }[] = [];
      for (const tt of bTxTags) {
        const newTxId = txIdMap.get(tt.transactionId);
        const newTagId = tagIdMap.get(tt.tagId);
        if (newTxId && newTagId) {
          validTxTags.push({ transactionId: newTxId, tagId: newTagId });
        }
      }

      for (let i = 0; i < validTxTags.length; i += 500) {
        const chunk = validTxTags.slice(i, i + 500);
        await trx.insert(transactionTags).values(chunk).onConflictDoNothing();
      }

      // 7. Insert transactionSplits in batches
      const validSplits: { transactionId: number; categoryId: number | null; amount: number; memo: string | null }[] = [];
      for (const split of bTxSplits) {
        const newTxId = txIdMap.get(split.transactionId);
        if (newTxId) {
          const newCatId = split.categoryId ? categoryIdMap.get(split.categoryId) ?? null : null;
          validSplits.push({
            transactionId: newTxId,
            categoryId: newCatId,
            amount: Number(split.amount) || 0,
            memo: split.memo || null,
          });
        }
      }

      for (let i = 0; i < validSplits.length; i += 500) {
        const chunk = validSplits.slice(i, i + 500);
        await trx.insert(transactionSplits).values(chunk);
      }

      return {
        accountsCount: bAccounts.length,
        categoriesCount: bCategories.length,
        transactionsCount: bTransactions.length,
        tagsCount: bTags.length,
        payeesCount: bPayees.length,
        splitsCount: bTxSplits.length,
      };
    });
  }

  // GET: Export complete database backup as a .zip (database_backup.json inside)
  app.get('/api/backup/export', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUserId = req.dbUser!.id;
      const backupData = await getUserBackupPayload(dbUserId, req.dbUser!.email);
      const dateStr = new Date().toISOString().split('T')[0];

      // Only the database goes into the backup, compressed as a .zip
      const zip = new JSZip();
      zip.file('database_backup.json', JSON.stringify(backupData, null, 2));
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="backup_financas_k_${dateStr}.zip"`);
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.send(zipBuffer);
    } catch (error: any) {
      console.error('Error exporting backup:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Restore database from uploaded backup data (JSON)
  app.post('/api/backup/restore', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUserId = req.dbUser!.id;
      const { backupData, mode = 'replace' } = req.body;

      if (!backupData) {
        return res.status(400).json({ error: 'Conteúdo de backup inválido ou vazio.' });
      }

      const summary = await restoreUserBackup(dbUserId, backupData, mode);
      res.json({
        success: true,
        message: 'Backup restaurado com sucesso!',
        summary,
      });
    } catch (error: any) {
      console.error('Error restoring backup:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET: List existing folders in Google Drive for directory selection
  // Supports: parentId (to browse into folders), search (to query anywhere), or root listing
  // The Google token is read from the POST body (preferred: survives any proxy) or the X-Google-Token header.
  // It is never accepted in the URL, which would leak it into logs.
  const googleTokenFrom = (req: AuthRequest) =>
    ((req.body && typeof req.body.accessToken === 'string' && req.body.accessToken) ||
      (req.headers['x-google-token'] as string) ||
      '').trim();
  // Listing parameters may come from the POST body or the query string
  const listParam = (req: AuthRequest, key: string) => {
    const v = (req.body && req.body[key]) ?? req.query[key];
    return typeof v === 'string' ? v.trim() : undefined;
  };

  const listDriveFoldersHandler = async (req: AuthRequest, res: express.Response) => {
    try {
      const accessToken = googleTokenFrom(req);
      if (!accessToken) {
        return res.status(400).json({ error: 'Token do Google Drive não fornecido.' });
      }

      const parentId = listParam(req, 'parentId');
      const search = listParam(req, 'search');

      let queryParts = [
        "mimeType = 'application/vnd.google-apps.folder'",
        "trashed = false"
      ];

      if (search) {
        const escapedSearch = search.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        queryParts.push(`name contains '${escapedSearch}'`);
      } else if (parentId) {
        queryParts.push(`'${parentId}' in parents`);
      }

      const query = encodeURIComponent(queryParts.join(' and '));
      const listRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,parents,modifiedTime)&pageSize=100&orderBy=name asc`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      if (!listRes.ok) {
        const errText = await listRes.text();
        throw new Error(`Falha ao listar pastas do Google Drive: ${errText}`);
      }

      const listData: any = await listRes.json();
      res.json({ folders: listData.files || [] });
    } catch (error: any) {
      console.error('Error listing Google Drive folders:', error);
      res.status(500).json({ error: error.message });
    }
  };
  app.get('/api/backup/drive/folders', requireAuth, listDriveFoldersHandler);
  app.post('/api/backup/drive/folders', requireAuth, listDriveFoldersHandler);

  // POST: Create a new folder inside a specific parent in Google Drive
  app.post('/api/backup/drive/create-folder', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { accessToken, folderName, parentId } = req.body;
      if (!accessToken || !folderName?.trim()) {
        return res.status(400).json({ error: 'Token e nome da pasta são obrigatórios.' });
      }

      const folderPayload: any = {
        name: folderName.trim(),
        mimeType: 'application/vnd.google-apps.folder'
      };

      if (parentId && parentId !== 'root') {
        folderPayload.parents = [parentId];
      }

      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(folderPayload)
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Falha ao criar pasta no Google Drive: ${errText}`);
      }

      const newFolder = await createRes.json();
      res.json({ success: true, folder: newFolder });
    } catch (error: any) {
      console.error('Error creating Google Drive folder:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET: List backups found in Google Drive in the configured folder
  const listDriveBackupsHandler = async (req: AuthRequest, res: express.Response) => {
    try {
      const dbUserId = req.dbUser!.id;
      const accessToken = googleTokenFrom(req);
      if (!accessToken) {
        return res.status(400).json({ error: 'Token do Google Drive não fornecido.' });
      }

      // Prefer explicit query params, then user's saved folder ID, then name-based lookup
      let targetFolder = listParam(req, 'folder');
      let folderId = listParam(req, 'folderId') || null;

      if (!folderId || !targetFolder) {
        const [userRecord] = await db.select({
          backupDriveFolder: users.backupDriveFolder,
          backupDriveFolderId: users.backupDriveFolderId
        })
          .from(users)
          .where(eq(users.id, dbUserId))
          .limit(1);

        if (!targetFolder) {
          targetFolder = userRecord?.backupDriveFolder || 'Finanças K - Backups';
        }
        if (!folderId && userRecord?.backupDriveFolderId) {
          folderId = userRecord.backupDriveFolderId;
        }
      }

      // If we still don't have a folder ID, fall back to name-based search (backward compatibility)
      if (!folderId) {
        folderId = await findDriveFolder(accessToken, targetFolder);
      }

      if (!folderId) {
        return res.json({ files: [], folder: targetFolder, folderId: null });
      }

      // 2. List files in that folder
      const queryFiles = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${queryFiles}&fields=files(id,name,mimeType,size,createdTime,modifiedTime)&orderBy=createdTime desc`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!listRes.ok) {
        const errText = await listRes.text();
        throw new Error(`Falha ao listar backups do Google Drive: ${errText}`);
      }

      const listData: any = await listRes.json();
      res.json({ files: listData.files || [], folder: targetFolder, folderId });
    } catch (error: any) {
      console.error('Error listing Google Drive backups:', error);
      res.status(500).json({ error: error.message });
    }
  };
  app.get('/api/backup/drive/list', requireAuth, listDriveBackupsHandler);
  app.post('/api/backup/drive/list', requireAuth, listDriveBackupsHandler);

  // POST: Restore backup directly from Google Drive
  app.post('/api/backup/drive/restore', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUserId = req.dbUser!.id;
      const { accessToken, fileId, mode = 'replace' } = req.body;

      if (!accessToken || !fileId) {
        return res.status(400).json({ error: 'Token do Google Drive e ID do arquivo são obrigatórios.' });
      }

      // 1. Download file content from Google Drive
      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!fileRes.ok) {
        const errText = await fileRes.text();
        throw new Error(`Falha ao baixar arquivo do Google Drive: ${errText}`);
      }

      const arrayBuffer = await fileRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let backupPayload: any = null;

      // Check if it is a ZIP archive or JSON file
      try {
        const zip = await JSZip.loadAsync(buffer);
        const dbFile = zip.file('database_backup.json');
        if (dbFile) {
          const jsonText = await dbFile.async('string');
          backupPayload = JSON.parse(jsonText);
        } else {
          // Look for any json file
          const anyJsonFile = Object.keys(zip.files).find(name => name.endsWith('.json'));
          if (anyJsonFile) {
            const jsonText = await zip.file(anyJsonFile)!.async('string');
            backupPayload = JSON.parse(jsonText);
          }
        }
      } catch {
        // Not a zip, try parsing directly as JSON
        try {
          const text = buffer.toString('utf-8');
          backupPayload = JSON.parse(text);
        } catch {
          throw new Error('O arquivo selecionado não contém um formato de backup válido (ZIP ou JSON).');
        }
      }

      if (!backupPayload) {
        throw new Error('Não foi possível encontrar a base de dados (database_backup.json) dentro do arquivo de backup.');
      }

      const summary = await restoreUserBackup(dbUserId, backupPayload, mode);

      res.json({
        success: true,
        message: 'Backup do Google Drive restaurado com sucesso!',
        summary,
      });
    } catch (error: any) {
      console.error('Error restoring Google Drive backup:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Run manual or automatic backup
  app.post('/api/backup/run', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUserId = req.dbUser!.id;
      const { accessToken } = req.body;

      if (!accessToken) {
        return res.status(400).json({ error: 'Google Drive access token is required to perform the backup.' });
      }

      // 1. Fetch user data payload using shared helper
      const databaseBackupData = await getUserBackupPayload(dbUserId, req.dbUser!.email);

      // 2. Build ZIP bundle with the database export only (application source code is not user data)
      const zip = new JSZip();

      // Add database JSON file
      zip.file('database_backup.json', JSON.stringify(databaseBackupData, null, 2));

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });

      // 3. Resolve destination folder on user's Google Drive
      // Prefer explicit folderId from body or saved ID (stable), fall back to name-based getOrCreate
      let targetFolder = (req.body.folder as string)?.trim();
      let folderId = (req.body.folderId as string)?.trim() || null;

      if (!folderId || !targetFolder) {
        const [userRecord] = await db.select({
          backupDriveFolder: users.backupDriveFolder,
          backupDriveFolderId: users.backupDriveFolderId
        })
          .from(users)
          .where(eq(users.id, dbUserId))
          .limit(1);

        if (!targetFolder) {
          targetFolder = userRecord?.backupDriveFolder || 'Finanças K - Backups';
        }
        if (!folderId && userRecord?.backupDriveFolderId) {
          folderId = userRecord.backupDriveFolderId;
        }
      }

      // Only create/search by name if we don't already have a stable folder ID
      if (!folderId) {
        folderId = await getOrCreateDriveFolder(accessToken, targetFolder || 'Finanças K - Backups');
      }

      // 4. Construct RFC 2387 multipart/related upload body and send to Drive
      const filename = `backup_financas_k_${new Date().toISOString().slice(0, 10)}_${Date.now()}.zip`;
      const metadata = {
        name: filename,
        parents: [folderId]
      };

      const boundary = 'financas_k_backup_boundary';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--\r\n`;

      const bodyBuffer = Buffer.concat([
        Buffer.from(delimiter),
        Buffer.from('Content-Type: application/json; charset=UTF-8\r\n\r\n'),
        Buffer.from(JSON.stringify(metadata)),
        Buffer.from(delimiter),
        Buffer.from('Content-Type: application/zip\r\n\r\n'),
        zipBuffer,
        Buffer.from(closeDelimiter)
      ]);

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': bodyBuffer.length.toString()
        },
        body: bodyBuffer
      });

      if (!uploadRes.ok) {
        const uploadErrText = await uploadRes.text();
        throw new Error(`Google Drive upload failed: ${uploadErrText}`);
      }

      const uploadData: any = await uploadRes.json();

      // 5. Update user's last backup timestamp
      const now = new Date();
      await db.update(users)
        .set({ lastBackupAt: now })
        .where(eq(users.id, dbUserId));

      res.json({
        success: true,
        message: 'Backup concluído com sucesso e salvo no seu Google Drive!',
        filename,
        fileId: uploadData.id,
        folderName: targetFolder,
        lastBackupAt: now.toISOString()
      });
    } catch (error: any) {
      console.error('Error running backup:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Serve static files in production or set up Vite middleware in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Support running from root or from within dist/ (e.g. production build)
    const distPath = fs.existsSync(path.join(__dirname, 'index.html'))
      ? __dirname
      : path.join(process.cwd(), 'dist');
    
    // Hashed build assets never change: cache them for a year. index.html is always revalidated.
    app.use('/assets', express.static(path.join(distPath, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(distPath, { maxAge: 0 }));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
