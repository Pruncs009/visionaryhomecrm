import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requireContext } from '@/features/auth/guards';
import { LeadFiltersBar } from '@/features/leads/components/lead-filters';
import { LeadsPagination, LeadsTable } from '@/features/leads/components/leads-table';
import { LeadsViewToggle } from '@/features/leads/components/view-toggle';
import { getTeamMembers, listLeads } from '@/features/leads/queries';
import { leadFiltersSchema } from '@/features/leads/schemas';
import { isValidTimeZone } from '@/lib/dates';

export const metadata: Metadata = { title: 'Leads' };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadsPage({ searchParams }: PageProps) {
  const ctx = await requireContext();
  const raw = await searchParams;
  const filters = leadFiltersSchema.parse({
    q: raw.q, status: raw.status, source: raw.source, agent: raw.agent, page: raw.page,
  });
  const timezone = isValidTimeZone(ctx.profile?.timezone) ? ctx.profile!.timezone : 'America/New_York';

  const [result, members] = await Promise.all([
    listLeads(ctx.organization.id, ctx.userId, filters),
    getTeamMembers(ctx.organization.id),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? 'lead' : 'leads'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LeadsViewToggle current="list" />
          <Button render={<Link href="/leads/new" />} nativeButton={false}>
            <Plus /> New lead
          </Button>
        </div>
      </div>

      <LeadFiltersBar filters={filters} members={members} />
      <LeadsTable
        result={result}
        filters={filters}
        timezone={timezone}
        canDelete={ctx.role !== 'assistant'}
      />
      <LeadsPagination result={result} filters={filters} />
    </div>
  );
}
