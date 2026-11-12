'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Pin, PinOff, StickyNote, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { addDealNote, deleteDealNote, setDealNotePinned, type MutationResult, type NoteActionState } from '../deal-actions';
import type { DealNote } from '../types';

export function DealNotes({ txId, notes, timezone, canDelete }: { txId: string; notes: DealNote[]; timezone: string; canDelete: boolean }) {
  const bound = useMemo(() => addDealNote.bind(null, txId), [txId]);
  const [state, action, pending] = useActionState<NoteActionState, FormData>(bound, {});
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [, start] = useTransition();
  const [added, setAdded] = useState<DealNote[]>([]);
  const when = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone });

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      const note = state.note;
      if (note) setAdded((a) => (a.some((n) => n.id === note.id) ? a : [note, ...a]));
      router.refresh();
    }
  }, [state, router]);

  // Notes saved here that the server list doesn't include yet, newest first.
  const shown = [...added.filter((a) => !notes.some((n) => n.id === a.id)), ...notes];

  const run = (fn: () => Promise<MutationResult>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(ok);
      else toast.error(r.error);
    });

  return (
    <section aria-labelledby="notes-heading" className="space-y-4">
      <h2 id="notes-heading" className="text-base font-semibold">Notes</h2>
      <form ref={formRef} action={action} className="space-y-2">
        <Textarea
          name="body"
          rows={3}
          placeholder="Add a note about this deal… (Ctrl+Enter to save)"
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
          <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Add note'}</Button>
        </div>
      </form>

      {shown.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <StickyNote className="size-4" aria-hidden /> No notes yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((n) => (
            <li key={n.id} className={cn('group rounded-lg border p-3', n.isPinned && 'border-primary/30 bg-primary/5')}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {n.isPinned && <Pin className="mr-1 inline size-3 text-primary" aria-label="Pinned" />}
                  {n.authorName ?? 'Someone'} · <time dateTime={n.createdAt}>{when.format(new Date(n.createdAt))}</time>
                </span>
                <span className="flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button variant="ghost" size="icon-xs" aria-label={n.isPinned ? 'Unpin note' : 'Pin note'}
                    onClick={() => run(() => setDealNotePinned(txId, n.id, !n.isPinned), n.isPinned ? 'Note unpinned' : 'Note pinned')}>
                    {n.isPinned ? <PinOff /> : <Pin />}
                  </Button>
                  {canDelete && (
                    <Button variant="ghost" size="icon-xs" aria-label="Delete note"
                      onClick={() => { if (confirm('Delete this note?')) run(async () => {
                        const r = await deleteDealNote(txId, n.id);
                        if (r.ok) setAdded((a) => a.filter((x) => x.id !== n.id));
                        return r;
                      }, 'Note deleted'); }}>
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
    </section>
  );
}
