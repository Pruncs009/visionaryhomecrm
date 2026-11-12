import Link from 'next/link';
import { Handshake } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatCurrency } from '@/lib/utils';
import { TX_SIDE } from '../constants';
import type { TransactionFilters } from '../schemas';
import type { TransactionListResult } from '../types';
import { daysUntil, formatDateOnly, relativeDays, TxStatusBadge } from './tx-bits';

export function TransactionsTable({
  result,
  filters,
  timezone,
}: {
  result: TransactionListResult;
  filters: TransactionFilters;
  timezone: string;
}) {
  if (result.rows.length === 0) {
    const filtered = !!(filters.q || filters.agent || (filters.view && filters.view !== 'active'));
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <Handshake className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">{filtered ? 'No transactions match' : 'No active transactions'}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {filtered ? 'Try another view or clear the filters.' : 'When a buyer or seller goes under contract, open a transaction to track dates and documents.'}
        </p>
        <Link href={filtered ? '/transactions' : '/transactions/new'} className={buttonVariants({ variant: filtered ? 'outline' : 'default' })}>
          {filtered ? 'Clear filters' : 'New transaction'}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Property</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Buyer / Seller</TableHead>
            <TableHead className="hidden lg:table-cell">Price</TableHead>
            <TableHead className="hidden sm:table-cell">Agent</TableHead>
            <TableHead>Closing</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.map((t) => {
            const days = t.closing_date ? daysUntil(t.closing_date, timezone) : null;
            const active = t.status !== 'closed' && t.status !== 'cancelled';
            const price = t.sale_price ?? t.offer_price;
            return (
              <TableRow key={t.id}>
                <TableCell className="max-w-72 pl-4">
                  <Link href={`/transactions/${t.id}`} className="block truncate font-medium hover:underline">{t.name}</Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[t.property_city, t.property_state].filter(Boolean).join(', ')} · {TX_SIDE[t.side]}
                  </span>
                </TableCell>
                <TableCell><TxStatusBadge status={t.status} /></TableCell>
                <TableCell className="hidden max-w-56 md:table-cell">
                  <span className="block truncate">{t.buyer_name ?? '—'}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.seller_name ?? '—'}</span>
                </TableCell>
                <TableCell className="hidden tabular-nums lg:table-cell">{price !== null ? formatCurrency(price) : '—'}</TableCell>
                <TableCell className="hidden sm:table-cell">{t.agent_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {t.closing_date ? (
                    <>
                      <span className="block tabular-nums">{formatDateOnly(t.closing_date, { month: 'short', day: 'numeric' })}</span>
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
