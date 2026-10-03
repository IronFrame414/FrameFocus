import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S127 item 4a — the photo trash, desktop and /m. [A-1a-i, RULED: the trash
// must render — and its restore be PROVEN — before bulk delete ships.]
//
// Each test seeds a REAL object plus a soft-deleted `files` row, opens the
// trash, restores, and counts the outcome with the SERVICE ROLE: a restore the
// database refused would look identical on screen. A role that may not restore
// (crew) is sent away from the page and offered no link.

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const BUCKET = 'project-files';
const RUN = `s127-trash-${Date.now()}`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

const admin = adminClient();
let projectId = '';
const seeded: { id: string; path: string }[] = [];

async function seedTrashed(name: string): Promise<string> {
  const path = `${COMPANY_A}/${projectId}/${RUN}-${name}.png`;
  const up = await admin.storage.from(BUCKET).upload(path, PNG, { contentType: 'image/png' });
  if (up.error) throw new Error(`upload ${name}: ${up.error.message}`);
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
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`row ${name}: ${error?.message}`);
  seeded.push({ id: data.id as string, path });
  return data.id as string;
}

async function isDeleted(id: string) {
  const { data } = await admin.from('files').select('is_deleted').eq('id', id).single();
  return data?.is_deleted as boolean | undefined;
}

test.beforeAll(async () => {
  const { data: asg, error } = await admin
    .from('project_assignments')
    .select('project_id, created_at, projects!inner(is_deleted, company_id)')
    .eq('member_id', CREW_MEMBER)
    .eq('is_deleted', false)
    .eq('projects.is_deleted', false)
    .eq('projects.company_id', COMPANY_A)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error || !asg) throw new Error(`no Company A project assigned to crew: ${error?.message}`);
  projectId = asg.project_id as string;
});

test.afterAll(async () => {
  if (!seeded.length) return;
  await admin
    .from('files')
    .delete()
    .in(
      'id',
      seeded.map((s) => s.id)
    );
  await admin.storage.from(BUCKET).remove(seeded.map((s) => s.path));
});

test('desktop: Photos tab → Trash lists the deleted photo; Restore brings it back (counted)', async ({
  page,
}) => {
  const id = await seedTrashed('desk');
  await signInAs(page, OWNER);
  await page.goto(`/dashboard/projects/${projectId}/photos`);
  await page.getByTestId('photos-trash-link').click();
  await expect(page).toHaveURL(new RegExp(`/photos/trash$`));
  const item = page.locator(`[data-testid="photos-trash-item"][data-file-id="${id}"]`);
  await expect(item).toBeVisible();
  await item.getByTestId('photos-trash-restore').click();
  await expect(item).toHaveCount(0, { timeout: 30_000 });
  expect(await isDeleted(id)).toBe(false);
});

test('/m: Photos → Trash lists the deleted photo; Restore brings it back (counted)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 });
  const id = await seedTrashed('mobile');
  await signInAs(page, PM);
  await page.goto(`/m/p/${projectId}/photos`);
  await page.getByTestId('m-photos-trash-link').click();
  await expect(page).toHaveURL(new RegExp(`/m/p/${projectId}/photos/trash$`));
  const item = page.locator(`[data-testid="m-photos-trash-item"][data-file-id="${id}"]`);
  await expect(item).toBeVisible();
  await item.getByTestId('m-photos-trash-restore').click();
  await expect(item).toHaveCount(0, { timeout: 30_000 });
  expect(await isDeleted(id)).toBe(false);
});

test('crew: no Trash link, and the page sends them back to the gallery', async ({ page }) => {
  await signInAs(page, CREW);
  await page.goto(`/dashboard/projects/${projectId}/photos`);
  await expect(page.getByText('Photos ·')).toBeVisible();
  await expect(page.getByTestId('photos-trash-link')).toHaveCount(0);
  await page.goto(`/dashboard/projects/${projectId}/photos/trash`);
  await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${projectId}/photos$`));
});
