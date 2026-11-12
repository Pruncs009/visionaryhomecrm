import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireContext } from '@/features/auth/guards';
import { getTeamMembers } from '@/features/leads/queries';
import { TransactionForm } from '@/features/transactions/components/transaction-form';
import { getTransaction, getTransactionFormOptions } from '@/features/transactions/queries';
import { uuidSchema } from '@/features/transactions/schemas';

export const metadata: Metadata = { title: 'Edit transaction' };

type PageProps = { params: Promise<{ id: string }> };
const s = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const d = (v: string | null) => (v ? v.slice(0, 10) : '');

export default async function EditTransactionPage({ params }: PageProps) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const ctx = await requireContext();
  const [tx, options, members] = await Promise.all([
    getTransaction(ctx.organization.id, id),
    getTransactionFormOptions(ctx.organization.id),
    getTeamMembers(ctx.organization.id),
  ]);
  if (!tx) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit transaction</h1>
        <p className="text-sm text-muted-foreground">{tx.name}</p>
      </div>
      <TransactionForm
        contacts={options.contacts}
        properties={options.properties}
        members={members}
        submitLabel="Save changes"
        cancelHref={`/transactions/${tx.id}`}
        defaults={{
          transaction_id: tx.id,
          name: tx.name,
          side: tx.side,
          status: tx.status,
          property_mode: 'existing',
          property_id: tx.property_id,
          buyer_contact_id: s(tx.buyer_contact_id),
          seller_contact_id: s(tx.seller_contact_id),
          buyer_name: s(tx.buyer_name),
          seller_name: s(tx.seller_name),
          purchase_price: s(tx.purchase_price),
          agent_id: s(tx.agent_id),
          offer_price: s(tx.offer_price),
          sale_price: s(tx.sale_price),
          earnest_money: s(tx.earnest_money),
          commission_rate: s(tx.commission_rate),
          commission_amount: s(tx.commission_amount),
          contract_date: d(tx.contract_date),
          inspection_deadline: d(tx.inspection_deadline),
          appraisal_deadline: d(tx.appraisal_deadline),
          financing_deadline: d(tx.financing_deadline),
          closing_date: d(tx.closing_date),
        }}
      />
    </div>
  );
}
