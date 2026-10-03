import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// S127 P-4 — the query fixes (audit findings 5, 7, 8). Each is proved by the
// SHAPE of the query the service sends, recorded by a fake client: bounded,
// ordered by what it is bounded on, scoped where it must be — and the
// project-scoped calendar NOT windowed.
// ============================================================================

vi.mock('server-only', () => ({}));
vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  cache: <T>(fn: T) => fn,
}));

type Call = [string, ...unknown[]];
let calls: Call[][] = [];
let results: unknown[] = [];

/** A chainable fake: every method records itself; awaiting yields the next queued result. */
function builder(): unknown {
  const mine: Call[] = [];
  calls.push(mine);
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          const r = results.shift() ?? { data: [], error: null };
          return (res: (v: unknown) => void) => res(r);
        }
        return (...args: unknown[]) => {
          mine.push([prop, ...args]);
          if (prop === 'maybeSingle' || prop === 'single') {
            const r = results.shift() ?? { data: null, error: null };
            return Promise.resolve(r);
          }
          return proxy;
        };
      },
    }
  );
  return proxy;
}

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const b = builder() as { __table?: string };
      calls[calls.length - 1].push(['from', table]);
      return b;
    },
    rpc: async () => results.shift() ?? { data: null, error: null },
  }),
  getRequestUser: async () => ({ id: 'user-1' }),
}));

vi.mock('@/lib/services/company', () => ({
  getCompanyTimeSettings: async () => ({ timezone: 'America/New_York' }),
}));
vi.mock('@/lib/services/payables', () => ({ getExpiringCompliance: async () => [] }));

const ensureScheduleFresh = vi.fn(async () => ({ status: 'fresh' }));
vi.mock('@/lib/critical-path/recompute', () => ({ ensureScheduleFresh }));
vi.mock('@/lib/critical-path/load', () => ({
  loadCriticalPathData: async () => ({
    ok: true,
    data: { settings: { critical_path_enabled: true }, input: { tasks: [] } },
  }),
}));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({}) }));

beforeEach(() => {
  calls = [];
  results = [];
  ensureScheduleFresh.mockClear();
});

const find = (cs: Call[], name: string) => cs.filter((c) => c[0] === name);

describe('finding 5 — /m/logs is bounded, ordered by what it is bounded on', () => {
  it('reads LOG_FEED_PAGE + 1 rows, newest first, with id as the unique tiebreak', async () => {
    const { getMobileDailyLogs, LOG_FEED_PAGE } = await import('@/lib/services/daily-logs');
    const rows = Array.from({ length: LOG_FEED_PAGE + 1 }, (_, i) => ({
      id: `l${i}`,
      log_date: '2026-10-01',
      work_performed: null,
      project_id: 'p',
      office_reviewed_at: null,
      author: null,
      project: null,
    }));
    results.push({ data: rows, error: null }); // the feed
    results.push({ data: [], error: null }); // photo counts
    results.push({ data: { timezone: 'America/New_York' }, error: null }); // company tz (maybeSingle)
    results.push({ count: 3, error: null }); // week count
    const feed = await getMobileDailyLogs({ today: '2026-10-03' });
    const q = calls[0];
    expect(find(q, 'limit')).toEqual([['limit', LOG_FEED_PAGE + 1]]);
    expect(find(q, 'order')).toEqual([
      ['order', 'log_date', { ascending: false }],
      ['order', 'created_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
    ]);
    expect(feed.rows).toHaveLength(LOG_FEED_PAGE);
    expect(feed.hasMore).toBe(true);
  });

  it('clamps the requested page to [LOG_FEED_PAGE, LOG_FEED_MAX]', async () => {
    const { getMobileDailyLogs, LOG_FEED_MAX } = await import('@/lib/services/daily-logs');
    results.push({ data: [], error: null });
    await getMobileDailyLogs({ today: '2026-10-03', limit: 100_000 });
    expect(find(calls[0], 'limit')).toEqual([['limit', LOG_FEED_MAX + 1]]);
  });
});

describe("finding 8 — today's segments: ONE read, scoped to the caller", () => {
  it("filters by the caller's member id in the query and flattens, drops deleted, sorts", async () => {
    const { getMySegmentsSince } = await import('@/lib/services/time-tracking');
    results.push({ data: 'member-1', error: null }); // rpc get_my_member_id
    results.push({
      data: [
        {
          id: 's1',
          segments: [{ id: 'b', segment_start: '2026-10-03T10:00:00Z', is_deleted: false }],
        },
        {
          id: 's2',
          segments: [
            { id: 'a', segment_start: '2026-10-03T08:00:00Z', is_deleted: false },
            { id: 'x', segment_start: '2026-10-03T09:00:00Z', is_deleted: true },
          ],
        },
      ],
      error: null,
    });
    const segs = await getMySegmentsSince('2026-10-03T04:00:00.000Z');
    expect(segs.map((s) => s.id)).toEqual(['a', 'b']);
    expect(calls).toHaveLength(1); // no per-session follow-up reads
    expect(find(calls[0], 'eq')).toContainEqual(['eq', 'member_id', 'member-1']);
  });
});

describe('finding 7 — the calendar', () => {
  it('COMPANY-WIDE: every source is windowed (a year back, two ahead)', async () => {
    const { getCalendarEvents } = await import('@/lib/services/schedule');
    await getCalendarEvents({});
    const all = calls.flat();
    const ors = find(all, 'or').map((c) => String(c[1]));
    expect(ors.some((o) => o.startsWith('start_date.is.null,start_date.lte.'))).toBe(true);
    expect(ors.some((o) => o.startsWith('due_date.is.null,due_date.gte.'))).toBe(true);
    expect(ors.some((o) => o.startsWith('end_date.gte.'))).toBe(true);
    expect(find(all, 'gte').some((c) => c[1] === 'scheduled_date')).toBe(true);
  });

  it('PROJECT-scoped: NOT windowed — the Gantt and day view need the whole job', async () => {
    const { getCalendarEvents } = await import('@/lib/services/schedule');
    await getCalendarEvents({ projectId: 'p1' });
    const all = calls.flat();
    expect(find(all, 'or')).toEqual([]);
    expect(find(all, 'gte').some((c) => c[1] === 'scheduled_date')).toBe(false);
  });

  it('a project NOT on Critical Path answers null without the freshness check or the load', async () => {
    const { getMobileCriticalPath } = await import('@/lib/services/critical-path-mobile');
    results.push({ data: { critical_path_enabled: false }, error: null });
    expect(await getMobileCriticalPath('p1', 'owner')).toBeNull();
    expect(ensureScheduleFresh).not.toHaveBeenCalled();
  });

  it('a project ON Critical Path still loads', async () => {
    const { getMobileCriticalPath } = await import('@/lib/services/critical-path-mobile');
    results.push({ data: { critical_path_enabled: true }, error: null });
    expect(await getMobileCriticalPath('p1', 'owner')).toEqual({ tasks: [] });
    expect(ensureScheduleFresh).toHaveBeenCalledTimes(1);
  });
});
