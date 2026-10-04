import { test, expect, type Page } from '@playwright/test';
import { adminClient } from './hub-fixture';
import { signIn, OWNER } from './chat-fixture';

// ============================================================================
// S128 Parts A + C — the line detail sheet, on the estimate grid.
// C-1 [Josh] "i should be able to click each line item to pop up the full detail
//   on a sheet and edit it." It ADDS to inline editing (reading taken).
// C-2 [Josh] "when clicking 'add line' on a category that already has line items
//   added, the existing line items should be listed in the sheet that opens."
//   Reading taken, never confirmed: the list is LIVE — an entry opens its detail.
// A-1 A blank description renders nothing: no box, no placeholder in the grid.
// Every write is read back through the service role.
// ============================================================================

test.describe.configure({ mode: 'serial' });

const MARKER = 'E2ES128LS';
const AFTER_POST = { timeout: 20_000 };
let estimateId: string;
let categoryId: string;
let laborRowId: string;
let materialRowId: string;

async function sweep(): Promise<void> {
  const admin = adminClient();
  const { data } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = (data ?? []).map((e) => e.id);
  if (ids.length) {
    const { error } = await admin.from('estimates').delete().in('id', ids);
    if (error) throw new Error(`sweep: ${error.message}`);
  }
}

async function readRow(id: string) {
  const { data, error } = await adminClient()
    .from('estimate_line_rows')
    .select('name, rate, quantity, total, description')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data!;
}

async function openItems(page: Page): Promise<void> {
  await signIn(page, OWNER);
  await page.goto(`/dashboard/estimates/${estimateId}`);
  await page.getByTestId('est-tab-items').click();
  await expect(page.locator(`tr[data-row-id="${laborRowId}"]`)).toBeVisible();
}

test.beforeAll(async () => {
  const admin = adminClient();
  await sweep();
  const { data: company } = await admin
    .from('companies')
    .select('id')
    .eq('name', 'Sabal Point Construction')
    .single();
  const companyId = company!.id;
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
      estimate_number: 'EST-E2ES128LS',
      created_by_role: 'owner',
      contract_type: 'fixed_price',
      pricing_mode: 'markup',
      labor_markup_percent: 20,
      material_markup_percent: 20,
      tax_rate: 0,
    })
    .select('id')
    .single();
  if (eErr) throw new Error(`estimate: ${eErr.message}`);
  estimateId = est!.id;
  const { data: cat, error: cErr } = await admin
    .from('estimate_categories')
    .insert({ company_id: companyId, estimate_id: estimateId, name: `${MARKER} Kitchen`, sort_order: 0 })
    .select('id')
    .single();
  if (cErr) throw new Error(`category: ${cErr.message}`);
  categoryId = cat!.id;
  const { data: li, error: lErr } = await admin
    .from('estimate_line_items')
    .insert({
      company_id: companyId,
      estimate_id: estimateId,
      category_id: categoryId,
      name: 'Rough Phase',
      description: 'SECTION DESCRIPTION UNCHANGED',
      sort_order: 0,
      total_price: 1320,
    })
    .select('id')
    .single();
  if (lErr) throw new Error(`section: ${lErr.message}`);
  const { data: rows, error: rErr } = await admin
    .from('estimate_line_rows')
    .insert([
      {
        company_id: companyId,
        line_item_id: li!.id,
        row_type: 'labor',
        name: 'Framing labor',
        sort_order: 0,
        rate: 50,
        quantity: 10,
        apply_tax: false,
        total: 600,
      },
      {
        company_id: companyId,
        line_item_id: li!.id,
        row_type: 'material',
        name: 'Studs',
        sort_order: 1,
        unit_cost: 6,
        quantity: 100,
        unit_of_measure: 'each',
        apply_tax: false,
        total: 720,
      },
    ])
    .select('id, name');
  if (rErr) throw new Error(`rows: ${rErr.message}`);
  laborRowId = rows!.find((r) => r.name === 'Framing labor')!.id;
  materialRowId = rows!.find((r) => r.name === 'Studs')!.id;
});

test.afterAll(async () => {
  await sweep();
});

test('A-1 · a line with no description shows NOTHING extra in the grid', async ({ page }) => {
  await openItems(page);
  await expect(page.getByTestId('row-description')).toHaveCount(0);
  // The section description is untouched and still where it was (A-3).
  await expect(page.getByText('SECTION DESCRIPTION UNCHANGED')).toBeVisible();
});

test('C-1 · Details opens the line on a sheet; a description and a rate save from it', async ({ page }) => {
  await openItems(page);
  await page.locator(`tr[data-row-id="${laborRowId}"]`).getByTestId('open-line-detail').click();
  const sheet = page.getByTestId('line-detail-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('line-detail-sheet-type')).toHaveText('Labor');
  await expect(sheet.getByTestId('line-detail-sheet-name')).toHaveValue('Framing labor');

  await sheet.getByTestId('line-detail-sheet-description').fill('Frame the new pantry wall.\nTwo days.');
  await sheet.getByTestId('line-detail-sheet-rate').fill('55');
  await sheet.getByTestId('line-detail-sheet-save').click();
  await expect(sheet).toBeHidden();

  await expect
    .poll(async () => (await readRow(laborRowId)).description, AFTER_POST)
    .toBe('Frame the new pantry wall.\nTwo days.');
  await expect.poll(async () => Number((await readRow(laborRowId)).total), AFTER_POST).toBe(660);
  expect(Number((await readRow(laborRowId)).rate)).toBe(55);

  // The described line shows its description — the other line still shows nothing.
  await expect(page.getByTestId('row-description')).toHaveCount(1);
  await expect(
    page.locator(`tr[data-row-id="${laborRowId}"]`).getByTestId('row-description')
  ).toContainText('Frame the new pantry wall.');
  await expect(
    page.locator(`tr[data-row-id="${materialRowId}"]`).getByTestId('row-description')
  ).toHaveCount(0);
});

test('C-1 · the grid stays quick-editable beside the sheet (inline name edit still saves)', async ({ page }) => {
  await openItems(page);
  const nameCell = page.locator(`tr[data-row-id="${materialRowId}"] td`).nth(1);
  await nameCell.locator('span[title="Click to edit"]').first().click();
  const input = nameCell.locator('input');
  await input.fill('Studs 2x4');
  await input.press('Enter');
  await expect.poll(async () => (await readRow(materialRowId)).name, AFTER_POST).toBe('Studs 2x4');
});

test('C-2 · Add Items on a category with lines LISTS them, and an entry opens its detail', async ({ page }) => {
  await openItems(page);
  await page.getByTestId(`open-add-items-${categoryId}`).click();
  const addSheet = page.getByTestId('add-items-sheet');
  await expect(addSheet).toBeVisible();
  const list = addSheet.getByTestId('sheet-existing-lines');
  await expect(list).toContainText('2 lines');
  const entries = list.getByTestId('sheet-existing-line');
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0)).toContainText('Framing labor');
  await expect(entries.nth(1)).toContainText('Studs 2x4');

  // LIVE: clicking an entry opens that line's detail, drawn ABOVE the add sheet,
  // and the add sheet (with its tray) is still there underneath.
  await entries.nth(1).click();
  const detail = page.getByTestId('line-detail-sheet');
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId('line-detail-sheet-name')).toHaveValue('Studs 2x4');
  await expect(detail.getByTestId('line-detail-sheet-type')).toHaveText('Material');
  // Clickable, not hidden under the add sheet: a real click on its field lands.
  await detail.getByTestId('line-detail-sheet-description').click();
  await expect(detail.getByTestId('line-detail-sheet-description')).toBeFocused();
  await page.getByTestId('line-detail-sheet-close').click();
  await expect(detail).toBeHidden();
  await expect(addSheet).toBeVisible();
});
