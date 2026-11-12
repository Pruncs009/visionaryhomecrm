import { createClient } from '@/lib/supabase/server';
import type { MemberRole } from '@/types/database.types';
import { LEADS_PAGE_SIZE } from './constants';
import type { LeadFilters } from './schemas';
import type { LeadListResult, LeadListRow, LeadWithContact, PipelineCard, TeamMember } from './types';

/**
 * Strip characters that have meaning in PostgREST filter syntax (`,` `(` `)`)
 * and LIKE wildcards, so user search text can't alter the query.
 */
function sanitizeSearch(q: string) {
  return q.replace(/[,()*%\\:"]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function listLeads(
  orgId: string,
  userId: string,
  filters: LeadFilters,
): Promise<LeadListResult> {
  const supabase = await createClient();
  const page = filters.page ?? 1;
  const from = (page - 1) * LEADS_PAGE_SIZE;

  let query = supabase
    .from('lead_list')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, from + LEADS_PAGE_SIZE - 1);

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.source) query = query.eq('source', filters.source);
  if (filters.agent === 'me') query = query.eq('assigned_to', userId);
  else if (filters.agent === 'unassigned') query = query.is('assigned_to', null);
  else if (filters.agent) query = query.eq('assigned_to', filters.agent);

  const q = filters.q ? sanitizeSearch(filters.q) : '';
  if (q) {
    query = query.or(`full_name.ilike.*${q}*,email.ilike.*${q}*,phone.ilike.*${q}*`);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const total = count ?? 0;
  return {
    rows: (data ?? []) as LeadListRow[],
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE)),
  };
}

/**
 * Cards for the pipeline board, ordered by pipeline_position.
 * Open stages: everything. Closed Won / Lost: only the last 90 days, so the
 * board stays fast as history grows (older ones are in the list view).
 */
export async function getPipelineLeads(orgId: string, userId: string, agent?: 'me' | string): Promise<PipelineCard[]> {
  const supabase = await createClient();
  const cols = 'id, status, intent, source, budget_min, budget_max, full_name, assigned_to, assigned_name, pipeline_position, updated_at, score, ai_temperature';
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const agentId = agent === 'me' ? userId : agent;

  let openQuery = supabase
    .from('lead_list')
    .select(cols)
    .eq('organization_id', orgId)
    .not('status', 'in', '(closed_won,closed_lost)');
  let closedQuery = supabase
    .from('lead_list')
    .select(cols)
    .eq('organization_id', orgId)
    .in('status', ['closed_won', 'closed_lost'])
    .gte('updated_at', since);
  if (agentId) {
    openQuery = openQuery.eq('assigned_to', agentId);
    closedQuery = closedQuery.eq('assigned_to', agentId);
  }

  const [open, closed] = await Promise.all([
    openQuery.order('pipeline_position', { ascending: true }).limit(1000),
    closedQuery.order('pipeline_position', { ascending: true }).limit(500),
  ]);
  if (open.error) throw new Error(open.error.message);
  if (closed.error) throw new Error(closed.error.message);
  return [...(open.data ?? []), ...(closed.data ?? [])].map((r) => ({
    ...(r as PipelineCard),
    budget_min: r.budget_min === null ? null : Number(r.budget_min),
    budget_max: r.budget_max === null ? null : Number(r.budget_max),
    pipeline_position: Number(r.pipeline_position),
  }));
}

/** One lead with its contact, or null if missing / deleted / another org. */
export async function getLead(orgId: string, leadId: string): Promise<LeadWithContact | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*, contact:contacts(*)')
    .eq('organization_id', orgId)
    .eq('id', leadId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const contact = Array.isArray(data.contact) ? data.contact[0] : data.contact;
  return { ...data, contact } as LeadWithContact;
}

/** Everyone in the organization, for "Assign agent" pickers. */
export async function getTeamMembers(orgId: string): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('memberships')
    .select('user_id, role, profile:profiles(full_name, email)')
    .eq('organization_id', orgId);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((m) => {
      const raw = m.profile as unknown;
      const profile = (Array.isArray(raw) ? raw[0] : raw) as { full_name: string | null; email: string } | null;
      return {
        userId: m.user_id as string,
        role: m.role as MemberRole,
        name: profile?.full_name || profile?.email || 'Unknown member',
        email: profile?.email ?? '',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
