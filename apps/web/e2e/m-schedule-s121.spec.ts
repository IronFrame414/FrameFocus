import { test, expect, type Page } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S121 5-A — the /m schedule at 402px: a ONE-DAY column (Q10), no month, week or
// Gantt grid (Q11/Q12), scheduling from the phone [RULED Josh], staff seeing the
// details, and press-and-hold move that never fights a swipe (5-E).
// Disposable project `S121MSCH`; every write read back with the service role.

test.use({ viewport: { width: 402, height: 874 }, hasTouch: true, timezoneId: 'UTC' });

const OWNER = 'josh+test50@worthprop.com';
const MARKER = 'S121MSCH';
const admin = adminClient();
let projectId = '';
let taskId = '';
let foremanMember = '';

function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  for (const p of ps ?? []) {
    const { data: ts } = await admin.from('tasks').select('id').eq('project_id', p.id);
    const tIds = (ts ?? []).map((t) => t.id as string);
    if (tIds.length) {
      await admin.from('task_assignees').delete().in('task_id', tIds);
      await admin.from('tasks').delete().in('id', tIds);
    }
    await admin.from('schedule_entries').delete().eq('project_id', p.id);
    await admin.from('project_assignments').delete().eq('project_id', p.id);
    await admin.from('projects').delete().eq('id', p.id);
  }
}

async function dayOf(page: Page): Promise<string> {
  return (await page.getByTestId('m-day-view').getAttribute('data-day'))!;
}

test.beforeAll(async () => {
  await sweep();
  const { data: fp } = await admin.from('profiles').select('id').eq('email', 'josh+qa-foreman@worthprop.com').single();
  const { data: fm } = await admin.from('company_members').select('id').eq('profile_id', fp!.id).single();
  foremanMember = fm!.id as string;
  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', COMPANY_A)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .single();
  const { data: p, error } = await admin
    .from('projects')
    .insert({
      company_id: COMPANY_A,
      contact_id: contact!.id,
      project_number: `PRJ-${MARKER}`,
      name: `${MARKER} project`,
      status: 'active',
      project_internal_seq: (seqRow!.project_internal_seq as number) + 8700,
    })
    .select('id')
    .single();
  if (error) throw new Error(`project: ${error.message}`);
  projectId = p!.id as string;
  for (const m of [CREW_MEMBER, foremanMember]) {
    await admin.from('project_assignments').insert({ company_id: COMPANY_A, project_id: projectId, member_id: m, role_on_project: 'crew' });
  }
});

test.afterAll(async () => {
  await sweep();
});

test.describe.serial('S121 5-A · /m schedule at 402px', () => {
  test.setTimeout(120_000);

  test('ONE day, full width, no month/week/Gantt grid; ‹ › walk the days', async ({ page }) => {
    await page.goto(`/m/p/${projectId}/schedule`);
    const view = page.getByTestId('m-day-view');
    await expect(view).toBeVisible();
    const today = await dayOf(page);
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // No desktop grid of any kind on the phone.
    await expect(page.getByTestId('calendar-week')).toHaveCount(0);
    await expect(page.getByTestId('calendar-view-month')).toHaveCount(0);
    await expect(page.getByTestId('calendar-view-gantt')).toHaveCount(0);
    await page.getByTestId('m-day-next').click();
    await expect(view).toHaveAttribute('data-day', addDays(today, 1));
    await page.getByTestId('m-day-today').click();
    await expect(view).toHaveAttribute('data-day', today);
    // The column uses the width: the day label box spans most of 402 - 2×16.
    const w = (await view.boundingBox())!.width;
    expect(w).toBeGreaterThan(360);
  });

  test('scheduling FROM THE PHONE: + Schedule → sheet → saved → on the day', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(`/m/p/${projectId}/schedule`);
    const today = await dayOf(page);
    await page.getByTestId('m-day-add').click();
    const sheet = page.getByTestId('schedule-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('ss-start')).toHaveValue(today);
    await sheet.getByTestId('ss-kind-team').click();
    await sheet.getByTestId(`ss-person-${CREW_MEMBER}`).click();
    await sheet.getByTestId('ss-task-new').click();
    await sheet.getByTestId('ss-task-title').fill(`${MARKER} tile`);
    await sheet.getByTestId('ss-end').fill(addDays(today, 1));
    await sheet.getByTestId('ss-save').click();
    await expect(page.getByTestId('m-day-toast')).toBeVisible({ timeout: 20_000 });
    const { data: t } = await admin
      .from('tasks')
      .select('id, start_date, due_date, is_scheduled')
      .eq('project_id', projectId)
      .eq('title', `${MARKER} tile`)
      .single();
    taskId = (t as { id: string }).id;
    expect(t).toMatchObject({ start_date: today, due_date: addDays(today, 1), is_scheduled: true });
    const { data: ta } = await admin.from('task_assignees').select('member_id').eq('task_id', taskId).eq('is_deleted', false);
    expect((ta ?? []).map((r) => r.member_id)).toEqual([CREW_MEMBER]);
    await expect(page.locator(`[data-testid="m-event-row"][data-key="task-${taskId}-${CREW_MEMBER}"]`)).toBeVisible();
    await page.screenshot({ path: 'test-results/s121-m-day-view-402.png' });
  });

  test('press-and-hold → move mode; the MOVE handle drags +2 days (length kept); a plain swipe does not', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(`/m/p/${projectId}/schedule`);
    const row = page.locator(`[data-testid="m-event-row"][data-key="task-${taskId}-${CREW_MEMBER}"]`);
    await expect(row).toBeVisible();
    const before = await admin.from('tasks').select('start_date, due_date').eq('id', taskId).single();
    const b = before.data as { start_date: string; due_date: string };

    // A quick tap (no hold) opens the details — not move mode.
    const open = row.getByTestId('m-event-open');
    await open.click();
    await expect(row.getByTestId('m-event-detail')).toBeVisible();
    await expect(row.getByTestId('m-event-move')).toHaveCount(0);

    // Hold 600ms → move mode.
    const box = (await open.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await expect(row.getByTestId('m-event-move')).toBeVisible();
    await expect(row.getByTestId('m-move-all')).toHaveCSS('touch-action', 'none');

    // Drag the MOVE handle right by two days (2 × 56px).
    const h = (await row.getByTestId('m-move-all').boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 116, h.y + h.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const { data } = await admin.from('tasks').select('start_date, due_date').eq('id', taskId).single();
        return `${(data as { start_date: string }).start_date}|${(data as { due_date: string }).due_date}`;
      }, { timeout: 20_000 })
      .toBe(`${addDays(b.start_date, 2)}|${addDays(b.due_date, 2)}`);
  });

  test('crew SEES THE DETAILS: tap a bar → dates and every person on the task', async ({ page }) => {
    // A 2-person task on today, so the crew member's own bar lists both.
    await page.goto(`/m/p/${projectId}/schedule`);
    const today = await dayOf(page);
    const { data: t } = await admin
      .from('tasks')
      .insert({ company_id: COMPANY_A, project_id: projectId, title: `${MARKER} shared`, start_date: today, due_date: today })
      .select('id')
      .single();
    const shared = (t as { id: string }).id;
    for (const m of [CREW_MEMBER, foremanMember]) {
      await admin.from('task_assignees').insert({ company_id: COMPANY_A, task_id: shared, member_id: m });
      await new Promise((r) => setTimeout(r, 20));
    }
    await page.reload();
    const row = page.locator(`[data-testid="m-event-row"][data-key="task-${shared}-${CREW_MEMBER}"]`);
    await expect(row).toBeVisible();
    // Crew cannot schedule: no + Schedule.
    await expect(page.getByTestId('m-day-add')).toHaveCount(0);
    await row.getByTestId('m-event-open').click();
    await expect(row.getByTestId('m-event-detail')).toBeVisible();
    const { data: names } = await admin.from('company_members').select('display_name').in('id', [CREW_MEMBER, foremanMember]);
    const expected = ((names ?? []) as { display_name: string }[]).map((n) => n.display_name);
    expect(expected, 'non-vacuous: two names').toHaveLength(2);
    for (const n of expected) await expect(row.getByTestId('m-event-people')).toContainText(n);
  });
});
