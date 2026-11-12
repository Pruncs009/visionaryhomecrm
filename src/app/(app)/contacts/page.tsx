import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { requireContext } from '@/features/auth/guards';
import { ContactFiltersBar } from '@/features/contacts/components/contact-filters';
import { ContactsTable } from '@/features/contacts/components/contacts-table';
import { getTagCounts, listContacts } from '@/features/contacts/queries';
import { contactFiltersSchema } from '@/features/contacts/schemas';

export const metadata: Metadata = { title: 'Contacts' };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ContactsPage({ searchParams }: PageProps) {
  const ctx = await requireContext();
  const raw = await searchParams;
  const filters = contactFiltersSchema.parse({ q: raw.q, tag: raw.tag, page: raw.page });

  const [result, tags] = await Promise.all([
    listContacts(ctx.organization.id, filters),
    getTagCounts(ctx.organization.id),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? 'contact' : 'contacts'}
            {filters.tag && <> tagged <strong>{filters.tag}</strong></>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/contacts/import" />} nativeButton={false}>
            <Upload /> Import
          </Button>
          <Button render={<Link href="/contacts/new" />} nativeButton={false}>
            <Plus /> New contact
          </Button>
        </div>
      </div>
      <ContactFiltersBar filters={filters} tags={tags} />
      <ContactsTable result={result} filters={filters} />
      <Pagination
        basePath="/contacts"
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        noun={['contact', 'contacts']}
        params={{ q: filters.q, tag: filters.tag }}
      />
    </div>
  );
}
