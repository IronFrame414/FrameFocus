import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireTestEnv } from './env';

// M6M — deterministic data for the M-2 / M-3 / M-7 criteria.
//
// ---------------------------------------------------------------------------
// WHY A FIXTURE AND NOT "WHATEVER IS ON REBUILD-TEST".
// ---------------------------------------------------------------------------
// Several criteria in this slice assert a STATE, not just a rendering, and the
// database does not currently contain that state:
//
//   A-10e / A-11d  days-left in all THREE states. Every project on rebuild-test
//                  has target_end_date = NULL, so the positive and negative
//                  arms would pass vacuously — the exact failure §10's preamble
//                  says S97 shipped three of.
//   A-9b           "each chip changes the rows listed". No project is on_hold,
//                  so the On-hold chip could not change anything.
//   A-8 / A-8b     require an OPEN time segment — first carrying a project,
//                  then a `break` that constitutionally cannot.
//   A-11b / A-11c  require open, in-progress and complete punch items, some
//                  assigned to the signed-in member and some not.
//   A-11f / A-11j  require dated schedule rows, including one belonging to a
//                  DIFFERENT member so RLS has something to withhold.
//
// ---------------------------------------------------------------------------
// IT CREATES ITS OWN ROWS AND DELETES THEM. Nothing existing is mutated.
// ---------------------------------------------------------------------------
// Every row is named/prefixed `M6M —` and is hard-deleted in teardown. In
// particular the four fixture PROJECTS are new: m-sections.spec.ts pins
// eaf0e25b-… by id, and editing that row to give it a target date would change
// what a passing test was passing on.
//
// CREW SEE ONLY PROJECTS THEY ARE ASSIGNED TO — projects_select_visible is
// `company_id = get_my_company_id() AND (owner/admin OR is_assigned_to_project(id))`.
// So every fixture project gets a project_assignments row for the crew test
// identity, or M-2 renders an empty list and every criterion here passes
// vacuously for the second time.
//
// SERVICE ROLE, AND ONLY EVER AGAINST rebuild-test. assertRebuildTest() below
// refuses to run anywhere else, mirroring test/live-session.ts.

const REQUIRED_PROJECT_REF = 'nmyphyhmfttxkdoposvf'; // framefocus-rebuild-test

/**
 * A service-role client for specs that must clean up after themselves.
 *
 * Exported [S119, TECH_DEBT #144] so `m-writes.spec.ts` can delete what it
 * created without a second copy of the env resolution — and, more importantly,
 * without a second copy of the rebuild-test guard. A cleanup routine is the
 * last thing that should be able to run against the wrong database.
 *
 * [S123] setupHubFixture() now calls THIS rather than repeating the same three
 * lines. The duplicate was harmless while both copies agreed; the point of the
 * guard is that it cannot be got wrong in one place and right in the other.
 */
export function adminClient(): SupabaseClient {
  const url = requireTestEnv('NEXT_PUBLIC_SUPABASE_URL');
  const service = requireTestEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!url.includes(REQUIRED_PROJECT_REF)) {
    throw new Error(`REFUSING TO RUN: linked project is not ${REQUIRED_PROJECT_REF}. URL=${url}`);
  }

  return createClient(url, service, { auth: { persistSession: false } });
}

/** Company A (Sabal Point Construction) and the crew test identity's member row. */
export const COMPANY_A = '03bb903f-1084-4ab4-afb8-03192cb58d30';
export const CREW_MEMBER = '18a105e7-2ff9-4546-a17b-87524a45e978'; // Casey Crew
export const OTHER_MEMBER = '9b0380c5-18f9-4c93-88b0-229fd18390c4'; // Pat Manager

export type HubFixture = {
  admin: SupabaseClient;
  /** target_end_date in the future — the positive days-left arm. */
  futureProject: string;
  /** target_end_date in the past — the NEGATIVE arm, which must not clamp. */
  pastProject: string;
  /** target_end_date NULL — the em-dash arm. */
  nullDateProject: string;
  /** status = on_hold — the only row the On-hold chip can return. */
  onHoldProject: string;
  punchListId: string;
  sessionId: string | null;
  /** Scopes create and delete so parallel spec files cannot collide. */
  prefix: string;
  /** Dates the schedule fixtures use, so the spec can assert against them. */
  dates: { today: string; plus1: string; plus3: string; plus5: string; minus3: string };
};

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// THE PREFIX EXISTS FOR CROSS-FILE ISOLATION, AND IT IS LOAD-BEARING.
//
// Playwright runs spec FILES in parallel workers, and `beforeAll` runs once per
// worker. Two files both calling setupHubFixture() would therefore run two
// setups CONCURRENTLY — and each begins by deleting leftovers, so each would
// delete the other's freshly-created rows mid-run. The failures that produces
// look like flaky assertions, not like a fixture collision.
//
// Every file passes its own prefix; create and delete are both scoped to it.
// ---------------------------------------------------------------------------
export async function setupHubFixture(prefix = 'M6M'): Promise<HubFixture> {
  const admin = adminClient();

  // Leftovers from an interrupted run would collide on project_number.
  await hardDelete(admin, prefix);

  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .limit(1)
    .single();
  if (!contact) throw new Error('No contact on company A to hang fixture projects off.');

  const dates = {
    today: isoDay(0),
    plus1: isoDay(1),
    plus3: isoDay(3),
    plus5: isoDay(5),
    minus3: isoDay(-3),
  };

  // project_number AND project_internal_seq are both set explicitly. Their
  // column defaults are next_project_number() / next_project_internal_seq(),
  // which resolve the company from get_my_company_id() — and the SERVICE ROLE
  // has no caller company, so both defaults raise "no company for caller".
  // Supplying the values is the fix; making the helpers service-role-aware
  // would be a schema change this slice has no business making.
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', COMPANY_A)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = (seqRow?.project_internal_seq ?? 0) + 1000; // clear of the live counter

  const base = {
    company_id: COMPANY_A,
    contact_id: contact.id,
    project_type: 'fixed_price',
  };

  const { data: projects, error: projErr } = await admin
    .from('projects')
    .insert([
      {
        ...base,
        name: `${prefix} — future target`,
        project_number: `${prefix}-F1`,
        project_internal_seq: seq++,
        status: 'active',
        target_end_date: isoDay(12),
      },
      {
        ...base,
        name: `${prefix} — past target`,
        project_number: `${prefix}-P1`,
        project_internal_seq: seq++,
        status: 'active',
        target_end_date: dates.minus3,
      },
      {
        ...base,
        name: `${prefix} — no target`,
        project_number: `${prefix}-N1`,
        project_internal_seq: seq++,
        status: 'active',
        target_end_date: null,
      },
      {
        ...base,
        name: `${prefix} — on hold`,
        project_number: `${prefix}-H1`,
        project_internal_seq: seq++,
        status: 'on_hold',
        target_end_date: null,
      },
    ])
    .select('id, project_number');
  if (projErr || !projects) throw new Error(`fixture projects: ${projErr?.message}`);

  const byNumber = (n: string) => projects.find((p) => p.project_number === `${prefix}-${n}`)!.id;
  const futureProject = byNumber('F1');
  const pastProject = byNumber('P1');
  const nullDateProject = byNumber('N1');
  const onHoldProject = byNumber('H1');

  // Crew visibility — without these, projects_select_visible returns nothing.
  await admin.from('project_assignments').insert(
    projects.map((p) => ({
      company_id: COMPANY_A,
      project_id: p.id,
      member_id: CREW_MEMBER,
    }))
  );

  // -------------------------------------------------------------------------
  // PUNCH — D-16's two figures, with every state that must and must not count.
  //   2 open assigned to the crew member       -> mine
  //   1 in_progress assigned to the crew member-> mine   (A-11c: stays in)
  //   1 open assigned to ANOTHER member        -> total only
  //   1 complete assigned to the crew member   -> NEITHER (A-11c: drops out)
  //   1 verified assigned to the crew member   -> NEITHER
  // Expect: mine = 3, total = 4.
  // -------------------------------------------------------------------------
  const { data: punchList, error: plErr } = await admin
    .from('punch_lists')
    .insert({ company_id: COMPANY_A, project_id: futureProject, name: 'M6M — fixture list' })
    .select('id')
    .single();
  if (plErr || !punchList) throw new Error(`fixture punch list: ${plErr?.message}`);

  const item = (title: string, status: string, assignee: string | null) => ({
    company_id: COMPANY_A,
    punch_list_id: punchList.id,
    project_id: futureProject,
    title,
    status,
    assignee_id: assignee,
    requires_verification: false,
  });

  await admin.from('punch_list_items').insert([
    item('M6M — open A', 'open', CREW_MEMBER),
    item('M6M — open B', 'open', CREW_MEMBER),
    item('M6M — in progress', 'in_progress', CREW_MEMBER),
    item('M6M — open, someone else', 'open', OTHER_MEMBER),
    item('M6M — complete', 'complete', CREW_MEMBER),
    item('M6M — verified', 'verified', CREW_MEMBER),
  ]);

  // -------------------------------------------------------------------------
  // SCHEDULE — "Up next" (D-24).
  //
  // schedule_entries_select_scoped limits crew and subcontractors to
  // `member_id = get_my_member_id()`, so the OWNERSHIP of each row is the whole
  // point of this block:
  //
  //   plus3, crew member  -> the row Up next must land on
  //   plus5, crew member  -> later, must lose
  //   plus1, OTHER member -> NEARER, and must NOT appear (A-11j). A build that
  //                          queried with elevated rights would show this one
  //                          and fail.
  //   minus3, crew member -> in the past, must be filtered out (A-11f)
  // -------------------------------------------------------------------------
  await admin.from('schedule_entries').insert([
    {
      company_id: COMPANY_A,
      project_id: futureProject,
      member_id: CREW_MEMBER,
      entry_date: dates.plus3,
      general_kind: 'project',
      notes: 'M6M — should be Up next',
    },
    {
      company_id: COMPANY_A,
      project_id: futureProject,
      member_id: CREW_MEMBER,
      entry_date: dates.plus5,
      general_kind: 'project',
      notes: 'M6M — later',
    },
    {
      company_id: COMPANY_A,
      project_id: futureProject,
      member_id: OTHER_MEMBER,
      entry_date: dates.plus1,
      general_kind: 'project',
      notes: 'M6M — teammate, must stay hidden',
    },
    {
      company_id: COMPANY_A,
      project_id: futureProject,
      member_id: CREW_MEMBER,
      entry_date: dates.minus3,
      general_kind: 'project',
      notes: 'M6M — past',
    },
  ]);

  return {
    admin,
    futureProject,
    pastProject,
    nullDateProject,
    onHoldProject,
    punchListId: punchList.id,
    sessionId: null,
    dates,
    prefix,
  };
}

/**
 * §4.2's "currently clocked into" state.
 *
 * `work` attaches futureProject; `break` CANNOT attach one —
 * time_segments_project_gate_check forces project_id IS NULL on travel/shop/
 * break, which is precisely why A-8b exists and why zero highlighted cards is a
 * normal state rather than a bug.
 */
export async function openSegment(
  f: HubFixture,
  kind: 'work' | 'break'
): Promise<void> {
  await closeSegment(f);

  const { data: session, error } = await f.admin
    .from('time_clock_sessions')
    .insert({
      company_id: COMPANY_A,
      member_id: CREW_MEMBER,
      clock_in: new Date().toISOString(),
      // time_clock_sessions_status_check permits NULL | 'pending' | 'approved'
      // — 'open' is NOT a status. "Open" is `clock_out IS NULL`, which is what
      // getOpenSession() actually keys on; status tracks APPROVAL, not state.
      status: 'pending',
    })
    .select('id')
    .single();
  if (error || !session) throw new Error(`fixture session: ${error?.message}`);

  const { error: segErr } = await f.admin.from('time_segments').insert({
    company_id: COMPANY_A,
    session_id: session.id,
    segment_type: kind,
    project_id: kind === 'work' ? f.futureProject : null,
    segment_start: new Date().toISOString(),
  });
  if (segErr) throw new Error(`fixture segment: ${segErr.message}`);

  f.sessionId = session.id;
}

/** Removes the open session entirely — the clocked-OUT state. */
export async function closeSegment(f: HubFixture): Promise<void> {
  await f.admin.from('time_segments').delete().eq('company_id', COMPANY_A).is('segment_end', null);
  await f.admin
    .from('time_clock_sessions')
    .delete()
    .eq('member_id', CREW_MEMBER)
    .is('clock_out', null);
  f.sessionId = null;
}

export async function teardownHubFixture(f: HubFixture): Promise<void> {
  await closeSegment(f);
  await hardDelete(f.admin, f.prefix);
}

/**
 * HARD delete, not the trash-bin soft delete. These rows are test scaffolding,
 * not records — leaving them soft-deleted would leak four projects into every
 * future trash view. Ordered child-first so no FK blocks the parent.
 */
async function hardDelete(admin: SupabaseClient, prefix: string): Promise<void> {
  const { data: projects } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', COMPANY_A)
    .like('project_number', `${prefix}-%`);

  const ids = (projects ?? []).map((p) => p.id);
  if (ids.length === 0) return;

  // EVERY dependent first, and the final delete is CHECKED. Playwright
  // restarts a worker after a test failure and beforeAll re-runs there — if a
  // failed test left a daily log, delivery or incident on a fixture project,
  // an unchecked project delete fails silently on the FK and the re-setup
  // collides on project_number with an error that points at the wrong thing.
  await admin.from('punch_list_items').delete().in('project_id', ids);
  await admin.from('punch_lists').delete().in('project_id', ids);
  await admin.from('schedule_entries').delete().in('project_id', ids);
  await admin.from('time_segments').delete().in('project_id', ids);

  const { data: logs } = await admin.from('daily_logs').select('id').in('project_id', ids);
  const logIds = (logs ?? []).map((l) => l.id);
  if (logIds.length) {
    await admin.from('daily_log_crew').delete().in('daily_log_id', logIds);
    await admin.from('daily_log_sub_entries').delete().in('daily_log_id', logIds);
  }

  const { data: incidents } = await admin
    .from('safety_incidents')
    .select('id')
    .in('project_id', ids);
  const incidentIds = (incidents ?? []).map((i) => i.id);
  if (incidentIds.length) {
    await admin.from('safety_incident_injuries').delete().in('incident_id', incidentIds);
    await admin.from('safety_incident_witnesses').delete().in('incident_id', incidentIds);
  }

  // Files on fixture projects (delivery PDFs, incident PDFs, log photos) —
  // rows first so FKs clear, then the objects.
  const { data: files } = await admin.from('files').select('id, file_path').in('project_id', ids);
  if (files?.length) {
    await admin.from('files').delete().in('id', files.map((f) => f.id));
    await admin.storage.from('project-files').remove(files.map((f) => f.file_path));
  }

  await admin.from('daily_logs').delete().in('project_id', ids);
  await admin.from('safety_incidents').delete().in('project_id', ids);
  await admin.from('delivery_items').delete().in(
    'delivery_id',
    (await admin.from('deliveries').select('id').in('project_id', ids)).data?.map((d) => d.id) ?? []
  );
  await admin.from('deliveries').delete().in('project_id', ids);
  await admin.from('tasks').delete().in('project_id', ids);
  await admin.from('project_assignments').delete().in('project_id', ids);

  const { error } = await admin.from('projects').delete().in('id', ids);
  if (error) {
    throw new Error(
      `fixture hardDelete could not remove projects (${error.message}) — a dependent row ` +
        'from a previous run is still attached; the collision this prevents would otherwise ' +
        'surface as a misleading duplicate-key error in the next setup.'
    );
  }
}
