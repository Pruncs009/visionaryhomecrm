'use server';

// Add / remove people on a deal from the People panel. Each person is saved as
// a contact (reusable on other deals) and linked to the deal in a role.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireContext } from '@/features/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { isClientRole, isSingleSlotRole, PARTY_ROLE_LABEL, PARTY_ROLES, roleGroup, type PartyRole } from './parties';

export type PartyResult = { ok: true } | { ok: false; error?: string; fieldErrors?: Record<string, string[] | undefined> };

const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`).optional().transform((v) => v || null);
const uuid = z.string().uuid();

const addSchema = z.object({
  txId: uuid,
  role: z.enum(PARTY_ROLES, { errorMap: () => ({ message: 'Pick a role.' }) }),
  contactId: z.union([z.literal(''), uuid]).optional().transform((v) => v || null),
  fullName: z.string().trim().min(1, 'Enter the full name.').max(200, 'Keep it under 200 characters.'),
  phone: text(40),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address.')]).optional().transform((v) => v || null),
  company: text(200),
  addressLine1: text(200),
  city: text(100),
  state: text(50),
  postalCode: text(20),
  /** Editing the buyer / seller typed on the deal form: save them as a contact in that slot. */
  replacePrimary: z.boolean().optional(),
});
export type AddPartyInput = z.input<typeof addSchema>;

function dbError(error: { code?: string; message: string }) {
  if (error.code === '42501') return "You don't have permission to do that.";
  if (error.code === '23503') return "That deal or contact isn't in your organization.";
  console.error('[deal-parties] database error', error);
  return 'Something went wrong. Please try again.';
}

export async function addDealParty(input: AddPartyInput): Promise<PartyResult> {
  const ctx = await requireContext();
  const org = ctx.organization.id;
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  const label = PARTY_ROLE_LABEL[d.role];
  const supabase = await createClient();

  const { data: tx, error: txError } = await supabase
    .from('transaction_list')
    .select('id, buyer_name, seller_name')
    .eq('organization_id', org)
    .eq('id', d.txId)
    .maybeSingle();
  if (txError) return { ok: false, error: dbError(txError) };
  if (!tx) return { ok: false, error: 'This deal no longer exists.' };

  // Client slots (and the title company) hold one person each. The primary buyer /
  // seller may already be set from the deal form (transactions.buyer_name / seller_name).
  if (isSingleSlotRole(d.role)) {
    const { count } = await supabase
      .from('deal_parties')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org)
      .eq('transaction_id', d.txId)
      .eq('role', d.role);
    const primaryTaken = (d.role === 'buyer' && tx.buyer_name) || (d.role === 'seller' && tx.seller_name);
    if (count || (primaryTaken && !d.replacePrimary)) return { ok: false, fieldErrors: { role: [`${label} is already on this deal.`] } };
  }

  // Reuse the picked contact, or save a new one.
  const details = {
    phone: d.phone,
    email: d.email,
    company: d.company,
    address_line1: d.addressLine1,
    city: d.city,
    state: d.state,
    postal_code: d.postalCode,
  };
  let contactId = d.contactId;
  if (contactId) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id, tags')
      .eq('organization_id', org)
      .eq('id', contactId)
      .is('deleted_at', null)
      .maybeSingle();
    // Only reuse a contact from the same department (a seller is never linked as the title company).
    const group = roleGroup(d.role);
    const { data: pastLinks } = existing
      ? await supabase.from('deal_parties').select('role').eq('organization_id', org).eq('contact_id', contactId)
      : { data: [] };
    const inGroup = !!existing && (
      ((existing.tags as string[] | null) ?? []).some((t) => t.trim().toLowerCase() === group.toLowerCase()) ||
      ((pastLinks ?? []) as { role: PartyRole }[]).some((l) => roleGroup(l.role) === group)
    );
    if (!inGroup) contactId = null;
    else {
      // Fill in / update only what was entered; blanks don't erase saved details.
      const changes = Object.fromEntries(Object.entries(details).filter(([, v]) => v !== null));
      if (Object.keys(changes).length) {
        const { error } = await supabase.from('contacts').update(changes).eq('organization_id', org).eq('id', contactId);
        if (error) return { ok: false, error: error.code === '23514' ? 'Check the email address.' : dbError(error) };
      }
    }
  }
  if (!contactId) {
    const [first, ...rest] = d.fullName.split(/\s+/);
    const { data: created, error } = await supabase
      .from('contacts')
      .insert({
        organization_id: org,
        first_name: first!,
        last_name: rest.join(' ') || null,
        ...details,
        tags: [roleGroup(d.role)], // "Buyer", "Seller", "Buyer agent", "Seller agent", "Title company"
        source: 'Deal',
      })
      .select('id')
      .single();
    if (error || !created) return { ok: false, error: error ? (error.code === '23514' ? 'Check the email address.' : dbError(error)) : 'Could not save the contact.' };
    contactId = created.id as string;
  }

  const { error: linkError } = await supabase
    .from('deal_parties')
    .insert({ organization_id: org, transaction_id: d.txId, contact_id: contactId, role: d.role });
  if (linkError) {
    if (linkError.code === '23505') {
      return { ok: false, fieldErrors: isSingleSlotRole(d.role) ? { role: [`${label} is already on this deal.`] } : { fullName: ['This person is already on the deal in that role.'] } };
    }
    return { ok: false, error: dbError(linkError) };
  }

  // Keep the deal's own buyer / seller name (lists, header, Details tab) in step.
  if (d.role === 'buyer' || d.role === 'seller') {
    const { error } = await supabase
      .from('transactions')
      .update(d.role === 'buyer' ? { buyer_name: d.fullName } : { seller_name: d.fullName })
      .eq('organization_id', org)
      .eq('id', d.txId);
    if (error) console.error('[deal-parties] could not update deal name', error);
  }

  revalidatePath(`/transactions/${d.txId}`);
  return { ok: true };
}

/** Takes the person off the deal. Their contact stays saved. */
export async function removeDealParty(txId: string, partyId: string): Promise<PartyResult> {
  const ctx = await requireContext();
  if (ctx.role === 'assistant') return { ok: false, error: 'Only agents and admins can remove people from a deal.' };
  if (!uuid.safeParse(txId).success || !uuid.safeParse(partyId).success) return { ok: false, error: 'Not found.' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deal_parties')
    .delete()
    .eq('organization_id', ctx.organization.id)
    .eq('transaction_id', txId)
    .eq('id', partyId)
    .select('role');
  if (error) return { ok: false, error: dbError(error) };
  const role = data?.[0]?.role as string | undefined;
  if (role === 'buyer' || role === 'seller') {
    await supabase
      .from('transactions')
      .update(role === 'buyer' ? { buyer_name: null } : { seller_name: null })
      .eq('organization_id', ctx.organization.id)
      .eq('id', txId);
  }
  revalidatePath(`/transactions/${txId}`);
  return { ok: true };
}

const updateSchema = addSchema.pick({
  fullName: true, phone: true, email: true, company: true, addressLine1: true, city: true, state: true, postalCode: true,
});
export type UpdatePartyInput = z.input<typeof updateSchema>;

/**
 * Edit the details of someone on the deal. This updates their saved contact, so
 * the change shows on every deal they're on.
 */
export async function updateDealParty(txId: string, partyId: string, input: UpdatePartyInput): Promise<PartyResult> {
  const ctx = await requireContext();
  const org = ctx.organization.id;
  if (!uuid.safeParse(txId).success || !uuid.safeParse(partyId).success) return { ok: false, error: 'Not found.' };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: link } = await supabase
    .from('deal_parties')
    .select('contact_id, role')
    .eq('organization_id', org)
    .eq('transaction_id', txId)
    .eq('id', partyId)
    .maybeSingle();
  if (!link) return { ok: false, error: 'This person is no longer on the deal.' };

  const [first, ...rest] = d.fullName.split(/\s+/);
  const { error } = await supabase
    .from('contacts')
    .update({
      first_name: first!,
      last_name: rest.join(' ') || null,
      phone: d.phone,
      email: d.email,
      company: d.company,
      address_line1: d.addressLine1,
      city: d.city,
      state: d.state,
      postal_code: d.postalCode,
    })
    .eq('organization_id', org)
    .eq('id', link.contact_id as string);
  if (error) return { ok: false, error: error.code === '23514' ? 'Check the email address.' : dbError(error) };

  if (link.role === 'buyer' || link.role === 'seller') {
    await supabase
      .from('transactions')
      .update(link.role === 'buyer' ? { buyer_name: d.fullName } : { seller_name: d.fullName })
      .eq('organization_id', org)
      .eq('id', txId);
  }
  revalidatePath(`/transactions/${txId}`);
  return { ok: true };
}
