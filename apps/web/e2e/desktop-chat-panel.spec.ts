import { test, expect } from '@playwright/test';
import { OWNER, signIn, teardownChat, PROJECT_QA_A, PROJECT_TEST } from './chat-fixture';

// CHUNK 1 of 4 — ND-33's global panel. A-C24, A-C25.
//
// Named desktop-*.spec.ts, not m-*, so it lands in the anonymous `chromium`
// project at a DESKTOP viewport and signs in itself — the precedent
// desktop-punch.spec.ts and sign-in-destination.spec.ts already set. An m-*
// name would run it at 402x874 with a crew session, which is the wrong surface
// for a panel that is supposed to sit over a full dashboard page.

test.afterAll(async () => {
  await teardownChat([PROJECT_QA_A, PROJECT_TEST]);
});

test.describe('A-C24 — the launcher is GLOBAL, not project-scoped', () => {
  // ND-33's whole claim. A build that mounted the panel on project pages would
  // pass every other criterion in this slice and fail only here.
  for (const path of ['/dashboard', '/dashboard/contacts', '/dashboard/estimates', '/dashboard/settings']) {
    test(`the chat icon renders on ${path}`, async ({ page }) => {
      await signIn(page, OWNER);
      await page.goto(path);
      await expect(page.getByTestId('chat-launcher')).toBeVisible({ timeout: 20_000 });
    });
  }
});

test.describe('A-C25 — opening the panel changes nothing underneath', () => {
  test('the route does not change and the page keeps its state', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/dashboard/contacts');

    const before = page.url();

    // Type into the page underneath FIRST. "Keeps its state" is the half of
    // A-C25 that a route assertion alone cannot see — a panel implemented as a
    // navigation would restore this page blank and the URL check would still
    // pass if it navigated back.
    const search = page.locator('input[type="text"], input[type="search"]').first();
    const hasSearch = await search.count();
    if (hasSearch > 0) await search.fill('sentinel-value');

    await page.getByTestId('chat-launcher').click();
    await expect(page.getByTestId('chat-panel')).toBeVisible();

    expect(page.url()).toBe(before);
    if (hasSearch > 0) await expect(search).toHaveValue('sentinel-value');
  });

  test('the panel closes again from the same control', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/dashboard');

    await page.getByTestId('chat-launcher').click();
    await expect(page.getByTestId('chat-panel')).toBeVisible();

    await page.getByTestId('chat-launcher').click();
    await expect(page.getByTestId('chat-panel')).toHaveCount(0);
  });
});
