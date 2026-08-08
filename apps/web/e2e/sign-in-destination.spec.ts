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
