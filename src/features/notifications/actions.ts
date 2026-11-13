'use server';

import { z } from 'zod';
import { requireContext } from '@/features/auth/guards';
import { createClient } from '@/lib/supabase/server';

export type AppNotification = {
  id: string;
  kind: 'note_mention' | 'message';
  title: string;
  body: string;
  link: string | null;
  actorId: string | null;
  createdAt: string;
  readAt: string | null;
};

type Row = { id: string; kind: AppNotification['kind']; title: string; body: string; link: string | null; actor_id: string | null; created_at: string; read_at: string | null };

/** Latest notifications for the bell, plus how many are unread. */
export async function getNotifications(): Promise<{ items: AppNotification[]; unread: number }> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const [list, count] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, kind, title, body, link, actor_id, created_at, read_at')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', ctx.userId).is('read_at', null),
  ]);
  // Before the database update, the table doesn't exist: show an empty bell.
  if (list.error) return { items: [], unread: 0 };
  return {
    items: ((list.data ?? []) as Row[]).map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      link: r.link,
      actorId: r.actor_id,
      createdAt: r.created_at,
      readAt: r.read_at,
    })),
    unread: count.count ?? 0,
  };
}

const ids = z.array(z.string().uuid()).max(100);

/** Marks the given notifications read, or all of them when no ids are given. */
export async function markNotificationsRead(only?: string[]): Promise<void> {
  const ctx = await requireContext();
  const supabase = await createClient();
  let q = supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', ctx.userId).is('read_at', null);
  if (only) {
    const parsed = ids.safeParse(only);
    if (!parsed.success || parsed.data.length === 0) return;
    q = q.in('id', parsed.data);
  }
  await q;
}
