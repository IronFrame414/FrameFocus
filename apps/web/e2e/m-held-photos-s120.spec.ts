import { test, expect, type Page } from '@playwright/test';
import { adminClient } from './hub-fixture';

// S120 2-B + 2-C — held photos: the strip always does something, and there is a
// list that shows WHICH photos are on this phone.
//
//   2-B  ONLINE the strip opens the tray (thumbnail + when taken, 2-C).
//        OFFLINE it used to navigate into a server-rendered page that could not
//        load (measured S120: blank screen); now it opens an in-place note and
//        does not navigate.
//   2-C  A photo whose upload failed sits in the sync queue; the nav sheet's
//        "Waiting to sync" row reaches the list, which shows its thumbnail, date,
//        project and why it is still here.
//
// Runs in the m-* project (402x874, the crew session) with touch, like a phone.
// Every context is fresh, so the phone-side stores (IndexedDB) start empty; the
// only server-side trace a failed upload could leave is swept by file name.

test.use({ hasTouch: true, isMobile: true });

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
const RUN = `s120hp-${Date.now()}`;
const admin = adminClient();

// Held through the tray's LIBRARY input: onPick holds with the batch's project
// or none, and never consults the open clock — the shell camera does (URL >
// open clock segment > none), so a parallel spec that clocks the crew member in
// would silently file the shot and there would be nothing held to test.
async function holdOneShot(page: Page, name: string) {
  await page.goto('/m/capture');
  await page
    .getByTestId('m-capture-more-library')
    .setInputFiles({ name, mimeType: 'image/png', buffer: PNG });
  await expect(page.getByTestId('m-capture-project-prompt')).toBeVisible({ timeout: 20_000 });
}

test.afterAll(async () => {
  await admin.from('files').delete().like('file_name', `${RUN}%`);
});

test('2-B online: the strip opens the tray, and the tray shows the photo and when it was taken', async ({
  page,
}) => {
  await holdOneShot(page, `${RUN}-a.png`);
  await page.goto('/m/projects');
  const strip = page.getByTestId('m-held-photos-strip');
  await expect(strip).toBeVisible();
  await strip.tap();
  await expect(page).toHaveURL(/\/m\/capture$/);
  await expect(page.getByTestId('m-capture-project-prompt')).toBeVisible();
  await expect(page.getByTestId('m-capture-thumb')).toHaveCount(1);
  await expect(page.getByTestId('m-capture-taken')).toHaveText(
    /[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}/
  );
});

test('2-B offline: the strip does NOT navigate into a page that cannot load — it says the photos are safe', async ({
  page,
  context,
}) => {
  await holdOneShot(page, `${RUN}-b.png`);
  await page.goto('/m/projects');
  const strip = page.getByTestId('m-held-photos-strip');
  await expect(strip).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await strip.tap();
  await expect(page.getByTestId('m-held-photos-offline')).toBeVisible();
  await expect(page.getByTestId('m-held-photos-offline')).toContainText(
    '1 photo(s) are safe on this phone'
  );
  await expect(page).toHaveURL(/\/m\/projects$/);
  await context.setOffline(false);
});

test('2-C a photo that failed to upload is listed — thumbnail, date, project, why — reached from the nav sheet', async ({
  page,
}) => {
  // Every storage upload from this page fails, the way a dead signal does, so
  // the photo falls back to the sync queue and STAYS there for the assertions.
  await page.route('**/storage/v1/object/**', (route) => route.abort());
  await holdOneShot(page, `${RUN}-c.png`);
  const first = page
    .getByTestId('m-capture-project-prompt')
    .locator('[data-testid^="m-capture-project-"]')
    .first();
  const projectId = ((await first.getAttribute('data-testid')) ?? '').replace(
    'm-capture-project-',
    ''
  );
  const { data: proj } = await admin.from('projects').select('name').eq('id', projectId).single();
  const projectName = (proj as { name: string }).name;
  await first.click();
  await page.getByTestId('m-capture-save').click();
  await expect(page.getByTestId('m-capture-shot-queued')).toHaveCount(1, { timeout: 20_000 });

  await page.getByTestId('m-hamburger').click();
  const row = page.getByTestId('m-sheet-waiting');
  await expect(row).toBeVisible();
  await expect(row).toContainText('1 waiting to sync');
  const box = await row.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await row.click();

  await expect(page).toHaveURL(/\/m\/offline$/);
  const item = page.getByTestId('m-queued-item').first();
  await expect(item).toBeVisible();
  await expect(item.getByTestId('m-queued-thumb')).toBeVisible();
  await expect(item).toContainText(/[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}/);
  await expect(item.getByTestId('m-queued-project')).toHaveText(projectName);
  // Why it is still here: not yet tried, or the error from the last try.
  await expect(
    item.locator('[data-testid="m-entry-why"], [data-testid="m-entry-error"]')
  ).toHaveCount(1);
  // Online, the page no longer claims "No connection".
  await expect(page.getByRole('heading', { name: 'No connection' })).toHaveCount(0);
});
