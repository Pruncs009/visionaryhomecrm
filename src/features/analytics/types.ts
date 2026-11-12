export const RANGE_OPTIONS = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'ytd', label: 'Year to date' },
  { value: '12m', label: 'Last 12 months' },
] as const;

export type RangeKey = (typeof RANGE_OPTIONS)[number]['value'];
export const DEFAULT_RANGE: RangeKey = 'ytd';

export type AnalyticsKpis = {
  leads: number;
  won: number;
  lost: number;
  /** won ÷ (won + lost): of the leads you finished working, how many closed. null = no decisions yet */
  winRate: number | null;
  /** won ÷ all leads created in range. null = no leads */
  conversionRate: number | null;
  dealsClosed: number;
  volume: number;
  gci: number;
};

export type SourceRow = { source: string; label: string; leads: number; won: number };
export type FunnelRow = { stage: string; count: number };
export type MonthRow = {
  key: string; // YYYY-MM
  label: string; // "Nov"
  longLabel: string; // "November 2026"
  gci: number;
  volume: number;
  buyer: number;
  seller: number;
  dual: number;
  won: number;
  lost: number;
  /** won ÷ (won + lost) decided that month; null when nothing was decided */
  closingRate: number | null;
};
export type AgentRow = {
  agentId: string;
  name: string;
  leads: number;
  won: number;
  lost: number;
  dealsClosed: number;
  volume: number;
  gci: number;
};

export type AnalyticsReport = {
  kpis: AnalyticsKpis;
  sources: SourceRow[];
  funnel: FunnelRow[];
  monthly: MonthRow[];
  agents: AgentRow[];
};
