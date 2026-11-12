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
