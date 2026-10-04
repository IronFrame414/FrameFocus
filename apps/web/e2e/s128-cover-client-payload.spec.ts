import { test, expect } from '@playwright/test';
import { adminClient } from './hub-fixture';
import { signIn, OWNER } from './chat-fixture';

// ============================================================================
// S128 Part F — F-2, PROVEN ON THE BYTES.
// [Josh, 2026-10-03 17:18] "block client from any cover photo … they don't see an
// image as a cover photo."
//
// A client session fetches EVERY portal surface that names a project (phase 1,
// F-2: /portal, and the project's dashboard, files, financials and selections
// pages — all read getPortalProjects). The cover's thumbnail URL and the cover
// field must be absent from every response body. A hidden component would still
// ship them; the bytes are the proof.
//
// CONTROL, so an absence means something: the SAME cover's thumbnail URL IS in
// the staff projects list's bytes.
// ============================================================================

const LINKED = 'josh+qa-client-linked@worthprop.com';
/** The rich portal fixture project (portal-pages.spec.ts) — the linked client's. */
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9';

let coverFileId: string;
let insertedCover = false;

test.beforeAll(async () => {
  const admin = adminClient();
  const { data: proj } = await admin.from('projects').select('company_id').eq('id', PROJECT).single();
  const { data: existing } = await admin
    .from('project_covers')
    .select('file_id')
    .eq('project_id', PROJECT)
    .maybeSingle();
  if (existing?.file_id) {
    coverFileId = existing.file_id;
    return;
  }
  // Make the strongest case: a cover that is ALSO client-visible, so the client may see the image
  // in the gallery and must still never receive it AS a cover.
  const { data: photo } = await admin
    .from('files')
    .select('id')
    .eq('project_id', PROJECT)
    .eq('category', 'photos')
    .like('mime_type', 'image/%')
    .eq('is_deleted', false)
    .order('client_visible', { ascending: false })
    .order('created_at')
    .limit(1)
    .single();
  expect(photo, 'the fixture project has no photo to make a cover of').toBeTruthy();
  coverFileId = photo!.id;
  if (existing) {
    await admin.from('project_covers').update({ file_id: coverFileId }).eq('project_id', PROJECT);
  } else {
    const { error } = await admin
      .from('project_covers')
      .insert({ company_id: proj!.company_id, project_id: PROJECT, file_id: coverFileId });
    expect(error).toBeNull();
    insertedCover = true;
  }
});

test.afterAll(async () => {
  if (insertedCover) await adminClient().from('project_covers').delete().eq('project_id', PROJECT);
});

test('CONTROL · staff: the cover thumbnail IS in the projects list bytes', async ({ page }) => {
  await signIn(page, OWNER);
  const res = await page.request.get('/dashboard/projects');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain(`/api/photos/${coverFileId}/thumb`);
});

test('⚠️ F-2 · client: NO cover in the bytes of any portal page that names the project', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, LINKED, /\/portal/);
  for (const path of [
    '/portal',
    `/portal/${PROJECT}`,
    `/portal/${PROJECT}/files`,
    `/portal/${PROJECT}/financials`,
    `/portal/${PROJECT}/selections`,
  ]) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(200);
    const body = await res.text();
    // The page rendered as THIS client (not a redirect or an error card).
    expect(body, `${path} did not render the portal`).toContain('portal');
    expect(body, `${path} carries the cover thumbnail`).not.toContain(`/api/photos/${coverFileId}/thumb`);
    expect(body, `${path} carries a cover field`).not.toMatch(/"cover"\s*:/);
    expect(body, `${path} names project_covers`).not.toContain('project_covers');
  }
});

// The client's own REST read of project_covers (0 rows, RLS) is test/s128-project-covers.live.ts,
// F-2's total read map.
