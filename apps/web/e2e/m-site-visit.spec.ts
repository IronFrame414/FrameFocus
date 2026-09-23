import { test, expect } from '@playwright/test';
import { adminClient } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S108 Spec A — the site visit through the REAL UI, end to end:
//   crew records a visit on the phone (existing contact, address later) →
//   adds a condition and a 12 × 14 measurement → [S108 follow-up] taps FINISH,
//   which must NOT promote it → the OWNER promotes it on the desktop page →
//   [S108 follow-up] the estimate's Site Visit tab shows what was captured →
//   the crew member, back on the phone, still reads it, can no longer write,
//   and is shown no dollar figure anywhere on the screen.
//
// The database half (money on the wire, counts, refusals) is proven in
// test/s108-site-visit.live.ts; this proves the screens drive it.
// Runs in chromium-auth (m-*.spec.ts): the stored identity is the CREW member.

const MARKER = 'S108A-E2E';
const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const admin = adminClient();

async function sweep() {
  const { data } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = (data ?? []).map((e) => e.id);
  if (!ids.length) return;
  await admin.from('notifications').delete().eq('type', 'site_visit_recorded').in('source_id', ids);
  await admin.from('files').delete().in('estimate_id', ids);
  await admin.from('estimates').delete().in('id', ids); // cascades the site_visit_* rows
}

test.beforeAll(sweep);
test.afterAll(sweep);

test('S108 A — crew records, owner promotes, crew keeps reading with no money and no writes', async ({ page }) => {
  test.setTimeout(180_000);

  // ── CREW: record ──────────────────────────────────────────────────────
  await page.goto('/m/field');
  await page.getByTestId('m-field-site-visits').click();
  await page.getByTestId('m-site-visit-new').click();
  await page.getByTestId('m-sv-title').fill(`${MARKER} kitchen`);
  await page.getByTestId('m-sv-contact-mode-existing').click();
  const contact = page.getByTestId('m-sv-contact');
  await contact.selectOption({ index: 1 });
  await page.getByTestId('m-sv-address-mode-none').click();
  await page.getByTestId('m-sv-submit').click();
  await page.waitForURL(/\/m\/site-visits\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const visitId = page.url().split('/').pop()!;

  await page.getByTestId('sv-new-condition').fill('Tile is cracked, subfloor may be soft');
  await page.getByTestId('sv-add-condition').click();
  await expect(page.locator('[data-testid="sv-note"][data-kind="condition"]')).toHaveCount(1, { timeout: 20_000 });

  await page.getByTestId('sv-m-area').fill('Kitchen');
  await page.getByTestId('sv-m-length').fill('12');
  await page.getByTestId('sv-m-width').fill('14');
  await expect(page.getByTestId('sv-m-add')).toContainText('168 sq ft');
  await page.getByTestId('sv-m-add').click();
  await expect(page.getByTestId('sv-measurement')).toContainText('168 sq ft', { timeout: 20_000 });

  // The office was told (ASK-A4).
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'site_visit_recorded')
    .eq('source_id', visitId);
  expect(count ?? 0).toBeGreaterThan(0);

  // ── CREW: FINISH — the recorder's "done", which is NOT promotion ──────
  await page.getByTestId('sv-finish-start').click();
  await page.getByTestId('sv-finish-confirm').click();
  await expect(page.getByTestId('sv-finished-banner')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('sv-finish')).toHaveCount(0);
  // Still writable after finishing (ASK-A8 — finish is a signal, not a lock).
  await expect(page.getByTestId('sv-add-condition')).toHaveCount(1);
  const { data: fin } = await admin.from('estimates').select('status, estimate_number').eq('id', visitId).single();
  expect(fin, 'FINISH PROMOTED THE VISIT').toMatchObject({ status: 'site_visit', estimate_number: null });
  // Navigating away promotes nothing either — the field defect's exact gesture.
  await page.goto('/m/site-visits');
  await expect(
    page.getByTestId('m-site-visit-row').filter({ has: page.locator(`a[href$="${visitId}"]`) })
  ).toHaveAttribute('data-finished', 'true', { timeout: 30_000 });
  const { data: away } = await admin.from('estimates').select('status, estimate_number').eq('id', visitId).single();
  expect(away).toMatchObject({ status: 'site_visit', estimate_number: null });

  // ── OWNER: promote on desktop ─────────────────────────────────────────
  await signInAs(page, OWNER);
  await page.goto(`/dashboard/estimates/site-visits/${visitId}`);
  await expect(page.getByTestId('sv-office-state')).toContainText('Finished');
  await page.getByTestId('sv-promote').click();
  await page.getByTestId('confirm-accept').click();
  await page.waitForURL(new RegExp(`/dashboard/estimates/${visitId}$`), { timeout: 60_000 });
  const { data: est } = await admin.from('estimates').select('status, estimate_number').eq('id', visitId).single();
  expect(est!.status).toBe('draft');
  expect(est!.estimate_number).toBeTruthy();

  // ── OWNER: the estimate shows what was captured (Site Visit tab) ──────
  await page.getByTestId('est-tab-site_visit').click();
  const tab = page.getByTestId('est-site-visit-tab');
  await expect(tab.locator('[data-testid="sv-note"][data-kind="condition"]')).toContainText('Tile is cracked', { timeout: 30_000 });
  await expect(tab.getByTestId('sv-measurement')).toContainText('12 × 14 ft = 168 sq ft');
  await expect(tab).toContainText('finished');

  // ── CREW again: reads, cannot write, sees no money ────────────────────
  await signInAs(page, CREW);
  await page.goto(`/m/site-visits/${visitId}`);
  await expect(page.getByTestId('sv-promoted-banner')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="sv-note"][data-kind="condition"]')).toHaveCount(1);
  await expect(page.getByTestId('sv-measurement')).toHaveCount(1);
  await expect(page.getByTestId('sv-add-condition')).toHaveCount(0);
  await expect(page.getByTestId('sv-photo-input')).toHaveCount(0);
  await expect(page.getByTestId('site-visit-record')).not.toContainText('$');
});

test('S108 follow-up — an estimate that never was a site visit has NO Site Visit tab', async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, OWNER);
  const { data: owner } = await admin.from('profiles').select('company_id').eq('email', OWNER).eq('is_deleted', false).single();
  const { data: visits } = await admin.from('site_visits').select('estimate_id');
  const exclude = (visits ?? []).map((v) => v.estimate_id);
  // Scoped, not arbitrary: it must be the owner's company, a live draft, and
  // NOT a promoted visit — the property the assertion depends on.
  let q = admin
    .from('estimates')
    .select('id')
    .eq('company_id', (owner as { company_id: string }).company_id)
    .eq('is_deleted', false)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(1);
  if (exclude.length) q = q.not('id', 'in', `(${exclude.join(',')})`);
  const { data: plain } = await q;
  expect(plain ?? [], 'no plain draft estimate to test against').toHaveLength(1);
  await page.goto(`/dashboard/estimates/${plain![0].id}`);
  await expect(page.getByTestId('est-tab-items')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('est-tab-site_visit')).toHaveCount(0);
});
