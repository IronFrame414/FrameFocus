import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S127 item 4c (B-1) — the clock location renders where hours are reviewed,
// with its THREE states distinct: a fix (coordinates + map link), a failure
// (the REASON, in words), and never-attempted (nothing at all). Seeded with the
// service role on a day no real time sits on, swept before and after.

test.use({ timezoneId: 'UTC' });

const OWNER = 'josh+test50@worthprop.com';
const DAY = '2020-02-03';
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

async function seed(from: string, to: string, gpsIn: unknown, gpsOut: unknown): Promise<string> {
  const { data: s, error } = await admin
    .from('time_clock_sessions')
    .insert({
      company_id: COMPANY_A,
      member_id: CREW_MEMBER,
      clock_in: T(from),
      clock_out: T(to),
      status: 'pending',
      gps_in: gpsIn,
      gps_out: gpsOut,
    })
    .select('id')
    .single();
  if (error) throw new Error(`session: ${error.message}`);
  const seg = await admin.from('time_segments').insert({
    company_id: COMPANY_A,
    session_id: s!.id,
    segment_type: 'break',
    segment_start: T(from),
    segment_end: T(to),
  });
  if (seg.error) throw new Error(`segment: ${seg.error.message}`);
  return s!.id as string;
}

test.beforeAll(sweep);
test.afterAll(sweep);

test('a failure shows its reason, a fix shows coordinates and a map link', async ({ page }) => {
  const id = await seed(
    '08:00',
    '09:00',
    { reason: 'permission_denied', error_code: 1, captured_at: T('08:00') },
    { lat: 27.947521, lng: -82.458431, accuracy: 12, captured_at: T('09:00') }
  );
  await signInAs(page, OWNER);
  await page.goto(`/dashboard/timeclock/timesheets/${id}`);
  await expect(page.getByTestId('ts-day-gps-in')).toHaveText('In: Location permission denied');
  await expect(page.getByTestId('ts-day-gps-in')).toHaveAttribute('data-gps', 'failure');
  await expect(page.getByTestId('ts-day-gps-out')).toContainText('27.94752, -82.45843 (±12 m)');
  await expect(
    page.getByTestId('ts-day-gps-out').getByRole('link', { name: 'Map' })
  ).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=27.94752,-82.45843');
  // The old KPI's false "On site" is gone.
  await expect(page.getByText('On site')).toHaveCount(0);
});

test('never attempted (NULL both ways) renders NO location at all', async ({ page }) => {
  const id = await seed('10:00', '11:00', null, null);
  await signInAs(page, OWNER);
  await page.goto(`/dashboard/timeclock/timesheets/${id}`);
  // The page rendered (a pass on a page that never rendered is not a pass).
  await expect(page.getByText('Segments')).toBeVisible();
  await expect(page.getByTestId('ts-day-location')).toHaveCount(0);
});
