'use client';

/**
 * The six Reports charts (Recharts via shadcn's ChartContainer).
 *
 * Conventions (validated palette in globals.css):
 *  - single-series charts use --chart-1 and no legend (the card title names it)
 *  - the one multi-series chart (closings by side) uses slots 1–3 in fixed order,
 *    a legend, and a 2px card-colored gap between stacked segments
 *  - thin bars with 4px rounded data-ends, 2px lines, ≥8px markers
 *  - every chart has a hover tooltip and a table twin (see ChartCard)
 *  - text (labels, values) is always ink, never the series color
 */

import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { formatCurrency } from '@/lib/utils';
import type { AgentRow, FunnelRow, MonthRow, SourceRow } from '../types';
import { ChartCard, DataTable } from './chart-card';

const pct = (v: number | null, digits = 0) => (v === null ? '—' : `${(v * 100).toFixed(digits)}%`);
const money = (v: number) => formatCurrency(v);
const moneyShort = (v: number) => formatCurrency(v, { compact: true });

// -----------------------------------------------------------------------------
// Shared bits
// -----------------------------------------------------------------------------
function Tip({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="grid min-w-40 gap-1 rounded-lg bg-background px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-foreground/10">
      <div className="font-medium">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.color && <span className="size-2 shrink-0 rounded-[2px]" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-medium tabular-nums text-foreground">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const axis = { tickLine: false, axisLine: false } as const;
const rowHeight = 34;

/** Horizontal ranked bars: label on the left, value printed at the bar end. */
function HBarChart<T extends Record<string, unknown>>({
  data,
  categoryKey,
  valueKey,
  config,
  label,
  tooltip,
  categoryWidth = 112,
}: {
  data: T[];
  categoryKey: keyof T & string;
  valueKey: keyof T & string;
  config: ChartConfig;
  label: (row: T) => string;
  tooltip: (row: T) => React.ReactNode;
  categoryWidth?: number;
}) {
  const withLabel = data.map((d) => ({ ...d, __label: label(d) }));
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: data.length * rowHeight + 8 }}>
      <BarChart data={withLabel} layout="vertical" margin={{ top: 0, right: 72, left: 0, bottom: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide domain={[0, 'dataMax']} />
        <YAxis type="category" dataKey={categoryKey as string} {...axis} width={categoryWidth} tick={{ fill: 'var(--foreground)' }} />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)' }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as T | undefined;
            return active && row ? tooltip(row) : null;
          }}
        />
        <Bar dataKey={valueKey as string} fill={`var(--color-${valueKey})`} radius={[0, 4, 4, 0]} maxBarSize={20} minPointSize={2}>
          <LabelList dataKey="__label" position="right" offset={8} className="fill-foreground" fontSize={12} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// -----------------------------------------------------------------------------
// 1. Lead sources — ranked bars, won in the label + tooltip
// -----------------------------------------------------------------------------
const MAX_SOURCES = 7;

export function LeadSourcesChart({ data }: { data: SourceRow[] }) {
  // Long tail folds into "Other" — never more bars than fit at a glance.
  const rows =
    data.length <= MAX_SOURCES + 1
      ? data
      : [
          ...data.slice(0, MAX_SOURCES),
          data.slice(MAX_SOURCES).reduce<SourceRow>(
            (o, s) => ({ ...o, leads: o.leads + s.leads, won: o.won + s.won }),
            { source: 'other', label: 'Other', leads: 0, won: 0 },
          ),
        ];
  const total = rows.reduce((n, r) => n + r.leads, 0);

  return (
    <ChartCard
      title="Lead sources"
      description="New leads by source · conversion to closed"
      empty={total === 0 && 'No leads in this period'}
      chart={
        <HBarChart
          data={rows}
          categoryKey="label"
          valueKey="leads"
          config={{ leads: { label: 'Leads', color: 'var(--chart-1)' } }}
          label={(r) => `${r.leads} · ${pct(r.leads ? r.won / r.leads : 0)}`}
          tooltip={(r) => (
            <Tip
              title={r.label}
              rows={[
                { label: 'Leads', value: String(r.leads), color: 'var(--chart-1)' },
                { label: 'Share of leads', value: pct(r.leads / total, 1) },
                { label: 'Closed won', value: String(r.won) },
                { label: 'Conversion', value: pct(r.leads ? r.won / r.leads : 0, 1) },
              ]}
            />
          )}
        />
      }
      table={
        <DataTable
          caption="Leads by source"
          columns={[{ label: 'Source' }, { label: 'Leads', numeric: true }, { label: 'Closed won', numeric: true }, { label: 'Conversion', numeric: true }]}
          rows={rows.map((r) => [r.label, r.leads, r.won, pct(r.leads ? r.won / r.leads : 0, 1)])}
        />
      }
    />
  );
}

// -----------------------------------------------------------------------------
// 2. Closing rate — won ÷ (won + lost) decided each month, 12-month trend
// -----------------------------------------------------------------------------
export function ClosingRateChart({ data }: { data: MonthRow[] }) {
  const decided = data.reduce((n, m) => n + m.won + m.lost, 0);
  const config = { closingRate: { label: 'Closing rate', color: 'var(--chart-1)' } } satisfies ChartConfig;

  return (
    <ChartCard
      title="Closing rate"
      description="Leads won ÷ leads closed out (won + lost), by month"
      empty={decided === 0 && 'No leads were won or lost in the last 12 months'}
      chart={
        <ChartContainer config={config} className="aspect-auto h-56 w-full">
          <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" {...axis} tickMargin={8} />
            <YAxis {...axis} width={40} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v: number) => pct(v)} />
            <ChartTooltip
              cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
              content={({ active, payload }) => {
                const m = payload?.[0]?.payload as MonthRow | undefined;
                if (!active || !m) return null;
                return (
                  <Tip
                    title={m.longLabel}
                    rows={[
                      { label: 'Closing rate', value: pct(m.closingRate, 1), color: 'var(--chart-1)' },
                      { label: 'Won', value: String(m.won) },
                      { label: 'Lost', value: String(m.lost) },
                    ]}
                  />
                );
              }}
            />
            {/* Months with no decisions are gaps (no rate), not zeros. */}
            <Line
              dataKey="closingRate"
              type="linear"
              stroke="var(--color-closingRate)"
              strokeWidth={2}
              connectNulls={false}
              dot={{ r: 4, fill: 'var(--color-closingRate)', stroke: 'var(--card)', strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      }
      table={
        <DataTable
          caption="Closing rate by month"
          columns={[{ label: 'Month' }, { label: 'Won', numeric: true }, { label: 'Lost', numeric: true }, { label: 'Closing rate', numeric: true }]}
          rows={data.map((m) => [m.longLabel, m.won, m.lost, pct(m.closingRate, 1)])}
        />
      }
    />
  );
}

// -----------------------------------------------------------------------------
// 3. Conversion funnel — furthest stage each lead reached
// -----------------------------------------------------------------------------
export function ConversionFunnelChart({ data }: { data: FunnelRow[] }) {
  const top = data[0]?.count ?? 0;
  const rows = data.map((f, i) => ({
    ...f,
    ofLeads: top ? f.count / top : 0,
    ofPrev: i === 0 ? null : data[i - 1].count ? f.count / data[i - 1].count : 0,
  }));

  return (
    <ChartCard
      title="Conversion rate"
      description="How far this period's leads got (furthest stage reached)"
      empty={top === 0 && 'No leads in this period'}
      chart={
        <HBarChart
          data={rows}
          categoryKey="stage"
          valueKey="count"
          categoryWidth={124}
          config={{ count: { label: 'Leads', color: 'var(--chart-1)' } }}
          label={(r) => (r.ofPrev === null ? String(r.count) : `${r.count} · ${pct(r.ofLeads)}`)}
          tooltip={(r) => (
            <Tip
              title={r.stage}
              rows={[
                { label: 'Leads', value: String(r.count), color: 'var(--chart-1)' },
                { label: 'Of all leads', value: pct(r.ofLeads, 1) },
                ...(r.ofPrev === null ? [] : [{ label: 'From previous stage', value: pct(r.ofPrev, 1) }]),
              ]}
            />
          )}
        />
      }
      table={
        <DataTable
          caption="Lead conversion funnel"
          columns={[{ label: 'Stage' }, { label: 'Leads', numeric: true }, { label: 'Of all leads', numeric: true }, { label: 'From previous stage', numeric: true }]}
          rows={rows.map((r) => [r.stage, r.count, pct(r.ofLeads, 1), r.ofPrev === null ? '—' : pct(r.ofPrev, 1)])}
        />
      }
    />
  );
}

// -----------------------------------------------------------------------------
// 4. Revenue — GCI by month, last 12 months
// -----------------------------------------------------------------------------
export function RevenueTrendChart({ data }: { data: MonthRow[] }) {
  const total = data.reduce((n, m) => n + m.gci, 0);
  const config = { gci: { label: 'GCI', color: 'var(--chart-1)' } } satisfies ChartConfig;

  return (
    <ChartCard
      title="Revenue"
      description="Gross commission income from closed deals, last 12 months"
      empty={total === 0 && data.every((m) => m.volume === 0) && 'No closed deals in the last 12 months'}
      chart={
        <ChartContainer config={config} className="aspect-auto h-56 w-full">
          <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" {...axis} tickMargin={8} />
            <YAxis {...axis} width={56} tickFormatter={(v: number) => moneyShort(v)} />
            <ChartTooltip
              cursor={{ fill: 'var(--muted)' }}
              content={({ active, payload }) => {
                const m = payload?.[0]?.payload as MonthRow | undefined;
                if (!active || !m) return null;
                return (
                  <Tip
                    title={m.longLabel}
                    rows={[
                      { label: 'GCI', value: money(m.gci), color: 'var(--chart-1)' },
                      { label: 'Volume', value: moneyShort(m.volume) },
                      { label: 'Closings', value: String(m.buyer + m.seller + m.dual) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="gci" fill="var(--color-gci)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ChartContainer>
      }
      table={
        <DataTable
          caption="Revenue by month"
          columns={[{ label: 'Month' }, { label: 'GCI', numeric: true }, { label: 'Volume', numeric: true }, { label: 'Closings', numeric: true }]}
          rows={data.map((m) => [m.longLabel, money(m.gci), money(m.volume), m.buyer + m.seller + m.dual])}
        />
      }
    />
  );
}

// -----------------------------------------------------------------------------
// 5. Agent performance — GCI per agent + leaderboard table
// -----------------------------------------------------------------------------
export function AgentPerformanceChart({ data }: { data: AgentRow[] }) {
  const winRate = (a: AgentRow) => (a.won + a.lost ? a.won / (a.won + a.lost) : null);
  const active = data.filter((a) => a.leads || a.dealsClosed);
  const firstName = (a: AgentRow) => a.name.split(/[\s@]/)[0];

  return (
    <ChartCard
      title="Agent performance"
      description="GCI closed this period · leads, closing rate and volume per agent"
      empty={active.length === 0 && 'No agent activity in this period'}
      chart={
        <div className="space-y-4">
          <HBarChart
            data={active}
            categoryKey="name"
            valueKey="gci"
            categoryWidth={128}
            config={{ gci: { label: 'GCI', color: 'var(--chart-1)' } }}
            label={(a) => moneyShort(a.gci)}
            tooltip={(a) => (
              <Tip
                title={a.name}
                rows={[
                  { label: 'GCI', value: money(a.gci), color: 'var(--chart-1)' },
                  { label: 'Closings', value: String(a.dealsClosed) },
                  { label: 'Volume', value: moneyShort(a.volume) },
                  { label: 'Leads', value: String(a.leads) },
                  { label: 'Closing rate', value: pct(winRate(a), 1) },
                ]}
              />
            )}
          />
          {/* Compact leaderboard under the bars: exact figures at a glance. */}
          <div className="overflow-x-auto" data-testid="agent-leaderboard">
            <DataTable
              caption="Agent leaderboard"
              columns={[{ label: 'Agent' }, { label: 'Leads', numeric: true }, { label: 'Closing rate', numeric: true }, { label: 'Closings', numeric: true }, { label: 'Volume', numeric: true }]}
              rows={active.map((a) => [firstName(a), a.leads, pct(winRate(a)), a.dealsClosed, moneyShort(a.volume)])}
            />
          </div>
        </div>
      }
      table={
        <DataTable
          caption="Agent performance"
          columns={[
            { label: 'Agent' },
            { label: 'Leads', numeric: true },
            { label: 'Won', numeric: true },
            { label: 'Lost', numeric: true },
            { label: 'Closing rate', numeric: true },
            { label: 'Closings', numeric: true },
            { label: 'Volume', numeric: true },
            { label: 'GCI', numeric: true },
          ]}
          rows={active.map((a) => [a.name, a.leads, a.won, a.lost, pct(winRate(a), 1), a.dealsClosed, money(a.volume), money(a.gci)])}
        />
      }
    />
  );
}

// -----------------------------------------------------------------------------
// 6. Monthly transactions — closings by side, stacked
// -----------------------------------------------------------------------------
const SIDES = [
  { key: 'buyer', label: 'Buyer side', color: 'var(--chart-1)' },
  { key: 'seller', label: 'Listing side', color: 'var(--chart-2)' },
  { key: 'dual', label: 'Dual agency', color: 'var(--chart-3)' },
] as const;

export function MonthlyTransactionsChart({ data }: { data: MonthRow[] }) {
  const total = data.reduce((n, m) => n + m.buyer + m.seller + m.dual, 0);
  const config = Object.fromEntries(SIDES.map((s) => [s.key, { label: s.label, color: s.color }])) satisfies ChartConfig;

  return (
    <ChartCard
      title="Monthly transactions"
      description="Closed deals per month by side, last 12 months"
      empty={total === 0 && 'No closed deals in the last 12 months'}
      chart={
        <>
          {/* Legend: always present for multiple series; text stays ink. */}
          <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {SIDES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px]" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
          <ChartContainer config={config} className="aspect-auto h-56 w-full">
            <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axis} tickMargin={8} />
              <YAxis {...axis} width={32} allowDecimals={false} />
              <ChartTooltip
                cursor={{ fill: 'var(--muted)' }}
                content={({ active, payload }) => {
                  const m = payload?.[0]?.payload as MonthRow | undefined;
                  if (!active || !m) return null;
                  return (
                    <Tip
                      title={m.longLabel}
                      rows={[
                        ...SIDES.map((s) => ({ label: s.label, value: String(m[s.key]), color: s.color })),
                        { label: 'Total', value: String(m.buyer + m.seller + m.dual) },
                      ]}
                    />
                  );
                }}
              />
              {/* 2px card-colored stroke = the gap between stacked segments */}
              {SIDES.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  stackId="sides"
                  fill={`var(--color-${s.key})`}
                  stroke="var(--card)"
                  strokeWidth={2}
                  maxBarSize={28}
                  radius={i === SIDES.length - 1 ? [4, 4, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </>
      }
      table={
        <DataTable
          caption="Closed transactions by month and side"
          columns={[{ label: 'Month' }, ...SIDES.map((s) => ({ label: s.label, numeric: true })), { label: 'Total', numeric: true }]}
          rows={data.map((m) => [m.longLabel, m.buyer, m.seller, m.dual, m.buyer + m.seller + m.dual])}
        />
      }
    />
  );
}
