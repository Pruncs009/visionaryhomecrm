'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { formatCurrency } from '@/lib/utils';
import type { RevenueMonth } from '../types';

// Single series → one validated blue, no legend (the card title names it).
const chartConfig = {
  commission: { label: 'GCI', color: 'var(--chart-1)' },
} satisfies ChartConfig;

export function RevenueChart({ data }: { data: RevenueMonth[] }) {
  return (
    <>
      <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full" aria-hidden>
        <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(v: number) => formatCurrency(v, { compact: true })}
          />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)' }}
            content={({ active, payload }) => {
              const m = payload?.[0]?.payload as RevenueMonth | undefined;
              if (!active || !m) return null;
              return (
                <div className="grid min-w-36 gap-1 rounded-lg bg-background px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-foreground/10">
                  <div className="font-medium">{m.label}</div>
                  <Row label="GCI" value={formatCurrency(m.commission)} swatch />
                  <Row label="Volume" value={formatCurrency(m.volume, { compact: true })} />
                  <Row label="Closings" value={String(m.deals)} />
                </div>
              );
            }}
          />
          {/* 4px rounded data-end, anchored to the baseline */}
          <Bar dataKey="commission" fill="var(--color-commission)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ChartContainer>

      {/* Table view of the same data for screen readers */}
      <table className="sr-only">
        <caption>Gross commission income by month, last 12 months</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">GCI</th>
            <th scope="col">Volume</th>
            <th scope="col">Closings</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m) => (
            <tr key={m.key}>
              <th scope="row">{m.key}</th>
              <td>{formatCurrency(m.commission)}</td>
              <td>{formatCurrency(m.volume)}</td>
              <td>{m.deals}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Row({ label, value, swatch }: { label: string; value: string; swatch?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {swatch && <span className="size-2 rounded-[2px] bg-(--color-commission)" />}
        {label}
      </span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}
