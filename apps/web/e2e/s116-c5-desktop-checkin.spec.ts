import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { isThumbnailPath } from '@framefocus/shared/utils/markup';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';
import { withThumbnails } from './storage-cleanup';

// S116 C-5 (#2-s180u step 1 proof) — DESKTOP DELIVERY CHECK-IN.
//
// Ruling [Josh]: ONE PROOF PER SURFACE. `check-in-form.tsx` moved onto the
// shared queue (`runUploadBatch` via `useUploadBatches`) in 72a55123. This
// proves, on the per-LINE photo input of an ORDERLESS check-in:
//
//   1. N = 3 picked → every one attempted; the ONE forced failure is named in
//      the batch list while the other two LANDED (N−1 rows, N−1 objects).
//   2. Retry → exactly N rows and N objects. No duplicate: the retry re-runs
//      only the failed file, and each file name has exactly one row.
//   3. Record delivery → the check-in route binds exactly those N rows to the
//      created line (`files.delivery_item_id`); the 2 whole-delivery photos
//      bind via `files.delivery_id`.
//   4. Cleanup to zero, asserted with a final service-role count.
//
// EVERY COUNT IS THE SERVICE ROLE'S, never the UI's: a row or object the
// database silently refused would look identical on screen. Storage objects
// are counted by LISTING the project folder, independently of the `files`
// rows, so an orphan blob would show up as a surplus.
//
// The failure is forced at the browser's Storage UPLOAD (POST
// /storage/v1/object/project-files/…), so `uploadFile` fails before its
// `files` INSERT — the failed file leaves no row and no object.

const OWNER = 'josh+test50@worthprop.com';
const BUCKET = 'project-files';
// Lowercase, hyphenated and free of "fail": the delivery PDF's file name is a
// slug of the vendor (lowercased, non-alphanumerics → '-'), so RUN survives
// into it and the final sweep catches the PDF too.
const RUN = `s116-c5ci-${Date.now()}`;
const VENDOR = `C5 vendor ${RUN}`;
const LINE_DESC = `C5 line ${RUN}`;
const LINE_NAMES = [`${RUN}-line-a.png`, `${RUN}-line-fail.png`, `${RUN}-line-b.png`];
const FAIL_NAME = `${RUN}-line-fail.png`;
const WHOLE_NAMES = [`${RUN}-whole-a.png`, `${RUN}-whole-b.png`];
const N = LINE_NAMES.length;
// 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

const LINE_BATCH = 'checkin-line-0-batch';
const WHOLE_BATCH = 'checkin-delivery-batch';

const admin = adminClient();
let projectId = '';

type FileRow = {
  id: string;
  file_name: string;
  file_path: string;
  company_id: string;
  project_id: string | null;
  category: string;
  delivery_item_id: string | null;
  delivery_id: string | null;
  is_deleted: boolean;
};

const FILE_COLS =
  'id, file_name, file_path, company_id, project_id, category, delivery_item_id, delivery_id, is_deleted';

async function filesNamed(names: string[]): Promise<FileRow[]> {
  const { data, error } = await admin.from('files').select(FILE_COLS).in('file_name', names);
  if (error) throw new Error(`files read: ${error.message}`);
  return (data ?? []) as FileRow[];
}

/** Every object in the project folder whose name carries RUN (paged, never capped). */
async function runObjects(): Promise<string[]> {
  const folder = `${COMPANY_A}/${projectId}`;
  const names: string[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(folder, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`storage list: ${error.message}`);
    const page = data ?? [];
    names.push(...page.map((o) => o.name).filter((n) => n.includes(RUN)));
    if (page.length < PAGE) break;
  }
  return names.map((n) => `${folder}/${n}`);
}

/** Original photo objects for these file names (thumbnails excluded). */
async function photoObjects(names: string[]): Promise<string[]> {
  const all = await runObjects();
  return all.filter((p) => !isThumbnailPath(p) && names.some((n) => p.endsWith(`-${n}`)));
}

async function runDeliveryIds(): Promise<string[]> {
  const { data, error } = await admin
    .from('deliveries')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('vendor_name', VENDOR);
  if (error) throw new Error(`deliveries read: ${error.message}`);
  return ((data ?? []) as { id: string }[]).map((d) => d.id);
}

/** Remove everything this file created. Idempotent; returns the refusals. */
async function cleanup(): Promise<string[]> {
  const errors: string[] = [];
  const check = (what: string, e: { message: string } | null) => {
    if (e) errors.push(`${what}: ${e.message}`);
  };
  const deliveryIds = await runDeliveryIds();
  // Photos + the record PDF (its name carries the vendor slug, so RUN).
  const { data: rows, error: rowsError } = await admin
    .from('files')
    .select('id, file_path')
    .eq('company_id', COMPANY_A)
    .ilike('file_name', `%${RUN}%`);
  check('files read', rowsError);
  const fileRows = (rows ?? []) as { id: string; file_path: string }[];

  if (deliveryIds.length) {
    check(
      'email logs',
      (
        await admin
          .from('email_logs')
          .delete()
          .eq('email_type', 'material_delivery')
          .in('metadata->>delivery_id', deliveryIds)
      ).error
    );
    check(
      'notifications',
      (await admin.from('notifications').delete().in('source_id', deliveryIds)).error
    );
    // Items before the delivery: their recompute trigger updates the parent.
    check(
      'delivery items',
      (await admin.from('delivery_items').delete().in('delivery_id', deliveryIds)).error
    );
    // Before files: deliveries.pdf_file_id → files has no ON DELETE action.
    check('deliveries', (await admin.from('deliveries').delete().in('id', deliveryIds)).error);
  }
  // Objects from the rows AND anything listed with RUN (an orphan has no row).
  if (projectId) {
    const paths = new Set([
      ...withThumbnails(fileRows.map((r) => r.file_path)),
      ...(await runObjects()),
    ]);
    if (paths.size) check('storage', (await admin.storage.from(BUCKET).remove([...paths])).error);
  }
  if (fileRows.length) {
    check(
      'files',
      (
        await admin
          .from('files')
          .delete()
          .in(
            'id',
            fileRows.map((r) => r.id)
          )
      ).error
    );
  }
  return errors;
}

/** The final service-role count. Every figure must be zero. */
async function leftovers(): Promise<Record<string, number>> {
  const deliveries = await runDeliveryIds();
  const { count: files, error } = await admin
    .from('files')
    .select('id', { count: 'exact', head: true })
    .ilike('file_name', `%${RUN}%`);
  if (error) throw new Error(`leftover files count: ${error.message}`);
  const { count: items, error: itemsError } = await admin
    .from('delivery_items')
    .select('id', { count: 'exact', head: true })
    .eq('description', LINE_DESC);
  if (itemsError) throw new Error(`leftover items count: ${itemsError.message}`);
  return {
    files: files ?? -1,
    objects: projectId ? (await runObjects()).length : 0,
    deliveries: deliveries.length,
    delivery_items: items ?? -1,
  };
}

async function waitForBatch(page: Page, testId: string, done: number, failed: number) {
  const row = (status: string) =>
    page.locator(`[data-testid="${testId}-row"][data-status="${status}"]`);
  await expect(page.getByTestId(`${testId}-row`)).toHaveCount(done + failed, { timeout: 30_000 });
  await expect(row('done')).toHaveCount(done, { timeout: 30_000 });
  await expect(row('failed')).toHaveCount(failed, { timeout: 30_000 });
  // Settled: nothing still queued or in flight.
  await expect(row('queued')).toHaveCount(0);
  await expect(row('uploading')).toHaveCount(0);
}

test.beforeAll(async () => {
  // A live, ACTIVE Company A project. Ordered, so the pick is stable; any such
  // project serves (the Owner sees all of them).
  const { data, error } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`no active Company A project: ${error?.message}`);
  projectId = (data as { id: string }).id;
});

test.afterAll(async () => {
  const errors = await cleanup();
  expect(errors, 'cleanup refusals').toEqual([]);
  expect(await leftovers()).toEqual({ files: 0, objects: 0, deliveries: 0, delivery_items: 0 });
});

test('[S116 C-5] desktop check-in: 3 line photos, one forced failure named, retry lands exactly 3, bound to the line', async ({
  page,
}) => {
  test.setTimeout(180_000);

  // Thumbnails are generated server-side, fire-and-forget, after each INSERT.
  // Stubbed here so no late thumbnail can land AFTER the cleanup below and
  // survive the zero count; the thumbnail is not the subject of this proof.
  await page.route('**/api/photos/thumbnail', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );

  // The forced failure: the FIRST Storage upload of the one "fail" file is
  // aborted; every other request passes through untouched.
  let aborted = 0;
  const storageUpload = '**/storage/v1/object/project-files/**';
  const failOnce = async (route: Route) => {
    const req = route.request();
    if (
      req.method() === 'POST' &&
      decodeURIComponent(req.url()).includes('line-fail') &&
      aborted === 0
    ) {
      aborted += 1;
      await route.abort('failed');
      return;
    }
    await route.continue();
  };
  await page.route(storageUpload, failOnce);

  await signInAs(page, OWNER);
  await page.goto(`/dashboard/field-ops/${projectId}/deliveries/check-in`);

  // Orderless is the default ("No PO — orderless check-in").
  await page.getByPlaceholder('Who delivered').fill(VENDOR);
  await page.getByPlaceholder('Description').fill(LINE_DESC);

  // ── 1. Pick N = 3 on the line input.
  const lineInput = page.locator(
    'xpath=//label[contains(normalize-space(.), "Add photo")]/input[@type="file"]'
  );
  await expect(lineInput, 'exactly one line photo input (one orderless line)').toHaveCount(1);
  await lineInput.setInputFiles(
    LINE_NAMES.map((name) => ({ name, mimeType: 'image/png', buffer: PNG }))
  );

  await waitForBatch(page, LINE_BATCH, N - 1, 1);
  expect(aborted, 'the forced failure must have fired exactly once').toBe(1);
  await expect(
    page.getByTestId(`${LINE_BATCH}-row`).filter({ hasText: FAIL_NAME }),
    'the failed row is the forced file'
  ).toHaveAttribute('data-status', 'failed');
  await expect(page.getByTestId(`${LINE_BATCH}-error`)).toContainText(FAIL_NAME);
  await expect(page.getByTestId(`${LINE_BATCH}-count`)).toHaveText(`${N - 1} of ${N} uploaded`);

  // Service role: exactly N−1 rows and N−1 objects — the rest LANDED.
  const before = await filesNamed(LINE_NAMES);
  expect(before.map((r) => r.file_name).sort()).toEqual(
    LINE_NAMES.filter((n) => n !== FAIL_NAME).sort()
  );
  expect(await photoObjects(LINE_NAMES)).toHaveLength(N - 1);

  // ── 2. Retry, with the failure lifted.
  await page.unroute(storageUpload, failOnce);
  await page.getByTestId(`${LINE_BATCH}-retry`).click();
  await waitForBatch(page, LINE_BATCH, N, 0);
  await expect(page.getByTestId(`${LINE_BATCH}-retry`)).toHaveCount(0);
  await expect(page.getByTestId(`${LINE_BATCH}-error`)).toHaveCount(0);

  await expect.poll(async () => (await filesNamed(LINE_NAMES)).length, { timeout: 30_000 }).toBe(N);
  const afterRetry = await filesNamed(LINE_NAMES);
  // Exactly one row per file name — no duplicate from the retry.
  expect(afterRetry.map((r) => r.file_name).sort()).toEqual([...LINE_NAMES].sort());
  for (const r of afterRetry) {
    expect(r).toMatchObject({
      company_id: COMPANY_A,
      project_id: projectId,
      category: 'photos',
      delivery_item_id: null,
      delivery_id: null,
      is_deleted: false,
    });
  }
  const lineObjects = await photoObjects(LINE_NAMES);
  expect(lineObjects).toHaveLength(N);
  expect([...lineObjects].sort()).toEqual(afterRetry.map((r) => r.file_path).sort());

  // ── Whole-delivery input: 2 files, no failure — bound via delivery_id.
  const wholeInput = page.locator(
    'xpath=//label[normalize-space(.)="Photos (whole delivery — optional)"]/following-sibling::input[@type="file"][1]'
  );
  await expect(wholeInput).toHaveCount(1);
  await wholeInput.setInputFiles(
    WHOLE_NAMES.map((name) => ({ name, mimeType: 'image/png', buffer: PNG }))
  );
  await waitForBatch(page, WHOLE_BATCH, WHOLE_NAMES.length, 0);
  await expect
    .poll(async () => (await filesNamed(WHOLE_NAMES)).length, { timeout: 30_000 })
    .toBe(WHOLE_NAMES.length);
  expect(await photoObjects(WHOLE_NAMES)).toHaveLength(WHOLE_NAMES.length);

  // ── 3. Record the delivery; the route binds.
  await page.getByRole('button', { name: 'Record delivery' }).click();
  await page.waitForURL(
    new RegExp(`/dashboard/field-ops/${projectId}/deliveries/d/[0-9a-f-]{36}$`),
    {
      timeout: 60_000,
    }
  );
  const deliveryId = page.url().split('/deliveries/d/')[1];

  const deliveryIds = await runDeliveryIds();
  expect(deliveryIds, 'exactly one delivery created by this run').toEqual([deliveryId]);
  const { data: items, error: itemsError } = await admin
    .from('delivery_items')
    .select('id, description')
    .eq('delivery_id', deliveryId);
  expect(itemsError).toBeNull();
  const itemRows = (items ?? []) as { id: string; description: string }[];
  expect(itemRows, 'exactly one line').toHaveLength(1);
  expect(itemRows[0].description).toBe(LINE_DESC);
  const itemId = itemRows[0].id;

  const { data: bound, error: boundError } = await admin
    .from('files')
    .select(FILE_COLS)
    .eq('delivery_item_id', itemId);
  expect(boundError).toBeNull();
  const boundRows = (bound ?? []) as FileRow[];
  expect(boundRows.map((r) => r.id).sort(), 'exactly the N line photos bound to the line').toEqual(
    afterRetry.map((r) => r.id).sort()
  );
  for (const r of boundRows) {
    expect(r).toMatchObject({ company_id: COMPANY_A, project_id: projectId, category: 'photos' });
  }

  const { data: wholeBound, error: wholeError } = await admin
    .from('files')
    .select(FILE_COLS)
    .eq('delivery_id', deliveryId);
  expect(wholeError).toBeNull();
  const wholeRows = (wholeBound ?? []) as FileRow[];
  expect(wholeRows.map((r) => r.file_name).sort()).toEqual([...WHOLE_NAMES].sort());
  for (const r of wholeRows) {
    expect(r).toMatchObject({
      company_id: COMPANY_A,
      project_id: projectId,
      category: 'photos',
      delivery_item_id: null,
    });
  }

  // Still exactly N + 2 photo rows and objects after the save.
  expect(await filesNamed([...LINE_NAMES, ...WHOLE_NAMES])).toHaveLength(N + WHOLE_NAMES.length);
  expect(await photoObjects([...LINE_NAMES, ...WHOLE_NAMES])).toHaveLength(N + WHOLE_NAMES.length);

  // ── 4. Cleanup to zero, counted.
  expect(await cleanup(), 'cleanup refusals').toEqual([]);
  expect(await leftovers()).toEqual({ files: 0, objects: 0, deliveries: 0, delivery_items: 0 });
});
