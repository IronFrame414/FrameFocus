import { test, expect, type Page } from '@playwright/test';
import { OWNER, PROJECT_QA_A, signIn } from './chat-fixture';
import { adminClient } from './hub-fixture';

// ============================================================================
// S171 stage 3 — the project Selections tab (§9.2) and the company sheet (§9.1).
//
// THE ASSERTION THAT MATTERS IS "NO COSTS": for a foreman the tab and the sheet
// render no currency anywhere, and the sheet shows "price —" because the amounts
// side table gave them NO ROW (20261026000000). That is the floor doing the
// work; the UI is proven to be unable to leak what it was never handed.
//
// Fixture is service-role, MARKER-named, swept in beforeAll AND afterAll.
// ============================================================================

const MARKER = 'E2ESEL';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';

let selectionId = '';

async function sweep() {
  const admin = adminClient();
  const { data: sels } = await admin.from('selections').select('id').like('name', `${MARKER}%`);
  const ids = (sels ?? []).map((s) => s.id);
  if (ids.length) {
    const { data: opts } = await admin.from('selection_options').select('id').in('selection_id', ids);
    const oids = (opts ?? []).map((o) => o.id);
    if (oids.length) {
      await admin.from('selection_option_amounts').delete().in('option_id', oids);
      await admin.from('selection_options').delete().in('id', oids);
    }
    await admin.from('selection_notes').delete().in('selection_id', ids);
    const { data: th } = await admin.from('selection_threads').select('id').in('selection_id', ids);
    const tids = (th ?? []).map((t) => t.id);
    if (tids.length) {
      await admin.from('selection_messages').delete().in('thread_id', tids);
      await admin.from('selection_threads').delete().in('id', tids);
    }
    await admin.from('selections').delete().in('id', ids);
  }
  await admin.from('selection_areas').delete().like('name', `${MARKER}%`);
}

test.beforeAll(async () => {
  await sweep();
  const admin = adminClient();
  const { data: company } = await admin.from('companies').select('id').eq('name', 'Bishop Contracting').single();
  const { data: area } = await admin.from('selection_areas').insert({ company_id: company!.id, project_id: PROJECT_QA_A, name: `${MARKER} Kitchen` }).select('id').single();
  const { data: sel } = await admin
    .from('selections')
    .insert({ company_id: company!.id, project_id: PROJECT_QA_A, area_id: area!.id, name: `${MARKER} Countertop`, status: 'in_discussion', description: 'Quartz or granite' })
    .select('id').single();
  selectionId = sel!.id;
  const { data: opt } = await admin
    .from('selection_options')
    .insert({ company_id: company!.id, selection_id: selectionId, name: `${MARKER} Calacatta quartz`, spec_detail: '3cm, eased edge', is_chosen: true })
    .select('id').single();
  await admin.from('selection_option_amounts').insert({ company_id: company!.id, option_id: opt!.id, quantity: 1, unit_cost: 4200, markup_percent: 20 });
  await admin.from('selection_notes').insert({ company_id: company!.id, selection_id: selectionId, internal_notes: 'margin is thin here' });
});
test.afterAll(async () => {
  await sweep();
});

const MONEY = /\$\s?\d|4,?200|5,?040|margin is thin/;

async function expectNoMoney(page: Page, scope: string) {
  const text = await page.locator(scope).innerText();
  expect(text, `money or notes leaked into ${scope}`).not.toMatch(MONEY);
}

test.describe('§9.2 — the project Selections tab', () => {
  test('owner sees the tab, the area, the row and the chosen option — and no price on this surface', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto(`/dashboard/projects/${PROJECT_QA_A}/selections`);
    await expect(page.getByTestId('selections-tab')).toBeVisible();
    await expect(page.getByText(`${MARKER} Kitchen`)).toBeVisible();
    const row = page.getByTestId(`selection-row-${selectionId}`);
    await expect(row).toContainText(`${MARKER} Countertop`);
    await expect(row).toContainText('Calacatta quartz');
    await expect(row).toContainText('3cm, eased edge');
    await expectNoMoney(page, '[data-testid="selections-tab"]');
    await expect(page.getByTestId('selection-new')).toBeVisible();
  });

  test('foreman sees the same rows, no "New selection" button, and NO COSTS', async ({ page }) => {
    await signIn(page, FOREMAN);
    await page.goto(`/dashboard/projects/${PROJECT_QA_A}/selections`);
    await expect(page.getByTestId(`selection-row-${selectionId}`)).toContainText('Calacatta quartz');
    await expect(page.getByTestId('selection-new')).toHaveCount(0);
    await expectNoMoney(page, '[data-testid="selections-tab"]');
  });

  test('the tab is in the project nav, between Budget and Change Orders', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto(`/dashboard/projects/${PROJECT_QA_A}`);
    const labels = await page.locator('nav a, a[href*="/dashboard/projects/"]').allInnerTexts();
    const flat = labels.map((l) => l.trim());
    const i = flat.indexOf('Selections');
    expect(i, 'Selections tab missing from the project nav').toBeGreaterThan(-1);
    expect(flat[i - 1]).toBe('Budget & Cost');
    expect(flat[i + 1]).toBe('Change Orders');
  });
});

test.describe('§9.1 — the company sheet, by role', () => {
  test('owner: amounts editor with the computed sell, internal notes, options, thread', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto(`/dashboard/projects/${PROJECT_QA_A}/selections/${selectionId}`);
    await expect(page.getByTestId('selection-sheet')).toBeVisible();
    await expect(page.getByTestId('opt-amounts')).toBeVisible();
    await expect(page.getByTestId('opt-sell')).toContainText('$5,040.00'); // 4200 × 1.20
    await expect(page.getByTestId('sel-notes-text')).toHaveValue('margin is thin here');
    await expect(page.getByTestId('sel-allowance')).toBeVisible();
    await expect(page.getByTestId('sel-thread')).toBeVisible();
    await expect(page.getByTestId('opt-add-catalog')).toBeVisible();
    await expect(page.getByTestId('opt-add-budget')).toBeVisible();
  });

  test('PM: same as owner (the floor admits PM to amounts)', async ({ page }) => {
    await signIn(page, PM);
    await page.goto(`/dashboard/projects/${PROJECT_QA_A}/selections/${selectionId}`);
    await expect(page.getByTestId('opt-sell')).toContainText('$5,040.00');
    await expect(page.getByTestId('sel-notes-text')).toHaveValue('margin is thin here');
  });

  test('⚠️ foreman: "price —" (no row from the floor), notes VISIBLE (second floor admits foreman), fields read-only', async ({ page }) => {
    await signIn(page, FOREMAN);
    await page.goto(`/dashboard/projects/${PROJECT_QA_A}/selections/${selectionId}`);
    await expect(page.getByTestId('selection-sheet')).toBeVisible();
    await expect(page.getByTestId('opt-amounts')).toContainText('price —');
    await expect(page.getByTestId('opt-sell')).toHaveCount(0);
    await expect(page.getByTestId('sel-notes-text')).toHaveValue('margin is thin here');
    await expect(page.getByTestId('sel-name')).toBeDisabled();
    await expect(page.getByTestId('opt-add-scratch')).toHaveCount(0);
    const sheet = await page.getByTestId('selection-sheet').innerText();
    expect(sheet).not.toMatch(/4,?200|5,?040/);
  });

  test('the four image paths are offered to an editor (upload button + drop/paste hint + link field)', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto(`/dashboard/projects/${PROJECT_QA_A}/selections/${selectionId}`);
    await expect(page.getByTestId('opt-upload')).toBeVisible();
    await expect(page.getByText('or drop / paste an image here')).toBeVisible();
    await expect(page.getByTestId('opt-link')).toBeVisible();
  });
});

test.describe('/m parity — the subcontractor reads the list with NO COSTS', () => {
  test('sub lands on /m and the selections route renders the chosen option without money or notes', async ({ page }) => {
    await signIn(page, SUB, /\/m\/projects/);
    await page.goto(`/m/p/${PROJECT_QA_A}/selections`);
    await expect(page.getByTestId('m-selections')).toBeVisible();
    await expect(page.getByTestId(`m-selection-${selectionId}`)).toContainText('Calacatta quartz');
    await expectNoMoney(page, '[data-testid="m-selections"]');
  });
});

test.describe('stage 4 — the sheet\'s lifecycle controls (company side)', () => {
  test('owner: "Send to client for approval" → price block + Withdraw → back to draft', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto(`/dashboard/projects/${PROJECT_QA_A}/selections/${selectionId}`);
    await expect(page.getByTestId('sel-offer')).toBeVisible();
    await page.getByTestId('sel-offer').click();
    await expect(page.getByTestId('sel-price-block')).toBeVisible();
    await expect(page.getByTestId('sel-price-block')).toContainText('Selections Price');
    await expect(page.getByTestId('sel-price-block')).toContainText('$5,040.00');
    await expect(page.getByTestId('sel-price-block')).toContainText('Allowance Deduction');
    await expect(page.getByTestId('sel-variance')).toContainText('$5,040.00'); // unlinked → pure add (Q8)
    await expect(page.getByTestId('sel-name')).toBeDisabled(); // frozen while awaiting
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('sel-withdraw').click();
    await expect(page.getByTestId('sel-offer')).toBeVisible();
    await expect(page.getByTestId('sel-price-block')).toHaveCount(0);
  });

  test('foreman: no lifecycle buttons, only the status sentence', async ({ page }) => {
    await signIn(page, FOREMAN);
    await page.goto(`/dashboard/projects/${PROJECT_QA_A}/selections/${selectionId}`);
    await expect(page.getByTestId('sel-offer')).toHaveCount(0);
    await expect(page.getByTestId('sel-lifecycle')).toContainText('Not yet sent to the client');
  });
});
