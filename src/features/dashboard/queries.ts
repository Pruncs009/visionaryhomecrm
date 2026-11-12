import { calendarBounds, monthKey } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import type {
  AppointmentsSummary,
  ClosingItem,
  DashboardScope,
  Kpis,
  RevenueMonth,
  RevenueSummary,
  TasksSummary,
} from './types';

/**
 * Dashboard reads. Each widget calls its own function so widgets stream
 * independently (one slow query doesn't hold up the whole page).
 * All queries run as the signed-in user → Postgres RLS still applies.
 */

type CountResult = { count: number | null; error: { message: string } | null };

async function count(query: PromiseLike<CountResult>) {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/**
 * Many-to-one embeds (contact:contacts(...)) come back as an object at runtime,
 * but without generated DB types supabase-js types them as arrays. Accept both.
 */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

// -----------------------------------------------------------------------------
// KPI tiles: Leads Today, Active Buyers, Active Sellers, Closed Transactions
// -----------------------------------------------------------------------------
export async function getKpis({ orgId, timezone }: DashboardScope): Promise<Kpis> {
  const supabase = await createClient();
  const b = calendarBounds(timezone);
  // HEAD + count=exact: Postgres counts, no rows are transferred.
  const head = { count: 'exact', head: true } as const;

  const leads = () =>
    supabase.from('leads').select('id', head).eq('organization_id', orgId).is('deleted_at', null);
  const buyers = () =>
    supabase.from('buyers').select('id', head).eq('organization_id', orgId).is('deleted_at', null);
  const sellers = () =>
    supabase.from('sellers').select('id', head).eq('organization_id', orgId).is('deleted_at', null);
  const closed = () =>
    supabase
      .from('transactions')
      .select('id', head)
      .eq('organization_id', orgId)
      .eq('status', 'closed')
      .is('deleted_at', null);

  const [
    leadsToday,
    leadsYesterday,
    buyersActive,
    buyersUnderContract,
    sellersListed,
    sellersUnderContract,
    closedThisMonth,
    closedLastMonth,
  ] = await Promise.all([
    count(leads().gte('created_at', b.startOfToday.toISOString())),
    count(
      leads()
        .gte('created_at', b.startOfYesterday.toISOString())
        .lt('created_at', b.startOfToday.toISOString()),
    ),
    count(buyers().eq('status', 'active')),
    count(buyers().eq('status', 'under_contract')),
    count(sellers().eq('status', 'listed')),
    count(sellers().eq('status', 'under_contract')),
    count(closed().gte('closed_at', b.startOfMonth.toISOString())),
    count(
      closed()
        .gte('closed_at', b.startOfLastMonth.toISOString())
        .lt('closed_at', b.startOfMonth.toISOString()),
    ),
  ]);

  return {
    leadsToday,
    leadsYesterday,
    buyersActive,
    buyersUnderContract,
    sellersListed,
    sellersUnderContract,
    closedThisMonth,
    closedLastMonth,
  };
}

// -----------------------------------------------------------------------------
// Revenue: gross commission income (GCI) from closed deals, last 12 months
// -----------------------------------------------------------------------------
export async function getRevenue({ orgId, timezone }: DashboardScope): Promise<RevenueSummary> {
  const supabase = await createClient();
  const b = calendarBounds(timezone);

  const [closedRes, pendingRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('closed_at, sale_price, commission_amount')
      .eq('organization_id', orgId)
      .eq('status', 'closed')
      .is('deleted_at', null)
      .gte('closed_at', b.startOf12MonthWindow.toISOString()),
    supabase
      .from('transactions')
      .select('offer_price, sale_price, commission_rate, commission_amount')
      .eq('organization_id', orgId)
      .in('status', ['under_contract', 'pending'])
      .is('deleted_at', null),
  ]);
  if (closedRes.error) throw new Error(closedRes.error.message);
  if (pendingRes.error) throw new Error(pendingRes.error.message);

  // 12 empty month buckets, oldest first.
  const months: RevenueMonth[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(b.year, b.month - 1 - i, 15)); // mid-month avoids tz edge
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    months.push({ key, label, commission: 0, volume: 0, deals: 0 });
  }
  const byKey = new Map(months.map((m) => [m.key, m]));

  let ytdCommission = 0;
  let ytdVolume = 0;
  let ytdDeals = 0;
  for (const row of closedRes.data ?? []) {
    const closedAt = new Date(row.closed_at as string);
    const bucket = byKey.get(monthKey(closedAt, timezone));
    const commission = num(row.commission_amount);
    const volume = num(row.sale_price);
    if (bucket) {
      bucket.commission += commission;
      bucket.volume += volume;
      bucket.deals += 1;
    }
    if (closedAt >= b.startOfYear) {
      ytdCommission += commission;
      ytdVolume += volume;
      ytdDeals += 1;
    }
  }

  // Expected GCI on deals in escrow: explicit amount, else price × rate.
  let pendingCommission = 0;
  for (const row of pendingRes.data ?? []) {
    const explicit = row.commission_amount;
    const price = num(row.sale_price) || num(row.offer_price);
    pendingCommission +=
      explicit !== null && explicit !== undefined ? num(explicit) : (price * num(row.commission_rate)) / 100;
  }

  return {
    months,
    ytdCommission,
    ytdVolume,
    ytdDeals,
    pendingCommission,
    pendingDeals: pendingRes.data?.length ?? 0,
  };
}

// -----------------------------------------------------------------------------
// Appointments: today's agenda + count for the coming week
// -----------------------------------------------------------------------------
export async function getAppointments({ orgId, timezone }: DashboardScope): Promise<AppointmentsSummary> {
  const supabase = await createClient();
  const b = calendarBounds(timezone);

  const [todayRes, weekCount] = await Promise.all([
    supabase
      .from('appointments')
      .select(
        'id, title, appointment_type, starts_at, ends_at, all_day, location, contact:contacts(full_name), property:properties(address_line1)',
        { count: 'exact' },
      )
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      // overlaps today: starts before tomorrow AND ends after midnight
      .lt('starts_at', b.startOfTomorrow.toISOString())
      .gte('ends_at', b.startOfToday.toISOString())
      .order('starts_at', { ascending: true })
      .limit(6),
    count(
      supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .neq('status', 'cancelled')
        .gte('starts_at', b.startOfTomorrow.toISOString())
        .lt('starts_at', b.endOfWeek.toISOString()),
    ),
  ]);
  if (todayRes.error) throw new Error(todayRes.error.message);

  return {
    todayCount: todayRes.count ?? todayRes.data?.length ?? 0,
    next7DaysCount: weekCount,
    today: (todayRes.data ?? []).map((a) => {
      const contact = one<{ full_name: string }>(a.contact);
      const property = one<{ address_line1: string }>(a.property);
      return {
        id: a.id as string,
        title: a.title as string,
        type: a.appointment_type,
        startsAt: a.starts_at as string,
        endsAt: a.ends_at as string,
        allDay: Boolean(a.all_day),
        location: (a.location as string | null) ?? null,
        contactName: contact?.full_name ?? null,
        propertyAddress: property?.address_line1 ?? null,
      };
    }),
  };
}

// -----------------------------------------------------------------------------
// Tasks due: the signed-in agent's open tasks due today or overdue
// -----------------------------------------------------------------------------
export async function getTasksDue({ orgId, userId, timezone }: DashboardScope): Promise<TasksSummary> {
  const supabase = await createClient();
  const b = calendarBounds(timezone);
  const mine = () =>
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('assigned_to', userId)
      .in('status', ['todo', 'in_progress']);

  const [listRes, overdueCount] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, priority, due_at, contact:contacts(full_name), transaction:transactions(name)', {
        count: 'exact',
      })
      .eq('organization_id', orgId)
      .eq('assigned_to', userId)
      .in('status', ['todo', 'in_progress'])
      .lt('due_at', b.startOfTomorrow.toISOString())
      .order('due_at', { ascending: true })
      .limit(8),
    count(mine().lt('due_at', b.now.toISOString())),
  ]);
  if (listRes.error) throw new Error(listRes.error.message);

  return {
    dueCount: listRes.count ?? 0,
    overdueCount,
    items: (listRes.data ?? []).map((t) => {
      const contact = one<{ full_name: string }>(t.contact);
      const transaction = one<{ name: string }>(t.transaction);
      return {
        id: t.id as string,
        title: t.title as string,
        priority: t.priority,
        dueAt: t.due_at as string,
        overdue: new Date(t.due_at as string) < b.now,
        contactName: contact?.full_name ?? null,
        transactionName: transaction?.name ?? null,
      };
    }),
  };
}

// -----------------------------------------------------------------------------
// Recent closings
// -----------------------------------------------------------------------------
export async function getRecentClosings({ orgId }: DashboardScope): Promise<ClosingItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('id, name, sale_price, commission_amount, closed_at')
    .eq('organization_id', orgId)
    .eq('status', 'closed')
    .is('deleted_at', null)
    .order('closed_at', { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);

  return (data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    salePrice: t.sale_price === null ? null : num(t.sale_price),
    commission: t.commission_amount === null ? null : num(t.commission_amount),
    closedAt: t.closed_at as string,
  }));
}
