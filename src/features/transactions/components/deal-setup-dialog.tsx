'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { BellRing, X } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { DEAL_SETUP_TASKS } from '../constants';

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
 * Reminder popup for the deal setup checklist. It only reminds: the tasks are
 * completed on the Tasks tab. Shows right after a new deal is created, and when
 * setup tasks are overdue (once per browser session per deal, so it doesn't
 * reappear on every visit).
 */
export function DealSetupReminder({ txId, openCount, overdueCount, managers, justCreated }: {
  txId: string;
  openCount: number;
  overdueCount: number;
  managers: DealManagers;
  justCreated: boolean;
}) {
  const [open, setOpen] = useState(false);
  const seenKey = `deal-setup-reminder:${txId}`;

  useEffect(() => {
    if (openCount === 0) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(seenKey) === '1';
    } catch {
      /* storage blocked: just show it */
    }
    if (justCreated || (overdueCount > 0 && !seen)) setOpen(true);
  }, [justCreated, openCount, overdueCount, seenKey]);

  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(seenKey, '1');
    } catch {
      /* ignore */
    }
    // Drop ?setup=1 so a refresh doesn't reopen it.
    const url = new URL(window.location.href);
    if (url.searchParams.has('setup')) {
      url.searchParams.delete('setup');
      window.history.replaceState(window.history.state, '', url);
    }
  };

  const tasksWord = openCount === 1 ? 'task' : 'tasks';
  const message = overdueCount > 0
    ? `${overdueCount} of the deal setup ${tasksWord} ${overdueCount === 1 ? 'is' : 'are'} overdue.`
    : `This deal has ${openCount} setup ${tasksWord} to complete.`;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover p-5 text-popover-foreground ring-1 ring-foreground/10 outline-none">
          <div className="flex items-start justify-between gap-4">
            <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
              <BellRing className="size-4 text-amber-500" aria-hidden /> Reminder: complete the deal setup
            </DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="mt-2 text-sm">
            {message} Complete them on the <strong>Tasks</strong> tab.
          </DialogPrimitive.Description>
          <p className="mt-2 text-xs text-muted-foreground">Assigned to {managersLabel(managers)}</p>
          <div className="mt-5 flex justify-end gap-2">
            <DialogPrimitive.Close className={buttonVariants({ variant: 'outline' })}>Later</DialogPrimitive.Close>
            <Link href="?tab=tasks" scroll={false} onClick={close} className={buttonVariants()}>Go to tasks</Link>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
