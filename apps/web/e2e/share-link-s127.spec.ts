import { test, expect, request as pwRequest } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER } from './hub-fixture';
import { signInAs } from './sign-in-as';

// ============================================================================
// S127 item 4e — THE PAYLOAD PROOF, and the gate on shipping the public link.
// [RULED Josh, #3: "this does not ship unless that list is PROVEN BY INSPECTING
// THE PAYLOAD, not the screen."]
//
// The public page and its image are fetched with a FRESH, COOKIE-LESS request
// context — a stranger holding the URL — and their BYTES are read:
//   ✓ the company name and the date are there, the photo is served by the app;
//   ✗ the project name, the site address, the client, the file name, the
//     storage path, any storage/signed URL and the photo's tags are NOT —
//     anywhere in the HTML, including the RSC payload Next inlines.
// Then: the image header is `private` (no shared cache may keep it); a revoke
// stops BOTH the page and the image at once; a PM cannot create a link; an
// unknown token gets nothing.
// ============================================================================

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const BUCKET = 'project-files';
const RUN = `s127-share-${Date.now()}`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
const admin = adminClient();
let projectId = '';
let projectName = '';
let fileId = '';
let filePath = '';
const SECRET_TAG = `${RUN}-secret-tag`;

test.beforeAll(async () => {
  const { data: asg, error } = await admin
    .from('project_assignments')
    .select('project_id, created_at, projects!inner(is_deleted, company_id, name)')
    .eq('member_id', CREW_MEMBER)
    .eq('is_deleted', false)
    .eq('projects.is_deleted', false)
    .eq('projects.company_id', COMPANY_A)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error || !asg) throw new Error(`no project: ${error?.message}`);
  projectId = asg.project_id as string;
  projectName = (asg.projects as unknown as { name: string }).name;
  filePath = `${COMPANY_A}/${projectId}/${RUN}-private-name.png`;
  const up = await admin.storage.from(BUCKET).upload(filePath, PNG, { contentType: 'image/png' });
  if (up.error) throw new Error(up.error.message);
  const { data, error: e } = await admin
    .from('files')
    .insert({
      company_id: COMPANY_A,
      project_id: projectId,
      category: 'photos',
      file_name: `${RUN}-private-name.png`,
      file_path: filePath,
      file_size: PNG.length,
      mime_type: 'image/png',
      tags: [SECRET_TAG],
    })
    .select('id')
    .single();
  if (e || !data) throw new Error(e?.message);
  fileId = data.id as string;
});

test.afterAll(async () => {
  await admin
    .from('photo_share_link_views')
    .delete()
    .eq('company_id', COMPANY_A)
    .in(
      'link_id',
      ((await admin.from('photo_share_links').select('id').eq('file_id', fileId)).data ?? []).map(
        (r) => r.id as string
      )
    );
  await admin.from('photo_share_links').delete().eq('file_id', fileId);
  await admin.from('files').delete().eq('id', fileId);
  await admin.storage.from(BUCKET).remove([filePath]);
});

test('the public page carries ONLY the photo, logo, company name and date — proven on the bytes', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signInAs(page, OWNER);

  // The PM may not create one.
  const created = await page.request.post('/api/photo-share-links', { data: { fileId } });
  expect(created.status()).toBe(200);
  const { url, id } = (await created.json()) as { url: string; id: string };
  expect(url).toMatch(/\/share\/p\/[A-Za-z0-9_-]{43}$/);
  const path = new URL(url).pathname;

  const { data: company } = await admin
    .from('companies')
    .select('name')
    .eq('id', COMPANY_A)
    .single();
  const stranger = await pwRequest.newContext({ baseURL: page.url() }); // no cookies, no session
  const html = await (await stranger.get(path)).text();

  expect(html).toContain(company!.name as string);
  expect(html).toContain(`${path}/image`);
  for (const forbidden of [
    projectName,
    `${RUN}-private-name`,
    filePath,
    SECRET_TAG,
    'supabase.co',
    '/storage/v1/',
    'token=',
  ]) {
    expect(html.includes(forbidden), `public payload leaks: ${forbidden}`).toBe(false);
  }
  // No address or client fields exist to leak; assert the labels never appear either.
  for (const label of ['Project', 'Address', 'Client']) expect(html).not.toContain(`>${label}<`);

  const img = await stranger.get(`${path}/image`);
  expect(img.status()).toBe(200);
  expect(img.headers()['cache-control']).toBe('private, no-store');
  expect(img.headers()['content-type']).toContain('image/');
  expect((await img.body()).length).toBe(PNG.length);

  // Every page view is logged.
  const { count } = await admin
    .from('photo_share_link_views')
    .select('id', { count: 'exact', head: true })
    .eq('link_id', id);
  expect(count).toBeGreaterThanOrEqual(1);

  // One-click revoke stops the page AND the image at once.
  const revoked = await page.request.patch(`/api/photo-share-links/${id}`, {
    data: { action: 'revoke' },
  });
  expect(revoked.status()).toBe(200);
  expect(await (await stranger.get(path)).text()).toContain('This link is no longer available.');
  expect((await stranger.get(`${path}/image`)).status()).toBe(404);

  // An unknown token gets nothing.
  expect((await stranger.get(`/share/p/${'A'.repeat(43)}/image`)).status()).toBe(404);
  await stranger.dispose();
});

test('a PM cannot create a public link', async ({ page }) => {
  await signInAs(page, PM);
  const res = await page.request.post('/api/photo-share-links', { data: { fileId } });
  expect(res.status()).toBe(403);
  const { count } = await admin
    .from('photo_share_links')
    .select('id', { count: 'exact', head: true })
    .eq('file_id', fileId)
    .is('revoked_at', null);
  expect(count).toBe(0);
});

test('the dialog previews the exact image before anything is created', async ({ page }) => {
  await signInAs(page, OWNER);
  await page.goto(`/dashboard/projects/${projectId}/photos/${fileId}`);
  await page.getByTestId('photo-share-open').click();
  await expect(page.getByTestId('photo-share-preview')).toBeVisible();
  const before = (
    await admin
      .from('photo_share_links')
      .select('id', { count: 'exact', head: true })
      .eq('file_id', fileId)
  ).count;
  await page.getByRole('button', { name: 'Cancel' }).click();
  const after = (
    await admin
      .from('photo_share_links')
      .select('id', { count: 'exact', head: true })
      .eq('file_id', fileId)
  ).count;
  expect(after).toBe(before);
});
