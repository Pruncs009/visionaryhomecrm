'use client';

import { useId, useMemo, useState, useTransition } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Briefcase, Plus, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { addDealParty, removeDealParty } from '../party-actions';
import { CLIENT_ROLES, COLLABORATOR_ROLES, PARTY_ROLE_LABEL, type PartyRole, type PersonOption } from '../parties';

type Kind = 'client' | 'collaborator';

/** The "+" on the People panel: Add client / Add collaborator. */
export function AddPersonMenu({ txId, takenRoles, people }: { txId: string; takenRoles: PartyRole[]; people: PersonOption[] }) {
  const [kind, setKind] = useState<Kind | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Add people"
          className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setKind('client')}><UserRound /> Add client</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setKind('collaborator')}><Briefcase /> Add collaborator</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogPrimitive.Root open={kind !== null} onOpenChange={(open) => !open && setKind(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
          <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-popover p-5 text-popover-foreground ring-1 ring-foreground/10 outline-none">
            {/* key: a fresh form every time the dialog opens */}
            {kind && <AddPersonForm key={kind} kind={kind} txId={txId} takenRoles={takenRoles} people={people} onDone={() => setKind(null)} />}
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

const EMPTY = { fullName: '', phone: '', email: '', company: '', addressLine1: '', city: '', state: '', postalCode: '' };
type Fields = typeof EMPTY;

function AddPersonForm({ kind, txId, takenRoles, people, onDone }: {
  kind: Kind;
  txId: string;
  takenRoles: PartyRole[];
  people: PersonOption[];
  onDone: () => void;
}) {
  const uid = useId();
  const [role, setRole] = useState<PartyRole | ''>('');
  const [f, setF] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isCollab = kind === 'collaborator';
  const roles = isCollab ? COLLABORATOR_ROLES : CLIENT_ROLES;

  // A typed name that matches a saved contact reuses that contact.
  const match = useMemo(() => {
    const n = f.fullName.trim().toLowerCase();
    return n ? people.find((p) => p.name.toLowerCase() === n) ?? null : null;
  }, [f.fullName, people]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  const onName = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const hit = people.find((p) => p.name.toLowerCase() === value.trim().toLowerCase());
    setF((prev) => {
      const next = { ...prev, fullName: value };
      // Picking a saved collaborator fills in what we already know (without overwriting typing).
      if (hit && isCollab) {
        next.phone ||= hit.phone ?? '';
        next.email ||= hit.email ?? '';
        next.company ||= hit.company ?? '';
        next.addressLine1 ||= hit.addressLine1 ?? '';
        next.city ||= hit.city ?? '';
        next.state ||= hit.state ?? '';
        next.postalCode ||= hit.postalCode ?? '';
      }
      return next;
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) return;
    start(async () => {
      const r = await addDealParty({
        txId,
        role,
        contactId: match?.id ?? '',
        ...(isCollab ? f : { ...EMPTY, fullName: f.fullName }),
      });
      if (r.ok) {
        toast.success(`${PARTY_ROLE_LABEL[role as PartyRole]} added`);
        onDone();
        return;
      }
      setErrors(r.fieldErrors ?? {});
      setFormError(r.error ?? null);
    });
  };

  const field = (k: keyof Fields, label: string, props: React.ComponentProps<'input'> = {}) => (
    <div className="space-y-1.5">
      <label htmlFor={`${uid}-${k}`} className="text-sm font-medium">{label}</label>
      <Input id={`${uid}-${k}`} value={f[k]} onChange={k === 'fullName' ? onName : set(k)} aria-invalid={!!errors[k]?.[0]} autoComplete="off" {...props} />
      {errors[k]?.[0] && <p className="text-sm text-destructive">{errors[k]![0]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <DialogPrimitive.Title className="text-base font-semibold">{isCollab ? 'Add collaborator' : 'Add client'}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            {isCollab ? 'A seller or buyer agent on this deal.' : 'A buyer or seller on this deal.'} They’re saved to Contacts for next time.
          </DialogPrimitive.Description>
        </div>
        <DialogPrimitive.Close aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></DialogPrimitive.Close>
      </div>

      {formError && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}

      <div className="space-y-1.5">
        <label htmlFor={`${uid}-role`} className="text-sm font-medium">{isCollab ? 'Collaborator type' : 'Client role'}</label>
        <NativeSelect id={`${uid}-role`} className="w-full" value={role} onChange={(e) => { setRole(e.target.value as PartyRole); setErrors({}); }} aria-invalid={!!errors.role?.[0]}>
          <NativeSelectOption value="" disabled>Select…</NativeSelectOption>
          {roles.map((r) => {
            const taken = !isCollab && takenRoles.includes(r);
            return <NativeSelectOption key={r} value={r} disabled={taken}>{PARTY_ROLE_LABEL[r]}{taken ? ' (already added)' : ''}</NativeSelectOption>;
          })}
        </NativeSelect>
        {errors.role?.[0] && <p className="text-sm text-destructive">{errors.role[0]}</p>}
      </div>

      {role && (
        <>
          <div className="space-y-1">
            {field('fullName', 'Full name', { list: `${uid}-people`, placeholder: 'Type a name or pick a saved contact', autoFocus: true })}
            <datalist id={`${uid}-people`}>
              {people.map((p) => <option key={p.id} value={p.name} label={[p.company, p.email ?? p.phone].filter(Boolean).join(' · ') || undefined} />)}
            </datalist>
            {f.fullName.trim() && !errors.fullName?.[0] && (
              <p className="text-xs text-muted-foreground">{match ? 'Saved contact — it will be linked to this deal.' : 'New contact — it will be saved to Contacts.'}</p>
            )}
          </div>

          {isCollab && (
            <div className="grid gap-4 sm:grid-cols-2">
              {field('phone', 'Phone number', { type: 'tel', inputMode: 'tel' })}
              {field('email', 'Email address', { type: 'email', inputMode: 'email' })}
              <div className="sm:col-span-2">{field('company', 'Brokerage firm')}</div>
              <div className="sm:col-span-2">{field('addressLine1', 'Street address')}</div>
              {field('city', 'City')}
              <div className="grid grid-cols-2 gap-4">
                {field('state', 'State')}
                {field('postalCode', 'ZIP', { inputMode: 'numeric' })}
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <DialogPrimitive.Close render={<Button type="button" variant="outline" />}>Cancel</DialogPrimitive.Close>
        <Button type="submit" disabled={!role || pending}>{pending ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  );
}

/** Small "x" next to someone added from the panel. Their contact stays saved. */
export function RemovePersonButton({ txId, partyId, label }: { txId: string; partyId: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={`Remove ${label} from this deal`}
      title="Remove from deal"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Remove ${label} from this deal? They stay in Contacts.`)) return;
        start(async () => {
          const r = await removeDealParty(txId, partyId);
          if (r.ok) toast.success(`${label} removed`);
          else toast.error(r.error ?? 'Could not remove.');
        });
      }}
      className="ml-auto shrink-0 rounded-full p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 disabled:opacity-50"
    >
      <X className="size-3.5" />
    </button>
  );
}
