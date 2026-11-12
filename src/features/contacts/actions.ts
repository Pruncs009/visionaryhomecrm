'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireContext } from '@/features/auth/guards';
import type { ActionState } from '@/features/auth/types';
import { createClient } from '@/lib/supabase/server';
import {
  contactFormSchema,
  importBatchSchema,
  logActivitySchema,
  noteSchema,
  tagSchema,
  uuidSchema,
} from './schemas';
import type { ImportResult } from './types';

export type MutationResult = { ok: true } | { ok: false; error: string };

const CONTACT_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'mobile_phone', 'company', 'job_title', 'address_line1',
  'address_line2', 'city', 'state', 'postal_code', 'birthday', 'source', 'preferred_contact_method',
  'do_not_contact', 'owner_id', 'tags',
] as const;

function readForm(formData: FormData) {
  const values: Record<string, string> = {};
  for (const key of CONTACT_FIELDS) {
    const v = formData.get(key);
    values[key] = typeof v === 'string' ? v : '';
  }
  return values;
}

function dbErrorMessage(error: { code?: string; message: string }) {
  switch (error.code) {
    case '23503':
      return "That team member isn't in your organization.";
    case '23514':
      return error.message.includes('email') ? 'That email address looks invalid.' : 'Some values are invalid.';
    case '42501':
      return "You don't have permission to do that.";
    default:
      console.error('[contacts] database error', error);
      return 'Something went wrong. Please try again.';
  }
}

function revalidateContact(contactId?: string) {
  revalidatePath('/contacts');
  if (contactId) revalidatePath(`/contacts/${contactId}`);
}

const canDelete = (role: string) => role !== 'assistant';

// -----------------------------------------------------------------------------
// Create / edit / delete
// -----------------------------------------------------------------------------
export async function createContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const values = readForm(formData);
  const parsed = contactFormSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('contacts')
    .insert({ ...parsed.data, organization_id: ctx.organization.id })
    .select('id')
    .single();
  if (error) return { error: dbErrorMessage(error), values };

  revalidateContact();
  redirect(`/contacts/${data.id}`);
}

export async function updateContact(contactId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const values = readForm(formData);
  if (!uuidSchema.safeParse(contactId).success) return { error: 'Contact not found.', values };
  const parsed = contactFormSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values };

  // Tags are edited inline on the detail page (TagEditor), not in this form —
  // never let an empty form field wipe them.
  const { tags: _ignored, ...fields } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('contacts')
    .update(fields)
    .eq('organization_id', ctx.organization.id)
    .eq('id', contactId)
    .is('deleted_at', null)
    .select('id');
  if (error) return { error: dbErrorMessage(error), values };
  if (!data?.length) return { error: 'This contact no longer exists.', values };

  revalidateContact(contactId);
  redirect(`/contacts/${contactId}`);
}

/** Soft delete. Leads/notes stay in the database but the contact leaves every list. */
export async function deleteContact(contactId: string): Promise<MutationResult> {
  const ctx = await requireContext();
  if (!canDelete(ctx.role)) return { ok: false, error: 'Only agents and admins can delete contacts.' };
  if (!uuidSchema.safeParse(contactId).success) return { ok: false, error: 'Contact not found.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('contacts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('organization_id', ctx.organization.id)
    .eq('id', contactId)
    .is('deleted_at', null)
    .select('id');
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, error: 'This contact was already deleted.' };

  revalidateContact(contactId);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Tags
// -----------------------------------------------------------------------------
async function setTags(contactId: string, change: (tags: string[]) => string[]): Promise<MutationResult> {
  const ctx = await requireContext();
  if (!uuidSchema.safeParse(contactId).success) return { ok: false, error: 'Contact not found.' };
  const supabase = await createClient();

  const { data: current, error: readError } = await supabase
    .from('contacts')
    .select('tags')
    .eq('organization_id', ctx.organization.id)
    .eq('id', contactId)
    .is('deleted_at', null)
    .maybeSingle();
  if (readError) return { ok: false, error: dbErrorMessage(readError) };
  if (!current) return { ok: false, error: 'This contact no longer exists.' };

  const next = change((current.tags as string[]) ?? []);
  const { error } = await supabase
    .from('contacts')
    .update({ tags: next })
    .eq('organization_id', ctx.organization.id)
    .eq('id', contactId);
  if (error) return { ok: false, error: dbErrorMessage(error) };

  revalidateContact(contactId);
  return { ok: true };
}

export async function addContactTag(contactId: string, rawTag: string): Promise<MutationResult> {
  const parsed = tagSchema.safeParse(rawTag);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid tag' };
  const tag = parsed.data;
  return setTags(contactId, (tags) => (tags.includes(tag) ? tags : [...tags, tag].slice(0, 30)));
}

export async function removeContactTag(contactId: string, tag: string): Promise<MutationResult> {
  return setTags(contactId, (tags) => tags.filter((t) => t !== tag));
}

// -----------------------------------------------------------------------------
// Notes
// -----------------------------------------------------------------------------
export async function addNote(contactId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const body = String(formData.get('body') ?? '');
  if (!uuidSchema.safeParse(contactId).success) return { error: 'Contact not found.' };
  const parsed = noteSchema.safeParse({ body });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values: { body } };

  const supabase = await createClient();
  const { error } = await supabase.from('notes').insert({
    organization_id: ctx.organization.id,
    contact_id: contactId,
    body: parsed.data.body,
  });
  if (error) return { error: dbErrorMessage(error), values: { body } };

  // No revalidatePath() here on purpose: in production builds (Next 15.5), a
  // useActionState form action that revalidates WITHOUT redirecting left the
  // form stuck "pending" in our browser tests. The form calls router.refresh()
  // on success instead, which re-renders the same data reliably.
  return { success: 'Note added' };
}

export async function toggleNotePin(contactId: string, noteId: string, pinned: boolean): Promise<MutationResult> {
  const ctx = await requireContext();
  if (!uuidSchema.safeParse(noteId).success) return { ok: false, error: 'Note not found.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('notes')
    .update({ is_pinned: pinned })
    .eq('organization_id', ctx.organization.id)
    .eq('id', noteId);
  if (error) return { ok: false, error: dbErrorMessage(error) };
  revalidateContact(contactId);
  return { ok: true };
}

export async function deleteNote(contactId: string, noteId: string): Promise<MutationResult> {
  const ctx = await requireContext();
  if (!canDelete(ctx.role)) return { ok: false, error: 'Only agents and admins can delete notes.' };
  if (!uuidSchema.safeParse(noteId).success) return { ok: false, error: 'Note not found.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('organization_id', ctx.organization.id)
    .eq('id', noteId);
  if (error) return { ok: false, error: dbErrorMessage(error) };
  revalidateContact(contactId);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Activity: manual call / email / text / meeting log
// (everything else is written by database triggers)
// -----------------------------------------------------------------------------
export async function logActivity(contactId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const values = {
    type: String(formData.get('type') ?? ''),
    summary: String(formData.get('summary') ?? ''),
    occurred_at: String(formData.get('occurred_at') ?? ''),
  };
  if (!uuidSchema.safeParse(contactId).success) return { error: 'Contact not found.' };
  const parsed = logActivitySchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values };

  const supabase = await createClient();
  const { error } = await supabase.from('activities').insert({
    organization_id: ctx.organization.id,
    contact_id: contactId,
    actor_id: ctx.userId, // RLS requires actor_id = auth.uid()
    type: parsed.data.type,
    summary: parsed.data.summary,
    occurred_at: parsed.data.occurred_at,
  });
  if (error) return { error: dbErrorMessage(error), values };

  // See addNote: the form refreshes on success instead of revalidating here.
  return { success: 'Activity logged' };
}

// -----------------------------------------------------------------------------
// CSV import — called once per batch by the import wizard
// -----------------------------------------------------------------------------
export async function importContactsBatch(
  input: unknown,
): Promise<{ ok: true; result: ImportResult } | { ok: false; error: string }> {
  const ctx = await requireContext();
  const parsed = importBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'The import data is invalid. Re-upload the file and try again.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('import_contacts', {
    p_organization_id: ctx.organization.id,
    p_rows: parsed.data.rows,
    p_on_duplicate: parsed.data.onDuplicate,
    p_tags: parsed.data.tags,
  });
  if (error) return { ok: false, error: dbErrorMessage(error) };

  revalidatePath('/contacts');
  return { ok: true, result: data as ImportResult };
}
