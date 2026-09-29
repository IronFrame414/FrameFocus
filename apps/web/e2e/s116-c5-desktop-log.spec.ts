import { test, expect } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';
import { withThumbnails } from './storage-cleanup';

// [S116 C-5, #2-s180u] PROOF — desktop daily log, one spec for one surface.
//
// 72a55123 moved the log form's photos onto the shared queue
// (lib/uploads/upload-batch.ts + use-upload-batches.ts, rendered by
// components/uploads/upload-batch-list.tsx) and split UPLOAD from LINK
// (makeAttachWorker), because the old helper reported a photo that uploaded
// but did not LINK as a plain failure — and a re-attach uploaded it a second
// time, leaving the first copy as an unlinked `files` row.
//
// So the failure is forced at the LINK step, not the upload: the browser's
// PATCH to /rest/v1/files that sets `daily_log_id` is answered 400 ONCE. That
// file's `files` row must exist UNLINKED; Retry must re-link THAT row (same
// id), never upload a fourth file, and never create a second log.
//
// Every outcome is COUNTED WITH THE SERVICE ROLE, never inferred from the UI.
// A count of zero is a failure, not a pass: every count is asserted exactly.

const OWNER = 'josh+test50@worthprop.com';
const BUCKET = 'project-files';
const RUN = `s116-c5-log-${Date.now()}`;
const MARKER = `${RUN} — proof log (work performed)`;
const N = 3;
const NAMES = Array.from({ length: N }, (_, i) => `${RUN}-${i + 1}.png`);
// 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
// The link write: postgrest-js `update(...).eq('id', …).select('id')` is a
// PATCH to /rest/v1/files?id=eq.<uuid>&select=id (daily-logs-client.ts
// linkDailyLogPhoto). A RegExp, not a glob, so `?` is a literal.
const FILES_REST = /\/rest\/v1\/files\?/;
const STORAGE_UPLOAD = /\/storage\/v1\/object\/project-files\//;

const admin = adminClient();
let projectId = '';

interface PhotoRow {
  id: string;
  company_id: string;
  project_id: string;
  category: string;
  daily_log_id: string | null;
  file_name: string;
  file_path: string;
  is_deleted: boolean;
}

/** Every `files` row this run's photos produced (scoped by the RUN tag). */
async function photoRows(): Promise<PhotoRow[]> {
  const { data, error } = await admin
    .from('files')
    .select('id, company_id, project_id, category, daily_log_id, file_name, file_path, is_deleted')
    .like('file_name', `${RUN}-%`)
    .order('file_name', { ascending: true });
  if (error) throw new Error(`files read: ${error.message}`);
  return (data ?? []) as PhotoRow[];
}

/**
 * Every object in the project's folder whose name carries `tag`, listed with
 * the service role and paged (storage caps a page at 1500). Object names are
 * `{uuid}-{safe_filename}` (files-client.ts uploadFile), so a prefix `search`
 * cannot find them by tag — the folder is listed and filtered instead.
 */
async function storageNames(tag: string): Promise<string[]> {
  const out: string[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin.storage.from(BUCKET).list(`${COMPANY_A}/${projectId}`, {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`storage list: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows.map((o) => o.name).filter((n) => n.includes(tag)));
    if (rows.length < pageSize) break;
  }
  return out;
}

const originals = (names: string[]) => names.filter((n) => !n.endsWith('.thumb.webp'));

async function logsByMarker(): Promise<{ id: string; pdf_file_id: string | null }[]> {
  const { data, error } = await admin
    .from('daily_logs')
    .select('id, pdf_file_id')
    .eq('project_id', projectId)
    .eq('work_performed', MARKER);
  if (error) throw new Error(`daily_logs read: ${error.message}`);
  return (data ?? []) as { id: string; pdf_file_id: string | null }[];
}

/** The log's PDF rows: `daily-log-{date}-{author}-{logId8}.pdf` (daily-log-pdf-service.ts). */
async function pdfRows(logId: string): Promise<{ id: string; file_path: string }[]> {
  const { data, error } = await admin
    .from('files')
    .select('id, file_path')
    .eq('project_id', projectId)
    .eq('category', 'daily_logs')
    .like('file_name', `daily-log-%-${logId.slice(0, 8)}.pdf`);
  if (error) throw new Error(`pdf read: ${error.message}`);
  return (data ?? []) as { id: string; file_path: string }[];
}

/**
 * Idempotent teardown of everything this run created: the log (crew and sub
 * rows cascade; files.daily_log_id is ON DELETE SET NULL), then the photo and
 * PDF `files` rows (the log's pdf_file_id FK is gone by then), then the
 * objects and their thumbnails.
 */
async function cleanup(): Promise<void> {
  const logs = await logsByMarker();
  const pdfs = (await Promise.all(logs.map((l) => pdfRows(l.id)))).flat();
  if (logs.length) {
    const del = await admin
      .from('daily_logs')
      .delete()
      .in(
        'id',
        logs.map((l) => l.id)
      );
    if (del.error) throw new Error(`delete log: ${del.error.message}`);
  }
  const photos = await photoRows();
  const rows = [...photos, ...pdfs];
  if (rows.length) {
    const del = await admin
      .from('files')
      .delete()
      .in(
        'id',
        rows.map((r) => r.id)
      );
    if (del.error) throw new Error(`delete files: ${del.error.message}`);
    await admin.storage.from(BUCKET).remove(withThumbnails(rows.map((r) => r.file_path)));
  }
  // An object whose row never landed (or is already gone) still carries the tag.
  const strays = await storageNames(RUN);
  if (strays.length) {
    await admin.storage.from(BUCKET).remove(strays.map((n) => `${COMPANY_A}/${projectId}/${n}`));
  }
}

test.beforeAll(async () => {
  // A live, ACTIVE Company A project — ordered, so the pick is stable.
  const { data, error } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`no active Company A project: ${error?.message}`);
  projectId = data.id as string;
});

test.afterAll(async () => {
  // Safety net for a failed run; the test itself cleans up and asserts zero.
  if (projectId) await cleanup();
});

async function stubThumbnails(page: Page): Promise<void> {
  // The grid thumbnail is fire-and-forget (lib/photos/request-thumbnail.ts)
  // and lands at an unknown time — it could appear AFTER teardown. It is not
  // what this proof judges (upload + link), so it is answered here and the
  // object count below is exactly the N originals.
  await page.route('**/api/photos/thumbnail', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );
}

test.describe('S116 C-5 · desktop daily log — N photos, a forced LINK failure, Retry', () => {
  test.setTimeout(180_000);

  test('N rows + N objects; the link failure is named; Retry re-links the SAME row; one log', async ({
    page,
  }) => {
    await stubThumbnails(page);

    // Independent tallies of what the browser sent (corroboration only).
    let storageUploads = 0;
    let fileInserts = 0;
    let linkPatches = 0;
    page.on('request', (req: Request) => {
      if (req.method() === 'POST' && STORAGE_UPLOAD.test(req.url())) storageUploads++;
      if (req.method() === 'POST' && FILES_REST.test(req.url())) fileInserts++;
      if (
        req.method() === 'PATCH' &&
        FILES_REST.test(req.url()) &&
        (req.postData() ?? '').includes('"daily_log_id"')
      )
        linkPatches++;
    });

    // Force exactly ONE link write to fail. The check-and-set is synchronous,
    // so concurrent PATCHes (≤3 in flight) cannot both take it.
    // A holder, not a `let`: TS would narrow a closure-assigned `let` to `null`.
    const intercepted: { fileId: string | null } = { fileId: null };
    await page.route(FILES_REST, async (route) => {
      const req = route.request();
      if (
        intercepted.fileId === null &&
        req.method() === 'PATCH' &&
        (req.postData() ?? '').includes('"daily_log_id"')
      ) {
        intercepted.fileId = /[?&]id=eq\.([0-9a-f-]{36})/.exec(req.url())?.[1] ?? 'unparsed';
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'forced' }),
        });
        return;
      }
      await route.continue();
    });

    await signInAs(page, OWNER);
    await page.goto(`/dashboard/field-ops/${projectId}/daily-logs/new`);
    await expect(page.getByRole('heading', { name: 'New Daily Log' })).toBeVisible({
      timeout: 30_000,
    });

    expect(await logsByMarker(), 'no log with this marker before the run').toHaveLength(0);
    expect(await photoRows(), 'no photo rows with this tag before the run').toHaveLength(0);

    await page.getByPlaceholder('What was accomplished today').fill(MARKER);
    const input = page.locator('input[type="file"]');
    await expect(input, 'exactly one file input on the log form').toHaveCount(1);
    await input.setInputFiles(NAMES.map((name) => ({ name, mimeType: 'image/png', buffer: PNG })));
    for (const name of NAMES) await expect(page.getByText(name)).toBeVisible();

    await page.getByRole('button', { name: 'Save daily log' }).click();

    // The log is saved but one photo did not LINK: the form STAYS, names it.
    const batch = page.getByTestId('log-photos-batch');
    await expect(page.getByTestId('log-photos-continue')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('log-photos-batch-retry')).toBeVisible();
    await expect(batch.getByTestId('log-photos-batch-row')).toHaveCount(N);
    await expect(
      batch.locator('[data-testid="log-photos-batch-row"][data-status="failed"]')
    ).toHaveCount(1);
    await expect(
      batch.locator('[data-testid="log-photos-batch-row"][data-status="done"]')
    ).toHaveCount(N - 1);
    await expect(page.getByTestId('log-photos-batch-count')).toHaveText(
      `${N - 1} of ${N} uploaded`
    );
    // A second Save would file a second log — it is gone while the log is saved.
    await expect(page.getByRole('button', { name: 'Save daily log' })).toHaveCount(0);

    const forcedFileId = intercepted.fileId;
    expect(forcedFileId, 'the route intercepted a link PATCH').not.toBeNull();
    expect(forcedFileId).not.toBe('unparsed');

    // ONE log, found by its marker.
    const logs = await logsByMarker();
    expect(logs, 'exactly one daily log created').toHaveLength(1);
    const logId = logs[0].id;

    // N rows, right company/project/category; the forced one EXISTS UNLINKED.
    const before = await photoRows();
    expect(before).toHaveLength(N);
    expect(before.map((r) => r.file_name)).toEqual(NAMES);
    for (const r of before) {
      expect(r).toMatchObject({
        company_id: COMPANY_A,
        project_id: projectId,
        category: 'daily_logs',
        is_deleted: false,
      });
    }
    const forced = before.find((r) => r.id === forcedFileId);
    expect(forced, 'the forced file has a files row').toBeTruthy();
    expect(forced!.daily_log_id, 'uploaded but NOT linked').toBeNull();
    const others = before.filter((r) => r.id !== forcedFileId);
    expect(others).toHaveLength(N - 1);
    for (const r of others) expect(r.daily_log_id).toBe(logId);

    // The UI names THAT file as the failure, and says it failed at the link.
    const failedRow = batch.locator('[data-testid="log-photos-batch-row"][data-status="failed"]');
    await expect(failedRow).toContainText(forced!.file_name);
    await expect(failedRow.locator('span[title]')).toHaveAttribute(
      'title',
      /Uploaded but not attached: forced/
    );
    await expect(page.getByTestId('log-photos-batch-error')).toContainText(forced!.file_name);

    // N objects — the upload happened once per file.
    expect(originals(await storageNames(RUN)), 'N storage objects').toHaveLength(N);
    const beforeIds = before.map((r) => r.id).sort();

    // Retry, with the network restored.
    await page.unroute(FILES_REST);
    await page.getByTestId('log-photos-batch-retry').click();

    // Nothing missing → the form proceeds to the ONE log.
    await page.waitForURL(new RegExp(`/dashboard/field-ops/${projectId}/daily-logs/${logId}$`), {
      timeout: 60_000,
    });

    // Exactly N rows — the same N (no duplicate) — all linked to the one log.
    const after = await photoRows();
    expect(after).toHaveLength(N);
    expect(after.map((r) => r.id).sort(), 'no new upload on Retry').toEqual(beforeIds);
    expect(after.map((r) => r.id)).toContain(forcedFileId);
    for (const r of after) {
      expect(r).toMatchObject({
        company_id: COMPANY_A,
        project_id: projectId,
        category: 'daily_logs',
        daily_log_id: logId,
        is_deleted: false,
      });
    }
    // Exclusive: nothing ELSE is linked to this log.
    const { count: linkedToLog, error: linkedErr } = await admin
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('daily_log_id', logId);
    expect(linkedErr).toBeNull();
    expect(linkedToLog).toBe(N);
    expect(originals(await storageNames(RUN)), 'still exactly N objects').toHaveLength(N);
    expect(await logsByMarker(), 'still exactly one log').toHaveLength(1);

    // Corroboration from the wire: N uploads, N inserts, N + 1 link writes.
    expect(storageUploads, 'storage uploads sent').toBe(N);
    expect(fileInserts, 'files inserts sent').toBe(N);
    expect(linkPatches, 'link PATCHes sent (one failed, one retried)').toBe(N + 1);

    // Teardown, then a service-role count of ZERO leftovers.
    await cleanup();
    expect(await logsByMarker(), 'log removed').toHaveLength(0);
    expect(await photoRows(), 'photo rows removed').toHaveLength(0);
    expect(await pdfRows(logId), 'PDF rows removed').toHaveLength(0);
    expect(await storageNames(RUN), 'photo objects (and thumbnails) removed').toHaveLength(0);
    expect(await storageNames(`${logId.slice(0, 8)}.pdf`), 'PDF objects removed').toHaveLength(0);
  });
});
