import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * SECURITY GUARD for the per-request shared client (perf/shared-client, Option 1).
 *
 * `createClient` is `cache()`-wrapped so all ~28 service calls in one dashboard
 * render share a single Supabase client. The hazard Josh named: if "shared" ever
 * means shared ACROSS callers — a module-level singleton, or a cache that is not
 * request-scoped — then one user's client, carrying their session cookies, would
 * be handed to the next user. That is an identity leak, not a speed fix.
 *
 * This test fails if a client is reused across two different callers. It drives
 * two callers whose cookies differ, and asserts each returned client reads its
 * OWN caller's cookies. A singleton hands caller B the client built for caller A,
 * which would read caller A's session here — the assertion that catches it.
 *
 * `cache()` does not memoize outside a request scope (React only memoizes within
 * a server render's cache dispatcher), so in this unit context the two calls run
 * fresh — exactly one request each — which is what lets a cross-caller singleton
 * show through rather than being hidden behind the cache.
 */

// `cache` is a server-only React API: it resolves in the Next server runtime
// (next/dist/compiled/react) but is undefined under plain-node/vitest. Mock it as
// a PASSTHROUGH — which is also the semantics that matter for this test: no
// memoization means each caller runs the factory fresh, so a cross-caller
// singleton can show through rather than being masked by the cache.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, cache: <T,>(fn: T): T => fn };
});

// Capture the cookie adapter each client is constructed with, so we can ask a
// returned client whose cookies it reads.
vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { getAll: () => { name: string; value: string }[] } }
  ) => ({ cookieAdapter: opts.cookies }),
}));

let activeStore: { getAll: () => { name: string; value: string }[]; set: () => void };
vi.mock('next/headers', () => ({
  cookies: async () => activeStore,
}));

import { createClient } from '@/lib/supabase-server';

const storeFor = (sessionId: string) => ({
  getAll: () => [{ name: 'sb-nmyphyhmf-auth-token', value: sessionId }],
  set: () => {},
});

type TestClient = { cookieAdapter: { getAll: () => { name: string; value: string }[] } };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});

describe('createClient — per-request identity, never a cross-caller singleton', () => {
  it('two different callers get clients bound to their OWN cookies', async () => {
    activeStore = storeFor('CALLER_A_SESSION');
    const a = (await createClient()) as unknown as TestClient;

    activeStore = storeFor('CALLER_B_SESSION');
    const b = (await createClient()) as unknown as TestClient;

    // Caller A's client reads A's session.
    expect(a.cookieAdapter.getAll()[0].value).toBe('CALLER_A_SESSION');
    // Load-bearing: a module singleton (or a non-request-scoped cache) would hand
    // caller B the client built for A, and this would read 'CALLER_A_SESSION'.
    expect(b.cookieAdapter.getAll()[0].value).toBe('CALLER_B_SESSION');
  });

  it('a client reads cookies LIVE through the request store, not a value snapshotted at construction', async () => {
    // The identity a client carries must follow the request's cookies, so a
    // mid-request refresh (auth callback, token rotation) is seen rather than a
    // stale copy pinned when the client was built.
    const live = storeFor('BEFORE_REFRESH');
    activeStore = live;
    const c = (await createClient()) as unknown as TestClient;
    expect(c.cookieAdapter.getAll()[0].value).toBe('BEFORE_REFRESH');

    live.getAll = () => [{ name: 'sb-nmyphyhmf-auth-token', value: 'AFTER_REFRESH' }];
    expect(c.cookieAdapter.getAll()[0].value).toBe('AFTER_REFRESH');
  });
});
