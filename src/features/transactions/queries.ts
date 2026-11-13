import { createClient } from '@/lib/supabase/server';
import type { FileCategory } from '@/types/database.types';
import { ACTIVE_STATUSES, TX_PAGE_SIZE } from './constants';
import { formatAddress, PARTY_GROUPS, PARTY_ROLE_ORDER, roleGroup, TEAM_ROLES, type DealParty, type PartyGroup, type PartyRole, type PersonOption, type TeamRole } from './parties';
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
    emd_due_date: (r.emd_due_date as string | null) ?? null,
    contingency_end_date: (r.contingency_end_date as string | null) ?? null,
    transaction_coordinator: (r.transaction_coordinator as string | null) ?? null,
    emd_in: typeof r.emd_in === 'boolean' ? r.emd_in : null,
    contingency_type: (r.contingency_type as string | null) ?? null,
    escrow_type: (r.escrow_type as string | null) ?? null,
    escrow_number: (r.escrow_number as string | null) ?? null,
    occupancy_strategy: (r.occupancy_strategy as string | null) ?? null,
    lockbox_code: (r.lockbox_code as string | null) ?? null,
    arv_estimate: num(r.arv_estimate),
    rehab_estimate: num(r.rehab_estimate),
    photos_link: (r.photos_link as string | null) ?? null,
    channel: (r.channel as string | null) ?? null,
    occupancy: (r.occupancy as string | null) ?? null,
    ownership_type: (r.ownership_type as string | null) ?? null,
    ethnicity: (r.ethnicity as string | null) ?? null,
    prop_last_sold_prior: (r.prop_last_sold_prior as string | null) ?? null,
    prop_seller_age: (r.prop_seller_age as string | null) ?? null,
    prop_equity: (r.prop_equity as string | null) ?? null,
    prop_stories: (r.prop_stories as string | null) ?? null,
    prop_beds: (r.prop_beds as string | null) ?? null,
    prop_baths: (r.prop_baths as string | null) ?? null,
    prop_bldg_sqft: (r.prop_bldg_sqft as string | null) ?? null,
    prop_lot_size: (r.prop_lot_size as string | null) ?? null,
    prop_year_built: (r.prop_year_built as string | null) ?? null,
    prop_county: (r.prop_county as string | null) ?? null,
    bc_contract_date: (r.bc_contract_date as string | null) ?? null,
    bc_emd_due_date: (r.bc_emd_due_date as string | null) ?? null,
    bc_closing_date: (r.bc_closing_date as string | null) ?? null,
    bc_purchase_price: num(r.bc_purchase_price),
    bc_earnest_money: num(r.bc_earnest_money),
    bc_emd_in: typeof r.bc_emd_in === 'boolean' ? r.bc_emd_in : null,
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
  const [property, contacts, tasks, notes, deletedTasks] = await Promise.all([
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
      .select('id, title, status, priority, due_at, completed_at, assigned_to, kind, assignee_role, created_at')
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
    // Deleted tasks (kept as cancelled) — only for the Timeline.
    supabase
      .from('tasks')
      .select('id, title, deleted_at')
      .eq('organization_id', orgId)
      .eq('transaction_id', tx.id)
      .eq('status', 'cancelled')
      .not('deleted_at', 'is', null)
      .limit(500),
  ]);
  for (const r of [property, contacts, tasks, notes, deletedTasks]) if (r.error) throw new Error(r.error.message);

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
      kind: (t.kind as string | null) ?? null,
      assigneeRole: (t.assignee_role as string | null) ?? null,
    })),
    deletedTasks: ((deletedTasks.data ?? []) as Record<string, unknown>[]).map((t) => ({
      id: t.id as string,
      title: t.title as string,
      deletedAt: t.deleted_at as string,
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

/** People added to the deal from the People panel, in panel order. */
export async function getDealParties(orgId: string, transactionId: string): Promise<DealParty[]> {
  const supabase = await createClient();
  const { data: links, error } = await supabase
    .from('deal_parties')
    .select('id, role, contact_id, created_at')
    .eq('organization_id', orgId)
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  if (!links?.length) return [];

  const { data: people, error: peopleError } = await supabase
    .from('contacts')
    .select('id, full_name, email, phone, company, address_line1, city, state, postal_code')
    .eq('organization_id', orgId)
    .in('id', [...new Set(links.map((l) => l.contact_id as string))]);
  if (peopleError) throw new Error(peopleError.message);
  const byId = new Map((people ?? []).map((p) => [p.id as string, p as Record<string, string | null>]));

  return links
    .filter((l) => byId.has(l.contact_id as string))
    .map((l) => {
      const c = byId.get(l.contact_id as string)!;
      return {
        id: l.id as string,
        role: l.role as PartyRole,
        contactId: l.contact_id as string,
        name: c.full_name ?? '',
        email: c.email,
        phone: c.phone,
        company: c.company,
        address: formatAddress({ addressLine1: c.address_line1, city: c.city, state: c.state, postalCode: c.postal_code }),
        addressLine1: c.address_line1,
        city: c.city,
        state: c.state,
        postalCode: c.postal_code,
      };
    })
    .sort((a, b) => PARTY_ROLE_ORDER.indexOf(a.role) - PARTY_ROLE_ORDER.indexOf(b.role));
}

/**
 * Saved buyers, sellers, agents and title companies offered when adding someone
 * to a deal, each with the departments it belongs to. Contacts outside those
 * departments (e.g. plain leads) aren't offered. Capped at 1000.
 */
export async function getPersonOptions(orgId: string): Promise<PersonOption[]> {
  const supabase = await createClient();
  const [contacts, links] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, full_name, email, phone, company, address_line1, city, state, postal_code, tags')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('full_name', { ascending: true })
      .limit(1000),
    supabase.from('deal_parties').select('contact_id, role').eq('organization_id', orgId).limit(5000),
  ]);
  if (contacts.error) throw new Error(contacts.error.message);
  if (links.error) throw new Error(links.error.message);

  const groupsById = new Map<string, Set<PartyGroup>>();
  const addGroup = (id: string, g: PartyGroup) => {
    const set = groupsById.get(id) ?? new Set<PartyGroup>();
    set.add(g);
    groupsById.set(id, set);
  };
  for (const l of (links.data ?? []) as { contact_id: string; role: PartyRole }[]) addGroup(l.contact_id, roleGroup(l.role));
  const byTag = new Map(PARTY_GROUPS.map((g) => [g.toLowerCase(), g]));

  return ((contacts.data ?? []) as Record<string, unknown>[])
    .map((c) => {
      const id = c.id as string;
      for (const t of (c.tags as string[] | null) ?? []) {
        const g = byTag.get(t.trim().toLowerCase());
        if (g) addGroup(id, g);
      }
      const s = (k: string) => (c[k] as string | null) ?? null;
      return {
        id,
        name: s('full_name') ?? '',
        groups: [...(groupsById.get(id) ?? [])],
        email: s('email'),
        phone: s('phone'),
        company: s('company'),
        addressLine1: s('address_line1'),
        city: s('city'),
        state: s('state'),
        postalCode: s('postal_code'),
      };
    })
    .filter((p) => p.groups.length > 0);
}

/** Names already used for each team role across the organization's deals (for suggestions). */
export async function getTeamNameOptions(orgId: string): Promise<Record<TeamRole, string[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('lead_manager, acquisition_manager, transaction_coordinator')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .limit(5000);
  if (error) throw new Error(error.message);
  const out = Object.fromEntries(TEAM_ROLES.map((r) => [r, new Set<string>()])) as Record<TeamRole, Set<string>>;
  for (const row of (data ?? []) as Record<string, string | null>[]) {
    for (const r of TEAM_ROLES) {
      const v = row[r]?.trim();
      if (v) out[r].add(v);
    }
  }
  return Object.fromEntries(TEAM_ROLES.map((r) => [r, [...out[r]].sort((a, b) => a.localeCompare(b))])) as Record<TeamRole, string[]>;
}
