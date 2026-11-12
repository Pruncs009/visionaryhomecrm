'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { TeamMember } from '@/features/leads/types';
import { cn } from '@/lib/utils';
import type { TransactionFilters } from '../schemas';

const VIEWS = [
  ['active', 'Active'],
  ['closed', 'Closed'],
  ['cancelled', 'Cancelled'],
  ['all', 'All'],
] as const;

export function TransactionFiltersBar({
  filters,
  members,
  basePath = '/transactions',
}: {
  filters: TransactionFilters;
  members: TeamMember[];
  /** Deal-stage pages: search + agent only, no Active/Closed tabs. */
  basePath?: string;
}) {
  const stagePage = basePath !== '/transactions';
  const view = filters.view ?? 'active';
  const href = (v: string) => {
    const p = new URLSearchParams();
    if (v !== 'active') p.set('view', v);
    if (filters.agent) p.set('agent', filters.agent);
    if (filters.q) p.set('q', filters.q);
    const qs = p.toString();
    return qs ? `/transactions?${qs}` : '/transactions';
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {stagePage ? <span /> : (
        <nav aria-label="Transaction views" className="flex gap-1 rounded-lg bg-muted p-1">
          {VIEWS.map(([v, label]) => (
            <Link
              key={v}
              href={href(v)}
              aria-current={view === v ? 'page' : undefined}
              className={cn('rounded-md px-3 py-1 text-sm font-medium', view === v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      <form method="get" action={basePath} role="search" className="flex flex-wrap items-center gap-2">
        {!stagePage && view !== 'active' && <input type="hidden" name="view" value={view} />}
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" type="search" placeholder="Address, buyer, seller" aria-label="Search transactions" defaultValue={filters.q} className="w-56 pl-8" />
        </div>
        <NativeSelect name="agent" aria-label="Filter by agent" defaultValue={filters.agent ?? ''} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          <NativeSelectOption value="">All agents</NativeSelectOption>
          <NativeSelectOption value="me">Mine</NativeSelectOption>
          <NativeSelectOption value="unassigned">Unassigned</NativeSelectOption>
          {members.map((m) => <NativeSelectOption key={m.userId} value={m.userId}>{m.name}</NativeSelectOption>)}
        </NativeSelect>
        <Button type="submit" variant="secondary" className="sr-only">Search</Button>
      </form>
    </div>
  );
}
