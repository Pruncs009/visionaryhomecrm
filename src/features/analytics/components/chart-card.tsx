'use client';

import { useId, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ChartCardProps = {
  title: string;
  description?: string;
  /** The chart. Hidden from assistive tech — the table carries the same data. */
  chart: React.ReactNode;
  /** The same numbers as a table: always in the accessibility tree, visible on toggle. */
  table: React.ReactNode;
  /** Shown instead of the chart when there's nothing to plot. */
  empty?: string | false;
  className?: string;
};

/**
 * Card with a Chart / Table switch. The table is the accessible twin of the
 * chart (screen readers always get it), and sighted users can flip to it for
 * exact figures or when a color is hard to tell apart.
 */
export function ChartCard({ title, description, chart, table, empty, className }: ChartCardProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const id = useId();

  return (
    <Card className={className} data-chart-card={title}>
      <CardHeader>
        <CardTitle id={`${id}-title`}>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {!empty && (
          <CardAction>
            <div role="group" aria-label={`${title} view`} className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
              {(
                [
                  ['chart', 'Chart', BarChart3],
                  ['table', 'Table', Table2],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    view === value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">{empty}</p>
        ) : (
          <>
            <div aria-hidden className={view === 'chart' ? undefined : 'hidden'}>
              {chart}
            </div>
            <div className={view === 'table' ? 'max-h-80 overflow-auto' : 'sr-only'}>{table}</div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** A plain data table in the house style; used as every chart's twin. */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: { label: string; numeric?: boolean }[];
  rows: (string | number)[][];
}) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          {columns.map((c) => (
            <th key={c.label} scope="col" className={cn('py-2 pr-3 font-medium', c.numeric ? 'text-right' : 'text-left')}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b last:border-0">
            {r.map((cell, j) =>
              j === 0 ? (
                <th key={j} scope="row" className="py-2 pr-3 text-left font-medium">
                  {cell}
                </th>
              ) : (
                <td key={j} className={cn('py-2 pr-3 tabular-nums', columns[j]?.numeric && 'text-right')}>
                  {cell}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
