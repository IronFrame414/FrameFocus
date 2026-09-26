import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { OWNER, signIn } from './chat-fixture';
import { withThumbnails } from './storage-cleanup';

// S109 #161 — a file opens in a SHEET over the current screen, with new tab /
// print / download on it. Driven on the ESTIMATE Files tab, because that tab is
// also ruling 161.B's second half: it used to sign every link for 300 s at LIST
// time, so a click after five minutes was dead. Now the click signs.
//
//   S1  PDF: the sheet opens over the tab (URL unchanged), pdf.js renders the
//       page, the actions are present, and the click — not the list — signed.
//   S2  the LIST carries no URL at all (the 300 s bug cannot come back
//       silently).
//   S3  Escape closes it and focus RETURNS to the row (never lose your place).
//   S4  an image renders as an <img> that actually decoded.
//   S5  a Word document gets the no-preview panel — with the same actions.
//
// Own fixture: one draft estimate + three stored files, all removed in afterAll.

const MARKER = 'S109SHEET-E2E';
const BUCKET = 'project-files';
const admin = adminClient();
let estimateId = '';
const fileIds: Record<'pdf' | 'png' | 'docx', string> = { pdf: '', png: '', docx: '' };
const paths: string[] = [];

// A one-page PDF with a line of text. pdf.js rebuilds a missing xref, so the
// table is omitted rather than hand-computed.
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    '4 0 obj<</Length 44>>stream\nBT /F1 24 Tf 72 700 Td (S109 sheet) Tj ET\nendstream endobj\n' +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n'
);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2P8z8Dwn4GKgIlqJo0aOGrgqIHDwEAAaSgDBaMLcOgAAAAASUVORK5CYII=',
  'base64'
);
const DOCX = Buffer.from('not really a word document — the sheet must not try to render it');

async function seedFile(kind: 'pdf' | 'png' | 'docx', name: string, mime: string, bytes: Buffer, ownerUserId: string) {
  const path = `${COMPANY_A}/estimates/${estimateId}/${MARKER}-${name}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
  if (upErr) throw new Error(`upload ${name}: ${upErr.message}`);
  paths.push(path);
  const { data, error } = await admin
    .from('files')
    .insert({
      company_id: COMPANY_A,
      project_id: null,
      estimate_id: estimateId,
      category: 'other',
      file_name: `${MARKER} ${name}`,
      file_path: path,
      file_size: bytes.length,
      mime_type: mime,
      created_by: ownerUserId,
      updated_by: ownerUserId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`files row ${name}: ${error.message}`);
  fileIds[kind] = data!.id;
}

test.beforeAll(async () => {
  const { data: stale } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  for (const e of stale ?? []) {
    await admin.from('files').delete().eq('estimate_id', e.id);
    await admin.from('estimates').delete().eq('id', e.id);
  }
  const { data: owner } = await admin.from('profiles').select('user_id').eq('email', OWNER).eq('is_deleted', false).single();
  // Any contact in the company will do; nothing depends on which. Ordered.
  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  const { data: est, error } = await admin
    .from('estimates')
    .insert({
      company_id: COMPANY_A,
      contact_id: contact!.id,
      name: `${MARKER} estimate`,
      estimate_number: `${MARKER}-1`,
      status: 'draft',
      created_by: owner!.user_id,
      updated_by: owner!.user_id,
      created_by_role: 'owner',
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  estimateId = est!.id;
  await seedFile('pdf', 'plans.pdf', 'application/pdf', PDF, owner!.user_id);
  await seedFile('png', 'site.png', 'image/png', PNG, owner!.user_id);
  await seedFile('docx', 'spec.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', DOCX, owner!.user_id);
});

test.afterAll(async () => {
  if (paths.length) await admin.storage.from(BUCKET).remove(withThumbnails(paths));
  if (estimateId) {
    await admin.from('files').delete().eq('estimate_id', estimateId);
    await admin.from('estimates').delete().eq('id', estimateId);
  }
});

async function openFilesTab(page: import('@playwright/test').Page) {
  await signIn(page, OWNER);
  await page.goto(`/dashboard/estimates/${estimateId}`);
  await page.getByText('Files', { exact: true }).first().click();
  await expect(page.getByTestId(`estimate-file-row-${fileIds.pdf}`)).toBeVisible({ timeout: 30_000 });
}

test('S1 — a PDF opens in the sheet over the tab, rendered, signed on CLICK', async ({ page }) => {
  await openFilesTab(page);
  const before = page.url();
  const [signReq] = await Promise.all([
    page.waitForRequest((r) => r.url().includes(`/files/${fileIds.pdf}/url`)),
    page.getByTestId(`estimate-file-row-${fileIds.pdf}`).click(),
  ]);
  expect((await signReq.response())?.status()).toBe(200);
  const sheet = page.getByTestId('file-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('role', 'dialog');
  await expect(sheet).toHaveAttribute('aria-modal', 'true');
  expect(page.url(), 'the page navigated away').toBe(before);
  // pdf.js loaded the document and drew page 1.
  await expect(page.getByTestId('file-sheet-pdf')).toHaveAttribute('data-pages', '1', { timeout: 30_000 });
  await expect(page.getByRole('img', { name: 'Page 1 of 1' }).or(page.locator('canvas[aria-label="Page 1 of 1"]'))).toBeVisible();
  // The three actions.
  const newTab = page.getByTestId('file-sheet-new-tab');
  await expect(newTab).toHaveAttribute('target', '_blank');
  expect(await newTab.getAttribute('href')).toContain('/storage/v1/object/sign/');
  expect(await page.getByTestId('file-sheet-download').getAttribute('href')).toContain('download=');
  await expect(page.getByTestId('file-sheet-print')).toBeVisible();
});

test('S2 — the estimate files LIST carries no URL (161.B: nothing signed at load)', async ({ page }) => {
  await openFilesTab(page);
  const body = await page.evaluate(async (id) => (await fetch(`/api/estimates/${id}/files`)).json(), estimateId);
  const files = (body as { files: Record<string, unknown>[] }).files;
  expect(files.length, 'fixture rows').toBe(3);
  for (const f of files) {
    expect(f, 'the list signed a URL again').not.toHaveProperty('url');
    expect(f).not.toHaveProperty('file_path');
  }
});

test('S3 — Escape closes the sheet and focus returns to the row', async ({ page }) => {
  await openFilesTab(page);
  const row = page.getByTestId(`estimate-file-row-${fileIds.pdf}`);
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('file-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('file-sheet')).toHaveCount(0);
  await expect(row).toBeFocused();
});

test('S4 — an image renders, and actually decoded', async ({ page }) => {
  await openFilesTab(page);
  await page.getByTestId(`estimate-file-row-${fileIds.png}`).click();
  const img = page.getByTestId('file-sheet-image');
  await expect(img).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0);
});

test('S5 — a Word document gets the no-preview panel, with the same actions', async ({ page }) => {
  await openFilesTab(page);
  await page.getByTestId(`estimate-file-row-${fileIds.docx}`).click();
  await expect(page.getByTestId('file-sheet-no-preview')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('file-sheet-new-tab')).toBeVisible();
  await expect(page.getByTestId('file-sheet-download')).toBeVisible();
  await expect(page.getByTestId('file-sheet-print'), 'print offered for a file it cannot print').toHaveCount(0);
});
