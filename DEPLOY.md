# Deploying VisionaryHomeCRM (Vercel + Supabase)

Order matters: the database must exist before the first real sign-up.

## 1. Supabase project

1. Create a project at supabase.com (pick the region closest to your users).
2. **Run the migrations**, in filename order, from `supabase/migrations/`:
   - Easiest: Supabase CLI
     ```bash
     npx supabase login
     npx supabase link --project-ref <your-project-ref>
     npx supabase db push
     ```
   - Or paste each file into **SQL Editor → New query → Run**, 0001 → 0009.
   This creates every table, RLS policy, function and the private `crm-files` storage bucket.
3. **Authentication → URL Configuration**
   - Site URL: `https://<your-app>.vercel.app` (or your custom domain)
   - Redirect URLs: add `https://<your-app>.vercel.app/**`
     (and `https://*-<your-vercel-team>.vercel.app/**` if you want preview deployments to work).
4. **Authentication → Email Templates.** `supabase/config.toml` only applies to local dev, so copy these by hand:
   - *Confirm signup* → body of `supabase/templates/confirmation.html`
   - *Reset password* → body of `supabase/templates/recovery.html`
   Both links go to `/auth/confirm?token_hash=…`, which is what the app expects. With the default template, email verification fails.
5. **Authentication → Providers → Email**: keep *Confirm email* on.
6. Optional but recommended for real users: **Authentication → SMTP** with your own email provider.
   Supabase's built-in sender is rate-limited to a handful of emails per hour.

## 2. Vercel project

1. vercel.com → **Add New → Project → Import** the GitHub repository. Framework: Next.js (auto-detected). No build settings to change.
2. **Connect Supabase**: Project → **Storage / Integrations → Supabase → Connect** and pick the project from step 1.
   This adds `NEXT_PUBLIC_SUPABASE_URL` and the anon/publishable key automatically (the app accepts either
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
   Without the integration, add those two by hand from Supabase → Project Settings → API.
3. **Settings → Environment Variables**: add the rest.

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://<your-app>.vercel.app` | Used in auth email links. Must match the Supabase Site URL. |
| `OPENAI_API_KEY` | your key | Optional. Leave unset and the AI panel says "AI isn't configured". |
| `OPENAI_MODEL` | `gpt-4o-mini` | Optional. |
| `AI_HOURLY_LIMIT_PER_USER` | `60` | Optional cost cap. |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase | Not used by the app yet. Never give it a `NEXT_PUBLIC_` prefix. |

4. **Deploy.** After changing any `NEXT_PUBLIC_*` variable, redeploy: those values are baked in at build time.

## 3. Smoke test after deploy

1. `/signup` → the confirmation email arrives → its link lands on `/dashboard`.
2. Create a lead, drag it on `/leads/pipeline`, open `/reports`.
3. Upload a document on a transaction (checks the storage bucket and policies).
4. `/forgot-password` → the reset email works.

If sign-in loops back to `/login`, the Supabase Site URL or Redirect URLs don't match the Vercel domain.
