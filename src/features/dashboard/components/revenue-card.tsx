import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn, formatCurrency } from '@/lib/utils';
import { getRevenue } from '../queries';
import type { DashboardScope } from '../types';
import { RevenueChart } from './revenue-chart';
import { WidgetError } from './widget-states';

export async function RevenueCard({ scope, className }: { scope: DashboardScope; className?: string }) {
  let r;
  try {
    r = await getRevenue(scope);
  } catch (error) {
    console.error('[dashboard] revenue failed', error);
    return <WidgetError title="Revenue" className={className} />;
  }

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Revenue</CardTitle>
        <CardDescription>Gross commission income (GCI) from closed deals, last 12 months</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <p className="text-xs text-muted-foreground">GCI year to date</p>
            <p className="text-3xl font-semibold tracking-tight">{formatCurrency(r.ytdCommission)}</p>
          </div>
          <Separator orientation="vertical" className="hidden h-10 sm:block" />
          <Metric label="Closed volume YTD" value={formatCurrency(r.ytdVolume, { compact: true })} />
          <Metric
            label={`Pending GCI · ${r.pendingDeals} in escrow`}
            value={formatCurrency(r.pendingCommission, { compact: true })}
          />
        </div>
        <RevenueChart data={r.months} />
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
