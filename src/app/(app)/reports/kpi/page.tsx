import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, Gauge } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { requireContext } from '@/features/auth/guards';
import { KpiReportView } from '@/features/kpi/components/kpi-report';
import { ReportTabs } from '@/features/kpi/components/report-tabs';
import { getKpiReport, type KpiReport } from '@/features/kpi/queries';
import { kpiSheetUrl } from '@/features/kpi/sheet-config';

export const metadata: Metadata = { title: 'KPI report' };
export const dynamic = 'force-dynamic';

export default async function KpiReportPage() {
  await requireContext();
  let report: KpiReport | null = null;
  let error: string | null = null;
  try {
    report = await getKpiReport();
  } catch (e) {
    console.error('[kpi report]', e);
    error = e instanceof Error ? e.message : 'Could not read the KPI sheet.';
  }
  const wk = report && report.currentWeek >= 0 ? report.sheet.weeks[report.currentWeek] : null;
  const first = report?.sheet.weeks[0];
  const last = report?.sheet.weeks.at(-1);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ReportTabs current="/reports/kpi" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">KPI report</h1>
          <p className="text-sm text-muted-foreground">
            {first && last ? `Quarter ${first.code}–${last.code} (${first.range.split('-')[0]} – ${last.range.split('-').at(-1)})` : 'KPI sheet'}
            {wk ? ` · numbers through ${wk.code} (${wk.range})` : ''} · live from the KPI Dashboard sheet
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/kpi-dashboard" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Gauge /> KPI Dashboard
          </Link>
          <a href={kpiSheetUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <ExternalLink /> Open the sheet
          </a>
        </div>
      </header>

      {report ? (
        <KpiReportView r={report} />
      ) : (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
          <p className="font-medium">Couldn&apos;t load the KPI sheet</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{error}</p>
        </div>
      )}
    </div>
  );
}
