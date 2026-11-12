import { z } from 'zod';
import { LEAD_SOURCE_VALUES } from '@/features/leads/constants';
import { CONTACT_METHOD_VALUES, IMPORT_BATCH_SIZE, MANUAL_ACTIVITY_TYPES, normalizeTag } from './constants';

const optionalText = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).optional().transform((v) => v || null);

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.union([z.literal(''), z.enum(values)]).optional().transform((v) => (v ? (v as T[number]) : null));

export const tagSchema = z
  .string()
  .transform(normalizeTag)
  .pipe(z.string().min(1, 'Enter a tag').max(50));

/** "vip, investor ,  Past client" → ['vip', 'investor', 'past client'] */
export const tagListSchema = z
  .string()
  .optional()
  .transform((v) => Array.from(new Set((v ?? '').split(',').map(normalizeTag).filter(Boolean))).slice(0, 30));

export const contactFormSchema = z.object({
  first_name: z.string().trim().min(1, 'Enter a first name').max(100),
  last_name: optionalText(100),
  email: z
    .union([z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email')])
    .optional()
    .transform((v) => v || null),
  phone: optionalText(40),
  mobile_phone: optionalText(40),
  company: optionalText(120),
  job_title: optionalText(120),
  address_line1: optionalText(200),
  address_line2: optionalText(200),
  city: optionalText(100),
  state: optionalText(50),
  postal_code: optionalText(20),
  birthday: z
    .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')])
    .optional()
    .transform((v) => v || null),
  source: optionalEnum(LEAD_SOURCE_VALUES),
  preferred_contact_method: optionalEnum(CONTACT_METHOD_VALUES),
  do_not_contact: z
    .string()
    .optional()
    .transform((v) => v === 'on'),
  owner_id: z
    .union([z.literal(''), z.string().uuid()])
    .optional()
    .transform((v) => v || null),
  tags: tagListSchema,
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

export const contactFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  tag: z.string().trim().max(50).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});
export type ContactFilters = z.infer<typeof contactFiltersSchema>;

export const noteSchema = z.object({
  body: z.string().trim().min(1, 'Write something first').max(20_000),
});

export const logActivitySchema = z.object({
  type: z.enum(MANUAL_ACTIVITY_TYPES),
  summary: z.string().trim().min(1, 'Add a short summary').max(2000),
  occurred_at: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return new Date().toISOString();
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date' });
        return z.NEVER;
      }
      if (d.getTime() > Date.now() + 5 * 60_000) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Can't log something in the future" });
        return z.NEVER;
      }
      return d.toISOString();
    }),
});

const importCell = z.string().max(500).optional();
export const importRowSchema = z.object({
  _line: z.number().int().positive(),
  first_name: importCell,
  last_name: importCell,
  email: importCell,
  phone: importCell,
  company: importCell,
  address_line1: importCell,
  city: importCell,
  state: importCell,
  postal_code: importCell,
  source: importCell,
  tags: z.array(z.string().max(50)).max(30).optional(),
});

export const importBatchSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(IMPORT_BATCH_SIZE),
  onDuplicate: z.enum(['skip', 'update']),
  tags: z.array(tagSchema).max(10),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const uuidSchema = z.string().uuid();
