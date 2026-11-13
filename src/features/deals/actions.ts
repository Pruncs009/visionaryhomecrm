'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireContext } from '@/features/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { DEAL_STAGE_VALUES } from './constants';

const input = z.object({ id: z.string().uuid(), stage: z.enum(DEAL_STAGE_VALUES) });

/**
 * Move a deal to another stage. The database trigger keeps `status` in step
 * (Closed Deals → closed, Dead Deals → cancelled), so reports stay correct.
 */
export async function updateDealStage(id: string, stage: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireContext();
  const parsed = input.safeParse({ id, stage });
  if (!parsed.success) return { ok: false, error: 'Invalid stage.' };

  const supabase = await createClient();
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
export async function updateEmdIn(id: string, value: 'yes' | 'no' | ''): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireContext();
  if (!z.string().uuid().safeParse(id).success || !['yes', 'no', ''].includes(value)) return { ok: false, error: 'Invalid value.' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .update({ emd_in: value === '' ? null : value === 'yes' })
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
