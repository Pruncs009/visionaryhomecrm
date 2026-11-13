'use server';

// Tasks and notes on a deal (the Tasks / Notes tabs of the deal workspace).
//
// Form actions (add task / add note) don't revalidatePath(): in production builds
// a useActionState action that revalidates without redirecting left the form stuck
// "pending" (see contacts/actions.ts addNote). The forms call router.refresh().

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireContext } from '@/features/auth/guards';
import type { ActionState } from '@/features/auth/types';
import { getTeamMembers } from '@/features/leads/queries';
import { findMentions } from '@/features/notifications/mentions';
import { createClient } from '@/lib/supabase/server';
import { getTransaction } from './queries';
import { taskBlocker } from './task-requirements';
import type { DealNote } from './types';

export type MutationResult = { ok: true } | { ok: false; error: string };

const uuid = z.string().uuid();
const taskSchema = z.object({
  title: z.string().trim().min(1, 'Give the task a name.').max(200, 'Keep it under 200 characters.'),
  due: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date.')]),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  assigned_to: z.union([z.literal(''), uuid]),
});
const noteSchema = z.object({
  body: z.string().trim().min(1, 'Write something first.').max(20000, 'That note is too long.'),
});

const path = (txId: string) => `/transactions/${txId}`;
const canDelete = (role: string) => role !== 'assistant';

function dbError(error: { code?: string; message: string }) {
  if (error.code === '23503') return "That deal or team member isn't in your organization.";
  if (error.code === '42501') return "You don't have permission to do that.";
  return 'Something went wrong. Please try again.';
}

// -----------------------------------------------------------------------------
// Tasks
// -----------------------------------------------------------------------------
export async function addDealTask(txId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireContext();
  const values = {
    title: String(formData.get('title') ?? ''),
    due: String(formData.get('due') ?? ''),
    priority: String(formData.get('priority') ?? 'normal'),
    assigned_to: String(formData.get('assigned_to') ?? ''),
  };
  if (!uuid.safeParse(txId).success) return { error: 'Deal not found.' };
  const parsed = taskSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values };

  const supabase = await createClient();
  const { error } = await supabase.from('tasks').insert({
    organization_id: ctx.organization.id,
    transaction_id: txId,
    title: parsed.data.title,
    priority: parsed.data.priority,
    // Noon UTC lands on the same calendar day in every US timezone.
    due_at: parsed.data.due ? `${parsed.data.due}T12:00:00Z` : null,
    assigned_to: parsed.data.assigned_to || null,
  });
  if (error) return { error: dbError(error), values };
  return { success: 'Task added' };
}

export async function setDealTaskDone(txId: string, taskId: string, done: boolean): Promise<MutationResult> {
  const ctx = await requireContext();
  if (!uuid.safeParse(taskId).success || !uuid.safeParse(txId).success) return { ok: false, error: 'Task not found.' };
  const supabase = await createClient();

  // Checklist tasks can only be completed once their information is on the deal.
  if (done) {
    const [{ data: task }, tx, { data: parties }] = await Promise.all([
      supabase.from('tasks').select('title, kind').eq('organization_id', ctx.organization.id).eq('transaction_id', txId).eq('id', taskId).maybeSingle(),
      getTransaction(ctx.organization.id, txId),
      supabase.from('deal_parties').select('role').eq('organization_id', ctx.organization.id).eq('transaction_id', txId),
    ]);
    if (!task || !tx) return { ok: false, error: 'Task not found.' };
    const blocker = taskBlocker(
      { title: task.title as string, kind: (task.kind as string | null) ?? null },
      { tx, partyRoles: (parties ?? []).map((p) => p.role as string) },
    );
    if (blocker) return { ok: false, error: blocker };
  }

  const { error } = await supabase
    .from('tasks')
    .update({ status: done ? 'done' : 'todo' })
    .eq('organization_id', ctx.organization.id)
    .eq('transaction_id', txId)
    .eq('id', taskId);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath(path(txId));
  return { ok: true };
}

export async function deleteDealTask(txId: string, taskId: string): Promise<MutationResult> {
  const ctx = await requireContext();
  if (!canDelete(ctx.role)) return { ok: false, error: 'Only agents and admins can delete tasks.' };
  if (!uuid.safeParse(taskId).success) return { ok: false, error: 'Task not found.' };
  const supabase = await createClient();
  // Kept as a cancelled task so the Timeline can show when it was deleted.
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'cancelled', deleted_at: new Date().toISOString() })
    .eq('organization_id', ctx.organization.id)
    .eq('transaction_id', txId)
    .eq('id', taskId);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath(path(txId));
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Notes
// -----------------------------------------------------------------------------
export type NoteActionState = ActionState & { note?: DealNote };

/** Returns the saved note so the list can show it at once (router.refresh() alone didn't reliably re-render it). */
export async function addDealNote(txId: string, _prev: NoteActionState, formData: FormData): Promise<NoteActionState> {
  const ctx = await requireContext();
  const body = String(formData.get('body') ?? '');
  if (!uuid.safeParse(txId).success) return { error: 'Deal not found.' };
  const parsed = noteSchema.safeParse({ body });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values: { body } };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notes')
    .insert({ organization_id: ctx.organization.id, transaction_id: txId, body: parsed.data.body })
    .select('id, body, is_pinned, created_at')
    .single();
  if (error || !data) return { error: error ? dbError(error) : 'Something went wrong. Please try again.', values: { body } };
  // A notification problem must never lose the note.
  await notifyNoteMentions(ctx, txId, parsed.data.body).catch((e) => console.error('[notes] mention notifications failed', e));
  return {
    success: 'Note added',
    note: {
      id: data.id as string,
      body: data.body as string,
      isPinned: !!data.is_pinned,
      createdAt: data.created_at as string,
      authorName: ctx.profile?.full_name ?? null,
    },
  };
}

/** "@Name" in a deal note → a bell notification for that teammate. */
async function notifyNoteMentions(ctx: Awaited<ReturnType<typeof requireContext>>, txId: string, body: string) {
  if (!body.includes('@')) return;
  const org = ctx.organization.id;
  const team = (await getTeamMembers(org)).filter((m) => m.userId !== ctx.userId);
  const mentioned = findMentions(body, team);
  if (!mentioned.length) return;
  const tx = await getTransaction(org, txId);
  const actor = ctx.profile?.full_name?.trim() || ctx.email;
  const where = tx?.property_address ? ` on ${tx.property_address}` : '';
  const supabase = await createClient();
  const { error } = await supabase.from('notifications').insert(
    mentioned.map((m) => ({
      organization_id: org,
      user_id: m.userId,
      actor_id: ctx.userId,
      kind: 'note_mention',
      title: `${actor} mentioned you in a note${where}`.slice(0, 200),
      body: body.slice(0, 300),
      link: `/transactions/${txId}?tab=notes`,
    })),
  );
  if (error) throw new Error(error.message);
}

export async function setDealNotePinned(txId: string, noteId: string, pinned: boolean): Promise<MutationResult> {
  const ctx = await requireContext();
  if (!uuid.safeParse(noteId).success) return { ok: false, error: 'Note not found.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('notes')
    .update({ is_pinned: pinned })
    .eq('organization_id', ctx.organization.id)
    .eq('transaction_id', txId)
    .eq('id', noteId);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath(path(txId));
  return { ok: true };
}

export async function deleteDealNote(txId: string, noteId: string): Promise<MutationResult> {
  const ctx = await requireContext();
  if (!canDelete(ctx.role)) return { ok: false, error: 'Only agents and admins can delete notes.' };
  if (!uuid.safeParse(noteId).success) return { ok: false, error: 'Note not found.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('organization_id', ctx.organization.id)
    .eq('transaction_id', txId)
    .eq('id', noteId);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath(path(txId));
  return { ok: true };
}
