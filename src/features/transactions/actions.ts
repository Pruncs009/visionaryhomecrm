'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireContext } from '@/features/auth/guards';
import type { ActionState } from '@/features/auth/types';
import { createClient } from '@/lib/supabase/server';
import type { TransactionStatus } from '@/types/database.types';
import { z } from 'zod';
import { DEAL_STAGE_VALUES } from '@/features/deals/constants';
import { DEAL_SETUP_TASKS, LM_TASK_DAYS, LM_TASKS, STORAGE_BUCKET } from './constants';

const dealStageSchema = z.enum(DEAL_STAGE_VALUES);
import { recordUploadSchema, transactionFormSchema, txStatusSchema, uuidSchema } from './schemas';

export type MutationResult = { ok: true } | { ok: false; error: string };

const FIELDS = [
  'transaction_id', 'name', 'side', 'status', 'property_mode', 'property_id', 'new_address_line1', 'new_city',
  'new_state', 'new_postal_code', 'list_price', 'buyer_contact_id', 'seller_contact_id', 'buyer_name', 'seller_name',
  'purchase_price', 'agent_id', 'offer_price',
  'sale_price', 'earnest_money', 'commission_rate', 'commission_amount', 'contract_date', 'inspection_deadline',
  'appraisal_deadline', 'financing_deadline', 'closing_date', 'emd_due_date', 'contingency_end_date',
  'bc_contract_date', 'bc_emd_due_date', 'bc_closing_date', 'bc_purchase_price', 'bc_earnest_money',
] as const;

function readForm(formData: FormData) {
  const values: Record<string, string> = {};
  for (const k of FIELDS) {
    const v = formData.get(k);
    values[k] = typeof v === 'string' ? v : '';
  }
  return values;
}

function dbErrorMessage(error: { code?: string; message: string }) {
  if (error.code === '23514' && error.message.includes('closing_after_contract')) return 'Closing must be on or after the ratified date.';
  if (error.code === '23503' && error.message.includes('agent')) return "That agent isn't on your team anymore.";
  if (error.code === '23503') return "One of the selected people or properties isn't in your organization.";
  if (error.code === 'P0002') return 'This transaction no longer exists.';
  if (error.code === '42501') return "You don't have permission to do that.";
  console.error('[transactions] database error', error);
  return 'Something went wrong. Please try again.';
}

function revalidateTransactions(_id?: string) {
  // Whole app: deal-stage pages and the sidebar counts depend on transactions too.
  revalidatePath('/', 'layout');
}

// -----------------------------------------------------------------------------
// Create / edit — one action; a hidden transaction_id field means "edit"
// -----------------------------------------------------------------------------
export async function saveTransaction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const values = readForm(formData);
  const parsed = transactionFormSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values };
  const d = parsed.data;

  const newProperty =
    d.property_mode === 'new'
      ? { address_line1: d.new_address_line1, city: d.new_city, state: d.new_state, postal_code: d.new_postal_code, list_price: d.list_price ?? '' }
      : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_transaction', {
    p_organization_id: ctx.organization.id,
    p_transaction_id: d.transaction_id,
    // Default name = the street address, like most TC software.
    p_name: d.name || (d.property_mode === 'new' ? d.new_address_line1 : formData.get('property_label')?.toString() || 'Transaction'),
    p_side: d.side,
    p_status: d.status,
    p_property_id: d.property_mode === 'existing' ? d.property_id : null,
    p_new_property: newProperty,
    p_buyer_contact_id: d.buyer_contact_id,
    p_seller_contact_id: d.seller_contact_id,
    p_agent_id: d.agent_id,
    p_offer_price: d.offer_price,
    p_sale_price: d.sale_price,
    p_earnest_money: d.earnest_money,
    p_commission_rate: d.commission_rate,
    p_commission_amount: d.commission_amount,
    p_contract_date: d.contract_date,
    p_inspection_deadline: d.inspection_deadline,
    p_appraisal_deadline: d.appraisal_deadline,
    p_financing_deadline: d.financing_deadline,
    p_closing_date: d.closing_date,
  });
  if (error) return { error: dbErrorMessage(error), values };

  const id = data as string;

  // New deal: add the setup checklist (shown as a popup on the deal page).
  if (!d.transaction_id) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: ctx.profile?.timezone || 'America/New_York' }).format(new Date());
    const { error: setupError } = await supabase.from('tasks').insert(
      DEAL_SETUP_TASKS.map((title) => ({
        organization_id: ctx.organization.id,
        transaction_id: id,
        title,
        priority: 'high' as const,
        // Due the day the deal is created (noon UTC = same day in US timezones), so
        // anything left open shows as overdue from tomorrow.
        due_at: `${today}T12:00:00Z`,
        kind: 'deal_setup',
        assignee_role: 'lead_acquisition',
      })),
    );
    if (setupError) console.error('[transactions] could not add setup tasks', setupError);

    // Lead Manager follow-ups: upcoming for a week, overdue after that.
    const [y, m, dd] = today.split('-').map(Number);
    const due = new Date(Date.UTC(y!, m! - 1, dd! + LM_TASK_DAYS, 12)).toISOString();
    const { error: lmError } = await supabase.from('tasks').insert(
      LM_TASKS.map((title) => ({
        organization_id: ctx.organization.id,
        transaction_id: id,
        title,
        priority: 'normal' as const,
        due_at: due,
        kind: 'lm_followup',
        assignee_role: 'lead_manager',
      })),
    );
    if (lmError) console.error('[transactions] could not add Lead Manager tasks', lmError);
  }

  // Columns save_transaction() doesn't know about (migrations 11-12), plus the
  // deal stage for a new deal opened from a deal-stage page.
  const stage = dealStageSchema.safeParse(formData.get('deal_stage'));
  const { error: extraError } = await supabase
    .from('transactions')
    .update({
      buyer_name: d.buyer_name,
      seller_name: d.seller_name,
      purchase_price: d.purchase_price,
      emd_due_date: d.emd_due_date,
      contingency_end_date: d.contingency_end_date,
      bc_contract_date: d.bc_contract_date,
      bc_emd_due_date: d.bc_emd_due_date,
      bc_closing_date: d.bc_closing_date,
      bc_purchase_price: d.bc_purchase_price,
      bc_earnest_money: d.bc_earnest_money,
      ...(!d.transaction_id && stage.success && stage.data !== 'under_contract' ? { deal_stage: stage.data } : {}),
    })
    .eq('organization_id', ctx.organization.id)
    .eq('id', id);
  if (extraError) {
    // The deal itself is saved; report instead of losing the user's input.
    console.error('[transactions] could not save buyer/seller/purchase price', extraError);
    return { error: dbErrorMessage(extraError), values: { ...values, transaction_id: id } };
  }
  revalidateTransactions(id);
  // A new deal opens with the setup checklist popup.
  redirect(d.transaction_id ? `/transactions/${id}` : `/transactions/${id}?setup=1`);
}

// -----------------------------------------------------------------------------
// Quick controls on the detail page
// -----------------------------------------------------------------------------
export async function updateTransactionStatus(id: string, status: string): Promise<MutationResult> {
  const ctx = await requireContext();
  const s = txStatusSchema.safeParse(status);
  if (!uuidSchema.safeParse(id).success || !s.success) return { ok: false, error: 'Invalid status.' };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from('transactions')
    .select('closed_at, closing_date')
    .eq('organization_id', ctx.organization.id)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!current) return { ok: false, error: 'This transaction no longer exists.' };

  const next: TransactionStatus = s.data;
  if (next === 'closed' && !current.closing_date) {
    return { ok: false, error: 'Add a closing date before marking the deal closed.' };
  }
  const { error } = await supabase
    .from('transactions')
    .update({
      status: next,
      closed_at: next === 'closed' ? (current.closed_at ?? new Date().toISOString()) : null,
    })
    .eq('organization_id', ctx.organization.id)
    .eq('id', id);
  if (error) return { ok: false, error: dbErrorMessage(error) };

  revalidateTransactions(id);
  return { ok: true };
}

export async function assignTransactionAgent(id: string, agentId: string | null): Promise<MutationResult> {
  const ctx = await requireContext();
  if (!uuidSchema.safeParse(id).success || (agentId && !uuidSchema.safeParse(agentId).success)) {
    return { ok: false, error: 'Invalid agent.' };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .update({ agent_id: agentId })
    .eq('organization_id', ctx.organization.id)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, error: 'This transaction no longer exists.' };
  revalidateTransactions(id);
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<MutationResult> {
  const ctx = await requireContext();
  if (ctx.role === 'assistant') return { ok: false, error: 'Only agents and admins can delete transactions.' };
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: 'Transaction not found.' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('organization_id', ctx.organization.id)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, error: 'This transaction was already deleted.' };
  revalidateTransactions(id);
  return { ok: true };
}

/** Deleted menu: put a deleted deal back where it was. */
export async function restoreTransaction(id: string): Promise<MutationResult> {
  const ctx = await requireContext();
  if (ctx.role === 'assistant') return { ok: false, error: 'Only agents and admins can restore transactions.' };
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: 'Transaction not found.' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .update({ deleted_at: null })
    .eq('organization_id', ctx.organization.id)
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .select('id');
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, error: 'This deal is not in Deleted.' };
  revalidateTransactions(id);
  return { ok: true };
}

/**
 * Deleted menu: remove a deleted deal for good — the deal, its tasks, notes,
 * documents (and their stored files) and people links. Contacts and the property
 * record stay. Only deals already in Deleted can be removed this way.
 */
export async function purgeTransaction(id: string): Promise<MutationResult> {
  const ctx = await requireContext();
  if (ctx.role === 'assistant') return { ok: false, error: 'Only agents and admins can permanently delete transactions.' };
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: 'Transaction not found.' };
  const org = ctx.organization.id;
  const supabase = await createClient();

  const { data: tx } = await supabase
    .from('transactions')
    .select('id')
    .eq('organization_id', org)
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .maybeSingle();
  if (!tx) return { ok: false, error: 'Only deals in Deleted can be permanently deleted.' };

  // Stored files first (the file rows go with the deal).
  const { data: files } = await supabase.from('files').select('bucket_id, storage_path').eq('organization_id', org).eq('transaction_id', id);
  const byBucket = new Map<string, string[]>();
  for (const f of (files ?? []) as { bucket_id: string; storage_path: string }[]) {
    byBucket.set(f.bucket_id, [...(byBucket.get(f.bucket_id) ?? []), f.storage_path]);
  }
  for (const [bucket, paths] of byBucket) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) console.error('[transactions] could not remove stored files', error);
  }

  // Tasks only lose their link when a deal is deleted, so remove them explicitly.
  const { error: taskError } = await supabase.from('tasks').delete().eq('organization_id', org).eq('transaction_id', id);
  if (taskError) return { ok: false, error: dbErrorMessage(taskError) };

  const { data, error } = await supabase.from('transactions').delete().eq('organization_id', org).eq('id', id).select('id');
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, error: 'This deal was already removed.' };
  revalidateTransactions(id);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Documents. The browser uploads straight to Storage (RLS: first path segment
// must be the user's org). These actions record / sign / delete.
// -----------------------------------------------------------------------------
export async function recordTransactionUpload(input: unknown): Promise<MutationResult> {
  const ctx = await requireContext();
  const parsed = recordUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid upload.' };
  const f = parsed.data;

  // The path must live under this org + this transaction; never trust the client.
  const prefix = `${ctx.organization.id}/transactions/${f.transactionId}/`;
  if (!f.path.startsWith(prefix) || f.path.includes('..')) return { ok: false, error: 'Invalid upload path.' };

  const supabase = await createClient();
  const { error } = await supabase.from('files').insert({
    organization_id: ctx.organization.id,
    transaction_id: f.transactionId,
    bucket_id: STORAGE_BUCKET,
    storage_path: f.path,
    file_name: f.fileName,
    mime_type: f.mimeType || null,
    size_bytes: f.size,
    category: f.category,
  });
  if (error) {
    // Don't leave an orphaned object in Storage if the row can't be written.
    await supabase.storage.from(STORAGE_BUCKET).remove([f.path]);
    return { ok: false, error: dbErrorMessage(error) };
  }
  revalidateTransactions(f.transactionId);
  return { ok: true };
}

/** Short-lived (60s) signed link; the bucket itself is private. */
export async function getFileDownloadUrl(fileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ctx = await requireContext();
  if (!uuidSchema.safeParse(fileId).success) return { ok: false, error: 'File not found.' };
  const supabase = await createClient();
  const { data: file } = await supabase
    .from('files')
    .select('bucket_id, storage_path, file_name')
    .eq('organization_id', ctx.organization.id)
    .eq('id', fileId)
    .maybeSingle();
  if (!file) return { ok: false, error: 'File not found.' };

  const { data, error } = await supabase.storage
    .from(file.bucket_id as string)
    .createSignedUrl(file.storage_path as string, 60, { download: file.file_name as string });
  if (error || !data) return { ok: false, error: 'Could not create a download link.' };
  return { ok: true, url: data.signedUrl };
}

/**
 * Short-lived (5 min) link to view a document inside the app (no "download"
 * header, so PDFs and images open in the preview window).
 */
export async function getFilePreviewUrl(fileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ctx = await requireContext();
  if (!uuidSchema.safeParse(fileId).success) return { ok: false, error: 'File not found.' };
  const supabase = await createClient();
  const { data: file } = await supabase
    .from('files')
    .select('bucket_id, storage_path')
    .eq('organization_id', ctx.organization.id)
    .eq('id', fileId)
    .maybeSingle();
  if (!file) return { ok: false, error: 'File not found.' };
  const { data, error } = await supabase.storage.from(file.bucket_id as string).createSignedUrl(file.storage_path as string, 300);
  if (error || !data) return { ok: false, error: 'Could not open the file.' };
  return { ok: true, url: data.signedUrl };
}

export async function deleteTransactionFile(transactionId: string, fileId: string): Promise<MutationResult> {
  const ctx = await requireContext();
  if (ctx.role === 'assistant') return { ok: false, error: 'Only agents and admins can delete documents.' };
  if (!uuidSchema.safeParse(fileId).success) return { ok: false, error: 'File not found.' };
  const supabase = await createClient();
  const { data: file } = await supabase
    .from('files')
    .select('bucket_id, storage_path')
    .eq('organization_id', ctx.organization.id)
    .eq('id', fileId)
    .maybeSingle();
  if (!file) return { ok: false, error: 'File not found.' };

  const { error: storageError } = await supabase.storage.from(file.bucket_id as string).remove([file.storage_path as string]);
  if (storageError) return { ok: false, error: 'Could not delete the file from storage.' };
  const { error } = await supabase.from('files').delete().eq('organization_id', ctx.organization.id).eq('id', fileId);
  if (error) return { ok: false, error: dbErrorMessage(error) };
  revalidateTransactions(transactionId);
  return { ok: true };
}
