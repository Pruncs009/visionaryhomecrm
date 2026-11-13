'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';
import { ClipboardCheck, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { TeamMember } from '@/features/leads/types';
import { cn } from '@/lib/utils';
import { addDealTask, deleteDealTask, setDealTaskDone } from '../deal-actions';
import type { DealTask } from '../types';
import { formatDateOnly } from './tx-bits';
import { Initials } from './deal-people';
import { managersLabel, sortSetupTasks, type DealManagers } from './deal-setup-dialog';

type Bucket = 'overdue' | 'upcoming' | 'completed';

const BUCKETS: { key: Bucket; label: string; dot: string; ring: string }[] = [
  { key: 'overdue', label: 'Overdue', dot: 'bg-critical', ring: 'border-critical/40 text-critical' },
  { key: 'upcoming', label: 'Upcoming', dot: 'bg-success', ring: 'border-success/40 text-foreground' },
  { key: 'completed', label: 'Completed', dot: 'bg-primary', ring: 'border-primary/40 text-foreground' },
];

const PRIORITY: Record<DealTask['priority'], { label: string; className: string }> = {
  urgent: { label: 'Urgent', className: 'bg-critical/10 text-critical' },
  high: { label: 'High', className: 'bg-amber-500/15 text-foreground' },
  normal: { label: 'Normal', className: 'bg-muted text-muted-foreground' },
  low: { label: 'Low', className: 'bg-muted text-muted-foreground' },
};

function bucketOf(t: DealTask, today: string): Bucket {
  if (t.done) return 'completed';
  if (!t.dueDate) return 'upcoming';
  if (t.dueDate < today) return 'overdue';
  // Due today or later (no separate "Due today" filter).
  return 'upcoming';
}

export function DealTasks({
  txId,
  tasks,
  members,
  today,
  canDelete,
  managers,
}: {
  txId: string;
  tasks: DealTask[];
  members: TeamMember[];
  /** Lead / Acquisition Manager names on the deal (assignees of the setup checklist). */
  managers: DealManagers;
  /** YYYY-MM-DD in the viewer's timezone */
  today: string;
  canDelete: boolean;
}) {
  const [filter, setFilter] = useState<Bucket | null>(null);
  const [adding, setAdding] = useState(false);
  const [optimistic, setDone] = useOptimistic(tasks, (list, { id, done }: { id: string; done: boolean }) =>
    list.map((t) => (t.id === id ? { ...t, done } : t)),
  );
  const [, start] = useTransition();
  const names = useMemo(() => new Map(members.map((m) => [m.userId, m.name])), [members]);

  // Setup checklist first, in its own order; then everything else as sorted by the server.
  const ordered = [
    ...sortSetupTasks(optimistic.filter((t) => t.kind === 'deal_setup')),
    ...sortSetupTasks(optimistic.filter((t) => t.kind === 'lm_followup')),
    ...optimistic.filter((t) => t.kind !== 'deal_setup' && t.kind !== 'lm_followup'),
  ];
  const withBucket = ordered.map((t) => ({ ...t, bucket: bucketOf(t, today) }));
  const counts = Object.fromEntries(BUCKETS.map((b) => [b.key, withBucket.filter((t) => t.bucket === b.key).length])) as Record<Bucket, number>;
  const visible = withBucket.filter((t) => (filter ? t.bucket === filter : t.bucket !== 'completed'));

  const toggle = (t: DealTask) =>
    start(async () => {
      setDone({ id: t.id, done: !t.done });
      const r = await setDealTaskDone(txId, t.id, !t.done);
      if (r.ok) toast.success(t.done ? 'Task reopened' : 'Task completed');
      else toast.error(r.error);
    });

  const remove = (t: DealTask) => {
    if (!confirm(`Delete "${t.title}"?`)) return;
    start(async () => {
      const r = await deleteDealTask(txId, t.id);
      if (r.ok) toast.success('Task deleted');
      else toast.error(r.error);
    });
  };

  return (
    <section aria-labelledby="tasks-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="tasks-heading" className="text-base font-semibold">
          {filter ? BUCKETS.find((b) => b.key === filter)!.label : 'Open'} tasks
        </h2>
        <Button size="sm" variant={adding ? 'outline' : 'default'} onClick={() => setAdding((a) => !a)}>
          {adding ? <><X /> Cancel</> : <><Plus /> Add task</>}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter tasks">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            type="button"
            aria-pressed={filter === b.key}
            onClick={() => setFilter((f) => (f === b.key ? null : b.key))}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              b.ring,
              filter === b.key ? 'bg-foreground/5 font-medium ring-2 ring-current/20' : 'hover:bg-muted',
            )}
          >
            <span className={cn('size-1.5 rounded-full', b.dot)} aria-hidden />
            {b.label} ({counts[b.key]})
          </button>
        ))}
      </div>

      {adding && <AddTaskForm txId={txId} members={members} onDone={() => setAdding(false)} />}

      {visible.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <ClipboardCheck className="size-4" aria-hidden />
          {tasks.length === 0
            ? 'No tasks on this deal yet. Add the first one.'
            : filter
              ? `No ${BUCKETS.find((b) => b.key === filter)!.label.toLowerCase()} tasks.`
              : 'All tasks are done.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-8 py-2 font-normal"><span className="sr-only">Done</span></th>
                <th className="py-2 font-normal">Task</th>
                <th className="py-2 pr-3 font-normal">Due date</th>
                <th className="py-2 pr-3 font-normal">Who</th>
                <th className="py-2 pr-3 font-normal">Priority</th>
                <th className="w-8 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const who = t.assignedTo ? names.get(t.assignedTo) ?? 'Teammate' : null;
                return (
                  <tr key={t.id} className="group border-b last:border-0">
                    <td className="py-2.5">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={t.done}
                        onChange={() => toggle(t)}
                        aria-label={`Mark "${t.title}" ${t.done ? 'not done' : 'done'}`}
                      />
                    </td>
                    <td className={cn('py-2.5 pr-3', t.done && 'text-muted-foreground line-through')}>{t.title}</td>
                    <td className={cn('py-2.5 pr-3 whitespace-nowrap tabular-nums', t.bucket === 'overdue' && 'font-medium text-critical')}>
                      {t.dueDate ? formatDateOnly(t.dueDate, { month: '2-digit', day: '2-digit', year: '2-digit' }) : '—'}
                    </td>
                    <td className="py-2.5 pr-3">
                      {t.assigneeRole === 'lead_acquisition' ? (
                        <ManagersWho managers={managers} />
                      ) : t.assigneeRole === 'lead_manager' ? (
                        <ManagersWho managers={{ lead: managers.lead, acquisition: null }} emptyLabel="Lead Mgr" />
                      ) : who ? (
                        <Initials name={who} size="sm" title={who} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs', PRIORITY[t.priority].className)}>{PRIORITY[t.priority].label}</span>
                    </td>
                    <td className="py-2.5 text-right">
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Delete "${t.title}"`}
                          className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                          onClick={() => remove(t)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AddTaskForm({ txId, members, onDone }: { txId: string; members: TeamMember[]; onDone: () => void }) {
  const bound = useMemo(() => addDealTask.bind(null, txId), [txId]);
  const [state, action, pending] = useActionState(bound, {});
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      formRef.current?.reset();
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  const err = (k: string) => state.fieldErrors?.[k]?.[0];
  return (
    <form ref={formRef} action={action} className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end">
      <div className="space-y-1">
        <label htmlFor="task-title" className="text-xs font-medium">Task</label>
        <Input id="task-title" name="title" required autoFocus placeholder="e.g. Order title commitment" defaultValue={state.values?.title} aria-invalid={!!err('title')} />
      </div>
      <div className="space-y-1">
        <label htmlFor="task-due" className="text-xs font-medium">Due</label>
        <Input id="task-due" name="due" type="date" defaultValue={state.values?.due} aria-invalid={!!err('due')} />
      </div>
      <div className="space-y-1">
        <label htmlFor="task-who" className="text-xs font-medium">Who</label>
        <NativeSelect id="task-who" name="assigned_to" defaultValue={state.values?.assigned_to ?? ''}>
          <NativeSelectOption value="">Unassigned</NativeSelectOption>
          {members.map((m) => <NativeSelectOption key={m.userId} value={m.userId}>{m.name}</NativeSelectOption>)}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <label htmlFor="task-priority" className="text-xs font-medium">Priority</label>
        <NativeSelect id="task-priority" name="priority" defaultValue={state.values?.priority ?? 'normal'}>
          {(['low', 'normal', 'high', 'urgent'] as const).map((p) => <NativeSelectOption key={p} value={p}>{PRIORITY[p].label}</NativeSelectOption>)}
        </NativeSelect>
      </div>
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save task'}</Button>
      {(err('title') || err('due') || state.error) && (
        <p className="text-sm text-destructive sm:col-span-5">{err('title') ?? err('due') ?? state.error}</p>
      )}
    </form>
  );
}

/** Assignees of a setup task: the deal's Lead and Acquisition Manager. */
function ManagersWho({ managers, emptyLabel = 'Lead & Acq. Mgr' }: { managers: DealManagers; emptyLabel?: string }) {
  const names = [managers.lead, managers.acquisition].filter((n): n is string => !!n);
  const unique = [...new Set(names)];
  if (unique.length === 0) return <span className="text-xs whitespace-nowrap text-muted-foreground">{emptyLabel}</span>;
  return (
    <span className="flex -space-x-1.5" title={managersLabel(managers)}>
      {unique.map((n) => <Initials key={n} name={n} size="sm" title={n} />)}
    </span>
  );
}
