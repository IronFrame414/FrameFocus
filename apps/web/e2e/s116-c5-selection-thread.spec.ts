import { test, expect, type Page, type Route } from '@playwright/test';
import { isThumbnailPath } from '@framefocus/shared/utils/markup';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';
import { withThumbnails } from './storage-cleanup';

// S116 C-5 (#2-s180u, F-12 step 1) — ONE PROOF SPEC PER SURFACE: the selection
// discussion thread (desktop selection sheet, `Thread` in selection-sheet.tsx).
//
// The new behaviour: the message posts ONLY once every photo has landed. A
// photo that did not land is NAMED in the batch list (`sel-msg-batch`) and
// NOTHING is posted; Send again retries ONLY that photo and then posts ONE
// message carrying all N ids. (`sel-msg-send-without` is the author's explicit
// way out, and is only asserted to be offered here.)
// _Superseded, quoted in the component:_ a failed photo was dropped SILENTLY and
// the message posted without it.
//
// The failure is injected at the Storage UPLOAD: the POST for the photo named
// `…-fail.png` is aborted once.
//
// Fixture: a selection (and its area) created with the service role on the QA
// isolation project, MARKER-named, swept before and after — the approach of
// desktop-selections.spec.ts, under a marker of its own so neither file's sweep
// touches the other's rows. Every outcome is COUNTED WITH THE SERVICE ROLE; a
// test that passes on zero rows is a failure, so every count is an exact N.

const OWNER = 'josh+test50@worthprop.com';
/** QA A — isolation fixture (chat-fixture.ts PROJECT_QA_A), Company A. */
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9';
const BUCKET = 'project-files';
const MARKER = 'S116C5SEL';
const RUN = `${MARKER}-${Date.now()}`;
const N = 3;
// 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
// The last name carries `fail` — the one the Storage route aborts. RUN cannot
// contain it, and uuids / company / project ids are hex, so the match is exact.
const NAMES = [
  ...Array.from({ length: N - 1 }, (_, i) => `${RUN}-p${i + 1}.png`),
  `${RUN}-fail.png`,
];
const FAIL_NAME = NAMES[N - 1];
const FOLDER = `${COMPANY_A}/${PROJECT}`;

const admin = adminClient();
let selectionId = '';
let ownerProfileId = '';

interface FileRow {
  id: string;
  company_id: string;
  project_id: string | null;
  category: string;
  tags: string[] | null;
  file_name: string;
  file_path: string;
}

/** Every `files` row carrying MARKER in Company A (this run's, and residue). */
async function markerFileRows(prefix: string): Promise<FileRow[]> {
  const { data, error } = await admin
    .from('files')
    .select('id, company_id, project_id, category, tags, file_name, file_path')
    .eq('company_id', COMPANY_A)
    .like('file_name', `${prefix}%`);
  if (error) throw new Error(`files read: ${error.message}`);
  return (data ?? []) as FileRow[];
}

/**
 * Every storage object in the project folder whose name carries `needle` —
 * originals AND thumbnails. Paged and sorted, not `search` (a name-PREFIX
 * match, and every name here starts with uploadFile's uuid).
 */
async function objectsWith(needle: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(FOLDER, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`storage list ${FOLDER}: ${error.message}`);
    const page = data ?? [];
    out.push(...page.filter((o) => o.name.includes(needle)).map((o) => `${FOLDER}/${o.name}`));
    if (page.length < 1000) break;
  }
  return out;
}

const originals = (paths: string[]) => paths.filter((p) => !isThumbnailPath(p));

async function threadIds(selIds: string[]): Promise<string[]> {
  if (!selIds.length) return [];
  const { data, error } = await admin
    .from('selection_threads')
    .select('id')
    .in('selection_id', selIds);
  if (error) throw new Error(`threads read: ${error.message}`);
  return ((data ?? []) as { id: string }[]).map((t) => t.id);
}

async function messages(): Promise<{ id: string; body: string; author_profile_id: string }[]> {
  const tids = await threadIds([selectionId]);
  if (!tids.length) return [];
  const { data, error } = await admin
    .from('selection_messages')
    .select('id, body, author_profile_id')
    .in('thread_id', tids);
  if (error) throw new Error(`messages read: ${error.message}`);
  return (data ?? []) as { id: string; body: string; author_profile_id: string }[];
}

/**
 * Remove every MARKER record: selections (threads → messages → message photos
 * and notes cascade), then the files rows those photos pointed at
 * (selection_message_photos.file_id has no cascade, so rows go AFTER), then
 * their objects and thumbnails, then the areas. Returns every refusal.
 */
async function sweep(): Promise<string[]> {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };
  const { data: sels, error: selErr } = await admin
    .from('selections')
    .select('id')
    .eq('company_id', COMPANY_A)
    .like('name', `${MARKER}%`);
  check('selections read', selErr);
  const ids = ((sels ?? []) as { id: string }[]).map((s) => s.id);
  if (ids.length) {
    const tids = await threadIds(ids);
    if (tids.length) {
      check(
        'messages',
        (await admin.from('selection_messages').delete().in('thread_id', tids)).error
      );
      check('threads', (await admin.from('selection_threads').delete().in('id', tids)).error);
    }
    check('selections', (await admin.from('selections').delete().in('id', ids)).error);
  }
  const rows = await markerFileRows(MARKER);
  if (rows.length) {
    check(
      'files',
      (
        await admin
          .from('files')
          .delete()
          .in(
            'id',
            rows.map((r) => r.id)
          )
      ).error
    );
  }
  const paths = [
    ...new Set([...withThumbnails(rows.map((r) => r.file_path)), ...(await objectsWith(MARKER))]),
  ];
  if (paths.length) check('storage', (await admin.storage.from(BUCKET).remove(paths)).error);
  check(
    'areas',
    (
      await admin
        .from('selection_areas')
        .delete()
        .eq('company_id', COMPANY_A)
        .like('name', `${MARKER}%`)
    ).error
  );
  return errors;
}

async function batchStatuses(page: Page): Promise<string[]> {
  const s = await page
    .getByTestId('sel-msg-batch-row')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-status') ?? ''));
  return s.sort();
}

test.beforeAll(async () => {
  const errors = await sweep();
  expect(errors, 'the pre-run sweep met refusals').toEqual([]);

  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .select('id')
    .eq('email', OWNER)
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .single();
  if (profErr || !prof) throw new Error(`owner profile: ${profErr?.message}`);
  ownerProfileId = (prof as { id: string }).id;

  const { data: area, error: areaErr } = await admin
    .from('selection_areas')
    .insert({ company_id: COMPANY_A, project_id: PROJECT, name: `${RUN} Kitchen` })
    .select('id')
    .single();
  if (areaErr || !area) throw new Error(`fixture area: ${areaErr?.message}`);
  const { data: sel, error: selErr } = await admin
    .from('selections')
    .insert({
      company_id: COMPANY_A,
      project_id: PROJECT,
      area_id: (area as { id: string }).id,
      name: `${RUN} Backsplash`,
      status: 'in_discussion',
      description: 'thread upload proof',
    })
    .select('id')
    .single();
  if (selErr || !sel) throw new Error(`fixture selection: ${selErr?.message}`);
  selectionId = (sel as { id: string }).id;
});

test.afterAll(async () => {
  const errors = await sweep();
  expect(errors, 'teardown met refusals').toEqual([]);

  // ZERO LEFTOVERS, counted with the service role.
  expect(await markerFileRows(MARKER), 'files rows left behind').toHaveLength(0);
  expect(await objectsWith(MARKER), 'storage objects left behind').toHaveLength(0);
  const { count: selCount } = await admin
    .from('selections')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', COMPANY_A)
    .like('name', `${MARKER}%`);
  expect(selCount, 'selection left behind').toBe(0);
  const { count: areaCount } = await admin
    .from('selection_areas')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', COMPANY_A)
    .like('name', `${MARKER}%`);
  expect(areaCount, 'area left behind').toBe(0);
  if (selectionId) {
    expect(await threadIds([selectionId]), 'thread left behind').toHaveLength(0);
  }
});

test.describe('S116 C-5 · selection thread photos through the shared upload queue', () => {
  test.setTimeout(180_000);

  test(`${N} photos: one upload aborted → nothing posted, it is named; Send retries only it → ONE message with ${N} photo ids`, async ({
    page,
  }) => {
    // The grid thumbnail is a derivative, not the subject: answering its
    // fire-and-forget request keeps storage to exactly the N originals and
    // leaves no late object to race the teardown.
    await page.route(
      (url) => url.pathname === '/api/photos/thumbnail',
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, skipped: 'e2e' }),
        })
    );

    // Every Storage upload attempt the browser makes for this run (an aborted
    // one included) — the proof that the retry uploads ONLY the missing photo.
    const storagePosts: string[] = [];
    page.on('request', (req) => {
      const u = new URL(req.url());
      if (
        req.method() === 'POST' &&
        u.pathname.includes(`/storage/v1/object/${BUCKET}/`) &&
        u.pathname.includes(RUN)
      ) {
        storagePosts.push(u.pathname);
      }
    });

    // THE FORCED FAILURE: the first Storage POST for the `fail` photo aborts.
    const aborted = { count: 0 };
    const uploadMatcher = (url: URL) =>
      url.pathname.includes(`/storage/v1/object/${BUCKET}/`) && url.pathname.includes('fail');
    const uploadHandler = async (route: Route) => {
      if (route.request().method() === 'POST' && aborted.count === 0) {
        aborted.count += 1;
        await route.abort('failed');
        return;
      }
      await route.continue();
    };
    await page.route(uploadMatcher, uploadHandler);

    await signInAs(page, OWNER);
    await page.goto(`/dashboard/projects/${PROJECT}/selections/${selectionId}`);
    // Hydration first: a file change fired before React attaches onChange is lost.
    await page.waitForLoadState('networkidle');
    const thread = page.getByTestId('sel-thread');
    await expect(thread).toBeVisible();
    await expect(page.getByTestId('sel-msg')).toHaveCount(0);

    const body = `${RUN} message`;
    await page.getByTestId('sel-msg-body').fill(body);
    // The picker input is `hidden`; setInputFiles drives it directly.
    const fileInput = thread.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(1);
    await fileInput.setInputFiles(
      NAMES.map((name) => ({ name, mimeType: 'image/png', buffer: PNG }))
    );
    await expect(thread).toContainText(`${N} photos attached`);
    await page.getByTestId('sel-msg-send').click();

    const rows = page.getByTestId('sel-msg-batch-row');
    await expect(rows).toHaveCount(N);
    await expect
      .poll(() => batchStatuses(page), { timeout: 60_000 })
      .toEqual([...Array(N - 1).fill('done'), 'failed'].sort());
    expect(aborted.count, 'the forced abort fired exactly once').toBe(1);

    // The UI NAMES the missing photo and offers both ways on.
    const failedRow = page.locator('[data-testid="sel-msg-batch-row"][data-status="failed"]');
    await expect(failedRow).toHaveCount(1);
    await expect(failedRow).toContainText(FAIL_NAME);
    await expect(page.getByTestId('sel-msg-batch-error')).toContainText(FAIL_NAME);
    await expect(page.getByTestId('sel-msg-batch-count')).toHaveText(`${N - 1} of ${N} uploaded`);
    await expect(page.getByTestId('sel-msg-batch-retry')).toBeVisible();
    await expect(page.getByTestId('sel-msg-send-without')).toBeVisible();

    // BEFORE RETRY, service role: NO message posted, N−1 rows, N−1 objects.
    expect(await messages(), 'no message may post while a photo is missing').toHaveLength(0);
    const before = await markerFileRows(RUN);
    expect(before, `${N - 1} files rows before retry`).toHaveLength(N - 1);
    expect(before.map((r) => r.file_name)).not.toContain(FAIL_NAME);
    expect(originals(await objectsWith(RUN)), `${N - 1} objects before retry`).toHaveLength(N - 1);
    expect(storagePosts, `${N} upload attempts on the first pass`).toHaveLength(N);
    await expect(page.getByTestId('sel-msg')).toHaveCount(0);

    // RETRY: Send again, with the Storage path restored.
    await page.unroute(uploadMatcher, uploadHandler);
    await page.getByTestId('sel-msg-send').click();

    // AFTER RETRY, service role: exactly ONE message with exactly N photo ids,
    // exactly N rows, exactly N objects; the retry uploaded only the one.
    await expect.poll(async () => (await messages()).length, { timeout: 60_000 }).toBe(1);
    const posted = await messages();
    expect(posted).toHaveLength(1);
    expect(posted[0].body).toBe(body);
    expect(posted[0].author_profile_id).toBe(ownerProfileId);

    const after = await markerFileRows(RUN);
    expect(after, `exactly ${N} files rows after retry (no duplicate)`).toHaveLength(N);
    expect(after.map((r) => r.file_name).sort()).toEqual([...NAMES].sort());
    for (const r of after) {
      expect(r.company_id).toBe(COMPANY_A);
      expect(r.project_id).toBe(PROJECT);
      expect(r.category).toBe('photos');
      expect(r.tags ?? []).toContain('selection-thread');
    }
    // The N−1 that landed first are the same rows — never uploaded again.
    const afterIds = after.map((r) => r.id);
    for (const r of before) expect(afterIds).toContain(r.id);

    const { data: photoRows, error: photoErr } = await admin
      .from('selection_message_photos')
      .select('file_id')
      .eq('message_id', posted[0].id);
    expect(photoErr).toBeNull();
    const photoIds = ((photoRows ?? []) as { file_id: string }[]).map((p) => p.file_id);
    expect(photoIds, `exactly ${N} photo ids on the message`).toHaveLength(N);
    expect([...photoIds].sort()).toEqual([...afterIds].sort());

    expect(originals(await objectsWith(RUN)), `exactly ${N} objects after retry`).toHaveLength(N);
    expect(storagePosts, 'the retry uploaded only the missing photo').toHaveLength(N + 1);

    // The page shows the one message; the batch is cleared.
    await expect(page.getByTestId('sel-msg')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId('sel-msg')).toContainText(body);
    await expect(page.getByTestId('sel-msg-batch')).toHaveCount(0);
  });
});
