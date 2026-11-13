'use client';

import { useRouter } from 'next/navigation';
import { useOptimistic, useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { TeamMember } from '@/features/leads/types';
import type { TransactionStatus } from '@/types/database.types';
import { assignTransactionAgent, deleteTransaction, updateTransactionStatus } from '../actions';
import { TX_STATUS, TX_STATUS_VALUES } from '../constants';

export function TxStatusSelect({ id, status }: { id: string; status: TransactionStatus }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(status);
  return (
    <NativeSelect aria-label="Transaction status" className="w-full" value={value} disabled={pending}
      onChange={(e) => {
        const next = e.target.value as TransactionStatus;
        start(async () => {
          setValue(next);
          const r = await updateTransactionStatus(id, next);
          if (r.ok) toast.success(`Status: ${TX_STATUS[next].label}`);
          else toast.error(r.error);
        });
      }}>
      {TX_STATUS_VALUES.map((s) => <NativeSelectOption key={s} value={s}>{TX_STATUS[s].label}</NativeSelectOption>)}
    </NativeSelect>
  );
}

export function TxAgentSelect({ id, agentId, members }: { id: string; agentId: string | null; members: TeamMember[] }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(agentId ?? '');
  return (
    <NativeSelect aria-label="Assigned agent" className="w-full" value={value} disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          setValue(next);
          const r = await assignTransactionAgent(id, next || null);
          if (r.ok) toast.success(next ? `Assigned to ${members.find((m) => m.userId === next)?.name}` : 'Agent removed');
          else toast.error(r.error);
        });
      }}>
      <NativeSelectOption value="">Unassigned</NativeSelectOption>
      {members.map((m) => <NativeSelectOption key={m.userId} value={m.userId}>{m.name}</NativeSelectOption>)}
    </NativeSelect>
  );
}

export function DeleteTransactionButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}><Trash2 /> Delete</Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The deal moves to <strong>Deleted</strong> in the menu. You can restore it from there or delete it permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending}
              onClick={() => start(async () => {
                const r = await deleteTransaction(id);
                if (!r.ok) return void toast.error(r.error);
                toast.success(`${name} moved to Deleted`);
                setOpen(false);
                router.push('/deals/deleted');
              })}>
              {pending ? 'Deleting…' : 'Delete transaction'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
