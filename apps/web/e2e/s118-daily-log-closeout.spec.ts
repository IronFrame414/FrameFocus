import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S118 item 12 — the daily log brought up to the paper close-out form, on BOTH
// surfaces (PARITY): the crew member fills A / C / D / E on /m at the end of the
// day; the office marks the D line ORDERED and the log REVIEWED on desktop; the
// field SEES "ordered" on /m. Every outcome is read back with the service role.

const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const RUN = `S118DL-${Date.now()}`;
const admin = adminClient();
let projectId = '';
let logId = '';

test.beforeAll(async () => {
  const { data: asg, error } = await admin
    .from('project_assignments')
    .select('project_id, created_at, projects!inner(is_deleted, company_id, status)')
    .eq('member_id', CREW_MEMBER)
    .eq('is_deleted', false)
    .eq('projects.is_deleted', false)
    .eq('projects.company_id', COMPANY_A)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error || !asg) throw new Error(`no Company A project assigned to crew: ${error?.message}`);
  projectId = asg.project_id as string;
});

test.afterAll(async () => {
  const { data } = await admin
    .from('daily_logs')
    .select('id, pdf_file_id')
    .like('work_performed', `${RUN}%`);
  for (const l of (data ?? []) as { id: string; pdf_file_id: string | null }[]) {
    await admin.from('daily_log_material_needs').delete().eq('daily_log_id', l.id);
    await admin.from('daily_log_crew').delete().eq('daily_log_id', l.id);
    await admin.from('daily_log_sub_entries').delete().eq('daily_log_id', l.id);
    await admin.from('daily_logs').delete().eq('id', l.id);
    if (l.pdf_file_id) {
      const { data: f } = await admin
        .from('files')
        .select('file_path')
        .eq('id', l.pdf_file_id)
        .maybeSingle();
      if (f) await admin.storage.from('project-files').remove([f.file_path as string]);
      await admin.from('files').delete().eq('id', l.pdf_file_id);
    }
  }
  const { count } = await admin
    .from('daily_logs')
    .select('id', { count: 'exact', head: true })
    .like('work_performed', `${RUN}%`);
  expect(count, 'daily-log fixtures left behind').toBe(0);
});

test.describe.serial('S118 item 12 · the paper close-out form, both surfaces', () => {
  test.setTimeout(150_000);

  test("/m — the crew member files A, C, D and E with the day's log", async ({ page }) => {
    await signInAs(page, CREW);
    await page.goto(`/m/logs/new?project=${projectId}`);
    await page.getByTestId('m-work-performed').fill(`${RUN} framed the back wall`);
    await page.getByTestId('closeout-closeout_floors_swept').check();
    await page.getByTestId('closeout-closeout_site_secured').check();
    await page.getByTestId('lookahead-day-after').fill('Hang interior doors');
    await page.getByTestId('lookahead-day-after-date').fill('2026-10-02');
    await page.getByTestId('need-add').click();
    await page.getByTestId('need-item').fill('Drywall screws 1-5/8');
    await page.getByTestId('need-qty').fill('5');
    await page.getByTestId('need-unit').fill('box');
    await page.getByTestId('need-vendor').fill('Home Depot');
    await page.getByTestId('log-blockers').fill('Electrical rough-in inspection not scheduled');
    await page.getByTestId('m-submit-log').click();
    await expect(page.getByTestId('m-log-saved')).toBeVisible({ timeout: 30_000 });

    const { data: log } = await admin
      .from('daily_logs')
      .select('*')
      .like('work_performed', `${RUN}%`)
      .single();
    logId = log!.id as string;
    expect(log).toMatchObject({
      closeout_floors_swept: true,
      closeout_site_secured: true,
      closeout_debris_hauled: null, // untouched stays unanswered (NULL), not "no"
      tasks_day_after: 'Hang interior doors',
      tasks_day_after_date: '2026-10-02',
      blockers: 'Electrical rough-in inspection not scheduled',
      office_reviewed_at: null,
    });
    const { data: needs } = await admin
      .from('daily_log_material_needs')
      .select('*')
      .eq('daily_log_id', logId);
    expect(needs).toHaveLength(1);
    expect(needs![0]).toMatchObject({
      item: 'Drywall screws 1-5/8',
      qty: 5,
      unit: 'box',
      vendor_source: 'Home Depot',
      ordered_at: null,
    });
  });

  test('desktop — the office sees it unreviewed, marks the line ORDERED and the log REVIEWED', async ({
    page,
  }) => {
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/field-ops/${projectId}/daily-logs`);
    const row = page
      .locator('a', { hasText: 'Not reviewed' })
      .filter({ has: page.getByTestId('log-unreviewed') });
    await expect(row.first()).toBeVisible();
    await page.goto(`/dashboard/field-ops/${projectId}/daily-logs/${logId}`);
    await expect(page.getByTestId('log-not-reviewed')).toBeVisible();
    await expect(page.getByTestId('view-need')).toHaveAttribute('data-ordered', 'false');
    await page.getByTestId('need-order-toggle').click();
    await expect(page.getByTestId('view-need')).toHaveAttribute('data-ordered', 'true', {
      timeout: 30_000,
    });
    await page.getByTestId('log-review-toggle').click();
    await expect(page.getByTestId('log-reviewed')).toBeVisible({ timeout: 30_000 });

    const { data: log } = await admin
      .from('daily_logs')
      .select('office_reviewed_at, office_reviewed_by')
      .eq('id', logId)
      .single();
    expect(log!.office_reviewed_at).not.toBeNull();
    const { data: needs } = await admin
      .from('daily_log_material_needs')
      .select('ordered_at, ordered_by')
      .eq('daily_log_id', logId);
    expect(needs![0].ordered_at).not.toBeNull();
  });

  test('/m — the field SEES "ordered" and the review; it has no office controls', async ({
    page,
  }) => {
    await signInAs(page, CREW);
    await page.goto(`/m/logs/${logId}`);
    await expect(page.getByTestId('view-need')).toHaveAttribute('data-ordered', 'true');
    await expect(page.getByTestId('log-reviewed')).toBeVisible();
    await expect(page.getByTestId('need-order-toggle')).toHaveCount(0);
    await expect(page.getByTestId('log-review-toggle')).toHaveCount(0);
    await expect(page.getByTestId('view-closeout_floors_swept')).toHaveAttribute(
      'data-value',
      'true'
    );
  });
});
