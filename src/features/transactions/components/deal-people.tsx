import Link from 'next/link';
import { Building2, Mail, MapPin, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TeamRole } from '../parties';
import { EditPersonButton, RemovePersonButton, type EditTarget, type TeamNames } from './deal-people-actions';

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

export type PersonEntry = {
  key: string;
  role: string;
  name: string;
  href?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  address?: string | null;
  /** What the pencil edits (omitted: read-only). */
  edit?: EditTarget;
  /** What the × removes (omitted: can't be removed from the panel). */
  remove?: { kind: 'party'; partyId: string } | { kind: 'team'; role: TeamRole };
};

/** Left column: clients and team on this deal. */
export function DealPeople({ txId, addButton, canRemove, team, teamOptions, groups }: {
  txId: string;
  addButton: React.ReactNode;
  canRemove: boolean;
  team: TeamNames;
  teamOptions: Record<TeamRole, string[]>;
  groups: { title: string; people: PersonEntry[] }[];
}) {
  return (
    <section aria-labelledby="people-heading" className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="people-heading" className="font-semibold">People</h2>
        {addButton}
      </div>
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.title}>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {g.title} ({g.people.length})
            </h3>
            {g.people.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet. Use + to add.</p>
            ) : (
              <ul className="space-y-3">
                {g.people.map((p) => (
                  <li key={p.key} className="group flex items-start gap-3">
                    <Initials name={p.name} />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="text-xs text-muted-foreground">{p.role}</p>
                      {p.href ? (
                        <Link href={p.href} className="font-medium text-primary hover:underline">{p.name}</Link>
                      ) : (
                        <p className="font-medium">{p.name}</p>
                      )}
                      {(p.company || p.email || p.phone || p.address) && (
                        <div className="mt-0.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
                          {p.company && <span className="inline-flex items-center gap-1"><Building2 className="size-3 shrink-0" aria-hidden />{p.company}</span>}
                          {p.phone && <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 hover:text-foreground"><Phone className="size-3 shrink-0" aria-hidden />{p.phone}</a>}
                          {p.email && <a href={`mailto:${p.email}`} className="inline-flex min-w-0 items-center gap-1 hover:text-foreground"><Mail className="size-3 shrink-0" aria-hidden /><span className="truncate">{p.email}</span></a>}
                          {p.address && <span className="inline-flex items-start gap-1"><MapPin className="mt-0.5 size-3 shrink-0" aria-hidden />{p.address}</span>}
                        </div>
                      )}
                    </div>
                    <div className="ml-auto flex shrink-0 items-center">
                      {p.edit && <EditPersonButton txId={txId} target={p.edit} label={p.name} canRemove={canRemove} team={team} teamOptions={teamOptions} />}
                      {canRemove && p.remove && <RemovePersonButton txId={txId} target={p.remove} label={p.name} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
