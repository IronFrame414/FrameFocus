import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  setupHubFixture,
  teardownHubFixture,
  COMPANY_A,
  type HubFixture,
} from './hub-fixture';
import { requireTestEnv } from './env';

/**
 * A REAL member JWT on the anon key — RLS and the column-scope triggers apply
 * exactly as they do in the app. Needed because the 6A-1/6A-2 triggers refuse
 * the SERVICE role for time-segment edits (get_my_role() is NULL under it), so
 * a DB-refusal criterion like A-7h is only reachable as the member themself.
 * Mirrors test/live-session.ts.
 */
async function memberClient(email: string): Promise<SupabaseClient> {
  // [S123] Was a SECOND hand-rolled copy of the .env.local parser, with the
  // same file-only lookup that made hub-fixture.ts red in CI — and it would
  // have thrown here immediately after that one was fixed. One resolver, in
  // ./env, for both.
  const client = createClient(
    requireTestEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireTestEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error } = await client.auth.signInWithPassword({
    email,
    password: process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026',
  });
  if (error) throw new Error(`memberClient(${email}): ${error.message}`);
  return client;
}

// M6M §4.12 — the five field-capture screens: 7a (M-5 amended), 7b (M-20),
// 7c (M-21), 7d (M-22), 7e (M-23).
//
// Asserted here:
//   7a    A-7b, A-7b2, A-7c, A-7c2, A-7c3, A-7d, A-7d2, A-7e, A-7f(project
//         half fully; projectless half as flagged), A-7k, A-7k2, A-7k3, A-7k4,
//         A-7k5, A-7l(no-selection half), A-7l2(partial), A-7m, A-7n
//   7b    A-7g, A-7h, A-7j, A-7j2(build half), A-7j3, A-7j4
//   7c    work-performed gate, D-29 (blank 7e, nothing written)
//   7d    A-19, usable derivation, damage-needs-photo gate, the RPC-gated
//         submit (verified against the database)
//   7e    injury-names-a-party gate, submit lands the row
//
// IDENTITY: SESSION-CREATING TESTS SIGN IN AS THE FOREMAN, NOT THE CREW.
// The suite's other spec files run in PARALLEL WORKERS and m-hubs.spec.ts
// opens sessions for the crew identity mid-run; one open session per member is
// a partial unique index, so two files clocking the same member in would
// collide non-deterministically. The foreman identity is this file's own.
//
// UI-structure tests (absence assertions, gating) stay on the default crew
// storageState — they never create a session.

const FOREMAN_EMAIL = 'josh+qa-foreman@worthprop.com';
const FOREMAN_MEMBER = '61e04e04-4c9f-4113-a8e1-85057d6bff50';
const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';

let fx: HubFixture;

test.beforeAll(async () => {
  fx = await setupHubFixture('M6MC');
  // The fixture assigns the crew member; this file's session tests run as the
  // FOREMAN, who needs assignments of their own to see the fixture projects
  // (projects_select_visible: owner/admin OR assigned).
  const { data: existing } = await fx.admin
    .from('project_assignments')
    .select('project_id')
    .eq('member_id', FOREMAN_MEMBER);
  const have = new Set((existing ?? []).map((r) => r.project_id));
  const wanted = [fx.futureProject, fx.pastProject, fx.nullDateProject].filter(
    (id) => !have.has(id)
  );
  if (wanted.length) {
    await fx.admin.from('project_assignments').insert(
      wanted.map((project_id) => ({ company_id: COMPANY_A, project_id, member_id: FOREMAN_MEMBER }))
    );
  }
});

test.afterAll(async () => {
  if (fx) {
    await closeForemanSessions();
    await teardownHubFixture(fx);
  }
});

/** Hard-delete every foreman session this file created (fixture projects only leave via teardown's project cascade; travel/shop/break sessions have no project and must go here). */
async function closeForemanSessions() {
  const { data: sessions } = await fx.admin
    .from('time_clock_sessions')
    .select('id')
    .eq('member_id', FOREMAN_MEMBER)
    .gte('clock_in', new Date(Date.now() - 6 * 3600_000).toISOString());
  const ids = (sessions ?? []).map((s) => s.id);
  if (ids.length) {
    await fx.admin.from('time_segments').delete().in('session_id', ids);
    await fx.admin.from('time_clock_sessions').delete().in('id', ids);
  }
}

async function signInAsForeman(page: Page) {
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(FOREMAN_EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/** The foreman's open session row, read with the service role. */
async function openForemanSession() {
  const { data } = await fx.admin
    .from('time_clock_sessions')
    .select('id, gps_in, gps_out, clock_out, member_id')
    .eq('member_id', FOREMAN_MEMBER)
    .is('clock_out', null)
    .eq('is_deleted', false)
    .maybeSingle();
  return data;
}

async function segmentsOf(sessionId: string) {
  const { data } = await fx.admin
    .from('time_segments')
    .select('id, segment_type, project_id, task_id, completion, note, segment_start, segment_end')
    .eq('session_id', sessionId)
    .order('segment_start', { ascending: true });
  return data ?? [];
}

/** Clock in through the real UI. Assumes signed in and on /m/timeclock. */
async function uiClockIn(page: Page, type: string, projectId?: string) {
  await page.goto('/m/timeclock');
  await page.getByTestId(`m-type-${type}`).click();
  if (projectId) {
    await page
      .locator(`[data-testid="m-clock-project"][data-project-id="${projectId}"]`)
      .click();
  }
  await expect(page.getByTestId('m-clock-in')).toBeEnabled();
  await page.getByTestId('m-clock-in').click();
}

// ===========================================================================
// 7a · THE D-27 INTERACTION — UI structure (crew storageState; no sessions)
// ===========================================================================
test.describe('7a · type is a required choice', () => {
  test('A-7b · clock-in cannot be submitted without a type; none is pre-selected', async ({
    page,
  }) => {
    await page.goto('/m/timeclock');
    // No type pre-selected — D-27's "no default".
    expect(await page.locator('[data-testid^="m-type-"][data-active="true"]').count()).toBe(0);
    await expect(page.getByTestId('m-clock-in')).toBeDisabled();
  });

  test('A-7b2 · the picker offers EXACTLY the six types in the CHECK', async ({ page }) => {
    await page.goto('/m/timeclock');
    const types = await page
      .locator('button[data-testid^="m-type-"]')
      .evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).dataset.testid!.replace('m-type-', ''))
      );
    expect(types.sort()).toEqual(
      ['break', 'material_run', 'shop', 'travel', 'warranty', 'work'].sort()
    );
  });

  test('A-7c · for work/material_run/warranty the project row is present and REQUIRED', async ({
    page,
  }) => {
    await page.goto('/m/timeclock');
    for (const type of ['work', 'material_run', 'warranty']) {
      await page.getByTestId(`m-type-${type}`).click();
      await expect(page.getByTestId('m-project-block')).toBeVisible();
      // No project chosen -> still disabled. This is the criterion that fails
      // if a build lets a `work` segment through with no project — the exact
      // violation that killed D-25.
      await expect(page.getByTestId('m-clock-in')).toBeDisabled();
    }
  });

  test('A-7c2 · for travel/shop/break the project row is ABSENT — not disabled', async ({
    page,
  }) => {
    await page.goto('/m/timeclock');
    for (const type of ['travel', 'shop', 'break']) {
      await page.getByTestId(`m-type-${type}`).click();
      // Absent means NOT IN THE DOM — a greyed control invites a tap that can
      // never succeed and implies a choice the constraint forbids.
      await expect(page.getByTestId('m-project-block')).toHaveCount(0);
      // ...and with no project owed, the type alone enables the button.
      await expect(page.getByTestId('m-clock-in')).toBeEnabled();
    }
  });

  test('A-7l · nothing is selected when M-5 opens; a tap is required', async ({ page }) => {
    await page.goto('/m/timeclock');
    await page.getByTestId('m-type-work').click();
    // Sorted or not, NOTHING is selected — proximity (were it computable)
    // changes order, never selection.
    expect(
      await page.locator('[data-testid="m-clock-project"][data-active="true"]').count()
    ).toBe(0);
    await expect(page.getByTestId('m-clock-in')).toBeDisabled();
  });

  test('A-7m · no derived overtime figure appears on M-5', async ({ page }) => {
    await page.goto('/m/timeclock');
    const body = await page.getByTestId('m-content').innerText();
    expect(body).not.toMatch(/to OT|overtime/i);
    expect(body).not.toMatch(/this week/i);
  });

  test('A-7n · no mobile screen says location is being captured', async ({ page }) => {
    for (const url of ['/m/timeclock', '/m/settings']) {
      await page.goto(url);
      const body = await page.getByTestId('m-content').innerText();
      expect(body, url).not.toMatch(/location|GPS/i);
    }
  });

  test('A-7k4 · no control anywhere disables location capture', async ({ page }) => {
    // D-34 rule 1 — no setting, toggle or skip, on M-5 or in settings.
    for (const url of ['/m/timeclock', '/m/settings']) {
      await page.goto(url);
      const controls = await page
        .locator('button, input, select, [role="switch"]')
        .evaluateAll((els) =>
          els
            .map(
              (e) =>
                `${(e as HTMLElement).dataset.testid ?? ''} ${(e as HTMLElement).textContent ?? ''} ${(e as HTMLInputElement).name ?? ''}`
            )
            .filter((t) => /location|gps/i.test(t))
        );
      expect(controls, url).toHaveLength(0);
    }
  });
});

// ===========================================================================
// 7a · CLOCK EVENTS — real sessions, as the FOREMAN, verified in the database
// ===========================================================================
test.describe('7a · clock-in writes (foreman identity)', () => {
  test.use({ permissions: ['geolocation'], geolocation: { latitude: 33.749, longitude: -84.388 } });
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await closeForemanSessions();
    await signInAsForeman(page);
  });

  test('A-7d / A-7d2 / A-7e / A-7k / A-7f · a work clock-in writes the chosen project, the chosen type, no task — and gps_in holds coordinates', async ({
    page,
  }) => {
    await uiClockIn(page, 'work', fx.futureProject);

    // A-7f — the redirect follows the TYPE: a project type lands on that
    // project's hub.
    await page.waitForURL(new RegExp(`/m/p/${fx.futureProject}$`), { timeout: 30_000 });

    const session = await openForemanSession();
    expect(session).toBeTruthy();
    const segs = await segmentsOf(session!.id);
    expect(segs).toHaveLength(1);
    expect(segs[0].segment_type).toBe('work'); // A-7d2 — the selected type, no substitution
    expect(segs[0].project_id).toBe(fx.futureProject); // A-7d
    expect(segs[0].task_id).toBeNull(); // A-7e
    expect(segs[0].completion).toBeNull(); // A-7e

    // A-7k — fix acquired: gps_in holds COORDINATES.
    const gps = session!.gps_in as { lat?: number; lng?: number } | null;
    expect(gps?.lat).toBeCloseTo(33.749, 2);
    expect(gps?.lng).toBeCloseTo(-84.388, 2);
  });

  test('A-7c3 · a break clock-in writes project_id NULL even with a project in context', async ({
    page,
  }) => {
    // The likely bug §4.5a names: user picks a project for `work`, then
    // changes their mind to `break` — the screen must DROP the project, not
    // helpfully send it into a row the CHECK rejects.
    await page.goto('/m/timeclock');
    await page.getByTestId('m-type-work').click();
    await page
      .locator(`[data-testid="m-clock-project"][data-project-id="${fx.futureProject}"]`)
      .click();
    await page.getByTestId('m-type-break').click(); // change of mind
    await expect(page.getByTestId('m-clock-in')).toBeEnabled();
    await page.getByTestId('m-clock-in').click();

    // A-7f's projectless half — D-12 said "the dashboard", but D-38 cut
    // /m/dashboard from v1, so the projectless landing is M-5's own
    // on-the-clock state. Asserted: it does NOT land on any project hub and
    // stays on /m.
    await expect(page.getByTestId('m-clock-status')).toHaveText(/on the clock/i, {
      timeout: 30_000,
    });
    expect(page.url()).toContain('/m/timeclock');

    const session = await openForemanSession();
    const segs = await segmentsOf(session!.id);
    expect(segs[0].segment_type).toBe('break');
    expect(segs[0].project_id).toBeNull(); // the CHECK's demand, honoured
  });
});

test.describe('7a · GPS failure paths still clock in (foreman identity)', () => {
  test.setTimeout(90_000);

  test.beforeEach(async () => {
    await closeForemanSessions();
  });

  test('A-7k2 · permission DENIED: clock-in succeeds; gps_in records the reason, not NULL', async ({
    page,
  }) => {
    // No geolocation permission granted -> Chromium denies the request.
    await signInAsForeman(page);
    await uiClockIn(page, 'shop');
    await expect(page.getByTestId('m-clock-status')).toHaveText(/on the clock/i, {
      timeout: 30_000,
    });

    const session = await openForemanSession();
    const gps = session!.gps_in as { reason?: string; error_code?: number; lat?: number } | null;
    // Not NULL, not coordinates — the recorded reason (§4.12.1a's three-state
    // point: "denied" and "never asked" must not look alike).
    expect(gps?.reason).toBe('permission_denied');
    expect(gps?.error_code).toBe(1);
    expect(gps?.lat).toBeUndefined();
  });

  test('A-7k3 · position UNAVAILABLE: clock-in succeeds; the stored row is distinguishable from denied', async ({
    page,
  }) => {
    // The steel-building case — permission fine, no fix obtainable. Stubbed:
    // no test harness can genuinely remove the sky.
    await page.addInitScript(() => {
      const geo = navigator.geolocation;
      if (geo) {
        geo.getCurrentPosition = (_ok, fail) =>
          fail?.({
            code: 2,
            message: 'position unavailable',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
      }
    });
    await signInAsForeman(page);
    await uiClockIn(page, 'travel');
    await expect(page.getByTestId('m-clock-status')).toHaveText(/on the clock/i, {
      timeout: 30_000,
    });

    const session = await openForemanSession();
    const gps = session!.gps_in as { reason?: string; error_code?: number } | null;
    expect(gps?.reason).toBe('position_unavailable');
    expect(gps?.error_code).toBe(2);
  });
});

// ===========================================================================
// 7b · M-20 — the switcher (foreman identity)
// ===========================================================================
test.describe('7b · M-20 switcher', () => {
  test.use({ permissions: ['geolocation'], geolocation: { latitude: 33.749, longitude: -84.388 } });
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await closeForemanSessions();
    await signInAsForeman(page);
  });

  test('A-7j / A-7j3 · reached from M-5; offers ALL SIX types with the three-and-three rule', async ({
    page,
  }) => {
    await uiClockIn(page, 'work', fx.futureProject);
    await page.waitForURL(new RegExp(`/m/p/${fx.futureProject}$`), { timeout: 30_000 });

    // A-7j — the switch is offered, reached from M-5's on-the-clock state.
    await page.goto('/m/timeclock');
    await page.getByTestId('m-switch-link').click();
    await page.waitForURL(/\/m\/timeclock\/switch$/);

    // A-7j3 — all six, not the handoff's four.
    const types = await page
      .locator('button[data-testid^="m-next-type-"]')
      .evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).dataset.testid!.replace('m-next-type-', ''))
      );
    expect(types.sort()).toEqual(
      ['break', 'material_run', 'shop', 'travel', 'warranty', 'work'].sort()
    );

    // The three-and-three rule, on the SWITCHER (A-7g's revival): material_run
    // requires a project before Start segment enables...
    await page.getByTestId('m-switch-note').fill('framed the east wall');
    await page.getByTestId('m-next-type-material_run').click();
    await expect(page.getByTestId('m-next-project-block')).toBeVisible();
    await expect(page.getByTestId('m-start-segment')).toBeDisabled();

    // ...and break forbids one — the block is ABSENT, and the note already
    // entered satisfies the close.
    await page.getByTestId('m-next-type-break').click();
    await expect(page.getByTestId('m-next-project-block')).toHaveCount(0);
    await expect(page.getByTestId('m-start-segment')).toBeEnabled();
  });

  test('A-7j2 / A-7j4 · a switch closes-and-opens with the note on the CLOSED segment', async ({
    page,
  }) => {
    await uiClockIn(page, 'work', fx.futureProject);
    await page.waitForURL(new RegExp(`/m/p/${fx.futureProject}$`), { timeout: 30_000 });

    const before = await openForemanSession();
    const segsBefore = await segmentsOf(before!.id);
    expect(segsBefore).toHaveLength(1);
    const firstSegmentId = segsBefore[0].id;

    await page.goto('/m/timeclock/switch');
    // A-7j4 — closing a work segment demands a note (the DB CHECK behind A-7h
    // fires without it; the field is what makes the switch possible at all).
    await expect(page.getByTestId('m-start-segment')).toBeDisabled();
    await page.getByTestId('m-switch-note').fill('hung drywall in unit 2');
    await page.getByTestId('m-next-type-break').click();
    await page.getByTestId('m-start-segment').click();
    await page.waitForURL(/\/m\/timeclock$/, { timeout: 30_000 });

    // A-7j2's build half — CLOSE AND OPEN, never edit-in-place: the first
    // segment is ENDED (same id, same start, now with an end and the note);
    // a SECOND segment exists, open, with a new id.
    const segsAfter = await segmentsOf(before!.id);
    expect(segsAfter).toHaveLength(2);
    const closed = segsAfter.find((s) => s.id === firstSegmentId)!;
    expect(closed.segment_end).not.toBeNull();
    expect(closed.note).toBe('hung drywall in unit 2'); // A-7j4
    const opened = segsAfter.find((s) => s.id !== firstSegmentId)!;
    expect(opened.segment_end).toBeNull();
    expect(opened.segment_type).toBe('break');
    expect(opened.project_id).toBeNull();
    // Contiguous: the boundary is shared.
    expect(opened.segment_start).toBe(closed.segment_end);
  });

  test('A-7h · the note rule is DB-ENFORCED — ending a non-break segment without a note is refused', async () => {
    // The CHECK is only reachable through the column-scope trigger's allowed
    // path — a member ending their OWN OPEN segment. The service role is not
    // that member (get_my_role() is NULL under it), so the trigger refuses
    // BEFORE the CHECK can fire; the test therefore runs as a real foreman
    // JWT, which is also the shape the criterion is about.
    const member = await memberClient(FOREMAN_EMAIL);

    const { data: session, error: sErr } = await member
      .from('time_clock_sessions')
      .insert({ clock_in: new Date().toISOString(), status: 'pending' })
      .select('id')
      .single();
    expect(sErr, sErr?.message).toBeNull();
    const { data: seg, error: gErr } = await member
      .from('time_segments')
      .insert({
        session_id: session!.id,
        segment_type: 'work',
        project_id: fx.futureProject,
        segment_start: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(gErr, gErr?.message).toBeNull();

    // No note -> the CHECK refuses.
    const { error: refused } = await member
      .from('time_segments')
      .update({ segment_end: new Date().toISOString() })
      .eq('id', seg!.id);
    expect(refused).toBeTruthy();
    expect(refused!.message).toContain('time_segments_note_on_end_check');

    // With a note -> accepted. (The refusal above is the criterion; this half
    // proves the state was valid rather than tripping a different constraint.)
    const { error: ok } = await member
      .from('time_segments')
      .update({ segment_end: new Date().toISOString(), note: 'done' })
      .eq('id', seg!.id);
    expect(ok).toBeNull();

    await fx.admin.from('time_segments').delete().eq('session_id', session!.id);
    await fx.admin.from('time_clock_sessions').delete().eq('id', session!.id);
  });
});

// ===========================================================================
// 7c · M-21 — daily log entry (foreman identity for the write)
// ===========================================================================
test.describe('7c · M-21 daily log', () => {
  test.setTimeout(120_000);

  test('work performed is the gate; hazard offers a BLANK 7e and writes no incident (D-29)', async ({
    page,
  }) => {
    await signInAsForeman(page);
    await page.goto(`/m/logs/new?project=${fx.futureProject}`);

    // Required field: nothing else enables submit.
    await expect(page.getByTestId('m-submit-log')).toBeDisabled();
    await page.getByTestId('m-work-performed').fill('Set trusses on the garage.');
    await expect(page.getByTestId('m-submit-log')).toBeEnabled();

    // The hazard toggle demands its notes (the DB CHECK behind the flag).
    await page.getByTestId('m-hazard-toggle').check();
    await expect(page.getByTestId('m-submit-log')).toBeDisabled();
    await page.getByTestId('m-hazard-notes').fill('Open trench along the east side.');
    await expect(page.getByTestId('m-submit-log')).toBeEnabled();

    const logsBefore = await fx.admin
      .from('daily_logs')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', fx.futureProject);
    const incidentsBefore = await fx.admin
      .from('safety_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', COMPANY_A);

    await page.getByTestId('m-submit-log').click();
    await expect(page.getByTestId('m-log-saved')).toBeVisible({ timeout: 30_000 });

    // The log landed...
    const logsAfter = await fx.admin
      .from('daily_logs')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', fx.futureProject);
    expect(logsAfter.count).toBe((logsBefore.count ?? 0) + 1);

    // ...and the D-29 offer is a LINK to a blank, pre-filled 7e.
    const offer = page.getByTestId('m-file-incident-offer');
    await expect(offer).toBeVisible();
    const href = (await offer.getAttribute('href'))!;
    expect(href).toContain(`/m/p/${fx.futureProject}/safety/new`);
    expect(href).toMatch(/date=\d{4}-\d{2}-\d{2}/);

    // Following the offer and LEAVING writes nothing — no draft incident row.
    await offer.click();
    await expect(page.getByTestId('m-file-report')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('m-file-report')).toBeDisabled(); // blank form
    await page.goBack();

    const incidentsAfter = await fx.admin
      .from('safety_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', COMPANY_A);
    expect(incidentsAfter.count).toBe(incidentsBefore.count ?? 0);

    // Cleanup the log.
    const { data: created } = await fx.admin
      .from('daily_logs')
      .select('id')
      .eq('project_id', fx.futureProject)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (created) {
      await fx.admin.from('daily_log_crew').delete().eq('daily_log_id', created.id);
      await fx.admin.from('daily_log_sub_entries').delete().eq('daily_log_id', created.id);
      await fx.admin.from('daily_logs').delete().eq('id', created.id);
    }
  });
});

// ===========================================================================
// 7d · M-22 — delivery check-in: ONLINE-ONLY, RPC-gated
// ===========================================================================
test.describe('7d · M-22 delivery check-in', () => {
  test.setTimeout(120_000);

  test('A-19 · offline it FAILS CLOSED — an explicit message, no Draft pill, no queue entry', async ({
    page,
    context,
  }) => {
    await page.goto(`/m/p/${fx.futureProject}/deliveries/check-in`);
    await page.getByTestId('m-checkin-orderless').click();
    await expect(page.getByTestId('m-checkin-vendor')).toBeVisible();

    await context.setOffline(true);
    // The explicit offline message renders and the submit is refused.
    await expect(page.getByTestId('m-checkin-offline')).toBeVisible();
    await expect(page.getByTestId('m-submit-checkin')).toBeDisabled();
    // NOT a Draft pill — a pill would promise durability D-6 denies.
    await expect(page.getByTestId('m-content')).not.toContainText(/draft/i);
    await context.setOffline(false);
    await expect(page.getByTestId('m-checkin-offline')).toHaveCount(0);
  });

  test('usable = received − damaged; damage demands a photo before submit', async ({ page }) => {
    await page.goto(`/m/p/${fx.futureProject}/deliveries/check-in`);
    await page.getByTestId('m-checkin-orderless').click();
    await page.getByTestId('m-checkin-vendor').fill('Jones Lumber');
    await page.getByTestId('m-checkin-desc').fill('2x6x12 SPF');

    for (let i = 0; i < 5; i++) await page.getByTestId('m-received-0-plus').click();
    await expect(page.getByTestId('m-usable-0')).toHaveText('5');
    await expect(page.getByTestId('m-submit-checkin')).toBeEnabled();

    await page.getByTestId('m-damaged-0-plus').click();
    await page.getByTestId('m-damaged-0-plus').click();
    await expect(page.getByTestId('m-usable-0')).toHaveText('3'); // derived, not stored

    // The card flips to the error treatment AND carries the text strip —
    // never colour alone — and submit is blocked until a photo exists.
    await expect(page.locator('[data-testid="m-checkin-line"][data-damaged="true"]')).toHaveCount(1);
    await expect(page.getByTestId('m-damage-photo-strip')).toContainText(/photo required/i);
    await expect(page.getByTestId('m-submit-checkin')).toBeDisabled();
  });

  test('a clean orderless check-in submits through the RPC gate and lands', async ({ page }) => {
    await signInAsForeman(page);
    await page.goto(`/m/p/${fx.futureProject}/deliveries/check-in`);
    await page.getByTestId('m-checkin-orderless').click();
    await page.getByTestId('m-checkin-vendor').fill('M6MC Vendor');
    await page.getByTestId('m-checkin-desc').fill('Deck screws, 5lb');
    await page.getByTestId('m-received-0-plus').click();
    await page.getByTestId('m-received-0-plus').click();

    await page.getByTestId('m-submit-checkin').click();
    await page.waitForURL(new RegExp(`/m/p/${fx.futureProject}/deliveries$`), {
      timeout: 45_000,
    });

    // The row landed, orderless (no PO), on THIS project — which is the field
    // the handoff's header forgot and §4.12.4 makes M-22 supply.
    const { data: delivery } = await fx.admin
      .from('deliveries')
      .select('id, project_id, purchase_order_id, vendor_name, has_exceptions')
      .eq('project_id', fx.futureProject)
      .eq('vendor_name', 'M6MC Vendor')
      .single();
    expect(delivery).toBeTruthy();
    expect(delivery!.purchase_order_id).toBeNull();
    expect(delivery!.has_exceptions).toBe(false); // the RPC's recompute ran

    // Cleanup.
    await fx.admin.from('delivery_items').delete().eq('delivery_id', delivery!.id);
    const { data: pdfs } = await fx.admin
      .from('files')
      .select('id, file_path')
      .eq('delivery_id', delivery!.id);
    for (const f of pdfs ?? []) {
      await fx.admin.storage.from('project-files').remove([f.file_path]);
    }
    if (pdfs?.length) {
      await fx.admin.from('files').delete().in('id', pdfs.map((f) => f.id));
    }
    await fx.admin.from('deliveries').delete().eq('id', delivery!.id);
  });
});

// ===========================================================================
// 7e · M-23 — incident report
// ===========================================================================
test.describe('7e · M-23 incident report', () => {
  test.setTimeout(120_000);

  test('an injury MUST name a party; the three types are the CHECK, verbatim', async ({
    page,
  }) => {
    await page.goto(`/m/p/${fx.futureProject}/safety/new`);

    const types = await page
      .locator('[data-testid^="m-incident-type-"]')
      .evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).dataset.testid!.replace('m-incident-type-', ''))
      );
    expect(types.sort()).toEqual(['injury', 'near_miss', 'property_damage'].sort());

    await page.getByTestId('m-incident-type-injury').click();
    await page.getByTestId('m-incident-description').fill('Nail gun misfire, right hand.');
    // Injury with no named party — refused (the DB trigger would reject it;
    // the gate keeps the form from composing that payload at all).
    await expect(page.getByTestId('m-file-report')).toBeDisabled();
    await expect(page.getByTestId('m-injured-block')).toBeVisible();

    await page.locator('[data-testid="m-injured-member"]').first().click();
    await expect(page.getByTestId('m-file-report')).toBeEnabled();

    // A near-miss needs no party — the block itself is injury-only.
    await page.getByTestId('m-incident-type-near_miss').click();
    await expect(page.getByTestId('m-injured-block')).toHaveCount(0);
    await expect(page.getByTestId('m-file-report')).toBeEnabled();
  });

  test('filing lands the row with its injured party', async ({ page }) => {
    await signInAsForeman(page);
    await page.goto(`/m/p/${fx.futureProject}/safety/new`);

    await page.getByTestId('m-incident-type-injury').click();
    await page.getByTestId('m-incident-description').fill('M6MC test — slipped on ice at the ramp.');
    await page.locator('[data-testid="m-injured-member"]').first().click();
    await page.getByTestId('m-file-report').click();
    await page.waitForURL(new RegExp(`/m/p/${fx.futureProject}/safety$`), { timeout: 45_000 });

    const { data: incident } = await fx.admin
      .from('safety_incidents')
      .select('id, incident_type, project_id, injuries:safety_incident_injuries(id)')
      .eq('project_id', fx.futureProject)
      .eq('incident_type', 'injury')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(incident).toBeTruthy();
    expect((incident!.injuries as { id: string }[]).length).toBeGreaterThan(0);

    // Cleanup — injuries/witnesses first, then any PDF, then the row.
    await fx.admin.from('safety_incident_injuries').delete().eq('incident_id', incident!.id);
    await fx.admin.from('safety_incident_witnesses').delete().eq('incident_id', incident!.id);
    const { data: pdfs } = await fx.admin
      .from('files')
      .select('id, file_path')
      .eq('safety_incident_id', incident!.id);
    for (const f of pdfs ?? []) {
      await fx.admin.storage.from('project-files').remove([f.file_path]);
    }
    if (pdfs?.length) await fx.admin.from('files').delete().in('id', pdfs.map((f) => f.id));
    await fx.admin.from('safety_incidents').delete().eq('id', incident!.id);
  });
});

// ===========================================================================
// A-7k5 · "on site" comes from COORDINATES — the live board, the surface D-34
// names. Desktop, and D-34 owns the one-line change there.
// ===========================================================================
test.describe('A-7k5 · on-site is a coordinates claim', () => {
  test.setTimeout(120_000);

  test('a denied-permission session never renders as on site; a fix does', async ({ page }) => {
    // Seed: an open session for the fixture's OTHER member (Pat) whose gps_in
    // is a D-34 FAILURE OBJECT — non-null, but not coordinates.
    let { data: denied } = await fx.admin
      .from('time_clock_sessions')
      .insert({
        company_id: COMPANY_A,
        member_id: '9b0380c5-18f9-4c93-88b0-229fd18390c4',
        clock_in: new Date().toISOString(),
        status: 'pending',
        gps_in: { reason: 'permission_denied', error_code: 1 },
      })
      .select('id')
      .single();
    await fx.admin.from('time_segments').insert({
      company_id: COMPANY_A,
      session_id: denied!.id,
      segment_type: 'shop',
      segment_start: new Date().toISOString(),
    });

    try {
      // The live board is a supervisor surface — sign in as the OWNER.
      await page.context().clearCookies();
      await page.goto('/sign-in');
      await page.locator('#email').fill('josh+test50@worthprop.com');
      await page.locator('#password').fill(PASSWORD);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('/dashboard/timeclock/timesheets');
      const board = page.getByText('Pat Manager', { exact: false }).first();
      await expect(board).toBeVisible({ timeout: 30_000 });
      // NON-NULL gps_in with no coordinates renders NO "on site".
      await expect(page.locator('body')).not.toContainText('on site');

      // Flip to real coordinates. NOT an UPDATE — the 6A-2 column-scope
      // trigger on time_clock_sessions refuses a service-role update — so the
      // denied session is recreated with coordinates.
      await fx.admin.from('time_segments').delete().eq('session_id', denied!.id);
      await fx.admin.from('time_clock_sessions').delete().eq('id', denied!.id);
      const { data: fixed } = await fx.admin
        .from('time_clock_sessions')
        .insert({
          company_id: COMPANY_A,
          member_id: '9b0380c5-18f9-4c93-88b0-229fd18390c4',
          clock_in: new Date().toISOString(),
          status: 'pending',
          gps_in: { lat: 33.7, lng: -84.4 },
        })
        .select('id')
        .single();
      await fx.admin.from('time_segments').insert({
        company_id: COMPANY_A,
        session_id: fixed!.id,
        segment_type: 'shop',
        segment_start: new Date().toISOString(),
      });
      denied = fixed;
      await page.reload();
      await expect(page.getByText('on site').first()).toBeVisible({ timeout: 30_000 });
    } finally {
      await fx.admin.from('time_segments').delete().eq('session_id', denied!.id);
      await fx.admin.from('time_clock_sessions').delete().eq('id', denied!.id);
    }
  });
});

// ===========================================================================
// A-7l2 · the D-44 fallback order — recency is per-member and real
// ===========================================================================
test.describe('A-7l2 · recently-used order (foreman identity)', () => {
  test.setTimeout(120_000);

  test('the picker lists the recently-worked project before an alphabetically-earlier one', async ({
    page,
  }) => {
    // The earlier tests in this file clocked the foreman into futureProject,
    // which is FRESHER history than anything seeded here — remove those
    // sessions so the seeded recency is the only recency.
    await closeForemanSessions();

    // History: the foreman worked pastProject RECENTLY. Alphabetically,
    // "M6MC — future target" < "M6MC — past target", so alphabetical order
    // would put future first; recency must put PAST first.
    const { data: hist } = await fx.admin
      .from('time_clock_sessions')
      .insert({
        company_id: COMPANY_A,
        member_id: FOREMAN_MEMBER,
        clock_in: new Date(Date.now() - 3600_000).toISOString(),
        clock_out: new Date(Date.now() - 1800_000).toISOString(),
        status: 'pending',
      })
      .select('id')
      .single();
    await fx.admin.from('time_segments').insert({
      company_id: COMPANY_A,
      session_id: hist!.id,
      segment_type: 'work',
      project_id: fx.pastProject,
      segment_start: new Date(Date.now() - 3600_000).toISOString(),
      segment_end: new Date(Date.now() - 1800_000).toISOString(),
      note: 'm6mc history fixture',
    });

    try {
      await signInAsForeman(page);
      await page.goto('/m/timeclock');
      await page.getByTestId('m-type-work').click();

      // The recency ids arrive ASYNC after mount and re-sort the list — poll
      // rather than reading the first paint, which may still be alphabetical.
      const readOrder = () =>
        page
          .locator('[data-testid="m-clock-project"]')
          .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.projectId));

      await expect
        .poll(
          async () => {
            const order = await readOrder();
            const iPast = order.indexOf(fx.pastProject);
            const iFuture = order.indexOf(fx.futureProject);
            if (iPast < 0 || iFuture < 0) return 'missing';
            // Recency beats the alphabet — the D-44 order, not created_at,
            // not name.
            return iPast < iFuture ? 'recency-first' : `past@${iPast} future@${iFuture}`;
          },
          { timeout: 15_000 }
        )
        .toBe('recency-first');
    } finally {
      await fx.admin.from('time_segments').delete().eq('session_id', hist!.id);
      await fx.admin.from('time_clock_sessions').delete().eq('id', hist!.id);
    }
  });
});

// ===========================================================================
// EVERY CAPTURE SCREEN OWNS AN EXIT [S121]
// ===========================================================================
// §4.12's rule — a capture screen owns its own chrome and its own exits — is
// why `CAPTURE_SCREENS` in mobile-shell.tsx withholds the back chevron from
// `/m/logs/new` and `/m/timeclock/switch`. **Two of the three owned neither**:
// no chevron by that rule and no cancel in the form, and a standalone-display
// PWA has no browser back gesture. Same class as the defect 295c6b5 fixed for
// the detail views, on screens that ruling did not cover.
//
// Surveyed before fixing rather than after: `/m/capture` already carried Back
// and Discard, so the gap was exactly the other two. This asserts all three, so
// a fourth capture screen added later fails here rather than shipping stranded.
test.describe('a capture screen is never a dead end', () => {
  for (const [label, route, exitTestId] of [
    ['M-21 · daily log', '/m/logs/new', 'm-log-cancel'],
    ['M-20 · timeclock switch', '/m/timeclock/switch', 'm-switch-cancel'],
  ] as const) {
    test(`${label} offers a way out before submitting`, async ({ page }) => {
      await page.goto(route);

      // The rule these screens live under: no chevron, by design.
      await expect(page.getByTestId('m-back')).toHaveCount(0);
      // ...which is only acceptable because they carry their own exit.
      //
      // ⚠️ M-20 HAS TWO BRANCHES and the criterion covers both. When the user
      // is not clocked in the screen renders "Not clocked in — there is no
      // segment to switch" and already carried an exit; the GAP was in the
      // clocked-in branch, which had none. The suite's crew identity is not
      // clocked in, so a test that only checked the form branch would have
      // asserted nothing here — both now carry the same testid.
      await expect(page.getByTestId(exitTestId)).toBeVisible();
    });
  }

  test('/m/capture already had one — the control case', async ({ page }) => {
    // ⚠️ NOT REDUNDANT. Without it, a "fix" that added an exit to two screens
    // and removed the one that worked would pass both tests above.
    await page.goto('/m/capture');
    await expect(page.getByTestId('m-capture-back')).toBeVisible();
  });

  test('the exit RETURNS, rather than navigating somewhere fixed', async ({ page }) => {
    // `router.back()` and not a hard-coded route: M-21 is reached from M-6 AND
    // from M-3's "Log the day", so a fixed destination would drop the user
    // somewhere they never were.
    await page.goto('/m/logs');
    await page.getByTestId('m-log-the-day').click();
    await expect(page).toHaveURL(/\/m\/logs\/new/, { timeout: 20_000 });

    await page.getByTestId('m-log-cancel').click();
    await expect(page).toHaveURL(/\/m\/logs$/, { timeout: 20_000 });
  });
});
