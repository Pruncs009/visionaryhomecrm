import { AlertTriangle, CheckCircle2, CircleDollarSign, Clock, Hourglass, Minus, Percent, TrendingDown, TrendingUp, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { fmt, fmtTarget, pct } from '../format';
import type { Standing } from '../parse';
import { findMetric, type KpiReport, type ScoredMetric } from '../queries';
import { WeeklyRevenueChart } from './weekly-revenue-chart';

// ----------------------------------------------------------------------------- small pieces
const STANDING: Record<Standing, { label: string; icon: LucideIcon; className: string }> = {
  ahead: { label: 'On target', icon: CheckCircle2, className: 'bg-success/10 text-success dark:bg-success/20 dark:text-green-400' },
  close: { label: 'Close', icon: AlertTriangle, className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  behind: { label: 'Behind', icon: XCircle, className: 'bg-critical/10 text-critical' },
  none: { label: 'Not scored', icon: Minus, className: 'bg-muted text-muted-foreground' },
};

export function StandingBadge({ s, className }: { s: Standing; className?: string }) {
  const { label, icon: Icon, className: tone } = STANDING[s];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', tone, className)}>
      <Icon className="size-3.5" aria-hidden /> {label}
    </span>
  );
}

/** Thin progress bar; optional tick where the value should be by now. */
function Progress({ value, marker, label }: { value: number; marker?: number | null; label: string }) {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  return (
    <div className="relative h-1.5 w-full rounded-full bg-muted" role="img" aria-label={label}>
      <div className="h-full rounded-full bg-(--chart-1)" style={{ width: `${clamp(value) * 100}%` }} />
      {marker !== null && marker !== undefined && (
        <div className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-foreground/70" style={{ left: `calc(${clamp(marker) * 100}% - 1px)` }} title="Where it should be by now" />
      )}
    </div>
  );
}

/** Weekly trend as a tiny line (hover shows the numbers). */
function Sparkline({ m, weeks }: { m: ScoredMetric; weeks: KpiReport['sheet']['weeks'] }) {
  const pts = m.weeks.map((w, i) => ({ i, v: w.num })).filter((p): p is { i: number; v: number } => p.v !== null);
  if (pts.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const W = 84;
  const H = 24;
  const n = Math.max(m.weeks.length - 1, 1);
  const vals = pts.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const y = (v: number) => (max === min ? H / 2 : H - 3 - ((v - min) / (max - min)) * (H - 6));
  const x = (i: number) => 2 + (i / n) * (W - 4);
  const last = pts[pts.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" role="img" aria-label={`${m.name} by week`}>
      <title>{pts.map((p) => `${weeks[p.i]?.code}: ${fmt(p.v, m.unit)}`).join('\n')}</title>
      <polyline points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r={3} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={1.5} />
    </svg>
  );
}

function Tile({ title, icon: Icon, value, children }: { title: string; icon: LucideIcon; value: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2 font-medium">
          <Icon className="size-4" aria-hidden /> {title}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------- report
export function KpiReportView({ r, label, children }: { r: KpiReport; /** "Q3" */ label: string; /** Shown after the headline numbers (the quarter comparison). */ children?: React.ReactNode }) {
  const wk = r.currentWeek >= 0 ? r.sheet.weeks[r.currentWeek] : null;
  const complete = r.currentWeek + 1 >= r.sheet.weeks.length;
  const rev = r.revenue;
  const profit = findMetric(r, /^net profit/i);

  const scored = r.metrics.filter((m) => m.week.ratio !== null);
  const attention = scored.filter((m) => m.week.standing === 'behind').sort((a, b) => a.week.ratio! - b.week.ratio!).slice(0, 6);
  const wins = scored.filter((m) => m.week.standing === 'ahead').sort((a, b) => b.week.ratio! - a.week.ratio!).slice(0, 5);

  const q = (re: RegExp) => findMetric(r, re)?.quarter?.actual ?? null;
  const flows = [
    {
      title: 'Seller leads (DM / PPC)',
      steps: [
        ['Gross leads', q(/^seller gross leads/i)],
        ['Qualified leads', q(/^seller qualified leads/i)],
        ['Appointments set', q(/^appointments set/i)],
        ['Contracts sent', q(/^contracts sent/i)],
        ['Contracts signed', q(/^contracts signed/i)],
      ] as [string, number | null][],
    },
    {
      title: 'Agent outreach',
      steps: [
        ['Addresses received', q(/^# of addresses/i)],
        ['Offers sent', q(/^offers sent/i)],
        ['Ratified contracts', q(/^ratified contract/i)],
      ] as [string, number | null][],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Headline numbers */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <Tile title={`Closed revenue ${label}${complete ? '' : ' to date'}`} icon={CircleDollarSign} value={fmt(rev.quarterActual, 'money')}>
          {rev.quarterActual !== null && rev.quarterTarget ? (
            <>
              <Progress value={rev.quarterActual / rev.quarterTarget} marker={rev.expectedByNow !== null ? rev.expectedByNow / rev.quarterTarget : null} label={`${pct(rev.quarterActual / rev.quarterTarget)} of the quarterly target`} />
              <p>
                {pct(rev.quarterActual / rev.quarterTarget)} of the {fmt(rev.quarterTarget, 'money', { compact: true })} quarterly target.
                {!complete && rev.expectedByNow !== null && wk && <> On pace would be {fmt(rev.expectedByNow, 'money', { compact: true })} by {wk.code}.</>}
              </p>
            </>
          ) : (
            <p>No quarterly target in the sheet.</p>
          )}
        </Tile>
        <Tile title={wk ? `Closed revenue ${wk.code} (${wk.range})` : 'Closed revenue last week'} icon={rev.latest !== null && rev.weeklyTarget !== null && rev.latest >= rev.weeklyTarget ? TrendingUp : TrendingDown} value={fmt(rev.latest, 'money')}>
          {rev.weeklyTarget !== null ? (
            <p className="flex flex-wrap items-center gap-2">
              <StandingBadge s={rev.latest !== null ? (rev.latest >= rev.weeklyTarget ? 'ahead' : rev.latest >= rev.weeklyTarget * 0.8 ? 'close' : 'behind') : 'none'} />
              {pct(rev.latest !== null ? rev.latest / rev.weeklyTarget : null)} of the {fmt(rev.weeklyTarget, 'money', { compact: true })} weekly target
            </p>
          ) : null}
        </Tile>
        <Tile title="Pending revenue" icon={Hourglass} value={fmt(r.pending.total, 'money')}>
          <p>
            {r.pending.deals.length} deals · {r.pending.bySource.map((s) => `${s.source} ${fmt(s.total, 'money', { compact: true })}`).join(' · ')}
          </p>
          {r.pending.undated > 0 && <p className="text-amber-700 dark:text-amber-300">{r.pending.undated} without a close date</p>}
        </Tile>
        <Tile title={profit?.unit === 'percent' ? 'Net profit margin' : 'Net profit'} icon={Percent} value={profit?.week.value ? fmt(profit.week.value.num, profit.unit) : '—'}>
          {profit && (
            <p className="flex flex-wrap items-center gap-2">
              <StandingBadge s={profit.week.standing} />
              Target {fmtTarget(profit.weeklyTarget, profit.unit)}
              {profit.quarter && <> · quarter {fmt(profit.quarter.actual, profit.unit)}</>}
            </p>
          )}
        </Tile>
      </div>

      {children}

      {/* Scorecard summary */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <span className="font-medium">
            Each metric&apos;s latest week against its weekly target:
          </span>
          {(['ahead', 'close', 'behind', 'none'] as Standing[]).map((s) => (
            <span key={s} className="flex items-center gap-2">
              <StandingBadge s={s} /> <span className="tabular-nums">{r.counts[s]}</span>
            </span>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Closed revenue by week</CardTitle>
            <CardDescription>Assignments, SDDC, DDC, wholetail, flips and development, against the weekly target</CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyRevenueChart weeks={rev.weekly} target={rev.weeklyTarget} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Highlights</CardTitle>
            <CardDescription>{wk ? `${wk.code}, latest week with numbers` : 'Latest week'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <InsightList title="Needs attention" items={attention} empty="Nothing is behind target." />
            <InsightList title="Going well" items={wins} empty="No metric is at target yet." />
          </CardContent>
        </Card>
      </div>

      {/* Deal flow this quarter */}
      <Card>
        <CardHeader>
          <CardTitle>Deal flow, {label}</CardTitle>
          <CardDescription>Quarter-to-date totals, from first lead to signed contract</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8 md:grid-cols-2">
          {flows.map((f) => {
            const top = Math.max(1, ...f.steps.map(([, v]) => v ?? 0));
            return (
              <div key={f.title} className="space-y-2.5">
                <h3 className="text-sm font-medium">{f.title}</h3>
                {f.steps.map(([label, v], i) => {
                  const prev = i > 0 ? f.steps[i - 1][1] : null;
                  return (
                    <div key={label} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <div className="h-2.5 rounded-full bg-muted">
                        <div className="h-full rounded-full bg-(--chart-1)" style={{ width: `${((v ?? 0) / top) * 100}%`, minWidth: v ? 4 : 0 }} />
                      </div>
                      <span className="w-24 text-right tabular-nums">
                        <span className="font-medium">{fmt(v, 'number')}</span>
                        {prev ? <span className="ml-1.5 text-xs text-muted-foreground">{pct((v ?? 0) / prev)}</span> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground md:col-span-2">The small percentage is the step-to-step conversion (e.g. qualified leads ÷ gross leads).</p>
        </CardContent>
      </Card>

      {/* Full scorecard */}
      <Card>
        <CardHeader>
          <CardTitle>Scorecard</CardTitle>
          <CardDescription>Every metric in the KPI sheet, by department</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Metric</th>
                <th className="py-2 pr-3 font-normal">Owner</th>
                <th className="py-2 pr-3 font-normal">Trend</th>
                <th className="py-2 pr-3 text-right font-normal">Latest</th>
                <th className="py-2 pr-3 text-right font-normal">Weekly target</th>
                <th className="py-2 pr-3 font-normal">This week</th>
                <th className="w-56 py-2 font-normal">Quarter to date</th>
              </tr>
            </thead>
            {r.sections.map((s) => (
              <tbody key={s.name}>
                <tr>
                  <th colSpan={7} className="pt-5 pb-1.5 text-left text-xs font-semibold tracking-wide uppercase">
                    {s.name}
                  </th>
                </tr>
                {s.metrics.map((m) => (
                  <tr key={m.id} className="border-b last:border-0 align-middle">
                    <td className="max-w-80 py-2 pr-3">
                      {m.name}
                      {m.lowerIsBetter && <span className="ml-1.5 text-xs text-muted-foreground">(lower is better)</span>}
                      {m.neutral && <span className="ml-1.5 text-xs text-muted-foreground">(budget)</span>}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{m.owner ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <Sparkline m={m} weeks={r.sheet.weeks} />
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">
                      {m.week.value ? (
                        <>
                          <span className="font-medium">{fmt(m.week.value.num, m.unit)}</span>
                          <span className="ml-1 text-xs text-muted-foreground">{r.sheet.weeks[m.week.index]?.code}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap text-muted-foreground tabular-nums">{fmtTarget(m.weeklyTarget, m.unit)}</td>
                    <td className="py-2 pr-3">
                      <StandingBadge s={m.week.standing} />
                    </td>
                    <td className="py-2">
                      {m.quarter ? (
                        <div className="space-y-1">
                          <div className="flex justify-between gap-2 text-xs tabular-nums">
                            <span>
                              <span className="font-medium">{fmt(m.quarter.actual, m.unit, { compact: true })}</span>
                              <span className="text-muted-foreground"> / {fmt(m.quarter.target, m.unit, { compact: true })}</span>
                            </span>
                            {m.neutral ? (
                              <span className="text-muted-foreground">{pct(m.quarter.share)} used</span>
                            ) : (
                              <span className={cn('font-medium', m.quarter.standing === 'behind' ? 'text-critical' : m.quarter.standing === 'ahead' ? 'text-success' : 'text-amber-700 dark:text-amber-300')}>
                                {m.quarter.cumulative ? `${pct(m.quarter.ratio)} of pace` : pct(m.quarter.ratio)}
                              </span>
                            )}
                          </div>
                          {m.quarter.cumulative && m.quarter.share !== null && (
                            <Progress value={m.quarter.share} marker={r.currentWeek >= 0 ? (r.currentWeek + 1) / r.sheet.weeks.length : null} label={`${pct(m.quarter.share)} of the quarterly target`} />
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </CardContent>
      </Card>

      {/* Pending revenue */}
      <Card>
        <CardHeader>
          <CardTitle>Pending revenue</CardTitle>
          <CardDescription>{r.sheet.pendingNote ?? 'Deals expected to close'}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Property</th>
                <th className="py-2 pr-3 font-normal">Source</th>
                <th className="py-2 pr-3 text-right font-normal">Pending revenue</th>
                <th className="py-2 font-normal">Close date</th>
              </tr>
            </thead>
            <tbody>
              {[...r.pending.deals]
                .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
                .map((d) => (
                  <tr key={`${d.address}-${d.source}`} className="border-b last:border-0">
                    <td className="py-2 pr-3">{d.address}</td>
                    <td className="py-2 pr-3">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{d.source || '—'}</span>
                    </td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">{fmt(d.revenue, 'money')}</td>
                    <td className="py-2">
                      {d.closeDate ?? (
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                          <Clock className="size-3.5" aria-hidden /> Not set
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium">
                <td className="pt-2 pr-3">Total · {r.pending.deals.length} deals</td>
                <td />
                <td className="pt-2 pr-3 text-right tabular-nums">{fmt(r.pending.total, 'money')}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <strong>How the status works:</strong> each metric&apos;s latest week is compared with its weekly target: On target at 100% or better, Close at 80–99%,
        Behind below 80%. For &quot;lower is better&quot; metrics (speed, cycle time, commission paid, pipeline size) a lower number counts as better. Budgets (marketing spend) are shown but not scored.
        Quarter totals are compared with where they should be by now (the quarterly target spread evenly over the {r.sheet.weeks.length} weeks).
      </p>
    </div>
  );
}

function InsightList({ title, items, empty }: { title: string; items: ScoredMetric[]; empty: string }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate" title={m.name}>{m.name}</span>
                <span className="text-xs text-muted-foreground">
                  {fmt(m.week.value?.num, m.unit)} vs {fmtTarget(m.weeklyTarget, m.unit)}
                  {m.owner ? ` · ${m.owner}` : ''}
                </span>
              </span>
              <StandingBadge s={m.week.standing} className="shrink-0" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
