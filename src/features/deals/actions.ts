'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireContext } from '@/features/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { BC_SETUP_TASKS } from '@/features/transactions/constants';
import { DEAL_STAGE_VALUES } from './constants';

const input = z.object({ id: z.string().uuid(), stage: z.enum(DEAL_STAGE_VALUES) });

/**
 * Move a deal to another stage. The database trigger keeps `status` in step
 * (Closed Deals → closed, Dead Deals → cancelled), so reports stay correct.
 */
export async function updateDealStage(
  id: string,
  stage: string,
): Promise<{ ok: true; copyId?: string } | { ok: false; error: string }> {
  const ctx = await requireContext();
  const parsed = input.safeParse({ id, stage });
  if (!parsed.success) return { ok: false, error: 'Invalid stage.' };

  const supabase = await createClient();

  // A-B Closing → B-C Closing: the A-B deal stays put and a B-C copy is made.
  if (parsed.data.stage === 'bc_closing') {
    const { data: current } = await supabase
      .from('transactions')
      .select('deal_stage')
      .eq('organization_id', ctx.organization.id)
      .eq('id', parsed.data.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (current?.deal_stage === 'ab_closing') {
      const r = await createBcCopy(ctx.organization.id, parsed.data.id, ctx.profile?.timezone || 'America/New_York');
      if (!r.ok) return r;
      revalidatePath('/', 'layout');
      return { ok: true, copyId: r.id };
    }
  }

  const { data, error } = await supabase
    .from('transactions')
    .update({ deal_stage: parsed.data.stage })
    .eq('organization_id', ctx.organization.id)
    .eq('id', parsed.data.id)
    .is('deleted_at', null)
    .select('id');
  if (error) {
    console.error('[deals] stage update failed', error);
    return { ok: false, error: error.code === '42501' ? "You don't have permission to do that." : 'Something went wrong. Please try again.' };
  }
  if (!data?.length) return { ok: false, error: 'This deal no longer exists.' };

  // Layout too: the sidebar counts change.
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Kept on the B-C copy: everything except prices, dates, parties and escrow. */
const COPIED_COLUMNS = [
  'name', 'side', 'property_id', 'agent_id',
  'campaign_name', 'channel', 'deal_type', 'occupancy', 'ownership_type', 'ethnicity',
  'lead_manager', 'acquisition_manager', 'transaction_coordinator',
  'prop_last_sold_prior', 'prop_seller_age', 'prop_equity', 'prop_stories', 'prop_beds', 'prop_baths',
  'prop_bldg_sqft', 'prop_lot_size', 'prop_year_built', 'prop_county',
  'contingency_type', 'occupancy_strategy', 'lockbox_code', 'arv_estimate', 'rehab_estimate', 'photos_link',
] as const;

/**
 * Make the B-C deal from an A-B deal: same property, header, team members and
 * deal details; blank purchase price, EMD, dates, buyer/seller, collaborators
 * and escrow type/#; plus the B-C setup checklist. If a B-C copy already exists
 * for this deal, that one is returned instead of making another.
 */
async function createBcCopy(orgId: string, sourceId: string, timezone: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('organization_id', orgId)
    .eq('source_transaction_id', sourceId)
    .eq('deal_stage', 'bc_closing')
    .is('deleted_at', null)
    .limit(1);
  if (existing?.[0]) return { ok: true, id: existing[0].id as string };

  const { data: src, error: srcError } = await supabase
    .from('transactions')
    .select(COPIED_COLUMNS.join(', '))
    .eq('organization_id', orgId)
    .eq('id', sourceId)
    .maybeSingle();
  if (srcError || !src) {
    if (srcError) console.error('[deals] could not read deal to copy', srcError);
    return { ok: false, error: 'This deal no longer exists.' };
  }

  const { data: copy, error } = await supabase
    .from('transactions')
    .insert({
      ...(src as unknown as Record<string, unknown>),
      organization_id: orgId,
      status: 'under_contract',
      deal_stage: 'bc_closing',
      source_transaction_id: sourceId,
    })
    .select('id')
    .single();
  if (error || !copy) {
    console.error('[deals] could not create B-C copy', error);
    return { ok: false, error: error?.code === '42501' ? "You don't have permission to do that." : 'Could not create the B-C deal. Please try again.' };
  }
  const id = copy.id as string;

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const { error: taskError } = await supabase.from('tasks').insert(
    BC_SETUP_TASKS.map((title) => ({
      organization_id: orgId,
      transaction_id: id,
      title,
      priority: 'high' as const,
      due_at: `${today}T12:00:00Z`,
      kind: 'deal_setup',
      assignee_role: 'lead_acquisition',
    })),
  );
  if (taskError) console.error('[deals] could not add B-C setup tasks', taskError);

  // Lead Manager follow-ups that aren't done yet come along (same due date), so
  // they stay upcoming / overdue on the B-C deal too.
  const { data: lmOpen } = await supabase
    .from('tasks')
    .select('title, priority, due_at')
    .eq('organization_id', orgId)
    .eq('transaction_id', sourceId)
    .eq('kind', 'lm_followup')
    .in('status', ['todo', 'in_progress']);
  if (lmOpen?.length) {
    const { error: lmError } = await supabase.from('tasks').insert(
      (lmOpen as { title: string; priority: string; due_at: string | null }[]).map((t) => ({
        organization_id: orgId,
        transaction_id: id,
        title: t.title,
        priority: t.priority,
        due_at: t.due_at,
        kind: 'lm_followup',
        assignee_role: 'lead_manager',
      })),
    );
    if (lmError) console.error('[deals] could not copy Lead Manager tasks', lmError);
  }
  return { ok: true, id };
}

// -----------------------------------------------------------------------------
// Inline-editable header fields on the deal page
// -----------------------------------------------------------------------------
const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`).transform((s) => s || null);
const money = z
  .string()
  .trim()
  .transform((s) => s.replace(/[$,\s]/g, ''))
  .refine((s) => s === '' || (/^\d+(\.\d{1,2})?$/.test(s) && Number(s) < 1e12), 'Enter a dollar amount, e.g. 250000.')
  .transform((s) => (s === '' ? null : Number(s)));
const HEADER_FIELDS = {
  campaign_name: text(200),
  deal_type: text(100),
  lead_manager: text(200),
  acquisition_manager: text(200),
  transaction_coordinator: text(200),
  purchase_price: money,
  earnest_money: money,
  bc_purchase_price: money,
  bc_earnest_money: money,
  // Deal details panel
  contingency_type: text(200),
  escrow_type: text(200),
  escrow_number: text(100),
  occupancy_strategy: text(500),
  lockbox_code: text(100),
  arv_estimate: money,
  rehab_estimate: money,
  photos_link: text(2000),
  // Header: channel and seller profile
  channel: text(200),
  occupancy: text(200),
  ownership_type: text(100),
  ethnicity: text(100),
  // Property details under the address (free text)
  prop_last_sold_prior: text(200),
  prop_seller_age: text(200),
  prop_equity: text(200),
  prop_stories: text(200),
  prop_beds: text(200),
  prop_baths: text(200),
  prop_bldg_sqft: text(200),
  prop_lot_size: text(200),
  prop_year_built: text(200),
  prop_county: text(200),
} as const;
export type DealHeaderField = keyof typeof HEADER_FIELDS;

export async function updateDealHeaderField(
  id: string,
  field: DealHeaderField,
  value: string,
): Promise<{ ok: true; value: string | number | null } | { ok: false; error: string }> {
  const ctx = await requireContext();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Deal not found.' };
  if (!Object.prototype.hasOwnProperty.call(HEADER_FIELDS, field)) return { ok: false, error: 'Unknown field.' };
  const parsed = HEADER_FIELDS[field].safeParse(value);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid value.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .update({ [field]: parsed.data })
    .eq('organization_id', ctx.organization.id)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) {
    console.error('[deals] header field update failed', field, error);
    return { ok: false, error: error.code === '42501' ? "You don't have permission to do that." : 'Something went wrong. Please try again.' };
  }
  if (!data?.length) return { ok: false, error: 'This deal no longer exists.' };

  revalidatePath(`/transactions/${id}`);
  return { ok: true, value: parsed.data };
}

/** "IN" next to the EMD on the deal header: is the earnest money deposit in? */
export async function updateEmdIn(
  id: string,
  value: 'yes' | 'no' | '',
  leg: 'ab' | 'bc' = 'ab',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireContext();
  if (!z.string().uuid().safeParse(id).success || !['yes', 'no', ''].includes(value) || !['ab', 'bc'].includes(leg)) {
    return { ok: false, error: 'Invalid value.' };
  }
  const column = leg === 'bc' ? 'bc_emd_in' : 'emd_in';
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .update({ [column]: value === '' ? null : value === 'yes' })
    .eq('organization_id', ctx.organization.id)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) {
    console.error('[deals] emd_in update failed', error);
    return { ok: false, error: error.code === '42501' ? "You don't have permission to do that." : 'Something went wrong. Please try again.' };
  }
  if (!data?.length) return { ok: false, error: 'This deal no longer exists.' };
  revalidatePath(`/transactions/${id}`);
  return { ok: true };
}
