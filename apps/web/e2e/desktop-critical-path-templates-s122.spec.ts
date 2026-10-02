import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';
import { deleteProjects } from '../test-support/company-purge';

// S122 Part 8 — schedule templates in the Critical Path tab, in a real browser.
//
//   SOURCE (CP on): Framing A(3) → Finish B(2). EMPTY (CP on, no tasks).
//   FULL (CP on, one task).
//   1. The OWNER saves SOURCE as a template from the tab → the notice; the DB
//      holds 2 phases, 2 tasks, 1 link.
//   2. The OWNER stamps it onto EMPTY with Mon 4 Jan 2027 → A Jan 4–6, B Jan 7–8;
//      the tab shows the finish Fri 8 Jan 2027.
//   3. ⚠️ On FULL the tab SAYS the project already has 1 task (the count named)
//      and offers no Stamp button [Josh, RULED: refuse, name how many].
//   4. A PROJECT MANAGER sees the stamp area but no "Save as template".

test.use({ timezoneId: 'UTC' });

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const MARKER = 'S122CPTE';
const admin = adminClient();
const proj = { src: '', empty: '', full: '' };

async function sweep() {
  const { data } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  const ids = ((data ?? []) as { id: string }[]).map((p) => p.id);
  if (ids.length) {
    const { data: ts } = await admin.from('tasks').select('id').in('project_id', ids);
    const tids = ((ts ?? []) as { id: string }[]).map((r) => r.id);
    await admin.from('notifications').delete().in('project_id', ids);
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
  const { data: tpl } = await admin.from('schedule_templates').select('id').like('name', `${MARKER}%`);
  const tplIds = ((tpl ?? []) as { id: string }[]).map((t) => t.id);
  if (tplIds.length) {
    await admin.from('schedule_template_dependencies').delete().in('template_id', tplIds);
    await admin.from('schedule_template_tasks').delete().in('template_id', tplIds);
    await admin.from('schedule_template_phases').delete().in('template_id', tplIds);
    await admin.from('schedule_templates').delete().in('id', tplIds);
  }
}

async function memberOf(email: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: m } = await admin.from('company_members').select('id').eq('profile_id', (p as { id: string }).id).eq('is_deleted', false).single();
  return (m as { id: string }).id;
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
  const pm = await memberOf(PM);
  const make = async (key: keyof typeof proj) => {
    const { data: counters } = await admin.from('companies').select('project_internal_sequence').eq('id', COMPANY_A).single();
    const internal = (counters as { project_internal_sequence: number }).project_internal_sequence + 1;
    const { data: p, error } = await admin
      .from('projects')
      .insert({
        company_id: COMPANY_A,
        name: `${MARKER} ${key}`,
        contact_id: (c as { id: string }).id,
        project_number: `PRJ-${MARKER}-${key}`,
        project_internal_seq: internal,
        start_date: '2027-01-04',
      })
      .select('id')
      .single();
    if (error) throw new Error(`project ${key}: ${error.message}`);
    await admin.from('companies').update({ project_internal_sequence: internal }).eq('id', COMPANY_A);
    proj[key] = (p as { id: string }).id;
    const a = await admin.from('project_assignments').insert({ company_id: COMPANY_A, project_id: proj[key], member_id: pm });
    if (a.error) throw new Error(`assign: ${a.error.message}`);
    const s = await admin.from('project_schedule_settings').insert({ company_id: COMPANY_A, project_id: proj[key], critical_path_enabled: true });
    if (s.error) throw new Error(`settings: ${s.error.message}`);
  };
  await make('src');
  await make('empty');
  await make('full');
  const phase = async (name: string, sort: number) => {
    const { data, error } = await admin.from('phases').insert({ company_id: COMPANY_A, project_id: proj.src, name, sort_order: sort }).select('id').single();
    if (error) throw new Error(`phase: ${error.message}`);
    return (data as { id: string }).id;
  };
  const task = async (projectId: string, title: string, phaseId: string | null, days: number) => {
    const { data, error } = await admin
      .from('tasks')
      .insert({ company_id: COMPANY_A, project_id: projectId, title, phase_id: phaseId, duration_days: days })
      .select('id')
      .single();
    if (error) throw new Error(`task: ${error.message}`);
    return (data as { id: string }).id;
  };
  const A = await task(proj.src, `${MARKER} A`, await phase('Framing', 1), 3);
  const B = await task(proj.src, `${MARKER} B`, await phase('Finish', 2), 2);
  const d = await admin.from('task_dependencies').insert({ company_id: COMPANY_A, predecessor_id: A, successor_id: B });
  if (d.error) throw new Error(`dep: ${d.error.message}`);
  await task(proj.full, `${MARKER} existing`, null, 1);
}

async function tasksOf(projectId: string) {
  const { data } = await admin
    .from('tasks')
    .select('title, start_date, due_date')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('title');
  return (data ?? []) as { title: string; start_date: string | null; due_date: string | null }[];
}

test.describe('S122 Part 8 · schedule templates', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);
  test.beforeAll(seed);
  test.afterAll(sweep);

  test('owner: SAVE the source network as a template from the tab', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/projects/${proj.src}/critical-path`);
    await expect(page.getByTestId('cp-templates')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('tpl-name').fill(`${MARKER} house`);
    await page.getByTestId('tpl-save').click();
    await expect(page.getByTestId('tpl-notice')).toContainText(`Saved "${MARKER} house" as a template`, { timeout: 20_000 });
    const { data: t } = await admin.from('schedule_templates').select('id').eq('name', `${MARKER} house`).eq('is_deleted', false).single();
    const id = (t as { id: string }).id;
    const n = async (table: 'schedule_template_phases' | 'schedule_template_tasks' | 'schedule_template_dependencies') =>
      (await admin.from(table).select('id', { count: 'exact', head: true }).eq('template_id', id)).count ?? 0;
    expect({ phases: await n('schedule_template_phases'), tasks: await n('schedule_template_tasks'), links: await n('schedule_template_dependencies') }).toEqual({
      phases: 2,
      tasks: 2,
      links: 1,
    });
  });

  test('owner: STAMP it onto the empty project with ONE start date → the dates are computed', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/projects/${proj.empty}/critical-path`);
    await expect(page.getByTestId('tpl-select')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('tpl-select')).toContainText(`${MARKER} house (2 tasks)`);
    await page.getByTestId('tpl-select').selectOption({ label: `${MARKER} house (2 tasks)` });
    await page.getByTestId('tpl-start').fill('2027-01-04');
    await page.getByTestId('tpl-stamp').click();
    // Wait for the WHOLE stamp: tasks, then the link, then the recompute. "2 tasks
    // exist" arrives first and is not "stamped" (measured: B still undated there,
    // and once A dated by another read mid-stamp — the stamp's own recompute
    // then writes every date, which is what is asserted).
    await expect
      .poll(async () => (await tasksOf(proj.empty)).filter((t) => t.due_date !== null).length, { timeout: 20_000 })
      .toBe(2);
    await expect
      .poll(async () => (await admin.from('project_finish_history').select('cause_kind').eq('project_id', proj.empty).eq('cause_kind', 'template')).data?.length ?? 0, { timeout: 20_000 })
      .toBe(1);
    expect(await tasksOf(proj.empty)).toEqual([
      { title: `${MARKER} A`, start_date: '2027-01-04', due_date: '2027-01-06' },
      { title: `${MARKER} B`, start_date: '2027-01-07', due_date: '2027-01-08' },
    ]);
    await expect(page.getByTestId('cp-finish')).toHaveText('Fri 8 Jan 2027', { timeout: 20_000 });
  });

  test('⚠️ owner: on a project that already has a task, the tab names the count and offers NO Stamp', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/projects/${proj.full}/critical-path`);
    await expect(page.getByTestId('cp-templates')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('tpl-has-tasks')).toHaveText(
      'This project already has 1 task; stamping would mix two plans. Stamp onto a project with no tasks.'
    );
    await expect(page.getByTestId('tpl-stamp')).toHaveCount(0);
    expect((await tasksOf(proj.full)).length).toBe(1);
  });

  test('project manager: may stamp (the stamp area shows) but may NOT save a template', async ({ page }) => {
    await signInAs(page, PM);
    await page.goto(`/dashboard/projects/${proj.src}/critical-path`);
    await expect(page.getByTestId('cp-templates')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('tpl-has-tasks')).toBeVisible();
    await expect(page.getByTestId('tpl-save')).toHaveCount(0);
    await expect(page.getByTestId('tpl-name')).toHaveCount(0);
  });
});
