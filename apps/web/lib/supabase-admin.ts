import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _supabaseAdmin: SupabaseClient | null = null;

/**
 * Lazy-initialized Supabase client using the service role key.
 * Bypasses RLS. Use only in server contexts (server actions, API routes).
 * Never import this from a client component or expose to the browser.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        // [S118 item 5] ⚠️ NEVER THROUGH NEXT'S DATA CACHE. supabase-js reads with
        // fetch, and in a server component that reads no cookies or headers Next 14
        // caches that fetch — measured: `/bid/[token]` kept the FIRST
        // get_sub_bid_request response per token (revalidate 31536000, on disk
        // in .next/cache/fetch-cache), so a CANCELLED bid went on showing the open
        // form. `export const dynamic = 'force-dynamic'` on the page did NOT stop
        // it (a cache entry was written after that build). A service-role read is
        // an authorization-bearing read; a stale one is never acceptable.
        global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
      }
    );
  }
  return _supabaseAdmin;
}
