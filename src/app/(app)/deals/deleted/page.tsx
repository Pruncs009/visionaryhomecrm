import type { Metadata } from 'next';
import { Trash2 } from 'lucide-react';
import { requireContext } from '@/features/auth/guards';
import { DeletedDealsTable } from '@/features/transactions/components/deleted-deals-table';
import { listDeletedTransactions } from '@/features/transactions/queries';
import { isValidTimeZone } from '@/lib/dates';

export const metadata: Metadata = { title: 'Deleted' };

/** Deleted deals: restore them, or delete them permanently. */
export default async function DeletedDealsPage() {
  const ctx = await requireContext();
  const timezone = isValidTimeZone(ctx.profile?.timezone) ? ctx.profile!.timezone : 'America/New_York';
  const deals = await listDeletedTransactions(ctx.organization.id);
  const canManage = ctx.role !== 'assistant';

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Deleted</h1>
        <p className="text-sm text-muted-foreground">
          {deals.length} deleted {deals.length === 1 ? 'deal' : 'deals'} · Restore a deal or delete it permanently.
        </p>
      </div>
      {deals.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Trash2 className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">Nothing in Deleted</p>
          <p className="max-w-sm text-sm text-muted-foreground">Deals you delete show up here.</p>
        </div>
      ) : (
        <DeletedDealsTable deals={deals} timezone={timezone} canManage={canManage} />
      )}
    </div>
  );
}
