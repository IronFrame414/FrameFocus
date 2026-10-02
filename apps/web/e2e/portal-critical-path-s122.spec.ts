import { test, expect, type Page } from '@playwright/test';
import { adminClient } from './hub-fixture';
import { signIn as signInPortal } from './chat-fixture';
import { signInAs } from './sign-in-as';
import { deleteProjects } from '../test-support/company-purge';

// S122 Part 7 [ruling 8; Josh 2026-10-02, report R2.10] — THE PAYLOAD PROOF.
//
// A clean function is not a clean payload: client_critical_path can return
// exactly what it declares while the PAGE still ships float, if the page (or
// anything it renders) computes it and serializes it. That is #136 exactly. So
// this reads what the linked client's page ACTUALLY SENT — the document with its
// `self.__next_f.push(...)` RSC scripts (as e2e/desktop-payload.spec.ts does),
// AND the flight payload a client-side navigation fetches (`RSC: 1`) — never a
// locator, never the function.
//
//   S122CPP (company of the linked client, linked by projects.contact_id):
//   Framing: A(3) → Finish: B(2), crew assigned to A, Critical Path ON. The
//   owner's desktop read computes it (finish Fri 8 Jan); B 2 → 4 and a second
//   read moves it to Tue 12 Jan, so a REAL history row holds the old finish.
//
//   In both payloads: 0 float / critical / duration / assignee / history /
//   status values; and (positive control, so an empty page cannot pass) the
//   projected finish, both phase names, both task titles and the disclaimer.
//   The UNLINKED client's payload carries none of the fixture.

test.use({ timezoneId: 'UTC' });

const OWNER = 'josh+test50@worthprop.com';
const LINKED = 'josh+qa-client-linked@worthprop.com';
const CONTROL = 'josh+qa-client@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const MARKER = 'S122CPP';
const DISCLAIMER = 'The construction industry is fluid and dynamic; these dates are for planning purposes and cannot be guaranteed.';
const admin = adminClient();
let companyId = '';
let projectId = '';
let crewName = '';
const task = { A: '', B: '' };

/** The portal's own formatter (portal-ui.tsx `day`), same machine, same timezone as `next start`. */
const day = (v: string) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

async function sweep() {
  const { data } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  const ids = ((data ?? []) as { id: string }[]).map((p) => p.id);
  if (!ids.length) return;
  const { data: ts } = await admin.from('tasks').select('id').in('project_id', ids);
  const tids = ((ts ?? []) as { id: string }[]).map((r) => r.id);
  await admin.from('notifications').delete().in('project_id', ids);
  await admin.from('task_schedule_edits').delete().in('project_id', ids);
  await admin.from('project_finish_history').delete().in('project_id', ids);
  await admin.from('project_schedule_settings').delete().in('project_id', ids);
  if (tids.length) {
    await admin.from('task_dependencies').delete().in('successor_id', tids);
    await admin.from('task_assignees').delete().in('task_id', tids);
    await admin.from('tasks').delete().in('id', tids);
  }
  await admin.from('phases').delete().in('project_id', ids);
  await admin.from('project_assignments').delete().in('project_id', ids);
  await deleteProjects(admin, ids);
}

async function seed() {
  await sweep();
  const { data: lp } = await admin.from('profiles').select('contact_id, company_id').eq('email', LINKED).single();
  const l = lp as { contact_id: string | null; company_id: string };
  if (!l.contact_id) throw new Error(`${LINKED} is unlinked — run the seed; this proof would be vacuous.`);
  companyId = l.company_id;
  const { data: counters } = await admin.from('companies').select('project_internal_sequence').eq('id', companyId).single();
  const internal = (counters as { project_internal_sequence: number }).project_internal_sequence + 1;
  const { data: p, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      name: `${MARKER} portal`,
      contact_id: l.contact_id,
      status: 'active',
      project_number: `PRJ-${MARKER}`,
      project_internal_seq: internal,
      start_date: '2027-01-04',
    })
    .select('id')
    .single();
  if (error) throw new Error(`project: ${error.message}`);
  await admin.from('companies').update({ project_internal_sequence: internal }).eq('id', companyId);
  projectId = (p as { id: string }).id;
  const phase = async (name: string, sort: number) => {
    const { data, error: e } = await admin.from('phases').insert({ company_id: companyId, project_id: projectId, name, sort_order: sort }).select('id').single();
    if (e) throw new Error(`phase: ${e.message}`);
    return (data as { id: string }).id;
  };
  const framing = await phase('Framing', 1);
  const finish = await phase('Finish', 2);
  const mk = async (title: string, phaseId: string, days: number) => {
    const { data, error: e } = await admin
      .from('tasks')
      .insert({ company_id: companyId, project_id: projectId, title, phase_id: phaseId, duration_days: days })
      .select('id')
      .single();
    if (e) throw new Error(`task: ${e.message}`);
    return (data as { id: string }).id;
  };
  task.A = await mk(`${MARKER} A`, framing, 3);
  task.B = await mk(`${MARKER} B`, finish, 2);
  const d = await admin.from('task_dependencies').insert({ company_id: companyId, predecessor_id: task.A, successor_id: task.B });
  if (d.error) throw new Error(`dep: ${d.error.message}`);
  const { data: cp } = await admin.from('profiles').select('id').eq('email', CREW).single();
  const { data: cm } = await admin
    .from('company_members')
    .select('id, display_name')
    .eq('profile_id', (cp as { id: string }).id)
    .eq('is_deleted', false)
    .single();
  crewName = (cm as { display_name: string }).display_name;
  const ta = await admin.from('task_assignees').insert({ company_id: companyId, task_id: task.A, member_id: (cm as { id: string }).id });
  if (ta.error) throw new Error(`assignee: ${ta.error.message}`);
  const s = await admin.from('project_schedule_settings').insert({ company_id: companyId, project_id: projectId, critical_path_enabled: true });
  if (s.error) throw new Error(`settings: ${s.error.message}`);
}

async function finishNow(): Promise<string | null> {
  const { data } = await admin.from('project_schedule_settings').select('projected_finish').eq('project_id', projectId).single();
  return (data as { projected_finish: string | null }).projected_finish;
}

/** Both payloads the client's browser receives for the page: the document (with its RSC scripts) and the flight data. */
async function payloads(page: Page): Promise<{ html: string; flight: string }> {
  const html = await page.content();
  const res = await page.request.get(`/portal/${projectId}`, { headers: { RSC: '1' } });
  expect(res.ok(), `flight fetch ${res.status()}`).toBe(true);
  return { html, flight: await res.text() };
}

/** Everything the client must never receive, as it would appear if it travelled. */
function leaks(text: string): Record<string, number> {
  const n = (re: RegExp) => (text.match(re) ?? []).length;
  return {
    float: n(/totalFloat|\\?"float\\?"|freeFloat/g),
    critical: n(/isCritical|\\?"critical\\?"|criticalChain/g),
    duration: n(/duration_days|durationDays|days_left|daysLeft/g),
    assignee: n(new RegExp(crewName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) + n(/assignee/gi),
    historyDate: n(/2027-01-08/g) + n(new RegExp(day('2027-01-08'), 'g')),
    history: n(/previous_finish|cause_kind|finish_history/g),
    status: n(/not_started|in_progress\\?"/g),
  };
}
const NONE = { float: 0, critical: 0, duration: 0, assignee: 0, historyDate: 0, history: 0, status: 0 };

test.describe('S122 Part 7 · the client portal payload never carries float', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);
  test.beforeAll(seed);
  test.afterAll(sweep);

  test('owner: the desktop read computes it, then a change moves the finish (a real history row)', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/projects/${projectId}/critical-path`);
    await expect.poll(finishNow, { timeout: 20_000 }).toBe('2027-01-08');
    const u = await admin.from('tasks').update({ duration_days: 4 }).eq('id', task.B);
    if (u.error) throw new Error(u.error.message);
    // The dirty trigger skips the service role by design (mark_schedule_dirty_from_row),
    // so mark it as a user's edit would: the next read recomputes, cause task B.
    const m = await admin
      .from('project_schedule_settings')
      .update({ needs_recompute: true, recompute_cause_kind: 'task', recompute_cause_task_id: task.B })
      .eq('project_id', projectId);
    if (m.error) throw new Error(m.error.message);
    await page.goto(`/dashboard/projects/${projectId}/critical-path`);
    await expect.poll(finishNow, { timeout: 20_000 }).toBe('2027-01-12');
    const { count } = await admin
      .from('project_finish_history')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('previous_finish', '2027-01-08');
    expect(count, 'the old finish exists in history — the value that must never reach the client').toBe(1);
  });

  test('LINKED client: the page renders the view, and NEITHER payload carries float, criticality, durations, people or history', async ({ page }) => {
    await signInPortal(page, LINKED, /\/portal/);
    await page.goto(`/portal/${projectId}`);
    await expect(page.getByTestId('portal-cp')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('portal-cp-finish')).toHaveText(day('2027-01-12'));
    await expect(page.getByTestId('portal-cp-phase')).toHaveCount(2);
    const { html, flight } = await payloads(page);
    for (const [name, text] of [['document', html], ['flight', flight]] as const) {
      // Positive control: the view itself travelled, so the zeros below are about a REAL payload.
      for (const must of [day('2027-01-12'), 'Framing', 'Finish', `${MARKER} A`, `${MARKER} B`, DISCLAIMER]) {
        expect.soft(text.includes(must), `${name} carries "${must}"`).toBe(true);
      }
      // soft: BOTH payloads are always judged and reported (a hard fail on the document hid the flight).
      expect.soft(leaks(text), `${name}: nothing it must not carry`).toEqual(NONE);
    }
  });

  test('UNLINKED client (same company): the page carries none of the fixture', async ({ page }) => {
    await signInPortal(page, CONTROL, /\/portal/);
    await page.goto(`/portal/${projectId}`);
    const html = await page.content();
    for (const never of [`${MARKER} A`, `${MARKER} B`, day('2027-01-12'), 'portal-cp-finish']) {
      expect(html.includes(never), `the unlinked client received "${never}"`).toBe(false);
    }
    // Control that the page did respond (a 404 page, not a crash or a blank).
    expect(html.length).toBeGreaterThan(500);
  });
});
