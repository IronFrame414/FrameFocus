import { describe, it, expect, beforeEach } from 'vitest';
import { OfflineQueue, MemoryStorage, type QueueEntry } from '@/lib/offline/queue';
import { syncOnce, type Executors, type SyncEvent } from '@/lib/offline/sync';
import {
  buildClockInEntries,
  buildClockOutEntries,
  buildDailyLogEntry,
} from '@/lib/offline/capture';

// M6M §5 — the queue's [unit] criteria, on the injected-storage /
// injected-online-predicate seam §10a specifies. No DB, no browser.
//
// Asserted here:
//   A-15/A-15b (unit half)  captured_at is the business timestamp, all kinds
//   A-16c   three entries against two rows; shared target_id, distinct entry_ids
//   A-16d   a child whose parent has not succeeded is NOT attempted
//   A-16e   a segment is its own entity
//   A-17 (unit half) / A-17b   permanent failure stays visible; retry is immediate
//   A-18 (unit half)   the pill counts state:'queued' only
//   A-19b2  detection is on base_updated_at, never captured_at
//   A-19b3  IS DISTINCT FROM, not >
//   A-19b4  a second offline edit does not advance the base
//   A-19c   the conflicted copy survives
//   A-19d   a conflicted entry leaves the queue: no retry, out of the count
//   A-19h   the queue entry outlives a failed conflict write
//   A-7i    an offline clock-in queues session + segment as TWO entries

let queue: OfflineQueue;

beforeEach(() => {
  queue = new OfflineQueue(new MemoryStorage());
});

/** Executors whose behaviour each test scripts. */
function fakeExec(overrides: Partial<Executors> = {}): Executors & {
  calls: { insert: QueueEntry[]; update: QueueEntry[]; conflicts: QueueEntry[] };
} {
  const calls = { insert: [] as QueueEntry[], update: [] as QueueEntry[], conflicts: [] as QueueEntry[] };
  return {
    calls,
    insert: async (e) => {
      calls.insert.push(e);
      return { updated_at: '2026-08-06T10:00:00Z' };
    },
    update: async (e) => {
      calls.update.push(e);
    },
    readUpdatedAt: async () => null,
    recordConflict: async (e) => {
      calls.conflicts.push(e);
    },
    uploadPhoto: async () => {},
    ...overrides,
  };
}

const online = () => true;

describe('§5.2 — the entry shape and capture builders', () => {
  it('A-7i · an offline clock-in queues session insert + segment insert as TWO entries, the segment gated on the session', async () => {
    const entries = buildClockInEntries({
      sessionEntryId: 'e-sess',
      segmentEntryId: 'e-seg',
      sessionId: 'row-sess',
      segmentId: 'row-seg',
      first_segment: { segment_type: 'work', project_id: 'p1' },
      gps_in: { reason: 'permission_denied', error_code: 1 },
      captured_at: '2026-08-06T06:58:00Z',
      status: 'pending',
    });
    for (const e of entries) await queue.enqueue(e);

    const all = await queue.all();
    expect(all).toHaveLength(2);
    expect(all[0].entity).toBe('time_clock_session');
    expect(all[1].entity).toBe('time_segment'); // A-16e — its own entity
    expect(all[1].depends_on).toBe('e-sess');
  });

  it('A-15 (unit) · captured_at is the business timestamp — the payload carries it as clock_in', async () => {
    // A clock-in queued at 06:58 and synced at 11:20 is a 06:58 clock-in: the
    // payload the executor will send carries the CAPTURE time, so the sync
    // hour can never leak into the business column.
    const [session] = buildClockInEntries({
      sessionEntryId: 'e1',
      segmentEntryId: 'e2',
      sessionId: 's1',
      segmentId: 'g1',
      first_segment: { segment_type: 'break' },
      gps_in: null,
      captured_at: '2026-08-06T06:58:00Z',
      status: 'pending',
    });
    expect(session.payload.clock_in).toBe('2026-08-06T06:58:00Z');
  });

  it('A-15b (unit) · the same holds for a daily log', () => {
    const entry = buildDailyLogEntry({
      entryId: 'e1',
      logId: 'l1',
      projectId: 'p1',
      fields: { log_date: '2026-08-06', work_performed: 'x' },
      captured_at: '2026-08-06T16:41:00Z',
    });
    expect(entry.captured_at).toBe('2026-08-06T16:41:00Z');
    expect(entry.op).toBe('insert');
  });

  it('A-16c · a full offline shift is THREE entries against TWO rows', async () => {
    const clockIn = buildClockInEntries({
      sessionEntryId: 'e-sess',
      segmentEntryId: 'e-seg',
      sessionId: 'row-sess',
      segmentId: 'row-seg',
      first_segment: { segment_type: 'work', project_id: 'p1' },
      gps_in: null,
      captured_at: '2026-08-06T07:00:00Z',
      status: 'pending',
    });
    for (const e of clockIn) await queue.enqueue(e);

    const clockOut = buildClockOutEntries({
      segmentEntryId: 'e-seg-end',
      sessionUpdateEntryId: 'e-sess-out',
      sessionId: 'row-sess',
      segmentId: 'row-seg',
      end: { segment_id: 'row-seg', segment_type: 'work', note: 'framing' },
      gps_out: null,
      captured_at: '2026-08-06T15:00:00Z',
      sessionInsertEntryId: 'e-sess',
      base_session_updated_at: null,
      base_segment_updated_at: null,
    });
    for (const e of clockOut) await queue.enqueue(e);

    const all = await queue.all();
    // THREE entries: the segment's end COALESCED into its queued insert
    // (still one segment entry), the session has an insert AND an update.
    expect(all).toHaveLength(3);

    const sessionEntries = all.filter((e) => e.target_id === 'row-sess');
    expect(sessionEntries).toHaveLength(2);
    expect(sessionEntries.map((e) => e.op).sort()).toEqual(['insert', 'update']);
    // Shared target_id, DIFFERENT entry_ids — the old flat shape collided here
    // and the clock-out silently replaced the insert.
    expect(new Set(sessionEntries.map((e) => e.entry_id)).size).toBe(2);

    // §5.5.1 — clock_out NEVER folds into the session insert.
    const sessionInsert = sessionEntries.find((e) => e.op === 'insert')!;
    expect(sessionInsert.payload).not.toHaveProperty('clock_out');

    // The segment: ONE entry, still an insert, now carrying its end and note.
    const segmentEntries = all.filter((e) => e.target_id === 'row-seg');
    expect(segmentEntries).toHaveLength(1);
    expect(segmentEntries[0].op).toBe('insert');
    expect(segmentEntries[0].payload.segment_end).toBe('2026-08-06T15:00:00Z');
    expect(segmentEntries[0].payload.note).toBe('framing');
  });

  it('the replay order is seq: session insert → segment → session update', async () => {
    const clockIn = buildClockInEntries({
      sessionEntryId: 'e-sess',
      segmentEntryId: 'e-seg',
      sessionId: 'row-sess',
      segmentId: 'row-seg',
      first_segment: { segment_type: 'work', project_id: 'p1' },
      gps_in: null,
      captured_at: '2026-08-06T07:00:00Z',
      status: 'pending',
    });
    for (const e of clockIn) await queue.enqueue(e);
    const clockOut = buildClockOutEntries({
      segmentEntryId: 'x1',
      sessionUpdateEntryId: 'e-out',
      sessionId: 'row-sess',
      segmentId: 'row-seg',
      end: { segment_id: 'row-seg', segment_type: 'work', note: 'n' },
      gps_out: null,
      captured_at: '2026-08-06T15:00:00Z',
      sessionInsertEntryId: 'e-sess',
      base_session_updated_at: null,
      base_segment_updated_at: null,
    });
    for (const e of clockOut) await queue.enqueue(e);

    const exec = fakeExec();
    const events = await syncOnce(queue, exec, online);
    const order = events.map((e) => `${e.entry.entity}:${e.entry.op}`);
    expect(order).toEqual([
      'time_clock_session:insert',
      'time_segment:insert',
      'time_clock_session:update',
    ]);
    expect(await queue.queuedCount()).toBe(0);
  });
});

describe('§5.2.4 — dependency gating', () => {
  it('A-16d · a child whose parent has NOT succeeded is not attempted', async () => {
    await queue.enqueue({
      entry_id: 'parent',
      target_id: 'row-a',
      op: 'insert',
      entity: 'time_clock_session',
      payload: { id: 'row-a' },
      captured_at: 't',
    });
    await queue.enqueue({
      entry_id: 'child',
      target_id: 'row-b',
      op: 'insert',
      entity: 'time_segment',
      payload: { id: 'row-b' },
      captured_at: 't',
      depends_on: 'parent',
    });

    // The parent FAILS — the child must not be attempted and must not burn a
    // retry failing against owns_open_session on its own.
    const exec = fakeExec({
      insert: async (e) => {
        if (e.entry_id === 'parent') throw new Error('boom');
        return { updated_at: null };
      },
    });
    const events = await syncOnce(queue, exec, online);

    expect(events.map((e) => e.entry.entry_id)).toEqual(['parent']);
    const child = (await queue.all()).find((e) => e.entry_id === 'child')!;
    expect(child.attempts).toBe(0); // never attempted
    expect(child.last_error).toBeNull();
  });

  it('a success in the same pass unlocks its dependents', async () => {
    await queue.enqueue({
      entry_id: 'parent',
      target_id: 'row-a',
      op: 'insert',
      entity: 'time_clock_session',
      payload: { id: 'row-a' },
      captured_at: 't',
    });
    await queue.enqueue({
      entry_id: 'child',
      target_id: 'row-b',
      op: 'insert',
      entity: 'time_segment',
      payload: { id: 'row-b' },
      captured_at: 't',
      depends_on: 'parent',
    });

    const events = await syncOnce(queue, fakeExec(), online);
    expect(events.filter((e) => e.outcome === 'succeeded')).toHaveLength(2);
  });
});

describe('§5.6 — conflict detection', () => {
  const queuedUpdate = (base: string | null): Parameters<OfflineQueue['enqueue']>[0] => ({
    entry_id: 'u1',
    target_id: 'log-1',
    op: 'update',
    entity: 'daily_log',
    payload: { work_performed: 'offline edit', project_id: 'p1' },
    captured_at: '2026-08-06T09:00:00Z',
    base_updated_at: base,
  });

  it('A-19b2 · detection is on base_updated_at — a LATER captured_at is still a conflict', async () => {
    // The 08:00/08:30/09:00 walk: loaded at 08:00, desktop edited at 08:30,
    // phone edited at 09:00. captured_at (09:00) > server (08:30), which the
    // unsound rule read as "no conflict" — and destroyed the desktop edit.
    await queue.enqueue(queuedUpdate('2026-08-06T08:00:00Z'));
    const exec = fakeExec({ readUpdatedAt: async () => '2026-08-06T08:30:00Z' });

    const events = await syncOnce(queue, exec, online);
    expect(events[0].outcome).toBe('conflicted');
    expect(exec.calls.update).toHaveLength(0); // the server version stands
    expect(exec.calls.conflicts).toHaveLength(1);
  });

  it('no conflict when the server still holds what the client loaded', async () => {
    await queue.enqueue(queuedUpdate('2026-08-06T08:00:00Z'));
    const exec = fakeExec({ readUpdatedAt: async () => '2026-08-06T08:00:00Z' });
    const events = await syncOnce(queue, exec, online);
    expect(events[0].outcome).toBe('succeeded');
    expect(exec.calls.update).toHaveLength(1);
  });

  it('A-19b3 · a BACKWARDS-moving updated_at is also a conflict — IS DISTINCT FROM, not >', async () => {
    // A restore, clock skew between writers, a manual correction: the basis is
    // invalid regardless of direction, and these are exactly the cases where a
    // blind overwrite does the most damage.
    await queue.enqueue(queuedUpdate('2026-08-06T08:00:00Z'));
    const exec = fakeExec({ readUpdatedAt: async () => '2026-08-06T07:15:00Z' });
    const events = await syncOnce(queue, exec, online);
    expect(events[0].outcome).toBe('conflicted');
  });

  it('A-19b4 · a second offline edit coalesces WITHOUT advancing the base', async () => {
    await queue.enqueue(queuedUpdate('2026-08-06T08:00:00Z'));
    // Second edit, later capture — same row.
    await queue.enqueue({
      ...queuedUpdate('SHOULD-BE-IGNORED'),
      entry_id: 'u2',
      payload: { work_performed: 'second offline edit', project_id: 'p1' },
      captured_at: '2026-08-06T09:30:00Z',
    });

    const all = await queue.all();
    expect(all).toHaveLength(1); // coalesced
    expect(all[0].payload.work_performed).toBe('second offline edit');
    expect(all[0].captured_at).toBe('2026-08-06T09:30:00Z'); // advanced
    expect(all[0].base_updated_at).toBe('2026-08-06T08:00:00Z'); // DID NOT advance
  });

  it('A-19f (engine half) · an op:insert entry NEVER takes the conflict path', async () => {
    await queue.enqueue({
      entry_id: 'i1',
      target_id: 'log-9',
      op: 'insert',
      entity: 'daily_log',
      payload: { id: 'log-9', project_id: 'p1' },
      captured_at: 't',
    });
    // Even with a reader that would scream "distinct" — it is never consulted.
    let readCalls = 0;
    const exec = fakeExec({
      readUpdatedAt: async () => {
        readCalls += 1;
        return 'anything';
      },
    });
    const events = await syncOnce(queue, exec, online);
    expect(events[0].outcome).toBe('succeeded');
    expect(readCalls).toBe(0);
    expect(exec.calls.conflicts).toHaveLength(0);
  });

  it('A-19c / A-19d · the conflicted copy survives, out of the queue and the count', async () => {
    await queue.enqueue(queuedUpdate('2026-08-06T08:00:00Z'));
    await queue.enqueue({
      entry_id: 'other',
      target_id: 'row-x',
      op: 'insert',
      entity: 'daily_log',
      payload: { id: 'row-x' },
      captured_at: 't',
    });

    const exec = fakeExec({
      readUpdatedAt: async () => '2026-08-06T08:30:00Z',
      insert: async () => ({ updated_at: null }),
    });
    await syncOnce(queue, exec, online);

    // A-19c — payload and captured_at survive the rejection.
    const held = (await queue.all()).find((e) => e.entry_id === 'u1')!;
    expect(held.state).toBe('conflicted');
    expect(held.payload.work_performed).toBe('offline edit');
    expect(held.captured_at).toBe('2026-08-06T09:00:00Z');

    // A-19d — it left the queue: not counted, and a second pass never touches
    // it again.
    expect(await queue.queuedCount()).toBe(0);
    const secondPass = await syncOnce(queue, exec, online);
    expect(secondPass).toHaveLength(0);
  });

  it('A-19h · the entry is NEVER removed before its sync_conflicts row is durably written', async () => {
    await queue.enqueue(queuedUpdate('2026-08-06T08:00:00Z'));
    const exec = fakeExec({
      readUpdatedAt: async () => '2026-08-06T08:30:00Z',
      recordConflict: async () => {
        throw new Error('conflict insert refused');
      },
    });
    const events = await syncOnce(queue, exec, online);

    // The conflict COULD NOT be recorded, so it has not been handled: the
    // entry stays queued and retryable — the conflict path never became a
    // data-loss path.
    expect(events[0].outcome).toBe('failed');
    const entry = (await queue.all()).find((e) => e.entry_id === 'u1')!;
    expect(entry.state).toBe('queued');
    expect(await queue.queuedCount()).toBe(1);
  });
});

describe('§5.2.6/.7 — failure visibility and the pill', () => {
  it('A-17 (unit) · a permanently failing entry stays with its error visible', async () => {
    await queue.enqueue({
      entry_id: 'f1',
      target_id: 'r1',
      op: 'insert',
      entity: 'daily_log',
      payload: { id: 'r1' },
      captured_at: 't',
    });
    const exec = fakeExec({
      insert: async () => {
        throw new Error('violates row-level security');
      },
    });

    for (let i = 0; i < 3; i++) await syncOnce(queue, exec, online);

    const entry = (await queue.all()).find((e) => e.entry_id === 'f1')!;
    expect(entry.state).toBe('queued'); // never silently discarded
    expect(entry.attempts).toBe(3);
    expect(entry.last_error).toContain('row-level security');
  });

  it('A-17b · "Try again" is an immediate syncOnce — no waiting on backoff', async () => {
    await queue.enqueue({
      entry_id: 'f1',
      target_id: 'r1',
      op: 'insert',
      entity: 'daily_log',
      payload: { id: 'r1' },
      captured_at: 't',
    });
    let failNext = true;
    const exec = fakeExec({
      insert: async () => {
        if (failNext) throw new Error('transient');
        return { updated_at: null };
      },
    });

    await syncOnce(queue, exec, online); // fails
    failNext = false;
    // The retry hook is literally another syncOnce call — nothing gates it on
    // an interval, which is the assertion.
    const events = await syncOnce(queue, exec, online);
    expect(events[0].outcome).toBe('succeeded');
    expect(await queue.queuedCount()).toBe(0);
  });

  it('A-18 (unit) · the pill counts queued only — conflicted entries are excluded', async () => {
    await queue.enqueue({
      entry_id: 'q1',
      target_id: 'r1',
      op: 'insert',
      entity: 'photo',
      payload: { id: 'r1' },
      captured_at: 't',
    });
    await queue.enqueue({
      entry_id: 'u1',
      target_id: 'r2',
      op: 'update',
      entity: 'daily_log',
      payload: {},
      captured_at: 't',
      base_updated_at: 'a',
    });
    expect(await queue.queuedCount()).toBe(2);

    await queue.markConflicted('u1', 'held');
    expect(await queue.queuedCount()).toBe(1); // the conflicted one left the count
  });

  it('offline: syncOnce attempts nothing at all', async () => {
    await queue.enqueue({
      entry_id: 'q1',
      target_id: 'r1',
      op: 'insert',
      entity: 'daily_log',
      payload: { id: 'r1' },
      captured_at: 't',
    });
    const exec = fakeExec();
    const events = await syncOnce(queue, exec, () => false);
    expect(events).toHaveLength(0);
    expect(exec.calls.insert).toHaveLength(0);
  });
});

describe('the offline shift end-to-end through the engine', () => {
  it('A-16b (engine half) · replay lands session → segment → clock-out with the segment inside the open window', async () => {
    // The full offline shift, replayed against executors that enforce the DB
    // fact the order exists for: a segment insert against a closed session
    // throws, exactly as owns_open_session would.
    const rows = new Map<string, Record<string, unknown>>();
    const exec = fakeExec({
      insert: async (e) => {
        if (e.entity === 'time_segment') {
          const session = rows.get(e.payload.session_id as string);
          if (!session) throw new Error('owns_open_session: no session');
          if (session.clock_out) throw new Error('owns_open_session: session closed');
        }
        rows.set(e.target_id, { ...e.payload });
        return { updated_at: `server-${e.target_id}` };
      },
      update: async (e) => {
        rows.set(e.target_id, { ...rows.get(e.target_id), ...e.payload });
      },
      readUpdatedAt: async (e) => {
        // After its own insert replayed, the row's updated_at is what the
        // engine re-based the entry on — the comparison must find them equal.
        return rows.has(e.target_id) ? `server-${e.target_id}` : null;
      },
    });

    for (const e of buildClockInEntries({
      sessionEntryId: 'e-sess',
      segmentEntryId: 'e-seg',
      sessionId: 'row-sess',
      segmentId: 'row-seg',
      first_segment: { segment_type: 'work', project_id: 'p1' },
      gps_in: null,
      captured_at: '2026-08-06T07:00:00Z',
      status: 'pending',
    }))
      await queue.enqueue(e);
    for (const e of buildClockOutEntries({
      segmentEntryId: 'e-end',
      sessionUpdateEntryId: 'e-out',
      sessionId: 'row-sess',
      segmentId: 'row-seg',
      end: { segment_id: 'row-seg', segment_type: 'work', note: 'set trusses' },
      gps_out: null,
      captured_at: '2026-08-06T15:00:00Z',
      sessionInsertEntryId: 'e-sess',
      base_session_updated_at: null,
      base_segment_updated_at: null,
    }))
      await queue.enqueue(e);

    const events = await syncOnce(queue, exec, online);
    expect(events.every((e: SyncEvent) => e.outcome === 'succeeded')).toBe(true);
    expect(await queue.queuedCount()).toBe(0);

    const session = rows.get('row-sess')!;
    expect(session.clock_in).toBe('2026-08-06T07:00:00Z'); // A-15 — the capture time
    expect(session.clock_out).toBe('2026-08-06T15:00:00Z');
    const segment = rows.get('row-seg')!;
    expect(segment.note).toBe('set trusses');
    expect(segment.segment_end).toBe('2026-08-06T15:00:00Z');
  });
});
