import { CalendarCheck, CircleAlert, CircleDot } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { KEY_DATES } from '../constants';
import type { TransactionRow } from '../types';
import { daysUntil, formatDateOnly, relativeDays } from './tx-bits';

/** Contract → contingencies → closing, with countdowns. */
export function KeyDates({ tx, timezone }: { tx: TransactionRow; timezone: string }) {
  const finished = tx.status === 'closed' || tx.status === 'cancelled';
  const items = KEY_DATES.map((k) => ({ ...k, date: tx[k.key] as string | null }));
  const nextKey = finished
    ? null
    : items.filter((i) => i.date && daysUntil(i.date, timezone) >= 0).sort((a, b) => a.date!.localeCompare(b.date!))[0]?.key;

  return (
    <Card>
      <CardHeader><CardTitle>Key dates</CardTitle></CardHeader>
      <CardContent>
        <ol className="relative space-y-4 border-l pl-6">
          {items.map((i) => {
            const days = i.date ? daysUntil(i.date, timezone) : null;
            const past = days !== null && days < 0;
            // A past contingency on an open deal needs attention; the contract date being past is normal.
            const overdue = past && !finished && i.key !== 'contract_date';
            const isNext = i.key === nextKey;
            const Icon = overdue ? CircleAlert : past || (finished && i.date) ? CalendarCheck : CircleDot;
            return (
              <li key={i.key} className="relative">
                <span className={cn(
                  'absolute top-0.5 -left-[2.0625rem] flex size-6 items-center justify-center rounded-full bg-background ring-1',
                  isNext ? 'ring-primary' : 'ring-foreground/10',
                )}>
                  <Icon className={cn('size-3.5', overdue ? 'text-critical' : isNext ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                </span>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className={cn('text-sm', isNext && 'font-medium')}>{i.label}</p>
                  {i.date ? (
                    <p className="text-sm tabular-nums">
                      {formatDateOnly(i.date)}
                      {days !== null && !finished && (
                        <span className={cn('ml-2 text-xs', overdue ? 'font-medium text-critical' : isNext ? 'font-medium text-primary' : 'text-muted-foreground')}>
                          {overdue ? `Overdue · ${relativeDays(days)}` : relativeDays(days)}
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not set</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
