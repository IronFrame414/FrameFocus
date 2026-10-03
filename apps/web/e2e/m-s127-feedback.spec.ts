import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S127 P-2 — feedback on navigation, WITHOUT loading.tsx (S112 R2 stands).
// Each navigation is HELD (its RSC response delayed 3s, the m-sections R2
// technique) so "the bar is up and the button is still busy" is observed
// while the next screen has not arrived, not inferred after it has.
//
//   /m   a navigation started BY CODE (the switch screen's router.push after
//        its write) raises the bar, and the button stays busy until arrival.
//        Before S127 the bar ignored code navigation and the button re-enabled
//        before the screen changed (S125 G-3/G-4).
//   desktop  the dashboard had NO navigation feedback; the same bar now shows.

const admin = adminClient();

async function clearCrewOpen() {
  const { data } = await admin
    .from('time_clock_sessions')
    .select('id')
    .eq('member_id', CREW_MEMBER)
    .is('clock_out', null);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length) {
    await admin.from('time_segments').delete().in('session_id', ids);
    await admin.from('time_clock_sessions').delete().in('id', ids);
  }
}

let seededSession = '';
test.afterAll(async () => {
  if (seededSession) {
    await admin.from('time_segments').delete().eq('session_id', seededSession);
    await admin.from('time_clock_sessions').delete().eq('id', seededSession);
  }
});

function holdRsc(page: import('@playwright/test').Page) {
  const state = { hold: true };
  return page
    .route('**/*', async (route) => {
      if (state.hold && route.request().headers()['rsc'] === '1') {
        await new Promise((r) => setTimeout(r, 3000));
      }
      await route.continue().catch(() => {});
    })
    .then(() => state);
}

test('/m: a code-triggered navigation (switch) raises the bar and keeps the button busy until arrival', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await clearCrewOpen();
  const start = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: s, error } = await admin
    .from('time_clock_sessions')
    .insert({ company_id: COMPANY_A, member_id: CREW_MEMBER, clock_in: start, status: 'pending' })
    .select('id')
    .single();
  expect(error).toBeNull();
  seededSession = s!.id as string;
  await admin
    .from('time_segments')
    .insert({
      company_id: COMPANY_A,
      session_id: seededSession,
      segment_type: 'break',
      segment_start: start,
    });

  await page.goto('/m/timeclock/switch');
  await page.getByTestId('m-next-type-shop').click();
  const go = page.getByTestId('m-start-segment');
  await expect(go).toBeEnabled();
  const state = await holdRsc(page);
  await go.click({ noWaitAfter: true });
  await expect(page.getByTestId('m-nav-pending')).toBeVisible({ timeout: 5_000 });
  await expect(go).toBeDisabled();
  await page.waitForURL(/\/m\/timeclock$/, { timeout: 30_000 });
  state.hold = false;
  await expect(page.getByTestId('m-nav-pending')).toHaveCount(0);
});

test('desktop: a link tap shows the dashboard bar at once, and it clears on arrival', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signInAs(page, 'josh+test50@worthprop.com');
  await page.goto('/dashboard/projects');
  const state = await holdRsc(page);
  const from = page.url();
  await page.locator('a[href="/dashboard/contacts"]').first().click({ noWaitAfter: true });
  await expect(page.getByTestId('nav-pending')).toBeVisible({ timeout: 800 });
  await page.waitForURL((u) => u.toString() !== from, { timeout: 30_000 });
  state.hold = false;
  await expect(page.getByTestId('nav-pending')).toHaveCount(0);
});
