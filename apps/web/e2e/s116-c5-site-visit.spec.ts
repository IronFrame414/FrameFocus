import { test, expect } from '@playwright/test';
import { isThumbnailPath } from '@framefocus/shared/utils/markup';
import { adminClient, COMPANY_A } from './hub-fixture';
import { OWNER, signIn } from './chat-fixture';
import { withThumbnails } from './storage-cleanup';

// ============================================================================
// S116 C-5 [#2-s180u step 1 proof] — THE SITE-VISIT RECORD's multi-photo input
// runs through the shared upload queue (runUploadBatch + UploadBatchList).
//
// Josh's ruling: ONE PROOF SPEC PER SURFACE. Every outcome is COUNTED WITH THE
// SERVICE ROLE, never inferred from the UI:
//
//   1  N = 3 files picked → one forced failure, NAMED in the batch list, while
//      the other N−1 land: exactly N−1 `files` rows and N−1 objects
//   2  Retry → exactly N rows (no duplicate) and N objects; the retried file
//      lands under the SAME client-minted id it was first sent with
//   3  a short wait → still exactly N (a held/replayed copy must not add N+1)
//   4  cleanup → zero rows, zero objects, zero fixture estimates
//
// ⚠️ RUN ON THE DESKTOP ROUTE (/dashboard/site-visits/[id]), as the OWNER. The
// offline queue (`OfflineSyncProvider`) is mounted only by the /m shell, so on
// desktop `useOfflineSync()` is null and a failed photo is NOT held — step 3
// then guards against a regression that starts holding (or re-sending) it
// here, rather than against a replay that is expected to happen.
//
// ⚠️ A FIXTURE ESTIMATE OF ITS OWN, so its storage folder
// (`{company}/estimates/{estimateId}/`) holds nothing but this run's objects
// and "N objects" is a count of a folder, not a filter over a shared one.
// Created the way `desktop-site-visits-s110.spec.ts` creates its visit.
// ============================================================================

const MARKER = 'S116C5-SV';
const RUN = `${MARKER}-${Date.now()}`;
const BUCKET = 'project-files';
// 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
const NAMES = [`${RUN}-a.png`, `${RUN}-b.png`, `${RUN}-fail.png`];
const FAIL_NAME = `${RUN}-fail.png`;
const N = NAMES.length;

const admin = adminClient();
let visitId = '';
let ownerUserId = '';

type FileRow = {
  id: string;
  company_id: string;
  project_id: string | null;
  estimate_id: string | null;
  category: string;
  site_visit_capture: boolean;
  file_name: string;
  file_path: string;
  created_by: string | null;
  is_deleted: boolean;
};

async function fileRows(estimateId: string): Promise<FileRow[]> {
  const { data, error } = await admin
    .from('files')
    .select(
      'id, company_id, project_id, estimate_id, category, site_visit_capture, file_name, file_path, created_by, is_deleted'
    )
    .eq('estimate_id', estimateId)
    .order('file_name', { ascending: true });
  if (error) throw new Error(`files count: ${error.message}`);
  return (data ?? []) as FileRow[];
}

/** Every object in the estimate's folder — originals AND thumbnails. */
async function folderObjects(estimateId: string): Promise<string[]> {
  const dir = `${COMPANY_A}/estimates/${estimateId}`;
  const { data, error } = await admin.storage
    .from(BUCKET)
    .list(dir, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw new Error(`storage list: ${error.message}`);
  return ((data ?? []) as Array<{ name: string }>).map((o) => `${dir}/${o.name}`);
}

const originals = (paths: string[]) => paths.filter((p) => !isThumbnailPath(p));

/** Remove every fixture visit (this run's and any a crashed run left). */
async function sweep(): Promise<void> {
  const { data } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = ((data ?? []) as Array<{ id: string }>).map((e) => e.id);
  for (const id of ids) {
    const rows = await fileRows(id);
    const objects = await folderObjects(id);
    const paths = Array.from(
      new Set([...withThumbnails(rows.map((r) => r.file_path)), ...objects])
    );
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
  }
  if (ids.length) {
    await admin.from('files').delete().in('estimate_id', ids);
    await admin.from('site_visits').delete().in('estimate_id', ids);
    await admin.from('estimates').delete().in('id', ids);
  }
}

test.beforeAll(async () => {
  await sweep();
  const { data: owner, error: oErr } = await admin
    .from('profiles')
    .select('user_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  if (oErr || !owner) throw new Error(`owner profile: ${oErr?.message}`);
  ownerUserId = (owner as { user_id: string }).user_id;
  // Any contact will do; nothing depends on which. Ordered.
  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  if (cErr || !contact) throw new Error(`contact: ${cErr?.message}`);
  const contactId = (contact as { id: string }).id;
  const { data: est, error } = await admin
    .from('estimates')
    .insert({
      company_id: COMPANY_A,
      contact_id: contactId,
      name: `${RUN} visit`,
      status: 'site_visit',
      estimate_number: null,
      created_by: ownerUserId,
      updated_by: ownerUserId,
      created_by_role: 'owner',
    })
    .select('id')
    .single();
  if (error || !est) throw new Error(`estimate: ${error?.message}`);
  visitId = (est as { id: string }).id;
  const { error: svErr } = await admin.from('site_visits').insert({
    company_id: COMPANY_A,
    estimate_id: visitId,
    title: `${RUN} visit`,
    contact_id: contactId,
    created_by: ownerUserId,
    updated_by: ownerUserId,
  });
  if (svErr) throw new Error(`site_visits: ${svErr.message}`);
});

test.afterAll(async () => {
  const id = visitId;
  await sweep();
  // ZERO LEFTOVERS, counted with the service role — not assumed from the sweep.
  const { count: estLeft } = await admin
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER}%`);
  expect(estLeft, 'fixture estimates left behind').toBe(0);
  if (id) {
    expect((await fileRows(id)).length, 'files rows left behind').toBe(0);
    expect((await folderObjects(id)).length, 'storage objects left behind').toBe(0);
  }
});

test('S116 C-5 · site-visit record: N photos, one named failure, Retry lands exactly N', async ({
  page,
}) => {
  test.setTimeout(180_000);

  // ⚠️ THE FORCED FAILURE. The POST carrying FAIL_NAME is refused ONCE, before
  // it reaches the server (so nothing is stored for it). Its multipart body
  // also carries the client-minted `id`, captured so step 2 can prove the
  // Retry re-sent the SAME id rather than minting a new one.
  let armed = true;
  let failedId: string | null = null;
  let refused = 0;
  await page.route('**/api/estimates/*/files', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    const body = (req.postDataBuffer() ?? Buffer.alloc(0)).toString('latin1');
    if (armed && body.includes(FAIL_NAME)) {
      armed = false;
      refused += 1;
      const m = body.match(/name="id"\r\n\r\n([0-9a-f-]{36})/i);
      failedId = m ? m[1] : null;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'S116 C-5 forced failure' }),
      });
    }
    return route.continue();
  });

  await signIn(page, OWNER);
  await page.goto(`/dashboard/site-visits/${visitId}`);
  await expect(page.getByTestId('site-visit-record')).toBeVisible({ timeout: 30_000 });

  await page
    .getByTestId('sv-photo-input')
    .setInputFiles(NAMES.map((name) => ({ name, mimeType: 'image/png', buffer: PNG })));

  // ── 1 · the failure is NAMED while the rest landed ─────────────────────────
  const batch = page.getByTestId('sv-photo-batch');
  const rows = page.getByTestId('sv-photo-batch-row');
  await expect(page.getByTestId('sv-photo-batch-retry')).toBeVisible({ timeout: 60_000 });
  await expect(rows).toHaveCount(N);
  await expect(batch.locator('[data-testid="sv-photo-batch-row"][data-status="done"]')).toHaveCount(
    N - 1
  );
  const failedRow = batch.locator('[data-testid="sv-photo-batch-row"][data-status="failed"]');
  await expect(failedRow).toHaveCount(1);
  await expect(failedRow).toContainText(FAIL_NAME);
  await expect(page.getByTestId('sv-photo-batch-error')).toContainText(FAIL_NAME);
  await expect(page.getByTestId('sv-photo-batch-count')).toHaveText(`${N - 1} of ${N} uploaded`);
  expect(refused, 'the forced failure never fired — this run proves nothing').toBe(1);
  expect(failedId, 'the refused POST carried no client id').not.toBeNull();

  const before = await fileRows(visitId);
  expect(before.length, 'rows before Retry (N−1)').toBe(N - 1);
  expect(before.map((r) => r.file_name).sort()).toEqual(
    NAMES.filter((n) => n !== FAIL_NAME).sort()
  );
  expect(
    before.some((r) => r.id === failedId),
    'the refused file has a row'
  ).toBe(false);
  expect(originals(await folderObjects(visitId)).length, 'objects before Retry (N−1)').toBe(N - 1);

  // ── 2 · Retry → exactly N, the retried file under its ORIGINAL id ─────────
  await page.getByTestId('sv-photo-batch-retry').click();
  // A clean batch is cleared from the screen (site-visit-record.tsx retryPhotos).
  await expect(batch).toHaveCount(0, { timeout: 60_000 });
  expect(refused, 'the failure fired more than once').toBe(1);

  const after = await fileRows(visitId);
  expect(after.length, 'rows after Retry (exactly N — no duplicate)').toBe(N);
  expect(after.map((r) => r.file_name).sort()).toEqual([...NAMES].sort());
  expect(new Set(after.map((r) => r.file_name)).size, 'a file name landed twice').toBe(N);
  const retried = after.find((r) => r.file_name === FAIL_NAME);
  expect(retried?.id, 'Retry minted a new id instead of re-sending the first one').toBe(failedId);
  for (const r of after) {
    expect(r.company_id, `${r.file_name} company`).toBe(COMPANY_A);
    expect(r.estimate_id, `${r.file_name} estimate`).toBe(visitId);
    expect(r.project_id, `${r.file_name} project (an estimate file has none)`).toBeNull();
    expect(r.category, `${r.file_name} category`).toBe('photos');
    expect(r.site_visit_capture, `${r.file_name} capture marker`).toBe(true);
    expect(r.created_by, `${r.file_name} created_by`).toBe(ownerUserId);
    expect(r.is_deleted, `${r.file_name} is_deleted`).toBe(false);
    expect(r.file_path.startsWith(`${COMPANY_A}/estimates/${visitId}/${r.id}-`)).toBe(true);
  }
  const objs = originals(await folderObjects(visitId));
  expect(objs.length, 'objects after Retry (exactly N)').toBe(N);
  expect([...objs].sort()).toEqual(after.map((r) => r.file_path).sort());

  // ── 3 · a short wait: nothing held or replayed adds an N+1th ──────────────
  await page.waitForTimeout(5_000);
  expect((await fileRows(visitId)).length, 'rows after the wait (still N)').toBe(N);
  expect(originals(await folderObjects(visitId)).length, 'objects after the wait (still N)').toBe(
    N
  );

  // And the record renders all N as photos (the list the page itself reads).
  await expect(page.getByTestId('sv-photo')).toHaveCount(N, { timeout: 30_000 });
});
