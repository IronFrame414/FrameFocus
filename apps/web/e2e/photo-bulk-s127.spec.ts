import { test, expect, type Page } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S127 item 4d (A-1) — multi-select: "Show to client" and "Move to Trash" on a
// SELECTION. [RULED A-1a: Owner/Admin only, SOFT, recoverable; gated on the
// trash (4a) being merged and its restore proven — it was, before this.]
//
// Every outcome is counted with the SERVICE ROLE, and every action is checked
// against a photo OUTSIDE the selection that must not change. The deleted pair
// is then restored from the Trash, so the round trip the ruling rests on is
// driven end to end. A PM — who keeps one-photo delete — is offered neither
// bulk action on either surface.

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const BUCKET = 'project-files';
const RUN = `s127-bulk-${Date.now()}`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

const admin = adminClient();
let projectId = '';
const seeded: { id: string; path: string }[] = [];

async function seed(name: string): Promise<string> {
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
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`row ${name}: ${error?.message}`);
  seeded.push({ id: data.id as string, path });
  return data.id as string;
}

async function rows(ids: string[]) {
  const { data } = await admin.from('files').select('id, is_deleted, client_visible').in('id', ids);
  return new Map((data ?? []).map((r) => [r.id as string, r]));
}

const deskTile = (page: Page, id: string) =>
  page.locator(`[data-testid="desktop-photo-select"][data-photo-id="${id}"]`);

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

test('desktop Owner: show two to the client, trash two, restore them — the third never changes', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const a = await seed('a');
  const b = await seed('b');
  const c = await seed('c');
  await signInAs(page, OWNER);
  await page.goto(`/dashboard/projects/${projectId}/photos`);

  // SHOW TO CLIENT — the confirmation says who will NOT see them.
  await page.getByTestId('desktop-select-mode').click();
  await deskTile(page, a).click();
  await deskTile(page, b).click();
  await expect(page.getByTestId('desktop-selection-count')).toHaveText('2 selected');
  await page.getByTestId('desktop-bulk-client').click();
  const clientConfirm = page.getByTestId('desktop-bulk-client-confirm');
  await expect(clientConfirm).toContainText('documents-only client sees nothing');
  await clientConfirm.getByTestId('desktop-bulk-confirm-yes').click();
  await expect
    .poll(
      async () => {
        const r = await rows([a, b, c]);
        return [a, b, c].map((id) => r.get(id)?.client_visible).join(',');
      },
      { timeout: 30_000 }
    )
    .toBe('true,true,false');

  // MOVE TO TRASH — confirms, says where they go; soft, counted.
  await page.getByTestId('desktop-select-mode').click();
  await deskTile(page, a).click();
  await deskTile(page, b).click();
  await page.getByTestId('desktop-bulk-trash').click();
  const trashConfirm = page.getByTestId('desktop-bulk-trash-confirm');
  await expect(trashConfirm).toContainText('Photos → Trash');
  // Cancel first: nothing changes.
  await trashConfirm.getByTestId('desktop-bulk-confirm-no').click();
  expect([...(await rows([a, b])).values()].every((r) => r.is_deleted === false)).toBe(true);
  await page.getByTestId('desktop-bulk-trash').click();
  await page
    .getByTestId('desktop-bulk-trash-confirm')
    .getByTestId('desktop-bulk-confirm-yes')
    .click();
  await expect
    .poll(
      async () => {
        const r = await rows([a, b, c]);
        return [a, b, c].map((id) => r.get(id)?.is_deleted).join(',');
      },
      { timeout: 30_000 }
    )
    .toBe('true,true,false');

  // ...and they come back from the Trash (4a), which is what makes this safe.
  await page.goto(`/dashboard/projects/${projectId}/photos/trash`);
  for (const id of [a, b]) {
    const item = page.locator(`[data-testid="photos-trash-item"][data-file-id="${id}"]`);
    await expect(item).toBeVisible();
    await item.getByTestId('photos-trash-restore').click();
    await expect(item).toHaveCount(0, { timeout: 30_000 });
  }
  const after = await rows([a, b]);
  expect([...after.values()].map((r) => r.is_deleted)).toEqual([false, false]);
});

test('desktop PM: no Select, so neither bulk action is offered', async ({ page }) => {
  await seed('pm-desk');
  await signInAs(page, PM);
  await page.goto(`/dashboard/projects/${projectId}/photos`);
  await expect(page.getByText('Photos ·')).toBeVisible();
  await expect(page.getByTestId('desktop-select-mode')).toHaveCount(0);
  await expect(page.getByTestId('desktop-bulk-trash')).toHaveCount(0);
});

test('/m PM: Select still shares, but offers no bulk delete and no "show to client"', async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await seed('pm-m');
  await signInAs(page, PM);
  await page.goto(`/m/p/${projectId}/photos`);
  await page.getByTestId('m-select-mode').click();
  await expect(page.getByTestId('m-selection-bar')).toBeVisible();
  await expect(page.getByTestId('m-bulk-share')).toHaveCount(1);
  await expect(page.getByTestId('m-bulk-delete')).toHaveCount(0);
  await expect(page.getByTestId('m-bulk-client')).toHaveCount(0);
});

test('/m Owner: "show to client" acts on the selected set, counted', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  const a = await seed('m-a');
  const c = await seed('m-c');
  await signInAs(page, OWNER);
  await page.goto(`/m/p/${projectId}/photos`);
  await page.getByTestId('m-select-mode').click();
  await page.locator(`[data-testid="m-photo-tile"][data-photo-id="${a}"]`).click();
  await page.getByTestId('m-bulk-client').click();
  await expect(page.getByTestId('m-bulk-client-confirm')).toBeVisible();
  await page.getByTestId('m-bulk-client-confirm-yes').click();
  await expect
    .poll(
      async () => {
        const r = await rows([a, c]);
        return `${r.get(a)?.client_visible},${r.get(c)?.client_visible}`;
      },
      { timeout: 30_000 }
    )
    .toBe('true,false');
});
