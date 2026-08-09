import { test, expect } from '@playwright/test';

// M6M §7.2 — the PWA criteria a browser can carry: A-26d and A-26e.
//
// A-26 itself — installs to an iOS home screen, launches at /m standalone —
// is [manual] by nature: no tool installs a PWA to an iPhone. §10's own words.
// The [unit] half of this surface (manifest fields, brand sourcing, icons,
// token independence, the retry-hook file pair) lives in test/m6m-pwa.test.ts.
//
// Runs under 'chromium-auth' (crew identity, 402x874) like every m-* spec.

test('A-26d · the service worker registers from the mobile layout with scope /m and is active', async ({
  page,
}) => {
  await page.goto('/m/timeclock');

  // navigator.serviceWorker.ready resolves only when a registration whose
  // scope covers THIS page has an active worker — so this one evaluate
  // asserts registration, scope coverage and activation together.
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { scope: r.scope, active: !!r.active };
  });
  expect(new URL(reg.scope).pathname).toBe('/m');
  expect(reg.active).toBe(true);
});

test('A-26d · the worker carries the queue retry hook — and holds no queue of its own', async ({
  page,
}) => {
  const sw = await (await page.request.get('/sw.js')).text();
  // The Background Sync hook, by its tag — the same literal the provider
  // subscribes to (the pair is pinned in test/m6m-pwa.test.ts).
  expect(sw).toContain("addEventListener('sync'");
  expect(sw).toContain('m6m-queue-sync');
  expect(sw).toContain('postMessage');
  // A trigger, not a second retry path: the worker must never grow its own
  // replay — the queue and engine stay in the page (957d3c4).
  expect(sw).not.toContain('indexedDB');
  expect(sw).not.toContain('supabase');
});

test('A-26e · the mobile document head carries the iOS install metas (the D-10 precondition)', async ({
  page,
}) => {
  await page.goto('/m/timeclock');
  // Head metas are attached, not visible — assert attributes, not visibility.
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes'
  );
  await expect(
    page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')
  ).toHaveAttribute('content', 'black');
});

test('the manifest is linked once and serves with M6M\'s two owned fields', async ({ page }) => {
  await page.goto('/m/timeclock');
  // Next injects the <link rel="manifest"> from app/manifest.ts; a second,
  // hand-written link would make browsers pick unpredictably.
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = (await (await page.request.get(href!)).json()) as {
    start_url: string;
    display: string;
  };
  expect(manifest.start_url).toBe('/m');
  expect(manifest.display).toBe('standalone');
});
