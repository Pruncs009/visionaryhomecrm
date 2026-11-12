import Link from 'next/link';
import { Handshake } from 'lucide-react';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatCurrency } from '@/lib/utils';
import { getRecentClosings } from '../queries';
import type { DashboardScope } from '../types';
import { EmptyState, WidgetError } from './widget-states';

export async function RecentClosingsCard({ scope, className }: { scope: DashboardScope; className?: string }) {
  let closings;
  try {
    closings = await getRecentClosings(scope);
  } catch (error) {
    console.error('[dashboard] closings failed', error);
    return <WidgetError title="Closed transactions" className={className} />;
  }

  const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: scope.timezone });

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Closed transactions</CardTitle>
        <CardDescription>Most recent closings</CardDescription>
        <CardAction>
          <Link href="/transactions" className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {closings.length === 0 ? (
          <EmptyState icon={Handshake}>No closings yet. Your first one will show up here.</EmptyState>
        ) : (
          <ul className="divide-y">
            {closings.map((c) => (
              <li key={c.id} className="py-2.5 first:pt-0 last:pb-0">
                <Link href={`/transactions/${c.id}`} className="group flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium group-hover:underline">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Closed {date.format(new Date(c.closedAt))}
                      {c.salePrice !== null && ` · ${formatCurrency(c.salePrice, { compact: true })}`}
                    </p>
                  </div>
                  {c.commission !== null && (
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {formatCurrency(c.commission)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
