import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER, OTHER_MEMBER } from './hub-fixture';
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
// Q11 [Josh, S116]: Owner/Admin/PM/PE. OTHER_MEMBER is this PM's member row.
const PM = 'josh+pm@worthprop.com';
const PE = 'josh+qa-pe@worthprop.com';
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
let peAssignmentId = '';

async function seedPhoto(
  name: string,
  where?: { companyId: string; projectId: string },
  // [S122 0-B-5] 'other' puts an image on the FILES tab (photos left it at
  // 831879b4), so the Files entry link can be clicked for real.
  category: 'photos' | 'other' = 'photos'
): Promise<{ id: string; path: string }> {
  const company = where?.companyId ?? COMPANY_A;
  const project = where?.projectId ?? projectId;
  const path = `${company}/${project}/${RUN}-${name}.png`;
  const up = await admin.storage.from(BUCKET).upload(path, PNG, { contentType: 'image/png' });
  if (up.error) throw new Error(`seed upload ${name}: ${up.error.message}`);
  const { data, error } = await admin
    .from('files')
    .insert({
      company_id: company,
      project_id: project,
      category,
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
  // A live Company A project the CREW identity is assigned to, so its page
  // renders for crew (a crew member cannot open an unassigned project, and an
  // unrendered page would make "no Delete button" vacuous). Ordered, so stable.
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
  if (peAssignmentId) await admin.from('project_assignments').delete().eq('id', peAssignmentId);
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

// [S122 0-B-5] The markup screen now returns to where the user came from, by
// a `?from=` token (lib/markup/return-to.ts). These C-11 tests open it the way
// the Photos grid does, so "lands on the Photos grid" keeps its meaning.
// SUPERSEDED: `/dashboard/projects/${project}/files/${fileId}/markup` with no
// token — delete then always went to Photos, whatever the user came from.
const photoPage = (fileId: string, project = projectId, from: string = 'photos') =>
  `/dashboard/projects/${project}/files/${fileId}/markup?from=${from}`;

// Confirm, land on the Photos grid, then COUNT with the service role.
async function confirmDeleteAndCount(page: Page, id: string, project: string) {
  const del = page.getByTestId('photo-delete');
  await expect(del).toBeVisible();
  await del.click();
  await page.getByTestId('confirm-accept').click();
  await page.waitForURL(new RegExp(`/dashboard/projects/${project}/photos$`), {
    timeout: 30_000,
  });
  await expect.poll(() => isDeleted(id), { timeout: 30_000 }).toBe(true);
}

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

  test('a Project Manager on its assigned project is offered "Delete photo", and it lands', async ({
    page,
  }) => {
    // Q11 [Josh, S116] widened the rule to PM; files_update_non_client admits a
    // PM on a project it can view (assigned). Ordered, so stable.
    const { data: asg, error } = await admin
      .from('project_assignments')
      .select('project_id, created_at, projects!inner(is_deleted, company_id)')
      .eq('member_id', OTHER_MEMBER)
      .eq('is_deleted', false)
      .eq('projects.is_deleted', false)
      .eq('projects.company_id', COMPANY_A)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    if (error || !asg)
      throw new Error(`no Company A project assigned to the PM: ${error?.message}`);
    const pmProject = asg.project_id as string;
    const photo = await seedPhoto('pm', { companyId: COMPANY_A, projectId: pmProject });
    await signInAs(page, PM);
    await page.goto(photoPage(photo.id, pmProject));
    await confirmDeleteAndCount(page, photo.id, pmProject);
  });

  test('a Project Executive on its assigned project is offered "Delete photo", and it lands', async ({
    page,
  }) => {
    // Q11 [Josh, S116] + R1: the PE gets what the PM has on its projects;
    // files_update_project_executive admits pe_on_project. The PE holds no
    // standing assignment on rebuild-test, so this assigns it to one project
    // (ordered) for its duration and removes exactly that row after.
    const { data: prof } = await admin
      .from('profiles')
      .select('id, company_id')
      .eq('email', PE)
      .single();
    const { data: member } = await admin
      .from('company_members')
      .select('id')
      .eq('profile_id', prof!.id)
      .single();
    const { data: proj } = await admin
      .from('projects')
      .select('id')
      .eq('company_id', prof!.company_id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    if (!proj) throw new Error('no live project in the PE company');
    const peProject = proj.id as string;
    const { data: asg, error } = await admin
      .from('project_assignments')
      .insert({
        company_id: prof!.company_id,
        project_id: peProject,
        member_id: member!.id,
        role_on_project: 'project_executive',
      })
      .select('id')
      .single();
    if (error || !asg) throw new Error(`assign PE: ${error?.message}`);
    peAssignmentId = asg.id as string;

    const photo = await seedPhoto('pe', {
      companyId: prof!.company_id as string,
      projectId: peProject,
    });
    await signInAs(page, PE);
    await page.goto(photoPage(photo.id, peProject));
    await confirmDeleteAndCount(page, photo.id, peProject);
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

// ── S122 0-B-5 — "Go back to where you came from." [Josh, 2026-09-30] ────────
// Entered through the REAL links on each tab (so the token is proven to be on
// the link, not just accepted by the page), then the back link and delete are
// read off the rendered page. A heading check precedes every "absent"/href
// assertion so an unrendered page cannot pass.
test.describe('S122 0-B-5 · the markup screen returns to where the user came from', () => {
  test.setTimeout(120_000);

  test('from the Photos grid: back link says Photos and goes to Photos', async ({ page }) => {
    const photo = await seedPhoto('from-photos');
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/projects/${projectId}/photos`);
    await page.locator(`a[href*="/files/${photo.id}/markup"]`).first().click();
    await page.waitForURL(new RegExp(`/files/${photo.id}/markup\\?from=photos$`), {
      timeout: 30_000,
    });
    await expect(
      page.getByRole('heading', { name: new RegExp(`${RUN}-from-photos`) })
    ).toBeVisible();
    const back = page.getByTestId('markup-back');
    await expect(back).toHaveText('← Back to photos');
    await expect(back).toHaveAttribute('href', `/dashboard/projects/${projectId}/photos`);
    await back.click();
    await page.waitForURL(new RegExp(`/dashboard/projects/${projectId}/photos$`), {
      timeout: 30_000,
    });
  });

  test('from the Files tab: back link says Files and goes to Files; delete lands on Files', async ({
    page,
  }) => {
    const img = await seedPhoto('from-files', undefined, 'other');
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/projects/${projectId}/files`);
    await page.locator(`a[href*="/files/${img.id}/markup"]`).first().click();
    await page.waitForURL(new RegExp(`/files/${img.id}/markup\\?from=files$`), { timeout: 30_000 });
    await expect(
      page.getByRole('heading', { name: new RegExp(`${RUN}-from-files`) })
    ).toBeVisible();
    const back = page.getByTestId('markup-back');
    await expect(back).toHaveText('← Back to files');
    await expect(back).toHaveAttribute('href', `/dashboard/projects/${projectId}/files`);

    // Delete from here returns to Files too — counted with the service role.
    await page.getByTestId('photo-delete').click();
    await page.getByTestId('confirm-accept').click();
    await page.waitForURL(new RegExp(`/dashboard/projects/${projectId}/files$`), {
      timeout: 30_000,
    });
    await expect.poll(() => isDeleted(img.id), { timeout: 30_000 }).toBe(true);
  });

  test("a hostile or unknown token falls back to this project's Files — never elsewhere", async ({
    page,
  }) => {
    const photo = await seedPhoto('from-junk');
    await signInAs(page, OWNER);
    for (const junk of [
      'https%3A%2F%2Fevil.example',
      '%2F%2Fevil.example',
      '%2Fdashboard',
      'Photos',
    ]) {
      await page.goto(photoPage(photo.id, projectId, junk));
      await expect(
        page.getByRole('heading', { name: new RegExp(`${RUN}-from-junk`) })
      ).toBeVisible();
      await expect(page.getByTestId('markup-back')).toHaveAttribute(
        'href',
        `/dashboard/projects/${projectId}/files`
      );
    }
  });
});
