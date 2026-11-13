'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, FileText, ImageIcon, Loader2, MessageCircle, Minus, Paperclip, SendHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { getChatContacts, getConversation, sendChatMessage } from '../actions';
import { CHAT_BUCKET, CHAT_MAX_FILES, CHAT_MAX_FILE_BYTES, OPEN_CHAT_EVENT, type ChatAttachment, type ChatContact, type ChatMessage } from '../types';

const LAST_PARTNER_KEY = 'crm-chat:partner';
const POLL_OPEN_MS = 8_000;
const POLL_CLOSED_MS = 30_000;

type Pending = { id: string; file: File; preview: string | null };

// ----------------------------------------------------------------------------- helpers
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-full bg-brand-teal/15 text-xs font-semibold text-brand-teal', className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

const fileSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(-120) || 'file';

function readLastPartner(): string | null {
  try {
    return localStorage.getItem(LAST_PARTNER_KEY);
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------- widget
/**
 * Team chat: a button in the bottom-right corner that opens a Messenger-style
 * window. Pick a teammate under "To", read the conversation, and send text,
 * pictures and files. New messages arrive live (and by polling as a fallback).
 */
export function ChatWidget({ me, orgId }: { me: { id: string; name: string }; orgId: string }) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [unread, setUnread] = useState(0);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConvo, setLoadingConvo] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  const partnerRef = useRef(partnerId);
  const contactsRef = useRef(contacts);
  openRef.current = open;
  partnerRef.current = partnerId;
  contactsRef.current = contacts;

  const partner = useMemo(() => contacts.find((c) => c.userId === partnerId) ?? null, [contacts, partnerId]);

  // --- data -------------------------------------------------------------------
  const refreshContacts = useCallback(async () => {
    const r = await getChatContacts();
    if (!r.ok) return;
    setContacts(r.data.contacts);
    setUnread(r.data.unread);
    setPartnerId((cur) => {
      if (cur && r.data.contacts.some((c) => c.userId === cur)) return cur;
      const saved = readLastPartner();
      return r.data.contacts.find((c) => c.userId === saved)?.userId ?? r.data.contacts[0]?.userId ?? null;
    });
  }, []);

  const loadConversation = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoadingConvo(true);
    const r = await getConversation(id);
    if (partnerRef.current !== id) return; // switched people meanwhile
    if (!quiet) setLoadingConvo(false);
    if (!r.ok) {
      if (!quiet) toast.error(r.error);
      return;
    }
    setMessages((prev) => (prev.length === r.data.length && prev.at(-1)?.id === r.data.at(-1)?.id && prev.at(-1)?.readAt === r.data.at(-1)?.readAt ? prev : r.data));
  }, []);

  useEffect(() => {
    void refreshContacts();
  }, [refreshContacts]);

  // Open conversation: load it, and keep it fresh.
  useEffect(() => {
    if (!open || !partnerId) return;
    try {
      localStorage.setItem(LAST_PARTNER_KEY, partnerId);
    } catch {
      /* ignore */
    }
    setMessages([]);
    void loadConversation(partnerId).then(refreshContacts);
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadConversation(partnerId, true).then(refreshContacts);
    }, POLL_OPEN_MS);
    return () => window.clearInterval(t);
  }, [open, partnerId, loadConversation, refreshContacts]);

  // Closed: check for new messages now and then (the unread badge).
  useEffect(() => {
    if (open) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshContacts();
    }, POLL_CLOSED_MS);
    return () => window.clearInterval(t);
  }, [open, refreshContacts]);

  // Live: a new message to me shows up at once.
  useEffect(() => {
    // Live updates are a bonus (polling covers the rest): never let them break the page.
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch (e) {
      console.error('[chat] live updates unavailable', e);
      return;
    }
    const channel = supabase
      .channel(`dm:${me.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${me.id}` }, (payload) => {
        const from = (payload.new as { sender_id?: string }).sender_id;
        if (openRef.current && from && from === partnerRef.current) void loadConversation(from, true);
        void refreshContacts().then(() => {
          if (!openRef.current || from !== partnerRef.current) {
            const who = contactsRef.current.find((c) => c.userId === from);
            if (who) toast(`New message from ${who.name}`, { action: { label: 'Open', onClick: () => { setPartnerId(who.userId); setOpen(true); } } });
          }
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me.id, loadConversation, refreshContacts]);

  // The notification bell asks to open a conversation.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) setPartnerId(id);
      setOpen(true);
    };
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
  }, []);

  // Keep the newest message in view.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, partnerId]);

  const dropPending = (ids?: string[]) =>
    setPending((cur) => {
      for (const p of cur) if ((!ids || ids.includes(p.id)) && p.preview) URL.revokeObjectURL(p.preview);
      return ids ? cur.filter((p) => !ids.includes(p.id)) : [];
    });

  // --- composing ----------------------------------------------------------------
  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const files = [...list];
    const tooBig = files.filter((f) => f.size > CHAT_MAX_FILE_BYTES);
    if (tooBig.length) toast.error(`${tooBig.map((f) => f.name).join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} over 25 MB.`);
    setPending((cur) => {
      const room = CHAT_MAX_FILES - cur.length;
      const ok = files.filter((f) => f.size <= CHAT_MAX_FILE_BYTES).slice(0, Math.max(0, room));
      if (files.length - tooBig.length > room) toast.error(`Up to ${CHAT_MAX_FILES} files per message.`);
      return [...cur, ...ok.map((file) => ({ id: crypto.randomUUID(), file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null }))];
    });
  };

  const send = async () => {
    if (!partnerId || sending) return;
    const body = draft.trim();
    if (!body && pending.length === 0) return;
    setSending(true);
    try {
      // Files go straight to private storage, then the message points at them.
      const supabase = createClient();
      const attachments: ChatAttachment[] = [];
      for (const p of pending) {
        const path = `${orgId}/chat/${me.id}/${crypto.randomUUID()}/${safeName(p.file.name)}`;
        const { error } = await supabase.storage.from(CHAT_BUCKET).upload(path, p.file, { contentType: p.file.type || 'application/octet-stream' });
        if (error) throw new Error(`Couldn't upload ${p.file.name}: ${error.message}`);
        attachments.push({ path, name: p.file.name, type: p.file.type || 'application/octet-stream', size: p.file.size });
      }
      const r = await sendChatMessage({ to: partnerId, body, attachments });
      if (!r.ok) throw new Error(r.error);
      setMessages((m) => [...m, r.data]);
      setDraft('');
      dropPending();
      if (inputRef.current) inputRef.current.style.height = 'auto';
      void refreshContacts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Message not sent.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // --- render -------------------------------------------------------------------
  const lastMineSeen = [...messages].reverse().find((m) => m.senderId === me.id);

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="Team chat"
          className="fixed right-5 bottom-24 z-40 flex h-[560px] max-h-[calc(100dvh-7.5rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          {/* Header */}
          <header className="flex items-center justify-between gap-2 border-b bg-brand-teal px-3 py-2.5 text-white">
            <div className="flex min-w-0 items-center gap-2">
              <MessageCircle className="size-5 shrink-0" aria-hidden />
              <span className="truncate font-semibold">Messages</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 hover:bg-white/15" aria-label="Minimize chat" title="Minimize">
                <Minus className="size-4" />
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 hover:bg-white/15" aria-label="Close chat" title="Close">
                <X className="size-4" />
              </button>
            </div>
          </header>

          {/* To: */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <span className="text-sm text-muted-foreground">To:</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-muted data-[popup-open]:bg-muted"
                aria-label="Choose who to message"
                disabled={contacts.length === 0}
              >
                {partner ? (
                  <>
                    <Avatar name={partner.name} className="size-7" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{partner.name}</span>
                  </>
                ) : (
                  <span className="flex-1 text-sm text-muted-foreground">{contacts.length ? 'Choose a teammate' : 'No teammates yet'}</span>
                )}
                {contacts.some((c) => c.unread > 0 && c.userId !== partnerId) && <span className="size-2 rounded-full bg-critical" aria-label="Unread messages from others" />}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="z-50 max-h-80 w-[330px] overflow-y-auto">
                <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs">Everyone with access to the CRM</DropdownMenuLabel>
                {contacts.map((c) => (
                  <DropdownMenuItem key={c.userId} onClick={() => setPartnerId(c.userId)} className="gap-2.5 py-1.5">
                    <Avatar name={c.name} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm', c.unread > 0 && 'font-semibold')}>{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.last ? `${c.last.fromMe ? 'You: ' : ''}${c.last.body || (c.last.hasFiles ? 'Sent an attachment' : '')}` : c.email}
                      </span>
                    </span>
                    {c.unread > 0 && <span className="rounded-full bg-critical px-1.5 text-[11px] font-semibold text-white tabular-nums">{c.unread}</span>}
                  </DropdownMenuItem>
                ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Conversation */}
          <div ref={listRef} className="relative flex-1 space-y-1 overflow-y-auto px-3 py-3" aria-live="polite">
            {!partner ? (
              <p className="mt-16 text-center text-sm text-muted-foreground">Choose a teammate under &quot;To&quot; to start chatting.</p>
            ) : loadingConvo && messages.length === 0 ? (
              <p className="mt-16 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </p>
            ) : messages.length === 0 ? (
              <div className="mt-12 flex flex-col items-center gap-2 text-center">
                <Avatar name={partner.name} className="size-14 text-base" />
                <p className="font-medium">{partner.name}</p>
                <p className="text-sm text-muted-foreground">No messages yet. Say hi!</p>
              </div>
            ) : (
              messages.map((m, i) => {
                const mine = m.senderId === me.id;
                const prev = messages[i - 1];
                const next = messages[i + 1];
                const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
                const groupedWithNext = next && next.senderId === m.senderId && dayLabel(next.createdAt) === dayLabel(m.createdAt) && new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() < 5 * 60_000;
                const images = m.attachments.filter((a) => a.type.startsWith('image/') && a.url);
                const files = m.attachments.filter((a) => !(a.type.startsWith('image/') && a.url));
                return (
                  <div key={m.id}>
                    {newDay && <p className="my-3 text-center text-[11px] font-medium text-muted-foreground">{dayLabel(m.createdAt)}</p>}
                    <div className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
                      {!mine && (groupedWithNext ? <span className="w-7 shrink-0" /> : <Avatar name={partner.name} className="size-7 text-[10px]" />)}
                      <div className={cn('flex max-w-[78%] flex-col gap-1', mine ? 'items-end' : 'items-start')} title={new Date(m.createdAt).toLocaleString()}>
                        {images.length > 0 && (
                          <div className={cn('grid gap-1', images.length > 1 && 'grid-cols-2')}>
                            {images.map((a) => (
                              <a key={a.path} href={a.url!} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl ring-1 ring-foreground/10">
                                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                                <img src={a.url!} alt={a.name} className={cn('bg-muted object-cover', images.length > 1 ? 'size-28' : 'max-h-56 w-56')} />
                              </a>
                            ))}
                          </div>
                        )}
                        {files.map((a) => (
                          <a
                            key={a.path}
                            href={a.downloadUrl ?? a.url ?? '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn('flex items-center gap-2 rounded-2xl px-3 py-2 text-sm', mine ? 'bg-primary/90 text-primary-foreground' : 'bg-muted')}
                          >
                            <FileText className="size-5 shrink-0" aria-hidden />
                            <span className="min-w-0">
                              <span className="block max-w-48 truncate font-medium">{a.name}</span>
                              <span className="text-xs opacity-75">{fileSize(a.size)}</span>
                            </span>
                            <Download className="size-4 shrink-0 opacity-75" aria-label="Download" />
                          </a>
                        ))}
                        {m.body && (
                          <p className={cn('rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap', mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>{m.body}</p>
                        )}
                        {!groupedWithNext && (
                          <span className="px-1 text-[10px] text-muted-foreground">
                            {time(m.createdAt)}
                            {mine && m.id === lastMineSeen?.id && m.readAt ? ' · Seen' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {dragging && (
              <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
                Drop files to attach
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t px-3 py-2">
            {pending.length > 0 && (
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                {pending.map((p) => (
                  <div key={p.id} className="relative shrink-0">
                    {p.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local preview
                      <img src={p.preview} alt={p.file.name} className="size-14 rounded-lg object-cover ring-1 ring-foreground/10" />
                    ) : (
                      <div className="flex h-14 w-28 items-center gap-1.5 rounded-lg bg-muted px-2 text-xs" title={p.file.name}>
                        <FileText className="size-4 shrink-0" aria-hidden />
                        <span className="line-clamp-2 break-all">{p.file.name}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => dropPending([p.id])}
                      className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background shadow"
                      aria-label={`Remove ${p.file.name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-1">
              <button type="button" onClick={() => imageInput.current?.click()} disabled={!partner || sending} className="rounded-full p-2 text-primary hover:bg-muted disabled:opacity-40" aria-label="Send pictures" title="Pictures">
                <ImageIcon className="size-5" />
              </button>
              <button type="button" onClick={() => fileInput.current?.click()} disabled={!partner || sending} className="rounded-full p-2 text-primary hover:bg-muted disabled:opacity-40" aria-label="Attach files" title="Attach files">
                <Paperclip className="size-5" />
              </button>
              <input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                disabled={!partner}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
                onPaste={(e) => {
                  if (e.clipboardData.files.length) {
                    e.preventDefault();
                    addFiles(e.clipboardData.files);
                  }
                }}
                placeholder={partner ? `Message ${partner.name.split(' ')[0]}…` : 'Choose a teammate first'}
                aria-label="Message"
                className="max-h-[120px] min-h-9 flex-1 resize-none rounded-2xl bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!partner || sending || (!draft.trim() && pending.length === 0)}
                className="rounded-full p-2 text-primary hover:bg-muted disabled:opacity-40"
                aria-label="Send"
                title="Send (Enter)"
              >
                {sending ? <Loader2 className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed right-5 bottom-5 z-40 grid size-14 place-items-center rounded-full bg-brand-teal text-white shadow-lg transition-transform hover:scale-105 focus-visible:ring-4 focus-visible:ring-brand-teal/30 focus-visible:outline-none"
        aria-label={open ? 'Close chat' : unread ? `Open chat, ${unread} unread` : 'Open chat'}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-6" /> : <MessageCircle className="size-6" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-critical px-1.5 text-center text-xs leading-5 font-semibold text-white ring-2 ring-background">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </>
  );
}
