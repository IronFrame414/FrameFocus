import { test, expect, type Page } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';
import { deleteProjects } from '../test-support/company-purge';

// S122 Part 4 — Projects → Work → Critical Path, in a real browser on a real
// build. A throwaway project, the DIAMOND, from Mon 4 Jan 2027 (a fixed future
// Monday, so nothing depends on the day the suite runs):
//
//   A(2) → B(5) → D(1)        Mon04 Tue05 Wed06 Thu07 Fri08 Mon11 Tue12 Wed13 Thu14 Fri15
//   A(2) → C(3) → D(1)        A A   B B B B B (to Tue12)   D Wed13      finish Wed 13 Jan
//                                   C C C (to Fri08): FLOAT 2
//
//   1. TURN IT ON, with the client-notification box ticked at that moment (ruling 12).
//   2. The headline, the chain (A → B → D; C is not on it), the float table
//      (C 2), the network's tones (critical red, float blue) and C's slack ghost.
//   3. The slip simulator: C slips 3 → "Wed 13 Jan → Thu 14 Jan", C newly
//      critical — and NOTHING is saved.
//   4. A WEATHER day (Thu 7 Jan, ⚡) is listed AND drawn on the schedule; the
//      finish moves to Thu 14 Jan and the headline says a weather day caused it.
//   5. The END of C's bar dragged two days → the confirm NAMES the edit (a
//      DURATION, 3 → 5) and its consequence (the finish stays Thu 14 Jan)
//      BEFORE saving [Josh, Q19]; saved, C is critical.
//   6. A company HOLIDAY (Tue 12 Jan) set in Company settings → the finish
//      moves to Fri 15 Jan, caused by a company holiday.
//   7. A foreman sees the tab but cannot change it; crew are sent to Schedule.
// Every outcome is read with the service role.

test.use({ timezoneId: 'UTC' });

const OWNER = 'josh+test50@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const MARKER = 'S122CPT';
const HOLIDAY = '2027-01-12';
const admin = adminClient();
let projectId = '';
const task: Record<'A' | 'B' | 'C' | 'D', string> = { A: '', B: '', C: '', D: '' };

async function memberOf(email: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', (p as { id: string }).id)
    .eq('is_deleted', false)
    .single();
  return (m as { id: string }).id;
}

async function sweep() {
  await admin.from('company_holidays').delete().eq('company_id', COMPANY_A).like('name', `${MARKER}%`);
  const { data } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  const ids = ((data ?? []) as { id: string }[]).map((p) => p.id);
  if (!ids.length) return;
  const { data: ts } = await admin.from('tasks').select('id').in('project_id', ids);
  const tids = ((ts ?? []) as { id: string }[]).map((r) => r.id);
  await admin.from('project_finish_history').delete().in('project_id', ids);
  await admin.from('project_schedule_settings').delete().in('project_id', ids);
  await admin.from('project_lost_days').delete().in('project_id', ids);
  if (tids.length) {
    await admin.from('task_dependencies').delete().in('predecessor_id', tids);
    await admin.from('task_dependencies').delete().in('successor_id', tids);
    await admin.from('task_assignees').delete().in('task_id', tids);
    await admin.from('tasks').delete().in('id', tids);
  }
  await admin.from('project_assignments').delete().in('project_id', ids);
  await deleteProjects(admin, ids);
}

async function seed() {
  await sweep();
  const { data: c, error: cErr } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  if (cErr) throw new Error(`contact: ${cErr.message}`);
  const { data: counters } = await admin.from('companies').select('project_internal_sequence').eq('id', COMPANY_A).single();
  const internal = (counters as { project_internal_sequence: number }).project_internal_sequence + 1;
  const { data: p, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: COMPANY_A,
      name: `${MARKER} tab`,
      contact_id: (c as { id: string }).id,
      project_number: `PRJ-${MARKER}`,
      project_internal_seq: internal,
      start_date: '2027-01-04',
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`project: ${pErr.message}`);
  await admin.from('companies').update({ project_internal_sequence: internal }).eq('id', COMPANY_A);
  projectId = (p as { id: string }).id;
  for (const [k, d] of [['A', 2], ['B', 5], ['C', 3], ['D', 1]] as const) {
    const { data: t, error } = await admin
      .from('tasks')
      .insert({ company_id: COMPANY_A, project_id: projectId, title: `${MARKER} ${k}`, duration_days: d })
      .select('id')
      .single();
    if (error) throw new Error(`task ${k}: ${error.message}`);
    task[k] = (t as { id: string }).id;
  }
  for (const [a, b] of [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']] as const) {
    const l = await admin.from('task_dependencies').insert({ company_id: COMPANY_A, predecessor_id: task[a], successor_id: task[b] });
    if (l.error) throw new Error(`link: ${l.error.message}`);
  }
  // The foreman and the crew member are ON the project, so what they cannot do is the rule's, not visibility.
  for (const email of [FOREMAN, CREW]) {
    const a = await admin
      .from('project_assignments')
      .insert({ company_id: COMPANY_A, project_id: projectId, member_id: await memberOf(email) });
    if (a.error) throw new Error(`assign ${email}: ${a.error.message}`);
  }
}

async function settings() {
  const { data } = await admin
    .from('project_schedule_settings')
    .select('critical_path_enabled, notify_client, projected_finish')
    .eq('project_id', projectId)
    .maybeSingle();
  return data as { critical_path_enabled: boolean; notify_client: boolean; projected_finish: string | null } | null;
}
async function latestCause() {
  const { data } = await admin
    .from('project_finish_history')
    .select('cause_kind, new_finish')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { cause_kind: string; new_finish: string } | null;
}
async function taskRow(id: string) {
  const { data } = await admin.from('tasks').select('duration_days, start_date, due_date').eq('id', id).single();
  return data as { duration_days: number | null; start_date: string | null; due_date: string | null };
}
const tab = (page: Page) => page.goto(`/dashboard/projects/${projectId}/critical-path`);

test.describe('S122 Part 4 · the Critical Path tab', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);
  test.beforeAll(seed);
  test.afterAll(sweep);

  test('owner: turn it on, read it, simulate, a weather day, drag an end (named before saving), a holiday', async ({ page }) => {
    await signInAs(page, OWNER);
    await tab(page);

    // 1. Turn it on, choosing client notification now (ruling 12).
    await expect(page.getByTestId('cp-enable')).toBeVisible();
    expect(await settings(), 'off before').toBeNull();
    await page.getByTestId('cp-enable-notify-client').check();
    await page.getByTestId('cp-enable-button').click();
    await expect(page.getByTestId('cp-tab')).toBeVisible({ timeout: 20_000 });
    expect(await settings()).toMatchObject({ critical_path_enabled: true, notify_client: true, projected_finish: '2027-01-13' });
    expect(await latestCause()).toEqual({ cause_kind: 'enabled', new_finish: '2027-01-13' });

    // The default-calendar banner reflects the company's actual state.
    const { count: cals } = await admin
      .from('company_work_calendars')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', COMPANY_A)
      .eq('is_deleted', false);
    await expect(page.getByTestId('cp-default-calendar')).toHaveCount(cals ? 0 : 1);

    // 2. Headline, chain, float, tones, slack.
    await expect(page.getByTestId('cp-finish')).toHaveText('Wed 13 Jan 2027');
    for (const k of ['A', 'B', 'D'] as const) await expect(page.getByTestId(`cp-chain-${task[k]}`)).toBeVisible();
    await expect(page.getByTestId(`cp-chain-${task.C}`)).toHaveCount(0);
    await expect(page.getByTestId(`cp-float-${task.C}`)).toHaveText('2');
    await expect(page.getByTestId(`cp-float-${task.B}`)).toHaveText('0');
    await expect(page.locator(`[data-testid="gantt-bar"][data-task-id="${task.C}"]`)).toHaveAttribute('data-tone', 'float');
    await expect(page.locator(`[data-testid="gantt-bar"][data-task-id="${task.B}"]`)).toHaveAttribute('data-tone', 'critical');
    await expect(page.getByTestId(`gantt-slack-${task.C}`)).toBeVisible();

    // 3. The slip simulator — nothing saved.
    await page.getByTestId('cp-sim-task').selectOption(task.C);
    await page.getByTestId('cp-sim-days').fill('3');
    await expect(page.getByTestId('cp-sim-result')).toContainText(
      'This moves the projected finish from Wed 13 Jan to Thu 14 Jan (1 working day later).'
    );
    await expect(page.getByTestId('cp-sim-newly-critical')).toHaveText(`Newly critical: ${MARKER} C.`);
    expect((await taskRow(task.C)).duration_days, 'the simulator saves nothing').toBe(3);

    // 4. A weather day, listed AND drawn on the schedule.
    await page.getByTestId('cp-weather-start').fill('2027-01-07');
    await page.getByTestId('cp-weather-icon').selectOption('lightning');
    await page.getByTestId('cp-weather-reason').fill('storm');
    await page.getByTestId('cp-weather-add').click();
    await expect(page.getByTestId('cp-weather-2027-01-07')).toContainText('⚡');
    await expect(page.getByTestId('gantt-weather-2027-01-07')).toHaveText('⚡');
    await expect(page.getByTestId('cp-finish')).toHaveText('Thu 14 Jan 2027');
    await expect(page.getByTestId('cp-moved')).toContainText('Moved 1 working day later');
    await expect(page.getByTestId('cp-moved')).toContainText('caused by a weather day');
    expect(await latestCause()).toEqual({ cause_kind: 'weather', new_finish: '2027-01-14' });
    expect(await taskRow(task.C)).toMatchObject({ start_date: '2027-01-06', due_date: '2027-01-11' });

    // 5. Drag the END of C's bar two days (to Wed 13) — the edit is named first.
    const handle = page.getByTestId(`gantt-extend-${task.C}`);
    await handle.scrollIntoViewIfNeeded();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 56, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    const dialog = page.getByTestId('confirm-dialog');
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toContainText('Changes the DURATION: 3 working days → 5 working days.');
    await expect(dialog).toContainText('The projected finish stays Thu 14 Jan.');
    expect((await taskRow(task.C)).duration_days, 'nothing saved before the confirm').toBe(3);
    await page.getByTestId('confirm-accept').click();
    await expect.poll(async () => (await taskRow(task.C)).due_date, { timeout: 20_000 }).toBe('2027-01-13');
    expect((await taskRow(task.C)).duration_days).toBe(5);
    await expect(page.getByTestId(`cp-chain-${task.C}`)).toBeVisible({ timeout: 20_000 });

    // 6. A company holiday, set in Company settings.
    await page.goto('/dashboard/settings?tab=schedule');
    await expect(page.getByTestId('work-calendar-settings')).toBeVisible();
    await page.getByTestId('holiday-date').fill(HOLIDAY);
    await page.getByTestId('holiday-name').fill(`${MARKER} holiday`);
    await page.getByTestId('holiday-add').click();
    await expect(page.getByTestId(`holiday-${HOLIDAY}`)).toBeVisible({ timeout: 20_000 });
    await tab(page);
    await expect(page.getByTestId('cp-finish')).toHaveText('Fri 15 Jan 2027');
    await expect(page.getByTestId('cp-moved')).toContainText('caused by a company holiday');
    expect(await latestCause()).toEqual({ cause_kind: 'holiday', new_finish: '2027-01-15' });
  });

  test('a FOREMAN sees the tab and cannot change it; CREW are sent to Schedule', async ({ page }) => {
    await signInAs(page, FOREMAN);
    await tab(page);
    await expect(page.getByTestId('cp-tab')).toBeVisible();
    await expect(page.getByTestId('cp-finish')).toHaveText('Fri 15 Jan 2027'); // the page rendered
    await expect(page.locator('[data-testid^="gantt-extend-"]')).toHaveCount(0);
    await expect(page.getByTestId('cp-weather-add')).toHaveCount(0);
    await expect(page.getByTestId('cp-history'), 'Q18-A: a foreman does not read the history').toHaveCount(0);

    await page.context().clearCookies();
    await signInAs(page, CREW);
    await tab(page);
    await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${projectId}/schedule`));
    await expect(page.getByTestId('project-subtab-critical-path')).toHaveCount(0);
  });
});
