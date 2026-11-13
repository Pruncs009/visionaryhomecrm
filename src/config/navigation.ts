import type { Area } from '@/features/auth/access';
import { DEAL_STAGE, DEAL_STAGE_VALUES, stageHref, type DealStage } from '@/features/deals/constants';

/**
 * Left-hand menu. Deal stages sit between Dashboard and Calendar; each one lists
 * the deals in that stage. Other modules (Leads, Contacts, Transactions…)
 * still work at their URLs; they're just not in the menu.
 * `area`: only people with access to that area see the item (features/auth/access.ts).
 */
export type NavItem = { title: string; href: string; icon: NavIcon; stage?: DealStage; area?: Area };
export type NavIcon =
  | 'dashboard' | 'calendar' | 'reports' | 'settings'
  | 'under_contract' | 'under_dispo' | 'under_rehab' | 'ab_closing' | 'bc_closing' | 'ac_closing'
  | 'closed' | 'off_market' | 'dead' | 'deleted' | 'pipeline_review' | 'kpi' | 'users';

export const mainNav: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: 'dashboard', area: 'dashboard' },
  ...DEAL_STAGE_VALUES.map((s) => ({ title: DEAL_STAGE[s].label, href: stageHref(s), icon: s, stage: s })),
  { title: 'Deleted', href: '/deals/deleted', icon: 'deleted' },
  // Replaces Calendar in the menu (the /calendar page still works by URL).
  { title: 'Pipeline Review Tracker', href: '/pipeline-review', icon: 'pipeline_review', area: 'pipeline_review' },
  { title: 'KPI Dashboard', href: '/kpi-dashboard', icon: 'kpi', area: 'kpi' },
  { title: 'Reports', href: '/reports', icon: 'reports', area: 'reports' },
  { title: 'Settings', href: '/settings', icon: 'settings', area: 'settings' },
  { title: 'Manage Users', href: '/team', icon: 'users', area: 'users' },
];
