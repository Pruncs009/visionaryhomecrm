'use client';

import { useOptimistic, useRef, useTransition } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { addContactTag, removeContactTag } from '../actions';
import { normalizeTag } from '../constants';

type Op = { type: 'add' | 'remove'; tag: string };

/** Inline tag chips with add (Enter) and remove (×). Optimistic, reverts on error. */
export function TagEditor({ contactId, tags, suggestions }: { contactId: string; tags: string[]; suggestions: string[] }) {
  const [, startTransition] = useTransition();
  const [optimisticTags, apply] = useOptimistic(tags, (state: string[], op: Op) =>
    op.type === 'add' ? (state.includes(op.tag) ? state : [...state, op.tag]) : state.filter((t) => t !== op.tag),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  function add(raw: string) {
    const tag = normalizeTag(raw);
    if (!tag) return;
    if (inputRef.current) inputRef.current.value = '';
    startTransition(async () => {
      apply({ type: 'add', tag });
      const result = await addContactTag(contactId, tag);
      if (!result.ok) toast.error(result.error);
    });
  }

  function remove(tag: string) {
    startTransition(async () => {
      apply({ type: 'remove', tag });
      const result = await removeContactTag(contactId, tag);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {optimisticTags.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1 font-normal">
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            className="rounded-sm p-0.5 hover:bg-foreground/10"
            aria-label={`Remove tag ${tag}`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <div className="relative">
        <Plus className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          list={`tag-suggestions-${contactId}`}
          placeholder="Add tag"
          aria-label="Add tag"
          maxLength={50}
          className="h-7 w-32 pl-6 text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(e.currentTarget.value);
            }
          }}
        />
        <datalist id={`tag-suggestions-${contactId}`}>
          {suggestions.filter((s) => !optimisticTags.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
