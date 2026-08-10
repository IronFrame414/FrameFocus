import { test, expect, type Page } from '@playwright/test';
import { OWNER, signIn, teardownChat } from './chat-fixture';
import { adminClient } from './hub-fixture';

// CHUNK — slice 6, ND-22. A-C17, A-C18, A-C19.
//
// ⚠️ THE PROJECT CHOICE IS LOAD-BEARING, AND MY FIRST ONE WAS WRONG.
//
// This file originally ran against "test" (4 photo rows) on the stated premise
// that they had "real storage paths, so displayUrl genuinely signs". They do
// not. Measured afterwards: rebuild-test holds 62 objects in `project-files`,
// and of every `category='photos'` row, exactly SIX have a matching storage
// object — all of them on "kitchen test".
//
// The rows without blobs resolve to `displayUrl: null`, which the renderer
// correctly SKIPS rather than showing a broken image — so the thumbnail
// assertions failed against a build that was working. The test premise was the
// defect. Verified with a join against `storage.objects` before repointing.
//
// A future test asserting a rendered chat photo has to use this project.

const PROJECT = '6c395b31-cd45-4683-bb6a-cc4895488692'; // "kitchen test" — 6 photos WITH blobs
const OTHER_PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4'; // "test" — 4 rows, no blobs

// ⚠️ PER TEST, NOT PER FILE. With teardown only in afterAll, test 1's
// two-photo message survived into the tests below and their GLOBAL
// `chat-message-photo` counts read 2 instead of 1 — a pollution failure that
// looked exactly like a rendering bug. The build was correct both times.
test.beforeEach(async () => {
  await teardownChat([PROJECT]);
});

test.afterAll(async () => {
  // The join rows cascade with the messages; the FILES are pre-existing project
  // data and are deliberately left alone.
  await teardownChat([PROJECT]);
});

async function openThread(page: Page) {
  await signIn(page, OWNER);
  await page.goto('/dashboard');
  await page.getByTestId('chat-launcher').click();
  await page
    .locator(`[data-testid="chat-switcher-project"][data-project-id="${PROJECT}"]`)
    .click();
  await expect(page.getByTestId('chat-thread')).toBeVisible({ timeout: 20_000 });
}

test.describe('§5.4 — the attach button opens the project gallery', () => {
  test('A-C19 — the picker offers THIS project only', async ({ page }) => {
    await openThread(page);
    await page.getByTestId('chat-attach').click();

    const options = page.getByTestId('chat-photo-option');
    await expect(options.first()).toBeVisible({ timeout: 20_000 });
    await expect(options).toHaveCount(6);

    // ⚠️ THE NEGATIVE IS THE CRITERION. A picker that queried `files` without
    // the project filter would show 10 here and still "work". The other
    // project's photos are asserted absent by id.
    const admin = adminClient();
    const { data } = await admin
      .from('files')
      .select('id')
      .eq('project_id', OTHER_PROJECT)
      .eq('category', 'photos');
    for (const row of (data ?? []) as Array<{ id: string }>) {
      await expect(page.locator(`[data-testid="chat-photo-option"][data-file-id="${row.id}"]`)).toHaveCount(0);
    }
  });

  test('A-C18 — there is no file input anywhere in the composer', async ({ page }) => {
    await openThread(page);
    // Reference, not upload. A build that added `<input type="file">` "because
    // it's easier" passes every other photo criterion and fails only here.
    await expect(page.locator('[data-testid="chat-thread"] input[type="file"]')).toHaveCount(0);
    await page.getByTestId('chat-attach').click();
    await expect(page.getByTestId('chat-photo-picker')).toBeVisible();
    await expect(page.locator('[data-testid="chat-photo-picker"] input[type="file"]')).toHaveCount(0);
  });
});

test.describe('A-C17 — a message references two photos and renders both', () => {
  test('picked, sent, and rendered as thumbnails', async ({ page }) => {
    await openThread(page);
    await page.getByTestId('chat-attach').click();

    const options = page.getByTestId('chat-photo-option');
    await expect(options.first()).toBeVisible({ timeout: 20_000 });
    const first = await options.nth(0).getAttribute('data-file-id');
    const second = await options.nth(1).getAttribute('data-file-id');

    await options.nth(0).click();
    await options.nth(1).click();
    await expect(page.getByTestId('chat-composer-attachment')).toHaveCount(2);

    const body = `two photos ${Date.now()}`;
    await page.getByTestId('chat-composer-input').fill(body);
    await page.getByTestId('chat-send').click();

    const message = page.getByTestId('chat-message').filter({ hasText: body });
    await expect(message).toHaveCount(1, { timeout: 20_000 });
    await expect(message.getByTestId('chat-message-photo')).toHaveCount(2);
    await expect(
      message.locator(`[data-testid="chat-message-photo"][data-file-id="${first}"]`)
    ).toHaveCount(1);
    await expect(
      message.locator(`[data-testid="chat-message-photo"][data-file-id="${second}"]`)
    ).toHaveCount(1);

    // The composer clears its selection on success — a lingering attachment
    // would silently ride along on the NEXT message.
    await expect(page.getByTestId('chat-composer-attachment')).toHaveCount(0);
  });

  test('§5.4 — a message can carry photos and NO text', async ({ page }) => {
    await openThread(page);
    await page.getByTestId('chat-attach').click();
    await expect(page.getByTestId('chat-photo-option').first()).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('chat-photo-option').nth(0).click();

    // "The message can carry text, photos, or both" — requiring text would make
    // the attach button useless on its own.
    await expect(page.getByTestId('chat-send')).toBeEnabled();
    await page.getByTestId('chat-send').click();

    await expect(page.getByTestId('chat-message-photo')).toHaveCount(1, { timeout: 20_000 });
  });

  test('the thumbnail points at displayUrl, not a path chat built', async ({ page }) => {
    await openThread(page);
    await page.getByTestId('chat-attach').click();
    await expect(page.getByTestId('chat-photo-option').first()).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('chat-photo-option').nth(0).click();
    await page.getByTestId('chat-send').click();

    const thumb = page.getByTestId('chat-message-photo').first();
    await expect(thumb).toBeVisible({ timeout: 20_000 });
    // A signed Supabase URL, which is what getProjectPhotos() produces (D-31).
    // Chat resolving its own path would produce a bare storage path instead.
    const href = await thumb.getAttribute('href');
    expect(href).toContain('/storage/v1/object/sign/');

    // And it actually loaded — a signed URL for a blob that is not there would
    // give naturalWidth 0 and every assertion above would still pass.
    const width = await thumb.locator('img').evaluate((img) => (img as HTMLImageElement).naturalWidth);
    expect(width).toBeGreaterThan(0);
  });
});
