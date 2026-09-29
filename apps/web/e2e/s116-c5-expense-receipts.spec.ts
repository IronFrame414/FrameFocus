import { test, expect, type Page, type Route } from '@playwright/test';
import { isThumbnailPath } from '@framefocus/shared/utils/markup';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';
import { withThumbnails } from './storage-cleanup';

// S116 C-5 (#2-s180u, F-12 step 1) — ONE PROOF SPEC PER SURFACE: expense receipts.
//
// The surface: /dashboard/expenses/new → ExpenseCaptureForm. Receipts upload
// AFTER the expense is created, through the shared queue, each one UPLOADED and
// then LINKED (`files.expense_id`) by makeAttachWorker.
//
// The defect this branch fixed is the one forced here: a receipt whose upload
// landed but whose LINK failed used to be reported as a failed upload, so a
// retry uploaded it a SECOND time and left the first copy as an unlinked row.
// So the failure is injected at the LINK (one browser PATCH to `files` carrying
// `expense_id` answered 400), and the retry must re-LINK that same row — never
// upload again.
//
// Every outcome is COUNTED WITH THE SERVICE ROLE. A test that passes on zero
// rows is a failure, so every count is an exact N, never "at least".

const OWNER = 'josh+test50@worthprop.com';
const BUCKET = 'project-files';
const RUN = `s116c5exp-${Date.now()}`;
const SUPPLIER = `${RUN} supplier`;
const AMOUNT = 12.34;
const N = 3;
// 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
const NAMES = Array.from({ length: N }, (_, i) => `${RUN}-r${i + 1}.png`);

const admin = adminClient();
let projectId = '';
let miscLineId = '';

interface FileRow {
  id: string;
  company_id: string;
  project_id: string | null;
  category: string;
  expense_id: string | null;
  file_name: string;
  file_path: string;
}

/** Every `files` row this run created, wherever it landed in Company A. */
async function runFileRows(): Promise<FileRow[]> {
  const { data, error } = await admin
    .from('files')
    .select('id, company_id, project_id, category, expense_id, file_name, file_path')
    .eq('company_id', COMPANY_A)
    .like('file_name', `${RUN}%`);
  if (error) throw new Error(`files read: ${error.message}`);
  return (data ?? []) as FileRow[];
}

/**
 * Every storage object under `folder` whose name carries RUN — originals AND
 * thumbnails. Listed page by page (sorted, so paging is stable) rather than
 * with `search`, which matches a name PREFIX and every name here starts with
 * uploadFile's uuid.
 */
async function runObjects(folder: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(folder, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`storage list ${folder}: ${error.message}`);
    const page = data ?? [];
    out.push(...page.filter((o) => o.name.includes(RUN)).map((o) => `${folder}/${o.name}`));
    if (page.length < 1000) break;
  }
  return out;
}

const originals = (paths: string[]) => paths.filter((p) => !isThumbnailPath(p));

async function expensesByRun(): Promise<{ id: string }[]> {
  const { data, error } = await admin
    .from('expenses')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('supplier', SUPPLIER);
  if (error) throw new Error(`expenses read: ${error.message}`);
  return (data ?? []) as { id: string }[];
}

async function batchStatuses(page: Page): Promise<string[]> {
  const s = await page
    .getByTestId('expense-receipts-batch-row')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-status') ?? ''));
  return s.sort();
}

test.beforeAll(async () => {
  // An ACTIVE Company A project that already HAS its Miscellaneous line, so the
  // default split resolves to an existing row (get_or_create_misc_budget_item
  // creates one otherwise — a record this test would then own), and that has
  // NO issued PO, so the capture form asks no "which PO" question. Ordered, so
  // the pick is stable; the first qualifying row is taken.
  const { data: lines, error } = await admin
    .from('project_budget_items')
    .select('id, project_id, created_at, projects!inner(company_id, status, is_deleted)')
    .eq('is_miscellaneous', true)
    .eq('is_deleted', false)
    .eq('projects.company_id', COMPANY_A)
    .eq('projects.status', 'active')
    .eq('projects.is_deleted', false)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`misc lines: ${error.message}`);
  for (const line of (lines ?? []) as { id: string; project_id: string }[]) {
    const { count, error: poErr } = await admin
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', line.project_id)
      .eq('status', 'issued')
      .eq('is_deleted', false);
    if (poErr) throw new Error(`purchase_orders: ${poErr.message}`);
    if (count === 0) {
      projectId = line.project_id;
      miscLineId = line.id;
      break;
    }
  }
  if (!projectId) {
    throw new Error(
      'no active Company A project with a Miscellaneous line and no issued PO — the fixture premise is gone'
    );
  }
});

test.afterAll(async () => {
  // Rows first (their paths name the objects), then objects — including
  // thumbnails and any orphan with RUN in its name — then the expense, whose
  // allocations cascade (expense_allocations_expense_id_fkey ON DELETE CASCADE).
  const rows = await runFileRows();
  const expenses = await expensesByRun();
  const expenseIds = expenses.map((e) => e.id);
  const errors: string[] = [];
  if (rows.length) {
    const del = await admin
      .from('files')
      .delete()
      .in(
        'id',
        rows.map((r) => r.id)
      );
    if (del.error) errors.push(`files: ${del.error.message}`);
  }
  const folder = `${COMPANY_A}/${projectId}`;
  const paths = [
    ...new Set([...withThumbnails(rows.map((r) => r.file_path)), ...(await runObjects(folder))]),
  ];
  if (paths.length) {
    const rm = await admin.storage.from(BUCKET).remove(paths);
    if (rm.error) errors.push(`storage: ${rm.error.message}`);
  }
  if (expenseIds.length) {
    const alloc = await admin.from('expense_allocations').delete().in('expense_id', expenseIds);
    if (alloc.error) errors.push(`allocations: ${alloc.error.message}`);
    const exp = await admin.from('expenses').delete().in('id', expenseIds);
    if (exp.error) errors.push(`expenses: ${exp.error.message}`);
  }
  expect(errors, 'teardown met refusals').toEqual([]);

  // ZERO LEFTOVERS, counted with the service role.
  expect(await runFileRows(), 'files rows left behind').toHaveLength(0);
  expect(await runObjects(folder), 'storage objects left behind').toHaveLength(0);
  expect(await expensesByRun(), 'expense left behind').toHaveLength(0);
  if (expenseIds.length) {
    const { count } = await admin
      .from('expense_allocations')
      .select('id', { count: 'exact', head: true })
      .in('expense_id', expenseIds);
    expect(count, 'allocations left behind').toBe(0);
  }
});

test.describe('S116 C-5 · expense receipts through the shared upload queue', () => {
  test.setTimeout(180_000);

  test(`${N} receipts → ${N} linked rows + ${N} objects; one LINK failure is named, and Retry re-links it without a second upload`, async ({
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

    // Every Storage upload the browser makes for this run — the proof that the
    // retry uploads NOTHING.
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

    // THE FORCED FAILURE: the first link PATCH (a `files` update whose body
    // sets expense_id) is answered 400. Exactly one; the rest go through.
    const forced: { count: number; fileId: string | null } = { count: 0, fileId: null };
    const linkMatcher = (url: URL) => url.pathname.endsWith('/rest/v1/files');
    const linkHandler = async (route: Route) => {
      const req = route.request();
      if (
        req.method() === 'PATCH' &&
        (req.postData() ?? '').includes('expense_id') &&
        forced.count === 0
      ) {
        forced.count += 1;
        forced.fileId = new URL(req.url()).searchParams.get('id')?.replace(/^eq\./, '') ?? null;
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'forced' }),
        });
        return;
      }
      await route.continue();
    };
    await page.route(linkMatcher, linkHandler);

    await signInAs(page, OWNER);
    await page.goto(`/dashboard/expenses/new?project=${projectId}`);
    await expect(page.getByRole('heading', { name: 'Log expense', exact: true })).toBeVisible();

    // The minimum valid form: job (pre-filled by ?project=), supplier, amount;
    // the split stays its default single Miscellaneous row = the full amount.
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(1);
    await fileInput.setInputFiles(
      NAMES.map((name) => ({ name, mimeType: 'image/png', buffer: PNG }))
    );
    await page.getByPlaceholder('e.g. Home Depot').fill(SUPPLIER);
    await page.getByPlaceholder('0.00', { exact: true }).fill(String(AMOUNT));
    // No PO question on this project (the fixture premise, checked).
    await expect(page.getByTestId('capture-po-context')).toHaveCount(0);
    await page.getByRole('button', { name: 'Submit expense' }).click();

    await expect(page.getByText('Expense logged.')).toBeVisible({ timeout: 30_000 });
    const rows = page.getByTestId('expense-receipts-batch-row');
    await expect(rows).toHaveCount(N);
    await expect
      .poll(() => batchStatuses(page), { timeout: 60_000 })
      .toEqual([...Array(N - 1).fill('done'), 'failed'].sort());

    // Exactly one link was forced, and it named a file.
    expect(forced.count, 'the forced link failure fired exactly once').toBe(1);
    expect(forced.fileId, 'the forced PATCH named its file id').toMatch(/^[0-9a-f-]{36}$/);

    // Exactly ONE expense was created.
    const expenses = await expensesByRun();
    expect(expenses, 'exactly one expense').toHaveLength(1);
    const expenseId = expenses[0].id;

    // BEFORE RETRY, service role: N rows (all N UPLOADED), N−1 linked, the
    // forced one present with expense_id NULL.
    const before = await runFileRows();
    expect(before, `${N} files rows after the first pass`).toHaveLength(N);
    for (const r of before) {
      expect(r.company_id).toBe(COMPANY_A);
      expect(r.project_id).toBe(projectId);
      expect(r.category).toBe('receipts');
    }
    const unlinked = before.filter((r) => r.expense_id === null);
    expect(
      unlinked.map((r) => r.id),
      'the forced row exists, unlinked'
    ).toEqual([forced.fileId]);
    expect(
      before.filter((r) => r.expense_id === expenseId),
      `${N - 1} rows linked to the expense`
    ).toHaveLength(N - 1);
    expect(originals(await runObjects(`${COMPANY_A}/${projectId}`))).toHaveLength(N);
    expect(storagePosts, `${N} uploads on the first pass`).toHaveLength(N);

    // The UI NAMES the failed file — the one whose link was forced.
    const forcedName = unlinked[0].file_name;
    const failedRow = page.locator(
      '[data-testid="expense-receipts-batch-row"][data-status="failed"]'
    );
    await expect(failedRow).toHaveCount(1);
    await expect(failedRow).toContainText(forcedName);
    await expect(page.getByTestId('expense-receipts-batch-error')).toContainText(forcedName);
    await expect(page.getByTestId('expense-receipts-batch-count')).toHaveText(
      `${N - 1} of ${N} uploaded`
    );

    // RETRY, with the link path restored.
    await page.unroute(linkMatcher, linkHandler);
    await page.getByTestId('expense-receipts-batch-retry').click();
    await expect
      .poll(() => batchStatuses(page), { timeout: 60_000 })
      .toEqual(Array(N).fill('done'));
    await expect(page.getByTestId('expense-receipts-batch-count')).toHaveText(
      `${N} of ${N} uploaded`
    );
    await expect(page.getByTestId('expense-receipts-batch-retry')).toHaveCount(0);

    // AFTER RETRY, service role: still exactly N rows — the SAME N ids, so the
    // formerly-unlinked row was re-linked, not re-uploaded — all on the one
    // expense; exactly N objects; no further Storage POST.
    const after = await runFileRows();
    expect(after, `exactly ${N} files rows after retry (no duplicate)`).toHaveLength(N);
    expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
    expect(after.map((r) => r.id)).toContain(forced.fileId);
    for (const r of after) {
      expect(r.expense_id, `${r.file_name} linked to the expense`).toBe(expenseId);
      expect(r.company_id).toBe(COMPANY_A);
      expect(r.project_id).toBe(projectId);
      expect(r.category).toBe('receipts');
    }
    expect(originals(await runObjects(`${COMPANY_A}/${projectId}`))).toHaveLength(N);
    expect(storagePosts, 'the retry uploaded nothing').toHaveLength(N);
    expect(await expensesByRun(), 'still exactly one expense').toHaveLength(1);

    // What createExpense wrote besides the expense: ONE allocation, the full
    // amount, on the project's EXISTING Miscellaneous line.
    const { data: allocs, error: allocErr } = await admin
      .from('expense_allocations')
      .select('budget_item_id, amount')
      .eq('expense_id', expenseId);
    expect(allocErr).toBeNull();
    const allocRows = (allocs ?? []) as { budget_item_id: string; amount: number | string }[];
    expect(allocRows).toHaveLength(1);
    expect(allocRows[0].budget_item_id).toBe(miscLineId);
    expect(Number(allocRows[0].amount)).toBe(AMOUNT);
  });
});
