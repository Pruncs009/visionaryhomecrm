import Link from 'next/link';
import { Handshake } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatCurrency } from '@/lib/utils';
import type { TransactionFilters } from '../schemas';
import type { TransactionListResult } from '../types';
import { DealStageBadge } from '@/features/deals/components/deal-stage';
import { daysUntil, formatDateOnly, relativeDays } from './tx-bits';

type EmptyState = { title: string; body: string; href: string; cta: string };

export function TransactionsTable({
  result,
  filters,
  timezone,
  basePath = '/transactions',
  empty,
}: {
  result: TransactionListResult;
  filters: TransactionFilters;
  timezone: string;
  /** Where "Clear filters" goes (a deal-stage page passes its own URL). */
  basePath?: string;
  /** Copy for the unfiltered empty state. */
  empty?: EmptyState;
}) {
  if (result.rows.length === 0) {
    const filtered = !!(filters.q || filters.agent || (!filters.stage && filters.view && filters.view !== 'active'));
    const e: EmptyState = filtered
      ? { title: 'No deals match', body: 'Try another view or clear the filters.', href: basePath, cta: 'Clear filters' }
      : empty ?? {
          title: 'No active transactions',
          body: 'When a buyer or seller goes under contract, open a transaction to track dates and documents.',
          href: '/transactions/new',
          cta: 'New transaction',
        };
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <Handshake className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">{e.title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{e.body}</p>
        <Link href={e.href} className={buttonVariants({ variant: filtered ? 'outline' : 'default' })}>{e.cta}</Link>
      </div>
    );
  }

  const date = (d: string) => formatDateOnly(d, { month: '2-digit', day: '2-digit', year: 'numeric' });

  // Columns: Property · Stage · Buyer · Seller · Purchase price · Ratified date · Close date
  return (
    <div className="rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Property</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="hidden md:table-cell">Buyer</TableHead>
            <TableHead className="hidden md:table-cell">Seller</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Purchase price</TableHead>
            <TableHead className="hidden sm:table-cell">Ratified date</TableHead>
            <TableHead className="pr-4">Close date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.map((t) => {
            const days = t.closing_date ? daysUntil(t.closing_date, timezone) : null;
            const active = t.status !== 'closed' && t.status !== 'cancelled';
            return (
              <TableRow key={t.id}>
                <TableCell className="max-w-72 pl-4">
                  <Link href={`/transactions/${t.id}`} className="block truncate font-medium hover:underline">{t.property_address || t.name}</Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[t.property_city, t.property_state].filter(Boolean).join(', ')}
                  </span>
                </TableCell>
                <TableCell><DealStageBadge stage={t.deal_stage} /></TableCell>
                <TableCell className="hidden max-w-48 md:table-cell">
                  {t.buyer_name ? <span className="block truncate">{t.buyer_name}</span> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="hidden max-w-48 md:table-cell">
                  {t.seller_name ? <span className="block truncate">{t.seller_name}</span> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">
                  {t.purchase_price !== null ? formatCurrency(t.purchase_price) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap tabular-nums sm:table-cell">
                  {t.contract_date ? date(t.contract_date) : <span className="text-muted-foreground">Not set</span>}
                </TableCell>
                <TableCell className="pr-4 whitespace-nowrap">
                  {t.closing_date ? (
                    <>
                      <span className="block tabular-nums">{date(t.closing_date)}</span>
                      {active && days !== null && (
                        <span className={cn('block text-xs', days < 0 ? 'font-medium text-critical' : days <= 7 ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                          {days < 0 ? `Overdue · ${relativeDays(days)}` : relativeDays(days)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
