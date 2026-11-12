import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { LEAD_INTENT, sourceLabel } from '../constants';
import type { LeadFilters } from '../schemas';
import type { LeadListResult } from '../types';
import { ScoreBadge } from '@/features/ai/components/score-badge';
import { LeadRowActions } from './lead-row-actions';
import { LeadStatusBadge } from './lead-status-badge';

function budget(min: number | null, max: number | null) {
  if (min === null && max === null) return '—';
  if (min !== null && max !== null) return `${formatCurrency(min, { compact: true })}–${formatCurrency(max, { compact: true })}`;
  return max !== null ? `Up to ${formatCurrency(max, { compact: true })}` : `${formatCurrency(min!, { compact: true })}+`;
}

export function LeadsTable({
  result,
  filters,
  timezone,
  canDelete,
}: {
  result: LeadListResult;
  filters: LeadFilters;
  timezone: string;
  canDelete: boolean;
}) {
  const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: timezone });
  const filtered = !!(filters.q || filters.status || filters.source || filters.agent);

  if (result.rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <UserPlus className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">{filtered ? 'No leads match these filters' : 'No leads yet'}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {filtered
            ? 'Try a different search or clear the filters.'
            : 'Add your first lead, or connect a lead source later in Automations.'}
        </p>
        {filtered ? (
          <Button variant="outline" render={<Link href="/leads" />} nativeButton={false}>Clear filters</Button>
        ) : (
          <Button render={<Link href="/leads/new" />} nativeButton={false}>New lead</Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Source</TableHead>
            <TableHead className="hidden lg:table-cell">Looking to</TableHead>
            <TableHead className="hidden lg:table-cell">Budget</TableHead>
            <TableHead className="hidden sm:table-cell">Agent</TableHead>
            <TableHead className="hidden md:table-cell">Created</TableHead>
            <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="max-w-64 pl-4">
                <Link href={`/leads/${lead.id}`} className="block truncate font-medium hover:underline">
                  {lead.full_name}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">
                  {lead.email ?? lead.phone ?? '—'}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  <LeadStatusBadge status={lead.status} />
                  <ScoreBadge score={lead.score} temperature={lead.ai_temperature} />
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">{sourceLabel(lead.source) ?? '—'}</TableCell>
              <TableCell className="hidden lg:table-cell">{LEAD_INTENT[lead.intent]}</TableCell>
              <TableCell className="hidden tabular-nums lg:table-cell">{budget(lead.budget_min, lead.budget_max)}</TableCell>
              <TableCell className="hidden sm:table-cell">
                {lead.assigned_name ?? <span className="text-muted-foreground">Unassigned</span>}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                <time dateTime={lead.created_at}>{date.format(new Date(lead.created_at))}</time>
              </TableCell>
              <TableCell>
                <LeadRowActions leadId={lead.id} leadName={lead.full_name} canDelete={canDelete} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Prev/next pagination that preserves the current filters. */
export function LeadsPagination({ result, filters }: { result: LeadListResult; filters: LeadFilters }) {
  if (result.pageCount <= 1) return null;
  const href = (page: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v && k !== 'page') params.set(k, String(v));
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    return qs ? `/leads?${qs}` : '/leads';
  };

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        Page {result.page} of {result.pageCount} · {result.total} leads
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={result.page <= 1}
          render={result.page > 1 ? <Link href={href(result.page - 1)} /> : undefined}
          nativeButton={result.page <= 1}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={result.page >= result.pageCount}
          render={result.page < result.pageCount ? <Link href={href(result.page + 1)} /> : undefined}
          nativeButton={result.page >= result.pageCount}>
          Next
        </Button>
      </div>
    </nav>
  );
}
