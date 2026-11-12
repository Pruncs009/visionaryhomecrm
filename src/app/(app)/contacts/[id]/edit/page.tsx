import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireContext } from '@/features/auth/guards';
import { updateContact } from '@/features/contacts/actions';
import { ContactForm } from '@/features/contacts/components/contact-form';
import { getContact } from '@/features/contacts/queries';
import { uuidSchema } from '@/features/contacts/schemas';
import { getTeamMembers } from '@/features/leads/queries';

export const metadata: Metadata = { title: 'Edit contact' };

type PageProps = { params: Promise<{ id: string }> };
const str = (v: string | boolean | null | undefined) => (v === null || v === undefined ? '' : String(v));

export default async function EditContactPage({ params }: PageProps) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const ctx = await requireContext();
  const [contact, members] = await Promise.all([getContact(ctx.organization.id, id), getTeamMembers(ctx.organization.id)]);
  if (!contact) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit contact</h1>
        <p className="text-sm text-muted-foreground">{contact.full_name}</p>
      </div>
      <ContactForm
        action={updateContact.bind(null, contact.id)}
        members={members}
        submitLabel="Save changes"
        cancelHref={`/contacts/${contact.id}`}
        showTags={false}
        defaults={{
          first_name: contact.first_name,
          last_name: str(contact.last_name),
          email: str(contact.email),
          phone: str(contact.phone),
          mobile_phone: str(contact.mobile_phone),
          birthday: str(contact.birthday),
          company: str(contact.company),
          job_title: str(contact.job_title),
          address_line1: str(contact.address_line1),
          address_line2: str(contact.address_line2),
          city: str(contact.city),
          state: str(contact.state),
          postal_code: str(contact.postal_code),
          owner_id: str(contact.owner_id),
          source: str(contact.source),
          preferred_contact_method: str(contact.preferred_contact_method),
          do_not_contact: contact.do_not_contact ? 'on' : '',
        }}
      />
    </div>
  );
}
