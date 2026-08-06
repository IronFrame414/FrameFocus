import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { OfflineQueue, MemoryStorage } from '@/lib/offline/queue';
import { syncOnce } from '@/lib/offline/sync';
import { makeExecutors } from '@/lib/offline/executors';
import { buildClockInEntries, buildClockOutEntries, buildDailyLogEntry } from '@/lib/offline/capture';

// M6M §5 — the [live] offline criteria, against rebuild-test. §10a names this
// file. THE ENGINE UNDER TEST IS THE REAL ONE: the same OfflineQueue, syncOnce
// and makeExecutors the browser runs, driven here with a real member JWT so
// RLS, the CHECKs and the column-scope triggers all bind.
//
// Asserted here:
//   A-15    an offline clock-in captured at T stores T in clock_in
//   A-15b   the same rule for a queued daily log
//   A-16    replaying one entry three times -> exactly one row per target_id
//   A-16b   a full offline shift replays with its segments ATTACHED
//   A-19b   the 08:00/08:30/09:00 sequence conflicts; the server row is
//           byte-identical before and after
//   A-19f   an op:'insert' entry is never a conflict
//   A-19g   the held copy survives total client-side loss (it is server-side)
//   A-19i   sync_conflicts is Owner/Admin-read only — including vs the author
//   A-19j   the author can INSERT but not read back; no .select() chained
//   A-19k   no role can DELETE a sync_conflicts row
//   A-19l   server_updated_at is stored; NO server-body snapshot exists
//   §5.5.2  a second open offline session collides on the partial unique
//           index and surfaces as a retryable failure — never a silent drop
//   M5      (20260826000000) a session-update conflict is recordable —
//           target_table 'time_clock_sessions' passes the widened CHECK
//
// IDENTITY: the FOREMAN — the crew identity is m-hubs.spec.ts's, and one open
// session per member is a partial unique index.

const FOREMAN_EMAIL = 'josh+qa-foreman@worthprop.com';
const FOREMAN_MEMBER = '61e04e04-4c9f-4113-a8e1-85057d6bff50';
const OWNER_EMAIL = 'josh+test50@worthprop.com';
const COMPANY_A = '03bb903f-1084-4ab4-afb8-03192cb58d30';
/** A project the foreman is assigned to on rebuild-test (crew fixture project 'test'). */
let PROJECT_ID = '';

let foreman: SupabaseClient;
const createdSessions: string[] = [];
const createdLogs: string[] = [];
const createdConflicts: string[] = [];

function noPhotos() {
  return {
    uploadPhoto: async () => ({ success: false, error: 'no photo path in this harness' }),
  };
}

beforeAll(async () => {
  assertRebuildTest();
  foreman = await sessionFor(FOREMAN_EMAIL);

  // A project the foreman can see: their first assignment.
  const { data: assignment } = await admin
    .from('project_assignments')
    .select('project_id')
    .eq('member_id', FOREMAN_MEMBER)
    .eq('is_deleted', false)
    .limit(1)
    .single();
  if (!assignment) throw new Error('foreman has no project assignment on rebuild-test');
  PROJECT_ID = assignment.project_id;

  // A clean slate: no open foreman session.
  const { data: open } = await admin
    .from('time_clock_sessions')
    .select('id')
    .eq('member_id', FOREMAN_MEMBER)
    .is('clock_out', null);
  for (const s of open ?? []) {
    await admin.from('time_segments').delete().eq('session_id', s.id);
    await admin.from('time_clock_sessions').delete().eq('id', s.id);
  }
}, 240_000);

afterAll(async () => {
  for (const id of createdSessions) {
    await admin.from('time_segments').delete().eq('session_id', id);
    await admin.from('time_clock_sessions').delete().eq('id', id);
  }
  for (const id of createdLogs) {
    await admin.from('daily_log_crew').delete().eq('daily_log_id', id);
    await admin.from('daily_log_sub_entries').delete().eq('daily_log_id', id);
    await admin.from('daily_logs').delete().eq('id', id);
  }
  // DELETE policies do not bind the service role — cleanup only.
  for (const id of createdConflicts) {
    await admin.from('sync_conflicts').delete().eq('id', id);
  }
}, 240_000);

const online = () => true;

function shiftEntries(ids: {
  sessionId: string;
  segmentId: string;
  capturedIn: string;
  capturedOut: string;
}) {
  const clockIn = buildClockInEntries({
    sessionEntryId: `e-sess-${ids.sessionId}`,
    segmentEntryId: `e-seg-${ids.segmentId}`,
    sessionId: ids.sessionId,
    segmentId: ids.segmentId,
    first_segment: { segment_type: 'work', project_id: PROJECT_ID },
    gps_in: { reason: 'position_unavailable', error_code: 2 },
    captured_at: ids.capturedIn,
    status: 'pending',
  });
  const clockOut = buildClockOutEntries({
    segmentEntryId: `e-end-${ids.segmentId}`,
    sessionUpdateEntryId: `e-out-${ids.sessionId}`,
    sessionId: ids.sessionId,
    segmentId: ids.segmentId,
    end: { segment_id: ids.segmentId, segment_type: 'work', note: 'offline harness shift' },
    gps_out: null,
    captured_at: ids.capturedOut,
    sessionInsertEntryId: `e-sess-${ids.sessionId}`,
    base_session_updated_at: null,
    base_segment_updated_at: null,
  });
  return [...clockIn, ...clockOut];
}

describe('replay — the offline shift against real RLS', () => {
  it('A-15 / A-16b · a shift captured offline at 06:58 lands as a 06:58 shift, segments attached', async () => {
    const sessionId = crypto.randomUUID();
    const segmentId = crypto.randomUUID();
    createdSessions.push(sessionId);

    // "Captured" hours ago; synced now. The business timestamps must survive.
    const capturedIn = new Date(Date.now() - 5 * 3600_000).toISOString();
    const capturedOut = new Date(Date.now() - 1 * 3600_000).toISOString();

    const queue = new OfflineQueue(new MemoryStorage());
    for (const e of shiftEntries({ sessionId, segmentId, capturedIn, capturedOut })) {
      await queue.enqueue(e);
    }

    const exec = makeExecutors(foreman, noPhotos());
    const events = await syncOnce(queue, exec, online);

    expect(
      events.map((e) => e.outcome),
      JSON.stringify(events.map((e) => ({ o: e.outcome, err: e.error })))
    ).toEqual(['succeeded', 'succeeded', 'succeeded']);
    expect(await queue.queuedCount()).toBe(0);

    // A-15 — clock_in is the CAPTURE time, not the sync time.
    const { data: session } = await admin
      .from('time_clock_sessions')
      .select('clock_in, clock_out, gps_in')
      .eq('id', sessionId)
      .single();
    expect(new Date(session!.clock_in).toISOString()).toBe(capturedIn);
    expect(new Date(session!.clock_out!).toISOString()).toBe(capturedOut);

    // A-16b — the segment ATTACHED: not rejected by owns_open_session, because
    // the replay order kept the session open until the segments were in.
    const { data: segs } = await admin
      .from('time_segments')
      .select('id, project_id, note, segment_end')
      .eq('session_id', sessionId);
    expect(segs).toHaveLength(1);
    expect(segs![0].id).toBe(segmentId);
    expect(segs![0].project_id).toBe(PROJECT_ID);
    expect(segs![0].note).toBe('offline harness shift');
  }, 120_000);

  it('A-16 · replaying the same queued entries three times produces exactly one row per target_id', async () => {
    const sessionId = crypto.randomUUID();
    const segmentId = crypto.randomUUID();
    createdSessions.push(sessionId);

    const capturedIn = new Date(Date.now() - 4 * 3600_000).toISOString();
    const capturedOut = new Date(Date.now() - 2 * 3600_000).toISOString();
    const entries = shiftEntries({ sessionId, segmentId, capturedIn, capturedOut });
    const exec = makeExecutors(foreman, noPhotos());

    // Three replays of the SAME captured mutations — three fresh queues, as a
    // crashed-and-restarted client would re-run them.
    for (let i = 0; i < 3; i++) {
      const queue = new OfflineQueue(new MemoryStorage());
      for (const e of entries) await queue.enqueue(e);
      await syncOnce(queue, exec, online);
    }

    const { count: sessionCount } = await admin
      .from('time_clock_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('id', sessionId);
    const { count: segmentCount } = await admin
      .from('time_segments')
      .select('id', { count: 'exact', head: true })
      .eq('id', segmentId);
    expect(sessionCount).toBe(1);
    expect(segmentCount).toBe(1);
  }, 120_000);
});

describe('conflict — the server version stands (D-17)', () => {
  /** Creates a log as the foreman, returns its id + loaded updated_at. */
  async function makeLog(): Promise<{ id: string; loadedUpdatedAt: string }> {
    const id = crypto.randomUUID();
    createdLogs.push(id);
    const { error } = await foreman.from('daily_logs').insert({
      id,
      project_id: PROJECT_ID,
      log_date: new Date().toISOString().slice(0, 10),
      work_performed: 'original body',
      hazards_present: false,
    } as never);
    expect(error, error?.message).toBeNull();
    const { data } = await foreman
      .from('daily_logs')
      .select('updated_at')
      .eq('id', id)
      .single();
    return { id, loadedUpdatedAt: data!.updated_at as string };
  }

  it('A-19b / A-19g / A-19l · the 08:00/08:30/09:00 sequence conflicts; the row is byte-identical; the copy survives server-side', async () => {
    // 08:00 — the phone loads the log.
    const log = await makeLog();

    // 08:30 — desktop edits it. (Server-side write; updated_at advances.)
    await admin
      .from('daily_logs')
      .update({ work_performed: 'DESKTOP EDIT — must survive' })
      .eq('id', log.id);
    const { data: serverBefore } = await admin
      .from('daily_logs')
      .select('*')
      .eq('id', log.id)
      .single();

    // 09:00 — the phone edits its stale copy. captured_at is LATER than the
    // desktop edit, which is exactly the timing the unsound rule waved
    // through.
    const queue = new OfflineQueue(new MemoryStorage());
    await queue.enqueue({
      entry_id: crypto.randomUUID(),
      target_id: log.id,
      op: 'update',
      entity: 'daily_log',
      payload: { work_performed: 'phone edit of a stale copy', project_id: PROJECT_ID },
      captured_at: new Date().toISOString(),
      base_updated_at: log.loadedUpdatedAt, // what the phone LOADED at 08:00
    });

    const exec = makeExecutors(foreman, noPhotos());
    const events = await syncOnce(queue, exec, online);

    // Rejected as conflicted...
    expect(events[0].outcome).toBe('conflicted');

    // ...and the server row is BYTE-IDENTICAL before and after.
    const { data: serverAfter } = await admin
      .from('daily_logs')
      .select('*')
      .eq('id', log.id)
      .single();
    expect(serverAfter).toEqual(serverBefore);

    // A-19g — the held copy is SERVER-SIDE. The queue object going out of
    // scope here IS the cleared client; the copy is still retrievable.
    const { data: held } = await admin
      .from('sync_conflicts')
      .select('id, rejected_body, captured_at, author_member_id, server_updated_at, status')
      .eq('target_row_id', log.id)
      .single();
    expect(held).toBeTruthy();
    createdConflicts.push(held!.id);
    expect((held!.rejected_body as { work_performed: string }).work_performed).toBe(
      'phone edit of a stale copy'
    );
    expect(held!.author_member_id).toBe(FOREMAN_MEMBER);
    expect(held!.status).toBe('pending');

    // A-19l — server_updated_at records the race (the value that lost)...
    expect(new Date(held!.server_updated_at).toISOString()).toBe(
      new Date(serverBefore!.updated_at as string).toISOString()
    );
    // ...and NO snapshot of the server row body exists to go stale. Asserted
    // against the table's real column list, so a well-meaning added column
    // fails here.
    const { data: cols } = await admin
      .from('sync_conflicts')
      .select('*')
      .eq('id', held!.id)
      .single();
    const names = Object.keys(cols as Record<string, unknown>);
    expect(names).not.toContain('server_body');
    expect(names).not.toContain('server_snapshot');
    expect(names).not.toContain('server_row');
  }, 120_000);

  it('A-19f · an op:insert entry is NEVER a conflict, however long queued', async () => {
    const id = crypto.randomUUID();
    createdLogs.push(id);

    const queue = new OfflineQueue(new MemoryStorage());
    await queue.enqueue(
      buildDailyLogEntry({
        entryId: crypto.randomUUID(),
        logId: id,
        projectId: PROJECT_ID,
        fields: {
          log_date: new Date().toISOString().slice(0, 10),
          work_performed: 'queued for a week, still an insert',
          hazards_present: false,
        },
        // A-15b — captured days ago; the log_date above is the business fact.
        captured_at: new Date(Date.now() - 7 * 86400_000).toISOString(),
      })
    );

    const exec = makeExecutors(foreman, noPhotos());
    const events = await syncOnce(queue, exec, online);
    expect(events[0].outcome).toBe('succeeded');

    const { data } = await admin.from('daily_logs').select('id').eq('id', id).single();
    expect(data).toBeTruthy();
  }, 120_000);
});

describe('sync_conflicts RLS — the D-17 floor', () => {
  let conflictId = '';

  beforeAll(async () => {
    // A conflict row authored by the foreman, written the way the engine
    // writes it (no .select()).
    const { error } = await foreman.from('sync_conflicts').insert({
      target_table: 'daily_logs',
      target_row_id: crypto.randomUUID(),
      project_id: PROJECT_ID,
      rejected_body: { work_performed: 'rls fixture' },
      captured_at: new Date().toISOString(),
      author_member_id: FOREMAN_MEMBER,
      server_updated_at: new Date().toISOString(),
    } as never);
    expect(error, error?.message).toBeNull();

    const { data } = await admin
      .from('sync_conflicts')
      .select('id')
      .eq('author_member_id', FOREMAN_MEMBER)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    conflictId = data!.id;
    createdConflicts.push(conflictId);
  }, 120_000);

  it('A-19j · the author can INSERT but cannot read the row back — and .select() would poison the write', async () => {
    // The insert above succeeded WITHOUT a returning read. Reading it back as
    // the author yields nothing:
    const { data: mine } = await foreman.from('sync_conflicts').select('id').eq('id', conflictId);
    expect(mine ?? []).toHaveLength(0);

    // The trap itself, demonstrated: the SAME insert with .select() chained
    // FAILS OUTRIGHT. ⚠️ CORRECTED [S105, observed on rebuild-test]: the
    // spec's first description said the write lands and only LOOKS failed.
    // In fact Postgres refuses INSERT … RETURNING when the new row fails the
    // SELECT policy, and the WHOLE STATEMENT ROLLS BACK — the chained
    // .select() does not hide a success, it DESTROYS the write. Same rule,
    // stronger reason: the engine must never chain one.
    const { error: poisoned } = await foreman
      .from('sync_conflicts')
      .insert({
        target_table: 'daily_logs',
        target_row_id: crypto.randomUUID(),
        project_id: PROJECT_ID,
        rejected_body: { work_performed: 'select-chained' },
        captured_at: new Date().toISOString(),
        author_member_id: FOREMAN_MEMBER,
        server_updated_at: new Date().toISOString(),
      } as never)
      .select('id')
      .single();
    expect(poisoned).toBeTruthy();

    // ...and the write did NOT land — the rollback is total:
    const { data: landed } = await admin
      .from('sync_conflicts')
      .select('id')
      .eq('author_member_id', FOREMAN_MEMBER)
      .contains('rejected_body', { work_performed: 'select-chained' });
    expect(landed ?? []).toHaveLength(0);
  }, 120_000);

  it('A-19i · Owner reads it; the author and other non-admin roles do not', async () => {
    const owner = await sessionFor(OWNER_EMAIL);
    const { data: asOwner } = await owner.from('sync_conflicts').select('id').eq('id', conflictId);
    expect(asOwner).toHaveLength(1);

    const crew = await sessionFor('josh+crew@worthprop.com');
    const { data: asCrew } = await crew.from('sync_conflicts').select('id').eq('id', conflictId);
    expect(asCrew ?? []).toHaveLength(0);

    const pm = await sessionFor('josh+pm@worthprop.com');
    const { data: asPm } = await pm.from('sync_conflicts').select('id').eq('id', conflictId);
    expect(asPm ?? []).toHaveLength(0);
  }, 120_000);

  it('A-19k · no role can DELETE — owner included; resolution is an UPDATE that keeps the row', async () => {
    const owner = await sessionFor(OWNER_EMAIL);

    // DELETE: no policy exists, so zero rows are affected for every role.
    await owner.from('sync_conflicts').delete().eq('id', conflictId);
    const { data: stillThere } = await admin
      .from('sync_conflicts')
      .select('id, status')
      .eq('id', conflictId)
      .single();
    expect(stillThere).toBeTruthy();

    // Resolving is an UPDATE — and the row is RETAINED with its resolution.
    const { error: resolveErr } = await owner
      .from('sync_conflicts')
      .update({
        status: 'kept_server',
        resolved_at: new Date().toISOString(),
      } as never)
      .eq('id', conflictId);
    expect(resolveErr, resolveErr?.message).toBeNull();

    const { data: resolved } = await admin
      .from('sync_conflicts')
      .select('status')
      .eq('id', conflictId)
      .single();
    expect(resolved!.status).toBe('kept_server');
  }, 120_000);
});

describe('§5.5.2 — two open offline sessions collide on the partial unique index', () => {
  it('the second surfaces as a retryable failure with its error — never a silent drop, never a conflict', async () => {
    const sessionA = crypto.randomUUID();
    const segA = crypto.randomUUID();
    const sessionB = crypto.randomUUID();
    const segB = crypto.randomUUID();
    createdSessions.push(sessionA, sessionB);

    // Two GENUINELY different shifts, both left open — upsert-on-pk makes a
    // replay safe, but nothing can make these both true: one open session per
    // member is idx_time_clock_sessions_one_open_per_member.
    const queue = new OfflineQueue(new MemoryStorage());
    for (const e of buildClockInEntries({
      sessionEntryId: `col-a-sess`,
      segmentEntryId: `col-a-seg`,
      sessionId: sessionA,
      segmentId: segA,
      first_segment: { segment_type: 'work', project_id: PROJECT_ID },
      gps_in: null,
      captured_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
      status: 'pending',
    }))
      await queue.enqueue(e);
    for (const e of buildClockInEntries({
      sessionEntryId: `col-b-sess`,
      segmentEntryId: `col-b-seg`,
      sessionId: sessionB,
      segmentId: segB,
      first_segment: { segment_type: 'shop', project_id: null },
      gps_in: null,
      captured_at: new Date(Date.now() - 1 * 3600_000).toISOString(),
      status: 'pending',
    }))
      await queue.enqueue(e);

    const exec = makeExecutors(foreman, noPhotos());
    const events = await syncOnce(queue, exec, online);

    // The first shift landed whole…
    const { count: aCount } = await admin
      .from('time_clock_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('id', sessionA);
    expect(aCount).toBe(1);

    // …the second FAILED on the index, visibly (§5.2.6): outcome 'failed'
    // with the unique-violation named, NOT 'conflicted' — nothing here targets
    // an existing row, so D-17 does not apply.
    const failed = events.find((ev) => ev.entry.target_id === sessionB);
    expect(failed?.outcome, JSON.stringify(events.map((e) => ({ o: e.outcome, err: e.error })))).toBe(
      'failed'
    );
    expect(failed?.error ?? '').toMatch(/duplicate key|one_open_per_member/i);

    // The entry STAYS queued and retryable — the Needs attention path, never a
    // silent drop; its gated segment was not attempted and stays queued too.
    const remaining = await queue.all();
    const bSession = remaining.find((e) => e.target_id === sessionB);
    expect(bSession).toBeTruthy();
    expect(bSession!.state).toBe('queued');
    expect(bSession!.attempts).toBe(1);
    expect(bSession!.last_error).toBeTruthy();
    expect(remaining.find((e) => e.target_id === segB)?.attempts).toBe(0);

    // And no sync_conflicts row — this is a failure, not a D-17 conflict.
    const { data: none } = await admin
      .from('sync_conflicts')
      .select('id')
      .eq('target_row_id', sessionB);
    expect(none ?? []).toHaveLength(0);

    // Close session A so later tests can open sessions for this member. As
    // the FOREMAN, not the service role: the 6A column-scope trigger fires
    // for every writer, and the service role has no member/role identity —
    // its UPDATE dies on 'not authorized' while a self clock-out is allowed.
    const { error: closeErr } = await foreman
      .from('time_clock_sessions')
      .update({ clock_out: new Date().toISOString() } as never)
      .eq('id', sessionA);
    expect(closeErr, closeErr?.message).toBeNull();
  }, 120_000);
});

describe('migration 20260826000000 — a session-update conflict is RECORDABLE', () => {
  it('an offline clock-out invalidated by a supervisor edit conflicts and the copy is HELD, not retried forever', async () => {
    // An online-started shift, landed and OPEN.
    const sessionId = crypto.randomUUID();
    const segmentId = crypto.randomUUID();
    createdSessions.push(sessionId);
    const capturedIn = new Date(Date.now() - 2 * 3600_000).toISOString();
    const inQueue = new OfflineQueue(new MemoryStorage());
    for (const e of buildClockInEntries({
      sessionEntryId: `m5-sess`,
      segmentEntryId: `m5-seg`,
      sessionId,
      segmentId,
      first_segment: { segment_type: 'work', project_id: PROJECT_ID },
      gps_in: null,
      captured_at: capturedIn,
      status: 'pending',
    }))
      await inQueue.enqueue(e);
    const exec = makeExecutors(foreman, noPhotos());
    await syncOnce(inQueue, exec, online);

    // The phone loads both rows (§5.2.2 — the base is captured on the read
    // path), then goes offline.
    const { data: loadedSession } = await foreman
      .from('time_clock_sessions')
      .select('updated_at')
      .eq('id', sessionId)
      .single();
    const { data: loadedSegment } = await foreman
      .from('time_segments')
      .select('updated_at')
      .eq('id', segmentId)
      .single();

    // A supervisor corrects clock_in on desktop. Owner bypasses the 6A column
    // scope; the session row's updated_at advances past what the phone loaded.
    const owner = await sessionFor(OWNER_EMAIL);
    const { error: editErr } = await owner
      .from('time_clock_sessions')
      .update({ clock_in: new Date(new Date(capturedIn).getTime() + 60_000).toISOString() } as never)
      .eq('id', sessionId);
    expect(editErr, editErr?.message).toBeNull();

    // The offline clock-out replays. The segment update's base still matches
    // (the edit touched only the session) and lands; the session update
    // conflicts — and BEFORE migration 20260826000000 recordConflict died on
    // the target_table CHECK right here, leaving the entry retrying forever
    // against a condition no retry can clear.
    const outQueue = new OfflineQueue(new MemoryStorage());
    for (const e of buildClockOutEntries({
      segmentEntryId: crypto.randomUUID(),
      sessionUpdateEntryId: crypto.randomUUID(),
      sessionId,
      segmentId,
      end: { segment_id: segmentId, segment_type: 'work', note: 'm5 regression clock out' },
      gps_out: null,
      captured_at: new Date().toISOString(),
      sessionInsertEntryId: null,
      base_session_updated_at: loadedSession!.updated_at as string,
      base_segment_updated_at: loadedSegment!.updated_at as string,
    }))
      await outQueue.enqueue(e);
    const events = await syncOnce(outQueue, exec, online);

    const sessionEvent = events.find((ev) => ev.entry.target_id === sessionId);
    expect(
      sessionEvent?.outcome,
      JSON.stringify(events.map((e) => ({ o: e.outcome, err: e.error })))
    ).toBe('conflicted');

    // The copy is HELD server-side with the widened target_table…
    const { data: held } = await admin
      .from('sync_conflicts')
      .select('id, target_table, rejected_body, author_member_id, status')
      .eq('target_row_id', sessionId)
      .single();
    expect(held).toBeTruthy();
    createdConflicts.push(held!.id);
    expect(held!.target_table).toBe('time_clock_sessions');
    expect(held!.author_member_id).toBe(FOREMAN_MEMBER);
    expect(held!.status).toBe('pending');

    // …the entry LEFT the queue (out of the pill, no retries)…
    expect(await outQueue.queuedCount()).toBe(0);

    // …and the server version stands: the session is STILL OPEN. Close it for
    // the tests that follow.
    const { data: server } = await admin
      .from('time_clock_sessions')
      .select('clock_out')
      .eq('id', sessionId)
      .single();
    expect(server!.clock_out).toBeNull();
    await admin
      .from('time_clock_sessions')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', sessionId);
  }, 120_000);
});
