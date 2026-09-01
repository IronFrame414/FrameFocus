import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';

// ONE Supabase client per REQUEST. `cache()` memoizes for the lifetime of a
// single server render — React's per-request store, isolated across requests and
// across callers — so the ~28 service calls a dashboard render makes now share
// one client instead of standing up 28.
//
// ⚠️ WHY THIS IS A SPEED FIX AND NOT JUST TIDINESS. Every `@supabase/ssr` client
// creates its own GoTrue auth instance, and those instances serialize on a
// process lock keyed to the session-cookie name. 28 independent clients all
// contend for that ONE lock, each waiting behind the others — which is the bulk
// of the layout's wall time, not the queries (the queries are ~1.5ms at the SQL
// level). Collapsing to one client per request removes the contention.
//
// ⚠️ SCOPE IS PER-REQUEST, NEVER A SINGLETON — this is the security property, not
// an implementation detail. `cache()` is scoped to a single request's render, so
// a different caller (different cookies, different user) gets a FRESH client
// bound to ITS own cookies, never a previous caller's session. The moment this
// regresses to a module-level singleton it becomes an identity leak across
// users. `supabase-server.identity.test.ts` fails if a client is ever reused
// across two different callers.
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            );
          } catch {
            // Ignored in Server Components (read-only)
          }
        },
      },
    }
  );
});
