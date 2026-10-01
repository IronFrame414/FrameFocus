import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';
import { deleteProjects } from '../test-support/company-purge';

// S122 Part 5 — a foreman's schedule change is HELD, VISIBLE and decided inside
// the Critical Path tab [Josh, ruling 7 + 2026-10-01], in a real browser.
//
//   T(3) from Mon 4 Jan 2027: Mon04–Wed06, finish Wed 6 Jan.
//   1. The FOREMAN changes T's duration to 5 in the sheet and saves. The row is
//      GRAYED and marked PENDING, with the edit named and its consequence
//      ("If approved: … Wed 6 Jan to Fri 8 Jan …") — and the database dates do
//      NOT move. The Gantt bar is marked pending too.
//   2. The foreman sees WITHDRAW on their own change, never Approve.
//   3. The OWNER approves it inside the tab: T Mon04–Fri08, the pending notice
//      is gone, and the history says `approval`.
// Every outcome is read with the service role.

test.use({ timezoneId: 'UTC' });

const OWNER = 'josh+test50@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const MARKER = 'S122CPHE';
const admin = adminClient();
let projectId = '';
let taskT = '';

async function sweep() {
  const { data } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  const ids = ((data ?? []) as { id: string }[]).map((p) => p.id);
  if (!ids.length) return;
  const { data: ts } = await admin.from('tasks').select('id').in('project_id', ids);
  const tids = ((ts ?? []) as { id: string }[]).map((r) => r.id);
  await admin.from('task_schedule_edits').delete().in('project_id', ids);
  await admin.from('project_finish_history').delete().in('project_id', ids);
  await admin.from('project_schedule_settings').delete().in('project_id', ids);
  if (tids.length) {
    await admin.from('task_assignees').delete().in('task_id', tids);
    await admin.from('tasks').delete().in('id', tids);
  }
  await admin.from('project_assignments').delete().in('project_id', ids);
  await deleteProjects(admin, ids);
}

async function seed() {
  await sweep();
  const { data: c } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  const { data: counters } = await admin.from('companies').select('project_internal_sequence').eq('id', COMPANY_A).single();
  const internal = (counters as { project_internal_sequence: number }).project_internal_sequence + 1;
  const { data: p, error } = await admin
    .from('projects')
    .insert({
      company_id: COMPANY_A,
      name: `${MARKER} held`,
      contact_id: (c as { id: string }).id,
      project_number: `PRJ-${MARKER}`,
      project_internal_seq: internal,
      start_date: '2027-01-04',
    })
    .select('id')
    .single();
  if (error) throw new Error(`project: ${error.message}`);
  await admin.from('companies').update({ project_internal_sequence: internal }).eq('id', COMPANY_A);
  projectId = (p as { id: string }).id;
  const { data: t, error: tErr } = await admin
    .from('tasks')
    .insert({ company_id: COMPANY_A, project_id: projectId, title: `${MARKER} T`, duration_days: 3 })
    .select('id')
    .single();
  if (tErr) throw new Error(`task: ${tErr.message}`);
  taskT = (t as { id: string }).id;
  const { data: fp } = await admin.from('profiles').select('id').eq('email', FOREMAN).single();
  const { data: fm } = await admin.from('company_members').select('id').eq('profile_id', (fp as { id: string }).id).eq('is_deleted', false).single();
  const a = await admin.from('project_assignments').insert({ company_id: COMPANY_A, project_id: projectId, member_id: (fm as { id: string }).id });
  if (a.error) throw new Error(`assign: ${a.error.message}`);
  const s = await admin.from('project_schedule_settings').insert({ company_id: COMPANY_A, project_id: projectId, critical_path_enabled: true });
  if (s.error) throw new Error(`settings: ${s.error.message}`);
}

async function rowT() {
  const { data } = await admin.from('tasks').select('duration_days, start_date, due_date').eq('id', taskT).single();
  return data as { duration_days: number; start_date: string | null; due_date: string | null };
}
async function pendingRows() {
  const { data } = await admin.from('task_schedule_edits').select('id, status').eq('project_id', projectId);
  return (data ?? []) as { id: string; status: string }[];
}

test.describe('S122 Part 5 · a held change', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);
  test.beforeAll(seed);
  test.afterAll(sweep);

  test('foreman: the change is held — grayed, pending, named, consequence stated — and moves no date', async ({ page }) => {
    await signInAs(page, FOREMAN);
    await page.goto(`/dashboard/projects/${projectId}/schedule`);
    const row = page.getByRole('button', { name: new RegExp(`${MARKER} T`) }).first();
    await expect(row).toContainText('2027-01-04 → 2027-01-06'); // the read-check computed it
    await row.click();
    await expect(page.getByTestId('cp-fields')).toBeVisible();
    await page.getByTestId('cp-duration').fill('5');
    await expect(page.getByTestId('cp-edit-duration')).toHaveText('Changes the DURATION: 3 working days → 5 working days.');
    await page.getByRole('button', { name: 'Save Task' }).click();

    const note = page.getByTestId(`task-pending-${taskT}`);
    await expect(note).toBeVisible({ timeout: 20_000 });
    await expect(note).toContainText('Pending');
    await expect(note).toContainText('Changes the DURATION: 3 working days → 5 working days.');
    await expect(note).toContainText('If approved: This moves the projected finish from Wed 6 Jan to Fri 8 Jan (2 working days later).');
    await expect(page.getByTestId(`task-row-pending-${taskT}`)).toBeVisible();
    // ⚠️ The date stays put (stop rule 9).
    expect(await rowT()).toEqual({ duration_days: 3, start_date: '2027-01-04', due_date: '2027-01-06' });
    await expect(row).toContainText('2027-01-04 → 2027-01-06');
    expect((await pendingRows()).filter((r) => r.status === 'pending')).toHaveLength(1);

    await page.getByRole('button', { name: 'Gantt', exact: true }).click();
    await expect(page.getByTestId(`gantt-pending-${taskT}`)).toBeVisible();

    // 2. On the tab the foreman can withdraw their own change, never approve it.
    await page.goto(`/dashboard/projects/${projectId}/critical-path`);
    const pid = (await pendingRows()).find((r) => r.status === 'pending')!.id;
    await expect(page.getByTestId(`cp-pending-${pid}`)).toBeVisible();
    await expect(page.getByTestId(`cp-withdraw-${pid}`)).toBeVisible();
    await expect(page.getByTestId(`cp-approve-${pid}`)).toHaveCount(0);
  });

  test('owner: approves it inside the Critical Path tab — the dates move, history says approval', async ({ page }) => {
    const pid = (await pendingRows()).find((r) => r.status === 'pending')!.id;
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/projects/${projectId}/critical-path`);
    await expect(page.getByTestId(`cp-pending-summary-${pid}`)).toHaveText('Changes the DURATION: 3 working days → 5 working days.');
    await expect(page.getByTestId(`cp-pending-consequence-${pid}`)).toHaveText(
      'If approved: This moves the projected finish from Wed 6 Jan to Fri 8 Jan (2 working days later).'
    );
    await expect(page.getByTestId('cp-finish')).toHaveText('Wed 6 Jan 2027');
    await page.getByTestId(`cp-approve-${pid}`).click();
    await expect.poll(async () => (await rowT()).due_date, { timeout: 20_000 }).toBe('2027-01-08');
    expect(await rowT()).toEqual({ duration_days: 5, start_date: '2027-01-04', due_date: '2027-01-08' });
    await expect(page.getByTestId('cp-finish')).toHaveText('Fri 8 Jan 2027');
    await expect(page.getByTestId(`cp-pending-${pid}`)).toHaveCount(0);
    expect((await pendingRows()).find((r) => r.id === pid)?.status).toBe('approved');
    const { data: h } = await admin
      .from('project_finish_history')
      .select('cause_kind, new_finish')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(h).toEqual({ cause_kind: 'approval', new_finish: '2027-01-08' });
  });
});
