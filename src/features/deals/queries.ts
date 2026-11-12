import { createClient } from '@/lib/supabase/server';
import { DEAL_STAGE_VALUES, type DealStage } from './constants';

/** Deals per stage for the sidebar badges (one grouped query). */
export async function getDealStageCounts(orgId: string): Promise<Partial<Record<DealStage, number>>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('deal_stage_counts', { p_organization_id: orgId });
  if (error) throw new Error(error.message);
  const out: Partial<Record<DealStage, number>> = {};
  for (const row of (data ?? []) as { deal_stage: string; deals: number }[]) {
    if ((DEAL_STAGE_VALUES as readonly string[]).includes(row.deal_stage)) out[row.deal_stage as DealStage] = Number(row.deals);
  }
  return out;
}
