import { createClient } from '@/lib/supabase/server';
import type { Contact } from '@/types/database.types';
import { CONTACTS_PAGE_SIZE, type ActivityType } from './constants';
import type { ContactFilters } from './schemas';
import type {
  ActivityItem,
  ContactLeadItem,
  ContactListResult,
  ContactListRow,
  NoteItem,
  TagCount,
} from './types';

/** Remove PostgREST filter syntax + LIKE wildcards from user search text. */
function sanitizeSearch(q: string) {
  return q.replace(/[,()*%\\:"{}]/g, ' ').replace(/\s+/g, ' ').trim();
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function listContacts(orgId: string, filters: ContactFilters): Promise<ContactListResult> {
  const supabase = await createClient();
  const page = filters.page ?? 1;
  const from = (page - 1) * CONTACTS_PAGE_SIZE;

  let query = supabase
    .from('contacts')
    .select('id, full_name, email, phone, company, city, state, tags, do_not_contact, created_at', { count: 'exact' })
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('full_name', { ascending: true })
    .range(from, from + CONTACTS_PAGE_SIZE - 1);

  const q = filters.q ? sanitizeSearch(filters.q) : '';
  if (q) {
    query = query.or(
      `full_name.ilike.*${q}*,email.ilike.*${q}*,phone.ilike.*${q}*,company.ilike.*${q}*`,
    );
  }
  if (filters.tag) query = query.contains('tags', [filters.tag]);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  const total = count ?? 0;
  return {
    rows: (data ?? []) as ContactListRow[],
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE)),
  };
}

export async function getContact(orgId: string, id: string): Promise<Contact | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Contact | null;
}

export async function getContactNotes(orgId: string, contactId: string): Promise<NoteItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notes')
    .select('id, body, is_pinned, created_at, created_by, author:profiles(full_name)')
    .eq('organization_id', orgId)
    .eq('contact_id', contactId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((n) => ({
    id: n.id as string,
    body: n.body as string,
    isPinned: Boolean(n.is_pinned),
    createdAt: n.created_at as string,
    authorId: (n.created_by as string | null) ?? null,
    authorName: one<{ full_name: string | null }>(n.author as never)?.full_name ?? null,
  }));
}

export async function getContactActivities(orgId: string, contactId: string): Promise<ActivityItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('activities')
    .select('id, type, summary, occurred_at, actor_id, actor:profiles(full_name)')
    .eq('organization_id', orgId)
    .eq('contact_id', contactId)
    .order('occurred_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => ({
    id: a.id as string,
    type: a.type as ActivityType,
    summary: a.summary as string,
    occurredAt: a.occurred_at as string,
    actorId: (a.actor_id as string | null) ?? null,
    actorName: one<{ full_name: string | null }>(a.actor as never)?.full_name ?? null,
  }));
}

export async function getContactLeads(orgId: string, contactId: string): Promise<ContactLeadItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('id, status, intent, source, created_at')
    .eq('organization_id', orgId)
    .eq('contact_id', contactId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ContactLeadItem[];
}

export async function getTagCounts(orgId: string): Promise<TagCount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('contact_tag_counts', { p_organization_id: orgId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ tag: string; contacts: number | string }>).map((t) => ({
    tag: t.tag,
    contacts: Number(t.contacts),
  }));
}
