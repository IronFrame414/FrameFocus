import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// S127 P-1 — the two double-tap DEFECTS, at the service layer both surfaces
// share (PARITY): the mapping is proved here once and holds for /m and desktop.
//
//   a) a second clock-in tap returned Postgres's raw unique-violation text;
//   b) a second punch-create tap inserted a DUPLICATE item.
//
// The e2e (`e2e/s127-double-tap.spec.ts`) proves the screens reach these paths.
// ============================================================================

vi.mock('server-only', () => ({}));

// ── (a) clock-in ────────────────────────────────────────────────────────────
const sessionInsert = vi.fn();
vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => ({
    rpc: async () => ({ data: 'crew_member', error: null }),
    from: (table: string) => ({
      insert: () => ({
        select: () => ({
          single: async () =>
            table === 'time_clock_sessions'
              ? sessionInsert()
              : { data: { id: 'seg' }, error: null },
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

describe('S127 P-1a — a second clock-in tap', () => {
  beforeEach(() => sessionInsert.mockReset());

  it('maps the one-open-session refusal (23505) to already_clocked_in, never the raw text', async () => {
    const { clockIn, ALREADY_CLOCKED_IN } = await import('@/lib/services/time-tracking-client');
    sessionInsert.mockReturnValue({
      data: null,
      error: {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "idx_time_clock_sessions_one_open_per_member"',
      },
    });
    const r = await clockIn({ first_segment: { segment_type: 'shop' } });
    expect(r).toEqual({ success: false, code: 'already_clocked_in', error: ALREADY_CLOCKED_IN });
    expect(r.error).not.toContain('duplicate key');
  });

  it('any OTHER failure is not mislabelled as already clocked in', async () => {
    const { clockIn } = await import('@/lib/services/time-tracking-client');
    sessionInsert.mockReturnValue({
      data: null,
      error: { code: '42501', message: 'new row violates row-level security' },
    });
    const r = await clockIn({ first_segment: { segment_type: 'shop' } });
    expect(r.success).toBe(false);
    expect(r.code).toBeUndefined();
  });

  it('a first tap still clocks in', async () => {
    const { clockIn } = await import('@/lib/services/time-tracking-client');
    sessionInsert.mockReturnValue({ data: { id: 'sess' }, error: null });
    const r = await clockIn({ first_segment: { segment_type: 'shop' } });
    expect(r).toEqual({ success: true, sessionId: 'sess', segmentId: 'seg' });
  });
});

// ── (b) punch create ────────────────────────────────────────────────────────
type Existing = { id: string; created_by: string } | null;

function fakeSupabase(
  insertResult: { data: { id: string } | null; error: { code: string; message: string } | null },
  existing: Existing
) {
  const inserts: unknown[] = [];
  const client = {
    from: () => ({
      insert: (row: unknown) => {
        inserts.push(row);
        return { select: () => ({ single: async () => insertResult }) };
      },
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
      }),
    }),
  };
  return { client, inserts };
}

const ITEM = {
  id: '11111111-1111-4111-8111-111111111111',
  punch_list_id: '22222222-2222-4222-8222-222222222222',
  project_id: '33333333-3333-4333-8333-333333333333',
  title: 'Patch drywall',
};
const PK = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "punch_list_items_pkey"',
};

describe('S127 P-1b — a second punch-create tap', () => {
  it('the same id again is the FIRST row, replayed — not a second insert, not an error', async () => {
    const { insertPunchItemAsCaller } = await import('@/lib/services/assignments-server');
    const { client } = fakeSupabase(
      { data: null, error: PK },
      { id: ITEM.id, created_by: 'caller' }
    );
    const r = await insertPunchItemAsCaller(client as never, ITEM, 'caller');
    expect(r).toEqual({ success: true, id: ITEM.id, replayed: true });
  });

  it('a 23505 on a row the caller did NOT create is refused — no foreign row echoed back', async () => {
    const { insertPunchItemAsCaller } = await import('@/lib/services/assignments-server');
    const { client } = fakeSupabase(
      { data: null, error: PK },
      { id: ITEM.id, created_by: 'someone-else' }
    );
    const r = await insertPunchItemAsCaller(client as never, ITEM, 'caller');
    expect(r.success).toBe(false);
    expect(r.id).toBeUndefined();
  });

  it('a 23505 on a row the caller cannot SEE is refused', async () => {
    const { insertPunchItemAsCaller } = await import('@/lib/services/assignments-server');
    const { client } = fakeSupabase({ data: null, error: PK }, null);
    const r = await insertPunchItemAsCaller(client as never, ITEM, 'caller');
    expect(r.success).toBe(false);
  });

  it('the client id is what gets inserted, so two taps carry the same primary key', async () => {
    const { insertPunchItemAsCaller } = await import('@/lib/services/assignments-server');
    const { client, inserts } = fakeSupabase({ data: { id: ITEM.id }, error: null }, null);
    const r = await insertPunchItemAsCaller(client as never, ITEM, 'caller');
    expect(r).toEqual({ success: true, id: ITEM.id });
    expect(inserts).toEqual([ITEM]);
  });

  it('the schema keeps the id (zod strips unknown keys — it was dropped before)', async () => {
    const { punchItemCreateSchema } = await import('@framefocus/shared/validation/assignments');
    const parsed = punchItemCreateSchema.parse(ITEM);
    expect(parsed.id).toBe(ITEM.id);
    expect(punchItemCreateSchema.safeParse({ ...ITEM, id: 'not-a-uuid' }).success).toBe(false);
  });
});
