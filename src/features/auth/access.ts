import type { MemberRole } from '@/types/database.types';

/**
 * Who sees what.
 *   Admin (owner / admin) — everything, including Manage Users.
 *   User  (agent / assistant) — the deal stages (Under Contract … Deleted), plus
 *   any of these extra areas an admin turns on for them.
 */
export const EXTRA_AREAS = [
  { key: 'pipeline_review', label: 'Pipeline Review Tracker' },
  { key: 'kpi', label: 'KPI Dashboard' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
] as const;

export type ExtraArea = (typeof EXTRA_AREAS)[number]['key'];
/** Areas that can be locked: the extras, plus admin-only pages. */
export type Area = ExtraArea | 'dashboard' | 'users';

export const EXTRA_AREA_KEYS = EXTRA_AREAS.map((a) => a.key) as ExtraArea[];

/** Where a user without Dashboard access lands. */
export const USER_HOME = '/deals/under-contract';

export const isAdminRole = (role: MemberRole | null | undefined) => role === 'owner' || role === 'admin';

export type AccessInfo = { role: MemberRole | null; permissions: readonly string[] };

export function canAccess(who: AccessInfo, area: Area): boolean {
  if (isAdminRole(who.role)) return true;
  if (area === 'dashboard' || area === 'users') return false;
  return who.permissions.includes(area);
}

export const homeFor = (who: AccessInfo) => (canAccess(who, 'dashboard') ? '/dashboard' : USER_HOME);

/** Request header (set in middleware) with the page being opened. */
export const PATHNAME_HEADER = 'x-crm-pathname';

const AREA_PATHS: [string, Area][] = [
  ['/dashboard', 'dashboard'],
  ['/pipeline-review', 'pipeline_review'],
  ['/kpi-dashboard', 'kpi'],
  ['/reports', 'reports'],
  ['/settings', 'settings'],
  ['/team', 'users'],
];

/** The locked area a path belongs to, if any. */
export function areaForPath(pathname: string | null | undefined): Area | null {
  if (!pathname) return null;
  return AREA_PATHS.find(([p]) => pathname === p || pathname.startsWith(`${p}/`))?.[1] ?? null;
}
