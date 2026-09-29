import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
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

// H-2 [S115] — ONE Auth-server round trip per REQUEST, not one per caller.
//
// Measured on the project overview: the middleware, the dashboard layout, the
// project layout, the page and two "my" services each called
// `supabase.auth.getUser()` — 6 calls to the Auth server for one render (7 on
// Photos). They cannot overlap: auth-js runs every auth operation on a client
// through one queue, and every PostgREST query waits on that same queue for its
// session, so each getUser() in flight stalls every query behind it.
//
// `getUser()` (the Auth server's verdict), NOT `getSession()` (a cookie read):
// the layouts' redirects depend on a session the server still honours. This
// only stops asking the same question six times in one request.
//
// Same scoping as `createClient` above, and for the same security reason:
// `cache()` memoizes for ONE request's render, so a different caller never sees
// this caller's user. `s115-request-user.test.ts` fails if that regresses.
// Outside a render (Route Handlers) `cache()` does not memoize, so a handler
// calling this simply gets a fresh getUser() each time — never a stale one.
export const getRequestUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
