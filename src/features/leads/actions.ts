'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireContext } from '@/features/auth/guards';
import type { ActionState } from '@/features/auth/types';
import { createClient } from '@/lib/supabase/server';
import type { LeadStatus } from '@/types/database.types';
import { leadFormSchema, leadStatusSchema, moveLeadSchema, uuidSchema } from './schemas';

export type MutationResult = { ok: true } | { ok: false; error: string };

const FORM_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'status', 'intent', 'source', 'source_detail',
  'assigned_to', 'budget_min', 'budget_max', 'timeframe', 'message', 'lost_reason',
] as const;

function readForm(formData: FormData) {
  const values: Record<string, string> = {};
  for (const key of FORM_FIELDS) {
    const v = formData.get(key);
    values[key] = typeof v === 'string' ? v : '';
  }
  return values;
}

/** Turn Postgres error codes into messages an agent can act on. */
function dbErrorMessage(error: { code?: string; message: string }) {
  switch (error.code) {
    case '23503':
      return "That agent isn't on your team anymore. Pick someone else.";
    case '23514':
      return 'Some values are out of range. Check budgets and try again.';
    case '42501':
      return "You don't have permission to do that.";
    default:
      console.error('[leads] database error', error);
      return 'Something went wrong saving this lead. Please try again.';
  }
}

function revalidateLeads(leadId?: string) {
  revalidatePath('/leads');
  revalidatePath('/dashboard');
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

/** converted_at ("won at") / lost_reason must stay consistent with status (DB check constraint). */
function statusFields(status: LeadStatus, previousConvertedAt: string | null, lostReason?: string | null) {
  return {
    status,
    converted_at: status === 'closed_won' ? (previousConvertedAt ?? new Date().toISOString()) : null,
    lost_reason: status === 'closed_lost' ? (lostReason ?? null) : null,
  };
}

// -----------------------------------------------------------------------------
// Create
// -----------------------------------------------------------------------------
export async function createLead(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const values = readForm(formData);
  const parsed = leadFormSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values };
  }
  const d = parsed.data;

  const supabase = await createClient();
  // One transaction in Postgres: find-or-create contact, then insert lead.
  const { data, error } = await supabase.rpc('create_lead_with_contact', {
    p_organization_id: ctx.organization.id,
    p_first_name: d.first_name,
    p_last_name: d.last_name ?? null,
    p_email: d.email ?? null,
    p_phone: d.phone ?? null,
    p_status: d.status,
    p_intent: d.intent,
    p_source: d.source ?? null,
    p_source_detail: d.source_detail ?? null,
    p_assigned_to: d.assigned_to,
    p_budget_min: d.budget_min ?? null,
    p_budget_max: d.budget_max ?? null,
    p_timeframe: d.timeframe ?? null,
    p_message: d.message ?? null,
  });
  if (error) return { error: dbErrorMessage(error), values };

  const leadId = (data as { lead_id: string }).lead_id;
  revalidateLeads();
  redirect(`/leads/${leadId}`);
}

// -----------------------------------------------------------------------------
// Edit (bound: updateLead.bind(null, leadId))
// -----------------------------------------------------------------------------
export async function updateLead(
  leadId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext();
  const values = readForm(formData);
  if (!uuidSchema.safeParse(leadId).success) return { error: 'Lead not found.', values };

  const parsed = leadFormSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from('leads')
    .select('contact_id, converted_at')
    .eq('organization_id', ctx.organization.id)
    .eq('id', leadId)
    .is('deleted_at', null)
    .maybeSingle();
  if (readError) return { error: dbErrorMessage(readError), values };
  if (!existing) return { error: 'This lead no longer exists.', values };

  const { error: contactError } = await supabase
    .from('contacts')
    .update({
      first_name: d.first_name,
      last_name: d.last_name ?? null,
      email: d.email ?? null,
      phone: d.phone ?? null,
    })
    .eq('organization_id', ctx.organization.id)
    .eq('id', existing.contact_id);
  if (contactError) return { error: dbErrorMessage(contactError), values };

  const { error: leadError } = await supabase
    .from('leads')
    .update({
      ...statusFields(d.status, existing.converted_at, d.lost_reason),
      intent: d.intent,
      source: d.source ?? null,
      source_detail: d.source_detail ?? null,
      assigned_to: d.assigned_to,
      budget_min: d.budget_min ?? null,
      budget_max: d.budget_max ?? null,
      timeframe: d.timeframe ?? null,
      message: d.message ?? null,
    })
    .eq('organization_id', ctx.organization.id)
    .eq('id', leadId);
  if (leadError) return { error: dbErrorMessage(leadError), values };

  revalidateLeads(leadId);
  redirect(`/leads/${leadId}`);
}

// -----------------------------------------------------------------------------
// Quick actions (called from client components, not forms)
// -----------------------------------------------------------------------------
export async function updateLeadStatus(leadId: string, status: string): Promise<MutationResult> {
  const ctx = await requireContext();
  const parsedStatus = leadStatusSchema.safeParse(status);
  if (!uuidSchema.safeParse(leadId).success || !parsedStatus.success) {
    return { ok: false, error: 'Invalid status.' };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('leads')
    .select('converted_at, lost_reason')
    .eq('organization_id', ctx.organization.id)
    .eq('id', leadId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'This lead no longer exists.' };

  const { error } = await supabase
    .from('leads')
    .update(statusFields(parsedStatus.data, existing.converted_at, existing.lost_reason))
    .eq('organization_id', ctx.organization.id)
    .eq('id', leadId);
  if (error) return { ok: false, error: dbErrorMessage(error) };

  revalidateLeads(leadId);
  return { ok: true };
}

/**
 * Pipeline drag-and-drop: new stage + new position in one update.
 * The client computes `position` as the midpoint of the card's new neighbours,
 * so only the moved row is written.
 */
export async function moveLead(input: unknown): Promise<MutationResult> {
  const ctx = await requireContext();
  const parsed = moveLeadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid move.' };
  const { leadId, status, position, lostReason } = parsed.data;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('leads')
    .select('converted_at, lost_reason')
    .eq('organization_id', ctx.organization.id)
    .eq('id', leadId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'This lead no longer exists.' };

  const { error } = await supabase
    .from('leads')
    .update({
      ...statusFields(status, existing.converted_at, lostReason || existing.lost_reason),
      pipeline_position: position,
    })
    .eq('organization_id', ctx.organization.id)
    .eq('id', leadId);
  if (error) return { ok: false, error: dbErrorMessage(error) };

  revalidatePath('/leads');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function assignLead(leadId: string, assigneeId: string | null): Promise<MutationResult> {
  const ctx = await requireContext();
  if (!uuidSchema.safeParse(leadId).success || (assigneeId && !uuidSchema.safeParse(assigneeId).success)) {
    return { ok: false, error: 'Invalid agent.' };
  }

  const supabase = await createClient();
  // The composite FK (organization_id, assigned_to) → memberships guarantees the
  // assignee belongs to this org; we don't need a separate check.
  const { data, error } = await supabase
    .from('leads')
    .update({ assigned_to: assigneeId })
    .eq('organization_id', ctx.organization.id)
    .eq('id', leadId)
    .is('deleted_at', null)
    .select('id');
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, error: 'This lead no longer exists.' };

  revalidateLeads(leadId);
  return { ok: true };
}

/** Soft delete: the lead disappears from lists; its contact is kept. */
export async function deleteLead(leadId: string): Promise<MutationResult> {
  const ctx = await requireContext();
  // RLS allows any member to UPDATE (soft delete is an update), so enforce the
  // same rule as hard deletes here: assistants can't delete.
  if (!['owner', 'admin', 'agent'].includes(ctx.role)) {
    return { ok: false, error: 'Only agents and admins can delete leads.' };
  }
  if (!uuidSchema.safeParse(leadId).success) return { ok: false, error: 'Lead not found.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('organization_id', ctx.organization.id)
    .eq('id', leadId)
    .is('deleted_at', null)
    .select('id');
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, error: 'This lead was already deleted.' };

  revalidateLeads(leadId);
  return { ok: true };
}
