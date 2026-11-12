'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useRef, useTransition } from 'react';
import { Pin, PinOff, StickyNote, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { addNote, deleteNote, toggleNotePin } from '../actions';
import type { NoteItem } from '../types';

export function NotesPanel({
  contactId,
  notes,
  timezone,
  canDelete,
}: {
  contactId: string;
  notes: NoteItem[];
  timezone: string;
  canDelete: boolean;
}) {
  const boundAddNote = useMemo(() => addNote.bind(null, contactId), [contactId]);
  const [state, formAction, isPending] = useActionState(boundAddNote, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();
  const when = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone });

  const router = useRouter();
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      router.refresh(); // the action doesn't revalidate (see addNote)
    }
  }, [state, router]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(success);
      else toast.error(r.error ?? 'Something went wrong');
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form ref={formRef} action={formAction} className="space-y-2">
          <Textarea
            name="body"
            rows={3}
            placeholder="Add a note… (Ctrl+Enter to save)"
            aria-label="New note"
            defaultValue={state.success ? '' : state.values?.body}
            aria-invalid={!!state.fieldErrors?.body}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) formRef.current?.requestSubmit();
            }}
          />
          {(state.fieldErrors?.body?.[0] || state.error) && (
            <p className="text-sm text-destructive">{state.fieldErrors?.body?.[0] ?? state.error}</p>
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={isPending}>{isPending ? 'Saving…' : 'Add note'}</Button>
          </div>
        </form>

        {notes.length === 0 ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <StickyNote className="size-4" aria-hidden /> No notes yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className={cn('group rounded-lg border p-3', n.isPinned && 'border-primary/30 bg-primary/5')}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {n.isPinned && <Pin className="mr-1 inline size-3 text-primary" aria-label="Pinned" />}
                    {n.authorName ?? 'Someone'} · <time dateTime={n.createdAt}>{when.format(new Date(n.createdAt))}</time>
                  </span>
                  <span className="flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={n.isPinned ? 'Unpin note' : 'Pin note'}
                      onClick={() => run(() => toggleNotePin(contactId, n.id, !n.isPinned), n.isPinned ? 'Note unpinned' : 'Note pinned')}
                    >
                      {n.isPinned ? <PinOff /> : <Pin />}
                    </Button>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Delete note"
                        onClick={() => {
                          if (confirm('Delete this note?')) run(() => deleteNote(contactId, n.id), 'Note deleted');
                        }}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
