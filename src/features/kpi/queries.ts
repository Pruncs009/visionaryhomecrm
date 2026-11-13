import 'server-only';
import { FALLBACK_QUARTER_TABS, kpiCsvUrlFor, kpiTabsUrl } from './sheet-config';
import {
  attainment,
  lastWeekIndex,
  parseKpiSheet,
  quarterActual as quarterActualOf,
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

export type QuarterTab = { quarter: number; year: number; gid: string };

/**
 * The sheet's quarter tabs ("Q1 - 2026", "Q4 - 2025 | NEW" …), read from Google's
 * public tab list so new quarters appear without a code change.
 */
export async function getQuarterTabs(): Promise<QuarterTab[]> {
  try {
    const res = await fetch(kpiTabsUrl, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(String(res.status));
    const html = await res.text();
    const tabs: QuarterTab[] = [];
    for (const m of html.matchAll(/\{name: "Q([1-4])\s*-\s*(\d{4})([^"]*)",[^}]*?gid: "(\d+)"/g)) {
      // Skip side tabs such as "Q4 - 2026 (GNAAC FUNNEL)".
      if (/\(/.test(m[3])) continue;
      tabs.push({ quarter: Number(m[1]), year: Number(m[2]), gid: m[4] });
    }
    if (tabs.length) return tabs;
  } catch (e) {
    console.error('[kpi] tab list', e);
  }
  return FALLBACK_QUARTER_TABS;
}

export async function getKpiReport(gid: string): Promise<KpiReport> {
  // The sheet is viewable by anyone with the link, so its CSV export needs no sign-in.
  // Re-read at most once a minute.
  const res = await fetch(kpiCsvUrlFor(gid), { next: { revalidate: 60 } });
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

/** Headline numbers of one quarter, for the side-by-side comparison. */
export type QuarterSummary = {
  quarter: number;
  year: number;
  /** Weeks with revenue entered / weeks in the quarter. */
  weeksIn: number;
  weeksTotal: number;
  rows: Record<string, number | null>;
};

export const COMPARISON_ROWS: { key: string; label: string; unit: 'money' | 'percent' | 'number'; match?: RegExp; lowerIsBetter?: boolean }[] = [
  { key: 'revenue', label: 'Closed revenue', unit: 'money' },
  { key: 'target', label: 'Revenue target', unit: 'money' },
  { key: 'attainment', label: 'Revenue vs target', unit: 'percent' },
  // The sheet tracked net profit in $ (Q1–Q2 2026) and later as a margin %; keep them apart.
  { key: 'profitUsd', label: 'Net profit ($)', unit: 'money', match: /^net profit/i },
  { key: 'profit', label: 'Net profit margin', unit: 'percent', match: /^net profit/i },
  { key: 'gross', label: 'Seller gross leads', unit: 'number', match: /^seller gross leads/i },
  { key: 'qualified', label: 'Seller qualified leads', unit: 'number', match: /^seller qualified leads/i },
  { key: 'appts', label: 'Appointments set', unit: 'number', match: /^appointments set/i },
  { key: 'sent', label: 'Contracts sent', unit: 'number', match: /^contracts sent/i },
  { key: 'signed', label: 'Contracts signed', unit: 'number', match: /^contracts signed/i },
  { key: 'ratified', label: 'Ratified contracts (agent outreach)', unit: 'number', match: /^ratified contract/i },
  { key: 'closings', label: 'Net closings', unit: 'number', match: /^net closings/i },
  { key: 'bump', label: 'Average price bump', unit: 'money', match: /^average price bump/i },
  { key: 'dm', label: 'DM spend', unit: 'money', match: /^amount spent dm/i },
  { key: 'ppc', label: 'PPC spend', unit: 'money', match: /^amount spent ppc/i },
];

export function summarize(r: KpiReport, tab: QuarterTab): QuarterSummary {
  const rows: Record<string, number | null> = {
    revenue: r.revenue.quarterActual,
    target: r.revenue.quarterTarget,
    attainment: r.revenue.quarterActual !== null && r.revenue.quarterTarget ? (r.revenue.quarterActual / r.revenue.quarterTarget) * 100 : null,
  };
  for (const row of COMPARISON_ROWS) {
    if (!row.match) continue;
    // Only a metric kept in the row's unit (a $ number never lands in a % row).
    const m = r.metrics.find((x) => row.match!.test(x.name) && (x.unit === row.unit || (x.unit === 'number' && row.unit !== 'percent')));
    rows[row.key] = m ? quarterActualOf(m) : null;
  }
  return { quarter: tab.quarter, year: tab.year, weeksIn: r.currentWeek + 1, weeksTotal: r.sheet.weeks.length, rows };
}

/** Find a metric by name (first match), e.g. find(report, /contracts signed/i). */
export const findMetric = (r: KpiReport, re: RegExp) => r.metrics.find((m) => re.test(m.name));

export { attainment, standing };
