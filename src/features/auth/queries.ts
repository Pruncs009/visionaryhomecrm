import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { MemberRole, Organization, Profile } from '@/types/database.types';

/**
 * The signed-in user, validated against Supabase Auth.
 * cache() dedupes calls within one request (layout + page both calling this = 1 network call).
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export type CurrentContext = {
  userId: string;
  email: string;
  profile: Profile | null;
  organization: Organization | null;
  role: MemberRole | null;
};

/**
 * Everything most pages need: who the user is, and which org they're working in.
 * For now the active org is the user's first membership; an org switcher comes later.
 */
export const getCurrentContext = cache(async (): Promise<CurrentContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase
      .from('memberships')
      .select('role, organization:organizations(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const membership = membershipRes.data as
    | { role: MemberRole; organization: Organization | null }
    | null;

  return {
    userId: user.id,
    email: user.email ?? '',
    profile: (profileRes.data as Profile | null) ?? null,
    organization: membership?.organization ?? null,
    role: membership?.role ?? null,
  };
});
