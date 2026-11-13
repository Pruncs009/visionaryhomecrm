'use client';

import { useId, useMemo, useState, useTransition } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Briefcase, Pencil, Plus, UserRound, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { updateDealHeaderField } from '@/features/deals/actions';
import { addDealParty, removeDealParty, updateDealParty } from '../party-actions';
import {
  CLIENT_ROLES, COLLABORATOR_ROLES, PARTY_ROLE_LABEL, roleGroup, TEAM_ROLE_LABEL, TEAM_ROLES,
  type PartyRole, type PersonOption, type TeamRole,
} from '../parties';

type Kind = 'client' | 'collaborator' | 'team';

export const EMPTY_DETAILS = { fullName: '', phone: '', email: '', company: '', addressLine1: '', city: '', state: '', postalCode: '' };
export type Details = typeof EMPTY_DETAILS;
type Errors = Record<string, string[] | undefined>;

/** What the edit (pencil) button on a person in the People panel works on. */
export type EditTarget =
  | { kind: 'party'; partyId: string; role: PartyRole; details: Details }
  /** Buyer / seller typed on the deal form; saving makes them a saved contact in that slot. */
  | { kind: 'primary'; role: 'buyer' | 'seller'; details: Details }
  | { kind: 'team'; role: TeamRole; name: string };

export type TeamNames = Record<TeamRole, string | null>;

// -----------------------------------------------------------------------------
// Shared bits
// -----------------------------------------------------------------------------
function Modal({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-popover p-5 text-popover-foreground ring-1 ring-foreground/10 outline-none">
          {open && children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ModalHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
      </div>
      <DialogPrimitive.Close aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></DialogPrimitive.Close>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p> : null;
}

function TextField({ id, label, value, onChange, error, ...props }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string;
} & Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'id'>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} autoComplete="off" {...props} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** Phone, email, company and address fields, shared by add and edit. */
function DetailFields({ uid, f, set, errors, companyLabel }: {
  uid: string; f: Details; set: (k: keyof Details, v: string) => void; errors: Errors; companyLabel: string;
}) {
  const field = (k: keyof Details, label: string, props: Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'id'> = {}) => (
    <TextField id={`${uid}-${k}`} label={label} value={f[k]} onChange={(v) => set(k, v)} error={errors[k]?.[0]} {...props} />
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {field('phone', 'Phone number', { type: 'tel', inputMode: 'tel' })}
      {field('email', 'Email address', { type: 'email', inputMode: 'email' })}
      <div className="sm:col-span-2">{field('company', companyLabel)}</div>
      <div className="sm:col-span-2">{field('addressLine1', 'Street address')}</div>
      {field('city', 'City')}
      <div className="grid grid-cols-2 gap-4">
        {field('state', 'State')}
        {field('postalCode', 'ZIP', { inputMode: 'numeric' })}
      </div>
    </div>
  );
}

const companyLabelFor = (role: PartyRole) =>
  role === 'title_company' ? 'Title company name' : role === 'buyer_agent' || role === 'seller_agent' ? 'Brokerage firm' : 'Company (optional)';

function ModalFooter({ pending, saveDisabled, left }: { pending: boolean; saveDisabled?: boolean; left?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      {left}
      <div className="ml-auto flex gap-2">
        <DialogPrimitive.Close render={<Button type="button" variant="outline" />}>Cancel</DialogPrimitive.Close>
        <Button type="submit" disabled={saveDisabled || pending}>{pending ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// "+" menu: Add client / Add collaborator / Add team member
// -----------------------------------------------------------------------------
export function AddPersonMenu({ txId, takenRoles, people, team, teamOptions }: {
  txId: string;
  takenRoles: PartyRole[];
  people: PersonOption[];
  team: TeamNames;
  teamOptions: Record<TeamRole, string[]>;
}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const close = () => setKind(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Add people" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <Plus className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-max! min-w-max whitespace-nowrap">
          <DropdownMenuItem onClick={() => setKind('client')}><UserRound /> Add client</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setKind('collaborator')}><Briefcase /> Add collaborator</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setKind('team')}><Users /> Add team member</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Modal open={kind !== null} onOpenChange={(o) => !o && close()}>
        {kind === 'team' ? (
          <TeamForm txId={txId} team={team} options={teamOptions} onDone={close} />
        ) : kind ? (
          <AddPartyForm key={kind} kind={kind} txId={txId} takenRoles={takenRoles} people={people} onDone={close} />
        ) : null}
      </Modal>
    </>
  );
}

function AddPartyForm({ kind, txId, takenRoles, people, onDone }: {
  kind: 'client' | 'collaborator';
  txId: string;
  takenRoles: PartyRole[];
  people: PersonOption[];
  onDone: () => void;
}) {
  const uid = useId();
  const [role, setRole] = useState<PartyRole | ''>('');
  const [f, setF] = useState<Details>(EMPTY_DETAILS);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isCollab = kind === 'collaborator';
  // Clients: phone + email appear once the name is in (on leaving the name box, or a full "First Last").
  const [nameDone, setNameDone] = useState(false);
  const showClientContact = !isCollab && (nameDone || /\S+\s+\S/.test(f.fullName.trim()));
  const roles = isCollab ? COLLABORATOR_ROLES : CLIENT_ROLES;

  // Only contacts saved for this role's department are offered and reused.
  const options = useMemo(() => (role ? people.filter((p) => p.groups.includes(roleGroup(role))) : []), [people, role]);
  const match = useMemo(() => {
    const n = f.fullName.trim().toLowerCase();
    return n ? options.find((p) => p.name.toLowerCase() === n) ?? null : null;
  }, [f.fullName, options]);

  const set = (k: keyof Details, v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const onName = (value: string) => {
    const hit = options.find((p) => p.name.toLowerCase() === value.trim().toLowerCase());
    setF((prev) => {
      const next = { ...prev, fullName: value };
      // Picking a saved contact fills in what we already know (without overwriting typing).
      if (hit) {
        next.phone ||= hit.phone ?? '';
        next.email ||= hit.email ?? '';
      }
      if (hit && isCollab) {
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
      const r = await addDealParty({ txId, role, contactId: match?.id ?? '', ...(isCollab ? f : { ...EMPTY_DETAILS, fullName: f.fullName, phone: f.phone, email: f.email }) });
      if (r.ok) {
        toast.success(`${PARTY_ROLE_LABEL[role]} added`);
        onDone();
        return;
      }
      setErrors(r.fieldErrors ?? {});
      setFormError(r.error ?? null);
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <ModalHeader
        title={isCollab ? 'Add collaborator' : 'Add client'}
        description={`${isCollab ? 'A seller agent, buyer agent or title company on this deal.' : 'A buyer or seller on this deal.'} They’re saved to Contacts for next time.`}
      />
      <FormError message={formError} />

      <div className="space-y-1.5">
        <label htmlFor={`${uid}-role`} className="text-sm font-medium">{isCollab ? 'Collaborator type' : 'Client role'}</label>
        <NativeSelect id={`${uid}-role`} className="w-full" value={role} onChange={(e) => { setRole(e.target.value as PartyRole); setErrors({}); setF(EMPTY_DETAILS); setNameDone(false); }} aria-invalid={!!errors.role?.[0]}>
          <NativeSelectOption value="" disabled>Select…</NativeSelectOption>
          {roles.map((r) => {
            const taken = takenRoles.includes(r);
            return <NativeSelectOption key={r} value={r} disabled={taken}>{PARTY_ROLE_LABEL[r]}{taken ? ' (already added)' : ''}</NativeSelectOption>;
          })}
        </NativeSelect>
        {errors.role?.[0] && <p className="text-sm text-destructive">{errors.role[0]}</p>}
      </div>

      {role && (
        <>
          <div className="space-y-1">
            <TextField
              id={`${uid}-fullName`}
              label={role === 'title_company' ? 'Contact full name' : 'Full name'}
              value={f.fullName}
              onChange={onName}
              error={errors.fullName?.[0]}
              list={`${uid}-people`}
              placeholder={options.length ? `Type a name or pick a saved ${roleGroup(role).toLowerCase()}` : 'Type the full name'}
              onBlur={() => f.fullName.trim() && setNameDone(true)}
              autoFocus
            />
            <datalist id={`${uid}-people`}>
              {options.map((p) => <option key={p.id} value={p.name} label={[p.company, p.email ?? p.phone].filter(Boolean).join(' · ') || undefined} />)}
            </datalist>
            {f.fullName.trim() && !errors.fullName?.[0] && (
              <p className="text-xs text-muted-foreground">{match ? 'Saved contact — it will be linked to this deal.' : 'New contact — it will be saved to Contacts.'}</p>
            )}
          </div>
          {isCollab && <DetailFields uid={uid} f={f} set={set} errors={errors} companyLabel={companyLabelFor(role)} />}
          {showClientContact && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Add a phone number and email if you have them (optional).</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField id={`${uid}-phone`} label="Phone number" value={f.phone} onChange={(v) => set('phone', v)} error={errors.phone?.[0]} type="tel" inputMode="tel" />
                <TextField id={`${uid}-email`} label="Email address" value={f.email} onChange={(v) => set('email', v)} error={errors.email?.[0]} type="email" inputMode="email" />
              </div>
            </div>
          )}
        </>
      )}

      <ModalFooter pending={pending} saveDisabled={!role} />
    </form>
  );
}

// -----------------------------------------------------------------------------
// Team members (transaction coordinator, acquisition manager, lead manager)
// -----------------------------------------------------------------------------
function TeamForm({ txId, team, options, editRole, onDone }: {
  txId: string;
  team: TeamNames;
  options: Record<TeamRole, string[]>;
  /** Editing an existing team member: the role is fixed. */
  editRole?: TeamRole;
  onDone: () => void;
}) {
  const uid = useId();
  const [role, setRole] = useState<TeamRole | ''>(editRole ?? '');
  const [name, setName] = useState(editRole ? team[editRole] ?? '' : '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (value: string, message: string) => {
    if (!role) return;
    start(async () => {
      const r = await updateDealHeaderField(txId, role, value);
      if (r.ok) {
        toast.success(message);
        onDone();
      } else setError(r.error);
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!role) return;
        if (!name.trim()) return setError('Enter the full name.');
        save(name, `${TEAM_ROLE_LABEL[role]} saved`);
      }}
      noValidate
      className="space-y-4"
    >
      <ModalHeader
        title={editRole ? `Edit ${TEAM_ROLE_LABEL[editRole].toLowerCase()}` : 'Add team member'}
        description="Your team on this deal: transaction coordinator, acquisition manager and lead manager."
      />
      <FormError message={error} />

      {!editRole && (
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-role`} className="text-sm font-medium">Team role</label>
          <NativeSelect id={`${uid}-role`} className="w-full" value={role} onChange={(e) => { setRole(e.target.value as TeamRole); setName(''); setError(null); }}>
            <NativeSelectOption value="" disabled>Select…</NativeSelectOption>
            {TEAM_ROLES.map((r) => (
              <NativeSelectOption key={r} value={r} disabled={!!team[r]}>{TEAM_ROLE_LABEL[r]}{team[r] ? ' (already added)' : ''}</NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}

      {role && (
        <>
          <TextField
            id={`${uid}-name`}
            label="Full name"
            value={name}
            onChange={setName}
            list={`${uid}-names`}
            placeholder={options[role].length ? `Type a name or pick a saved ${TEAM_ROLE_LABEL[role].toLowerCase()}` : 'Type the full name'}
            autoFocus
          />
          <datalist id={`${uid}-names`}>
            {options[role].map((n) => <option key={n} value={n} />)}
          </datalist>
        </>
      )}

      <ModalFooter
        pending={pending}
        saveDisabled={!role}
        left={editRole && (
          <Button type="button" variant="ghost" className="text-destructive" disabled={pending}
            onClick={() => save('', `${TEAM_ROLE_LABEL[editRole]} removed`)}>
            Remove from deal
          </Button>
        )}
      />
    </form>
  );
}

// -----------------------------------------------------------------------------
// Edit (pencil) and remove (×) on each person in the panel
// -----------------------------------------------------------------------------
export function EditPersonButton({ txId, target, label, canRemove, team, teamOptions }: {
  txId: string;
  target: EditTarget;
  label: string;
  canRemove: boolean;
  team: TeamNames;
  teamOptions: Record<TeamRole, string[]>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Edit ${label}`}
        title="Edit"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full p-1 text-muted-foreground opacity-60 group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
      >
        <Pencil className="size-3.5" />
      </button>
      <Modal open={open} onOpenChange={setOpen}>
        {target.kind === 'team' ? (
          <TeamForm txId={txId} team={team} options={teamOptions} editRole={target.role} onDone={() => setOpen(false)} />
        ) : (
          <EditPartyForm txId={txId} target={target} canRemove={canRemove} onDone={() => setOpen(false)} />
        )}
      </Modal>
    </>
  );
}

function EditPartyForm({ txId, target, canRemove, onDone }: {
  txId: string;
  target: Extract<EditTarget, { kind: 'party' | 'primary' }>;
  canRemove: boolean;
  onDone: () => void;
}) {
  const uid = useId();
  const [f, setF] = useState<Details>(target.details);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const roleLabel = PARTY_ROLE_LABEL[target.role];
  const set = (k: keyof Details, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = target.kind === 'party'
        ? await updateDealParty(txId, target.partyId, f)
        : await addDealParty({ txId, role: target.role, contactId: '', replacePrimary: true, ...f });
      if (r.ok) {
        toast.success(`${roleLabel} updated`);
        onDone();
        return;
      }
      setErrors(r.fieldErrors ?? {});
      setFormError(r.error ?? null);
    });
  };

  const remove = () => {
    if (target.kind !== 'party') return;
    if (!window.confirm(`Remove ${f.fullName || roleLabel} from this deal? They stay in Contacts.`)) return;
    start(async () => {
      const r = await removeDealParty(txId, target.partyId);
      if (r.ok) {
        toast.success(`${roleLabel} removed`);
        onDone();
      } else setFormError(r.error ?? 'Could not remove.');
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <ModalHeader title={`Edit ${roleLabel.toLowerCase()}`} description="Changes are saved to their contact, so they show on every deal they’re on." />
      <FormError message={formError} />
      <TextField
        id={`${uid}-fullName`}
        label={target.role === 'title_company' ? 'Contact full name' : 'Full name'}
        value={f.fullName}
        onChange={(v) => set('fullName', v)}
        error={errors.fullName?.[0]}
        autoFocus
      />
      <DetailFields uid={uid} f={f} set={set} errors={errors} companyLabel={companyLabelFor(target.role)} />
      <ModalFooter
        pending={pending}
        left={target.kind === 'party' && canRemove && (
          <Button type="button" variant="ghost" className="text-destructive" disabled={pending} onClick={remove}>Remove from deal</Button>
        )}
      />
    </form>
  );
}

/** Quick "×" to take someone off the deal. Saved contacts stay in Contacts. */
export function RemovePersonButton({ txId, target, label }: {
  txId: string;
  target: { kind: 'party'; partyId: string } | { kind: 'team'; role: TeamRole };
  label: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={`Remove ${label} from this deal`}
      title="Remove from deal"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Remove ${label} from this deal?${target.kind === 'party' ? ' They stay in Contacts.' : ''}`)) return;
        start(async () => {
          const r = target.kind === 'party' ? await removeDealParty(txId, target.partyId) : await updateDealHeaderField(txId, target.role, '');
          if (r.ok) toast.success(`${label} removed`);
          else toast.error(r.error ?? 'Could not remove.');
        });
      }}
      className="shrink-0 rounded-full p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 disabled:opacity-50"
    >
      <X className="size-3.5" />
    </button>
  );
}
