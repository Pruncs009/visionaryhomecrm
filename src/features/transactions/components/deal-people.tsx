import Link from 'next/link';
import { Mail, Phone, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Initials({ name, size = 'md', title }: { name: string; size?: 'sm' | 'md'; title?: string }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
  return (
    <span
      title={title}
      aria-hidden={!title}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary',
        size === 'sm' ? 'size-6 text-[0.65rem]' : 'size-9 text-xs',
      )}
    >
      {letters}
    </span>
  );
}

export type PersonEntry = { role: string; name: string | null; href?: string; email?: string | null; phone?: string | null };

/** Left column: clients and team on this deal. */
export function DealPeople({ editHref, groups }: { editHref: string; groups: { title: string; people: PersonEntry[] }[] }) {
  return (
    <section aria-labelledby="people-heading" className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="people-heading" className="font-semibold">People</h2>
        <Link href={editHref} aria-label="Add or change people" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <Plus className="size-4" />
        </Link>
      </div>
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.title}>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {g.title} ({g.people.filter((p) => p.name).length})
            </h3>
            <ul className="space-y-3">
              {g.people.map((p) => (
                <li key={p.role} className="flex items-start gap-3">
                  {p.name ? <Initials name={p.name} /> : <span className="size-9 shrink-0 rounded-full border border-dashed" aria-hidden />}
                  <div className="min-w-0 text-sm">
                    <p className="text-xs text-muted-foreground">{p.role}</p>
                    {p.name ? (
                      p.href ? (
                        <Link href={p.href} className="font-medium text-primary hover:underline">{p.name}</Link>
                      ) : (
                        <p className="font-medium">{p.name}</p>
                      )
                    ) : (
                      <Link href={editHref} className="text-muted-foreground hover:text-primary">Add {p.role.toLowerCase()}</Link>
                    )}
                    {(p.email || p.phone) && (
                      <div className="mt-0.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
                        {p.phone && <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 hover:text-foreground"><Phone className="size-3" aria-hidden />{p.phone}</a>}
                        {p.email && <a href={`mailto:${p.email}`} className="inline-flex min-w-0 items-center gap-1 hover:text-foreground"><Mail className="size-3 shrink-0" aria-hidden /><span className="truncate">{p.email}</span></a>}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
