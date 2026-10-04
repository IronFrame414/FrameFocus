import { test, expect, type Locator, type Page } from '@playwright/test';
import { adminClient } from './hub-fixture';
import { signIn, OWNER } from './chat-fixture';

// ============================================================================
// S128 1a — Part B (docs/specs/estimates-and-change-orders-spec.md), in the editor.
// [Josh, 2026-10-03] "the number manually entered always wins on estimates and
// change orders." / "leave manual total when the cost changes but change the
// text to red."
//
// Each step drives the real grid and then reads the ROW through the service
// role — the database, not the render, is the proof nothing moved the typed
// figure. Serial: each step starts from the state the last one left.
// ============================================================================

test.describe.configure({ mode: 'serial' });

const MARKER = 'E2ES128MT';
const AFTER_POST = { timeout: 20_000 };

let companyId: string;
let estimateId: string;
let rowId: string;

async function sweep(): Promise<void> {
  const admin = adminClient();
  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = (ests ?? []).map((e) => e.id);
  if (ids.length) {
    const { error } = await admin.from('estimates').delete().in('id', ids);
    if (error) throw new Error(`sweep: ${error.message}`);
  }
}

async function readRow() {
  const { data, error } = await adminClient()
    .from('estimate_line_rows')
    .select('amount, total, markup_percent, total_override, total_override_basis')
    .eq('id', rowId)
    .single();
  if (error) throw new Error(error.message);
  return data!;
}

function row(page: Page): Locator {
  return page.locator(`tr[data-row-id="${rowId}"]`);
}

async function openItems(page: Page): Promise<void> {
  await signIn(page, OWNER);
  await page.goto(`/dashboard/estimates/${estimateId}`);
  await page.getByTestId('est-tab-items').click();
  // A page that never rendered cannot pass: the fixture row must be on screen.
  await expect(row(page)).toBeVisible();
}

test.beforeAll(async () => {
  const admin = adminClient();
  await sweep();
  const { data: company } = await admin
    .from('companies')
    .select('id')
    .eq('name', 'Sabal Point Construction')
    .single();
  companyId = company!.id;
  const { data: ct } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('id')
    .limit(1)
    .single();

  const { data: est, error: eErr } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      contact_id: ct!.id,
      name: `${MARKER} estimate`,
      status: 'draft',
      estimate_number: 'EST-E2ES128MT',
      created_by_role: 'owner',
      contract_type: 'fixed_price',
      pricing_mode: 'markup',
      subcontractor_markup_percent: 20,
      tax_rate: 0,
    })
    .select('id')
    .single();
  if (eErr) throw new Error(`estimate: ${eErr.message}`);
  estimateId = est!.id;
  const { data: cat, error: cErr } = await admin
    .from('estimate_categories')
    .insert({
      company_id: companyId,
      estimate_id: estimateId,
      name: `${MARKER} category`,
      sort_order: 0,
    })
    .select('id')
    .single();
  if (cErr) throw new Error(`category: ${cErr.message}`);
  const { data: line, error: lErr } = await admin
    .from('estimate_line_items')
    .insert({
      company_id: companyId,
      estimate_id: estimateId,
      category_id: cat!.id,
      name: `${MARKER} Drywall Repair and Trim`,
      sort_order: 0,
      total_price: 720,
    })
    .select('id')
    .single();
  if (lErr) throw new Error(`line: ${lErr.message}`);
  const { data: r, error: rErr } = await admin
    .from('estimate_line_rows')
    .insert({
      company_id: companyId,
      line_item_id: line!.id,
      row_type: 'other',
      name: 'Drywall',
      sort_order: 0,
      amount: 600,
      apply_tax: false,
      total: 720,
    })
    .select('id')
    .single();
  if (rErr) throw new Error(`row: ${rErr.message}`);
  rowId = r!.id;
});

test.afterAll(async () => {
  await sweep();
});

test('1 · typing $722.98 stores it; the derived markup reads 20.50%, never the raw float', async ({
  page,
}) => {
  await openItems(page);
  const before = await readRow();
  expect(before.total_override).toBeNull();

  await row(page).getByTestId('row-total').locator('span[title]').last().click();
  const input = row(page).getByTestId('row-total').locator('input');
  await input.fill('722.98');
  await input.press('Enter');

  await expect.poll(async () => (await readRow()).total_override, AFTER_POST).toBe(722.98);
  // The recompute runs after the save; wait for it rather than racing it.
  await expect.poll(async () => Number((await readRow()).total), AFTER_POST).toBe(722.98);
  const after = await readRow();
  expect(after.markup_percent).toBeNull();
  expect(Number(after.total_override_basis)).toBe(600);
  expect(Number(after.total)).toBe(722.98);

  const markupCell = row(page).getByTestId('row-markup');
  await expect(markupCell).toHaveText('20.50%');
  await expect(markupCell).not.toContainText('20.4966');
  await expect(row(page).getByTestId('row-total')).toContainText('$722.98');
  await expect(row(page).getByTestId('row-total')).not.toHaveAttribute('data-stale', 'true');
});

test('2 · opening the markup cell and leaving it saves NOTHING — $722.98 never becomes $723.00', async ({
  page,
}) => {
  await openItems(page);
  const markupCell = row(page).getByTestId('row-markup');
  await markupCell.locator('span').first().click();
  const input = markupCell.locator('input');
  await expect(input).toHaveValue('20.50');
  await input.blur();

  // Nothing to wait FOR in a no-op: give a save every chance, then read the row.
  await page.waitForTimeout(AFTER_POST.timeout / 4);
  const r = await readRow();
  expect(r.total_override, 'leaving the cell released the typed total').toBe(722.98);
  expect(r.markup_percent, 'leaving the cell stored the rounded markup').toBeNull();
  expect(Number(r.total)).toBe(722.98);
});

test('3 · a cost change: the typed total HOLDS and turns red, with a title saying why', async ({
  page,
}) => {
  await openItems(page);
  await row(page).getByTestId('row-price').locator('span[title]').first().click();
  const input = row(page).getByTestId('row-price').locator('input');
  await input.fill('700');
  await input.press('Enter');

  await expect.poll(async () => Number((await readRow()).amount), AFTER_POST).toBe(700);
  const r = await readRow();
  expect(r.total_override).toBe(722.98);
  expect(Number(r.total)).toBe(722.98);

  const total = row(page).getByTestId('row-total');
  await expect(total).toHaveAttribute('data-stale', 'true');
  await expect(total).toHaveCSS('color', 'rgb(220, 38, 38)');
  await expect(total).toHaveAttribute('title', /cost has changed since/);
  await expect(total).toContainText('$722.98');
});

test('4 · "↺" releases it: back to calculated at the markup the typed total implied (20.50%)', async ({
  page,
}) => {
  await openItems(page);
  const release = row(page).getByRole('button', { name: 'Revert to the computed total' });
  await expect(release).toHaveAttribute('title', /cost × 20\.50%/);
  await release.click();

  await expect.poll(async () => (await readRow()).total_override, AFTER_POST).toBeNull();
  await expect.poll(async () => Number((await readRow()).total), AFTER_POST).toBe(843.5);
  const r = await readRow();
  expect(r.total_override_basis).toBeNull();
  expect(Number(r.markup_percent)).toBe(20.5);
  // 700 × 1.205 — the person chose to recalculate, and the title said so first.
  expect(Number(r.total)).toBe(843.5);
  await expect(row(page).getByTestId('row-total')).not.toHaveAttribute('data-stale', 'true');
  await expect(release).toHaveCount(0);
});
