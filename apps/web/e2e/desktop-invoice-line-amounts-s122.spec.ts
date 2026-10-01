import { test, expect, type Page } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S122 0-C — bill a dollar amount on a contract line [Josh, 2026-09-30]. ⚠️ MONEY.
//
// On a draft invoice's "Contract line items" panel:
//   · typing an amount in THIS INVOICE PINS the line (marked "pinned");
//   · ⚠️ changing the bulk percentage afterwards does NOT overwrite the pin;
//   · an amount above the line's remaining is refused BEFORE submission (the
//     Bill button is disabled and the remaining is named);
//   · Release returns the line to the percentage;
//   · what is billed is what was shown — counted with the service role, in
//     row counts and dollars.

const OWNER = 'josh+test50@worthprop.com';
const MARKER = 'S122ILA';
const admin = adminClient();
let projectId = '';
let estimateId = '';
let invoiceId = '';
let ownerMember = '';
const item: Record<'big' | 'small', string> = { big: '', small: '' };

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function sweep() {
  const { data: ps } = await admin
    .from('projects')
    .select('id, source_estimate_id')
    .like('name', `${MARKER}%`);
  for (const p of ps ?? []) {
    await admin.from('invoices').delete().eq('project_id', p.id);
    await admin.from('project_financials').delete().eq('project_id', p.id);
    await admin.from('projects').delete().eq('id', p.id);
    if (p.source_estimate_id) {
      const { data: lis } = await admin
        .from('estimate_line_items')
        .select('id')
        .eq('estimate_id', p.source_estimate_id);
      for (const li of lis ?? [])
        await admin.from('estimate_line_rows').delete().eq('line_item_id', li.id);
      await admin.from('estimate_line_items').delete().eq('estimate_id', p.source_estimate_id);
      await admin.from('estimate_categories').delete().eq('estimate_id', p.source_estimate_id);
      await admin.from('estimates').delete().eq('id', p.source_estimate_id);
    }
  }
}

async function billedLines() {
  const { data, error } = await admin
    .from('invoice_lines')
    .select('source_estimate_line_item_id, billed_amount, line_type')
    .eq('invoice_id', invoiceId);
  if (error) throw new Error(error.message);
  return (data ?? []) as {
    source_estimate_line_item_id: string | null;
    billed_amount: number;
    line_type: string;
  }[];
}

const cell = (page: Page, key: 'big' | 'small') => page.getByTestId(`line-amount-${item[key]}`);

test.describe('S122 0-C · a typed dollar amount pins a contract line', () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await sweep();
    const { data: prof } = await admin.from('profiles').select('id').eq('email', OWNER).single();
    const { data: m } = await admin
      .from('company_members')
      .select('id')
      .eq('profile_id', prof!.id)
      .single();
    ownerMember = m!.id as string;
    const { data: c } = await admin
      .from('contacts')
      .select('id')
      .eq('company_id', COMPANY_A)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    const { data: counters } = await admin
      .from('companies')
      .select('estimate_number_sequence, project_internal_sequence')
      .eq('id', COMPANY_A)
      .single();
    const seq = (counters!.estimate_number_sequence as number) + 1;
    const internal = (counters!.project_internal_sequence as number) + 1;
    const { data: e, error: eErr } = await admin
      .from('estimates')
      .insert({
        company_id: COMPANY_A,
        contact_id: c!.id,
        name: `${MARKER} contract`,
        estimate_number: `EST-${String(seq).padStart(4, '0')}`,
        status: 'accepted',
        contract_type: 'fixed_price',
        created_by_role: 'owner',
        subtotal: 43763,
        grand_total: 43763,
        discount_total: 0,
      })
      .select('id')
      .single();
    must('estimate', eErr);
    estimateId = e!.id as string;
    const { data: cat, error: cErr } = await admin
      .from('estimate_categories')
      .insert({
        company_id: COMPANY_A,
        estimate_id: estimateId,
        name: `${MARKER} cat`,
        sort_order: 0,
      })
      .select('id')
      .single();
    must('category', cErr);
    for (const [key, price, order] of [
      ['big', 42763, 0],
      ['small', 1000, 1],
    ] as const) {
      const { data: li, error } = await admin
        .from('estimate_line_items')
        .insert({
          company_id: COMPANY_A,
          estimate_id: estimateId,
          category_id: cat!.id,
          name: `${MARKER} ${key}`,
          total_price: price,
          sort_order: order,
        })
        .select('id')
        .single();
      must(`line ${key}`, error);
      item[key] = li!.id as string;
      must(
        `row ${key}`,
        (
          await admin
            .from('estimate_line_rows')
            .insert({
              company_id: COMPANY_A,
              line_item_id: item[key],
              row_type: 'labor',
              name: `${MARKER} ${key} row`,
              sort_order: 0,
              apply_tax: false,
              total: price,
            })
        ).error
      );
    }
    const { data: p, error: pErr } = await admin
      .from('projects')
      .insert({
        company_id: COMPANY_A,
        contact_id: c!.id,
        name: `${MARKER} project`,
        status: 'active',
        project_type: 'fixed_price',
        source_estimate_id: estimateId,
        project_number: `PRJ-${MARKER}`,
        project_internal_seq: internal + 7700,
      })
      .select('id')
      .single();
    must('project', pErr);
    projectId = p!.id as string;
    must(
      'financials',
      (
        await admin
          .from('project_financials')
          .insert({ company_id: COMPANY_A, project_id: projectId, contract_value: 43763 })
      ).error
    );
    const { data: inv, error: iErr } = await admin
      .from('invoices')
      .insert({
        company_id: COMPANY_A,
        project_id: projectId,
        author_member_id: ownerMember,
        title: `${MARKER} invoice`,
        presentation_level: 'full_detail',
      })
      .select('id')
      .single();
    must('invoice', iErr);
    invoiceId = inv!.id as string;
    must(
      'counters',
      (await admin.from('companies').update({ estimate_number_sequence: seq }).eq('id', COMPANY_A))
        .error
    );
  });
  test.afterAll(sweep);

  test('pin, bulk-after-pin, the cap, release — and what bills is what was shown', async ({
    page,
  }) => {
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/projects/${projectId}/invoices/${invoiceId}`);
    // The panel rendered with both lines — so every absence below is a decision.
    await expect(cell(page, 'big')).toBeVisible({ timeout: 30_000 });
    await expect(cell(page, 'small')).toBeVisible();
    await expect(cell(page, 'big')).toHaveValue('42763.00');
    await expect(page.getByText('% of each unpinned line')).toBeVisible();

    // Type $20,000 → PINNED.
    await cell(page, 'big').fill('20,000');
    await expect(page.getByTestId(`line-pinned-${item.big}`)).toBeVisible();

    // ⚠️ LOAD-BEARING: the bulk percentage changes the UNPINNED line only.
    const pct = page.locator('label', { hasText: '% of each unpinned line' }).locator('input');
    await pct.fill('50');
    await expect(cell(page, 'small')).toHaveValue('500.00');
    await expect(cell(page, 'big'), 'the pin survives the bulk change').toHaveValue('20,000');
    await pct.fill('25');
    await expect(cell(page, 'small')).toHaveValue('250.00');
    await expect(cell(page, 'big'), 'and again').toHaveValue('20,000');

    // An invalid bulk percentage is refused, never coerced to 100.
    await pct.fill('150');
    await expect(page.getByTestId('line-percent-error')).toBeVisible();
    await expect(page.getByTestId('bill-selected-lines')).toBeDisabled();
    await pct.fill('50');

    // Over the remaining → refused BEFORE submission, the remaining named.
    await cell(page, 'big').fill('50000');
    await expect(page.getByTestId(`line-amount-error-${item.big}`)).toHaveText(
      /At most \$42,763\.00/
    );
    await expect(page.getByTestId('bill-selected-lines')).toBeDisabled();

    // Release → back to the percentage.
    await page.getByTestId(`line-release-${item.big}`).click();
    await expect(page.getByTestId(`line-pinned-${item.big}`)).toHaveCount(0);
    await expect(cell(page, 'big')).toHaveValue('21381.50');

    // Pin $20,000 again and bill. Nothing was written before this click.
    expect((await billedLines()).length, 'nothing written while editing').toBe(0);
    await cell(page, 'big').fill('20000');
    await page.getByTestId('bill-selected-lines').click();
    await expect.poll(async () => (await billedLines()).length, { timeout: 30_000 }).toBe(2);
    const lines = await billedLines();
    const by = Object.fromEntries(
      lines.map((l) => [l.source_estimate_line_item_id, Number(l.billed_amount)])
    );
    console.log(`[S122ILA] billed: ${JSON.stringify(lines)}`);
    expect(by[item.big], 'the pinned figure').toBe(20000);
    expect(by[item.small], '50% of 1,000').toBe(500);
    expect(
      lines.filter((l) => l.line_type === 'discount').length,
      'a partial bill brings no discount'
    ).toBe(0);
    expect(lines.reduce((s, l) => s + Number(l.billed_amount), 0)).toBe(20500);
  });
});
