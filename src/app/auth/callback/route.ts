import { NextResponse, type NextRequest } from 'next/server';
import { clearPendingEmail } from '@/features/auth/pending-email';
import { createClient } from '@/lib/supabase/server';
import { safeRedirectPath } from '@/lib/utils';

/**
 * PKCE callback: exchanges a one-time ?code= for a session cookie.
 * Used by Supabase's default email templates and (later) OAuth providers.
 * Only works in the same browser that started the flow — our custom templates
 * use /auth/confirm instead, which works across devices.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeRedirectPath(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await clearPendingEmail();
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
