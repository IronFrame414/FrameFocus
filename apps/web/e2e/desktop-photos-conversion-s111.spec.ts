import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { adminClient, COMPANY_A } from './hub-fixture';
import { requireTestEnv } from './env';
import { signInAs } from './sign-in-as';
import { deleteProjects } from '../test-support/company-purge';

// S111 hardening, item 1 — the CI tripwire for the conversion regression.
//
// WHAT BROKE. After S110 A reached production, converting a sent or accepted
// estimate that carried a site-visit photo taken before the send RAISED inside
// convert_estimate_to_project ("This site-visit photo is frozen…"), and the
// whole conversion rolled back. 20261770000000 fixed it and reclassified the
// images to 'photos'. The only proof was test/s111-photo-conversion.live.ts,
// which CI never runs — so nothing in CI would notice the regression coming
// back. This spec is that proof in the suite CI DOES run.
//
// THE PATH IS THE REAL ONE: an ACCEPTED estimate (so the capture is frozen —
// asserted, with a control that the freeze fires), converted by the owner
// clicking "Convert to Project" in the browser, then the project's Photos page.
//
// ⚠️ ROW COUNTS. The fixture attaches EXACTLY 2 images and 1 PDF control:
//   capture   image, site_visit_capture, category 'other' — the pre-S111 write
//             path (what production rows look like), captured BEFORE acceptance
//   tabimage  image, category 'photos' — the S111 write path
//   pdf       application/pdf, 'other' — must NOT become a photo
// The Photos query must return EXACTLY those 2 image ids. A pass on zero
// attached images is a failure, so every count is asserted as an exact number,
// never as "at least" or "not empty".

const OWNER = 'josh+test50@worthprop.com';
const BUCKET = 'project-files';
const MARKER = 'S111E2ECONV';
const PNG_8 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2P8z8Dwn4GKgIlqJo0aOGrgqIHDwEAAaSgDBaMLcOgAAAAASUVORK5CYII=';
const PNG = Buffer.from(PNG_8, 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

type Key = 'capture' | 'tabimage' | 'pdf';

const admin = adminClient();
let ownerC: SupabaseClient;
let estimateId = '';
const fileIds: Record<Key, string> = { capture: '', tabimage: '', pdf: '' };
const names: Record<Key, string> = { capture: '', tabimage: '', pdf: '' };

async function ownerClient(): Promise<SupabaseClient> {
  const client = createClient(
    requireTestEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireTestEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error } = await client.auth.signInWithPassword({
    email: OWNER,
    password: process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026',
  });
  if (error) throw new Error(`ownerClient: ${error.message}`);
  return client;
}

// Keyed on the MARKER, not on ids captured this run, so a crashed run is
// swept by the next one. Order matters: the converted estimate is the
// project's source_estimate_id, so it is detached before the project purge
// and deleted after it (projects_source_estimate_id_fkey).
async function sweep() {
  const { data: files } = await admin.from('files').select('id, file_path').like('file_name', `${MARKER}%`);
  const rows = (files ?? []) as { id: string; file_path: string }[];
  if (rows.length) {
    await admin.storage.from(BUCKET).remove(rows.flatMap((r) => [r.file_path, `${r.file_path}.markup.jpg`]));
    await admin.from('files').delete().in('id', rows.map((r) => r.id));
  }
  const { data: ests } = await admin.from('estimates').select('id, project_id').like('name', `${MARKER}%`);
  const estRows = (ests ?? []) as { id: string; project_id: string | null }[];
  const estIds = estRows.map((e) => e.id);
  const projectIds = estRows.map((e) => e.project_id).filter((p): p is string => !!p);
  const { data: named } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  for (const p of (named ?? []) as { id: string }[]) if (!projectIds.includes(p.id)) projectIds.push(p.id);
  if (estIds.length) await admin.from('estimates').update({ project_id: null }).in('id', estIds);
  await deleteProjects(admin, projectIds);
  if (estIds.length) {
    const del = await admin.from('estimates').delete().in('id', estIds);
    if (del.error) throw new Error(`S111 e2e sweep, estimates: ${del.error.message}`);
  }
}

async function seedFile(key: Key, mime: string, bytes: Buffer, category: string, capture: boolean) {
  const id = crypto.randomUUID();
  const name = `${MARKER}-${key}.${mime === 'application/pdf' ? 'pdf' : 'png'}`;
  // The estimate-files route's own path convention: conversion re-points the
  // ROW and never moves the object, so the photo keeps this path for life.
  const path = `${COMPANY_A}/estimates/${estimateId}/${id}-${name}`;
  const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime });
  if (up.error) throw new Error(`seed ${key} object: ${up.error.message}`);
  const ins = await admin.from('files').insert({
    id,
    company_id: COMPANY_A,
    project_id: null,
    estimate_id: estimateId,
    category,
    site_visit_capture: capture,
    file_name: name,
    file_path: path,
    file_size: bytes.length,
    mime_type: mime,
  });
  if (ins.error) throw new Error(`seed ${key} row: ${ins.error.message}`);
  fileIds[key] = id;
  names[key] = name;
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  await sweep();
  ownerC = await ownerClient();

  // Any contact in the company will do; ordered so the pick is stable
  // (CLAUDE.md — a .limit(1) must be ORDERED).
  const { data: c, error: cErr } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  if (cErr) throw new Error(`contact: ${cErr.message}`);

  // A site visit IS an estimate: recorded as the owner, so the RPC's own
  // company/role checks run exactly as in the app.
  const { data: ev, error: evErr } = await ownerC.rpc('create_site_visit', {
    p_title: `${MARKER} kitchen`,
    p_contact_id: (c as { id: string }).id,
  });
  if (evErr) throw new Error(`create_site_visit: ${evErr.message}`);
  estimateId = ev as string;
  // create_site_visit names the estimate from the title; pin the marker on it
  // so the sweep finds it whatever the RPC does with the title.
  await admin.from('estimates').update({ name: `${MARKER} kitchen` }).eq('id', estimateId);

  await seedFile('capture', 'image/png', PNG, 'other', true);
  await seedFile('tabimage', 'image/png', PNG, 'photos', false);
  await seedFile('pdf', 'application/pdf', PDF, 'other', false);

  const promoted = await ownerC.rpc('promote_site_visit', { p_estimate_id: estimateId });
  if (promoted.error) throw new Error(`promote_site_visit: ${promoted.error.message}`);
  const acc = await admin.from('estimates').update({ status: 'accepted' }).eq('id', estimateId);
  if (acc.error) throw new Error(`accept: ${acc.error.message}`);
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await sweep();
});

test('[S111 harden] converting an accepted estimate carries its site-visit photo to Photos', async ({
  page,
}) => {
  test.setTimeout(180_000);

  // ── Fixture checks: the capture really is frozen, or this proves nothing ──
  const { data: sv } = await admin.from('site_visits').select('frozen_at').eq('estimate_id', estimateId).single();
  const frozenAt = (sv as { frozen_at: string | null } | null)?.frozen_at ?? null;
  expect(frozenAt, 'acceptance did not stamp frozen_at — the freeze would not be exercised').not.toBeNull();
  const direct = await admin.from('files').update({ estimate_id: null }).eq('id', fileIds.capture);
  expect(direct.error?.message ?? '', 'CONTROL: the freeze did not fire on the capture').toMatch(/frozen/i);

  const { data: attached } = await admin
    .from('files')
    .select('id, mime_type')
    .eq('estimate_id', estimateId)
    .eq('is_deleted', false);
  const attachedRows = (attached ?? []) as { id: string; mime_type: string }[];
  const attachedImages = attachedRows.filter((r) => r.mime_type.startsWith('image/')).length;
  console.log(`[S111 e2e] attached to the estimate: ${attachedRows.length} files, ${attachedImages} images`);
  expect(attachedRows).toHaveLength(3);
  expect(attachedImages).toBe(2);

  // ── Convert through the real UI ──
  await signInAs(page, OWNER);
  await page.goto(`/dashboard/estimates/${estimateId}`);
  await page.getByRole('button', { name: 'Convert to Project' }).click();
  await page.getByTestId('confirm-accept').click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/[0-9a-f-]{36}/, { timeout: 60_000 });

  const { data: est } = await admin.from('estimates').select('project_id').eq('id', estimateId).single();
  const projectId = (est as { project_id: string | null }).project_id;
  expect(projectId, 'conversion did not record a project on the estimate').toMatch(/^[0-9a-f-]{36}$/);
  await admin.from('projects').update({ name: `${MARKER} kitchen` }).eq('id', projectId!);

  // ── The Photos query, on the OWNER's session: exactly the two images ──
  // The predicate getProjectPhotos() → getFiles({ project_id, category: 'photos' }) runs.
  const { data: photoRows, error: pErr } = await ownerC
    .from('files')
    .select('id')
    .eq('project_id', projectId!)
    .eq('category', 'photos')
    .eq('is_deleted', false);
  expect(pErr, pErr?.message).toBeNull();
  const photoIds = ((photoRows ?? []) as { id: string }[]).map((r) => r.id).sort();
  console.log(`[S111 e2e] Photos query rows: ${photoIds.length} (expected 2)`);
  expect(photoIds).toEqual([fileIds.capture, fileIds.tabimage].sort());

  // ── And the page renders them: count and real bytes behind each tile ──
  await page.goto(`/dashboard/projects/${projectId}/photos`);
  await expect(page.getByText(/^Photos · \d+ total$/)).toHaveText('Photos · 2 total');
  for (const key of ['capture', 'tabimage'] as const) {
    const img = page.locator(`img[alt="${names[key]}"]`);
    await expect(img).toHaveCount(1);
    // A signed URL that does not resolve renders a 0-width broken image.
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 30_000 })
      .toBe(8);
  }
  await expect(page.locator(`img[alt="${names.pdf}"]`), 'the PDF control became a photo').toHaveCount(0);
});
