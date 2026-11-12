import Link from 'next/link';
import { Ban, Upload, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ContactFilters } from '../schemas';
import type { ContactListResult } from '../types';
import { TagBadge } from './tag-badge';

export function ContactsTable({ result, filters }: { result: ContactListResult; filters: ContactFilters }) {
  const filtered = !!(filters.q || filters.tag);

  if (result.rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <Users className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">{filtered ? 'No contacts match' : 'No contacts yet'}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {filtered ? 'Try a different search or tag.' : 'Add contacts one at a time, or import your existing database from a CSV file.'}
        </p>
        {filtered ? (
          <Button variant="outline" render={<Link href="/contacts" />} nativeButton={false}>Clear filters</Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" render={<Link href="/contacts/import" />} nativeButton={false}><Upload /> Import CSV</Button>
            <Button render={<Link href="/contacts/new" />} nativeButton={false}>New contact</Button>
          </div>
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
            <TableHead className="hidden md:table-cell">Phone</TableHead>
            <TableHead className="hidden lg:table-cell">Company</TableHead>
            <TableHead className="hidden lg:table-cell">Location</TableHead>
            <TableHead>Tags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="max-w-64 pl-4">
                <Link href={`/contacts/${c.id}`} className="flex items-center gap-1.5 truncate font-medium hover:underline">
                  {c.full_name}
                  {c.do_not_contact && <Ban className="size-3.5 shrink-0 text-critical" aria-label="Do not contact" />}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">{c.email ?? '—'}</span>
              </TableCell>
              <TableCell className="hidden tabular-nums md:table-cell">{c.phone ?? '—'}</TableCell>
              <TableCell className="hidden lg:table-cell">{c.company ?? '—'}</TableCell>
              <TableCell className="hidden lg:table-cell">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</TableCell>
              <TableCell>
                <div className="flex max-w-72 flex-wrap gap-1">
                  {c.tags.slice(0, 4).map((t) => <TagBadge key={t} tag={t} />)}
                  {c.tags.length > 4 && <span className="text-xs text-muted-foreground">+{c.tags.length - 4}</span>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
