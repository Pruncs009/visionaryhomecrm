'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteLeadDialog } from './delete-lead-dialog';

export function LeadRowActions({ leadId, leadName, canDelete }: { leadId: string; leadName: string; canDelete: boolean }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${leadName}`} />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={`/leads/${leadId}`} />}>
            <Eye /> View
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/leads/${leadId}/edit`} />}>
            <Pencil /> Edit
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteLeadDialog leadId={leadId} leadName={leadName} open={confirmOpen} onOpenChange={setConfirmOpen} />
    </>
  );
}
