import { test, expect } from '@playwright/test';
import { OWNER, PROJECT_QA_A, signIn } from './chat-fixture';

// ============================================================================
// RULING A [Josh, S131] — DASHBOARD_ROLES, enforced, observed in a browser.
// ============================================================================
//
// ⚠️ WHY A BROWSER TEST AND NOT ONLY THE UNIT ONES. `s131-dashboard-access.test.ts`
// proves the predicate and that both seats IMPORT the helper. Neither fact
// proves a redirect actually happens: a guard placed after an early return, a
// matcher that does not cover the path, or a layout that renders before it
// redirects would all satisfy the unit suite and let a subcontractor onto the
// dashboard. Only driving it shows the bounce.
//
// The exposure this closes was measured, not theorised — before S131 a
// subcontractor and a client each read the company's full contacts list, sub
// roster and team roster from these very routes.

const SUB = 'josh+qa-sub@worthprop.com';
const CLIENT = 'josh+qa-client@worthprop.com';

test.describe('a subcontractor cannot reach the dashboard', () => {
  test('⚠️ signing in lands on /m/projects, never /dashboard', async ({ page }) => {
    await signIn(page, SUB, /\/m\/projects/);
    await expect(page).toHaveURL(/\/m\/projects/);
  });

  test('and typing /dashboard directly bounces too', async ({ page }) => {
    await signIn(page, SUB, /\/m\/projects/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/m\/projects/);
  });

  test('⚠️ a DEEP dashboard link bounces — the roster pages especially', async ({ page }) => {
    // The three routes the S130 measurement found readable. A guard that only
    // covered '/dashboard' exactly would leave every one of these reachable,
    // and they are the whole reason the ruling exists.
    await signIn(page, SUB, /\/m\/projects/);
    for (const path of [
      '/dashboard/contacts',
      '/dashboard/subcontractors',
      '/dashboard/team',
      `/dashboard/projects/${PROJECT_QA_A}`,
    ]) {
      await page.goto(path);
      await expect(page, `${path} did not bounce`).toHaveURL(/\/m\/projects/);
    }
  });

  test('/dashboard/billing bounces as well — NOT to the billing paywall', async ({ page }) => {
    // The guard runs before subscription enforcement on purpose. A sub whose
    // company is on an expired trial must not be handed /dashboard/billing/plans:
    // a dashboard page they may not reach, and an Owner-only one at that.
    await signIn(page, SUB, /\/m\/projects/);
    await page.goto('/dashboard/billing');
    await expect(page).toHaveURL(/\/m\/projects/);
  });
});

test.describe('a client cannot reach the dashboard', () => {
  // ⚠️ REWRITTEN AT S164, NOT DELETED. This block asserted the HOLDING PAGE:
  //
  //   test('⚠️ lands on the placeholder, which names no company and shows no nav')
  //     await expect(page.getByRole('heading', { name: /portal is coming soon/i })).toBeVisible();
  //     // "It is a holding page, not the first piece of a portal: no dashboard
  //     //  chrome, and nothing that could leak the tenant."
  //
  // M9 stage 4 deleted `/client-placeholder` and built `/portal`. The
  // "names no company" half is deliberately overturned — R20 requires the
  // portal to carry the COMPANY's identity once authenticated. What survives
  // untouched is the guard itself: a client does not reach the dashboard, and
  // does not loop.
  test('⚠️ lands on the portal, with the company’s branding and no dashboard nav', async ({
    page,
  }) => {
    await signIn(page, CLIENT, /\/portal/);
    await expect(page).toHaveURL(/\/portal/);

    // R20 — the company names itself here, and the PRODUCT does not.
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.getByText(/EZ Contractor Binder|EZ Binder/)).toHaveCount(0);

    // Still no dashboard chrome: this is a client surface, not a stripped
    // version of the staff one.
    await expect(page.getByTestId('chat-launcher')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /contacts|team|timesheets/i })).toHaveCount(0);
  });

  test('and /dashboard bounces there rather than looping', async ({ page }) => {
    // The loop this guards against is real: a layout that redirects a denied
    // role to a page whose own layout redirects back is an infinite bounce.
    // The portal layout admits a client — including a DEACTIVATED one, which is
    // what keeps this from looping now that the destination has a guard of its
    // own.
    await signIn(page, CLIENT, /\/portal/);
    await page.goto('/dashboard/contacts');
    await expect(page).toHaveURL(/\/portal/);
  });

  test('⚠️ and a staff role cannot reach the portal — the guard is symmetrical', async ({
    page,
  }) => {
    await signIn(page, OWNER);
    await page.goto('/portal');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('the five dashboard roles are unaffected', () => {
  test('an Owner still reaches /dashboard and its roster pages', async ({ page }) => {
    // The paired positive. Without it a guard that redirected EVERYONE would
    // pass every test above.
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/dashboard/contacts');
    await expect(page).toHaveURL(/\/dashboard\/contacts/);
    await page.goto('/dashboard/team');
    await expect(page).toHaveURL(/\/dashboard\/team/);
  });
});
