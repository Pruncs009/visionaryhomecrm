'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeleteLeadDialog } from './delete-lead-dialog';

export function LeadDetailActions({ leadId, leadName, canDelete }: { leadId: string; leadName: string; canDelete: boolean }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <div className="flex gap-2">
      <Button variant="outline" render={<Link href={`/leads/${leadId}/edit`} />} nativeButton={false}>
        <Pencil /> Edit
      </Button>
      {canDelete && (
        <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
          <Trash2 /> Delete
        </Button>
      )}
      <DeleteLeadDialog
        leadId={leadId}
        leadName={leadName}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        redirectTo="/leads"
      />
    </div>
  );
}
