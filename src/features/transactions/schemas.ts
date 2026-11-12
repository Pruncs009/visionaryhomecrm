import { z } from 'zod';
import { FILE_CATEGORY_VALUES, TX_SIDE_VALUES, TX_STATUS_VALUES } from './constants';

const optionalUuid = z
  .union([z.literal(''), z.string().uuid()])
  .optional()
  .transform((v) => v || null);

const optionalDate = z
  .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')])
  .optional()
  .transform((v) => v || null);

const money = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid amount' });
      return z.NEVER;
    }
    return n;
  });

const percent = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v.replace(/[%\s]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a percentage between 0 and 100' });
      return z.NEVER;
    }
    return n;
  });

export const transactionFormSchema = z
  .object({
    transaction_id: optionalUuid,
    name: z.string().trim().max(200).optional().transform((v) => v || ''),
    side: z.enum(TX_SIDE_VALUES),
    status: z.enum(TX_STATUS_VALUES),
    property_mode: z.enum(['existing', 'new']),
    property_id: optionalUuid,
    new_address_line1: z.string().trim().max(200).optional().transform((v) => v || ''),
    new_city: z.string().trim().max(100).optional().transform((v) => v || ''),
    new_state: z.string().trim().max(50).optional().transform((v) => v || ''),
    new_postal_code: z.string().trim().max(20).optional().transform((v) => v || ''),
    list_price: money,
    buyer_contact_id: optionalUuid,
    seller_contact_id: optionalUuid,
    agent_id: optionalUuid,
    offer_price: money,
    sale_price: money,
    earnest_money: money,
    commission_rate: percent,
    commission_amount: money,
    contract_date: optionalDate,
    inspection_deadline: optionalDate,
    appraisal_deadline: optionalDate,
    financing_deadline: optionalDate,
    closing_date: optionalDate,
  })
  .superRefine((d, ctx) => {
    if (d.property_mode === 'existing' && !d.property_id) {
      ctx.addIssue({ code: 'custom', path: ['property_id'], message: 'Pick a property' });
    }
    if (d.property_mode === 'new' && !d.new_address_line1) {
      ctx.addIssue({ code: 'custom', path: ['new_address_line1'], message: 'Enter the street address' });
    }
    if (d.contract_date && d.closing_date && d.closing_date < d.contract_date) {
      ctx.addIssue({ code: 'custom', path: ['closing_date'], message: 'Closing must be on or after the contract date' });
    }
    if (d.buyer_contact_id && d.buyer_contact_id === d.seller_contact_id) {
      ctx.addIssue({ code: 'custom', path: ['seller_contact_id'], message: 'Buyer and seller must be different people' });
    }
    if (d.status === 'closed' && !d.closing_date) {
      ctx.addIssue({ code: 'custom', path: ['closing_date'], message: 'A closed deal needs a closing date' });
    }
  });

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export const transactionFiltersSchema = z.object({
  view: z.enum(['active', 'closed', 'cancelled', 'all']).optional().catch(undefined),
  agent: z.union([z.literal('me'), z.literal('unassigned'), z.string().uuid()]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});
export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;

export const recordUploadSchema = z.object({
  transactionId: z.string().uuid(),
  path: z.string().min(1).max(500),
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().nonnegative(),
  mimeType: z.string().max(200),
  category: z.enum(FILE_CATEGORY_VALUES),
});

export const txStatusSchema = z.enum(TX_STATUS_VALUES);
export const uuidSchema = z.string().uuid();
