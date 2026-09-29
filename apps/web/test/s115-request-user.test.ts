import { describe, it, expect, vi, beforeEach } from 'vitest';

// H-2 [S115] — `getRequestUser()` asks the Auth server ONCE per request, and it
// must never hand one caller another caller's user.
//
// Same harness as `supabase-server.identity.test.ts`: `cache` is replaced by a
// pass-through, so every call below is what a SEPARATE request would do. What
// this pins down:
//   1. two callers with different cookies get their OWN user — the security
//      property; a module-level memo instead of React's per-request `cache`
//      would fail the first test;
//   2. it asks via `auth.getUser()` (the Auth server's verdict), never
//      `getSession()` (a cookie read the layouts' redirects must not trust);
//   3. no session → null, which every caller treats as "redirect to sign-in".

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, cache: <T,>(fn: T): T => fn };
});

const getSession = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { getAll: () => { name: string; value: string }[] } }
  ) => ({
    auth: {
      getSession,
      // The fake Auth server: the cookie value IS the user id, or no user.
      getUser: async () => {
        const token = opts.cookies.getAll()[0]?.value;
        return { data: { user: token ? { id: token } : null }, error: null };
      },
    },
  }),
}));

let activeStore: { getAll: () => { name: string; value: string }[]; set: () => void };
vi.mock('next/headers', () => ({
  cookies: async () => activeStore,
}));

import { getRequestUser } from '@/lib/supabase-server';

const storeFor = (userId: string | null) => ({
  getAll: () => (userId ? [{ name: 'sb-nmyphyhmf-auth-token', value: userId }] : []),
  set: () => {},
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  getSession.mockReset();
});

describe('getRequestUser — one Auth-server answer per request, never another caller’s', () => {
  it('two callers with different sessions each get their OWN user', async () => {
    activeStore = storeFor('USER_A');
    const a = await getRequestUser();
    activeStore = storeFor('USER_B');
    const b = await getRequestUser();
    expect(a?.id).toBe('USER_A');
    expect(b?.id).toBe('USER_B');
  });

  it('asks the Auth server (getUser), never trusts the cookie alone (getSession)', async () => {
    activeStore = storeFor('USER_A');
    await getRequestUser();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('no session → null (the callers redirect to sign-in on null)', async () => {
    activeStore = storeFor(null);
    expect(await getRequestUser()).toBeNull();
  });
});
