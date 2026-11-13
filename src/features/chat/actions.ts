'use server';

import { z } from 'zod';
import { requireContext } from '@/features/auth/guards';
import { getTeamMembers } from '@/features/leads/queries';
import { createClient } from '@/lib/supabase/server';
import {
  CHAT_BUCKET,
  CHAT_MAX_FILES,
  CHAT_MAX_FILE_BYTES,
  type ChatAttachment,
  type ChatAttachmentView,
  type ChatContact,
  type ChatMessage,
  type ChatResult,
} from './types';

const uuid = z.string().uuid();
const COLUMNS = 'id, sender_id, recipient_id, body, attachments, created_at, read_at';
const LIMIT = 200;

type Row = { id: string; sender_id: string; recipient_id: string; body: string; attachments: ChatAttachment[] | null; created_at: string; read_at: string | null };

const fail = (error: string): ChatResult<never> => ({ ok: false, error });

/** Signed links for every attachment (one call per batch). */
async function withLinks(supabase: Awaited<ReturnType<typeof createClient>>, rows: Row[]): Promise<ChatMessage[]> {
  const paths = [...new Set(rows.flatMap((r) => (r.attachments ?? []).map((a) => a.path)))];
  const view = new Map<string, string | null>();
  const download = new Map<string, string | null>();
  if (paths.length) {
    const bucket = supabase.storage.from(CHAT_BUCKET);
    const [signed, signedDl] = await Promise.all([bucket.createSignedUrls(paths, 3600), bucket.createSignedUrls(paths, 3600, { download: true })]);
    for (const s of signed.data ?? []) if (s.path) view.set(s.path, s.signedUrl ?? null);
    for (const s of signedDl.data ?? []) if (s.path) download.set(s.path, s.signedUrl ?? null);
  }
  return rows.map((r) => ({
    id: r.id,
    senderId: r.sender_id,
    recipientId: r.recipient_id,
    body: r.body,
    createdAt: r.created_at,
    readAt: r.read_at,
    attachments: (r.attachments ?? []).map(
      (a): ChatAttachmentView => ({ ...a, url: view.get(a.path) ?? null, downloadUrl: download.get(a.path) ?? null }),
    ),
  }));
}

/** Teammates for the "To" list, with unread counts and the latest message with each. */
export async function getChatContacts(): Promise<ChatResult<{ contacts: ChatContact[]; unread: number }>> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const me = ctx.userId;
  const [members, recent] = await Promise.all([
    getTeamMembers(ctx.organization.id),
    // Latest messages either way (RLS limits this to conversations I'm in).
    supabase
      .from('direct_messages')
      .select('sender_id, recipient_id, body, attachments, created_at, read_at')
      .eq('organization_id', ctx.organization.id)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);
  if (recent.error) return fail(recent.error.message);

  const last = new Map<string, ChatContact['last']>();
  const unread = new Map<string, number>();
  for (const m of (recent.data ?? []) as Row[]) {
    const other = m.sender_id === me ? m.recipient_id : m.sender_id;
    if (!last.has(other)) last.set(other, { body: m.body, at: m.created_at, fromMe: m.sender_id === me, hasFiles: (m.attachments ?? []).length > 0 });
    if (m.recipient_id === me && !m.read_at) unread.set(other, (unread.get(other) ?? 0) + 1);
  }
  const contacts = members
    .filter((m) => m.userId !== me)
    .map((m) => ({ userId: m.userId, name: m.name, email: m.email, unread: unread.get(m.userId) ?? 0, last: last.get(m.userId) ?? null }))
    // Most recent conversations first, then everyone else by name.
    .sort((a, b) => (b.last?.at ?? '').localeCompare(a.last?.at ?? '') || a.name.localeCompare(b.name));
  return { ok: true, data: { contacts, unread: [...unread.values()].reduce((a, b) => a + b, 0) } };
}

/** The whole conversation with one teammate (latest 200 each way), oldest first; marks their messages read. */
export async function getConversation(partnerId: string): Promise<ChatResult<ChatMessage[]>> {
  const ctx = await requireContext();
  if (!uuid.safeParse(partnerId).success) return fail('Choose who to message.');
  const supabase = await createClient();
  const org = ctx.organization.id;
  const me = ctx.userId;
  const [mine, theirs] = await Promise.all([
    supabase.from('direct_messages').select(COLUMNS).eq('organization_id', org).eq('sender_id', me).eq('recipient_id', partnerId).order('created_at', { ascending: false }).limit(LIMIT),
    supabase.from('direct_messages').select(COLUMNS).eq('organization_id', org).eq('sender_id', partnerId).eq('recipient_id', me).order('created_at', { ascending: false }).limit(LIMIT),
  ]);
  if (mine.error || theirs.error) return fail((mine.error ?? theirs.error)!.message);
  const rows = [...((mine.data ?? []) as Row[]), ...((theirs.data ?? []) as Row[])].sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (rows.some((r) => r.recipient_id === me && !r.read_at)) {
    await supabase
      .from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('organization_id', org)
      .eq('sender_id', partnerId)
      .eq('recipient_id', me)
      .is('read_at', null);
    // Their "new message" bell notifications are seen now too (ignore errors).
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', me)
      .eq('actor_id', partnerId)
      .eq('kind', 'message')
      .is('read_at', null);
  }
  return { ok: true, data: await withLinks(supabase, rows) };
}

const sendSchema = z.object({
  to: z.string().min(1),
  body: z.string().max(5000),
  attachments: z
    .array(z.object({ path: z.string().min(1).max(600), name: z.string().min(1).max(255), type: z.string().max(150), size: z.number().int().min(0).max(CHAT_MAX_FILE_BYTES) }))
    .max(CHAT_MAX_FILES),
});

export async function sendChatMessage(input: unknown): Promise<ChatResult<ChatMessage>> {
  const ctx = await requireContext();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return fail('That message can’t be sent (too long or too many files).');
  const { to, attachments } = parsed.data;
  const body = parsed.data.body.trim();
  if (!body && attachments.length === 0) return fail('Write a message or attach a file.');
  if (to === ctx.userId) return fail('You can’t message yourself.');

  const members = await getTeamMembers(ctx.organization.id);
  if (!members.some((m) => m.userId === to)) return fail('That person isn’t on your team.');
  // Files must be ones you uploaded for chat.
  const prefix = `${ctx.organization.id}/chat/${ctx.userId}/`;
  if (attachments.some((a) => !a.path.startsWith(prefix) || a.path.includes('..'))) return fail('One of the attachments isn’t valid.');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('direct_messages')
    .insert({ organization_id: ctx.organization.id, sender_id: ctx.userId, recipient_id: to, body, attachments })
    .select(COLUMNS)
    .single();
  if (error) return fail(error.message);
  const [message] = await withLinks(supabase, [data as Row]);
  return { ok: true, data: message };
}
