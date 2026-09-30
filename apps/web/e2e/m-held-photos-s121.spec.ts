import { test, expect, type Page } from '@playwright/test';
import { adminClient } from './hub-fixture';

// S121 Part 2 — Josh: "I still have 30 photos that won't land in a project."
//
// The diagnosis (S121 report §1.3): a photo queued for later KEPT its tray row,
// and nothing removed that row when the queue uploaded it. It sat there as
// "waiting" for ever, the strip counted it as a photo with no project, and
// "Save" skipped it. These drive the real paths on a 402px touch context:
//
//   GHOST     queued → the queue uploads it → the tray row is cleared, and SAID
//   SELECT    two held photos, one selected, sent to a project → exactly that one
//             lands; the result line counts it; the other is still held
//   OLD       an 8-day-old photo is still there on open (no silent sweep); the
//             tray ASKS; "Keep them" keeps it; "Delete 1" removes it
//
// Every server-side assertion is a service-role count by file name — never the
// UI's own claim.

test.use({ hasTouch: true, isMobile: true });

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
const RUN = `s121hp-${Date.now()}`;
const admin = adminClient();

async function holdShots(page: Page, names: string[]) {
  await page.goto('/m/capture');
  await page.getByTestId('m-capture-more-library').setInputFiles(
    names.map((name) => ({ name, mimeType: 'image/png', buffer: PNG }))
  );
  await expect(page.getByTestId('m-capture-shot-held')).toHaveCount(names.length, {
    timeout: 20_000,
  });
}

async function firstProject(page: Page): Promise<{ id: string; name: string }> {
  const first = page
    .getByTestId('m-capture-project-prompt')
    .locator('[data-testid^="m-capture-project-"]')
    .first();
  const id = ((await first.getAttribute('data-testid')) ?? '').replace('m-capture-project-', '');
  const { data } = await admin.from('projects').select('name').eq('id', id).single();
  return { id, name: (data as { name: string }).name };
}

async function landedCount(name: string): Promise<number> {
  const { count, error } = await admin
    .from('files')
    .select('id', { count: 'exact', head: true })
    .eq('file_name', name)
    .eq('is_deleted', false);
  if (error) throw error;
  return count ?? 0;
}

test.afterAll(async () => {
  await admin.from('files').delete().like('file_name', `${RUN}%`);
});

test('GHOST · a queued photo that the queue uploads leaves the tray, and the tray says where it went', async ({
  page,
}) => {
  const name = `${RUN}-ghost.png`;
  // A dead signal: every storage upload fails, so the photo falls to the queue.
  await page.route('**/storage/v1/object/**', (route) => route.abort());
  await holdShots(page, [name]);
  const project = await firstProject(page);
  await page.getByTestId(`m-capture-project-${project.id}`).click();
  await page.getByTestId('m-capture-save').click();
  await expect(page.getByTestId('m-capture-shot-queued')).toHaveCount(1, { timeout: 20_000 });
  expect(await landedCount(name)).toBe(0);

  // Signal back: the queue drains on its own trigger.
  await page.unroute('**/storage/v1/object/**');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => landedCount(name), { timeout: 30_000 }).toBe(1);

  // LIVE: the queue shrank, so the queued rows were re-checked and this one —
  // now a files row — left the tray, and the tray SAYS where it went. Before
  // S121 the row stayed "waiting to upload" for ever.
  await expect(page.getByTestId('m-capture-shot-queued')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId('m-capture-already-landed')).toBeVisible();
  await expect(page.getByTestId('m-capture-already-landed')).toContainText(project.name);
  await expect(page.getByTestId('m-capture-already-landed')).toContainText('1 photo was');

  // JOSH'S CASE — a ghost written BEFORE this fix: a `queued` tray row whose
  // photo is already a files row. Seeded with the real landed file's id (the
  // shot id IS the files.id), then the app is reopened.
  const { data: row } = await admin.from('files').select('id').eq('file_name', name).single();
  const fileId = (row as { id: string }).id;
  await page.evaluate(async (shotId) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('m6m-held-shots', 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise<void>((res, rej) => {
      const t = db.transaction('held', 'readwrite');
      t.objectStore('held').put({
        id: shotId,
        blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
        fileName: 'pre-s121-ghost.png',
        takenAt: new Date(Date.now() - 86_400_000).toISOString(),
        status: 'queued',
      });
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
    db.close();
  }, fileId);
  await page.reload();
  await expect(page.getByTestId('m-capture-already-landed')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('m-capture-already-landed')).toContainText(project.name);
  await expect(page.getByTestId('m-capture-shot-queued')).toHaveCount(0);
  // And it is gone from the phone's store, not just hidden.
  const left = await page.evaluate(
    (shotId) =>
      new Promise<number>((res) => {
        const r = indexedDB.open('m6m-held-shots', 1);
        r.onsuccess = () => {
          const g = r.result.transaction('held').objectStore('held').get(shotId);
          g.onsuccess = () => {
            res(g.result ? 1 : 0);
            r.result.close();
          };
        };
      }),
    fileId
  );
  expect(left).toBe(0);
});

test('GHOST CONTROL · a queued row whose photo is NOT on the server is kept', async ({ page }) => {
  // The fail-safe direction: an id the server does not have must stay.
  await page.goto('/m/capture');
  const orphanId = await page.evaluate(async () => {
    const id = crypto.randomUUID();
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('m6m-held-shots', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('held', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise<void>((res, rej) => {
      const t = db.transaction('held', 'readwrite');
      t.objectStore('held').put({
        id,
        blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
        fileName: 'not-on-server.png',
        takenAt: new Date().toISOString(),
        status: 'queued',
      });
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
    db.close();
    return id;
  });
  const { count } = await admin
    .from('files')
    .select('id', { count: 'exact', head: true })
    .eq('id', orphanId);
  expect(count).toBe(0);
  await page.reload();
  await expect(page.getByTestId('m-capture-shot-queued')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByTestId('m-capture-already-landed')).toHaveCount(0);
});

test('SELECT · one of two held photos is sent to a project; exactly that one lands', async ({
  page,
}) => {
  const a = `${RUN}-sel-a.png`;
  const b = `${RUN}-sel-b.png`;
  await holdShots(page, [a, b]);
  // Select the row whose file name is `a`.
  const rowA = page.getByTestId('m-capture-shot-held').filter({ hasText: a });
  await rowA.getByTestId('m-capture-select').check();
  await expect(page.getByTestId('m-capture-selected-count')).toHaveText('1 selected');
  const project = await firstProject(page);
  await page.getByTestId(`m-capture-project-${project.id}`).click();
  await expect(page.getByTestId('m-capture-save')).toHaveText('Upload 1 photo');
  await page.getByTestId('m-capture-save').click();

  await expect(page.getByTestId('m-capture-result')).toHaveText('1 uploaded · 0 failed', {
    timeout: 30_000,
  });
  expect(await landedCount(a)).toBe(1);
  expect(await landedCount(b)).toBe(0);
  // The other one is still held — on screen and not uploaded.
  await expect(page.getByTestId('m-capture-shot-held')).toHaveCount(1);
  await expect(page.getByTestId('m-capture-shot-held')).toContainText(b);
  // And the landed one is on the project it was sent to.
  const { data } = await admin.from('files').select('project_id').eq('file_name', a).single();
  expect((data as { project_id: string }).project_id).toBe(project.id);
});

test('OLD · an 8-day-old photo is NOT swept; the tray asks; Keep keeps it, Delete removes it', async ({
  page,
}) => {
  await page.goto('/m/capture');
  const id = await page.evaluate(async () => {
    const shotId = crypto.randomUUID();
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('m6m-held-shots', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('held', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise<void>((res, rej) => {
      const t = db.transaction('held', 'readwrite');
      t.objectStore('held').put({
        id: shotId,
        blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
        fileName: 'old-site-photo.png',
        takenAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
        status: 'held',
      });
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
    db.close();
    return shotId;
  });
  const countInDb = () =>
    page.evaluate(
      (shotId) =>
        new Promise<number>((res) => {
          const r = indexedDB.open('m6m-held-shots', 1);
          r.onsuccess = () => {
            const g = r.result.transaction('held').objectStore('held').get(shotId);
            g.onsuccess = () => {
              res(g.result ? 1 : 0);
              r.result.close();
            };
          };
        }),
      id
    );

  // Reopen: before S121 the store's open would have deleted it here.
  await page.reload();
  await expect(page.getByTestId('m-capture-old-ask')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('m-capture-old-ask')).toContainText('1 photo(s)');
  await expect(page.getByTestId('m-capture-shot-held')).toHaveCount(1);
  await expect(page.getByTestId('m-capture-age')).toHaveText('Taken 8 day(s) ago');
  expect(await countInDb()).toBe(1);

  await page.getByTestId('m-capture-old-keep').click();
  await expect(page.getByTestId('m-capture-old-ask')).toHaveCount(0);
  await expect(page.getByTestId('m-capture-shot-held')).toHaveCount(1);
  expect(await countInDb()).toBe(1);

  await page.reload();
  await page.getByTestId('m-capture-old-delete').click();
  await expect(page.getByTestId('m-capture-shot-held')).toHaveCount(0);
  await expect.poll(countInDb).toBe(0);
});
