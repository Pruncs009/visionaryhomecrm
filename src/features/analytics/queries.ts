import 'server-only';
import { calendarBounds, zonedMidnight, zonedParts } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { sourceLabel } from '@/features/leads/constants';
import { DEFAULT_RANGE, RANGE_OPTIONS, type AnalyticsReport, type RangeKey } from './types';

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const rate = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function parseRange(value: string | undefined): RangeKey {
  return RANGE_OPTIONS.some((o) => o.value === value) ? (value as RangeKey) : DEFAULT_RANGE;
}

/** Preset → [from, to) as UTC instants, in the agent's timezone ("today" ends at local midnight). */
export function resolveRange(range: RangeKey, timezone: string, now = new Date()) {
  const b = calendarBounds(timezone, now);
  const { day } = zonedParts(now, timezone);
  const to = b.startOfTomorrow; // includes all of today
  const from =
    range === '30d' ? zonedMidnight(b.year, b.month, day - 29, timezone)
    : range === '90d' ? zonedMidnight(b.year, b.month, day - 89, timezone)
    : range === 'ytd' ? b.startOfYear
    : b.startOf12MonthWindow;
  return { from, to };
}

type RawReport = {
  kpis: Record<string, unknown>;
  sources: { source: string; leads: number; won: number }[];
  funnel: { stage: string; count: number }[];
  monthly: { month: string; gci: unknown; volume: unknown; buyer: number; seller: number; dual: number; won: number; lost: number }[];
  agents: { agent_id: string; name: string; leads: number; won: number; lost: number; deals_closed: number; volume: unknown; gci: unknown }[];
};

/**
 * One RPC → the whole Reports page. The function runs as the signed-in user
 * (SECURITY INVOKER), so RLS limits it to this org's rows.
 */
export async function getAnalyticsReport(opts: {
  orgId: string;
  range: RangeKey;
  agentId?: string;
  timezone: string;
}): Promise<AnalyticsReport> {
  const supabase = await createClient();
  const { from, to } = resolveRange(opts.range, opts.timezone);
  const { data, error } = await supabase.rpc('analytics_report', {
    p_organization_id: opts.orgId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_agent_id: opts.agentId ?? null,
    p_timezone: opts.timezone,
  });
  if (error) throw new Error(error.message);
  const r = data as RawReport;

  const monthName = (key: string, style: 'short' | 'long') => {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 15));
    return style === 'short'
      ? d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
      : d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  };

  return {
    kpis: {
      leads: num(r.kpis.leads),
      won: num(r.kpis.won),
      lost: num(r.kpis.lost),
      winRate: rate(r.kpis.win_rate),
      conversionRate: rate(r.kpis.conversion_rate),
      dealsClosed: num(r.kpis.deals_closed),
      volume: num(r.kpis.volume),
      gci: num(r.kpis.gci),
    },
    sources: r.sources.map((s) => ({ source: s.source, label: s.source === 'unknown' ? 'Unknown' : (sourceLabel(s.source) ?? s.source), leads: num(s.leads), won: num(s.won) })),
    funnel: r.funnel.map((f) => ({ stage: f.stage, count: num(f.count) })),
    monthly: r.monthly.map((m) => {
      const decided = num(m.won) + num(m.lost);
      return {
        key: m.month,
        label: monthName(m.month, 'short'),
        longLabel: monthName(m.month, 'long'),
        gci: num(m.gci),
        volume: num(m.volume),
        buyer: num(m.buyer),
        seller: num(m.seller),
        dual: num(m.dual),
        won: num(m.won),
        lost: num(m.lost),
        closingRate: decided ? num(m.won) / decided : null,
      };
    }),
    agents: r.agents.map((a) => ({
      agentId: a.agent_id,
      name: a.name,
      leads: num(a.leads),
      won: num(a.won),
      lost: num(a.lost),
      dealsClosed: num(a.deals_closed),
      volume: num(a.volume),
      gci: num(a.gci),
    })),
  };
}
