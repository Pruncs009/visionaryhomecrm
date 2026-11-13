'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { BellRing, X } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { BC_SETUP_TASKS, DEAL_SETUP_TASKS, LM_TASKS } from '../constants';

export type DealManagers = { lead: string | null; acquisition: string | null };

/** Setup tasks in checklist order (they're all created at the same moment). */
export function sortSetupTasks<T extends { title: string }>(tasks: T[]): T[] {
  const order = (t: T) => {
    const i = (DEAL_SETUP_TASKS as readonly string[]).indexOf(t.title);
    if (i !== -1) return i;
    const j = (BC_SETUP_TASKS as readonly string[]).indexOf(t.title);
    if (j !== -1) return j;
    const k = (LM_TASKS as readonly string[]).indexOf(t.title);
    return k === -1 ? 99 : k;
  };
  return [...tasks].sort((a, b) => order(a) - order(b));
}

/** "Lead Manager: … · Acquisition Manager: …" for the checklist's assignees. */
export function managersLabel(m: DealManagers) {
  return `Lead Manager: ${m.lead || 'not set yet'} · Acquisition Manager: ${m.acquisition || 'not set yet'}`;
}

/**
 * Reminder popup for the deal setup checklist. It only reminds: the tasks are
 * completed on the Tasks tab. Shows right after a new deal is created, and when
 * setup tasks are overdue (once per browser session per deal, so it doesn't
 * reappear on every visit).
 */
export function DealSetupReminder({ txId, openCount, overdueCount, lmOpenCount = 0, lmOverdueCount = 0, lmDueDate = null, managers, justCreated }: {
  txId: string;
  openCount: number;
  overdueCount: number;
  /** Lead Manager follow-ups (campaign, ARV, rehab, photos). */
  lmOpenCount?: number;
  lmOverdueCount?: number;
  /** When the Lead Manager follow-ups are due (YYYY-MM-DD). */
  lmDueDate?: string | null;
  managers: DealManagers;
  justCreated: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const seenKey = `deal-setup-reminder:${txId}`;

  useEffect(() => {
    if (openCount === 0 && lmOpenCount === 0) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(seenKey) === '1';
    } catch {
      /* storage blocked: just show it */
    }
    if ((justCreated && openCount > 0) || ((overdueCount > 0 || lmOverdueCount > 0) && !seen)) setOpen(true);
  }, [justCreated, openCount, overdueCount, lmOpenCount, lmOverdueCount, seenKey]);

  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(seenKey, '1');
    } catch {
      /* ignore */
    }
    // Either way, go to the Tasks tab, on Overdue when something is overdue
    // (this also drops ?setup=1 so a refresh doesn't reopen the popup).
    const anyOverdue = overdueCount > 0 || lmOverdueCount > 0;
    router.replace(anyOverdue ? '?tab=tasks&tasks=overdue' : '?tab=tasks', { scroll: false });
  };

  const tasksWord = openCount === 1 ? 'task' : 'tasks';
  const setupLine = openCount === 0 ? null : overdueCount > 0
    ? `${overdueCount} of the deal setup ${tasksWord} ${overdueCount === 1 ? 'is' : 'are'} overdue.`
    : justCreated ? `This deal has ${openCount} setup ${tasksWord} to complete.` : null;
  const lmWord = (n: number) => (n === 1 ? 'task' : 'tasks');
  const lmLine = lmOverdueCount > 0
    ? `${lmOverdueCount} Lead Manager ${lmWord(lmOverdueCount)} ${lmOverdueCount === 1 ? 'is' : 'are'} overdue (campaign name, ARV, rehab estimate, photos link).`
    : justCreated && lmOpenCount > 0 && lmDueDate
      ? `The Lead Manager also has ${lmOpenCount} ${lmWord(lmOpenCount)} due ${new Date(`${lmDueDate}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
      : null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover p-5 text-popover-foreground ring-1 ring-foreground/10 outline-none">
          <div className="flex items-start justify-between gap-4">
            <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
              <BellRing className="size-4 text-amber-500" aria-hidden /> {setupLine ? 'Reminder: complete the deal setup' : 'Reminder for the Lead Manager'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description render={<div />} className="mt-2 space-y-3 text-sm">
            {setupLine && (
              <div>
                <p>{setupLine}</p>
                <p className="mt-1 text-xs text-muted-foreground">Assigned to {managersLabel(managers)}</p>
              </div>
            )}
            {lmLine && (
              <div>
                <p>{lmLine}</p>
                <p className="mt-1 text-xs text-muted-foreground">Assigned to Lead Manager: {managers.lead || 'not set yet'}</p>
              </div>
            )}
            <p>Complete them on the <strong>Tasks</strong> tab.</p>
          </DialogPrimitive.Description>
          <div className="mt-5 flex justify-end gap-2">
            <DialogPrimitive.Close className={buttonVariants({ variant: 'outline' })}>Later</DialogPrimitive.Close>
            <button type="button" onClick={close} className={buttonVariants()}>Go to tasks</button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
