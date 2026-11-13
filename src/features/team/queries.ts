// Server-side reads for Manage Users (admins only — the database function checks too).
import { EXTRA_AREA_KEYS, type ExtraArea } from '@/features/auth/access';
import { createClient } from '@/lib/supabase/server';
import type { MemberRole } from '@/types/database.types';
import type { TeamUser } from './types';

type Row = {
  user_id: string;
  full_name: string | null;
  email: string;
  role: MemberRole;
  permissions: string[] | null;
  must_change_password: boolean;
  last_sign_in_at: string | null;
  created_at: string;
};

export async function getTeamUsers(orgId: string): Promise<TeamUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('org_users', { p_org: orgId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((r) => ({
    userId: r.user_id,
    name: r.full_name?.trim() || r.email,
    email: r.email,
    role: r.role,
    permissions: (r.permissions ?? []).filter((p): p is ExtraArea => (EXTRA_AREA_KEYS as string[]).includes(p)),
    mustChangePassword: r.must_change_password,
    lastSignInAt: r.last_sign_in_at,
    addedAt: r.created_at,
  }));
}
