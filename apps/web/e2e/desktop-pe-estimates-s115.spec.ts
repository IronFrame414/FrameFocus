import { test, expect } from '@playwright/test';
import { adminClient } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S115 R11 — the Project Executive reads the estimate behind ITS project's
// proposal, markup and margin included; it cannot author, edit or send.
//
// The database already returned these rows (estimates_select_project_executive,
// 20261830000000); what blocked the PE was four page redirects, the
// proposal-data API and the nav. This proves the screens now open — and that
// the database, not the screen, still decides WHICH estimates: an estimate on a
// project the PE is not assigned to stays out of reach.
//
// The PE holds no standing assignment on rebuild-test, so this spec assigns it
// to one project for its own duration and removes exactly that row after.

const PE = 'josh+qa-pe@worthprop.com';
const admin = adminClient();

let mine = { estimateId: '', projectId: '', name: '' };
let other = { estimateId: '' };
let assignmentId = '';

test.beforeAll(async () => {
  const { data: prof } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('email', PE)
    .single();
  const { data: member } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', prof!.id)
    .single();

  // Two converted estimates on two different projects; ordered, so stable.
  const { data: conv } = await admin
    .from('estimates')
    .select('id, name, project_id')
    .eq('company_id', prof!.company_id)
    .eq('is_deleted', false)
    .not('project_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(10);
  const rows = (conv ?? []) as { id: string; name: string; project_id: string }[];
  const first = rows[0];
  const second = rows.find((r) => r.project_id !== first?.project_id);
  if (!first || !second) {
    throw new Error(
      'need ≥2 converted estimates on different projects — the test would be vacuous'
    );
  }
  mine = { estimateId: first.id, projectId: first.project_id, name: first.name };
  other = { estimateId: second.id };

  const { data: asg, error } = await admin
    .from('project_assignments')
    .insert({
      company_id: prof!.company_id,
      project_id: mine.projectId,
      member_id: member!.id,
      role_on_project: 'project_executive',
    })
    .select('id')
    .single();
  if (error) throw new Error(`assign PE: ${error.message}`);
  assignmentId = asg!.id as string;
});

test.afterAll(async () => {
  if (assignmentId) await admin.from('project_assignments').delete().eq('id', assignmentId);
});

test.describe('R11 · the Project Executive reads its projects’ estimates', () => {
  test.setTimeout(120_000);

  test('the nav offers Estimates, and the list opens (no redirect) without create controls', async ({
    page,
  }) => {
    await signInAs(page, PE);
    await expect(page.getByRole('link', { name: 'Estimates', exact: true }).first()).toBeVisible();
    await page.goto('/dashboard/estimates');
    await expect(page).toHaveURL(/\/dashboard\/estimates$/);
    await expect(page.getByRole('link', { name: '+ New Estimate' })).toHaveCount(0);
  });

  test('its project’s estimate opens READ-ONLY, and its proposal preview renders', async ({
    page,
  }) => {
    await signInAs(page, PE);
    await page.goto(`/dashboard/estimates/${mine.estimateId}`);
    await expect(page).toHaveURL(new RegExp(`/dashboard/estimates/${mine.estimateId}$`));
    await expect(page.getByText(mine.name).first()).toBeVisible({ timeout: 30_000 });
    // Read-only: nothing in the builder accepts typing.
    const editable = page.locator(
      'main input:not([disabled]):not([type="search"]), main textarea:not([disabled])'
    );
    await expect(editable).toHaveCount(0);

    const res = await page.request.get(`/api/estimates/${mine.estimateId}/proposal-data`);
    expect(res.status(), 'proposal-data for its own project').toBe(200);

    await page.goto(`/dashboard/estimates/${mine.estimateId}/proposal`);
    await expect(page).toHaveURL(new RegExp(`/dashboard/estimates/${mine.estimateId}/proposal$`));
  });

  test('an estimate on a project it is NOT assigned to stays out of reach (RLS decides)', async ({
    page,
  }) => {
    await signInAs(page, PE);
    const res = await page.request.get(`/api/estimates/${other.estimateId}/proposal-data`);
    expect(res.status(), 'the role passes; the row does not exist for it').toBe(404);
  });
});
