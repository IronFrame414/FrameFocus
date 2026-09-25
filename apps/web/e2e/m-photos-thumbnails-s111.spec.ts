import { test, expect, type Page } from '@playwright/test';
import { signInAs } from './sign-in-as';
import { PHOTO_COUNT, setupThumbFixture, sweepThumbFixture, watchStorageImages } from './thumb-fixture';

// [S111 D, option A] The /m Photos grid: STORED thumbnails only, 12 screens ahead normally, and
// a SHORTER buffer when the browser reports data-saver (navigator.connection,
// lib/photos/thumbnail.ts). A short viewport makes both behaviours visible with
// 80 photos: 12 screens covers all 80; 3 screens does not.

const OWNER = 'josh+test50@worthprop.com';
let projectId = '';

test.use({ viewport: { width: 402, height: 500 } });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  projectId = (await setupThumbFixture('mobile')).projectId;
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await sweepThumbFixture('mobile');
});

async function open(page: Page) {
  await signInAs(page, OWNER);
  const seen = watchStorageImages(page);
  await page.goto(`/m/p/${projectId}/photos`);
  await expect(page.getByTestId('m-tile-image')).toHaveCount(PHOTO_COUNT, { timeout: 30_000 });
  await page.waitForTimeout(1_500); // let the observer settle
  return seen;
}

// In range = loaded OR queued for a load slot (lib/photos caps in-flight loads).
const loadedCount = (page: Page) =>
  page
    .getByTestId('m-tile-image')
    .evaluateAll((els) => els.filter((e) => (e as HTMLElement).dataset.lazy !== 'pending').length);

test('[S111 D] /m grid: stored thumbnails only; the full buffer covers all 80', async ({ page }) => {
  test.setTimeout(180_000);
  const seen = await open(page);
  const loaded = await loadedCount(page);
  console.log(`[S111 D m] normal connection: ${loaded} of ${PHOTO_COUNT} have a src without scrolling`);
  expect(loaded).toBe(PHOTO_COUNT);
  await expect
    .poll(() => page.locator('[data-testid="m-tile-image"][data-state="loaded"]').count(), { timeout: 30_000 })
    .toBe(PHOTO_COUNT);
  console.log(
    `[S111 D m] storage image requests: thumbs ${seen.thumbs.length}, originals ${seen.originals.length}, renders ${seen.renders.length}`
  );
  expect(seen.originals, 'the grid requested a FULL file although every photo has a thumbnail').toEqual([]);
  expect(seen.renders, 'the grid hit /render/image/ per view — the route ruled out').toEqual([]);
  expect(seen.thumbs.length).toBeGreaterThanOrEqual(PHOTO_COUNT);
});

test('[S111 D] /m grid: data-saver shrinks the buffer; scrolling still loads the rest', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      get: () => ({ saveData: true, effectiveType: '4g' }),
    });
  });
  await open(page);
  const before = await loadedCount(page);
  console.log(`[S111 D m] data-saver: ${before} of ${PHOTO_COUNT} have a src without scrolling`);
  expect(before, 'nothing loaded').toBeGreaterThan(0);
  expect(before, 'data-saver did not shrink the buffer').toBeLessThan(PHOTO_COUNT);

  // Scroll the way a person does — a screen at a time. NOT scrollIntoView on
  // the last tile: that jumps the container straight to the bottom, and the
  // tiles it leaps over end up more than 3 screens ABOVE the new position,
  // correctly unloaded (measured: 65 of 80). The buffer's job is to stay ahead
  // of someone scrolling, not to fill in a jump.
  const content = page.getByTestId('m-content');
  for (let step = 0; step < 40; step++) {
    const done = await content.evaluate((el) => {
      el.scrollBy(0, el.clientHeight);
      return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    });
    await page.waitForTimeout(150);
    if (done) break;
  }
  await expect.poll(() => loadedCount(page), { timeout: 30_000 }).toBe(PHOTO_COUNT);
});
