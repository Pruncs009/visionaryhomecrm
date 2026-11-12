import type { AppointmentType, TaskPriority } from '@/types/database.types';

/** Who/where the dashboard is for. Every query filters by orgId explicitly
 *  (RLS allows all of a user's orgs; the dashboard shows the active one). */
export type DashboardScope = {
  orgId: string;
  userId: string;
  timezone: string;
};

export type Kpis = {
  leadsToday: number;
  leadsYesterday: number;
  buyersActive: number;
  buyersUnderContract: number;
  sellersListed: number;
  sellersUnderContract: number;
  closedThisMonth: number;
  closedLastMonth: number;
};

export type RevenueMonth = {
  key: string; // 'YYYY-MM'
  label: string; // 'Jan'
  commission: number;
  volume: number;
  deals: number;
};

export type RevenueSummary = {
  months: RevenueMonth[];
  ytdCommission: number;
  ytdVolume: number;
  ytdDeals: number;
  pendingCommission: number;
  pendingDeals: number;
};

export type AppointmentItem = {
  id: string;
  title: string;
  type: AppointmentType;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  contactName: string | null;
  propertyAddress: string | null;
};

export type AppointmentsSummary = {
  today: AppointmentItem[];
  todayCount: number;
  next7DaysCount: number;
};

export type TaskItem = {
  id: string;
  title: string;
  priority: TaskPriority;
  dueAt: string;
  overdue: boolean;
  contactName: string | null;
  transactionName: string | null;
};

export type TasksSummary = {
  items: TaskItem[];
  dueCount: number;
  overdueCount: number;
};

export type ClosingItem = {
  id: string;
  name: string;
  salePrice: number | null;
  commission: number | null;
  closedAt: string;
};
