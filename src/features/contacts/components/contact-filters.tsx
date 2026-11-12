'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { ContactFilters } from '../schemas';
import type { TagCount } from '../types';

/** GET form → filters live in the URL. Tag select auto-submits; search submits on Enter. */
export function ContactFiltersBar({ filters, tags }: { filters: ContactFilters; tags: TagCount[] }) {
  return (
    <form method="get" action="/contacts" role="search" className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          name="q"
          type="search"
          placeholder="Search name, email, phone, company"
          aria-label="Search contacts"
          defaultValue={filters.q}
          className="pl-8"
        />
      </div>
      <NativeSelect
        name="tag"
        aria-label="Filter by tag"
        defaultValue={filters.tag ?? ''}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <NativeSelectOption value="">All tags</NativeSelectOption>
        {tags.map((t) => (
          <NativeSelectOption key={t.tag} value={t.tag}>
            {t.tag} ({t.contacts})
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Button type="submit" variant="secondary" className="sr-only">Search</Button>
      {(filters.q || filters.tag) && (
        <Button variant="ghost" render={<Link href="/contacts" />} nativeButton={false}>
          Clear filters
        </Button>
      )}
    </form>
  );
}
