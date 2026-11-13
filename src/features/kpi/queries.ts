import 'server-only';
import { kpiCsvUrl } from './sheet-config';
import {
  attainment,
  lastWeekIndex,
  parseKpiSheet,
  quarterStanding,
  standing,
  weekStanding,
  type KpiSheet,
  type Metric,
  type PendingDeal,
  type Standing,
} from './parse';

export type ScoredMetric = Metric & {
  week: ReturnType<typeof weekStanding>;
  quarter: ReturnType<typeof quarterStanding>;
};

export type KpiReport = {
  sheet: KpiSheet;
  /** Latest week with numbers in it (index into sheet.weeks). */
  currentWeek: number;
  metrics: ScoredMetric[];
  sections: { name: string; metrics: ScoredMetric[] }[];
  revenue: {
    weekly: { code: string; range: string; value: number | null }[];
    weeklyTarget: number | null;
    quarterActual: number | null;
    quarterTarget: number | null;
    /** Where revenue should be by now at the quarterly target's pace. */
    expectedByNow: number | null;
    latest: number | null;
  };
  pending: { deals: PendingDeal[]; total: number; bySource: { source: string; count: number; total: number }[]; undated: number };
  counts: Record<Standing, number>;
  fetchedAt: string;
};

const sumOrNull = (xs: (number | null)[]) => (xs.some((x) => x !== null) ? xs.reduce<number>((a, b) => a + (b ?? 0), 0) : null);

export async function getKpiReport(): Promise<KpiReport> {
  // The sheet is viewable by anyone with the link, so its CSV export needs no sign-in.
  // Re-read at most once a minute.
  const res = await fetch(kpiCsvUrl, { next: { revalidate: 60 } });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.includes('text/csv')) {
    throw new Error(
      res.status === 401 || res.status === 403 || type.includes('text/html')
        ? 'The CRM can’t read the KPI sheet. In Google Sheets, set Share → General access to “Anyone with the link” (Viewer).'
        : `Google Sheets returned an error (${res.status}).`,
    );
  }
  const sheet = parseKpiSheet(await res.text());

  // The current week: the latest week the revenue rows (or, failing that, any row) have numbers for.
  const revenueRows = sheet.metrics.filter((m) => /^closed revenue/i.test(m.name));
  const currentWeek = Math.max(-1, ...(revenueRows.length ? revenueRows : sheet.metrics).map(lastWeekIndex));
  const weeksElapsed = currentWeek + 1;
  const weeksInQuarter = sheet.weeks.length || 13;

  const metrics: ScoredMetric[] = sheet.metrics.map((m) => ({
    ...m,
    week: weekStanding(m),
    quarter: weeksElapsed > 0 ? quarterStanding(m, weeksElapsed, weeksInQuarter) : null,
  }));

  const sections: KpiReport['sections'] = [];
  for (const m of metrics) {
    const last = sections[sections.length - 1];
    if (last && last.name === m.section) last.metrics.push(m);
    else sections.push({ name: m.section, metrics: [m] });
  }

  // Revenue: all "Closed Revenue …" rows together.
  const weekly = sheet.weeks.map((w, i) => ({ ...w, value: sumOrNull(revenueRows.map((m) => m.weeks[i]?.num ?? null)) }));
  const quarterTarget = sumOrNull(revenueRows.map((m) => m.quarterTarget.num));
  const quarterActual = sumOrNull(revenueRows.map((m) => m.quarterActual.num ?? sumOrNull(m.weeks.map((w) => w.num))));

  const deals = sheet.pending;
  const bySource = new Map<string, { count: number; total: number }>();
  for (const d of deals) {
    const s = bySource.get(d.source || 'Other') ?? { count: 0, total: 0 };
    s.count += 1;
    s.total += d.revenue ?? 0;
    bySource.set(d.source || 'Other', s);
  }

  const counts: Record<Standing, number> = { ahead: 0, close: 0, behind: 0, none: 0 };
  for (const m of metrics) counts[m.week.standing] += 1;

  return {
    sheet,
    currentWeek,
    metrics,
    sections,
    revenue: {
      weekly,
      weeklyTarget: sumOrNull(revenueRows.map((m) => m.weeklyTarget.num)),
      quarterActual,
      quarterTarget,
      expectedByNow: quarterTarget !== null && weeksElapsed > 0 ? (quarterTarget * weeksElapsed) / weeksInQuarter : null,
      latest: currentWeek >= 0 ? weekly[currentWeek].value : null,
    },
    pending: {
      deals,
      total: deals.reduce((a, d) => a + (d.revenue ?? 0), 0),
      bySource: [...bySource.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.total - a.total),
      undated: deals.filter((d) => !d.closeDate).length,
    },
    counts,
    fetchedAt: new Date().toISOString(),
  };
}

/** Find a metric by name (first match), e.g. find(report, /contracts signed/i). */
export const findMetric = (r: KpiReport, re: RegExp) => r.metrics.find((m) => re.test(m.name));

export { attainment, standing };
