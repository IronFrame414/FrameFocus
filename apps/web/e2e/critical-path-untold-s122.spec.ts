import { test, expect, type Page } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';
import { deleteProjects } from '../test-support/company-purge';

// S122 Part 6 [ruling 11, PARITY] — an assignee who chose to be told and has no
// login and no email is SHOWN to whoever applied the change, AT SAVE TIME, on
// every path that applies one — not only the line sheet. In a real browser:
//
//   1. DESKTOP, the Critical Path tab: drag the END of T's bar → confirm → the
//      notice names them.
//   2. /m (402px, touch), the day view: hold, drag the MOVE handle → confirm →
//      the same notice names them.
//   3. DESKTOP, an APPROVAL in the tab → the approver is shown the same notice.
//
// Each notice is the alert dialog (`alert-dialog`), and each change is read back
// with the service role, so a dialog over a save that never landed is a failure.

test.use({ timezoneId: 'UTC' });

const OWNER = 'josh+test50@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const MARKER = 'S122CPU';
const TITLE = 'Saved — but not everyone could be told';
const admin = adminClient();
let projectId = '';
let taskT = '';
let unreachableMember = '';
let unreachableName = '';
let foremanMember = '';

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** The first Monday at least 2 days out (UTC), so the /m day view reaches it in a few steps. */
function nextMonday(): string {
  let d = addDays(new Date().toISOString().slice(0, 10), 2);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
}
const START = nextMonday();

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
    await admin.from('task_assignees').delete().in('task_id', tids);
    await admin.from('tasks').delete().in('id', tids);
  }
  await admin.from('project_assignments').delete().in('project_id', ids);
  await deleteProjects(admin, ids);
}

async function seed() {
  await sweep();
  // An UNREACHABLE member: no login, and no live subcontractor email. Stable order.
  const { data: cands } = await admin
    .from('company_members')
    .select('id, display_name')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .is('profile_id', null)
    .order('id', { ascending: true })
    .limit(50);
  for (const c of (cands ?? []) as { id: string; display_name: string }[]) {
    const { data: s } = await admin.from('subcontractors').select('email').eq('member_id', c.id).eq('is_deleted', false).not('email', 'is', null);
    if (!s || s.length === 0) {
      unreachableMember = c.id;
      unreachableName = c.display_name;
      break;
    }
  }
  expect(unreachableMember, 'an unreachable member exists in company A (a test on zero rows proves nothing)').not.toBe('');

  const { data: fp } = await admin.from('profiles').select('id').eq('email', FOREMAN).single();
  const { data: fm } = await admin.from('company_members').select('id').eq('profile_id', (fp as { id: string }).id).eq('is_deleted', false).single();
  foremanMember = (fm as { id: string }).id;

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
      name: `${MARKER} untold`,
      contact_id: (c as { id: string }).id,
      project_number: `PRJ-${MARKER}`,
      project_internal_seq: internal,
      start_date: START,
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
  const ta = await admin.from('task_assignees').insert({ company_id: COMPANY_A, task_id: taskT, member_id: unreachableMember, notify_changes: true });
  if (ta.error) throw new Error(`assignee: ${ta.error.message}`);
  // The client box stays OFF: the only untold person is the member.
  const s = await admin.from('project_schedule_settings').insert({ company_id: COMPANY_A, project_id: projectId, critical_path_enabled: true });
  if (s.error) throw new Error(`settings: ${s.error.message}`);
}

async function rowT() {
  const { data } = await admin.from('tasks').select('duration_days, start_date, due_date, constraint_date').eq('id', taskT).single();
  return data as { duration_days: number; start_date: string | null; due_date: string | null; constraint_date: string | null };
}

async function expectUntoldNotice(page: Page) {
  const notice = page.getByTestId('alert-dialog');
  await expect(notice).toBeVisible({ timeout: 20_000 });
  await expect(notice).toContainText(TITLE);
  await expect(notice).toContainText(`No login and no email on file: ${unreachableName}.`);
  await page.getByTestId('alert-ok').click();
  await expect(notice).toHaveCount(0);
}

test.describe('S122 Part 6 · who could not be told is shown at save time, on every path', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);
  test.beforeAll(seed);
  test.afterAll(sweep);

  test('desktop: a DRAG in the Critical Path tab shows the notice', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/projects/${projectId}/critical-path`);
    // The read-check computed it: T(3) from START.
    await expect.poll(async () => (await rowT()).due_date, { timeout: 20_000 }).toBe(addDays(START, 2));
    const handle = page.getByTestId(`gantt-extend-${taskT}`);
    await handle.scrollIntoViewIfNeeded();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 56, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    const dialog = page.getByTestId('confirm-dialog');
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toContainText('Changes the DURATION: 3 working days → 5 working days.');
    await page.getByTestId('confirm-accept').click();
    await expectUntoldNotice(page);
    expect(await rowT()).toMatchObject({ duration_days: 5, start_date: START, due_date: addDays(START, 4) });
  });

  test.describe('/m at 402px', () => {
    test.use({ viewport: { width: 402, height: 874 }, hasTouch: true });

    test('/m: a DRAG in the day view shows the SAME notice', async ({ page }) => {
      await signInAs(page, OWNER);
      await page.goto(`/m/p/${projectId}/schedule`);
      const view = page.getByTestId('m-day-view');
      await expect(view).toBeVisible();
      for (let i = 0; i < 14 && (await view.getAttribute('data-day')) !== START; i++) await page.getByTestId('m-day-next').click();
      await expect(view).toHaveAttribute('data-day', START);
      const row = page.locator(`[data-testid="m-event-row"][data-key="task-${taskT}-${unreachableMember}"]`);
      await expect(row).toBeVisible();

      // Hold 600ms → move mode; drag the MOVE handle two days right (2 × 56px).
      const open = (await row.getByTestId('m-event-open').boundingBox())!;
      await page.mouse.move(open.x + open.width / 2, open.y + open.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(650);
      await page.mouse.up();
      await expect(row.getByTestId('m-event-move')).toBeVisible();
      const h = (await row.getByTestId('m-move-all').boundingBox())!;
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await page.mouse.down();
      await page.mouse.move(h.x + h.width / 2 + 116, h.y + h.height / 2, { steps: 10 });
      await page.mouse.up();

      await expect(page.getByTestId('confirm-dialog')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('confirm-accept').click();
      await expectUntoldNotice(page);
      await expect.poll(async () => (await rowT()).start_date, { timeout: 20_000 }).toBe(addDays(START, 2));
      expect((await rowT()).constraint_date).toBe(addDays(START, 2));
    });
  });

  test('desktop: an APPROVAL in the tab shows the approver the same notice', async ({ page }) => {
    const { data: e, error } = await admin
      .from('task_schedule_edits')
      .insert({
        company_id: COMPANY_A,
        project_id: projectId,
        task_id: taskT,
        submitted_by_member_id: foremanMember,
        changes: { duration_days: 4 },
        summary: 'Changes the DURATION: 5 working days → 4 working days.',
      })
      .select('id')
      .single();
    if (error) throw new Error(`held edit: ${error.message}`);
    const editId = (e as { id: string }).id;
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/projects/${projectId}/critical-path`);
    await page.getByTestId(`cp-approve-${editId}`).click();
    await expectUntoldNotice(page);
    expect((await rowT()).duration_days).toBe(4);
    const { data: st } = await admin.from('task_schedule_edits').select('status').eq('id', editId).single();
    expect((st as { status: string }).status).toBe('approved');
  });

  // The SHEET is where the notice began, so it is the path a refactor would most
  // likely drop with nothing going red. Both of its calls: SAVE and RELEASE.
  async function openT(page: Page) {
    await page.goto(`/dashboard/projects/${projectId}/schedule`);
    await page.getByRole('button', { name: new RegExp(`${MARKER} T`) }).first().click();
    await expect(page.getByTestId('cp-fields')).toBeVisible();
  }

  test('desktop: a SHEET SAVE shows the notice', async ({ page }) => {
    expect((await rowT()).duration_days, 'after the approval').toBe(4);
    await signInAs(page, OWNER);
    await openT(page);
    await page.getByTestId('cp-duration').fill('5');
    await expect(page.getByTestId('cp-edit-duration')).toHaveText('Changes the DURATION: 4 working days → 5 working days.');
    await page.getByRole('button', { name: 'Save Task' }).click();
    await expectUntoldNotice(page);
    expect((await rowT()).duration_days).toBe(5);
  });

  test('desktop: a SHEET RELEASE (one action) shows the notice', async ({ page }) => {
    expect((await rowT()).constraint_date, 'the /m drag left a not-before pin').toBe(addDays(START, 2));
    await signInAs(page, OWNER);
    await openT(page);
    await expect(page.getByTestId('cp-pinned')).toBeVisible();
    await page.getByTestId('cp-release').click();
    await expectUntoldNotice(page);
    expect(await rowT()).toMatchObject({ constraint_date: null, start_date: START });
  });

  // [S123 D-3a, Josh RULED] Sending now runs AFTER the response, and the popup
  // is the FAST path, never the only one: a saver who has already left the
  // screen must still be able to find who could not be told. So: save, leave
  // BEFORE the response is read, and find it in Notifications.
  test('⚠️ desktop: a SHEET SAVE, then leaving at once: the unreachable list is waiting in Notifications', async ({ page }) => {
    const { data: op } = await admin.from('profiles').select('id').eq('email', OWNER).single();
    const ownerProfile = (op as { id: string }).id;
    await admin.from('notifications').delete().eq('project_id', projectId).eq('recipient_profile_id', ownerProfile);
    const reports = async () =>
      (
        await admin
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('recipient_profile_id', ownerProfile)
          .eq('title', 'Not everyone could be told about your schedule change')
      ).count ?? 0;
    expect(await reports(), 'the control: no report row before the save').toBe(0);
    const before = (await rowT()).duration_days;

    await signInAs(page, OWNER);
    await openT(page);
    await page.getByTestId('cp-duration').fill(String(before + 1));
    // Leave the moment the save REQUEST is on the wire: no response is read, no popup is seen.
    const sent = page.waitForRequest((r) => r.method() !== 'GET' && r.url().includes(`/critical-path/tasks/${taskT}`));
    await page.getByRole('button', { name: 'Save Task' }).click();
    await sent;
    await page.goto('/dashboard/notifications');

    await expect.poll(async () => (await rowT()).duration_days, { timeout: 20_000 }).toBe(before + 1);
    expect(await reports(), 'exactly one report row for this save').toBe(1);
    await expect(page.getByText('Not everyone could be told about your schedule change').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`No login and no email on file: ${unreachableName}.`).first()).toBeVisible();
  });
});
