import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for Client Components ('use client').
 * Reads/writes the auth session from browser cookies. Every query still goes
 * through Row Level Security, so this is safe to use in the browser.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Vercel's Supabase integration may provide the newer "publishable" key name.
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
  );
}
