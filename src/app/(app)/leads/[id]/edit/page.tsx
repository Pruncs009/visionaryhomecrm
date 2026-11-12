import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireContext } from '@/features/auth/guards';
import { updateLead } from '@/features/leads/actions';
import { LeadForm } from '@/features/leads/components/lead-form';
import { getLead, getTeamMembers } from '@/features/leads/queries';
import { uuidSchema } from '@/features/leads/schemas';

export const metadata: Metadata = { title: 'Edit lead' };

type PageProps = { params: Promise<{ id: string }> };

const str = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v));

export default async function EditLeadPage({ params }: PageProps) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const ctx = await requireContext();
  const [lead, members] = await Promise.all([
    getLead(ctx.organization.id, id),
    getTeamMembers(ctx.organization.id),
  ]);
  if (!lead) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit lead</h1>
        <p className="text-sm text-muted-foreground">{lead.contact.full_name}</p>
      </div>
      <LeadForm
        // bind() fixes the lead id server-side; the client can't swap it.
        action={updateLead.bind(null, lead.id)}
        members={members}
        submitLabel="Save changes"
        cancelHref={`/leads/${lead.id}`}
        defaults={{
          first_name: lead.contact.first_name,
          last_name: str(lead.contact.last_name),
          email: str(lead.contact.email),
          phone: str(lead.contact.phone),
          status: lead.status,
          intent: lead.intent,
          source: str(lead.source),
          source_detail: str(lead.source_detail),
          assigned_to: str(lead.assigned_to),
          budget_min: str(lead.budget_min),
          budget_max: str(lead.budget_max),
          timeframe: str(lead.timeframe),
          message: str(lead.message),
          lost_reason: str(lead.lost_reason),
        }}
      />
    </div>
  );
}
