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
  // SUPERSEDED [S121 1-A, Josh ASK-33] — was: toHaveAttribute('content', 'black').
  // Inverted in place: translucent + the header's safe-area padding is what
  // paints the status-bar strip navy.
  await expect(
    page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')
  ).toHaveAttribute('content', 'black-translucent');
  // [S121 1-A] The OS chrome colour and the inset both depend on these two.
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f1729');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/
  );
});

test('S121 1-B · the camera stays the top layer over scrolled content', async ({ page }) => {
  await page.goto('/m/timeclock');
  const camera = page.getByTestId('m-camera');
  await expect(camera).toBeVisible();
  // A field-like box filling the content region, scrolled so it sits behind
  // the camera's overhang — the shape Josh hit on the sign-out form. It is
  // appended INSIDE <main>, so it paints exactly where page content paints.
  const hit = await page.evaluate(() => {
    const main = document.querySelector('[data-testid="m-content"]') as HTMLElement;
    const box = document.createElement('textarea');
    box.setAttribute('data-testid', 's121-probe-field');
    box.style.cssText = 'display:block;width:100%;height:3000px;background:#fff';
    main.appendChild(box);
    // Mid-scroll, NOT the bottom: the FAB-inset padding clears the end of the
    // scroll room, so at the very bottom nothing sits behind the camera.
    main.scrollTop = 1000;
    const r = document.querySelector('[data-testid="m-camera"]')!.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + 6);
    return {
      camera: !!el?.closest('[data-testid="m-camera"]'),
      probeUnderCamera: document
        .elementsFromPoint(r.left + r.width / 2, r.top + 6)
        .some((e) => e.getAttribute('data-testid') === 's121-probe-field'),
    };
  });
  // Non-vacuity: the probe really is under that point — otherwise "camera on
  // top" would pass with nothing behind it.
  expect(hit.probeUnderCamera).toBe(true);
  expect(hit.camera).toBe(true);
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
