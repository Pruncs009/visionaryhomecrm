import { z } from 'zod';
import {
  LEAD_INTENT_VALUES,
  LEAD_SOURCE_VALUES,
  LEAD_STATUS_VALUES,
  LEAD_TIMEFRAME_VALUES,
} from './constants';

// Form fields arrive as strings; '' means "not provided".
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .optional()
    .transform((v) => v || undefined);

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.literal(''), z.enum(values)])
    .optional()
    .transform((v) => (v ? (v as T[number]) : undefined));

/** "$450,000" / "450000" / "" → number | undefined */
const money = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const n = Number(v.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid amount' });
      return z.NEVER;
    }
    return n;
  });

export const leadFormSchema = z
  .object({
    // contact
    first_name: z.string().trim().min(1, 'Enter a first name').max(100),
    last_name: optionalText(100),
    email: z
      .union([z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email')])
      .optional()
      .transform((v) => v || undefined),
    phone: optionalText(40),
    // lead
    status: z.enum(LEAD_STATUS_VALUES),
    intent: z.enum(LEAD_INTENT_VALUES),
    source: optionalEnum(LEAD_SOURCE_VALUES),
    source_detail: optionalText(200),
    assigned_to: z
      .union([z.literal(''), z.string().uuid('Pick a team member')])
      .optional()
      .transform((v) => v || null),
    budget_min: money,
    budget_max: money,
    timeframe: optionalEnum(LEAD_TIMEFRAME_VALUES),
    message: optionalText(5000),
    lost_reason: optionalText(500),
  })
  .refine((d) => d.email || d.phone, {
    message: 'Add an email or phone number so you can follow up',
    path: ['email'],
  })
  .refine((d) => d.budget_min === undefined || d.budget_max === undefined || d.budget_max >= d.budget_min, {
    message: 'Max budget must be at least the min budget',
    path: ['budget_max'],
  });

export type LeadFormValues = z.infer<typeof leadFormSchema>;

export const leadStatusSchema = z.enum(LEAD_STATUS_VALUES);

/** A drag-and-drop move on the pipeline board. */
export const moveLeadSchema = z.object({
  leadId: z.string().uuid(),
  status: z.enum(LEAD_STATUS_VALUES),
  position: z.number().finite().min(-1e15).max(1e15),
  lostReason: z.string().trim().max(500).optional(),
});
export const uuidSchema = z.string().uuid();

/** List-page filters from the URL. Anything invalid is ignored rather than erroring. */
export const leadFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(LEAD_STATUS_VALUES).optional().catch(undefined),
  source: z.enum(LEAD_SOURCE_VALUES).optional().catch(undefined),
  agent: z
    .union([z.literal('me'), z.literal('unassigned'), z.string().uuid()])
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export type LeadFilters = z.infer<typeof leadFiltersSchema>;
