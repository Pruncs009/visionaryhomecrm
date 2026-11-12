import type { Metadata } from 'next';
import { requireContext } from '@/features/auth/guards';
import { createLead } from '@/features/leads/actions';
import { LeadForm } from '@/features/leads/components/lead-form';
import { getTeamMembers } from '@/features/leads/queries';

export const metadata: Metadata = { title: 'New lead' };

export default async function NewLeadPage() {
  const ctx = await requireContext();
  const members = await getTeamMembers(ctx.organization.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New lead</h1>
        <p className="text-sm text-muted-foreground">Capture a new inquiry and assign it to an agent.</p>
      </div>
      <LeadForm
        action={createLead}
        members={members}
        submitLabel="Create lead"
        cancelHref="/leads"
        // New leads default to the person creating them.
        defaults={{ status: 'new', intent: 'buy', assigned_to: ctx.userId }}
      />
    </div>
  );
}
