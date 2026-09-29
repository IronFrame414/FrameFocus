import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';

// C-11 [S115] — "There is a delete button on project photos and clicking it
// does nothing." [Josh, 2026-09-28]
//
// Measured: desktop had NO photo delete. The only "Delete" on the path was the
// markup editor's "Delete selected" — a SHAPE delete, disabled-but-styled-live
// with nothing selected. The fix is the feature: "Delete photo" on the desktop
// photo page, through the same `softDeleteFile` /m calls, shown by the same
// `canDeletePhoto` rule /m reads.
//
// Every outcome is COUNTED WITH THE SERVICE ROLE, never inferred from the UI:
// a delete the database silently refused would look identical on screen.

const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const BUCKET = 'project-files';
const RUN = `s115-c11-${Date.now()}`;
// 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

const admin = adminClient();
let projectId: string;
const seeded: { id: string; path: string }[] = [];

async function seedPhoto(name: string): Promise<{ id: string; path: string }> {
  const path = `${COMPANY_A}/${projectId}/${RUN}-${name}.png`;
  const up = await admin.storage.from(BUCKET).upload(path, PNG, { contentType: 'image/png' });
  if (up.error) throw new Error(`seed upload ${name}: ${up.error.message}`);
  const { data, error } = await admin
    .from('files')
    .insert({
      company_id: COMPANY_A,
      project_id: projectId,
      category: 'photos',
      file_name: `${RUN}-${name}.png`,
      file_path: path,
      file_size: PNG.length,
      mime_type: 'image/png',
      tags: ['s115-c11-fixture'],
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed row ${name}: ${error?.message}`);
  const row = { id: data.id as string, path };
  seeded.push(row);
  return row;
}

async function isDeleted(id: string): Promise<boolean | undefined> {
  const r = await admin.from('files').select('is_deleted').eq('id', id).single();
  return r.data?.is_deleted as boolean | undefined;
}

test.beforeAll(async () => {
  // Any live Company A project; ordered, so the pick is stable run to run.
  const { data, error } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`no Company A project: ${error?.message}`);
  projectId = data.id as string;
});

test.afterAll(async () => {
  if (seeded.length === 0) return;
  await admin
    .from('files')
    .delete()
    .in(
      'id',
      seeded.map((s) => s.id)
    );
  await admin.storage.from(BUCKET).remove(seeded.map((s) => s.path));
});

const photoPage = (fileId: string) => `/dashboard/projects/${projectId}/files/${fileId}/markup`;

test.describe('C-11 · deleting a project photo on desktop', () => {
  test.setTimeout(120_000);

  test('an Owner sees "Delete photo"; cancelling keeps the photo, confirming soft-deletes it', async ({
    page,
  }) => {
    const photo = await seedPhoto('owner');
    await signInAs(page, OWNER);
    await page.goto(photoPage(photo.id));

    const del = page.getByTestId('photo-delete');
    await expect(del).toBeVisible();

    // Confirms first — never a one-click destructive action.
    await del.click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-cancel').click();
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
    expect(await isDeleted(photo.id), 'cancel must leave the photo alone').toBe(false);

    await del.click();
    await page.getByTestId('confirm-accept').click();
    await page.waitForURL(new RegExp(`/dashboard/projects/${projectId}/photos$`), {
      timeout: 30_000,
    });

    // WHAT LANDED, counted with the service role: exactly this row, soft-deleted.
    await expect.poll(() => isDeleted(photo.id), { timeout: 30_000 }).toBe(true);
    const { data: row } = await admin
      .from('files')
      .select('deleted_at, file_path')
      .eq('id', photo.id)
      .single();
    expect(row?.deleted_at, 'soft delete stamps deleted_at').not.toBeNull();
    // Soft delete keeps the object (Trash can restore it).
    const listed = await admin.storage
      .from(BUCKET)
      .list(`${COMPANY_A}/${projectId}`, { search: `${RUN}-owner.png` });
    expect(listed.data?.length ?? 0, 'the storage object stays for Trash restore').toBe(1);
  });

  test('a Crew member is not offered "Delete photo" (the shared rule /m reads)', async ({
    page,
  }) => {
    const photo = await seedPhoto('crew');
    await signInAs(page, CREW);
    await page.goto(photoPage(photo.id));
    // The page itself rendered — so "absent" is a decision, not a failed load.
    await expect(page.getByRole('heading', { name: new RegExp(`${RUN}-crew`) })).toBeVisible();
    await expect(page.getByTestId('photo-delete')).toHaveCount(0);
    expect(await isDeleted(photo.id)).toBe(false);
  });

  test('"Delete selected" (a SHAPE delete) now LOOKS disabled when no shape is selected', async ({
    page,
  }) => {
    const photo = await seedPhoto('shape');
    await signInAs(page, OWNER);
    await page.goto(photoPage(photo.id));
    const shapeDelete = page.getByRole('button', { name: 'Delete selected' });
    await expect(shapeDelete).toBeDisabled();
    const look = await shapeDelete.evaluate((el) => {
      const s = getComputedStyle(el);
      return { opacity: s.opacity, cursor: s.cursor };
    });
    expect(look).toEqual({ opacity: '0.45', cursor: 'not-allowed' });
    await expect(shapeDelete).toHaveAttribute('title', /Select a shape/);
  });
});
