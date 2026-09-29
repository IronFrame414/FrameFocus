import { expect, test } from '@playwright/test';

// H-1 [S115] — THE MIDDLEWARE STILL GATES WHAT IT GATED.
//
// S115 changed HOW middleware.ts fetches (the lock RPC with the profile read,
// then the card-gate read with the subscription read, each pair in one
// Promise.all) and not WHAT it decides. These are the negatives that prove the
// gate did not quietly open while the fetches moved: a signed-out request for a
// protected route still ends at /sign-in, an API route still refuses, and the
// public routes the matcher never covered still load without a session.
//
// The signed-IN halves of the same decisions are asserted elsewhere and ran
// against this change unmodified: the role guard (`desktop-dashboard-guard`:
// a subcontractor and a client bounce, an owner reaches the roster pages) and
// the trial lock (`desktop-trial-screens`). This file owns the signed-out side.
//
// No storageState: the `chromium` project runs this file with no session.

const PROTECTED = [
  '/dashboard',
  '/dashboard/projects',
  '/dashboard/projects/00000000-0000-4000-8000-000000000000',
  '/dashboard/billing',
  '/dashboard/team',
];

test.describe('H-1 · signed out, a protected route still redirects', () => {
  for (const path of PROTECTED) {
    test(`${path} → /sign-in`, async ({ page }) => {
      await page.context().clearCookies();
      await page.goto(path);
      await expect(page, `${path} rendered without a session`).toHaveURL(/\/sign-in/);
      await expect(page.locator('#email')).toBeVisible();
    });
  }

  test('/m → /sign-in?next=/m (the /m layout owns this redirect; middleware must not break it)', async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto('/m');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fm/);
  });

  test('an API route refuses a signed-out caller with 401, never data', async ({ request }) => {
    const res = await request.get('/api/chat/threads');
    expect(res.status()).toBe(401);
  });
});

test.describe('H-1 · a public route still loads with no session', () => {
  test('/sign-in renders its form (200)', async ({ page }) => {
    await page.context().clearCookies();
    const res = await page.goto('/sign-in');
    expect(res?.status()).toBe(200);
    await expect(page.locator('#email')).toBeVisible();
  });

  for (const path of ['/terms', '/privacy']) {
    test(`${path} → 200, not redirected`, async ({ page }) => {
      await page.context().clearCookies();
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    });
  }

  // A made-up token: the page may say the link is invalid, but it must say so
  // ITSELF — being bounced to /sign-in would mean the matcher grew to cover a
  // token route that a client or sub opens with no account.
  for (const path of ['/bid/s115-not-a-real-token', '/sign/s115-not-a-real-token']) {
    test(`${path} is not sent to /sign-in`, async ({ page }) => {
      await page.context().clearCookies();
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/sign-in/);
    });
  }
});
