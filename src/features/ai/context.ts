import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { LEAD_INTENT, LEAD_STATUS, sourceLabel } from '@/features/leads/constants';
import type { LeadIntent, LeadStatus } from '@/types/database.types';

/**
 * Everything the model may see about a lead.
 *
 * Data minimisation: the model gets the contact's FIRST name only, never their
 * email, phone, last name or street address. Free text written by the lead or
 * agents (inquiry message, notes, activity summaries) is truncated and passed
 * as data, never as instructions (see prompts.ts).
 */
export type LeadAIContext = {
  leadId: string;
  contactId: string;
  assignedTo: string | null;
  status: LeadStatus;
  firstName: string;
  doNotContact: boolean;
  /** For mailto:/sms: links in the browser only — NOT sent to the model. */
  email: string | null;
  phone: string | null;
  modelInput: Record<string, unknown>;
};

const DAY = 86_400_000;
const daysAgo = (iso: string | null | undefined) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY)) : null);
const clip = (s: string | null | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : null);

export async function buildLeadContext(
  orgId: string,
  leadId: string,
  agent: { name: string; organization: string },
): Promise<LeadAIContext | null> {
  const supabase = await createClient();
  const { data: lead, error } = await supabase
    .from('leads')
    .select('id, contact_id, assigned_to, status, intent, source, source_detail, budget_min, budget_max, timeframe, message, created_at, last_contacted_at, contact:contacts(first_name, email, phone, mobile_phone, city, state, tags, preferred_contact_method, do_not_contact)')
    .eq('organization_id', orgId)
    .eq('id', leadId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead) return null;
  const contact = (Array.isArray(lead.contact) ? lead.contact[0] : lead.contact) as {
    first_name: string; email: string | null; phone: string | null; mobile_phone: string | null; city: string | null;
    state: string | null; tags: string[]; preferred_contact_method: string | null; do_not_contact: boolean;
  };

  const [activities, notes, tasks] = await Promise.all([
    supabase.from('activities').select('type, summary, occurred_at')
      .eq('organization_id', orgId).eq('contact_id', lead.contact_id)
      .order('occurred_at', { ascending: false }).limit(15),
    supabase.from('notes').select('body, created_at')
      .eq('organization_id', orgId).eq('contact_id', lead.contact_id)
      .order('created_at', { ascending: false }).limit(5),
    supabase.from('tasks').select('title, due_at, status')
      .eq('organization_id', orgId).eq('contact_id', lead.contact_id)
      .in('status', ['todo', 'in_progress']).limit(5),
  ]);

  const acts = activities.data ?? [];
  const touches = acts.filter((a) => ['call', 'email', 'text', 'meeting'].includes(a.type as string));

  return {
    leadId: lead.id as string,
    contactId: lead.contact_id as string,
    assignedTo: (lead.assigned_to as string | null) ?? null,
    status: lead.status as LeadStatus,
    firstName: contact.first_name,
    doNotContact: contact.do_not_contact,
    email: contact.email,
    phone: contact.mobile_phone ?? contact.phone,
    modelInput: {
      today: new Date().toISOString().slice(0, 10),
      agent: { name: agent.name, brokerage: agent.organization },
      lead: {
        first_name: contact.first_name,
        stage: LEAD_STATUS[lead.status as LeadStatus].label,
        looking_to: LEAD_INTENT[lead.intent as LeadIntent],
        source: sourceLabel(lead.source as string | null),
        source_detail: clip(lead.source_detail as string | null, 120),
        budget: lead.budget_min || lead.budget_max ? { min: lead.budget_min, max: lead.budget_max } : null,
        timeframe: lead.timeframe,
        area: [contact.city, contact.state].filter(Boolean).join(', ') || null,
        tags: (contact.tags ?? []).slice(0, 10),
        prefers: contact.preferred_contact_method,
        inquiry_message: clip(lead.message as string | null, 1000),
      },
      signals: {
        days_since_created: daysAgo(lead.created_at as string),
        days_since_last_contact: daysAgo((lead.last_contacted_at as string | null) ?? (touches[0]?.occurred_at as string | undefined)),
        touches_last_15_activities: touches.length,
        open_tasks: (tasks.data ?? []).map((t) => ({ title: clip(t.title as string, 80), due_in_days: t.due_at ? -(daysAgo(t.due_at as string) ?? 0) : null })),
      },
      recent_activity: acts.map((a) => ({ type: a.type, days_ago: daysAgo(a.occurred_at as string), summary: clip(a.summary as string, 200) })),
      recent_notes: (notes.data ?? []).map((n) => ({ days_ago: daysAgo(n.created_at as string), text: clip(n.body as string, 300) })),
    },
  };
}
