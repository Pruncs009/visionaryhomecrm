'use client';

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { fmt } from '../format';

// One series → one validated blue, no legend (the card title names it).
const chartConfig = { value: { label: 'Closed revenue', color: 'var(--chart-1)' } } satisfies ChartConfig;

type Week = { code: string; range: string; value: number | null };

/** Closed revenue per week of the quarter, with the weekly target as a dashed line. */
export function WeeklyRevenueChart({ weeks, target }: { weeks: Week[]; target: number | null }) {
  return (
    <>
      <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full" aria-hidden>
        <BarChart data={weeks} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="code" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => fmt(v, 'money', { compact: true })} />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)' }}
            content={({ active, payload }) => {
              const w = payload?.[0]?.payload as Week | undefined;
              if (!active || !w) return null;
              return (
                <div className="grid min-w-40 gap-1 rounded-lg bg-background px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-foreground/10">
                  <div className="font-medium">
                    {w.code} · {w.range}
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2 rounded-[2px] bg-(--color-value)" /> Closed revenue
                    </span>
                    <span className="font-medium tabular-nums text-foreground">{w.value === null ? 'Not entered yet' : fmt(w.value, 'money')}</span>
                  </div>
                  {target !== null && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Weekly target</span>
                      <span className="tabular-nums text-foreground">{fmt(target, 'money')}</span>
                    </div>
                  )}
                </div>
              );
            }}
          />
          {target !== null && (
            <ReferenceLine
              y={target}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{ value: `Target ${fmt(target, 'money', { compact: true })}`, position: 'insideTopRight', fill: 'var(--muted-foreground)', fontSize: 11 }}
            />
          )}
          {/* 4px rounded data-end, anchored to the baseline */}
          <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>Closed revenue by week</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Dates</th>
            <th scope="col">Closed revenue</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.code}>
              <th scope="row">{w.code}</th>
              <td>{w.range}</td>
              <td>{w.value === null ? 'Not entered' : fmt(w.value, 'money')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
