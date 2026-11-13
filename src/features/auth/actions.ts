'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeRedirectPath } from '@/lib/utils';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from './schemas';
import { setPendingEmail } from './pending-email';
import type { MemberRole } from '@/types/database.types';
import { areaForPath, canAccess, homeFor } from './access';
import type { ActionState } from './types';

/** Base URL for links inside auth emails. */
async function getOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return (await headers()).get('origin') ?? 'http://localhost:3000';
}

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

/** Where to go after signing in / choosing a password: the default-password screen, or a page this person may open. */
async function landingPath(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, next?: string) {
  const dest = safeRedirectPath(next);
  const { data, error } = await supabase
    .from('memberships')
    .select('role, permissions, must_change_password')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return dest; // before the Manage Users update: old behavior
  if (data.must_change_password) return '/change-password';
  const who = { role: data.role as MemberRole, permissions: (data.permissions as string[] | null) ?? [] };
  const area = areaForPath(dest.split('?')[0]);
  return area && !canAccess(who, area) ? homeFor(who) : dest;
}

// -----------------------------------------------------------------------------
// Sign in
// -----------------------------------------------------------------------------
export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: str(formData, 'email'),
    password: str(formData, 'password'),
    next: str(formData, 'next') || undefined,
  });
  const values = { email: str(formData, 'email') };

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values };
  }

  const supabase = await createClient();
  const { data: signedIn, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error?.code === 'email_not_confirmed') {
    // Correct password but unverified: send them to the resend screen.
    await setPendingEmail(parsed.data.email);
    redirect('/verify-email');
  }

  if (error) {
    // Generic on purpose: don't reveal whether the email exists.
    return { error: 'Invalid email or password.', values };
  }

  // redirect() throws, so it must stay outside any try/catch.
  redirect(await landingPath(supabase, signedIn.user!.id, parsed.data.next));
}

// -----------------------------------------------------------------------------
// Resend verification email
// -----------------------------------------------------------------------------
export async function resendVerification(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: str(formData, 'email') });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values: { email: str(formData, 'email') } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: parsed.data.email,
    options: { emailRedirectTo: `${await getOrigin()}/auth/callback?next=/dashboard` },
  });

  // Supabase allows one email per address per 60s by default.
  if (error?.status === 429) {
    return {
      error: 'Please wait a minute before requesting another email.',
      values: { email: parsed.data.email },
    };
  }

  await setPendingEmail(parsed.data.email);
  // Same message whether or not the address exists / is already verified.
  return {
    success: `If ${parsed.data.email} has an unverified account, a new link is on its way.`,
    values: { email: parsed.data.email },
  };
}

// -----------------------------------------------------------------------------
// Forgot password — emails a link that lands on /reset-password with a session
// -----------------------------------------------------------------------------
export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: str(formData, 'email') });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values: { email: str(formData, 'email') } };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await getOrigin()}/auth/callback?next=/reset-password`,
  });

  // Same response whether or not the account exists (prevents email enumeration).
  return { success: 'If an account exists for that email, a reset link is on its way.' };
}

// -----------------------------------------------------------------------------
// Reset password — user is signed in via the email link at this point
// -----------------------------------------------------------------------------
export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: str(formData, 'password'),
    confirm_password: str(formData, 'confirm_password'),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: error.message };
  }

  redirect(updated.user ? await landingPath(supabase, updated.user.id) : '/dashboard');
}
