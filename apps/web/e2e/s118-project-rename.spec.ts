import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S118 item 14 — the Owner renames a project from its header; the new name is
// what the app shows; the rename is logged. A PM on the project sees no Rename
// control (the database refuses the write too — s118-project-rename.live.ts).

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const RUN = `S118RN-${Date.now()}`;
const admin = adminClient();
let projectId = '';
let original = '';

test.beforeAll(async () => {
  const { data: pm } = await admin.from('profiles').select('id').eq('email', PM).single();
  const { data: m } = await admin.from('company_members').select('id').eq('profile_id', pm!.id).single();
  const { data: asg, error } = await admin
    .from('project_assignments')
    .select('project_id, created_at, projects!inner(name, is_deleted, company_id)')
    .eq('member_id', m!.id)
    .eq('is_deleted', false)
    .eq('projects.is_deleted', false)
    .eq('projects.company_id', COMPANY_A)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error || !asg) throw new Error(`no Company A project assigned to the PM: ${error?.message}`);
  projectId = asg.project_id as string;
  original = (asg as unknown as { projects: { name: string } }).projects.name;
});

test.afterAll(async () => {
  await admin.from('projects').update({ name: original }).eq('id', projectId);
  await admin.from('project_name_history').delete().eq('project_id', projectId).or(`new_name.like.${RUN}%,old_name.like.${RUN}%`);
  const { data } = await admin.from('projects').select('name').eq('id', projectId).single();
  expect(data!.name, 'project name restored').toBe(original);
});

test.describe.serial('S118 item 14 · rename a project', () => {
  test.setTimeout(120_000);

  test('the Owner renames it from the header; the header shows the new name; the rename is logged', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/projects/${projectId}`);
    await page.getByTestId('project-rename').click();
    await page.getByTestId('project-rename-input').fill(`${RUN} renamed job`);
    await page.getByTestId('project-rename-save').click();
    await expect(page.getByRole('heading', { level: 2, name: `${RUN} renamed job` })).toBeVisible({ timeout: 30_000 });
    const { data } = await admin.from('projects').select('name').eq('id', projectId).single();
    expect(data!.name).toBe(`${RUN} renamed job`);
    const { data: log } = await admin
      .from('project_name_history')
      .select('old_name, new_name')
      .eq('project_id', projectId)
      .eq('new_name', `${RUN} renamed job`);
    expect(log).toEqual([{ old_name: original, new_name: `${RUN} renamed job` }]);
  });

  test('a PM on the project sees no Rename control', async ({ page }) => {
    await signInAs(page, PM);
    await page.goto(`/dashboard/projects/${projectId}`);
    await expect(page.getByRole('heading', { level: 2, name: `${RUN} renamed job` })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('project-rename')).toHaveCount(0);
  });
});
