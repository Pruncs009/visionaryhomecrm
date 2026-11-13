import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { fmt } from '../format';
import { COMPARISON_ROWS, type QuarterSummary, type QuarterTab } from '../queries';

/** Q1 · Q2 · Q3 · Q4 tabs for the KPI report (?q=1…4). Quarters without a tab are disabled. */
export function QuarterTabs({ year, tabs, current }: { year: number; tabs: QuarterTab[]; current: number }) {
  return (
    <div role="tablist" aria-label={`Quarters of ${year}`} className="inline-flex rounded-lg bg-muted p-0.5">
      {[1, 2, 3, 4].map((q) => {
        const tab = tabs.find((t) => t.quarter === q && t.year === year);
        const selected = q === current;
        const cls = cn(
          'rounded-md px-3 py-1 text-sm font-medium transition-colors',
          selected ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          !tab && 'pointer-events-none opacity-40',
        );
        return tab ? (
          <Link key={q} href={`/reports/kpi?q=${q}`} role="tab" aria-selected={selected} className={cls} scroll={false}>
            Q{q}
          </Link>
        ) : (
          <span key={q} role="tab" aria-selected={false} aria-disabled className={cls} title={`No "Q${q} - ${year}" tab in the sheet`}>
            Q{q}
          </span>
        );
      })}
    </div>
  );
}

/** Each quarter's headline numbers side by side; the change column compares the selected quarter with the one before. */
export function QuarterComparison({ year, summaries, current }: { year: number; summaries: QuarterSummary[]; current: number }) {
  const cols = [1, 2, 3, 4].map((q) => summaries.find((s) => s.quarter === q) ?? null);
  const cur = cols[current - 1];
  const prev = current > 1 ? cols[current - 2] : null;
  // A quarter still in progress is compared per week, so 6 weeks aren't measured against 13.
  const perWeek = !!cur && !!prev && cur.weeksIn > 0 && cur.weeksIn < cur.weeksTotal;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quarter by quarter, {year}</CardTitle>
        <CardDescription>
          Quarter totals from each tab of the KPI sheet. {prev ? `The last column compares Q${current} with Q${current - 1}` : ''}
          {perWeek && cur ? `, per week, because Q${current} is in progress (${cur.weeksIn} of ${cur.weeksTotal} weeks entered).` : prev ? '.' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Metric</th>
              {cols.map((c, i) => (
                <th key={i} className={cn('py-2 pr-3 text-right font-normal', i + 1 === current && 'font-semibold text-foreground')}>
                  Q{i + 1}
                  {c && c.weeksIn > 0 && c.weeksIn < c.weeksTotal && <span className="ml-1 font-normal text-muted-foreground">(to date)</span>}
                </th>
              ))}
              {prev && (
                <th className="py-2 text-right font-normal">
                  Q{current} vs Q{current - 1}
                  {perWeek && <span className="block text-[11px]">per week</span>}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row) => {
              // Totals become weekly rates while the quarter is in progress; rates, averages and targets compare as they are.
              const asRate = perWeek && !['percent'].includes(row.unit) && !['target', 'bump'].includes(row.key);
              const norm = (v: number | null, s: QuarterSummary | null) => (v === null || !s ? null : asRate ? v / Math.max(1, s.weeksIn) : v);
              const a = norm(cur?.rows[row.key] ?? null, cur);
              const b = norm(prev?.rows[row.key] ?? null, prev);
              // Revenue vs target isn't comparable mid-quarter (the target is for the full quarter).
              const skip = perWeek && row.key === 'attainment';
              const delta = skip || a === null || b === null ? null : row.unit === 'percent' ? a - b : b !== 0 ? (a - b) / Math.abs(b) : null;
              // Spend going up isn't "good" or "bad" by itself; keep it neutral.
              const neutral = row.key === 'dm' || row.key === 'ppc' || row.key === 'target';
              return (
                <tr key={row.key} className="border-b last:border-0">
                  <td className="py-2 pr-3">{row.label}</td>
                  {cols.map((c, i) => (
                    <td key={i} className={cn('py-2 pr-3 text-right tabular-nums', i + 1 === current ? 'bg-muted/50 font-medium' : 'text-muted-foreground')}>
                      {c ? fmt(c.rows[row.key], row.unit, { compact: row.unit === 'money' }) : '—'}
                    </td>
                  ))}
                  {prev && (
                    <td className={cn('py-2 text-right text-xs font-medium tabular-nums', delta === null || neutral ? 'text-muted-foreground' : delta >= 0 ? 'text-success dark:text-green-400' : 'text-critical')}>
                      {delta === null ? '—' : row.unit === 'percent' ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pts` : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(delta * 100))}%`}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
