import { test, expect, type Page } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S122 0-B-4 — the older per-session clock correction (the day page,
// /dashboard/timeclock/timesheets/[sessionId]) now MATCHES the week sheet. ⚠️ PAYROLL.
//
// On an APPROVED day, "Edit hours" → Save returns the day to PENDING (in the
// database — migration 20262122000000) and shows THE SAME "Hours changed" notice
// the week sheet does (components/time/hours-changed-notice), with Approve. On a
// PENDING day there is no notice. Every outcome is read with the service role.

test.use({ timezoneId: 'UTC' });

const OWNER = 'josh+test50@worthprop.com';
const DAY = '2020-01-20';
const admin = adminClient();
const T = (hhmm: string) => `${DAY}T${hhmm}:00.000Z`;

async function sweep() {
  const { data: ss } = await admin
    .from('time_clock_sessions')
    .select('id')
    .eq('member_id', CREW_MEMBER)
    .gte('clock_in', `${DAY}T00:00:00Z`)
    .lt('clock_in', `${DAY}T23:59:59Z`);
  const ids = (ss ?? []).map((s) => s.id as string);
  if (ids.length) {
    await admin.from('time_edit_logs').delete().in('session_id', ids);
    await admin.from('time_segments').delete().in('session_id', ids);
    await admin.from('time_session_rate_snapshots').delete().in('session_id', ids);
    await admin.from('time_clock_sessions').delete().in('id', ids);
  }
}

async function seed(approved: boolean): Promise<string> {
  const { data: s, error } = await admin
    .from('time_clock_sessions')
    .insert({
      company_id: COMPANY_A,
      member_id: CREW_MEMBER,
      clock_in: T('08:00'),
      clock_out: T('16:00'),
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(`session: ${error.message}`);
  const id = s!.id as string;
  const seg = await admin
    .from('time_segments')
    .insert({
      company_id: COMPANY_A,
      session_id: id,
      segment_type: 'break',
      segment_start: T('08:00'),
      segment_end: T('16:00'),
    });
  if (seg.error) throw new Error(`segment: ${seg.error.message}`);
  if (approved) {
    const a = await admin
      .from('time_clock_sessions')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', id);
    if (a.error) throw new Error(`approve: ${a.error.message}`);
  }
  return id;
}

async function readSession(id: string) {
  const { data } = await admin
    .from('time_clock_sessions')
    .select('status, clock_out')
    .eq('id', id)
    .single();
  return data as { status: string; clock_out: string | null };
}

async function editClockOut(page: Page, id: string, hhmm: string) {
  await page.goto(`/dashboard/timeclock/timesheets/${id}`);
  // The page rendered — so anything absent below is a decision, not a failed load.
  await expect(page.getByTestId('day-edit-hours')).toBeVisible();
  await page.getByTestId('day-edit-hours').click();
  await page.getByTestId('day-clock-out').fill(`${DAY}T${hhmm}`);
  await page.getByTestId('day-hours-save').click();
}

test.describe('S122 0-B-4 · the day page clock correction matches the week sheet', () => {
  test.setTimeout(120_000);
  test.beforeAll(sweep);
  test.afterAll(sweep);

  test('APPROVED day: Save → pending, the shared "Hours changed" notice, Approve → approved', async ({
    page,
  }) => {
    const id = await seed(true);
    expect((await readSession(id)).status).toBe('approved');
    await signInAs(page, OWNER);
    await editClockOut(page, id, '15:00');

    const notice = page.getByTestId('ts-reopened');
    await expect(notice).toBeVisible({ timeout: 20_000 });
    await expect(notice).toContainText('is back to pending and must be approved again');
    await expect
      .poll(async () => (await readSession(id)).status, { timeout: 20_000 })
      .toBe('pending');
    expect(new Date((await readSession(id)).clock_out!).toISOString()).toBe(T('15:00'));

    await page.getByTestId('ts-reopened-approve').click();
    await expect
      .poll(async () => (await readSession(id)).status, { timeout: 20_000 })
      .toBe('approved');
    await expect(notice).toHaveCount(0);
  });

  test('PENDING day: Save lands, and there is NO notice', async ({ page }) => {
    const id = await seed(false);
    await signInAs(page, OWNER);
    await editClockOut(page, id, '15:30');
    await expect
      .poll(async () => new Date((await readSession(id)).clock_out!).toISOString(), {
        timeout: 20_000,
      })
      .toBe(T('15:30'));
    expect((await readSession(id)).status).toBe('pending');
    await expect(page.getByTestId('ts-reopened')).toHaveCount(0);
  });
});
