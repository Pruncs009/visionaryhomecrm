import { createClient } from '@/lib/supabase/server';
import type { FileCategory } from '@/types/database.types';
import { ACTIVE_STATUSES, TX_PAGE_SIZE } from './constants';
import type { TransactionFilters } from './schemas';
import type { DealTask, DealWorkspace, Option, TransactionFile, TransactionListResult, TransactionRow } from './types';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
function normalize(r: Record<string, unknown>): TransactionRow {
  return {
    ...(r as TransactionRow),
    offer_price: num(r.offer_price),
    sale_price: num(r.sale_price),
    earnest_money: num(r.earnest_money),
    commission_rate: num(r.commission_rate),
    commission_amount: num(r.commission_amount),
    purchase_price: num(r.purchase_price),
    // Older databases (before migration 11) don't have these columns yet.
    campaign_name: (r.campaign_name as string | null) ?? null,
    deal_type: (r.deal_type as string | null) ?? null,
    lead_manager: (r.lead_manager as string | null) ?? null,
    acquisition_manager: (r.acquisition_manager as string | null) ?? null,
  };
}

function sanitizeSearch(q: string) {
  return q.replace(/[,()*%\\:"{}]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function listTransactions(
  orgId: string,
  userId: string,
  filters: TransactionFilters,
): Promise<TransactionListResult> {
  const supabase = await createClient();
  const page = filters.page ?? 1;
  const from = (page - 1) * TX_PAGE_SIZE;
  const view = filters.view ?? 'active';

  let query = supabase
    .from('transaction_list')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .range(from, from + TX_PAGE_SIZE - 1);

  if (filters.stage) {
    // Closed / dead: most recent first. Working stages: soonest closing first.
    const done = filters.stage === 'closed' || filters.stage === 'dead';
    query = query.eq('deal_stage', filters.stage).order('closing_date', { ascending: !done, nullsFirst: false });
  } else if (view === 'active') {
    // Soonest closing first â€” that's what a transaction coordinator works from.
    query = query.in('status', ACTIVE_STATUSES).order('closing_date', { ascending: true, nullsFirst: false });
  } else {
    if (view !== 'all') query = query.eq('status', view);
    query = query.order('closing_date', { ascending: false, nullsFirst: false });
  }

  if (filters.agent === 'me') query = query.eq('agent_id', userId);
  else if (filters.agent === 'unassigned') query = query.is('agent_id', null);
  else if (filters.agent) query = query.eq('agent_id', filters.agent);

  const q = filters.q ? sanitizeSearch(filters.q) : '';
  if (q) {
    query = query.or(`name.ilike.*${q}*,property_address.ilike.*${q}*,buyer_name.ilike.*${q}*,seller_name.ilike.*${q}*`);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  const total = count ?? 0;
  return {
    rows: (data ?? []).map(normalize),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / TX_PAGE_SIZE)),
  };
}

export async function getTransaction(orgId: string, id: string): Promise<TransactionRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transaction_list')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalize(data) : null;
}

export async function getTransactionFiles(orgId: string, transactionId: string): Promise<TransactionFile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('files')
    .select('id, file_name, mime_type, size_bytes, category, created_at, uploader:profiles(full_name)')
    .eq('organization_id', orgId)
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => {
    const raw = f.uploader as unknown;
    const uploader = (Array.isArray(raw) ? raw[0] : raw) as { full_name: string | null } | null;
    return {
      id: f.id as string,
      fileName: f.file_name as string,
      mimeType: (f.mime_type as string | null) ?? null,
      sizeBytes: f.size_bytes === null ? null : Number(f.size_bytes),
      category: f.category as FileCategory,
      createdAt: f.created_at as string,
      uploaderName: uploader?.full_name ?? null,
    };
  });
}

/** Everything the deal workspace page shows besides the deal row itself. */
export async function getDealWorkspace(orgId: string, tx: TransactionRow, timezone: string): Promise<DealWorkspace> {
  const supabase = await createClient();
  const contactIds = [tx.buyer_contact_id, tx.seller_contact_id].filter((x): x is string => !!x);
  const [property, contacts, tasks, notes] = await Promise.all([
    supabase
      .from('properties')
      .select('postal_code, mls_number, property_type, list_price, bedrooms, bathrooms, square_feet, year_built')
      .eq('organization_id', orgId)
      .eq('id', tx.property_id)
      .maybeSingle(),
    contactIds.length
      ? supabase.from('contacts').select('id, email, phone').eq('organization_id', orgId).in('id', contactIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('tasks')
      .select('id, title, status, priority, due_at, completed_at, assigned_to')
      .eq('organization_id', orgId)
      .eq('transaction_id', tx.id)
      .neq('status', 'cancelled')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(500),
    supabase
      .from('notes')
      .select('id, body, is_pinned, created_at, author:profiles(full_name)')
      .eq('organization_id', orgId)
      .eq('transaction_id', tx.id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  for (const r of [property, contacts, tasks, notes]) if (r.error) throw new Error(r.error.message);

  const dateInTz = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }); // YYYY-MM-DD
  const p = property.data as Record<string, unknown> | null;
  return {
    property: p
      ? {
          postalCode: (p.postal_code as string | null) ?? null,
          mlsNumber: (p.mls_number as string | null) ?? null,
          propertyType: (p.property_type as string | null) ?? null,
          listPrice: num(p.list_price),
          bedrooms: num(p.bedrooms),
          bathrooms: num(p.bathrooms),
          squareFeet: num(p.square_feet),
          yearBuilt: num(p.year_built),
        }
      : null,
    contacts: Object.fromEntries(
      ((contacts.data ?? []) as { id: string; email: string | null; phone: string | null }[]).map((c) => [c.id, { email: c.email, phone: c.phone }]),
    ),
    tasks: ((tasks.data ?? []) as Record<string, unknown>[]).map((t) => ({
      id: t.id as string,
      title: t.title as string,
      done: t.status === 'done',
      priority: t.priority as DealTask['priority'],
      dueDate: t.due_at ? dateInTz.format(new Date(t.due_at as string)) : null,
      completedAt: (t.completed_at as string | null) ?? null,
      assignedTo: (t.assigned_to as string | null) ?? null,
    })),
    notes: ((notes.data ?? []) as Record<string, unknown>[]).map((n) => {
      const raw = n.author as unknown;
      const author = (Array.isArray(raw) ? raw[0] : raw) as { full_name: string | null } | null;
      return {
        id: n.id as string,
        body: n.body as string,
        isPinned: !!n.is_pinned,
        createdAt: n.created_at as string,
        authorName: author?.full_name ?? null,
      };
    }),
  };
}

/** Pickers for the form. Capped at 1000; a search combobox is the next step past that. */
export async function getTransactionFormOptions(orgId: string): Promise<{ contacts: Option[]; properties: Option[] }> {
  const supabase = await createClient();
  const [contacts, properties] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, full_name, email')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('full_name', { ascending: true })
      .limit(1000),
    supabase
      .from('properties')
      .select('id, address_line1, city, state')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('address_line1', { ascending: true })
      .limit(1000),
  ]);
  if (contacts.error) throw new Error(contacts.error.message);
  if (properties.error) throw new Error(properties.error.message);
  return {
    contacts: (contacts.data ?? []).map((c) => ({ id: c.id as string, label: c.full_name as string, detail: (c.email as string | null) ?? undefined })),
    properties: (properties.data ?? []).map((p) => ({
      id: p.id as string,
      label: p.address_line1 as string,
      detail: [p.city, p.state].filter(Boolean).join(', '),
    })),
  };
}
