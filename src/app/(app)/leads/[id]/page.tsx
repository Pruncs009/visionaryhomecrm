import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireContext } from '@/features/auth/guards';
import { LEAD_INTENT, LEAD_TIMEFRAME, sourceLabel, type LeadTimeframe } from '@/features/leads/constants';
import { LeadDetailActions } from '@/features/leads/components/lead-detail-actions';
import { LeadAssigneeSelect, LeadStatusSelect } from '@/features/leads/components/lead-quick-controls';
import { LeadStatusBadge } from '@/features/leads/components/lead-status-badge';
import { getLead, getTeamMembers } from '@/features/leads/queries';
import { uuidSchema } from '@/features/leads/schemas';
import { z } from 'zod';
import { AiPanel } from '@/features/ai/components/ai-panel';
import { ScoreBadge } from '@/features/ai/components/score-badge';
import { suggestionSchema } from '@/features/ai/schemas';
import { isAiConfigured } from '@/lib/ai/openai';
import { isValidTimeZone } from '@/lib/dates';
import { formatCurrency } from '@/lib/utils';

export const metadata: Metadata = { title: 'Lead' };

type PageProps = { params: Promise<{ id: string }> };

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const ctx = await requireContext();
  const [lead, members] = await Promise.all([
    getLead(ctx.organization.id, id),
    getTeamMembers(ctx.organization.id),
  ]);
  if (!lead) notFound();

  const timezone = isValidTimeZone(ctx.profile?.timezone) ? ctx.profile!.timezone : 'America/New_York';
  const suggestions = z.array(suggestionSchema).safeParse(lead.ai_suggestions);
  const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone });
  const c = lead.contact;
  const budget =
    lead.budget_min !== null || lead.budget_max !== null
      ? [lead.budget_min, lead.budget_max].map((v) => (v === null ? '—' : formatCurrency(Number(v)))).join(' – ')
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All leads
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{c.full_name}</h1>
            <LeadStatusBadge status={lead.status} />
            {lead.ai_analyzed_at && <ScoreBadge score={lead.score} temperature={lead.ai_temperature} />}
          </div>
          <p className="text-sm text-muted-foreground">
            {LEAD_INTENT[lead.intent]} · Created {dateTime.format(new Date(lead.created_at))}
          </p>
        </div>
        <LeadDetailActions leadId={lead.id} leadName={c.full_name} canDelete={ctx.role !== 'assistant'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Item label="Email">
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                      <Mail className="size-3.5" aria-hidden /> {c.email}
                    </a>
                  ) : null}
                </Item>
                <Item label="Phone">
                  {c.phone ? (
                    <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                      <Phone className="size-3.5" aria-hidden /> {c.phone}
                    </a>
                  ) : null}
                </Item>
                <Item label="Source">
                  {sourceLabel(lead.source)}
                  {lead.source_detail && <span className="text-muted-foreground"> · {lead.source_detail}</span>}
                </Item>
                <Item label="Timeframe">{lead.timeframe ? LEAD_TIMEFRAME[lead.timeframe as LeadTimeframe] ?? lead.timeframe : null}</Item>
                <Item label="Budget">{budget}</Item>
                {lead.status === 'closed_won' && lead.converted_at && (
                  <Item label="Won">{dateTime.format(new Date(lead.converted_at))}</Item>
                )}
                {lead.status === 'closed_lost' && <Item label="Lost reason">{lead.lost_reason}</Item>}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Inquiry message</CardTitle></CardHeader>
            <CardContent>
              {lead.message ? (
                <p className="text-sm whitespace-pre-wrap">{lead.message}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No message.</p>
              )}
            </CardContent>
          </Card>

          <AiPanel
            leadId={lead.id}
            enabled={isAiConfigured()}
            timezone={timezone}
            contact={{ firstName: c.first_name, email: c.email, phone: c.mobile_phone ?? c.phone, doNotContact: c.do_not_contact }}
            initial={{
              score: lead.ai_analyzed_at ? lead.score : null,
              temperature: lead.ai_temperature,
              summary: lead.ai_summary,
              reasons: Array.isArray(lead.ai_reasons) ? lead.ai_reasons : [],
              suggestions: suggestions.success ? suggestions.data : [],
              analyzedAt: lead.ai_analyzed_at,
            }}
          />
        </div>

        <Card className="h-fit">
          <CardHeader><CardTitle>Pipeline</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Status</p>
              <LeadStatusSelect leadId={lead.id} status={lead.status} />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Assigned agent</p>
              <LeadAssigneeSelect leadId={lead.id} assignedTo={lead.assigned_to} members={members} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}
