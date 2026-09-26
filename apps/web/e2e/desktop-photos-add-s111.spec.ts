import { test, expect } from '@playwright/test';
import { adminClient } from './hub-fixture';
import { signInAs } from './sign-in-as';
import { withThumbnails } from './storage-cleanup';

// S111 Part Two, RULED Q16 — the desktop Photos page gains "Add photos", which
// opens the LIBRARY (no `capture`) and writes category 'photos' through the
// shared uploadFile(). Before S111 the page had no upload control at all.
//
// Asserted against the DATABASE, not only the page: the new row exists, is
// category 'photos' on this project, and the gallery count moved by exactly one.

const OWNER = 'josh+test50@worthprop.com';
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
const BUCKET = 'project-files';
const PNG_8 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2P8z8Dwn4GKgIlqJo0aOGrgqIHDwEAAaSgDBaMLcOgAAAAASUVORK5CYII=';

const admin = adminClient();
const NAME = `s111-add-${Date.now()}.png`;

test.afterAll(async () => {
  const { data } = await admin.from('files').select('id, file_path').eq('file_name', NAME);
  const rows = (data ?? []) as { id: string; file_path: string }[];
  if (rows.length) {
    await admin.storage.from(BUCKET).remove(withThumbnails(rows.map((r) => r.file_path)));
    await admin.from('files').delete().in('id', rows.map((r) => r.id));
  }
});

test('[S111 Q16] desktop Photos → Add photos opens the library and lands a photo', async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, OWNER);
  await page.goto(`/dashboard/projects/${PROJECT}/photos`);

  const counter = page.getByText(/^Photos · \d+ total$/);
  const before = Number(((await counter.textContent()) ?? '').match(/\d+/)?.[0]);
  expect(Number.isFinite(before)).toBe(true);

  const input = page.getByTestId('photos-add-input');
  await expect(input).toHaveAttribute('accept', 'image/*');
  await expect(input).not.toHaveAttribute('capture', /./);
  await expect(page.getByTestId('photos-add')).toBeVisible();

  await input.setInputFiles({ name: NAME, mimeType: 'image/png', buffer: Buffer.from(PNG_8, 'base64') });
  await expect(counter).toHaveText(`Photos · ${before + 1} total`, { timeout: 30_000 });

  const { data } = await admin
    .from('files')
    .select('category, project_id, mime_type, is_deleted')
    .eq('file_name', NAME);
  const rows = (data ?? []) as { category: string; project_id: string; mime_type: string; is_deleted: boolean }[];
  // Exactly one row — a zero here would be a pass on nothing.
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ category: 'photos', project_id: PROJECT, mime_type: 'image/png', is_deleted: false });
});
