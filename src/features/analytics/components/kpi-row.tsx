import { CircleDollarSign, Handshake, Percent, Target, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { AnalyticsKpis } from '../types';

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);

function Tile({ title, value, icon: Icon, children }: { title: string; value: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <Card data-kpi={title}>
      <CardHeader>
        <CardDescription className="flex items-center gap-2 font-medium">
          <Icon className="size-4" aria-hidden />
          {title}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

/** Headline numbers for the selected period — stat tiles, not charts. */
export function KpiRow({ k }: { k: AnalyticsKpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5 [&>*:first-child]:col-span-2 xl:[&>*:first-child]:col-span-1">
      <Tile title="GCI" value={formatCurrency(k.gci)} icon={CircleDollarSign}>
        {formatCurrency(k.volume, { compact: true })} sales volume
      </Tile>
      <Tile title="Closed deals" value={String(k.dealsClosed)} icon={Handshake}>
        {k.dealsClosed ? `${formatCurrency(k.volume / k.dealsClosed, { compact: true })} average price` : 'No closings yet'}
      </Tile>
      <Tile title="New leads" value={String(k.leads)} icon={UserPlus}>
        {k.won} won · {k.lost} lost
      </Tile>
      <Tile title="Conversion rate" value={pct(k.conversionRate)} icon={Target}>
        Leads that closed won
      </Tile>
      <Tile title="Closing rate" value={pct(k.winRate)} icon={Percent}>
        Won ÷ (won + lost)
      </Tile>
    </div>
  );
}
