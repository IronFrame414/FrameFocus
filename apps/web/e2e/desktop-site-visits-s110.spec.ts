import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { OWNER, CREW, signIn } from './chat-fixture';

// ============================================================================
// S110 B [RULED Josh, Q5 → A] — A DESKTOP PATH TO SITE VISITS, without a URL.
// _Josh: "there is no path to access site visit on desktop."_
//
//   B1  a CREW member (not the recorder) clicks "Site visits" in the sidebar,
//       finds a visit someone else recorded, and opens it: the record renders
//       with add controls (Section A: every internal employee adds) and WITHOUT
//       the office's promote/abandon — and no money anywhere on the page
//   B2  the OWNER, same visit: the office actions are there
//   B3  the old /dashboard/estimates/site-visits/[id] URL still lands
//   B4  ⚠️ THE FLOOR in a browser: a PDF on the same estimate that was NOT
//       captured through the record never reaches the crew member
// Recording a visit stays on the phone [Q6 → B]: no "record" button here.
// ============================================================================

const MARKER = 'S110B-E2E';
const admin = adminClient();
let visitId = '';

async function sweep() {
  const { data } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = (data ?? []).map((e) => e.id);
  if (ids.length) {
    await admin.from('files').delete().in('estimate_id', ids);
    await admin.from('estimates').delete().in('id', ids);
  }
}

test.beforeAll(async () => {
  await sweep();
  const { data: owner } = await admin.from('profiles').select('user_id').eq('email', OWNER).eq('is_deleted', false).single();
  // Any contact will do; nothing depends on which. Ordered.
  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  // Recorded by the OWNER — so the crew member in B1 is NOT the recorder.
  const { data: est, error } = await admin
    .from('estimates')
    .insert({
      company_id: COMPANY_A, contact_id: contact!.id, name: `${MARKER} deck`, status: 'site_visit',
      estimate_number: null, created_by: owner!.user_id, updated_by: owner!.user_id, created_by_role: 'owner',
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  visitId = est!.id;
  const { error: svErr } = await admin.from('site_visits').insert({
    company_id: COMPANY_A, estimate_id: visitId, title: `${MARKER} deck`, contact_id: contact!.id,
    created_by: owner!.user_id, updated_by: owner!.user_id,
  });
  if (svErr) throw new Error(svErr.message);
  const { error: nErr } = await admin.from('site_visit_notes').insert({
    company_id: COMPANY_A, estimate_id: visitId, kind: 'condition', body: 'Joists rotted at the ledger',
    created_by: owner!.user_id, updated_by: owner!.user_id,
  });
  if (nErr) throw new Error(nErr.message);
  // A Files-tab PDF on the same estimate — NOT a capture (a vendor quote).
  const { error: fErr } = await admin.from('files').insert({
    company_id: COMPANY_A, project_id: null, estimate_id: visitId, category: 'other', site_visit_capture: false,
    file_name: `${MARKER}-vendor-quote.pdf`, file_path: `${COMPANY_A}/estimates/${visitId}/${MARKER}-quote.pdf`,
    file_size: 10, mime_type: 'application/pdf',
  });
  if (fErr) throw new Error(fErr.message);
});

test.afterAll(sweep);

test('B1 — crew: sidebar → Site visits → someone else\'s visit; adds, no office actions, no money', async ({ page }) => {
  await signIn(page, CREW);
  await page.goto('/dashboard');
  await page.locator('aside nav').getByRole('link', { name: 'Site visits' }).click();
  await expect(page).toHaveURL(/\/dashboard\/site-visits$/, { timeout: 30_000 });
  const row = page.getByTestId('desktop-site-visit-row').filter({ hasText: `${MARKER} deck` });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/record a site visit/i), 'desktop offers recording (Q6 says phone only)').toHaveCount(0);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/site-visits/${visitId}$`), { timeout: 30_000 });
  const record = page.getByTestId('site-visit-record');
  await expect(record.locator('[data-testid="sv-note"][data-kind="condition"]')).toContainText('Joists rotted');
  await expect(record.getByTestId('sv-add-condition')).toHaveCount(1);
  await expect(page.getByTestId('sv-promote')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('$');
});

test('B2 — owner: the same page carries the office actions', async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto(`/dashboard/site-visits/${visitId}`);
  await expect(page.getByTestId('site-visit-record')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('sv-promote')).toHaveCount(1);
});

test('B3 — the old /dashboard/estimates/site-visits/[id] URL still lands on the record', async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto(`/dashboard/estimates/site-visits/${visitId}`);
  await expect(page).toHaveURL(new RegExp(`/dashboard/site-visits/${visitId}$`), { timeout: 30_000 });
});

test('B4 — ⚠️ THE FLOOR: the estimate\'s non-captured PDF never reaches the crew member', async ({ page }) => {
  await signIn(page, CREW);
  await page.goto(`/dashboard/site-visits/${visitId}`);
  await expect(page.getByTestId('site-visit-record')).toBeVisible({ timeout: 30_000 });
  const res = await page.evaluate(async (id) => {
    const r = await fetch(`/api/estimates/${id}/files`);
    return { status: r.status, body: await r.json() };
  }, visitId);
  expect(res.status).toBe(200);
  const names = (res.body.files as Array<{ file_name: string }>).map((f) => f.file_name);
  expect(names, 'a crew member received a non-captured estimate file').not.toContain(`${MARKER}-vendor-quote.pdf`);
  // CONTROL: the owner DOES receive it (so the absence above is the floor, not a missing row).
  await signIn(page, OWNER);
  await page.goto(`/dashboard/site-visits/${visitId}`);
  const own = await page.evaluate(async (id) => (await (await fetch(`/api/estimates/${id}/files`)).json()) as { files: Array<{ file_name: string }> }, visitId);
  expect(own.files.map((f) => f.file_name)).toContain(`${MARKER}-vendor-quote.pdf`);
});
