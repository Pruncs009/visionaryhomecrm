/**
 * Turns the KPI sheet (CSV export of the weekly scorecard tab) into report data.
 *
 * Layout of the tab:
 *   row "Week Tracking" ……… date range per week column
 *   row  "" | W40 … W52 | Metric Type | Weekly Target | Monthly Actual | Monthly Target |
 *        Quarterly Actual | Quarterly Target | Status | Metric Owner | Metric Source | Notes
 *   "Address | Source | Pending Revenue | Close Date" … pending deals … "Visionary Metrics"
 *   then sections (a name alone on its row) followed by their metric rows.
 */

export type Unit = 'money' | 'percent' | 'duration' | 'number';
export type Cmp = '<' | '<=' | '>' | '>=' | null;
export type Value = { raw: string; num: number | null; unit: Unit | null; cmp: Cmp };

export type Metric = {
  id: string;
  section: string;
  name: string;
  unit: Unit;
  /** One entry per week column (null = not filled in). */
  weeks: Value[];
  kind: 'Total' | 'Avg' | null;
  weeklyTarget: Value;
  monthlyActual: Value;
  monthlyTarget: Value;
  quarterActual: Value;
  quarterTarget: Value;
  status: string | null;
  owner: string | null;
  source: string | null;
  notes: string | null;
  lowerIsBetter: boolean;
  /** Budgets and projections: shown, but not scored as ahead/behind. */
  neutral: boolean;
};

export type PendingDeal = { address: string; source: string; revenue: number | null; closeDate: string | null };

export type KpiSheet = {
  weeks: { code: string; range: string }[];
  metrics: Metric[];
  pending: PendingDeal[];
  pendingNote: string | null;
};

// ----------------------------------------------------------------------------- CSV
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ----------------------------------------------------------------------------- values
const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export function parseValue(raw: string | undefined): Value {
  const s = clean(raw);
  const empty = { raw: s, num: null, unit: null, cmp: null } satisfies Value;
  if (!s || s === '-' || /^\?+$/.test(s) || /^select status$/i.test(s)) return empty;
  const m = /^(<=|>=|<|>)?\s*(.*)$/.exec(s)!;
  const cmp = (m[1] as Cmp) ?? null;
  const body = m[2];
  // h:mm:ss or h:mm → minutes
  const t = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(body);
  if (t) return { raw: s, num: Number(t[1]) * 60 + Number(t[2]) + Number(t[3] ?? 0) / 60, unit: 'duration', cmp };
  const unit: Unit = body.includes('$') ? 'money' : body.endsWith('%') ? 'percent' : 'number';
  const n = Number(body.replace(/[$,%\s]/g, ''));
  if (!Number.isFinite(n) || body.replace(/[$,%\s.\d-]/g, '') !== '') return { ...empty, cmp };
  return { raw: s, num: n, unit, cmp };
}

/** Lower numbers are better for time, cost and backlog style metrics. */
const LOWER_IS_BETTER = /speed|cycle|lost deals|commission paid|active properties|contract sent \(2 days\)/i;
/** Spend against a budget isn't "behind" when it's lower, nor is a projection. */
const NEUTRAL = /amount spent|projected profit/i;

// ----------------------------------------------------------------------------- sheet
export function parseKpiSheet(csv: string): KpiSheet {
  const rows = parseCsv(csv).map((r) => r.map((c) => c ?? ''));
  const headerIdx = rows.findIndex((r) => r.some((c) => /^W\d+$/.test(clean(c))));
  if (headerIdx < 0) throw new Error('The KPI sheet layout changed: no week columns (W40, W41, …) found.');
  const header = rows[headerIdx].map(clean);
  const weekCols = header.flatMap((c, i) => (/^W\d+$/.test(c) ? [i] : []));
  const col = (re: RegExp) => header.findIndex((c) => re.test(c));
  const C = {
    kind: col(/^metric type$/i),
    weeklyTarget: col(/^weekly target$/i),
    monthlyActual: col(/^monthly actual$/i),
    monthlyTarget: col(/^monthly target$/i),
    quarterActual: col(/^quarterly actual$/i),
    quarterTarget: col(/^quarterly target$/i),
    status: col(/^status$/i),
    owner: col(/^metric owner$/i),
    source: col(/^metric source$/i),
    notes: col(/^notes$/i),
  };
  const ranges = rows.slice(0, headerIdx).find((r) => /week/i.test(clean(r[0]))) ?? [];
  const weeks = weekCols.map((i) => ({ code: header[i], range: clean(ranges[i]) }));
  const at = (r: string[], i: number) => (i >= 0 ? clean(r[i]) : '');

  const pending: PendingDeal[] = [];
  let pendingNote: string | null = null;
  const metrics: Metric[] = [];
  let mode: 'top' | 'pending' | 'metrics' = 'top';
  let section = 'Revenue & Profit';

  for (const r of rows.slice(headerIdx + 1)) {
    const first = clean(r[0]);
    const rest = r.slice(1).map(clean);
    const restEmpty = rest.every((c) => !c);
    if (!first && restEmpty) continue;

    if (/^address$/i.test(first)) {
      mode = 'pending';
      continue;
    }
    if (/^visionary metrics$/i.test(first)) {
      mode = 'metrics';
      continue;
    }
    if (mode === 'pending') {
      const v = parseValue(r[2]);
      pending.push({ address: first.replace(/,$/, ''), source: clean(r[1]).toUpperCase(), revenue: v.num, closeDate: /^\?+$/.test(clean(r[3])) || !clean(r[3]) ? null : clean(r[3]) });
      continue;
    }
    if (mode !== 'metrics') continue;
    if (/^pending rev/i.test(first)) {
      pendingNote = first;
      continue;
    }
    if (restEmpty) {
      section = first.replace(/\s+/g, ' ');
      continue;
    }

    const weekVals = weekCols.map((i) => parseValue(r[i]));
    const weeklyTarget = parseValue(r[C.weeklyTarget]);
    const unit: Unit =
      weekVals.find((v) => v.unit && v.unit !== 'number')?.unit ??
      (weeklyTarget.unit && weeklyTarget.unit !== 'number' ? weeklyTarget.unit : null) ??
      'number';
    // "100" in a 100%-target row means 100%.
    const weeks = weekVals.map((v) => (unit === 'percent' && v.unit === 'number' ? { ...v, unit: 'percent' as Unit } : v));
    const kind = at(r, C.kind);
    metrics.push({
      id: `${metrics.length}`,
      section,
      name: first.replace(/\s*\?\s*$/, '').trim(),
      unit,
      weeks,
      kind: kind === 'Total' || kind === 'Avg' ? kind : null,
      weeklyTarget,
      monthlyActual: parseValue(r[C.monthlyActual]),
      monthlyTarget: parseValue(r[C.monthlyTarget]),
      quarterActual: parseValue(r[C.quarterActual]),
      quarterTarget: parseValue(r[C.quarterTarget]),
      status: at(r, C.status) && !/^select status$/i.test(at(r, C.status)) ? at(r, C.status) : null,
      owner: at(r, C.owner) || null,
      source: at(r, C.source) || null,
      notes: at(r, C.notes) || null,
      lowerIsBetter: weeklyTarget.cmp === '<' || weeklyTarget.cmp === '<=' || LOWER_IS_BETTER.test(first),
      neutral: NEUTRAL.test(first),
    });
  }
  return { weeks, metrics, pending, pendingNote };
}

// ----------------------------------------------------------------------------- scoring
export type Standing = 'ahead' | 'close' | 'behind' | 'none';

/** Index of the last week with a number in it (-1 if none). */
export const lastWeekIndex = (m: Metric) => {
  for (let i = m.weeks.length - 1; i >= 0; i--) if (m.weeks[i].num !== null) return i;
  return -1;
};

/** How a value stands against a target: 1 = exactly on target, >1 = better. */
export function attainment(value: number | null, target: number | null, lowerIsBetter: boolean): number | null {
  if (value === null || target === null) return null;
  if (lowerIsBetter) return value <= 0 ? 1 : target / value;
  if (target <= 0) return null;
  return value / target;
}

export function standing(ratio: number | null): Standing {
  if (ratio === null) return 'none';
  if (ratio >= 1) return 'ahead';
  if (ratio >= 0.8) return 'close';
  return 'behind';
}

/** The latest week's value against the weekly target. */
export function weekStanding(m: Metric): { index: number; value: Value | null; ratio: number | null; standing: Standing } {
  const index = lastWeekIndex(m);
  const value = index >= 0 ? m.weeks[index] : null;
  const ratio = m.neutral ? null : attainment(value?.num ?? null, m.weeklyTarget.num, m.lowerIsBetter);
  return { index, value, ratio, standing: standing(ratio) };
}

/**
 * Is the quarterly target a running total (weekly × ~13) rather than a rate?
 * e.g. Contracts Sent 10/week → 120/quarter is cumulative; Answer Rate 80% → 80% is not.
 */
export function isCumulative(m: Metric): boolean {
  if (m.unit === 'percent' || m.unit === 'duration') return false;
  const w = m.weeklyTarget.num;
  const q = m.quarterTarget.num;
  if (w !== null && q !== null && w > 0) return q >= w * 4;
  return m.kind === 'Total';
}

/** Quarter-to-date number: the sheet's quarterly cell, or the weeks added up (or averaged for rates). */
export function quarterActual(m: Metric): number | null {
  if (m.quarterActual.num !== null) return m.quarterActual.num;
  const nums = m.weeks.map((w) => w.num).filter((n): n is number => n !== null);
  if (!nums.length) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return isCumulative(m) ? sum : sum / nums.length;
}

/**
 * Quarter progress. Running totals are compared with where they should be by now
 * (target × weeks elapsed / weeks in the quarter); rates with the target itself.
 */
export function quarterStanding(m: Metric, weeksElapsed: number, weeksInQuarter: number) {
  const actual = quarterActual(m);
  const target = m.quarterTarget.num;
  if (actual === null || target === null || target <= 0) return null;
  const cumulative = isCumulative(m);
  const expected = cumulative ? (target * weeksElapsed) / weeksInQuarter : target;
  const ratio = m.neutral ? null : attainment(actual, expected, m.lowerIsBetter);
  return { actual, target, cumulative, share: cumulative ? actual / target : null, ratio, standing: standing(ratio) };
}
