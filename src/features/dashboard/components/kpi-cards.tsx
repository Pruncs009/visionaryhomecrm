import { Handshake, KeyRound, Signpost, UserPlus } from 'lucide-react';
import { getKpis } from '../queries';
import type { DashboardScope } from '../types';
import { StatCard } from './stat-card';
import { WidgetError } from './widget-states';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Leads Today · Active Buyers · Active Sellers · Closed Transactions */
export async function KpiCards({ scope }: { scope: DashboardScope }) {
  let k;
  try {
    k = await getKpis(scope);
  } catch (error) {
    console.error('[dashboard] KPIs failed', error);
    return <WidgetError title="Key metrics" />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard title="Leads today" value={k.leadsToday} icon={UserPlus} href="/leads">
        {plural(k.leadsYesterday, 'lead')} yesterday
      </StatCard>
      <StatCard
        title="Active buyers"
        value={k.buyersActive + k.buyersUnderContract}
        icon={KeyRound}
        href="/buyers"
      >
        {k.buyersActive} searching · {k.buyersUnderContract} under contract
      </StatCard>
      <StatCard
        title="Active sellers"
        value={k.sellersListed + k.sellersUnderContract}
        icon={Signpost}
        href="/sellers"
      >
        {k.sellersListed} listed · {k.sellersUnderContract} under contract
      </StatCard>
      <StatCard title="Closed this month" value={k.closedThisMonth} icon={Handshake} href="/transactions">
        {plural(k.closedLastMonth, 'closing')} last month
      </StatCard>
    </div>
  );
}
