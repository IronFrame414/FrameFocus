import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { OWNER, signIn } from './chat-fixture';

// S108 Spec B — the Line Items tab, which NO spec drove before (FILL-B2:
// "nothing covers this screen today"). Two things are asserted:
//
//   1. The RULED button set is on the screen — including "+ Add Line", which
//      the design mockup omits and the ruling KEEPS. A future pass that
//      "matches the mockup" by deleting it fails here.
//   2. The keyboard reorder (the drag alternative, FILL-B10) really writes:
//      ↓ on a line's handle moves it across a category boundary, read back
//      from the DATABASE, not from the DOM.
//
// Own fixture: one draft estimate, two categories, three lines, built through
// the service role with explicit created_by / created_by_role / number (so no
// company sequence is burned), removed in afterAll.

const MARKER = 'S108B-E2E';
const admin = adminClient();
let estimateId = '';
const cat: Record<string, string> = {};
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
  for (const [key, name, sort] of [['A', 'Alpha', 1], ['B', 'Bravo', 2]] as const) {
    const { data } = await admin
      .from('estimate_categories')
      .insert({ company_id: COMPANY_A, estimate_id: estimateId, name: `${MARKER} ${name}`, sort_order: sort })
      .select('id')
      .single();
    cat[key] = data!.id;
  }
  for (const [key, c, sort] of [['a1', 'A', 1], ['a2', 'A', 2], ['b1', 'B', 3]] as const) {
    const { data } = await admin
      .from('estimate_line_items')
      .insert({ company_id: COMPANY_A, estimate_id: estimateId, category_id: cat[c], name: `${MARKER} ${key}`, sort_order: sort })
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

test('S108 B — the ruled buttons, and ↓ on a handle moves a line across a category', async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto(`/dashboard/estimates/${estimateId}`);
  await page.getByText('Line Items', { exact: true }).first().click();
  await expect(page.getByTestId('est-health-strip')).toBeVisible({ timeout: 30_000 });

  // 1. The ruled set, per category header — "+ Add Line" STAYS.
  await expect(page.getByRole('button', { name: '+ Subcategory' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: '+ Add Line' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: '+ Add Subcategory' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete category' })).toHaveCount(2);
  await expect(page.getByTestId('est-health-profit')).toBeVisible();

  // 2. a2 is the LAST line of Alpha; ↓ moves it to the START of Bravo.
  await page.getByTestId(`line-handle-${line.a2}`).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('line-reorder-status')).toContainText('Moved', { timeout: 20_000 });

  const { data: rows } = await admin
    .from('estimate_line_items')
    .select('id, category_id, sort_order')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: true });
  expect(rows?.length).toBe(3);
  const a2 = rows!.find((r) => r.id === line.a2)!;
  expect(a2.category_id, 'the line did not move into Bravo').toBe(cat.B);
  // Display order is now a1 | a2, b1 — a2 ahead of b1 inside Bravo.
  expect(rows!.map((r) => r.id)).toEqual([line.a1, line.a2, line.b1]);
});
