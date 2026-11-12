import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { clearPendingEmail } from '@/features/auth/pending-email';
import { createClient } from '@/lib/supabase/server';
import { safeRedirectPath } from '@/lib/utils';

const ALLOWED_TYPES: EmailOtpType[] = ['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change'];

/**
 * Target of the links in our email templates (supabase/templates/*.html):
 *   /auth/confirm?token_hash=...&type=signup&next=/dashboard
 *
 * Unlike /auth/callback (PKCE ?code=), a token_hash works on ANY device or
 * browser — e.g. user signs up on desktop, taps the link on their phone.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get('next'));

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      await clearPendingEmail();
      // Recovery links must always land on the set-new-password page.
      const destination = type === 'recovery' ? '/reset-password' : next;
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=verification_failed`);
}
