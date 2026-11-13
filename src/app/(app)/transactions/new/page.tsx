import type { Metadata } from 'next';
import { requireContext } from '@/features/auth/guards';
import { DEAL_STAGE, DEAL_STAGE_VALUES, stageHref, type DealStage } from '@/features/deals/constants';
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
  const nameOf = (id: string) => options.contacts.find((c) => c.id === id)?.label ?? '';
  const buyerId = known(sp.buyer);
  const sellerId = known(sp.seller);
  // ?stage=under_dispo when started from a deal-stage page.
  const stage = (DEAL_STAGE_VALUES as readonly string[]).includes(sp.stage ?? '') ? (sp.stage as DealStage) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New deal</h1>
        <p className="text-sm text-muted-foreground">
          {stage ? `Lands in ${DEAL_STAGE[stage].label}. You can move it to another stage any time.` : 'Open a deal when a buyer or seller goes under contract.'}
        </p>
      </div>
      <TransactionForm
        contacts={options.contacts}
        properties={options.properties}
        members={members}
        submitLabel="Create deal"
        cancelHref={stage ? stageHref(stage) : '/transactions'}
        dealStage={stage ?? undefined}
        split={stage === 'ac_closing'}
        defaults={{
          side: 'buyer',
          status: 'under_contract',
          agent_id: ctx.userId,
          buyer_contact_id: buyerId,
          seller_contact_id: sellerId,
          buyer_name: nameOf(buyerId),
          seller_name: nameOf(sellerId),
          contract_date: new Intl.DateTimeFormat('en-CA', { timeZone: ctx.profile?.timezone || 'America/New_York' }).format(new Date()),
        }}
      />
    </div>
  );
}
