import { useCallback, useMemo } from 'react';
import { QueryClient, useQueries, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { Account, Category, Payee, Tag, Transaction } from '../types.ts';
import { ViewId } from '../lib/navigation.ts';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays fresh for a minute: switching screens no longer re-downloads everything
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

type Resource = 'accounts' | 'transactions' | 'recurring' | 'categories' | 'tags' | 'payees';

/** What each screen actually needs. Heavy lists are only downloaded where they are used. */
const NEEDS: Record<ViewId, Resource[]> = {
  dashboard: ['accounts', 'transactions', 'categories'],
  accounts: ['accounts', 'transactions'],
  // The transactions screen paginates on the server by itself
  transactions: ['accounts', 'categories', 'tags', 'payees'],
  categories: ['categories'],
  tags: ['tags'],
  payees: ['payees'],
  recurring: ['recurring', 'accounts', 'categories', 'tags', 'payees'],
  forecast: ['accounts', 'transactions', 'recurring'],
  report: ['categories', 'transactions'],
  import: ['accounts', 'categories'],
  backup: [],
};

const FETCHERS: Record<Resource, () => Promise<any>> = {
  accounts: () => api.getAccounts(),
  transactions: () => api.getTransactions({ isRecurring: false }),
  recurring: () => api.getTransactions({ isRecurring: true }),
  categories: () => api.getCategories(),
  tags: () => api.getTags(),
  payees: () => api.getPayees(),
};

const RESOURCES: Resource[] = ['accounts', 'transactions', 'recurring', 'categories', 'tags', 'payees'];

const EMPTY: never[] = [];

export function useFinanceData(view: ViewId, enabled: boolean) {
  const client = useQueryClient();
  const needed = NEEDS[view];

  const results = useQueries({
    queries: RESOURCES.map((key) => ({
      queryKey: [key],
      queryFn: FETCHERS[key],
      enabled: enabled && needed.includes(key),
    })),
  });

  const [accountsQ, transactionsQ, recurringQ, categoriesQ, tagsQ, payeesQ] = results;

  const neededResults = results.filter((_, i) => needed.includes(RESOURCES[i]));
  const isLoading = neededResults.some((r) => r.isPending && r.fetchStatus === 'fetching');
  const isFetching = neededResults.some((r) => r.isFetching);
  const failed = neededResults.find((r) => r.error);

  // After any change, mark everything stale. Only queries used by the current screen refetch now;
  // the others refetch the next time a screen needs them.
  const refresh = useCallback(async () => {
    await client.invalidateQueries();
  }, [client]);

  const accounts = (accountsQ.data as Account[] | undefined) ?? EMPTY;
  const transactions = (transactionsQ.data as Transaction[] | undefined) ?? EMPTY;
  const recurringTransactions = (recurringQ.data as Transaction[] | undefined) ?? EMPTY;

  const allTransactions = useMemo(
    () => [...transactions, ...recurringTransactions],
    [transactions, recurringTransactions]
  );

  return {
    accounts,
    transactions,
    recurringTransactions,
    allTransactions,
    categories: (categoriesQ.data as Category[] | undefined) ?? EMPTY,
    tags: (tagsQ.data as Tag[] | undefined) ?? EMPTY,
    payees: (payeesQ.data as Payee[] | undefined) ?? EMPTY,
    isLoading,
    isFetching,
    error: failed?.error ? (failed.error as Error).message || 'Falha ao carregar os dados.' : null,
    refresh,
  };
}

export function prefetchView(client: QueryClient, view: ViewId) {
  for (const key of NEEDS[view]) {
    client.prefetchQuery({ queryKey: [key], queryFn: FETCHERS[key] });
  }
}
