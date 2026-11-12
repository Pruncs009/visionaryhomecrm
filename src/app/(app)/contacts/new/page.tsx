import type { Metadata } from 'next';
import { requireContext } from '@/features/auth/guards';
import { createContact } from '@/features/contacts/actions';
import { ContactForm } from '@/features/contacts/components/contact-form';
import { getTeamMembers } from '@/features/leads/queries';

export const metadata: Metadata = { title: 'New contact' };

export default async function NewContactPage() {
  const ctx = await requireContext();
  const members = await getTeamMembers(ctx.organization.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New contact</h1>
        <p className="text-sm text-muted-foreground">Add a person to your database.</p>
      </div>
      <ContactForm
        action={createContact}
        members={members}
        submitLabel="Create contact"
        cancelHref="/contacts"
        showTags
        defaults={{ owner_id: ctx.userId }}
      />
    </div>
  );
}
