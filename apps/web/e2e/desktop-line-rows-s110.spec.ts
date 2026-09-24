import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { OWNER, signIn } from './chat-fixture';

// ============================================================================
// S110 D — the ROWS inside a line reorder, and a grip is focusable by mouse in
// every browser.
//
//   R1  a row grip, focused by a SYNTHETIC mousedown, moves its row with ↑; the
//       database reads the new order.
//   R2  the same for the LINE grip (D2's defect).
//
// ⚠️ WHY SYNTHETIC. S109's T2 clicked with a real Chromium mouse and asserted
// "focused". Chromium focuses a button on mousedown by itself; Safari and
// Firefox on macOS do not — so T2 measured Chromium, not the handle, and Josh's
// click-then-arrow did nothing. A dispatched mousedown is untrusted and NO
// browser focuses on it by default, so only the handle's own onMouseDown can
// make these pass. That is the thing being judged.
// ============================================================================

const MARKER = 'S110ROWS-E2E';
const admin = adminClient();
let estimateId = '';
const line: Record<string, string> = {};
const row: Record<string, string> = {};

async function sweep() {
  const { data: stale } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  for (const e of stale ?? []) {
    const { data: lines } = await admin.from('estimate_line_items').select('id').eq('estimate_id', e.id);
    const ids = (lines ?? []).map((l) => l.id);
    if (ids.length) await admin.from('estimate_line_rows').delete().in('line_item_id', ids);
    await admin.from('estimate_line_items').delete().eq('estimate_id', e.id);
    await admin.from('estimate_categories').delete().eq('estimate_id', e.id);
    await admin.from('estimates').delete().eq('id', e.id);
  }
}

test.beforeAll(async () => {
  await sweep();
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
  for (const [key, sort] of [['a1', 1], ['a2', 2]] as const) {
    const { data } = await admin
      .from('estimate_line_items')
      .insert({ company_id: COMPANY_A, estimate_id: estimateId, category_id: cat!.id, name: `${MARKER} ${key}`, sort_order: sort })
      .select('id')
      .single();
    line[key] = data!.id;
  }
  for (const [key, sort] of [['r1', 1], ['r2', 2], ['r3', 3]] as const) {
    const { data, error: rowErr } = await admin
      .from('estimate_line_rows')
      .insert({
        company_id: COMPANY_A,
        line_item_id: line.a1,
        row_type: 'labor',
        name: `${MARKER} ${key}`,
        sort_order: sort,
        rate: 1,
        quantity: 1,
        apply_tax: false,
      })
      .select('id')
      .single();
    if (rowErr) throw new Error(rowErr.message);
    row[key] = data!.id;
  }
});

test.afterAll(async () => {
  await sweep();
});

async function openItems(page: import('@playwright/test').Page) {
  await signIn(page, OWNER);
  await page.goto(`/dashboard/estimates/${estimateId}`);
  await page.getByText('Line Items', { exact: true }).first().click();
  await expect(page.getByTestId('est-health-strip')).toBeVisible({ timeout: 30_000 });
}

test('R1 — a ROW grip, focused by a synthetic mousedown, moves its row with ↑', async ({ page }) => {
  await openItems(page);
  const grip = page.getByTestId(`row-handle-${row.r3}`);
  await expect(grip).toBeVisible();
  await page.locator('body').focus();
  await expect(grip).not.toBeFocused();
  await grip.dispatchEvent('mousedown');
  await expect(grip, 'the grip did not focus itself on mousedown').toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('line-reorder-status')).toContainText('Moved', { timeout: 20_000 });

  const { data } = await admin
    .from('estimate_line_rows')
    .select('id, sort_order')
    .eq('line_item_id', line.a1)
    .order('sort_order', { ascending: true });
  expect(data?.length, 'fixture rows').toBe(3);
  expect(data!.map((r) => r.id), 'the keyboard row reorder did not write').toEqual([row.r1, row.r3, row.r2]);
  expect(data!.map((r) => r.sort_order)).toEqual([1, 2, 3]);
});

test('R2 — the LINE grip, focused by a synthetic mousedown, moves its line with ↓', async ({ page }) => {
  await openItems(page);
  const grip = page.getByTestId(`line-handle-${line.a1}`);
  await page.locator('body').focus();
  await expect(grip).not.toBeFocused();
  await grip.dispatchEvent('mousedown');
  await expect(grip, 'the line grip did not focus itself on mousedown').toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('line-reorder-status')).toContainText('Moved', { timeout: 20_000 });

  const { data } = await admin
    .from('estimate_line_items')
    .select('id')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: true });
  expect(data?.length, 'fixture lines').toBe(2);
  expect(data!.map((r) => r.id)).toEqual([line.a2, line.a1]);
});
