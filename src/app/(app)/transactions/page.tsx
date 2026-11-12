import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Pagination } from '@/components/shared/pagination';
import { buttonVariants } from '@/components/ui/button';
import { requireContext } from '@/features/auth/guards';
import { getTeamMembers } from '@/features/leads/queries';
import { TransactionFiltersBar } from '@/features/transactions/components/transaction-filters';
import { TransactionsTable } from '@/features/transactions/components/transactions-table';
import { listTransactions } from '@/features/transactions/queries';
import { transactionFiltersSchema } from '@/features/transactions/schemas';
import { isValidTimeZone } from '@/lib/dates';

export const metadata: Metadata = { title: 'Transactions' };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function TransactionsPage({ searchParams }: PageProps) {
  const ctx = await requireContext();
  const raw = await searchParams;
  const filters = transactionFiltersSchema.parse({ view: raw.view, agent: raw.agent, q: raw.q, page: raw.page });
  const timezone = isValidTimeZone(ctx.profile?.timezone) ? ctx.profile!.timezone : 'America/New_York';

  const [result, members] = await Promise.all([
    listTransactions(ctx.organization.id, ctx.userId, filters),
    getTeamMembers(ctx.organization.id),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? 'deal' : 'deals'} · sorted by closing date
          </p>
        </div>
        <Link href="/transactions/new" className={buttonVariants()}><Plus /> New transaction</Link>
      </div>
      <TransactionFiltersBar filters={filters} members={members} />
      <TransactionsTable result={result} filters={filters} timezone={timezone} />
      <Pagination
        basePath="/transactions"
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        noun={['deal', 'deals']}
        params={{ view: filters.view, agent: filters.agent, q: filters.q }}
      />
    </div>
  );
}
