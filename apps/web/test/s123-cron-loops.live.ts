import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import {
  isBoundaryHour,
  zonedDayRangeUtc,
  zonedMinutesOfDay,
  zonedWeekday,
} from '@framefocus/shared/utils/notify-hours';
import { weekWindow } from '@framefocus/shared/utils/time-tracking';
import { runTimesheetsReady } from '@/lib/notify/crons/timesheets-ready';
import { runDailyLogMissing } from '@/lib/notify/crons/daily-log-missing';
import { runStillClockedIn } from '@/lib/notify/crons/still-clocked-in';

// ============================================================================
// COVERAGE PASS — the three notification crons, LOOP INCLUDED.
// Spec: §3h, §3i, §3j. No migration.
// ============================================================================
//
// ---------------------------------------------------------------------------
// WHAT WAS MISSING, AND WHY IT WAS MISSING
// ---------------------------------------------------------------------------
// Slices 8-10 tested each cron's DECISION — isBoundaryHour, zonedWeekday, the
// override predicate — as pure functions, and asserted the wiring by reading
// source text. Nothing executed the loop. The loop is where the recipient set
// is assembled and where the notification is actually written, so "the rule is
// right" and "the right people got a row" were two different claims and only
// the first one was tested.
//
// The blocker was the clock: a harness cannot wait until 07:00 on a Monday in
// America/New_York. The fix is the same seam the offline queue already uses —
// `makeExecutors(supabase, { uploadPhoto })` — with `now` injected instead.
//
// ---------------------------------------------------------------------------
// THE COMPANY'S SETTINGS ARE READ, NEVER WRITTEN
// ---------------------------------------------------------------------------
// The obvious way to test "fires at notify_hours_start" is to set
// notify_hours_start to the current hour. That mutates a shared row every other
// harness reads, and a crashed run leaves it mutated. Instead each test
// COMPUTES an instant that satisfies the company's REAL settings — which also
// means the assertions exercise whatever those settings actually are rather
// than a value the test chose to be convenient.
//
// ---------------------------------------------------------------------------
// EVERY TEST ASSERTS THE POSITIVE
// ---------------------------------------------------------------------------
// The failure mode here is a test that passes because nothing fired: an empty
// company set, a boundary that never matches, a recipient list that resolved to
// nobody. So each case asserts `fired > 0` AND names the profiles that must
// have received a row — never merely that no error was thrown. Each is paired
// with a wrong-hour run that must write nothing, so a loop that fires
// unconditionally fails too.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN_EMAIL = 'josh+qa-admin@worthprop.com';
const CREW = 'josh+crew@worthprop.com';

const TAG = 's123-cronloop';

type Co = {
  id: string;
  timezone: string | null;
  week_starts_on: number | null;
  notify_hours_start: string | null;
  notify_hours_end: string | null;
};

let company: Co;
let tz: string;
let projectId: string;
/** A SECOND project, so the day-window case is not polluted by the first test's fixture. */
let altProjectId: string;
let crewMemberId: string;
let crewProfileId: string;
let ownerProfileId: string;
let adminProfileId: string;

const madeNotifications: string[] = [];
/** Everything this file can write, for the run-window sweep in afterAll. */
const MY_TYPES = ['timesheet_ready', 'daily_log_missing', 'still_clocked_in'];
const runStart = new Date().toISOString();
const madeSessions: string[] = [];
const madeSegments: string[] = [];

/**
 * The next instant (searching forward from a fixed base) that is `weekday` at
 * `hour` in `timeZone`.
 *
 * Searches hour by hour rather than doing timezone arithmetic. 8 days is 192
 * candidates — trivially cheap, and it cannot get DST wrong, which hand-rolled
 * offset maths reliably does.
 */
function instantAt(timeZone: string, hour: number, weekday: number | null): Date {
  const base = Date.UTC(2026, 7, 9); // 2026-08-09, a Sunday
  for (let i = 0; i < 24 * 8; i++) {
    const d = new Date(base + i * 3_600_000);
    if (Math.floor(zonedMinutesOfDay(d, timeZone) / 60) !== hour) continue;
    if (weekday !== null && zonedWeekday(d, timeZone) !== weekday) continue;
    return d;
  }
  throw new Error(`no instant found for ${timeZone} hour=${hour} weekday=${weekday}`);
}

const hourOf = (clock: string | null, fallback: number) =>
  clock ? Number(clock.slice(0, 2)) : fallback;

/** Notification rows this run produced, registered for teardown. */
async function rowsOfType(type: string, since: string) {
  const { data } = await admin
    .from('notifications')
    .select('id, recipient_profile_id, type, title, body, link_key, link_params, project_id')
    .eq('company_id', company.id)
    .eq('type', type)
    .gte('created_at', since);
  for (const r of data ?? []) if (!madeNotifications.includes(r.id)) madeNotifications.push(r.id);
  return data ?? [];
}

/**
 * ⚠️ THE NEGATIVES USE THIS AND NOT `rowsOfType`, BECAUSE `since` WAS A LIE.
 * [S131 — pre-existing defect, unrelated to Rulings A and B]
 *
 * Every "writes nothing" test used to mint `const since = new Date()` in NODE
 * and then filter `.gte('created_at', since)` against a stamp Postgres wrote.
 * **Those are not the same clock.** Measured on this Codespace, five runs out
 * of five: a row inserted BEFORE `since` came back with a `created_at` 54-118ms
 * AFTER it, because the database clock runs about 110ms ahead. The three
 * negatives complete in 76-98ms, so the POSITIVE test's own notifications land
 * inside the next test's window and are counted as if the off-boundary run had
 * written them.
 *
 * It is the exact defect `components/chat/use-chat-thread.ts` documents at
 * length — "`since` IS A DATABASE TIMESTAMP. THE BROWSER NEVER MINTS ONE" —
 * and the reason `markThreadRead` needed migration 20260908000000.
 *
 * The fix removes the clock rather than widening the window: take the ids of
 * this type BEFORE the run and diff after. A tolerance would only move the
 * threshold at which it lies, and this is strictly stronger — it catches a new
 * row no matter when it was stamped.
 */
async function idsOfType(type: string): Promise<Set<string>> {
  const { data } = await admin
    .from('notifications')
    .select('id')
    .eq('company_id', company.id)
    .eq('type', type);
  return new Set((data ?? []).map((r) => r.id));
}

/** Rows of `type` that did not exist when `before` was taken. */
async function rowsAddedSince(type: string, before: Set<string>) {
  const { data } = await admin
    .from('notifications')
    .select('id, recipient_profile_id, type, title, body, link_key, link_params, project_id')
    .eq('company_id', company.id)
    .eq('type', type);
  const fresh = (data ?? []).filter((r) => !before.has(r.id));
  for (const r of fresh) if (!madeNotifications.includes(r.id)) madeNotifications.push(r.id);
  return fresh;
}

async function seedSession(clockIn: Date, clockOut: Date | null): Promise<string> {
  const { data, error } = await admin
    .from('time_clock_sessions')
    .insert({
      company_id: company.id,
      member_id: crewMemberId,
      clock_in: clockIn.toISOString(),
      clock_out: clockOut ? clockOut.toISOString() : null,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(`seedSession: ${error.message}`);
  madeSessions.push(data!.id);
  return data!.id;
}

/**
 * A project-attributed segment.
 *
 * The schema is stricter than it looks and all three rules bit on the first
 * run: `segment_type` is CHECK-constrained to work/material_run/warranty (which
 * REQUIRE a project) or travel/shop/break (which require project_id NULL), so
 * 'project' is not a type; and `time_segments_note_on_end_check` demands a note
 * on any CLOSED non-break segment. Encoding them here rather than loosening the
 * fixture keeps it a realistic row.
 */
async function seedSegment(
  sessionId: string,
  start: Date,
  end: Date | null,
  onProject: string = projectId
): Promise<void> {
  const { data, error } = await admin
    .from('time_segments')
    .insert({
      company_id: company.id,
      session_id: sessionId,
      project_id: onProject,
      segment_type: 'work',
      segment_start: start.toISOString(),
      segment_end: end ? end.toISOString() : null,
      note: end ? `${TAG} fixture segment` : null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seedSegment: ${error.message}`);
  madeSegments.push(data!.id);
}

beforeAll(async () => {
  assertRebuildTest();

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, company_id')
    .in('email', [OWNER, ADMIN_EMAIL, CREW]);
  ownerProfileId = profiles!.find((p) => p.email === OWNER)!.id;
  adminProfileId = profiles!.find((p) => p.email === ADMIN_EMAIL)!.id;
  crewProfileId = profiles!.find((p) => p.email === CREW)!.id;

  const { data: co } = await admin
    .from('companies')
    .select('id, timezone, week_starts_on, notify_hours_start, notify_hours_end')
    .eq('id', profiles!.find((p) => p.email === OWNER)!.company_id)
    .single();
  company = co as Co;
  tz = company.timezone ?? 'America/New_York';

  const { data: member } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', crewProfileId)
    .single();
  crewMemberId = member!.id;

  const { data: projects } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', company.id)
    .eq('is_deleted', false)
    .limit(2);
  projectId = projects![0].id;
  altProjectId = projects![1].id;
});


/**
 * A run-window sweep, in ADDITION to the id list.
 *
 * The id list only contains rows a test managed to READ BACK before it
 * asserted. A test that fails mid-way — which is exactly what the
 * break-and-restore proofs do on purpose — aborts before registering the rows
 * it just caused, and those rows survive teardown. Twenty-four of them did.
 *
 * So teardown also deletes, by TYPE and by this run's start time, everything
 * these harnesses can possibly have written. Scoped to the types this file
 * produces so it can never touch anything else.
 */
afterAll(async () => {
  if (madeNotifications.length) {
    await admin.from('notifications').delete().in('id', madeNotifications);
  }
  await admin
    .from('notifications')
    .delete()
    .in('type', MY_TYPES)
    .gte('created_at', runStart);
  if (madeSegments.length) await admin.from('time_segments').delete().in('id', madeSegments);
  if (madeSessions.length) {
    await admin.from('time_clock_sessions').delete().in('id', madeSessions);
  }
});

describe('§3h — runTimesheetsReady', () => {
  it('fires at the company OWN boundary and reaches Owner AND Admin', async () => {
    const weekStartsOn = company.week_starts_on ?? 1;
    const now = instantAt(tz, hourOf(company.notify_hours_start, 7), weekStartsOn);

    // Sanity on the fixture itself: if this instant does not satisfy the
    // company's settings, a passing test below would mean nothing.
    expect(isBoundaryHour(now, tz, company.notify_hours_start)).toBe(true);
    expect(zonedWeekday(now, tz)).toBe(weekStartsOn);

    // An unapproved session inside the week that CLOSED at `now`.
    const current = weekWindow(now, tz, weekStartsOn);
    const closed = weekWindow(new Date(current.weekStart.getTime() - 1), tz, weekStartsOn);
    // CLOSED, not open: §3h only needs an UNAPPROVED session in that week, and
    // `idx_time_clock_sessions_one_open_per_member` is a UNIQUE index on open
    // sessions per member — an open one here would block §3j's fixture below.
    // The database is stating a domain rule (nobody is clocked in twice) and
    // the fixture has to respect it rather than work around it.
    const weekClockIn = new Date(closed.weekStart.getTime() + 36 * 3_600_000);
    await seedSession(weekClockIn, new Date(weekClockIn.getTime() + 8 * 3_600_000));

    const since = new Date().toISOString();
    const outcome = await runTimesheetsReady(admin as SupabaseClient<Database>, now);

    // THE POSITIVE. `fired > 0` alone would pass on another company's row, so
    // the recipients are named.
    expect(outcome.fired).toBeGreaterThan(0);
    expect(outcome.errors).toEqual([]);

    const rows = await rowsOfType('timesheet_ready', since);
    const recipients = new Set(rows.map((r) => r.recipient_profile_id));
    expect(recipients.has(ownerProfileId)).toBe(true);
    expect(recipients.has(adminProfileId)).toBe(true);
    // ND-9: never the worker.
    expect(recipients.has(crewProfileId)).toBe(false);

    expect(rows[0].title).toContain('Timesheets ready to approve — week of');
    expect(rows[0].link_key).toBe('timesheet_week');
    expect(rows[0].link_params).toHaveProperty('week');
  });

  it('the SAME data one hour later writes nothing', async () => {
    // The paired negative. Without it, a loop that ignored its gates entirely
    // would pass the test above.
    const weekStartsOn = company.week_starts_on ?? 1;
    const off = new Date(
      instantAt(tz, hourOf(company.notify_hours_start, 7), weekStartsOn).getTime() + 3_600_000
    );
    const before = await idsOfType('timesheet_ready');
    const outcome = await runTimesheetsReady(admin as SupabaseClient<Database>, off);

    expect(outcome.fired).toBe(0);
    expect(await rowsAddedSince('timesheet_ready', before)).toHaveLength(0);
  });
});

describe('§3i — runDailyLogMissing', () => {
  it('fires at the window END for a project with crew and no log', async () => {
    const now = instantAt(tz, hourOf(company.notify_hours_end, 18), null);
    expect(isBoundaryHour(now, tz, company.notify_hours_end)).toBe(true);

    // Crew time on the project, inside the COMPANY-LOCAL day containing `now`.
    // Placed at local noon so it also proves the day window is computed rather
    // than string-concatenated: a UTC-shifted window would miss it for a
    // company far enough from Greenwich.
    const logDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const range = zonedDayRangeUtc(logDate, tz);
    const noonLocal = new Date(range.start.getTime() + 12 * 3_600_000);

    const sessionId = await seedSession(noonLocal, new Date(noonLocal.getTime() + 3_600_000));
    await seedSegment(sessionId, noonLocal, new Date(noonLocal.getTime() + 3_600_000));

    // Guard the fixture: if a log already exists for this project-day the cron
    // is correct to stay silent and the test would be asserting nothing.
    const { data: existing } = await admin
      .from('daily_logs')
      .select('id')
      .eq('project_id', projectId)
      .eq('log_date', logDate)
      .eq('is_deleted', false);
    expect(existing ?? [], 'fixture expects NO daily log for this project-day').toHaveLength(0);

    const since = new Date().toISOString();
    const outcome = await runDailyLogMissing(admin as SupabaseClient<Database>, now);

    expect(outcome.fired).toBeGreaterThan(0);
    expect(outcome.errors).toEqual([]);

    const rows = await rowsOfType('daily_log_missing', since);
    const mine = rows.filter((r) => r.project_id === projectId);
    expect(mine.length).toBeGreaterThan(0);

    const recipients = new Set(mine.map((r) => r.recipient_profile_id));
    expect(recipients.has(ownerProfileId)).toBe(true);
    expect(recipients.has(adminProfileId)).toBe(true);
    expect(mine[0].body).toContain('crew clocked in');
    expect(mine[0].link_key).toBe('project');
  });

  it("YESTERDAY EVENING's crew does not count as today's", async () => {
    // THE TEST THAT DISCRIMINATES THE DAY-WINDOW FIX. With the naive
    // `${logDate}T00:00:00` strings, Postgres reads UTC, so for this
    // America/New_York company the window is local [20:00 yesterday, 19:59:59
    // today] — it EXCLUDES tonight's late crew and INCLUDES last night's. A
    // segment at 21:00 local yesterday therefore makes the buggy version fire
    // "no daily log filed" for TODAY on the strength of yesterday's crew.
    const now = instantAt(tz, hourOf(company.notify_hours_end, 18), null);
    const todayYmd = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const today = zonedDayRangeUtc(todayYmd, tz);
    // 21:00 local YESTERDAY = three hours before today's local midnight.
    const yesterdayEvening = new Date(today.start.getTime() - 3 * 3_600_000);

    const sessionId = await seedSession(
      yesterdayEvening,
      new Date(yesterdayEvening.getTime() + 3_600_000)
    );
    // A DIFFERENT project, because the previous test seeded crew on `projectId`
    // TODAY and the cron is right to fire for that one. Sharing a project would
    // make this test fail for a reason that is not the bug it is about.
    await seedSegment(
      sessionId,
      yesterdayEvening,
      new Date(yesterdayEvening.getTime() + 3_600_000),
      altProjectId
    );

    const since = new Date().toISOString();
    await runDailyLogMissing(admin as SupabaseClient<Database>, now);

    const rows = await rowsOfType('daily_log_missing', since);
    expect(rows.filter((r) => r.project_id === altProjectId)).toHaveLength(0);
  });

  it('one hour off the boundary writes nothing', async () => {
    const off = new Date(
      instantAt(tz, hourOf(company.notify_hours_end, 18), null).getTime() + 3_600_000
    );
    const before = await idsOfType('daily_log_missing');
    const outcome = await runDailyLogMissing(admin as SupabaseClient<Database>, off);
    expect(outcome.fired).toBe(0);
    expect(await rowsAddedSince('daily_log_missing', before)).toHaveLength(0);
  });
});

describe('§3j — runStillClockedIn', () => {
  // ONE open session for the whole block, because the schema allows exactly
  // that: `idx_time_clock_sessions_one_open_per_member` is a UNIQUE index on
  // open sessions per member. Seeding one per test collided on the first run —
  // which is the database stating the domain rule that a person cannot be
  // clocked in twice. The tests differ by the INSTANT, not by the session.
  let openSessionId: string;

  beforeAll(async () => {
    const start = new Date(instantAt(tz, 16, null).getTime() - 8 * 3_600_000);
    openSessionId = await seedSession(start, null);
    await seedSegment(openSessionId, start, null);
  });

  it('16:00 nudges the WORKER and nobody else', async () => {
    const now = instantAt(tz, 16, null);
    const since = new Date().toISOString();
    const outcome = await runStillClockedIn(admin as SupabaseClient<Database>, now);

    expect(outcome.fired).toBeGreaterThan(0);
    const rows = await rowsOfType('still_clocked_in', since);
    const recipients = new Set(rows.map((r) => r.recipient_profile_id));

    // The one trace where the worker IS the recipient.
    expect(recipients.has(crewProfileId)).toBe(true);
    // At 16:00 this is the worker's own business — management is NOT told.
    expect(recipients.has(ownerProfileId)).toBe(false);
    expect(recipients.has(adminProfileId)).toBe(false);

    const mine = rows.find((r) => r.recipient_profile_id === crewProfileId)!;
    expect(mine.title).toContain("You're still clocked in");
    expect(mine.link_key).toBe('timeclock');
  });

  it('17:00 adds Owner and Admin — the overtime event', async () => {
    const now = instantAt(tz, 17, null);
    const since = new Date().toISOString();
    await runStillClockedIn(admin as SupabaseClient<Database>, now);

    const rows = await rowsOfType('still_clocked_in', since);
    const recipients = new Set(rows.map((r) => r.recipient_profile_id));
    expect(recipients.has(crewProfileId)).toBe(true);
    expect(recipients.has(ownerProfileId)).toBe(true);
    expect(recipients.has(adminProfileId)).toBe(true);

    const managerRow = rows.find((r) => r.recipient_profile_id === ownerProfileId)!;
    expect(managerRow.title).toContain('into overtime');
  });

  it('15:00 is neither event and writes nothing', async () => {
    const now = instantAt(tz, 15, null);
    const before = await idsOfType('still_clocked_in');
    const outcome = await runStillClockedIn(admin as SupabaseClient<Database>, now);
    expect(outcome.fired).toBe(0);
    expect(await rowsAddedSince('still_clocked_in', before)).toHaveLength(0);
  });

  it('a CLOSED session is not nudged — cancellation, for free', async () => {
    // §3j's "clocking out cancels a pending event", tested as the property it
    // actually is: the loop asks who is still open AT FIRING TIME.
    const now = instantAt(tz, 16, null);

    // Clock the SAME session out — the state change the trace is about.
    // ⚠️ CLOCKED OUT AS THE CREW MEMBER, NOT AS THE SERVICE ROLE. A plain
    // service-role UPDATE is REFUSED here — "You are not authorized to edit
    // this session." — because 6A guards session edits with a TRIGGER, and a
    // trigger sees `auth.uid() IS NULL` for the service role and denies. RLS is
    // bypassed by the service key; triggers are not. So the fixture clocks out
    // the way a person does, with the member's own JWT, which is also the more
    // faithful fixture.
    const crewClient = await sessionFor(CREW);
    const { error: outErr } = await crewClient
      .from('time_clock_sessions')
      .update({ clock_out: new Date(now.getTime() - 10 * 60_000).toISOString() })
      .eq('id', openSessionId);
    expect(outErr?.message ?? null).toBeNull();

    // GUARD THE FIXTURE. An update that silently does not apply would make the
    // assertion below fail for a reason that has nothing to do with the loop —
    // and on the first run it did exactly that, which is why this read exists.
    const { data: check } = await admin
      .from('time_clock_sessions')
      .select('clock_out')
      .eq('id', openSessionId)
      .single();
    expect(check!.clock_out, 'the fixture session must actually be clocked out').not.toBeNull();

    const since = new Date().toISOString();
    await runStillClockedIn(admin as SupabaseClient<Database>, now);

    // Paired with the 16:00 test above, which used this exact session while it
    // was open and DID produce a row. Same session, same instant, one field
    // changed — so this cannot pass by the loop being broken generally.
    const { data: fromThisSession } = await admin
      .from('notifications')
      .select('id')
      .eq('source_id', openSessionId)
      .gte('created_at', since);
    expect(fromThisSession ?? []).toHaveLength(0);
  });
});
