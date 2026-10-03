import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S127 item 5a, FIXED AFTER MERGE — the path that shipped broken, driven as the
// people it is for. A FOREMAN sends a /m daily log with a client-facing photo;
// the photo's `files` row must end up ON the log AND `client_visible`, counted
// by the SERVICE ROLE. 5a's first e2e only ever chose a reason, so the flag
// write — refused for every role but Owner/Admin when made through the
// caller's client — was never exercised by a non-Owner. This is that exercise.
// (The mechanism's role map is test/s127-client-photo-share.live.ts.)

const FOREMAN = 'josh+qa-foreman@worthprop.com';
const FOREMAN_MEMBER = '61e04e04-4c9f-4113-a8e1-85057d6bff50';
const MARK = `S127 5a client photo ${Date.now()}`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
const admin = adminClient();
let projectId = '';

test.beforeAll(async () => {
  const { data, error } = await admin
    .from('project_assignments')
    .select('project_id, created_at, projects!inner(is_deleted, company_id)')
    .eq('member_id', FOREMAN_MEMBER)
    .eq('is_deleted', false)
    .eq('projects.is_deleted', false)
    .eq('projects.company_id', COMPANY_A)
    .order('created_at', { ascending: true })
    .order('project_id', { ascending: true })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`no project assigned to the foreman: ${error?.message}`);
  projectId = data.project_id as string;
});

test.afterAll(async () => {
  const { data: logs } = await admin
    .from('daily_logs')
    .select('id')
    .in('work_performed', [MARK, `${MARK} fail`]);
  for (const { id } of logs ?? []) {
    const { data: files } = await admin
      .from('files')
      .select('id, file_path')
      .eq('daily_log_id', id);
    if (files?.length) {
      await admin.storage.from('project-files').remove(files.map((f) => f.file_path as string));
      await admin
        .from('files')
        .delete()
        .in(
          'id',
          files.map((f) => f.id as string)
        );
    }
    await admin.from('daily_log_crew').delete().eq('daily_log_id', id);
    await admin.from('daily_log_sub_entries').delete().eq('daily_log_id', id);
    await admin.from('daily_logs').delete().eq('id', id);
  }
});

test('a foreman sends a /m log with a client-facing photo — it lands ON the log and client_visible', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 402, height: 874 });
  await signInAs(page, FOREMAN);
  await page.goto(`/m/logs/new?project=${projectId}`);
  await page.getByTestId('m-work-performed').fill(MARK);
  await page
    .getByTestId('client-photo-input')
    .setInputFiles({ name: 's127-client.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByTestId('client-photo-list')).toContainText('s127-client.png');
  await page.getByTestId('m-submit-log').click();
  await expect(page.getByTestId('m-log-done')).toBeVisible({ timeout: 60_000 });
  // A failed photo is SAID on the done screen (the form's own error line is
  // gone by then); a clean send shows no such line.
  await expect(page.getByTestId('m-log-done-error')).toHaveCount(0);

  const { data: log } = await admin
    .from('daily_logs')
    .select('id, author_member_id, client_photo_skip_reason')
    .eq('work_performed', MARK)
    .single();
  expect(log?.author_member_id).toBe(FOREMAN_MEMBER);
  expect(log?.client_photo_skip_reason).toBeNull();
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from('files')
          .select('id, client_visible')
          .eq('daily_log_id', log!.id as string);
        return (data ?? []).filter((f) => f.client_visible === true).length;
      },
      { timeout: 30_000 }
    )
    .toBe(1);
});

test('when sharing fails, the done screen SAYS so — and the photo stays internal', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 402, height: 874 });
  await signInAs(page, FOREMAN);
  // The share step fails as a network or server fault would.
  await page.route('**/api/daily-logs/client-photo', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"forced"}' })
  );
  await page.goto(`/m/logs/new?project=${projectId}`);
  await page.getByTestId('m-work-performed').fill(`${MARK} fail`);
  await page
    .getByTestId('client-photo-input')
    .setInputFiles({ name: 's127-client-fail.png', mimeType: 'image/png', buffer: PNG });
  await page.getByTestId('m-submit-log').click();
  await expect(page.getByTestId('m-log-done')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('m-log-done-error')).toBeVisible();
  await expect(page.getByTestId('m-log-done-error')).toContainText('forced');

  const { data: log } = await admin
    .from('daily_logs')
    .select('id')
    .eq('work_performed', `${MARK} fail`)
    .single();
  const { data: files } = await admin
    .from('files')
    .select('id, client_visible')
    .eq('daily_log_id', log!.id as string);
  expect((files ?? []).length, 'the photo itself was saved on the log').toBe(1);
  expect(files![0].client_visible, 'and NOT shared with the client').toBe(false);
});
