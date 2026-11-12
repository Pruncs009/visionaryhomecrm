'use server';

// Save a deal's key dates straight from the Dates panel on the deal page.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireContext } from '@/features/auth/guards';
import { createClient } from '@/lib/supabase/server';

export type DatesResult = { ok: true } | { ok: false; error?: string; fieldErrors?: Record<string, string[] | undefined> };

const date = z
  .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date.')])
  .optional()
  .transform((v) => v || null);

const datesSchema = z
  .object({
    contract_date: date,
    emd_due_date: date,
    contingency_end_date: date,
    closing_date: date,
  })
  .superRefine((d, ctx) => {
    if (d.contract_date && d.closing_date && d.closing_date < d.contract_date) {
      ctx.addIssue({ code: 'custom', path: ['closing_date'], message: 'Closing must be on or after the ratified date.' });
    }
  });
export type DealDatesInput = z.input<typeof datesSchema>;

export async function updateDealDates(txId: string, input: DealDatesInput): Promise<DatesResult> {
  const ctx = await requireContext();
  if (!z.string().uuid().safeParse(txId).success) return { ok: false, error: 'Deal not found.' };
  const parsed = datesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from('transactions')
    .select('status')
    .eq('organization_id', ctx.organization.id)
    .eq('id', txId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!current) return { ok: false, error: 'This deal no longer exists.' };
  if (current.status === 'closed' && !parsed.data.closing_date) {
    return { ok: false, fieldErrors: { closing_date: ['A closed deal needs a closing date.'] } };
  }

  const { error } = await supabase
    .from('transactions')
    .update(parsed.data)
    .eq('organization_id', ctx.organization.id)
    .eq('id', txId);
  if (error) {
    if (error.code === '23514') return { ok: false, fieldErrors: { closing_date: ['Closing must be on or after the ratified date.'] } };
    if (error.code === '42501') return { ok: false, error: "You don't have permission to do that." };
    console.error('[transactions] dates update failed', error);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
  // Lists show the next deadline too.
  revalidatePath('/', 'layout');
  return { ok: true };
}
