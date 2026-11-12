'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { LEAD_SOURCE, LEAD_SOURCE_VALUES, LEAD_STATUS, LEAD_STATUS_VALUES } from '../constants';
import type { LeadFilters } from '../schemas';
import type { TeamMember } from '../types';

/**
 * Plain GET form → filters live in the URL (shareable, back-button friendly,
 * read by the Server Component). Selects auto-submit; search submits on Enter.
 */
export function LeadFiltersBar({ filters, members }: { filters: LeadFilters; members: TeamMember[] }) {
  const submit = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();
  const hasFilters = !!(filters.q || filters.status || filters.source || filters.agent);

  return (
    <form method="get" action="/leads" role="search" className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          name="q"
          type="search"
          placeholder="Search name, email, phone"
          aria-label="Search leads"
          defaultValue={filters.q}
          className="pl-8"
        />
      </div>
      <NativeSelect name="status" aria-label="Filter by status" defaultValue={filters.status ?? ''} onChange={submit}>
        <NativeSelectOption value="">All statuses</NativeSelectOption>
        {LEAD_STATUS_VALUES.map((s) => (
          <NativeSelectOption key={s} value={s}>{LEAD_STATUS[s].label}</NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect name="source" aria-label="Filter by source" defaultValue={filters.source ?? ''} onChange={submit}>
        <NativeSelectOption value="">All sources</NativeSelectOption>
        {LEAD_SOURCE_VALUES.map((s) => (
          <NativeSelectOption key={s} value={s}>{LEAD_SOURCE[s]}</NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect name="agent" aria-label="Filter by agent" defaultValue={filters.agent ?? ''} onChange={submit}>
        <NativeSelectOption value="">All agents</NativeSelectOption>
        <NativeSelectOption value="me">Assigned to me</NativeSelectOption>
        <NativeSelectOption value="unassigned">Unassigned</NativeSelectOption>
        {members.map((m) => (
          <NativeSelectOption key={m.userId} value={m.userId}>{m.name}</NativeSelectOption>
        ))}
      </NativeSelect>
      <Button type="submit" variant="secondary" className="sr-only">Search</Button>
      {hasFilters && (
        <Button variant="ghost" render={<Link href="/leads" />} nativeButton={false}>
          Clear filters
        </Button>
      )}
    </form>
  );
}
