import { test, expect } from '@playwright/test';

// WHERE A SIGN-IN LANDS — the /m half of it, which was the reported defect.
//
// ===========================================================================
// WHY THIS FILE IS NOT NAMED m-*.spec.ts
// ===========================================================================
// Deliberate, and load-bearing. playwright.config.ts routes `m-*.spec.ts` to
// the `chromium-auth` project, which carries a signed-in storageState. **The
// defect here only exists when you are SIGNED OUT**, so a spec that inherited
// that session could not reach it — it would sail past the sign-in page
// entirely. The name keeps this in the anonymous `chromium` project, which is
// exactly the condition being tested.
//
// That is also the reason the original bug survived: every /m criterion runs
// authenticated, so no test in the suite had ever asked what happens to a
// field user whose session has lapsed.
//
// ===========================================================================
// THE DEFECT
// ===========================================================================
// Reported as "the phone cannot reach /m — changing the URL redirects to the
// desktop dashboard" [S120, Josh]. Not the cf1fe8a matcher regression (the
// matcher is intact, and /m resolves correctly under an expired access token),
// and not a consequence of the hydration bug (hydration runs after the
// document has loaded and cannot navigate). It was three hard-coded
// destinations in a row:
//
//     GET /m  ->  app/m/layout.tsx: no user, redirect('/sign-in')   [dropped it]
//             ->  user signs in
//             ->  app/sign-in/page.tsx: router.push('/dashboard')   [hard-coded]
//
// plus middleware's own `/sign-in -> /dashboard` rule for the case where the
// session turns out to be valid after all. It reads as phone-specific for a
// mundane reason: a handset's refresh token lapses while it sits in a pocket,
// and a desktop's is refreshed constantly, so only the phone ever reaches the
// sign-in page at all.

const EMAIL = process.env.E2E_EMAIL ?? 'josh+crew@worthprop.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';

test('a lapsed field session asking for /m signs in and returns to /m, not the desktop', async ({
  page,
}) => {
  await page.goto('/m');

  // The gate must state where it came from, or the destination is already lost
  // by the time the form is rendered.
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fm/);

  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  // /m continues to /m/timeclock (D-12), so assert the field app rather than
  // the exact landing path.
  await expect(page).toHaveURL(/\/m(\/|$)/, { timeout: 30_000 });
  await expect(page.getByTestId('m-tabbar')).toBeVisible();
});

test('a sign-in with no stated destination still lands on the desktop dashboard', async ({
  page,
}) => {
  // The other half of the contract, and the reason `safeNextPath` takes a
  // default rather than requiring `next`: every existing caller — the desktop
  // sign-in, the auth-page bounce, auth.setup.ts — must behave exactly as it
  // did. A fix for the field app that quietly moved everyone else would be a
  // worse bug than the one it replaced.
  await page.goto('/sign-in');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
});

// ===========================================================================
// D-12's SIGN-IN LANDING — a phone signs in to /m [S121, Josh]
// ===========================================================================
// The unit tests (test/device.test.ts) pin the UA predicate against real
// strings. These pin the CONSEQUENCE end to end, because the predicate being
// right and the page using it are different claims — the whole point of the
// server-side split is that the decision reaches the form as a prop, and a prop
// that is never read would pass every unit test.
test.describe('D-12 · the sign-in landing follows the device', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });

  test('a phone lands on /m, with no /dashboard render on the way', async ({ page }) => {
    const seen: string[] = [];
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) seen.push(new URL(f.url()).pathname);
    });

    await page.goto('/sign-in');
    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/m(\/|$)/, { timeout: 30_000 });
    await expect(page.getByTestId('m-tabbar')).toBeVisible();

    // ⚠️ THE FLICKER IS THE POINT. A viewport-based fix would land on
    // /dashboard and bounce; this asserts the dashboard was never navigated to
    // at all, which is the difference the server-side decision buys.
    expect(
      seen.filter((p) => p.startsWith('/dashboard')),
      'the phone rendered /dashboard on its way to /m — the decision moved client-side'
    ).toEqual([]);
  });
});

test.describe('D-12 · a desktop is unaffected', () => {
  test('a desktop UA still lands on /dashboard', async ({ page }) => {
    // The non-change half. Without it, a helper that returned '/m' for every
    // caller would pass the test above.
    await page.goto('/sign-in');
    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });
});
