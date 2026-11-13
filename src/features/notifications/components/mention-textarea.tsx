'use client';

import { useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Mentionable } from '../mentions';

type Props = Omit<React.ComponentProps<typeof Textarea>, 'ref'> & { people: Mentionable[] };

/** A textarea where typing "@" offers teammates; picking one inserts "@Full Name ". Uncontrolled (works with form actions). */
export function MentionTextarea({ people, onKeyDown, className, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ text: string; start: number } | null>(null);
  const [active, setActive] = useState(0);

  const matches = query
    ? people.filter((p) => p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(query.text.toLowerCase())) || p.name.toLowerCase().startsWith(query.text.toLowerCase())).slice(0, 6)
    : [];
  const open = matches.length > 0;

  const detect = () => {
    const el = ref.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = /(^|\s)@([\p{L}\p{N}'.-]*(?: [\p{L}\p{N}'.-]*)?)$/u.exec(before);
    if (m) {
      setQuery({ text: m[2], start: before.length - m[2].length - 1 });
      setActive(0);
    } else setQuery(null);
  };

  const pick = (p: Mentionable) => {
    const el = ref.current;
    if (!el || !query) return;
    const caret = el.selectionStart ?? el.value.length;
    const insert = `@${p.name} `;
    el.value = el.value.slice(0, query.start) + insert + el.value.slice(caret);
    const pos = query.start + insert.length;
    el.focus();
    el.setSelectionRange(pos, pos);
    setQuery(null);
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        {...props}
        className={className}
        onInput={detect}
        onClick={detect}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        aria-autocomplete="list"
        aria-expanded={open}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              pick(matches[active] ?? matches[0]!);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setQuery(null);
              return;
            }
          }
          onKeyDown?.(e);
        }}
      />
      {open && (
        <ul role="listbox" aria-label="Mention a teammate" className="absolute top-full left-0 z-30 mt-1 w-64 overflow-hidden rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10">
          {matches.map((p, i) => (
            <li key={p.userId} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left', i === active && 'bg-muted')}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-teal/15 text-[10px] font-semibold">
                  {p.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')}
                </span>
                <span className="truncate">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
