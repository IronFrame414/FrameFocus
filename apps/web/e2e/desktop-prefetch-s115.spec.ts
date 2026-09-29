import { test, expect } from '@playwright/test';
import { signInAs } from './sign-in-as';

// H-5 [S115] — the sidebar and project tabs no longer prefetch. Measured: with
// no loading.tsx a dynamic-route prefetch returned 249 B and no page data, yet
// each one ran the middleware (and its Supabase round trips) — 16–30 of them
// per screen load. This pins the removal AND that the links still navigate.

test('H-5 · the sidebar fires no prefetch, and still navigates', async ({ page }) => {
  test.setTimeout(90_000);
  await signInAs(page, 'josh+test50@worthprop.com');
  const prefetched: string[] = [];
  page.on('request', (r) => {
    const h = r.headers();
    if (h['next-router-prefetch'] === '1') prefetched.push(new URL(r.url()).pathname);
  });
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  const navHrefs = await page
    .locator('[data-testid^="nav-item-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(navHrefs.length, 'the sidebar rendered its items').toBeGreaterThan(3);
  const navPrefetches = prefetched.filter((p) => navHrefs.includes(p));
  expect(navPrefetches, 'sidebar prefetches').toEqual([]);

  await page.locator('[data-testid="nav-item-/dashboard/projects"]').click();
  // The projects list itself takes seconds server-side (see H-5); the budget is
  // for that page, not for the link.
  await expect(page).toHaveURL(/\/dashboard\/projects$/, { timeout: 30_000 });
});
