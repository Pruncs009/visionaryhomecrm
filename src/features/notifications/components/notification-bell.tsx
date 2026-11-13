'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AtSign, Bell, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OPEN_CHAT_EVENT } from '@/features/chat/types';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { getNotifications, markNotificationsRead, type AppNotification } from '../actions';

const POLL_MS = 30_000;

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Top-bar bell: @mentions in notes and new chat messages. */
export function NotificationBell({ meId }: { meId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const seen = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    const r = await getNotifications();
    setItems(r.items);
    setUnread(r.unread);
    // Pop up new @mentions (new messages already pop up from the chat).
    if (seen.current) {
      for (const n of r.items) {
        if (!seen.current.has(n.id) && !n.readAt && n.kind === 'note_mention') {
          toast(n.title, { description: n.body.slice(0, 120), action: n.link ? { label: 'View', onClick: () => router.push(n.link!) } : undefined });
        }
      }
    }
    seen.current = new Set(r.items.map((n) => n.id));
  }, [router]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  // Live: refresh the moment a notification arrives (polling covers the rest).
  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    const channel = supabase
      .channel(`notifications:${meId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${meId}` }, () => void refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [meId, refresh]);

  const openItem = (n: AppNotification) => {
    if (!n.readAt) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void markNotificationsRead([n.id]);
    }
    if (n.kind === 'message') window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: n.actorId }));
    else if (n.link) router.push(n.link);
  };

  const markAll = () => {
    setItems((list) => list.map((x) => (x.readAt ? x : { ...x, readAt: new Date().toISOString() })));
    setUnread(0);
    void markNotificationsRead();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] leading-4 font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <DropdownMenuGroup>
          <div className="flex items-center justify-between border-b px-3 py-2">
            <DropdownMenuLabel className="p-0 text-sm font-semibold text-foreground">Notifications</DropdownMenuLabel>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="text-xs font-medium text-primary hover:underline">
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto p-1">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No notifications yet. You’ll see @mentions and new messages here.
              </p>
            ) : (
              items.map((n) => {
                const Icon = n.kind === 'message' ? MessageCircle : AtSign;
                return (
                  <DropdownMenuItem key={n.id} onClick={() => openItem(n)} className="items-start gap-2.5 px-2 py-2">
                    <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-full', n.readAt ? 'bg-muted text-muted-foreground' : 'bg-brand-teal/15 text-brand-teal')}>
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm leading-snug', !n.readAt && 'font-semibold')}>{n.title}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{ago(n.createdAt)}</span>
                    </span>
                    {!n.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-teal" aria-label="Unread" />}
                  </DropdownMenuItem>
                );
              })
            )}
          </div>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
