import { test, expect } from '@playwright/test';
import { signInAs } from './sign-in-as';
import { PHOTO_COUNT, setupThumbFixture, sweepThumbFixture, watchStorageImages } from './thumb-fixture';

// [S111 D] The desktop Photos grid serves THUMBNAILS, loaded AHEAD of the
// viewport — and never an original.
//
// Measured on production before this: 45.9 MB / 108 requests for ~10 photos,
// every tile the full-resolution original. The assertions are on what the
// BROWSER requested, not on what the markup says it will request:
//   * every storage image request is /render/image/ — ZERO /object/ requests;
//   * on first view, loaded tiles are exactly those within 2 screens of the
//     visible area (lib/photos/thumbnail.ts BUFFER_SCREENS.desktop), so some of
//     the 80 are NOT loaded — a pass with everything loaded would mean the
//     buffer does nothing;
//   * scrolling to the end loads every one of the 80 (count stated).

const OWNER = 'josh+test50@worthprop.com';
let projectId = '';

test.use({ viewport: { width: 1280, height: 600 } });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  projectId = await setupThumbFixture('desktop');
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await sweepThumbFixture('desktop');
});

test('[S111 D] desktop grid: thumbnails only, two screens ahead, the rest on scroll', async ({ page }) => {
  test.setTimeout(180_000);
  await signInAs(page, OWNER);
  const seen = watchStorageImages(page);
  await page.goto(`/dashboard/projects/${projectId}/photos`);
  await expect(page.getByText(/^Photos · \d+ total$/)).toHaveText(`Photos · ${PHOTO_COUNT} total`);

  const tiles = page.getByTestId('photos-grid-thumb');
  await expect(tiles).toHaveCount(PHOTO_COUNT);
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
      const isLoaded = i.dataset.lazy === 'loaded';
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

  // Scroll the way a person does — one screen per wheel step, over the grid.
  // NOT scrollIntoView on the last tile: that jumps, and tiles it leaps over
  // can end up beyond the buffer ABOVE the new position (see the /m spec).
  const box = await tiles.first().boundingBox();
  await page.mouse.move((box?.x ?? 100) + 20, (box?.y ?? 300) + 20);
  for (let step = 0; step < 40; step++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(150);
    if (await tiles.last().evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight)) break;
  }
  await expect(page.locator('[data-testid="photos-grid-thumb"][data-lazy="loaded"]')).toHaveCount(PHOTO_COUNT, {
    timeout: 30_000,
  });
  await expect
    .poll(() => tiles.evaluateAll((els) => (els as HTMLImageElement[]).filter((i) => i.naturalWidth > 0).length), {
      timeout: 30_000,
    })
    .toBe(PHOTO_COUNT);

  console.log(`[S111 D desktop] storage image requests: thumbs ${seen.thumbs.length}, originals ${seen.originals.length}`);
  expect(seen.originals, 'the grid requested an ORIGINAL').toEqual([]);
  expect(seen.thumbs.length).toBeGreaterThanOrEqual(PHOTO_COUNT);
});
