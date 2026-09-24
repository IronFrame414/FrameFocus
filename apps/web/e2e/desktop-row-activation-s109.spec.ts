import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { OWNER, signIn } from './chat-fixture';

// S109 #163 — the WHOLE ROW opens the item, through the one shared primitive
// (`components/list-screen/row-activation.tsx`). Ruling 163.C: prove the traps
// in a real browser — no jsdom.
//
//   T3  the row is a real control: focus it, press Enter, the item opens.
//   T1  a control INSIDE the row owns its own click and its own Enter: Clone
//       opens the clone dialog and the page does NOT navigate to the estimate.
//   T2  the line-items drag handle: CLICKING it to focus (the documented
//       keyboard / touch reorder path, `items-tab.tsx:241-249`) opens nothing,
//       and ↓ still reorders. A card-level click handler would break this; the
//       line card has none, and this is the test that fails if one is added.
//
//   ⚠️ [S110 D2] T2's "handle focused" is CHROMIUM EVIDENCE ONLY. Chromium
//   focuses a <button> on mousedown by itself; Safari/Firefox on macOS do not,
//   and on Josh's machine click-then-↓ did nothing while this passed. T2 still
//   guards what it was written for (no card-level click), but the focus claim
//   is carried by desktop-line-rows-s110 R2 (synthetic mousedown, which no
//   browser focuses by default) and s110-line-rows.test.ts.
//
// Own fixture: one draft estimate, one category, two lines, removed in afterAll.
// (Pattern: `desktop-line-items-s108.spec.ts`.)

const MARKER = 'S109ROW-E2E';
const admin = adminClient();
let estimateId = '';
let catId = '';
const line: Record<string, string> = {};

test.beforeAll(async () => {
  const { data: stale } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  for (const e of stale ?? []) {
    await admin.from('estimate_line_items').delete().eq('estimate_id', e.id);
    await admin.from('estimate_categories').delete().eq('estimate_id', e.id);
    await admin.from('estimates').delete().eq('id', e.id);
  }
  const { data: owner } = await admin
    .from('profiles')
    .select('user_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
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
  const { data: cat } = await admin
    .from('estimate_categories')
    .insert({ company_id: COMPANY_A, estimate_id: estimateId, name: `${MARKER} Alpha`, sort_order: 1 })
    .select('id')
    .single();
  catId = cat!.id;
  for (const [key, sort] of [['a1', 1], ['a2', 2]] as const) {
    const { data } = await admin
      .from('estimate_line_items')
      .insert({ company_id: COMPANY_A, estimate_id: estimateId, category_id: catId, name: `${MARKER} ${key}`, sort_order: sort })
      .select('id')
      .single();
    line[key] = data!.id;
  }
});

test.afterAll(async () => {
  if (!estimateId) return;
  await admin.from('estimate_line_items').delete().eq('estimate_id', estimateId);
  await admin.from('estimate_categories').delete().eq('estimate_id', estimateId);
  await admin.from('estimates').delete().eq('id', estimateId);
});

test('T3 — the estimates row is a real control: focus + Enter opens the estimate', async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto('/dashboard/estimates');
  const row = page.getByTestId(`estimate-row-${estimateId}`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveAttribute('role', 'button');
  await expect(row).toHaveAttribute('tabindex', '0');
  await expect(row).toHaveAttribute('aria-label', `Open ${MARKER} estimate`);
  await row.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(new RegExp(`/dashboard/estimates/${estimateId}$`), { timeout: 30_000 });
});

test('T3 — a click on an inert cell (not the name) opens the estimate', async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto('/dashboard/estimates');
  const row = page.getByTestId(`estimate-row-${estimateId}`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  // The status cell: dead space before S109.
  await row.locator('td').nth(1).click();
  await page.waitForURL(new RegExp(`/dashboard/estimates/${estimateId}$`), { timeout: 30_000 });
});

test('T1 — Clone inside the row owns its click AND its Enter; the row does not open', async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto('/dashboard/estimates');
  const row = page.getByTestId(`estimate-row-${estimateId}`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  const listUrl = page.url();

  // Mouse.
  await row.getByRole('button', { name: 'Clone' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Clone .${MARKER} estimate.`) })).toBeVisible();
  await page.waitForTimeout(750); // a navigation would have started by now
  expect(page.url(), 'the row opened on top of Clone').toBe(listUrl);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Clone .${MARKER} estimate.`) })).toHaveCount(0);

  // Keyboard: Enter on the focused Clone button must reach the BUTTON.
  await row.getByRole('button', { name: 'Clone' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: new RegExp(`Clone .${MARKER} estimate.`) })).toBeVisible();
  await page.waitForTimeout(750);
  expect(page.url(), 'Enter on Clone bubbled to the row and opened it').toBe(listUrl);
  await page.getByRole('button', { name: 'Cancel' }).click();
});

test('T2 — CLICKING the drag handle opens nothing, and ↓ still reorders', async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto(`/dashboard/estimates/${estimateId}`);
  await page.getByText('Line Items', { exact: true }).first().click();
  await expect(page.getByTestId('est-health-strip')).toBeVisible({ timeout: 30_000 });
  const estimateUrl = page.url();

  // The documented path: click the handle to focus it, then use the arrows.
  await page.getByTestId(`line-handle-${line.a1}`).click();
  await page.waitForTimeout(750);
  expect(page.url(), 'clicking the handle navigated').toBe(estimateUrl);
  await expect(page.getByTestId(`line-handle-${line.a1}`)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('line-reorder-status')).toContainText('Moved', { timeout: 20_000 });
  expect(page.url()).toBe(estimateUrl);

  const { data: rows } = await admin
    .from('estimate_line_items')
    .select('id')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: true });
  expect(rows?.length, 'fixture rows').toBe(2);
  expect(rows!.map((r) => r.id), 'the keyboard reorder did not write').toEqual([line.a2, line.a1]);
});
