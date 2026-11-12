import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Home, KeyRound, Pencil, Signpost } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireContext } from '@/features/auth/guards';
import { getTeamMembers } from '@/features/leads/queries';
import { TX_SIDE } from '@/features/transactions/constants';
import { DocumentsPanel } from '@/features/transactions/components/documents-panel';
import { KeyDates } from '@/features/transactions/components/key-dates';
import { DealStageBadge, DealStageSelect } from '@/features/deals/components/deal-stage';
import { DEAL_STAGE, stageHref } from '@/features/deals/constants';
import { DeleteTransactionButton, TxAgentSelect } from '@/features/transactions/components/tx-controls';
import { getTransaction, getTransactionFiles } from '@/features/transactions/queries';
import { uuidSchema } from '@/features/transactions/schemas';
import { isValidTimeZone } from '@/lib/dates';
import { formatCurrency } from '@/lib/utils';

export const metadata: Metadata = { title: 'Transaction' };

type PageProps = { params: Promise<{ id: string }> };

export default async function TransactionDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const ctx = await requireContext();
  const org = ctx.organization.id;
  const [tx, files, members] = await Promise.all([
    getTransaction(org, id),
    getTransactionFiles(org, id),
    getTeamMembers(org),
  ]);
  if (!tx) notFound();

  const timezone = isValidTimeZone(ctx.profile?.timezone) ? ctx.profile!.timezone : 'America/New_York';
  const price = tx.sale_price ?? tx.offer_price;
  const commission =
    tx.commission_amount ?? (price !== null && tx.commission_rate !== null ? (price * tx.commission_rate) / 100 : null);
  const canDelete = ctx.role !== 'assistant';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href={stageHref(tx.deal_stage)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {DEAL_STAGE[tx.deal_stage].label}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{tx.name}</h1>
            <DealStageBadge stage={tx.deal_stage} />
          </div>
          <p className="text-sm text-muted-foreground">
            {[tx.property_address, tx.property_city, tx.property_state].filter(Boolean).join(', ')} · {TX_SIDE[tx.side]}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/transactions/${tx.id}/edit`} className={buttonVariants({ variant: 'outline' })}><Pencil /> Edit</Link>
          {canDelete && <DeleteTransactionButton id={tx.id} name={tx.name} />}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <KeyDates tx={tx} timezone={timezone} />
          <DocumentsPanel orgId={org} transactionId={tx.id} files={files} timezone={timezone} canDelete={canDelete} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Deal</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="deal-stage" className="text-sm font-medium">Stage</label>
                {/* key: reset the optimistic value when the server data changes */}
                <DealStageSelect key={tx.deal_stage} id={tx.id} stage={tx.deal_stage} />
              </div>
              <div className="space-y-1.5"><p className="text-sm font-medium">Assigned agent</p><TxAgentSelect id={tx.id} agentId={tx.agent_id} members={members} /></div>
              <dl className="grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                <Stat label={tx.sale_price !== null ? 'Sale price' : 'Offer price'} value={price !== null ? formatCurrency(price) : '—'} />
                <Stat label="Earnest money" value={tx.earnest_money !== null ? formatCurrency(tx.earnest_money) : '—'} />
                <Stat label="Commission" value={commission !== null ? formatCurrency(commission) : '—'} />
                <Stat label="Rate" value={tx.commission_rate !== null ? `${tx.commission_rate}%` : '—'} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Parties</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                <Party icon={Home} role="Property" name={tx.property_address} />
                <Party icon={KeyRound} role="Buyer" name={tx.buyer_name} href={tx.buyer_contact_id ? `/contacts/${tx.buyer_contact_id}` : undefined} />
                <Party icon={Signpost} role="Seller" name={tx.seller_name} href={tx.seller_contact_id ? `/contacts/${tx.seller_contact_id}` : undefined} />
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Party({ icon: Icon, role, name, href }: { icon: React.ElementType; role: string; name: string | null; href?: string }) {
  return (
    <li className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{role}</p>
        {name ? (
          href ? <Link href={href} className="font-medium text-primary hover:underline">{name}</Link> : <p className="font-medium">{name}</p>
        ) : (
          <p className="text-muted-foreground">Not set</p>
        )}
      </div>
    </li>
  );
}
