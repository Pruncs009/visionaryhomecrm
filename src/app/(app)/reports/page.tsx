import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireContext } from '@/features/auth/guards';
import {
  AgentPerformanceChart,
  ClosingRateChart,
  ConversionFunnelChart,
  LeadSourcesChart,
  MonthlyTransactionsChart,
  RevenueTrendChart,
} from '@/features/analytics/components/charts';
import { KpiRow } from '@/features/analytics/components/kpi-row';
import { ReportFilters } from '@/features/analytics/components/report-filters';
import { getAnalyticsReport, parseRange } from '@/features/analytics/queries';
import { RANGE_OPTIONS } from '@/features/analytics/types';
import { CardSkeleton, KpiSkeleton, WidgetError } from '@/features/dashboard/components/widget-states';
import { getTeamMembers } from '@/features/leads/queries';
import { isValidTimeZone } from '@/lib/dates';

export const metadata: Metadata = { title: 'Reports' };

const FALLBACK_TZ = 'America/New_York';
type PageProps = { searchParams: Promise<{ range?: string; agent?: string }> };

export default async function ReportsPage({ searchParams }: PageProps) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const timezone = isValidTimeZone(ctx.profile?.timezone) ? ctx.profile!.timezone : FALLBACK_TZ;
  const range = parseRange(sp.range);

  const members = await getTeamMembers(ctx.organization.id);
  // Only accept an agent id that is actually on this team.
  const agent = members.some((m) => m.userId === sp.agent) ? sp.agent : undefined;
  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === range)!.label;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            {rangeLabel} · {agent ? members.find((m) => m.userId === agent)!.name : ctx.organization.name}
          </p>
        </div>
        <ReportFilters range={range} agent={agent} agents={members.map((m) => ({ id: m.userId, name: m.name }))} />
      </header>

      {/* key: show the skeleton again whenever the filters change */}
      <Suspense key={`${range}:${agent ?? 'all'}`} fallback={<ReportSkeleton />}>
        <Report orgId={ctx.organization.id} range={range} agent={agent} timezone={timezone} />
      </Suspense>
    </div>
  );
}

async function Report(props: { orgId: string; range: ReturnType<typeof parseRange>; agent?: string; timezone: string }) {
  let report;
  try {
    report = await getAnalyticsReport({ orgId: props.orgId, range: props.range, agentId: props.agent, timezone: props.timezone });
  } catch (error) {
    console.error('[reports] analytics_report failed', error);
    return <WidgetError title="Reports" />;
  }

  return (
    <div className="space-y-4">
      <KpiRow k={report.kpis} />
      <div className="grid gap-4 lg:grid-cols-2">
        <RevenueTrendChart data={report.monthly} />
        <MonthlyTransactionsChart data={report.monthly} />
        <LeadSourcesChart data={report.sources} />
        <ConversionFunnelChart data={report.funnel} />
        <ClosingRateChart data={report.monthly} />
        <AgentPerformanceChart data={report.agents} />
      </div>
      <p className="text-xs text-muted-foreground">
        Lead charts and KPI tiles cover the selected period. Revenue, transactions and closing rate always show the last 12 months.
        GCI uses the commission amount, or price × commission rate when no amount is set.
      </p>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <KpiSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} rows={5} />
        ))}
      </div>
    </div>
  );
}
