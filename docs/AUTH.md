# Authentication

Supabase Auth (email + password) with session cookies via `@supabase/ssr`.

## Flows

| Flow | Path | Steps |
|---|---|---|
| Register | `/signup` (alias `/register`) | `signup()` creates the auth user. A DB trigger then creates their profile, organization and owner membership. The user is redirected to `/verify-email`. |
| Verify email | email link → `/auth/confirm?token_hash&type=signup` | `verifyOtp()` signs the user in and redirects to `/dashboard`. |
| Resend verification | `/verify-email` | `resendVerification()` sends a new link, limited to one per minute. |
| Login | `/login` | `login()` redirects to `?next=` or `/dashboard`. An unverified account is sent to `/verify-email`. |
| Forgot password | `/forgot-password` | `requestPasswordReset()` always gives the same response. Its email link goes to `/auth/confirm?type=recovery`, then `/reset-password`. |
| Reset password | `/reset-password` (needs the session from the link) | `resetPassword()` redirects to `/dashboard`. |
| Sign out | `POST /auth/signout` | Redirects to `/login`. |

## Route protection (defense in depth)

1. **`src/middleware.ts`** runs before every request.
   - It refreshes the session.
   - Signed-out visitors are sent to `/login?next=…`.
   - Signed-in users are sent away from `/login` and `/signup`.
2. **`requireContext()`** in `(app)/layout.tsx` checks again on the server and loads the user's organization and role.
3. **Server Actions** must call `requireContext()` or `requireRole([...])` from `features/auth/guards.ts`. Actions are public POST endpoints, so they can be called without ever visiting the page.
4. **Postgres RLS** is the final backstop. Even a bug in the app can't read another organization's rows.

Public paths are listed in `src/lib/supabase/middleware.ts` (`PUBLIC_PATHS`, `PUBLIC_PREFIXES`). Everything else requires a session.

## Why two email-link routes?

- **`/auth/confirm` (token_hash).** Our email templates use this route. It works on any device: a user can sign up on a laptop and tap the link on their phone.
- **`/auth/callback` (PKCE `?code=`).** Supabase's default templates and future OAuth providers use this route. It only works in the browser that started the flow.

## Hosted Supabase setup

1. **Turn on email confirmation.** Go to Authentication → Sign In / Providers → Email and turn on **Confirm email**.
2. **Set the URLs.** In Authentication → URL Configuration:
   - **Site URL:** `http://localhost:3000` (your production URL later)
   - **Redirect URLs:** `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/confirm`
3. **Install the email templates.** In Authentication → Emails → Templates:
   - **Confirm signup:** paste `supabase/templates/confirmation.html`
   - **Reset password:** paste `supabase/templates/recovery.html`
4. **Set up email delivery for production.** In Authentication → Emails → SMTP Settings, configure a custom SMTP provider. Supabase's built-in sender is rate-limited to a few emails per hour and is meant for testing only.

For local development, `supabase/config.toml` already applies all of this when you run `supabase start`.
