import { test, expect } from '@playwright/test';
import { adminClient } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S108 Spec A — the site visit through the REAL UI, end to end:
//   crew records a visit on the phone (existing contact, address later) →
//   adds a condition and a 12 × 14 measurement → the OWNER promotes it on the
//   desktop page → the crew member, back on the phone, still reads it, can no
//   longer write, and is shown no dollar figure anywhere on the screen.
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

  // ── OWNER: promote on desktop ─────────────────────────────────────────
  await signInAs(page, OWNER);
  await page.goto(`/dashboard/estimates/site-visits/${visitId}`);
  await page.getByTestId('sv-promote').click();
  await page.getByTestId('confirm-accept').click();
  await page.waitForURL(new RegExp(`/dashboard/estimates/${visitId}$`), { timeout: 60_000 });
  const { data: est } = await admin.from('estimates').select('status, estimate_number').eq('id', visitId).single();
  expect(est!.status).toBe('draft');
  expect(est!.estimate_number).toBeTruthy();

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
