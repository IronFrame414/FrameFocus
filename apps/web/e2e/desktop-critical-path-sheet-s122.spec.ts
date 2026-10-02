import { test, expect, type Page } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';
import { deleteProjects } from '../test-support/company-purge';

// S122 Part 3 — the Critical Path line sheet, in a real browser on a real build.
//
// A throwaway project with Critical Path ON and two linked tasks, A(2) → B(3),
// starting Mon 4 Jan 2027 (a fixed future Monday, so the dates do not depend on
// the day the suite runs — unstarted work never starts before today):
//
//   Mon04 Tue05 Wed06 Thu07 Fri08 Mon11 Tue12 Wed13 Thu14 Fri15
//   A─────A     B─────B─────B                                      finish Fri 8 Jan
//
//   1. THE READ-CHECK: the tasks are inserted undated; opening the page computes
//      and writes their dates before they are shown.
//   2. A DURATION edit is NAMED before saving, with its consequence
//      ("Fri 8 Jan → Tue 12 Jan, 2 working days later"); Save writes it through.
//   3. A START ANCHOR is a PIN: named as such, and once saved it is MARKED on the
//      sheet, on the task list row AND on the Gantt bar [Josh, Q19].
//   4. RELEASE is one action, and the engine moves the task freely again.
// Every outcome is read with the service role.

test.use({ timezoneId: 'UTC' });

const OWNER = 'josh+test50@worthprop.com';
const MARKER = 'S122CPE';
const admin = adminClient();
let projectId = '';
const task: Record<'A' | 'B', string> = { A: '', B: '' };

async function sweep() {
  const { data } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  const ids = ((data ?? []) as { id: string }[]).map((p) => p.id);
  if (!ids.length) return;
  const { data: ts } = await admin.from('tasks').select('id').in('project_id', ids);
  const tids = ((ts ?? []) as { id: string }[]).map((r) => r.id);
  await admin.from('project_finish_history').delete().in('project_id', ids);
  await admin.from('project_schedule_settings').delete().in('project_id', ids);
  if (tids.length) {
    await admin.from('task_dependencies').delete().in('predecessor_id', tids);
    await admin.from('task_dependencies').delete().in('successor_id', tids);
    await admin.from('task_assignees').delete().in('task_id', tids);
    await admin.from('tasks').delete().in('id', tids);
  }
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
  const { data: counters } = await admin
    .from('companies')
    .select('project_internal_sequence')
    .eq('id', COMPANY_A)
    .single();
  const internal = (counters as { project_internal_sequence: number }).project_internal_sequence + 1;
  const { data: p, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: COMPANY_A,
      name: `${MARKER} sheet`,
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
  for (const [k, d] of [['A', 2], ['B', 3]] as const) {
    const { data: t, error } = await admin
      .from('tasks')
      .insert({ company_id: COMPANY_A, project_id: projectId, title: `${MARKER} ${k}`, duration_days: d })
      .select('id')
      .single();
    if (error) throw new Error(`task ${k}: ${error.message}`);
    task[k] = (t as { id: string }).id;
  }
  const l = await admin
    .from('task_dependencies')
    .insert({ company_id: COMPANY_A, predecessor_id: task.A, successor_id: task.B });
  if (l.error) throw new Error(`link: ${l.error.message}`);
  const s = await admin
    .from('project_schedule_settings')
    .insert({ company_id: COMPANY_A, project_id: projectId, critical_path_enabled: true });
  if (s.error) throw new Error(`settings: ${s.error.message}`);
}

async function row(id: string) {
  const { data } = await admin
    .from('tasks')
    .select('start_date, due_date, duration_days, start_constraint, constraint_date')
    .eq('id', id)
    .single();
  return data as {
    start_date: string | null;
    due_date: string | null;
    duration_days: number | null;
    start_constraint: string | null;
    constraint_date: string | null;
  };
}

async function finish() {
  const { data } = await admin
    .from('project_schedule_settings')
    .select('projected_finish')
    .eq('project_id', projectId)
    .single();
  return (data as { projected_finish: string | null }).projected_finish;
}

async function openB(page: Page) {
  // [S122 Part 6] Wait for the PREVIOUS sheet to close first: the save now also
  // notifies (after the dates are written), so "the DB has the date" no longer
  // means "the UI's save returned". Without this, the visibility check below was
  // satisfied by the still-open old sheet (measured: 2 of 5 red on one build).
  await expect(page.getByTestId('cp-fields')).toHaveCount(0, { timeout: 20_000 });
  await page.getByRole('button', { name: new RegExp(`${MARKER} B`) }).first().click();
  await expect(page.getByTestId('cp-fields')).toBeVisible();
}

test.describe('S122 Part 3 · the Critical Path line sheet', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);
  test.beforeAll(seed);
  test.afterAll(sweep);

  test('read-check, a named duration edit, a pin marked on sheet + list + Gantt, and a one-action release', async ({
    page,
  }) => {
    expect((await row(task.B)).start_date, 'seeded undated').toBeNull();
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/projects/${projectId}/schedule`);

    // 1. THE READ-CHECK — the page rendered the dates the engine wrote.
    await expect(page.getByRole('button', { name: new RegExp(`${MARKER} B`) }).first()).toContainText(
      '2027-01-06 → 2027-01-08'
    );
    expect(await row(task.B)).toMatchObject({ start_date: '2027-01-06', due_date: '2027-01-08' });
    expect(await finish()).toBe('2027-01-08');

    // 2. A DURATION edit, named and previewed BEFORE saving.
    await openB(page);
    await expect(page.getByTestId('cp-computed')).toContainText('Wed 6 Jan → Fri 8 Jan');
    await page.getByTestId('cp-duration').fill('5');
    await expect(page.getByTestId('cp-edit-duration')).toHaveText(
      'Changes the DURATION: 3 working days → 5 working days.'
    );
    await expect(page.getByTestId('cp-consequence')).toHaveText(
      'This moves the projected finish from Fri 8 Jan to Tue 12 Jan (2 working days later).'
    );
    expect((await row(task.B)).duration_days, 'nothing is written while editing').toBe(3);
    await page.getByRole('button', { name: 'Save Task' }).click();
    await expect.poll(async () => (await row(task.B)).due_date, { timeout: 20_000 }).toBe('2027-01-12');
    expect(await row(task.B)).toMatchObject({ duration_days: 5, start_date: '2027-01-06' });
    expect(await finish()).toBe('2027-01-12');

    // 3. A START ANCHOR — a pin — named before saving, then marked everywhere.
    await openB(page);
    await page.getByTestId('cp-anchor').selectOption('not_before');
    await page.getByTestId('cp-anchor-date').fill('2027-01-11');
    await expect(page.getByTestId('cp-edit-anchor')).toHaveText('Sets a START ANCHOR: pinned: not before Mon 11 Jan.');
    await expect(page.getByTestId('cp-consequence')).toHaveText(
      'This moves the projected finish from Tue 12 Jan to Fri 15 Jan (3 working days later).'
    );
    await page.getByRole('button', { name: 'Save Task' }).click();
    // Poll the RECOMPUTED date: the route writes the pin first, then recomputes.
    await expect.poll(async () => (await row(task.B)).due_date, { timeout: 20_000 }).toBe('2027-01-15');
    expect(await row(task.B)).toMatchObject({
      start_constraint: 'not_before',
      constraint_date: '2027-01-11',
      start_date: '2027-01-11',
      due_date: '2027-01-15',
    });
    // After the save's refresh lands (20s: measured red at the 5s default under
    // local parallel load in S122 Part 5's regression run; green with one worker).
    await expect(page.getByTestId(`task-pinned-${task.B}`)).toHaveText('Pinned · not before Mon 11 Jan', { timeout: 20_000 });
    await expect(page.getByTestId(`task-pinned-${task.A}`)).toHaveCount(0);
    await page.getByRole('button', { name: 'Gantt', exact: true }).click();
    await expect(page.getByTestId(`gantt-pinned-${task.B}`)).toBeVisible();
    await expect(page.getByTestId(`gantt-pinned-${task.A}`)).toHaveCount(0);
    await page.getByRole('button', { name: 'Tasks', exact: true }).click();

    // 4. RELEASE — one action; the schedule moves the task freely again.
    await openB(page);
    await expect(page.getByTestId('cp-pinned')).toHaveText('Pinned · not before Mon 11 Jan');
    await page.getByTestId('cp-release').click();
    await expect.poll(async () => (await row(task.B)).due_date, { timeout: 20_000 }).toBe('2027-01-12');
    expect(await row(task.B)).toMatchObject({ start_constraint: null, constraint_date: null, start_date: '2027-01-06', due_date: '2027-01-12' });
    await expect(page.getByTestId(`task-pinned-${task.B}`)).toHaveCount(0);

    // The history: enabled (→ 8 Jan), duration (→ 12 Jan), pin (→ 15 Jan), release (→ 12 Jan).
    const { data: h } = await admin
      .from('project_finish_history')
      .select('previous_finish, new_finish, cause_kind, cause_task_id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    expect(h).toEqual([
      { previous_finish: null, new_finish: '2027-01-08', cause_kind: 'enabled', cause_task_id: null },
      { previous_finish: '2027-01-08', new_finish: '2027-01-12', cause_kind: 'task', cause_task_id: task.B },
      { previous_finish: '2027-01-12', new_finish: '2027-01-15', cause_kind: 'task', cause_task_id: task.B },
      { previous_finish: '2027-01-15', new_finish: '2027-01-12', cause_kind: 'task', cause_task_id: task.B },
    ]);
  });
});
