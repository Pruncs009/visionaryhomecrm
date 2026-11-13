import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { PATHNAME_HEADER } from '@/features/auth/access';

/** Pages a signed-out visitor may open. */
const PUBLIC_PATHS = ['/login', '/signup', '/register', '/forgot-password', '/verify-email'];
/** Prefixes that handle their own auth (callbacks, webhooks, cron, ICS feeds). */
const PUBLIC_PREFIXES = ['/auth/', '/api/webhooks/', '/api/cron/', '/api/calendar/ics/'];
/** Pages a signed-in user should be bounced away from. */
const AUTH_ONLY_PATHS = ['/login', '/signup', '/register'];

/**
 * Runs on every matched request:
 * 1. Refreshes the Supabase session and writes updated cookies to the response.
 * 2. Redirects signed-out users to /login (remembering where they were going).
 * 3. Redirects signed-in users away from /login and /signup.
 */
export async function updateSession(request: NextRequest) {
  // Lets the app layout check page access before anything renders (features/auth/access.ts).
  request.headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write to the request so Server Components in this request see the
          // fresh session, and to the response so the browser stores it.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() (not getSession()) — it validates the JWT with Supabase
  // instead of trusting the cookie. Don't put code between createServerClient and this.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const isPublic =
    PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (pathname !== '/') url.searchParams.set('next', pathname + search);
    return redirectWithCookies(url, response);
  }

  if (user && AUTH_ONLY_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return redirectWithCookies(url, response);
  }

  return response;
}

/** A redirect must carry any refreshed auth cookies, or the user gets logged out. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
