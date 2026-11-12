import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Pagination } from '@/components/shared/pagination';
import { buttonVariants } from '@/components/ui/button';
import { requireContext } from '@/features/auth/guards';
import { DEAL_STAGE, stageFromSlug, stageHref } from '@/features/deals/constants';
import { getTeamMembers } from '@/features/leads/queries';
import { TransactionFiltersBar } from '@/features/transactions/components/transaction-filters';
import { TransactionsTable } from '@/features/transactions/components/transactions-table';
import { listTransactions } from '@/features/transactions/queries';
import { transactionFiltersSchema } from '@/features/transactions/schemas';
import { isValidTimeZone } from '@/lib/dates';

type PageProps = {
  params: Promise<{ stage: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const stage = stageFromSlug((await params).stage);
  return { title: stage ? DEAL_STAGE[stage].label : 'Deals' };
}

/** One page per deal stage: /deals/under-contract, /deals/ab-closing, … */
export default async function DealStagePage({ params, searchParams }: PageProps) {
  const stage = stageFromSlug((await params).stage);
  if (!stage) notFound();
  const ctx = await requireContext();
  const raw = await searchParams;
  const filters = transactionFiltersSchema.parse({ stage, agent: raw.agent, q: raw.q, page: raw.page });
  const timezone = isValidTimeZone(ctx.profile?.timezone) ? ctx.profile!.timezone : 'America/New_York';
  const info = DEAL_STAGE[stage];
  const basePath = stageHref(stage);
  const canAdd = stage !== 'closed' && stage !== 'dead';
  const newHref = `/transactions/new?stage=${stage}`;

  const [result, members] = await Promise.all([
    listTransactions(ctx.organization.id, ctx.userId, filters),
    getTeamMembers(ctx.organization.id),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{info.label}</h1>
          <p className="text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? 'deal' : 'deals'} · {info.description}
          </p>
        </div>
        {canAdd && <Link href={newHref} className={buttonVariants()}><Plus /> New deal</Link>}
      </div>
      <TransactionFiltersBar filters={filters} members={members} basePath={basePath} />
      <TransactionsTable
        result={result}
        filters={filters}
        timezone={timezone}
        basePath={basePath}
        empty={
          canAdd
            ? { title: `No deals in ${info.label}`, body: 'Add a deal here, or move one from another stage on its deal page.', href: newHref, cta: 'New deal' }
            : { title: `No ${info.label.toLowerCase()} yet`, body: 'Deals land here when you move them to this stage on the deal page.', href: stageHref('under_contract'), cta: 'Go to Under Contract' }
        }
      />
      <Pagination
        basePath={basePath}
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        noun={['deal', 'deals']}
        params={{ agent: filters.agent, q: filters.q }}
      />
    </div>
  );
}
