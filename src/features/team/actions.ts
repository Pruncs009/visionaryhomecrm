'use server';

// Manage Users: add a user, change someone's access. Admins only.
// The database checks again (admin_create_user / memberships RLS).

import { revalidatePath } from 'next/cache';
import { adminContext } from '@/features/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { addUserSchema, updateAccessSchema } from './schemas';
import type { TeamResult } from './types';

const NOT_ADMIN = 'Only admins can manage users.';

function dbMessage(error: { message: string; code?: string }) {
  if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42703') {
    return 'The database update for Manage Users hasn’t been run yet.';
  }
  return error.message;
}

export async function addTeamUser(input: unknown): Promise<TeamResult> {
  const ctx = await adminContext();
  if (!ctx) return { ok: false, error: NOT_ADMIN };
  const parsed = addUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details and try again.' };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_create_user', {
    p_org: ctx.organization.id,
    p_email: d.email,
    p_password: d.password,
    p_full_name: d.full_name,
    p_role: d.access === 'admin' ? 'admin' : 'agent',
    p_permissions: d.access === 'admin' ? [] : d.permissions,
  });
  if (error) return { ok: false, error: dbMessage(error) };
  revalidatePath('/team');
  return { ok: true };
}

export async function updateTeamUserAccess(input: unknown): Promise<TeamResult> {
  const ctx = await adminContext();
  if (!ctx) return { ok: false, error: NOT_ADMIN };
  const parsed = updateAccessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Something went wrong. Please try again.' };
  const { userId, access, permissions } = parsed.data;
  if (userId === ctx.userId) return { ok: false, error: 'You can’t change your own access.' };

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from('memberships')
    .select('role')
    .eq('organization_id', ctx.organization.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) return { ok: false, error: dbMessage(readError) };
  if (!current) return { ok: false, error: 'That user isn’t on your team.' };
  if (current.role === 'owner') return { ok: false, error: 'The account owner always has admin access.' };

  const { error } = await supabase
    .from('memberships')
    .update({ role: access === 'admin' ? 'admin' : 'agent', permissions: access === 'admin' ? [] : permissions })
    .eq('organization_id', ctx.organization.id)
    .eq('user_id', userId);
  if (error) return { ok: false, error: dbMessage(error) };
  revalidatePath('/team');
  return { ok: true };
}
