'use server';

import { revalidatePath } from 'next/cache';
import { zodResponseFormat } from 'openai/helpers/zod';
import { requireContext, type AuthedContext } from '@/features/auth/guards';
import { AI_HOURLY_LIMIT, AI_MODEL, aiErrorMessage, getOpenAI, isAiConfigured } from '@/lib/ai/openai';
import { isValidTimeZone, zonedMidnight, zonedParts } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { buildLeadContext } from './context';
import { analysisMessages, draftMessages } from './prompts';
import { z } from 'zod';
import {
  analysisSchema,
  draftRequestSchema,
  draftSchema,
  logSentSchema,
  modelAnalysisSchema,
  modelDraftSchema,
  suggestionSchema,
  temperatureFor,
  type Analysis,
  type Draft,
} from './schemas';

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const uuid = z.string().uuid();

function agentOf(ctx: AuthedContext) {
  return { name: ctx.profile?.full_name || ctx.email.split('@')[0], organization: ctx.organization.name };
}

/** Per-user hourly cap — protects your OpenAI bill from runaway clicking or scripts. */
async function checkRateLimit(ctx: AuthedContext): Promise<string | null> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await supabase
    .from('ai_generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .gte('created_at', since);
  return (count ?? 0) >= AI_HOURLY_LIMIT
    ? `You've reached the limit of ${AI_HOURLY_LIMIT} AI requests per hour. Try again later.`
    : null;
}

async function logGeneration(
  ctx: AuthedContext,
  leadId: string,
  kind: 'analysis' | 'draft',
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
  errorCode?: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.from('ai_generations').insert({
    organization_id: ctx.organization.id,
    lead_id: leadId,
    user_id: ctx.userId,
    kind,
    model: AI_MODEL,
    prompt_tokens: usage?.prompt_tokens ?? null,
    completion_tokens: usage?.completion_tokens ?? null,
    status: errorCode ? 'error' : 'ok',
    error_code: errorCode ?? null,
  });
  if (error) console.error('[ai] failed to log generation', error);
}

async function guard(ctx: AuthedContext): Promise<string | null> {
  if (!isAiConfigured()) return aiErrorMessage(new Error('AI_NOT_CONFIGURED')).message;
  return checkRateLimit(ctx);
}

// -----------------------------------------------------------------------------
// Lead scoring + follow-up suggestions (one model call)
// -----------------------------------------------------------------------------
export type AnalysisResult = Analysis & { temperature: 'hot' | 'warm' | 'cold'; analyzedAt: string };

export async function analyzeLead(leadId: string): Promise<Result<{ analysis: AnalysisResult }>> {
  const ctx = await requireContext();
  if (!uuid.safeParse(leadId).success) return { ok: false, error: 'Lead not found.' };
  const blocked = await guard(ctx);
  if (blocked) return { ok: false, error: blocked };

  const leadCtx = await buildLeadContext(ctx.organization.id, leadId, agentOf(ctx));
  if (!leadCtx) return { ok: false, error: 'Lead not found.' };

  let analysis: Analysis;
  try {
    const completion = await getOpenAI().chat.completions.parse({
      model: AI_MODEL,
      messages: analysisMessages(leadCtx.modelInput),
      response_format: zodResponseFormat(modelAnalysisSchema, 'lead_analysis'),
      temperature: 0.2, // scoring should be stable run to run
    });
    const parsed = completion.choices[0]?.message.parsed;
    const checked = analysisSchema.safeParse(parsed);
    if (!checked.success) {
      await logGeneration(ctx, leadId, 'analysis', completion.usage, 'invalid_output');
      return { ok: false, error: 'The AI returned an unexpected answer. Please try again.' };
    }
    analysis = checked.data;
    await logGeneration(ctx, leadId, 'analysis', completion.usage);
  } catch (error) {
    const { code, message } = aiErrorMessage(error);
    await logGeneration(ctx, leadId, 'analysis', undefined, code);
    return { ok: false, error: message };
  }

  const temperature = temperatureFor(analysis.score);
  const analyzedAt = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase
    .from('leads')
    .update({
      score: analysis.score,
      ai_temperature: temperature,
      ai_summary: analysis.summary,
      ai_reasons: analysis.reasons,
      ai_suggestions: analysis.suggestions.map((s) => ({ ...s, task_id: null })),
      ai_analyzed_at: analyzedAt,
    })
    .eq('organization_id', ctx.organization.id)
    .eq('id', leadId);
  if (error) return { ok: false, error: 'Could not save the analysis. Please try again.' };

  revalidatePath('/leads');
  return { ok: true, analysis: { ...analysis, temperature, analyzedAt } };
}

// -----------------------------------------------------------------------------
// AI-generated SMS + email (drafts only — the agent reviews and sends)
// -----------------------------------------------------------------------------
export async function draftFollowUp(input: unknown): Promise<Result<{ draft: Draft }>> {
  const ctx = await requireContext();
  const req = draftRequestSchema.safeParse(input);
  if (!req.success) return { ok: false, error: 'Invalid request.' };
  if (req.data.goal === 'custom' && !req.data.instructions) {
    return { ok: false, error: 'Add instructions for a custom message.' };
  }
  const blocked = await guard(ctx);
  if (blocked) return { ok: false, error: blocked };

  const leadCtx = await buildLeadContext(ctx.organization.id, req.data.leadId, agentOf(ctx));
  if (!leadCtx) return { ok: false, error: 'Lead not found.' };
  if (leadCtx.doNotContact) return { ok: false, error: 'This contact is marked Do Not Contact.' };

  try {
    const completion = await getOpenAI().chat.completions.parse({
      model: AI_MODEL,
      messages: draftMessages(leadCtx.modelInput, req.data),
      response_format: zodResponseFormat(modelDraftSchema, 'follow_up_draft'),
      temperature: 0.7,
    });
    const checked = draftSchema.safeParse(completion.choices[0]?.message.parsed);
    if (!checked.success) {
      await logGeneration(ctx, req.data.leadId, 'draft', completion.usage, 'invalid_output');
      return { ok: false, error: 'The AI returned an unexpected answer. Please try again.' };
    }
    await logGeneration(ctx, req.data.leadId, 'draft', completion.usage);
    return { ok: true, draft: checked.data };
  } catch (error) {
    const { code, message } = aiErrorMessage(error);
    await logGeneration(ctx, req.data.leadId, 'draft', undefined, code);
    return { ok: false, error: message };
  }
}

// -----------------------------------------------------------------------------
// Turn a suggestion into a task. The suggestion is read from the DATABASE by
// index (never trusted from the client) and marked so it can't be duplicated.
// -----------------------------------------------------------------------------
export async function createTaskFromSuggestion(leadId: string, index: number): Promise<Result<{ taskId: string }>> {
  const ctx = await requireContext();
  if (!uuid.safeParse(leadId).success || !Number.isInteger(index) || index < 0 || index > 10) {
    return { ok: false, error: 'Invalid suggestion.' };
  }
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from('leads')
    .select('contact_id, assigned_to, ai_suggestions')
    .eq('organization_id', ctx.organization.id)
    .eq('id', leadId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!lead) return { ok: false, error: 'Lead not found.' };

  const suggestions = z.array(suggestionSchema).safeParse(lead.ai_suggestions);
  const suggestion = suggestions.success ? suggestions.data[index] : undefined;
  if (!suggestion) return { ok: false, error: 'That suggestion no longer exists. Re-analyze the lead.' };
  if (suggestion.task_id) return { ok: false, error: 'A task already exists for this suggestion.' };

  // Due at 9:00 in the agent's timezone, N days from today.
  const tz = isValidTimeZone(ctx.profile?.timezone) ? ctx.profile!.timezone : 'America/New_York';
  const { year, month, day } = zonedParts(new Date(), tz);
  const dueAt = new Date(zonedMidnight(year, month, day + suggestion.due_in_days, tz).getTime() + 9 * 3_600_000);

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      organization_id: ctx.organization.id,
      title: suggestion.title,
      description: suggestion.rationale ? `AI suggestion: ${suggestion.rationale}` : null,
      priority: suggestion.due_in_days <= 1 ? 'high' : 'normal',
      due_at: dueAt.toISOString(),
      assigned_to: (lead.assigned_to as string | null) ?? ctx.userId,
      contact_id: lead.contact_id,
      lead_id: leadId,
    })
    .select('id')
    .single();
  if (error || !task) return { ok: false, error: 'Could not create the task.' };

  const updated = suggestions.success ? suggestions.data.map((s, i) => (i === index ? { ...s, task_id: task.id } : s)) : [];
  await supabase.from('leads').update({ ai_suggestions: updated }).eq('organization_id', ctx.organization.id).eq('id', leadId);

  revalidatePath('/dashboard');
  revalidatePath('/tasks');
  return { ok: true, taskId: task.id as string };
}

// -----------------------------------------------------------------------------
// After the agent sends the message from their phone / mail app.
// -----------------------------------------------------------------------------
export async function logFollowUpSent(input: unknown): Promise<Result<{ movedToAttempting: boolean }>> {
  const ctx = await requireContext();
  const parsed = logSentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Nothing to log.' };
  const { leadId, channel, body, subject } = parsed.data;

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from('leads')
    .select('contact_id, status')
    .eq('organization_id', ctx.organization.id)
    .eq('id', leadId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!lead) return { ok: false, error: 'Lead not found.' };

  const summary = (channel === 'email' && subject ? `${subject} — ${body}` : body).replace(/\s+/g, ' ').slice(0, 300);
  const { error } = await supabase.from('activities').insert({
    organization_id: ctx.organization.id,
    contact_id: lead.contact_id,
    lead_id: leadId,
    actor_id: ctx.userId,
    type: channel,
    summary: `Sent: ${summary}`,
  });
  if (error) return { ok: false, error: 'Could not log the message.' };

  // First outreach moves a brand-new lead to "Attempting Contact".
  const movedToAttempting = lead.status === 'new';
  await supabase
    .from('leads')
    .update({ last_contacted_at: new Date().toISOString(), ...(movedToAttempting ? { status: 'attempting_contact' } : {}) })
    .eq('organization_id', ctx.organization.id)
    .eq('id', leadId);

  revalidatePath('/leads');
  revalidatePath(`/contacts/${lead.contact_id}`);
  return { ok: true, movedToAttempting };
}
