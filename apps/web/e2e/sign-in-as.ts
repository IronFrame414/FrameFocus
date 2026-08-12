import { expect, type Page } from '@playwright/test';

/**
 * Sign in as any test identity and wait for WHERE THAT IDENTITY ACTUALLY LANDS.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS: A PREMISE CHANGED AND NOTHING ENUMERATED WHAT USED IT
 * ---------------------------------------------------------------------------
 * Four e2e specs carried a byte-identical private `signInAs()` — verified
 * identical, not assumed — each ending:
 *
 *     await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
 *
 * plus a fifth copy inlined in `m-destinations.spec.ts`. Every one was written
 * when EVERY role reached `/dashboard`. Ruling A [S131] enforced
 * `DASHBOARD_ROLES`, so a subcontractor now lands on `/m/projects` and a client
 * on the placeholder — correct behaviour that made five sign-ins wait 30
 * seconds for a URL that will never arrive. CI run #195 was cancelled at 20
 * minutes because of it.
 *
 * Ruling A's own tests passed 7/7. They proved the NEW behaviour and nothing
 * enumerated the EXISTING helpers built on the old premise — the same shape as
 * `5I-spec.md`'s three places, and as the client-clock defect where fixing the
 * failing instances left an identical one armed. So the destination now lives
 * in ONE place: when the next ruling moves somebody, this is the only line to
 * change, and no spec can hold a private opinion about it.
 *
 * ⚠️ KEEP THIS IN STEP WITH `apps/web/lib/dashboard-access.ts`. That module is
 * the product's answer; this is the test's mirror of it. They are deliberately
 * NOT the same file — importing app code here would make a test that passes
 * because both sides share a bug. `s131-dashboard-access.test.ts` asserts the
 * product side; this asserts what a browser actually does.
 */

/** Where this identity ends up after a successful sign-in on a desktop UA. */
export function landingFor(email: string): RegExp {
  if (email.includes('qa-sub')) return /\/m\/projects/;
  if (email.includes('qa-client')) return /\/client-placeholder/;
  return /\/dashboard/;
}

/**
 * @param landing overrides the derived destination — for a spec that navigates
 *        with `?next=`, or one deliberately asserting an unusual landing.
 */
export async function signInAs(
  page: Page,
  email: string,
  landing: RegExp = landingFor(email)
): Promise<void> {
  const password = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';

  // Cookies cleared first so signing in as a SECOND identity within one test
  // works: middleware redirects an already-authenticated request away from
  // /sign-in, so without this the form never renders and the call hangs on
  // `#email` until the test times out.
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(landing, { timeout: 30_000 });
}
