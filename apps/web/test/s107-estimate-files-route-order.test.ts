import { describe, it, expect, vi, beforeEach } from 'vitest';

// S107 [RULED Josh, ASK-B.2 / FILL-B.6] — THE ROUTE'S CALL ORDER IS THE FLOOR.
//
// ===========================================================================
// WHY THIS FILE EXISTS WHEN A FLOOR TEST ALREADY DOES
// ===========================================================================
// `s106-estimate-files-route-floor.live.ts` is a real live test on real rows, and
// its own header says what it cannot reach:
//
//   "The Next route handler can't be invoked with a real session in vitest, so
//    the floor is tested at the layer that enforces it."
//
// It exercises `estimates_select_authenticated` — the RLS POLICY — and the
// estimate_id scoping. It never imports `route.ts`. ⚠️ So if someone moved
// `getSupabaseAdmin()` above the session read, or deleted the `if (!est) return
// 404`, EVERY ASSERTION IN THAT FILE WOULD STILL PASS. The service-role client
// bypasses RLS entirely, so the ordering IS the access control and nothing tested
// the ordering.
//
// ===========================================================================
// WHAT THIS ASSERTS, AND WHY A STATUS CHECK ALONE WOULD NOT DO
// ===========================================================================
// Every denial case asserts TWO things:
//   1. the status (404/403/401), and
//   2. ⚠️ `getSupabaseAdmin` WAS NEVER CALLED.
//
// (2) is the whole point. A 404 still arrives if the admin client was constructed
// and queried first and the handler merely returned 404 afterwards — by then the
// privileged read has already happened. Asserting the admin client was never
// REACHED is what fails the moment it moves above the floor.
//
// The mirror case (session read succeeds → admin IS called) exists so this file
// cannot pass because the mock is broken: if `getSupabaseAdmin` were unreachable
// for some unrelated reason, every not-called assertion would pass vacuously.

const adminSpy = vi.fn();
let sessionUser: { id: string } | null = { id: 'user-1' };
let profileRow: { company_id: string; role: string } | null = {
  company_id: 'co-1',
  role: 'project_manager',
};
let estimateRow: Record<string, unknown> | null = null;

/** A chainable PostgREST-shaped stub. `.single()` resolves the configured row. */
function table(row: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'is', 'in']) {
    chain[m] = () => chain;
  }
  chain.single = async () => ({ data: row, error: null });
  chain.maybeSingle = async () => ({ data: row, error: null });
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return chain;
}

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
    from: (t: string) => table(t === 'profiles' ? profileRow : estimateRow),
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: (...args: unknown[]) => {
    adminSpy(...args);
    return {
      from: () => table(null),
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
    };
  },
}));

const { GET, POST } = await import('@/app/api/estimates/[id]/files/route');
const ctx = { params: { id: '11111111-1111-1111-1111-111111111111' } };

beforeEach(() => {
  adminSpy.mockClear();
  sessionUser = { id: 'user-1' };
  profileRow = { company_id: 'co-1', role: 'project_manager' };
  estimateRow = null;
});

describe('GET — the session read is the floor and runs first', () => {
  it('RLS denial (estimate not visible) → 404 AND the admin client is never reached', async () => {
    estimateRow = null; // what `estimates_select_authenticated` returns for a PM who does not own it
    const res = await GET(new Request('http://t/'), ctx);
    expect(res.status).toBe(404);
    expect(
      adminSpy,
      'the service-role client was reached on a DENIED estimate — the floor has been bypassed'
    ).not.toHaveBeenCalled();
  });

  it('unauthenticated → 401 AND the admin client is never reached', async () => {
    sessionUser = null;
    const res = await GET(new Request('http://t/'), ctx);
    expect(res.status).toBe(401);
    expect(adminSpy).not.toHaveBeenCalled();
  });

  it('MIRROR: the estimate IS visible → the admin client IS reached (so the above is not vacuous)', async () => {
    estimateRow = { id: ctx.params.id, company_id: 'co-1' };
    const res = await GET(new Request('http://t/'), ctx);
    expect(res.status).toBe(200);
    expect(
      adminSpy,
      'the admin client was never reachable at all — every not-called assertion above proves nothing'
    ).toHaveBeenCalled();
  });
});

describe('POST — the session read AND the edit gate both precede the admin client', () => {
  const body = () => {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(4)], 'a.pdf', { type: 'application/pdf' }));
    return new Request('http://t/', { method: 'POST', body: form });
  };

  it('RLS denial → 404 AND the admin client is never reached', async () => {
    estimateRow = null;
    const res = await POST(body(), ctx);
    expect(res.status).toBe(404);
    expect(adminSpy).not.toHaveBeenCalled();
  });

  it('no profile → 403 AND the admin client is never reached', async () => {
    profileRow = null;
    const res = await POST(body(), ctx);
    expect(res.status).toBe(403);
    expect(adminSpy).not.toHaveBeenCalled();
  });

  it("a PM who did NOT author the draft → 403 AND the admin client is never reached", async () => {
    // Visible to them (RLS let the row through) but not theirs to edit. The edit
    // gate is a SECOND floor above the admin client and is tested as one.
    estimateRow = { id: ctx.params.id, company_id: 'co-1', status: 'draft', created_by: 'someone-else' };
    const res = await POST(body(), ctx);
    expect(res.status).toBe(403);
    expect(adminSpy).not.toHaveBeenCalled();
  });

  it('a non-draft estimate the PM DID author → 403 AND the admin client is never reached', async () => {
    estimateRow = { id: ctx.params.id, company_id: 'co-1', status: 'sent', created_by: 'user-1' };
    const res = await POST(body(), ctx);
    expect(res.status).toBe(403);
    expect(adminSpy).not.toHaveBeenCalled();
  });
});
