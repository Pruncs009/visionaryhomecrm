import { z } from 'zod';

export const SUGGESTION_TYPES = ['call', 'text', 'email', 'meeting', 'task'] as const;
export const TONES = ['friendly', 'professional', 'concise'] as const;
export const GOALS = ['check_in', 'schedule_call', 'schedule_showing', 'share_listings', 're_engage', 'custom'] as const;

// -----------------------------------------------------------------------------
// What we ask the MODEL for (Structured Outputs). Kept to types + enums: OpenAI's
// strict JSON-schema mode rejects many validation keywords, so limits are
// enforced afterwards by the local schemas below.
// -----------------------------------------------------------------------------
export const modelAnalysisSchema = z.object({
  score: z.number().describe('Lead score 0-100: likelihood to transact in the next 90 days'),
  summary: z.string().describe('One or two sentences an agent can scan in 5 seconds'),
  reasons: z.array(z.string()).describe('Up to 5 short evidence-based reasons for the score'),
  suggestions: z.array(
    z.object({
      type: z.enum(SUGGESTION_TYPES),
      title: z.string().describe('Imperative, under 80 characters, e.g. "Call to confirm pre-approval amount"'),
      due_in_days: z.number().describe('0 = today, max 30'),
      rationale: z.string().describe('Why this action, one sentence'),
    }),
  ).describe('1 to 4 next best actions, most important first'),
});

export const modelDraftSchema = z.object({
  sms: z.string().describe('Plain-text SMS, max 300 characters'),
  email_subject: z.string().describe('Max 80 characters'),
  email_body: z.string().describe('Plain-text email body, 60-180 words, with sign-off'),
});

// -----------------------------------------------------------------------------
// What we STORE / RETURN — validated and clamped server-side.
// -----------------------------------------------------------------------------
const clampInt = (min: number, max: number) => z.number().transform((n) => Math.min(max, Math.max(min, Math.round(n))));
const text = (max: number) => z.string().transform((s) => s.replace(/\s+/g, ' ').trim().slice(0, max));

export const suggestionSchema = z.object({
  type: z.enum(SUGGESTION_TYPES),
  title: text(80).pipe(z.string().min(1)),
  due_in_days: clampInt(0, 30),
  rationale: text(240),
  task_id: z.string().uuid().nullable().optional(),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

export const analysisSchema = z.object({
  score: clampInt(0, 100),
  summary: text(400),
  reasons: z.array(text(160).pipe(z.string().min(1))).max(8).transform((r) => r.slice(0, 5)),
  suggestions: z.array(suggestionSchema).min(1).transform((s) => s.slice(0, 4)),
});
export type Analysis = z.infer<typeof analysisSchema>;

/** Temperature is derived from the score server-side so the two never disagree. */
export function temperatureFor(score: number): 'hot' | 'warm' | 'cold' {
  return score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
}

export const draftSchema = z.object({
  sms: z.string().transform((s) => s.trim().slice(0, 320)).pipe(z.string().min(1)),
  email_subject: text(100).pipe(z.string().min(1)),
  email_body: z.string().transform((s) => s.trim().slice(0, 4000)).pipe(z.string().min(1)),
});
export type Draft = z.infer<typeof draftSchema>;

// -----------------------------------------------------------------------------
// Requests from the UI
// -----------------------------------------------------------------------------
export const draftRequestSchema = z.object({
  leadId: z.string().uuid(),
  tone: z.enum(TONES),
  goal: z.enum(GOALS),
  instructions: z.string().trim().max(500).optional().default(''),
});
export type DraftRequest = z.infer<typeof draftRequestSchema>;

export const logSentSchema = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(['text', 'email']),
  body: z.string().trim().min(1).max(4000),
  subject: z.string().trim().max(200).optional(),
});
