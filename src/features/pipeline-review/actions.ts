'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireContext } from '@/features/auth/guards';
import { appendPipelineRow, sheetsConfig, SheetsError, updatePipelineCell } from '@/lib/google/sheets';

export type PipelineResult = { ok: true } | { ok: false; error: string; conflict?: boolean };

const cellInput = z.object({
  rowNumber: z.number().int().min(2).max(100000),
  column: z.number().int().min(0).max(701),
  value: z.string().max(50000),
  expected: z.string().max(50000),
});

/** Edit one cell of the Google Sheet from the Pipeline Review Tracker. */
export async function savePipelineCell(input: z.input<typeof cellInput>): Promise<PipelineResult> {
  await requireContext();
  const cfg = sheetsConfig();
  if (!cfg) return { ok: false, error: 'The Google Sheet is not connected yet.' };
  const parsed = cellInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid cell.' };
  const d = parsed.data;
  try {
    const r = await updatePipelineCell(cfg, d.rowNumber, d.column, d.value, d.expected);
    if (!r.ok) return { ok: false, conflict: true, error: `Someone changed this cell in Google Sheets (now "${r.current}"). The latest version has been loaded.` };
  } catch (e) {
    console.error('[pipeline-review] cell update failed', e);
    return { ok: false, error: e instanceof SheetsError ? e.message : 'Could not save to Google Sheets.' };
  }
  revalidatePath('/pipeline-review');
  return { ok: true };
}

/** Add a row to the bottom of the Google Sheet. */
export async function addPipelineRow(values: string[]): Promise<PipelineResult> {
  await requireContext();
  const cfg = sheetsConfig();
  if (!cfg) return { ok: false, error: 'The Google Sheet is not connected yet.' };
  const clean = z.array(z.string().max(50000)).max(702).safeParse(values);
  if (!clean.success || !clean.data.some((v) => v.trim())) return { ok: false, error: 'Fill in at least one field.' };
  try {
    await appendPipelineRow(cfg, clean.data);
  } catch (e) {
    console.error('[pipeline-review] append failed', e);
    return { ok: false, error: e instanceof SheetsError ? e.message : 'Could not add the row to Google Sheets.' };
  }
  revalidatePath('/pipeline-review');
  return { ok: true };
}
