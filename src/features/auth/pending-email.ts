import { cookies } from 'next/headers';

/**
 * Remembers which address is awaiting verification so /verify-email can show it
 * and offer a one-click resend — without putting the email in the URL (where it
 * would end up in browser history, server logs and analytics).
 * Server-only: call from Server Actions, Route Handlers or Server Components.
 */
const COOKIE_NAME = 'vh_pending_email';

export async function setPendingEmail(email: string) {
  (await cookies()).set(COOKIE_NAME, email, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60, // 1 hour
  });
}

export async function getPendingEmail() {
  return (await cookies()).get(COOKIE_NAME)?.value ?? null;
}

export async function clearPendingEmail() {
  (await cookies()).delete(COOKIE_NAME);
}
