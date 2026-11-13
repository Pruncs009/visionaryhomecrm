'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { ClipboardCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DEAL_SETUP_TASKS } from '../constants';
import { setDealTaskDone } from '../deal-actions';
import type { DealTask } from '../types';

export type DealManagers = { lead: string | null; acquisition: string | null };

/** Setup tasks in checklist order (they're all created at the same moment). */
export function sortSetupTasks<T extends { title: string }>(tasks: T[]): T[] {
  const order = (t: T) => {
    const i = (DEAL_SETUP_TASKS as readonly string[]).indexOf(t.title);
    return i === -1 ? 99 : i;
  };
  return [...tasks].sort((a, b) => order(a) - order(b));
}

/** "Lead Manager: … · Acquisition Manager: …" for the checklist's assignees. */
export function managersLabel(m: DealManagers) {
  return `Lead Manager: ${m.lead || 'not set yet'} · Acquisition Manager: ${m.acquisition || 'not set yet'}`;
}

/**
 * Popup shown right after a new deal is created: the 4 setup tasks, each with a
 * checkbox on the right. Closing it keeps the tasks on the Tasks tab.
 */
export function DealSetupDialog({ txId, tasks, managers, defaultOpen }: {
  txId: string;
  tasks: DealTask[];
  managers: DealManagers;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [items, setDone] = useOptimistic(sortSetupTasks(tasks), (list, { id, done }: { id: string; done: boolean }) =>
    list.map((t) => (t.id === id ? { ...t, done } : t)),
  );
  const [, start] = useTransition();
  const doneCount = items.filter((t) => t.done).length;

  const close = () => {
    setOpen(false);
    // Drop ?setup=1 so a refresh doesn't reopen the popup.
    const url = new URL(window.location.href);
    if (url.searchParams.has('setup')) {
      url.searchParams.delete('setup');
      window.history.replaceState(window.history.state, '', url);
    }
  };

  const toggle = (t: DealTask) =>
    start(async () => {
      setDone({ id: t.id, done: !t.done });
      const r = await setDealTaskDone(txId, t.id, !t.done);
      if (!r.ok) return void toast.error(r.error);
      const allDone = items.every((x) => (x.id === t.id ? !t.done : x.done));
      if (allDone) {
        toast.success('Deal setup complete');
        close();
      }
    });

  if (items.length === 0) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-popover p-5 text-popover-foreground ring-1 ring-foreground/10 outline-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
                <ClipboardCheck className="size-4 text-primary" aria-hidden /> Complete the deal setup
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                Tick each task when it's done. {doneCount} of {items.length} done.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <ol className="mt-4 divide-y rounded-lg border">
            {items.map((t, i) => (
              <li key={t.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-3 text-sm hover:bg-muted/50">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">{i + 1}</span>
                  <span className={cn('flex-1', t.done && 'text-muted-foreground line-through')}>{t.title}</span>
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-primary"
                    checked={t.done}
                    onChange={() => toggle(t)}
                    aria-label={`Mark "${t.title}" ${t.done ? 'not done' : 'done'}`}
                  />
                </label>
              </li>
            ))}
          </ol>

          <p className="mt-3 text-xs text-muted-foreground">Assigned to {managersLabel(managers)}</p>

          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" onClick={close}>{doneCount === items.length ? 'Done' : 'Finish later'}</Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
