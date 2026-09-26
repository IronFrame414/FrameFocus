import { test, expect, type Page } from '@playwright/test';
import { signInAs } from './sign-in-as';
import { PHOTO_COUNT, setupThumbFixture, sweepThumbFixture, watchStorageImages, type ThumbFixture } from './thumb-fixture';

// [S111 D, option A] The desktop Photos grid serves STORED THUMBNAILS, batch-
// signed, loaded AHEAD of the viewport — and falls back to the full file when a
// photo has no thumbnail, so a photo is never invisible.
//
// Measured on production before this: 45.9 MB / 108 requests for ~10 photos,
// every tile the full-resolution original. Assertions are on what the BROWSER
// requested, not on what the markup says it will request.

const OWNER = 'josh+test50@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
let withThumbs: ThumbFixture;
let without: ThumbFixture;

test.use({ viewport: { width: 1280, height: 600 } });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  withThumbs = await setupThumbFixture('desktop');
  without = await setupThumbFixture('desktop-nothumbs', { thumbnails: false });
  const ms = [...withThumbs.generationMs].sort((a, b) => a - b);
  console.log(
    `[S111 D desktop] generated ${ms.length} thumbnails: median ${ms[Math.floor(ms.length / 2)]} ms, max ${ms.at(-1)} ms`
  );
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await sweepThumbFixture('desktop');
  await sweepThumbFixture('desktop-nothumbs');
});

/** Wheel-scroll one screen at a time to the end — the way a person scrolls. */
async function scrollToEnd(page: Page) {
  const tiles = page.getByTestId('photos-grid-thumb');
  const box = await tiles.first().boundingBox();
  await page.mouse.move((box?.x ?? 100) + 20, (box?.y ?? 300) + 20);
  for (let step = 0; step < 40; step++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(150);
    if (await tiles.last().evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight)) break;
  }
}

async function allVisible(page: Page) {
  const tiles = page.getByTestId('photos-grid-thumb');
  await expect(page.locator('[data-testid="photos-grid-thumb"][data-lazy="loaded"]')).toHaveCount(PHOTO_COUNT, {
    timeout: 30_000,
  });
  await expect
    .poll(() => tiles.evaluateAll((els) => (els as HTMLImageElement[]).filter((i) => i.naturalWidth > 0).length), {
      timeout: 30_000,
    })
    .toBe(PHOTO_COUNT);
}

test('[S111 D] desktop grid: stored thumbnails only, two screens ahead, the rest on scroll', async ({ page }) => {
  test.setTimeout(180_000);
  await signInAs(page, OWNER);
  const seen = watchStorageImages(page);
  await page.goto(`/dashboard/projects/${withThumbs.projectId}/photos`);
  await expect(page.getByText(/^Photos · \d+ total$/)).toHaveText(`Photos · ${PHOTO_COUNT} total`);
  await expect(page.getByTestId('photos-grid-thumb')).toHaveCount(PHOTO_COUNT);
  await page.waitForTimeout(1_500); // let the observer settle

  const first = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('[data-testid="photos-grid-thumb"]')) as HTMLImageElement[];
    let root: Element | null = imgs[0].parentElement;
    while (root && root !== document.body) {
      const oy = getComputedStyle(root).overflowY;
      if (oy === 'auto' || oy === 'scroll') break;
      root = root.parentElement;
    }
    const box =
      root && root !== document.body
        ? root.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight, height: window.innerHeight };
    const reach = box.bottom + 2 * box.height;
    const rowH = imgs[0].getBoundingClientRect().height;
    let loaded = 0;
    let wronglyLoaded = 0;
    let wronglyPending = 0;
    for (const i of imgs) {
      const r = i.getBoundingClientRect();
      // In range = loaded OR queued for a load slot (lib/photos caps in-flight loads).
      const isLoaded = i.dataset.lazy !== 'pending';
      if (isLoaded) loaded++;
      if (isLoaded && r.top > reach + rowH) wronglyLoaded++;
      if (!isLoaded && r.bottom < reach - rowH) wronglyPending++;
    }
    return { loaded, wronglyLoaded, wronglyPending, rootHeight: box.height, rowH };
  });
  console.log(`[S111 D desktop] first view: ${JSON.stringify(first)} of ${PHOTO_COUNT}`);
  expect(first.loaded, 'nothing loaded').toBeGreaterThan(0);
  expect(first.loaded, 'every tile loaded at once — the buffer is not limiting anything').toBeLessThan(PHOTO_COUNT);
  expect(first.wronglyLoaded, 'a tile beyond 2 screens loaded early').toBe(0);
  expect(first.wronglyPending, 'a tile inside 2 screens was not loaded').toBe(0);

  await scrollToEnd(page);
  await allVisible(page);

  console.log(
    `[S111 D desktop] storage image requests: thumbs ${seen.thumbs.length}, originals ${seen.originals.length}, renders ${seen.renders.length}`
  );
  expect(seen.originals, 'the grid requested a FULL file although every photo has a thumbnail').toEqual([]);
  expect(seen.renders, 'the grid hit /render/image/ per view — the route ruled out').toEqual([]);
  expect(seen.thumbs.length).toBeGreaterThanOrEqual(PHOTO_COUNT);
});

test('[S111 D] RULED: no thumbnail → the full file, never an invisible photo', async ({ page }) => {
  test.setTimeout(180_000);
  await signInAs(page, OWNER);
  const seen = watchStorageImages(page);
  await page.goto(`/dashboard/projects/${without.projectId}/photos`);
  await expect(page.getByTestId('photos-grid-thumb')).toHaveCount(PHOTO_COUNT);
  await scrollToEnd(page);
  await allVisible(page);
  console.log(
    `[S111 D desktop fallback] thumbs ${seen.thumbs.length}, full files ${seen.originals.length}, renders ${seen.renders.length}`
  );
  expect(seen.thumbs).toEqual([]);
  expect(seen.renders).toEqual([]);
  expect(seen.originals.length).toBeGreaterThanOrEqual(PHOTO_COUNT);
});

test('[S111 D] the generation route: the owner generates on demand; an unassigned subcontractor is refused', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const fileId = without.fileIds[0];

  await signInAs(page, OWNER);
  const ok = await page.request.post('/api/photos/thumbnail', { data: { fileId } });
  const body = (await ok.json()) as { ok?: boolean; path?: string; ms?: number; bytes?: number };
  console.log(`[S111 D route] owner: ${ok.status()} ${JSON.stringify(body)}`);
  expect(ok.status()).toBe(200);
  expect(body.ok).toBe(true);
  expect(body.path).toMatch(/\.thumb\.webp$/);

  const ctx = await browser.newContext();
  const subPage = await ctx.newPage();
  await signInAs(subPage, SUB);
  const refused = await subPage.request.post('/api/photos/thumbnail', { data: { fileId } });
  console.log(`[S111 D route] unassigned subcontractor: ${refused.status()}`);
  expect(refused.status()).toBe(403);
  await ctx.close();
});
