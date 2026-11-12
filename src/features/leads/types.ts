import type { Contact, Lead, LeadIntent, LeadStatus, MemberRole } from '@/types/database.types';

/** Row of the public.lead_list view. */
export type LeadListRow = {
  id: string;
  organization_id: string;
  contact_id: string;
  assigned_to: string | null;
  status: LeadStatus;
  intent: LeadIntent;
  source: string | null;
  source_detail: string | null;
  score: number | null;
  budget_min: number | null;
  budget_max: number | null;
  timeframe: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  assigned_name: string | null;
  pipeline_position: number;
  ai_temperature: 'hot' | 'warm' | 'cold' | null;
};

/** What a pipeline card needs (subset of LeadListRow). */
export type PipelineCard = Pick<
  LeadListRow,
  'id' | 'status' | 'intent' | 'source' | 'budget_min' | 'budget_max' | 'full_name' | 'assigned_to' | 'assigned_name' | 'pipeline_position' | 'updated_at' | 'score' | 'ai_temperature'
>;

export type LeadWithContact = Lead & { contact: Contact };

export type TeamMember = {
  userId: string;
  role: MemberRole;
  name: string;
  email: string;
};

export type LeadListResult = {
  rows: LeadListRow[];
  total: number;
  page: number;
  pageCount: number;
};
