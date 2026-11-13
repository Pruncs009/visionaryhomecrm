import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, Gauge } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { requireContext } from '@/features/auth/guards';
import { KpiReportView } from '@/features/kpi/components/kpi-report';
import { QuarterComparison, QuarterTabs } from '@/features/kpi/components/quarter-compare';
import { ReportTabs } from '@/features/kpi/components/report-tabs';
import { getKpiReport, getQuarterTabs, summarize, type KpiReport, type QuarterSummary } from '@/features/kpi/queries';
import { kpiSheetUrlFor } from '@/features/kpi/sheet-config';

export const metadata: Metadata = { title: 'KPI report' };
export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function KpiReportPage({ searchParams }: PageProps) {
  await requireContext();
  const sp = await searchParams;

  // The year shown: the current one if the sheet has tabs for it, else the latest year it has.
  const allTabs = await getQuarterTabs();
  const now = new Date();
  const years = [...new Set(allTabs.map((t) => t.year))].sort((a, b) => b - a);
  const year = years.includes(now.getFullYear()) ? now.getFullYear() : years[0];
  const tabs = allTabs.filter((t) => t.year === year);
  const thisQuarter = Math.floor(now.getMonth() / 3) + 1;
  const wanted = Number(sp.q);
  const fallback = tabs.find((t) => t.quarter === thisQuarter)?.quarter ?? Math.max(...tabs.map((t) => t.quarter));
  const quarter = tabs.some((t) => t.quarter === wanted) ? wanted : fallback;
  const tab = tabs.find((t) => t.quarter === quarter)!;

  // The selected quarter in full, plus every quarter's headline numbers for the comparison.
  const results = await Promise.all(tabs.map((t) => getKpiReport(t.gid).then((r) => ({ t, r }), (e: unknown) => ({ t, e }))));
  const selected = results.find((x) => x.t.gid === tab.gid)!;
  let report: KpiReport | null = null;
  let error: string | null = null;
  if ('r' in selected) report = selected.r;
  else {
    console.error('[kpi report]', selected.e);
    error = selected.e instanceof Error ? selected.e.message : 'Could not read the KPI sheet.';
  }
  const summaries: QuarterSummary[] = results.flatMap((x) => ('r' in x && x.r.sheet.metrics.length ? [summarize(x.r, x.t)] : []));

  const wk = report && report.currentWeek >= 0 ? report.sheet.weeks[report.currentWeek] : null;
  const first = report?.sheet.weeks[0];
  const last = report?.sheet.weeks.at(-1);
  const complete = report ? report.currentWeek + 1 >= report.sheet.weeks.length : false;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ReportTabs current="/reports/kpi" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">KPI report</h1>
            <QuarterTabs year={year} tabs={tabs} current={quarter} />
          </div>
          <p className="text-sm text-muted-foreground">
            Q{quarter} {year}
            {first && last ? ` · ${first.code}–${last.code} (${first.range.split('-')[0]} – ${last.range.split('-').at(-1)})` : ''}
            {wk ? (complete ? ' · full quarter' : ` · numbers through ${wk.code} (${wk.range})`) : ' · no numbers yet'} · live from the KPI sheet
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/kpi-dashboard" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Gauge /> KPI Dashboard
          </Link>
          <a href={kpiSheetUrlFor(tab.gid)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <ExternalLink /> Open Q{quarter} in the sheet
          </a>
        </div>
      </header>

      {report ? (
        <>
          <KpiReportView r={report} label={`Q${quarter}`}>
            {summaries.length > 1 && <QuarterComparison year={year} summaries={summaries} current={quarter} />}
          </KpiReportView>
        </>
      ) : (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
          <p className="font-medium">Couldn&apos;t load Q{quarter} from the KPI sheet</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{error}</p>
        </div>
      )}
    </div>
  );
}
