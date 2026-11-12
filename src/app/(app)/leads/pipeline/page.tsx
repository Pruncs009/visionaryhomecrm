import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { requireContext } from '@/features/auth/guards';
import { PipelineBoard } from '@/features/leads/components/pipeline-board';
import { LeadsViewToggle } from '@/features/leads/components/view-toggle';
import { getPipelineLeads } from '@/features/leads/queries';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Lead pipeline' };

type PageProps = { searchParams: Promise<{ agent?: string }> };

export default async function LeadPipelinePage({ searchParams }: PageProps) {
  const ctx = await requireContext();
  const { agent } = await searchParams;
  const mine = agent === 'me';
  const cards = await getPipelineLeads(ctx.organization.id, ctx.userId, mine ? 'me' : undefined);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lead pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Drag leads between stages. Changes save automatically. Closed stages show the last 90 days.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LeadsViewToggle current="board" />
          <nav aria-label="Whose leads" className="inline-flex gap-1 rounded-lg bg-muted p-1">
            {[['All leads', '/leads/pipeline', !mine], ['Mine', '/leads/pipeline?agent=me', mine]].map(([label, href, active]) => (
              <Link
                key={String(href)}
                href={String(href)}
                aria-current={active ? 'page' : undefined}
                className={cn('rounded-md px-3 py-1 text-sm font-medium', active ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/leads/new" className={buttonVariants()}><Plus /> New lead</Link>
        </div>
      </div>
      {/* key: a fresh board whenever the server data set changes (filter switch) */}
      <PipelineBoard key={mine ? 'mine' : 'all'} initialCards={cards} />
    </div>
  );
}
