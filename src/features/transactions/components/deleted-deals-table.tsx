'use client';

import { useState, useTransition } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DealStageBadge } from '@/features/deals/components/deal-stage';
import { DEAL_STAGE } from '@/features/deals/constants';
import { formatCurrency } from '@/lib/utils';
import { purgeTransaction, restoreTransaction } from '../actions';
import type { DeletedDeal } from '../queries';

/** Deleted menu: restore a deal, or delete it permanently (with a confirmation). */
export function DeletedDealsTable({ deals, timezone, canManage }: { deals: DeletedDeal[]; timezone: string; canManage: boolean }) {
  const [confirming, setConfirming] = useState<DeletedDeal | null>(null);
  const [pending, start] = useTransition();
  const when = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone });

  const restore = (d: DeletedDeal) =>
    start(async () => {
      const r = await restoreTransaction(d.id);
      if (r.ok) toast.success(`${d.address} restored`);
      else toast.error(r.error);
    });

  const purge = (d: DeletedDeal) =>
    start(async () => {
      const r = await purgeTransaction(d.id);
      if (r.ok) {
        toast.success(`${d.address} permanently deleted`);
        setConfirming(null);
      } else toast.error(r.error);
    });

  return (
    <>
      <div className="rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Property</TableHead>
              <TableHead>Stage when deleted</TableHead>
              <TableHead className="hidden text-right md:table-cell">Purchase price</TableHead>
              <TableHead className="hidden sm:table-cell">Deleted</TableHead>
              {canManage && <TableHead className="pr-4 text-right"><span className="sr-only">Actions</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="max-w-72 pl-4">
                  <span className="block truncate font-medium">{d.address}</span>
                  {d.cityState && <span className="block truncate text-xs text-muted-foreground">{d.cityState}</span>}
                </TableCell>
                <TableCell>{d.stage in DEAL_STAGE ? <DealStageBadge stage={d.stage} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">
                  {d.purchasePrice !== null ? formatCurrency(d.purchasePrice) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{when.format(new Date(d.deletedAt))}</TableCell>
                {canManage && (
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" disabled={pending} onClick={() => restore(d)}><RotateCcw /> Restore</Button>
                      <Button variant="destructive" size="sm" disabled={pending} onClick={() => setConfirming(d)}><Trash2 /> Delete permanently</Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {confirming?.address}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the deal with its tasks, notes and documents for good. It can&apos;t be undone.
              Contacts and the property record are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => confirming && purge(confirming)}>
              {pending ? 'Deleting…' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
