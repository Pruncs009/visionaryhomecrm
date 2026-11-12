'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { LeadStatus } from '@/types/database.types';
import { assignLead, updateLeadStatus } from '../actions';
import { LEAD_STATUS, LEAD_STATUS_VALUES } from '../constants';
import type { TeamMember } from '../types';

/** Change status in place. Optimistic: the select updates immediately, reverts on error. */
export function LeadStatusSelect({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(status);

  return (
    <NativeSelect
      aria-label="Lead status"
      value={optimistic}
      disabled={isPending}
      className="w-full"
      onChange={(e) => {
        const next = e.target.value as LeadStatus;
        startTransition(async () => {
          setOptimistic(next);
          const result = await updateLeadStatus(leadId, next);
          if (result.ok) toast.success(`Status changed to ${LEAD_STATUS[next].label}`);
          else toast.error(result.error);
        });
      }}
    >
      {LEAD_STATUS_VALUES.map((s) => (
        <NativeSelectOption key={s} value={s}>
          {LEAD_STATUS[s].label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** Assign / reassign the lead's agent. */
export function LeadAssigneeSelect({
  leadId,
  assignedTo,
  members,
}: {
  leadId: string;
  assignedTo: string | null;
  members: TeamMember[];
}) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(assignedTo ?? '');

  return (
    <NativeSelect
      aria-label="Assigned agent"
      value={optimistic}
      disabled={isPending}
      className="w-full"
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          setOptimistic(next);
          const result = await assignLead(leadId, next || null);
          if (result.ok) {
            const name = members.find((m) => m.userId === next)?.name;
            toast.success(name ? `Assigned to ${name}` : 'Lead unassigned');
          } else toast.error(result.error);
        });
      }}
    >
      <NativeSelectOption value="">Unassigned</NativeSelectOption>
      {members.map((m) => (
        <NativeSelectOption key={m.userId} value={m.userId}>
          {m.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
