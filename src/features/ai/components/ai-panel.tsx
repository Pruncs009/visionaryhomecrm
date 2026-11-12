'use client';

import { useState, useTransition } from 'react';
import {
  CalendarPlus, Check, Copy, ListTodo, Mail, MessageSquare, Phone, RefreshCw, Send, Sparkles, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { analyzeLead, createTaskFromSuggestion, draftFollowUp, logFollowUpSent } from '../actions';
import { GOALS, TONES, type Draft, type Suggestion } from '../schemas';
import { ScoreBadge } from './score-badge';

export type AiInitial = {
  score: number | null;
  temperature: 'hot' | 'warm' | 'cold' | null;
  summary: string | null;
  reasons: string[];
  suggestions: Suggestion[];
  analyzedAt: string | null;
};

const SUGGESTION_ICON: Record<Suggestion['type'], React.ElementType> = {
  call: Phone, text: MessageSquare, email: Mail, meeting: Users, task: ListTodo,
};
const GOAL_LABEL: Record<(typeof GOALS)[number], string> = {
  check_in: 'Check in', schedule_call: 'Schedule a call', schedule_showing: 'Book a showing',
  share_listings: 'Offer listings', re_engage: 'Re-engage (went quiet)', custom: 'Custom (use instructions)',
};

function smsSegments(text: string) {
  // GSM-7: 160 chars in one segment, 153 per segment when split. (Unicode is shorter; this is a guide.)
  return text.length <= 160 ? 1 : Math.ceil(text.length / 153);
}

export function AiPanel({
  leadId,
  enabled,
  initial,
  contact,
  timezone,
}: {
  leadId: string;
  enabled: boolean;
  initial: AiInitial;
  contact: { firstName: string; email: string | null; phone: string | null; doNotContact: boolean };
  timezone: string;
}) {
  const [analysis, setAnalysis] = useState(initial);
  const [analyzing, startAnalyze] = useTransition();
  const [creatingTask, setCreatingTask] = useState<number | null>(null);

  const [tone, setTone] = useState<(typeof TONES)[number]>('friendly');
  const [goal, setGoal] = useState<(typeof GOALS)[number]>('check_in');
  const [instructions, setInstructions] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [channel, setChannel] = useState<'text' | 'email'>(contact.phone ? 'text' : 'email');
  const [drafting, startDraft] = useTransition();
  const [logging, startLog] = useTransition();
  const [logged, setLogged] = useState<Record<'text' | 'email', boolean>>({ text: false, email: false });

  const when = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone });

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-4" aria-hidden /> AI follow-up</CardTitle>
          <CardDescription>
            AI isn&apos;t configured for this workspace. Add <code>OPENAI_API_KEY</code> to the server environment to enable lead scoring, follow-up suggestions and message drafts.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const analyze = () =>
    startAnalyze(async () => {
      const r = await analyzeLead(leadId);
      if (!r.ok) return void toast.error(r.error);
      setAnalysis({ ...r.analysis, suggestions: r.analysis.suggestions.map((s) => ({ ...s, task_id: null })) });
      toast.success(`Scored ${r.analysis.score}/100`);
    });

  const generate = () =>
    startDraft(async () => {
      const r = await draftFollowUp({ leadId, tone, goal, instructions });
      if (!r.ok) return void toast.error(r.error);
      setDraft(r.draft);
      setLogged({ text: false, email: false });
    });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed. Select the text and copy manually.');
    }
  };

  const logSent = (ch: 'text' | 'email') =>
    startLog(async () => {
      if (!draft) return;
      const r = await logFollowUpSent(
        ch === 'text' ? { leadId, channel: 'text', body: draft.sms } : { leadId, channel: 'email', subject: draft.email_subject, body: draft.email_body },
      );
      if (!r.ok) return void toast.error(r.error);
      setLogged((l) => ({ ...l, [ch]: true }));
      toast.success(r.movedToAttempting ? 'Logged · lead moved to Attempting Contact' : 'Logged to activity history');
    });

  return (
    <div className="space-y-6">
      {/* ---------------- Score + suggestions ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" aria-hidden /> AI insights</CardTitle>
          <CardDescription>
            {analysis.analyzedAt ? `Analyzed ${when.format(new Date(analysis.analyzedAt))}` : 'Score this lead and get next-step suggestions.'}
          </CardDescription>
          <CardAction>
            <Button variant={analysis.analyzedAt ? 'outline' : 'default'} size="sm" onClick={analyze} disabled={analyzing}>
              {analyzing ? <RefreshCw className="animate-spin" /> : <Sparkles />}
              {analyzing ? 'Analyzing…' : analysis.analyzedAt ? 'Re-analyze' : 'Analyze lead'}
            </Button>
          </CardAction>
        </CardHeader>
        {analysis.analyzedAt && analysis.score !== null && (
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Lead score</p>
                <p className="text-3xl font-semibold tabular-nums" data-testid="ai-score">{analysis.score}<span className="text-base font-normal text-muted-foreground">/100</span></p>
              </div>
              <ScoreBadge score={analysis.score} temperature={analysis.temperature} className="text-sm" />
            </div>
            {analysis.summary && <p className="text-sm">{analysis.summary}</p>}
            {analysis.reasons.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {analysis.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
            {analysis.suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Suggested next steps</p>
                <ol className="space-y-2">
                  {analysis.suggestions.map((s, i) => {
                    const Icon = SUGGESTION_ICON[s.type];
                    return (
                      <li key={i} className="flex items-start gap-3 rounded-lg border p-3">
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{s.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.due_in_days === 0 ? 'Today' : s.due_in_days === 1 ? 'Tomorrow' : `In ${s.due_in_days} days`}{s.rationale && ` · ${s.rationale}`}
                          </p>
                        </div>
                        {s.task_id ? (
                          <span className="inline-flex items-center gap-1 text-xs text-success"><Check className="size-3.5" aria-hidden /> Task created</span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={creatingTask !== null}
                            onClick={async () => {
                              setCreatingTask(i);
                              const r = await createTaskFromSuggestion(leadId, i);
                              setCreatingTask(null);
                              if (!r.ok) return void toast.error(r.error);
                              setAnalysis((a) => ({ ...a, suggestions: a.suggestions.map((x, j) => (j === i ? { ...x, task_id: r.taskId } : x)) }));
                              toast.success('Task created');
                            }}
                          >
                            <CalendarPlus /> {creatingTask === i ? 'Adding…' : 'Add task'}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
            <p className="text-xs text-muted-foreground">AI output can be wrong. Use it as a starting point, not a decision.</p>
          </CardContent>
        )}
      </Card>

      {/* ---------------- Draft SMS + email ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Send className="size-4" aria-hidden /> Draft a follow-up</CardTitle>
          <CardDescription>
            AI writes a text and an email for {contact.firstName}. You review, edit and send from your own phone or mail app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {contact.doNotContact ? (
            <p className="text-sm text-critical">This contact is marked <strong>Do not contact</strong>. Drafting is disabled.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="ai-goal" className="text-sm font-medium">Goal</label>
                  <NativeSelect id="ai-goal" className="w-full" value={goal} onChange={(e) => setGoal(e.target.value as typeof goal)}>
                    {GOALS.map((g) => <NativeSelectOption key={g} value={g}>{GOAL_LABEL[g]}</NativeSelectOption>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ai-tone" className="text-sm font-medium">Tone</label>
                  <NativeSelect id="ai-tone" className="w-full" value={tone} onChange={(e) => setTone(e.target.value as typeof tone)}>
                    {TONES.map((t) => <NativeSelectOption key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</NativeSelectOption>)}
                  </NativeSelect>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ai-instructions" className="text-sm font-medium">Instructions (optional)</label>
                <Textarea id="ai-instructions" rows={2} maxLength={500} value={instructions} onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Mention the open house on Saturday at 12 Oak St" />
              </div>
              <Button onClick={generate} disabled={drafting}>
                {drafting ? <RefreshCw className="animate-spin" /> : <Sparkles />}
                {drafting ? 'Writing…' : draft ? 'Regenerate' : 'Generate drafts'}
              </Button>

              {draft && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div role="tablist" aria-label="Message type" className="inline-flex gap-1 rounded-lg bg-muted p-1">
                    {(['text', 'email'] as const).map((ch) => (
                      <button key={ch} role="tab" aria-selected={channel === ch} onClick={() => setChannel(ch)}
                        className={cn('rounded-md px-3 py-1 text-sm font-medium', channel === ch ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                        {ch === 'text' ? 'SMS' : 'Email'}
                      </button>
                    ))}
                  </div>

                  {channel === 'text' ? (
                    <div className="space-y-2" role="tabpanel">
                      <Textarea aria-label="SMS draft" rows={4} value={draft.sms} maxLength={320} onChange={(e) => setDraft({ ...draft, sms: e.target.value })} />
                      <p className={cn('text-xs tabular-nums', draft.sms.length > 160 ? 'text-foreground' : 'text-muted-foreground')}>
                        {draft.sms.length}/320 characters · {smsSegments(draft.sms)} SMS segment{smsSegments(draft.sms) > 1 ? 's' : ''}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => copy(draft.sms)}><Copy /> Copy</Button>
                        {contact.phone && (
                          <a className="inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
                            href={`sms:${contact.phone}?&body=${encodeURIComponent(draft.sms)}`}>
                            <MessageSquare className="size-3.5" aria-hidden /> Open in Messages
                          </a>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => logSent('text')} disabled={logging || logged.text}>
                          {logged.text ? <><Check /> Logged</> : 'Log as sent'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2" role="tabpanel">
                      <Input aria-label="Email subject" value={draft.email_subject} maxLength={100} onChange={(e) => setDraft({ ...draft, email_subject: e.target.value })} />
                      <Textarea aria-label="Email body" rows={9} value={draft.email_body} onChange={(e) => setDraft({ ...draft, email_body: e.target.value })} />
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => copy(`${draft.email_subject}\n\n${draft.email_body}`)}><Copy /> Copy</Button>
                        {contact.email && (
                          <a className="inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
                            href={`mailto:${contact.email}?subject=${encodeURIComponent(draft.email_subject)}&body=${encodeURIComponent(draft.email_body)}`}>
                            <Mail className="size-3.5" aria-hidden /> Open in Mail
                          </a>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => logSent('email')} disabled={logging || logged.email}>
                          {logged.email ? <><Check /> Logged</> : 'Log as sent'}
                        </Button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Review before sending: check facts, links and [placeholders].</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
