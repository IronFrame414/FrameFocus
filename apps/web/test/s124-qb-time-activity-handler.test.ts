import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// S124 Parts 1 + 3 — the time_activity handler against a FAKE QuickBooks.
//
// ⚠️ THIS IS NOT THE SANDBOX PROOF. It proves the handler's DECISIONS — update
// vs create, marker adoption, the gates — with the QuickBooks transport
// replaced. The live sandbox proof (s124-qb-time-activity.live.ts) repeats the
// Part 3 cases against Intuit's sandbox once its keys are back in .env.local.
//
// The duplicate count is read from the fake's own store after every case:
// "how many entries in QuickBooks carry this session's marker" must be exactly
// 1 after any number of re-approvals (stop rule 5).
// ============================================================================

interface Entry {
  Id: string;
  SyncToken: string;
  Description?: string;
  TxnDate: string;
  Hours: number;
  Minutes: number;
  EmployeeRef: { value: string };
}
let qb: Entry[] = [];
let nextId = 100;
const calls: string[] = [];

vi.mock('@/lib/quickbooks/client', async () => {
  const real = await vi.importActual<typeof import('@/lib/quickbooks/client')>('@/lib/quickbooks/client');
  return {
    ...real,
    qboQuery: async (_a: unknown, _c: unknown, q: string) => {
      calls.push('query');
      const m = /TxnDate >= '([\d-]+)' and TxnDate <= '([\d-]+)'/.exec(q)!;
      return { QueryResponse: { TimeActivity: qb.filter((e) => e.TxnDate >= m[1] && e.TxnDate <= m[2]) } };
    },
    qboRead: async (_a: unknown, _c: unknown, path: string) => {
      calls.push(`read ${path}`);
      const id = path.split('/').pop();
      const e = qb.find((x) => x.Id === id);
      return e ? { TimeActivity: { ...e } } : {};
    },
    qboWrite: async (_c: unknown, path: string, body: Record<string, unknown>) => {
      if (body.Id) {
        calls.push(`update ${body.Id}`);
        const e = qb.find((x) => x.Id === body.Id)!;
        if (e.SyncToken !== body.SyncToken) throw new Error('stale SyncToken');
        Object.assign(e, body, { SyncToken: String(Number(e.SyncToken) + 1) });
        return { TimeActivity: e };
      }
      calls.push(`create`);
      const e = { ...(body as unknown as Entry), Id: String(nextId++), SyncToken: '0' };
      qb.push(e);
      return { TimeActivity: e };
    },
  };
});

const { handleTimeActivity, TIME_EXPORT_OFF_REASON, CHANGED_AFTER_APPROVAL_REASON, unmatchedEmployeeReason } =
  await import('@/lib/quickbooks/time-activity');
const { memoMatches } = await import('@/lib/quickbooks/reconcile');

// ── a tiny fake of the service-role client: filters, single, update ─────────
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

function from(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let patch: Row | null = null;
  const rows = () => (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    not: (c: string) => (filters.push((r) => r[c] !== null && r[c] !== undefined), b),
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), b),
    lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), b),
    order: () => b,
    update: (p: Row) => ((patch = p), b),
    single: async () => ({ data: rows()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => {
      if (patch) {
        for (const r of rows()) Object.assign(r, patch);
        return Promise.resolve({ error: null }).then(res);
      }
      return Promise.resolve({ data: rows(), error: null }).then(res);
    },
  };
  return b;
}

const COMPANY = 'co-1';
const SESSION = 'sess-1';
const admin = { from } as never;
const ctx = () =>
  ({
    admin,
    conn: { companyId: COMPANY, realmId: 'realm-sandbox', accessToken: 't' },
    companyId: COMPANY,
    accountCache: new Map(),
    vendorCache: new Map(),
    vendorMapWriteFailures: 0,
  }) as never;
const row = (operation: 'create' | 'update') =>
  ({ id: 'q-1', company_id: COMPANY, entity_type: 'time_activity', entity_id: SESSION, operation, attempts: 0 }) as never;

function seed(opts: { enabled?: boolean; matched?: boolean; status?: string; qbId?: string | null } = {}) {
  db.companies = [
    {
      id: COMPANY,
      qb_time_export_enabled: opts.enabled ?? true,
      timezone: 'America/New_York',
      breaks_paid: false,
      paid_break_cap_minutes: 0,
      ot_threshold_hours: 40,
    },
  ];
  db.time_clock_sessions = [
    {
      id: SESSION,
      company_id: COMPANY,
      member_id: 'mem-1',
      clock_in: '2026-10-05T12:00:00.000Z',
      clock_out: '2026-10-05T20:00:00.000Z',
      status: opts.status ?? 'approved',
      is_deleted: false,
      qb_time_activity_id: opts.qbId ?? null,
      qb_push_status: 'not_pushed',
      qb_synced_at: null,
      time_segments: [
        { segment_type: 'break', project_id: null, segment_start: '2026-10-05T16:00:00Z', segment_end: '2026-10-05T16:30:00Z', is_deleted: false },
      ],
    },
  ];
  db.qb_employee_map =
    opts.matched === false
      ? []
      : [{ company_id: COMPANY, realm_id: 'realm-sandbox', member_id: 'mem-1', qb_employee_id: '55', is_deleted: false }];
  db.company_members = [{ id: 'mem-1', company_id: COMPANY, display_name: 'Casey Crew' }];
}

const ours = () => qb.filter((e) => memoMatches(e.Description, SESSION));
const session = () => db.time_clock_sessions[0];

beforeEach(() => {
  qb = [];
  nextId = 100;
  calls.length = 0;
});

describe('S124 — the time_activity handler (fake QuickBooks)', () => {
  it('first approval: looks for its marker, finds none, creates ONE entry of actual paid time', async () => {
    seed();
    expect(await handleTimeActivity(ctx(), row('create'))).toEqual({ kind: 'pushed' });
    expect(calls).toEqual(['query', 'create']);
    expect(ours().length).toBe(1);
    expect(ours()[0]).toMatchObject({ Hours: 7, Minutes: 30, TxnDate: '2026-10-05', EmployeeRef: { value: '55' } });
    expect(session()).toMatchObject({ qb_time_activity_id: '100', qb_push_status: 'pushed' });
  });

  it('EDIT then re-approval (id stored): a sparse UPDATE of the same entry — count stays 1', async () => {
    seed();
    await handleTimeActivity(ctx(), row('create'));
    calls.length = 0;
    (session() as Row).clock_out = '2026-10-05T21:00:00.000Z';
    expect(await handleTimeActivity(ctx(), row('update'))).toEqual({ kind: 'pushed' });
    expect(calls).toEqual(['read /timeactivity/100', 'update 100']);
    expect(ours().length).toBe(1);
    expect(ours()[0]).toMatchObject({ Hours: 8, Minutes: 30, SyncToken: '1' });
  });

  it('SPLIT then re-approval (hours unchanged): an update, never a create — count stays 1', async () => {
    seed();
    await handleTimeActivity(ctx(), row('create'));
    calls.length = 0;
    (session().time_segments as Row[]).push({
      segment_type: 'work', project_id: 'p', segment_start: '2026-10-05T12:00:00Z', segment_end: '2026-10-05T14:00:00Z', is_deleted: false,
    });
    await handleTimeActivity(ctx(), row('update'));
    expect(calls).toEqual(['read /timeactivity/100', 'update 100']);
    expect(ours().length).toBe(1);
    expect(ours()[0]).toMatchObject({ Hours: 7, Minutes: 30 });
  });

  it('ADD a break then re-approval: an update with the new total — count stays 1', async () => {
    seed();
    await handleTimeActivity(ctx(), row('create'));
    (session().time_segments as Row[]).push({
      segment_type: 'break', project_id: null, segment_start: '2026-10-05T18:00:00Z', segment_end: '2026-10-05T18:15:00Z', is_deleted: false,
    });
    await handleTimeActivity(ctx(), row('update'));
    expect(ours().length).toBe(1);
    expect(ours()[0]).toMatchObject({ Hours: 7, Minutes: 15 });
  });

  it('⚠️ id NULL but the entry EXISTS in QuickBooks: the marker finds it, the id is adopted, an UPDATE — count stays 1', async () => {
    seed();
    await handleTimeActivity(ctx(), row('create'));
    (session() as Row).qb_time_activity_id = null; // the lost write-back
    calls.length = 0;
    expect(await handleTimeActivity(ctx(), row('create'))).toEqual({ kind: 'pushed' });
    expect(calls).toEqual(['query', 'read /timeactivity/100', 'update 100']);
    expect(ours().length).toBe(1);
    expect(session()).toMatchObject({ qb_time_activity_id: '100' });
  });

  it('two entries already carry the marker: TERMINAL, nothing written', async () => {
    seed();
    qb.push(
      { Id: '1', SyncToken: '0', Description: 'EZCB session [FF:sess-1]', TxnDate: '2026-10-05', Hours: 7, Minutes: 30, EmployeeRef: { value: '55' } },
      { Id: '2', SyncToken: '0', Description: 'EZCB session [FF:sess-1]', TxnDate: '2026-10-05', Hours: 7, Minutes: 30, EmployeeRef: { value: '55' } }
    );
    const r = await handleTimeActivity(ctx(), row('create'));
    expect(r.kind).toBe('terminal');
    expect(calls).toEqual(['query']);
    expect(qb.length).toBe(2);
  });

  it('the stored id is gone from QuickBooks: TERMINAL, never re-created', async () => {
    seed({ qbId: '999' });
    const r = await handleTimeActivity(ctx(), row('update'));
    expect(r.kind).toBe('terminal');
    expect(calls).toEqual(['read /timeactivity/999']);
    expect(qb.length).toBe(0);
  });

  it('the switch is OFF: TERMINAL, and QuickBooks is never called', async () => {
    seed({ enabled: false });
    expect(await handleTimeActivity(ctx(), row('create'))).toEqual({ kind: 'terminal', reason: TIME_EXPORT_OFF_REASON });
    expect(calls).toEqual([]);
  });

  it('unmatched member: PARKED with the person named, QuickBooks never called', async () => {
    seed({ matched: false });
    expect(await handleTimeActivity(ctx(), row('create'))).toEqual({
      kind: 'park',
      reason: unmatchedEmployeeReason('Casey Crew'),
    });
    expect(calls).toEqual([]);
  });

  it('changed after approval (back to pending): TERMINAL, QuickBooks never called', async () => {
    seed({ status: 'pending' });
    expect(await handleTimeActivity(ctx(), row('create'))).toEqual({
      kind: 'terminal',
      reason: CHANGED_AFTER_APPROVAL_REASON,
    });
    expect(calls).toEqual([]);
  });
});
