import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Ban, Building2, Cake, Mail, MapPin, Pencil, Phone, Smartphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireContext } from '@/features/auth/guards';
import { ActivityTimeline } from '@/features/contacts/components/activity-timeline';
import { DeleteContactButton } from '@/features/contacts/components/delete-contact-button';
import { NotesPanel } from '@/features/contacts/components/notes-panel';
import { TagEditor } from '@/features/contacts/components/tag-editor';
import { CONTACT_METHOD_LABEL } from '@/features/contacts/constants';
import {
  getContact, getContactActivities, getContactLeads, getContactNotes, getTagCounts,
} from '@/features/contacts/queries';
import { uuidSchema } from '@/features/contacts/schemas';
import { LEAD_INTENT, sourceLabel } from '@/features/leads/constants';
import { LeadStatusBadge } from '@/features/leads/components/lead-status-badge';
import { getTeamMembers } from '@/features/leads/queries';
import { isValidTimeZone } from '@/lib/dates';

export const metadata: Metadata = { title: 'Contact' };

type PageProps = { params: Promise<{ id: string }> };

export default async function ContactDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const ctx = await requireContext();
  const org = ctx.organization.id;

  const [contact, notes, activities, leads, tagCounts, members] = await Promise.all([
    getContact(org, id),
    getContactNotes(org, id),
    getContactActivities(org, id),
    getContactLeads(org, id),
    getTagCounts(org),
    getTeamMembers(org),
  ]);
  if (!contact) notFound();

  const timezone = isValidTimeZone(ctx.profile?.timezone) ? ctx.profile!.timezone : 'America/New_York';
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: timezone });
  const owner = members.find((m) => m.userId === contact.owner_id)?.name;
  const address = [contact.address_line1, contact.address_line2, [contact.city, contact.state].filter(Boolean).join(', '), contact.postal_code]
    .filter(Boolean)
    .join(' · ');
  const canDelete = ctx.role !== 'assistant';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/contacts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All contacts
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{contact.full_name}</h1>
            {contact.do_not_contact && (
              <Badge variant="destructive"><Ban /> Do not contact</Badge>
            )}
          </div>
          {(contact.job_title || contact.company) && (
            <p className="text-sm text-muted-foreground">{[contact.job_title, contact.company].filter(Boolean).join(' at ')}</p>
          )}
          <TagEditor contactId={contact.id} tags={contact.tags} suggestions={tagCounts.map((t) => t.tag)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href={`/contacts/${contact.id}/edit`} />} nativeButton={false}>
            <Pencil /> Edit
          </Button>
          {canDelete && <DeleteContactButton contactId={contact.id} name={contact.full_name} />}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Contact info</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                <Info icon={Mail}>{contact.email && <a className="text-primary hover:underline" href={`mailto:${contact.email}`}>{contact.email}</a>}</Info>
                <Info icon={Phone}>{contact.phone && <a className="text-primary hover:underline" href={`tel:${contact.phone}`}>{contact.phone}</a>}</Info>
                {contact.mobile_phone && <Info icon={Smartphone}><a className="text-primary hover:underline" href={`tel:${contact.mobile_phone}`}>{contact.mobile_phone}</a></Info>}
                <Info icon={MapPin}>{address || null}</Info>
                {contact.company && <Info icon={Building2}>{contact.company}</Info>}
                {contact.birthday && <Info icon={Cake}>{date.format(new Date(`${contact.birthday}T12:00:00Z`))}</Info>}
              </ul>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                <div><dt className="text-xs text-muted-foreground">Owner</dt><dd>{owner ?? '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Source</dt><dd>{sourceLabel(contact.source) ?? '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Prefers</dt><dd>{contact.preferred_contact_method ? CONTACT_METHOD_LABEL[contact.preferred_contact_method] : '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Added</dt><dd>{date.format(new Date(contact.created_at))}</dd></div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Leads</CardTitle></CardHeader>
            <CardContent>
              {leads.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leads for this contact.</p>
              ) : (
                <ul className="divide-y">
                  {leads.map((l) => (
                    <li key={l.id} className="py-2 first:pt-0 last:pb-0">
                      <Link href={`/leads/${l.id}`} className="flex items-center justify-between gap-2 hover:underline">
                        <span className="text-sm">{LEAD_INTENT[l.intent]}{l.source && <span className="text-muted-foreground"> · {sourceLabel(l.source)}</span>}</span>
                        <LeadStatusBadge status={l.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <NotesPanel contactId={contact.id} notes={notes} timezone={timezone} canDelete={canDelete} />
          <ActivityTimeline contactId={contact.id} activities={activities} timezone={timezone} />
        </div>
      </div>
    </div>
  );
}

function Info({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 break-words">{children ?? <span className="text-muted-foreground">—</span>}</span>
    </li>
  );
}
