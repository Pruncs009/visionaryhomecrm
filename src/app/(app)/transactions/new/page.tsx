import type { Metadata } from 'next';
import { requireContext } from '@/features/auth/guards';
import { getTeamMembers } from '@/features/leads/queries';
import { TransactionForm } from '@/features/transactions/components/transaction-form';
import { getTransactionFormOptions } from '@/features/transactions/queries';

export const metadata: Metadata = { title: 'New transaction' };

type PageProps = { searchParams: Promise<Record<string, string | undefined>> };

export default async function NewTransactionPage({ searchParams }: PageProps) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const [options, members] = await Promise.all([
    getTransactionFormOptions(ctx.organization.id),
    getTeamMembers(ctx.organization.id),
  ]);
  // Deep links like /transactions/new?buyer=<contactId> prefill a party.
  const known = (id?: string) => (id && options.contacts.some((c) => c.id === id) ? id : '');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New transaction</h1>
        <p className="text-sm text-muted-foreground">Open a deal when a buyer or seller goes under contract.</p>
      </div>
      <TransactionForm
        contacts={options.contacts}
        properties={options.properties}
        members={members}
        submitLabel="Create transaction"
        cancelHref="/transactions"
        defaults={{
          side: 'buyer',
          status: 'under_contract',
          agent_id: ctx.userId,
          buyer_contact_id: known(sp.buyer),
          seller_contact_id: known(sp.seller),
          contract_date: new Intl.DateTimeFormat('en-CA', { timeZone: ctx.profile?.timezone || 'America/New_York' }).format(new Date()),
        }}
      />
    </div>
  );
}
