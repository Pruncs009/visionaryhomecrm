import { redirect } from 'next/navigation';
import type { MemberRole, Organization } from '@/types/database.types';
import { canAccess, homeFor, isAdminRole, type Area } from './access';
import { getCurrentContext, getCurrentUser, type CurrentContext } from './queries';

/**
 * Server-side route protection. Three layers protect every private page:
 *   1. middleware.ts       — redirects signed-out requests before rendering
 *   2. (app)/layout.tsx    — requireContext() again (layouts can't rely on middleware)
 *   3. Server Actions      — MUST call one of these: actions are public POST
 *                            endpoints and can be invoked without visiting the page.
 * RLS in Postgres is the final backstop for data access.
 */

/** Signed-in Supabase user, or redirect to /login. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export type AuthedContext = CurrentContext & {
  organization: Organization;
  role: MemberRole;
};

/** Signed-in user who belongs to an organization. */
export async function requireContext(): Promise<AuthedContext> {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  if (!ctx.organization || !ctx.role) {
    // Signed in but no membership (e.g. removed from their only team).
    // Not /login: middleware bounces signed-in users from there → redirect loop.
    redirect('/no-organization');
  }
  return ctx as AuthedContext;
}

/**
 * Require one of the given roles, e.g. requireRole(['owner', 'admin']) on
 * team-management pages and actions. Others are sent back to the dashboard.
 */
export async function requireRole(roles: MemberRole[]): Promise<AuthedContext> {
  const ctx = await requireContext();
  if (!roles.includes(ctx.role)) redirect(homeFor(ctx));
  return ctx;
}

/** Pages a "User" may only open when an admin gave them that area. */
export async function requireArea(area: Area): Promise<AuthedContext> {
  const ctx = await requireContext();
  if (!canAccess(ctx, area)) redirect(homeFor(ctx));
  return ctx;
}

/** Admin-only server actions: returns the context, or null when not allowed. */
export async function adminContext(): Promise<AuthedContext | null> {
  const ctx = await requireContext();
  return isAdminRole(ctx.role) ? ctx : null;
}
