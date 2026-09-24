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
// [S108 Spec A] the recorder arm reads `site_visits` on the session, then asks
// site_visit_access() — both mocked here so the arm's ORDER can be asserted.
let visitRow: Record<string, unknown> | null = null;
let accessValue: string | null = null;

// [S110 A] every .eq() the ADMIN client's query makes, so a test can assert the
// visit arm is SCOPED to site-visit captures (the Floor) and the office arm is not.
let adminEqs: Array<[string, unknown]> = [];

/** A chainable PostgREST-shaped stub. `.single()` resolves the configured row. */
function table(row: unknown, eqs?: Array<[string, unknown]>) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'is', 'in']) {
    chain[m] = () => chain;
  }
  chain.eq = (col: string, val: unknown) => {
    eqs?.push([col, val]);
    return chain;
  };
  chain.single = async () => ({ data: row, error: null });
  chain.maybeSingle = async () => ({ data: row, error: null });
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return chain;
}

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
    from: (t: string) =>
      table(t === 'profiles' ? profileRow : t === 'site_visits' ? visitRow : estimateRow),
    rpc: async () => ({ data: accessValue, error: null }),
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: (...args: unknown[]) => {
    adminSpy(...args);
    return {
      from: () => table(null, adminEqs),
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: null }),
          // [S108] the recorder MIRROR reaches the upload; a stub error ends it
          // cleanly (500) AFTER the admin client was reached, which is the point.
          upload: async () => ({ error: { message: 'stub' } }),
        }),
      },
    };
  },
}));

const { GET, POST } = await import('@/app/api/estimates/[id]/files/route');
const ctx = { params: { id: '11111111-1111-1111-1111-111111111111' } };

beforeEach(() => {
  adminSpy.mockClear();
  adminEqs = [];
  sessionUser = { id: 'user-1' };
  profileRow = { company_id: 'co-1', role: 'project_manager' };
  estimateRow = null;
  visitRow = null;
  accessValue = null;
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

// ---------------------------------------------------------------------------
// [S108 Spec A, Q3 → A, condition 2] THE RECORDER ARM — "did you record this
// visit". A foreman or crew member can never SELECT the estimate (it carries
// money), so the route falls through to the money-free `site_visits` read.
// That arm must ALSO run entirely before the service-role client, and it gets
// its OWN mirror case so its not-called assertions cannot pass vacuously.
// ---------------------------------------------------------------------------
// [S110 A] _Superseded title, quoted: "[S108] the RECORDER arm — also before the
// admin client, with its own mirror"._ The arm is now the VISIT arm: any internal
// employee on the visit (not only its recorder), who reads ONLY site-visit
// captures and captures at every status. Same ordering rule, same mirrors.
describe('[S108→S110] the VISIT arm — also before the admin client, with its own mirror', () => {
  const body = (capture = true) => {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(4)], 'a.jpg', { type: 'image/jpeg' }));
    if (capture) form.set('capture', '1');
    return new Request('http://t/', { method: 'POST', body: form });
  };
  const crew = () => {
    profileRow = { company_id: 'co-1', role: 'crew_member' };
    estimateRow = null; // RLS: a crew member never sees the estimate row
  };

  it('no estimate AND no visit of theirs → GET 404 AND the admin client is never reached', async () => {
    crew();
    const res = await GET(new Request('http://t/'), ctx);
    expect(res.status).toBe(404);
    expect(adminSpy).not.toHaveBeenCalled();
  });

  it('an ABANDONED visit of theirs → POST 404 AND the admin client is never reached', async () => {
    crew();
    visitRow = { estimate_id: ctx.params.id, company_id: 'co-1', created_by: 'user-1', is_deleted: true };
    accessValue = null;
    const res = await POST(body(), ctx);
    expect(res.status).toBe(404);
    expect(adminSpy).not.toHaveBeenCalled();
  });

  // _Superseded title: "their visit, already PROMOTED (access null) → POST 403" —
  // "Q3 condition 1: after promotion the recorder keeps READ and LOSES UPLOAD."_
  // [S110 ruling 2] promotion no longer closes upload; access is NULL now only
  // for a caller who is not an internal employee on the visit.
  it('site_visit_access() NULL → POST 403 AND the admin client is never reached', async () => {
    crew();
    visitRow = { estimate_id: ctx.params.id, company_id: 'co-1', created_by: 'user-1', is_deleted: false };
    accessValue = null;
    const res = await POST(body(), ctx);
    expect(res.status).toBe(403);
    expect(adminSpy).not.toHaveBeenCalled();
  });

  it('a visit-arm ORDINARY upload (no capture flag) → 403 AND the admin client is never reached', async () => {
    // Only the site-visit record's captures are theirs to add; the Files tab is the office's.
    crew();
    visitRow = { estimate_id: ctx.params.id, company_id: 'co-1', created_by: 'someone-else', is_deleted: false };
    accessValue = 'staff';
    const res = await POST(body(false), ctx);
    expect(res.status).toBe(403);
    expect(adminSpy).not.toHaveBeenCalled();
  });

  it('MIRROR: a capture on ANY visit in the company (not only one they recorded) → POST reaches the admin client', async () => {
    crew();
    visitRow = { estimate_id: ctx.params.id, company_id: 'co-1', created_by: 'someone-else', is_deleted: false };
    accessValue = 'staff';
    await POST(body(), ctx);
    expect(adminSpy, 'the visit arm never reaches the admin client at all').toHaveBeenCalled();
  });

  it('⚠️ THE FLOOR — the visit arm lists ONLY site_visit_capture files, never the estimate\'s other files', async () => {
    crew();
    visitRow = { estimate_id: ctx.params.id, company_id: 'co-1', created_by: 'someone-else', is_deleted: false };
    accessValue = 'staff';
    const res = await GET(new Request('http://t/'), ctx);
    expect(res.status).toBe(200);
    expect(adminEqs, 'a crew member could list the estimate\'s PDFs (vendor quotes)').toContainEqual([
      'site_visit_capture',
      true,
    ]);
  });

  it('MIRROR: the office arm is NOT scoped to captures (so the Floor case is not vacuous)', async () => {
    profileRow = { company_id: 'co-1', role: 'owner' };
    estimateRow = { id: ctx.params.id, company_id: 'co-1', status: 'draft', created_by: 'user-1' };
    const res = await GET(new Request('http://t/'), ctx);
    expect(res.status).toBe(200);
    expect(adminEqs.some(([c]) => c === 'site_visit_capture')).toBe(false);
  });

  it('MIRROR: a PROMOTED (or sent) visit → GET still reaches the admin client', async () => {
    crew();
    visitRow = { estimate_id: ctx.params.id, company_id: 'co-1', created_by: 'user-1', is_deleted: false };
    accessValue = 'staff';
    const res = await GET(new Request('http://t/'), ctx);
    expect(res.status).toBe(200);
    expect(adminSpy).toHaveBeenCalled();
  });
});
