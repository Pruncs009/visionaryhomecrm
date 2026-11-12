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
const HEADER_FIELDS = {
  campaign_name: text(200),
  deal_type: text(100),
  lead_manager: text(200),
  acquisition_manager: text(200),
  purchase_price: z
    .string()
    .trim()
    .transform((s) => s.replace(/[$,\s]/g, ''))
    .refine((s) => s === '' || (/^\d+(\.\d{1,2})?$/.test(s) && Number(s) < 1e12), 'Enter a dollar amount, e.g. 250000.')
    .transform((s) => (s === '' ? null : Number(s))),
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
