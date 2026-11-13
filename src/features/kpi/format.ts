import type { Unit, Value } from './parse';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const numCompact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** A KPI number in its unit: $90,350 · 47.2% · 13m 39s · 3,440 */
export function fmt(n: number | null | undefined, unit: Unit, opts: { compact?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  switch (unit) {
    case 'money':
      return opts.compact && Math.abs(n) >= 10_000 ? usdCompact.format(n) : usd.format(n);
    case 'percent':
      return `${num.format(n)}%`;
    case 'duration': {
      const totalSec = Math.round(n * 60);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      return h ? `${h}h ${m}m` : m ? (s ? `${m}m ${s}s` : `${m}m`) : `${s}s`;
    }
    default:
      return opts.compact && Math.abs(n) >= 10_000 ? numCompact.format(n) : num.format(n);
  }
}

const CMP = { '<': '< ', '<=': '≤ ', '>': '> ', '>=': '≥ ' } as const;

/** A target cell, keeping its "less than / at least" sign: ≤ 2 · < $10,000 */
export function fmtTarget(v: Value, unit: Unit): string {
  if (v.num === null) return v.raw && v.raw !== '-' ? v.raw : '—';
  return `${v.cmp ? CMP[v.cmp] : ''}${fmt(v.num, unit)}`;
}

export const pct = (ratio: number | null | undefined) => (ratio === null || ratio === undefined ? '—' : `${Math.round(ratio * 100)}%`);
