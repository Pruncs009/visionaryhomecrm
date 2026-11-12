import { createClient } from '@/lib/supabase/server';
import type { FileCategory } from '@/types/database.types';
import { ACTIVE_STATUSES, TX_PAGE_SIZE } from './constants';
import type { TransactionFilters } from './schemas';
import type { Option, TransactionFile, TransactionListResult, TransactionRow } from './types';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
function normalize(r: Record<string, unknown>): TransactionRow {
  return {
    ...(r as TransactionRow),
    offer_price: num(r.offer_price),
    sale_price: num(r.sale_price),
    earnest_money: num(r.earnest_money),
    commission_rate: num(r.commission_rate),
    commission_amount: num(r.commission_amount),
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

  if (view === 'active') {
    // Soonest closing first — that's what a transaction coordinator works from.
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
