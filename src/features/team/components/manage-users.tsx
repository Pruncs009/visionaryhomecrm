'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Check, Eye, EyeOff, ShieldCheck, UserPlus, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EXTRA_AREAS, isAdminRole, type ExtraArea } from '@/features/auth/access';
import { cn } from '@/lib/utils';
import { addTeamUser, updateTeamUserAccess } from '../actions';
import { DEFAULT_PASSWORD, type TeamResult, type TeamUser } from '../types';

type Access = 'admin' | 'user';

export function ManageUsers({ users, meId, timezone }: { users: TeamUser[]; meId: string; timezone: string }) {
  const [adding, setAdding] = useState(false);
  const when = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone });
  const admins = users.filter((u) => isAdminRole(u.role)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Manage Users</h1>
          <p className="text-sm text-muted-foreground">
            {users.length} {users.length === 1 ? 'person has' : 'people have'} access · {admins} admin{admins === 1 ? '' : 's'}
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <UserPlus /> Add user
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Can also open</TableHead>
              <TableHead>Last sign-in</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <UserRow key={u.userId} user={u} isMe={u.userId === meId} lastSignIn={u.lastSignInAt ? when.format(new Date(u.lastSignInAt)) : null} />
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Users see the deal stages (Under Contract through Deleted), messages and their notifications. Tick the extra pages each
        user may open. Admins see everything, including this page.
      </p>

      <AddUserDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
}

function UserRow({ user, isMe, lastSignIn }: { user: TeamUser; isMe: boolean; lastSignIn: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const admin = isAdminRole(user.role);
  const locked = isMe || user.role === 'owner';

  const save = (access: Access, permissions: ExtraArea[], ok: string) =>
    start(async () => {
      const r: TeamResult = await updateTeamUserAccess({ userId: user.userId, access, permissions });
      if (r.ok) {
        toast.success(ok);
        router.refresh();
      } else toast.error(r.error);
    });

  const toggle = (area: ExtraArea) => {
    const next = user.permissions.includes(area) ? user.permissions.filter((p) => p !== area) : [...user.permissions, area];
    const label = EXTRA_AREAS.find((a) => a.key === area)!.label;
    save('user', next, `${user.name} ${next.includes(area) ? 'can now open' : 'can no longer open'} ${label}`);
  };

  return (
    <TableRow className={cn(pending && 'opacity-60')}>
      <TableCell>
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-teal/15 text-xs font-semibold text-foreground">{initials(user.name)}</span>
          <div className="min-w-0">
            <div className="truncate font-medium">
              {user.name}
              {isMe && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
            </div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {user.mustChangePassword ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
            {user.lastSignInAt ? 'Must change password' : 'Not signed in yet'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
            <span className="size-1.5 rounded-full bg-green-500" aria-hidden />
            Active
          </span>
        )}
      </TableCell>
      <TableCell>
        {locked ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <ShieldCheck className="size-4 text-brand-teal" aria-hidden />
            {user.role === 'owner' ? 'Admin (owner)' : admin ? 'Admin' : 'User'}
          </span>
        ) : (
          <NativeSelect
            size="sm"
            aria-label={`Access for ${user.name}`}
            value={admin ? 'admin' : 'user'}
            disabled={pending}
            onChange={(e) => {
              const access = e.target.value as Access;
              save(access, access === 'admin' ? [] : user.permissions, `${user.name} is now ${access === 'admin' ? 'an admin' : 'a user'}`);
            }}
          >
            <NativeSelectOption value="admin">Admin</NativeSelectOption>
            <NativeSelectOption value="user">User</NativeSelectOption>
          </NativeSelect>
        )}
      </TableCell>
      <TableCell>
        {admin ? (
          <span className="text-sm text-muted-foreground">Everything</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {EXTRA_AREAS.map((a) => {
              const on = user.permissions.includes(a.key);
              return (
                <button
                  key={a.key}
                  type="button"
                  disabled={pending || locked}
                  aria-pressed={on}
                  onClick={() => toggle(a.key)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors disabled:opacity-60',
                    on ? 'border-brand-yellow bg-brand-yellow font-medium text-neutral-900' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {on && <Check className="size-3" aria-hidden />}
                  {a.label}
                </button>
              );
            })}
          </div>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{lastSignIn ?? 'Never'}</TableCell>
    </TableRow>
  );
}

function AddUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [show, setShow] = useState(false);
  const [access, setAccess] = useState<Access>('user');
  const [permissions, setPermissions] = useState<ExtraArea[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setEmail('');
    setPassword(DEFAULT_PASSWORD);
    setShow(false);
    setAccess('user');
    setPermissions([]);
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await addTeamUser({ full_name: name, email, password, access, permissions });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(`${name.trim()} was added`, {
        description: `They can sign in with ${email.trim().toLowerCase()} and the default password, then choose their own.`,
      });
      onOpenChange(false);
      reset();
      router.refresh();
    });
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) reset();
        onOpenChange(o);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-popover p-5 text-popover-foreground ring-1 ring-foreground/10 outline-none">
          <div className="flex items-center justify-between">
            <DialogPrimitive.Title className="text-base font-semibold">Add user</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
            They sign in with this email and password, then must choose their own password.
          </DialogPrimitive.Description>

          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field label="Full name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="off" placeholder="e.g. Maria Santos" />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" placeholder="name@company.com" />
            </Field>
            <Field label="Default password">
              <div className="relative">
                <Input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  maxLength={72}
                  autoComplete="new-password"
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-medium">Access</legend>
              <div className="grid grid-cols-2 gap-2">
                <AccessChoice
                  selected={access === 'user'}
                  onSelect={() => setAccess('user')}
                  icon={<UserRound className="size-4" />}
                  title="User"
                  text="Deal stages only, plus any pages you tick"
                />
                <AccessChoice
                  selected={access === 'admin'}
                  onSelect={() => setAccess('admin')}
                  icon={<ShieldCheck className="size-4" />}
                  title="Admin"
                  text="Everything, including Manage Users"
                />
              </div>
            </fieldset>

            {access === 'user' && (
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Can also open</legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {EXTRA_AREAS.map((a) => (
                    <label key={a.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-brand-teal)]"
                        checked={permissions.includes(a.key)}
                        onChange={(e) =>
                          setPermissions((p) => (e.target.checked ? [...p, a.key] : p.filter((x) => x !== a.key)))
                        }
                      />
                      {a.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add user'}</Button>
            </div>
          </form>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function AccessChoice({ selected, onSelect, icon, title, text }: { selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'rounded-lg border p-3 text-left transition-colors',
        selected ? 'border-brand-teal bg-brand-teal/10 ring-1 ring-brand-teal' : 'hover:bg-muted',
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">{icon}{title}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{text}</span>
    </button>
  );
}
