import { test, expect, type Page } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';
import { deleteProjects } from '../test-support/company-purge';
import { en, es } from '../lib/i18n/areas/schedule';

// S122 Part 9 — the PHONE BOARD at 402px: what is holding up the job right now.
//
//   CP project from START (the first Monday ≥ 2 days out): A(2) → B(3) → C(1),
//   D(1) in parallel with float. Owner, foreman and crew are on the project.
//   1. OWNER: the card shows A as what holds the job, B and C next, 1 task with
//      room — and NO Gantt (stop: S121 Q12, spec Part 9).
//   2. OWNER extends A 2 → 4 through the card's duration form: the SAME edit
//      sentence as the desktop sheet, then saved through the same route → DB 4.
//   3. ⚠️ FOREMAN extends B: HELD (the sheet path holds a foreman's change, as on
//      desktop) — the DB does not move; one pending row.
//   4. CREW: no card (the desktop tab's roles only).
// Words come from the user's own language (profiles.language) via the same
// dictionary the card uses.

test.use({ viewport: { width: 402, height: 874 }, hasTouch: true, timezoneId: 'UTC' });

const OWNER = 'josh+test50@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const MARKER = 'S122CPM';
const admin = adminClient();
let projectId = '';
const task = { A: '', B: '', C: '', D: '' };

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function nextMonday(): string {
  let d = addDays(new Date().toISOString().slice(0, 10), 2);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
}
const START = nextMonday();

async function words(email: string) {
  const { data } = await admin.from('profiles').select('language').eq('email', email).single();
  return (data as { language: string | null }).language === 'es' ? es : en;
}
async function memberOf(email: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: m } = await admin.from('company_members').select('id').eq('profile_id', (p as { id: string }).id).eq('is_deleted', false).single();
  return (m as { id: string }).id;
}

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
      name: `${MARKER} phone`,
      contact_id: (c as { id: string }).id,
      status: 'active',
      project_number: `PRJ-${MARKER}`,
      project_internal_seq: internal,
      start_date: START,
    })
    .select('id')
    .single();
  if (error) throw new Error(`project: ${error.message}`);
  await admin.from('companies').update({ project_internal_sequence: internal }).eq('id', COMPANY_A);
  projectId = (p as { id: string }).id;
  for (const email of [OWNER, FOREMAN, CREW]) {
    const a = await admin.from('project_assignments').insert({ company_id: COMPANY_A, project_id: projectId, member_id: await memberOf(email) });
    if (a.error) throw new Error(`assign: ${a.error.message}`);
  }
  const mk = async (key: keyof typeof task, days: number) => {
    const { data, error: e } = await admin
      .from('tasks')
      .insert({ company_id: COMPANY_A, project_id: projectId, title: `${MARKER} ${key}`, duration_days: days })
      .select('id')
      .single();
    if (e) throw new Error(`task: ${e.message}`);
    task[key] = (data as { id: string }).id;
  };
  await mk('A', 2);
  await mk('B', 3);
  await mk('C', 1);
  await mk('D', 1);
  for (const [a, b] of [
    [task.A, task.B],
    [task.B, task.C],
  ]) {
    const d = await admin.from('task_dependencies').insert({ company_id: COMPANY_A, predecessor_id: a, successor_id: b });
    if (d.error) throw new Error(`dep: ${d.error.message}`);
  }
  const s = await admin.from('project_schedule_settings').insert({ company_id: COMPANY_A, project_id: projectId, critical_path_enabled: true });
  if (s.error) throw new Error(`settings: ${s.error.message}`);
}

async function duration(id: string): Promise<number | null> {
  const { data } = await admin.from('tasks').select('duration_days').eq('id', id).single();
  return (data as { duration_days: number | null }).duration_days;
}
async function open(page: Page) {
  await page.goto(`/m/p/${projectId}/schedule`);
  await expect(page.getByTestId('m-cp-card')).toBeVisible({ timeout: 20_000 });
}

test.describe('S122 Part 9 · the /m phone board', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);
  test.beforeAll(seed);
  test.afterAll(sweep);

  test('owner: A holds the job, B and C next, 1 task with room — and no Gantt', async ({ page }) => {
    const w = await words(OWNER);
    await signInAs(page, OWNER);
    await open(page);
    const running = page.getByTestId('m-cp-running');
    await expect(running).toHaveAttribute('data-task', task.A);
    await expect(running).toContainText(`${MARKER} A`);
    await expect(running).toContainText(w['sched.cp.m.now']);
    const next = page.getByTestId('m-cp-next');
    await expect(next).toHaveCount(2);
    await expect(next.nth(0)).toHaveAttribute('data-task', task.B);
    await expect(next.nth(1)).toHaveAttribute('data-task', task.C);
    await expect(page.getByTestId('m-cp-room')).toHaveText(w['sched.cp.m.room'].replace('{n}', '1'));
    await expect(page.locator('[data-testid^="gantt"]')).toHaveCount(0);
  });

  test('owner: extends A 2 → 4 through the SHEET path (the desktop sentence), saved', async ({ page }) => {
    const w = await words(OWNER);
    await signInAs(page, OWNER);
    await open(page);
    await page.getByTestId(`m-cp-extend-${task.A}`).click();
    await expect(page.getByTestId('m-cp-days')).toHaveValue('2');
    await page.getByTestId('m-cp-days').fill('4');
    await expect(page.getByTestId('m-cp-preview')).toContainText('Changes the DURATION: 2 working days → 4 working days.');
    await expect(page.getByTestId('m-cp-consequence')).toContainText('later');
    expect(await duration(task.A), 'nothing is written while editing').toBe(2);
    await page.getByTestId('m-cp-save').click();
    await expect(page.getByTestId('m-cp-note')).toHaveText(w['sched.cp.m.saved'], { timeout: 20_000 });
    await expect.poll(() => duration(task.A), { timeout: 20_000 }).toBe(4);
  });

  test('⚠️ foreman: extends B → HELD, the DB does not move, one pending row', async ({ page }) => {
    const w = await words(FOREMAN);
    await signInAs(page, FOREMAN);
    await open(page);
    await page.getByTestId(`m-cp-extend-${task.B}`).click();
    await page.getByTestId('m-cp-days').fill('5');
    await expect(page.getByTestId('m-cp-preview')).toContainText('Changes the DURATION: 3 working days → 5 working days.');
    await page.getByTestId('m-cp-save').click();
    await expect(page.getByTestId('m-cp-note')).toHaveText(w['sched.cp.m.held'], { timeout: 20_000 });
    expect(await duration(task.B)).toBe(3);
    const { data } = await admin.from('task_schedule_edits').select('status, changes').eq('task_id', task.B);
    expect(data).toEqual([{ status: 'pending', changes: { duration_days: 5 } }]);
  });

  test('crew: no card', async ({ page }) => {
    await signInAs(page, CREW);
    await page.goto(`/m/p/${projectId}/schedule`);
    await expect(page.getByTestId('m-day-view')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('m-cp-card')).toHaveCount(0);
  });
});
