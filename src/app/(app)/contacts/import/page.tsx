import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireContext } from '@/features/auth/guards';
import { ImportWizard } from '@/features/contacts/components/import-wizard';

export const metadata: Metadata = { title: 'Import contacts' };

export default async function ImportContactsPage() {
  await requireContext();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/contacts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All contacts
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import contacts</h1>
        <p className="text-sm text-muted-foreground">
          Bring in your database from a CSV file. Duplicates are matched by email.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
