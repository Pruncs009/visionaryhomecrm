import type { LeadIntent, LeadStatus } from '@/types/database.types';

/** Pipeline order (left → right on the board). */
export const LEAD_STATUS_VALUES = [
  'new', 'attempting_contact', 'contacted', 'nurturing', 'qualified',
  'appointment_set', 'active_client', 'under_contract', 'closed_won', 'closed_lost',
] as const;
export const LEAD_INTENT_VALUES = ['buy', 'sell', 'buy_and_sell', 'rent', 'invest'] as const;
export const LEAD_SOURCE_VALUES = [
  'zillow',
  'realtor_com',
  'website',
  'referral',
  'open_house',
  'social_media',
  'sign_call',
  'past_client',
  'other',
] as const;
export const LEAD_TIMEFRAME_VALUES = ['asap', '1_3_months', '3_6_months', '6_12_months', '12_plus_months', 'unknown'] as const;

export type LeadSource = (typeof LEAD_SOURCE_VALUES)[number];
export type LeadTimeframe = (typeof LEAD_TIMEFRAME_VALUES)[number];

export const LEAD_STATUS: Record<LeadStatus, { label: string; className: string }> = {
  new: { label: 'New Lead', className: 'bg-primary/10 text-primary' },
  attempting_contact: { label: 'Attempting Contact', className: 'bg-secondary text-secondary-foreground' },
  contacted: { label: 'Contacted', className: 'bg-secondary text-secondary-foreground' },
  nurturing: { label: 'Nurturing', className: 'bg-muted text-muted-foreground' },
  qualified: { label: 'Qualified', className: 'bg-chart-1/15 text-foreground' },
  appointment_set: { label: 'Appointment Set', className: 'bg-chart-1/15 text-foreground' },
  active_client: { label: 'Active Client', className: 'bg-primary/10 text-primary' },
  under_contract: { label: 'Under Contract', className: 'bg-primary/15 text-primary' },
  closed_won: { label: 'Closed Won', className: 'bg-success/10 text-success' },
  closed_lost: { label: 'Closed Lost', className: 'bg-muted text-muted-foreground line-through decoration-1' },
};

/** Closed stages: excluded from open-pipeline totals. */
export const CLOSED_STAGES: LeadStatus[] = ['closed_won', 'closed_lost'];

export const LEAD_INTENT: Record<LeadIntent, string> = {
  buy: 'Buying',
  sell: 'Selling',
  buy_and_sell: 'Buying & selling',
  rent: 'Renting',
  invest: 'Investing',
};

export const LEAD_SOURCE: Record<LeadSource, string> = {
  zillow: 'Zillow',
  realtor_com: 'Realtor.com',
  website: 'Website',
  referral: 'Referral',
  open_house: 'Open house',
  social_media: 'Social media',
  sign_call: 'Sign call',
  past_client: 'Past client',
  other: 'Other',
};

export const LEAD_TIMEFRAME: Record<LeadTimeframe, string> = {
  asap: 'ASAP',
  '1_3_months': '1–3 months',
  '3_6_months': '3–6 months',
  '6_12_months': '6–12 months',
  '12_plus_months': '12+ months',
  unknown: 'Not sure',
};

/** Label for a stored source value; falls back to the raw text for legacy/imported values. */
export function sourceLabel(source: string | null | undefined) {
  if (!source) return null;
  return LEAD_SOURCE[source as LeadSource] ?? source;
}

export const LEADS_PAGE_SIZE = 25;
