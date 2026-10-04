import { test, expect } from '@playwright/test';
import { adminClient } from './hub-fixture';
import { signIn, OWNER } from './chat-fixture';

// ============================================================================
// S128 1b — Part E-1: a SUB line was missing from the Sub Bids tab.
// EST-115 as observed 2026-10-03: Rough Phase holds TWO sub lines (Electric –
// Rough in $7,000, Plumbing – Rough in $850), Finish Phase holds one (Electric –
// Finish $300). The tab showed two cards titled by section, Rough Phase reading
// $7,000, and Plumbing nowhere.
//
// ⚠️ The guard: count the SUB lines (service role) and count the cards (the
// page). They must match — and a page that never rendered has zero cards, so
// the count of 3 is asserted, never "matches an empty list".
// ============================================================================

const MARKER = 'E2ES128SB';
let estimateId: string;

async function sweep(): Promise<void> {
  const admin = adminClient();
  const { data } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = (data ?? []).map((e) => e.id);
  if (ids.length) {
    const { error } = await admin.from('estimates').delete().in('id', ids);
    if (error) throw new Error(`sweep: ${error.message}`);
  }
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
      name: `${MARKER} Smith – Kitchen Remodel`,
      status: 'draft',
      estimate_number: 'EST-E2ES128SB',
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
    .insert({ company_id: companyId, estimate_id: estimateId, name: 'Kitchen', sort_order: 0 })
    .select('id')
    .single();
  if (cErr) throw new Error(`category: ${cErr.message}`);

  const sections: Array<{ name: string; sort: number; subs: Array<[string, number]> }> = [
    {
      name: 'Rough Phase',
      sort: 0,
      subs: [
        ['Electric – Rough in', 7000],
        ['Plumbing – Rough in', 850],
      ],
    },
    { name: 'Finish Phase', sort: 1, subs: [['Electric – Finish', 300]] },
  ];
  for (const sec of sections) {
    const { data: li, error: lErr } = await admin
      .from('estimate_line_items')
      .insert({
        company_id: companyId,
        estimate_id: estimateId,
        category_id: cat!.id,
        name: sec.name,
        sort_order: sec.sort,
        total_price: 0,
      })
      .select('id')
      .single();
    if (lErr) throw new Error(`section: ${lErr.message}`);
    const { error: rErr } = await admin.from('estimate_line_rows').insert(
      sec.subs.map(([name, amount], i) => ({
        company_id: companyId,
        line_item_id: li!.id,
        row_type: 'subcontractor',
        name,
        sort_order: i,
        amount,
        apply_tax: false,
        total: amount,
      }))
    );
    if (rErr) throw new Error(`rows: ${rErr.message}`);
  }
});

test.afterAll(async () => {
  await sweep();
});

test('E-1 · every SUB line is its own card: 3 sub lines, 3 cards, Plumbing at $850', async ({
  page,
}) => {
  const admin = adminClient();
  const { data: lis } = await admin
    .from('estimate_line_items')
    .select('id')
    .eq('estimate_id', estimateId);
  const { count: subLines } = await admin
    .from('estimate_line_rows')
    .select('id', { count: 'exact', head: true })
    .in(
      'line_item_id',
      (lis ?? []).map((l) => l.id)
    )
    .eq('row_type', 'subcontractor');
  expect(subLines).toBe(3);

  await signIn(page, OWNER);
  await page.goto(`/dashboard/estimates/${estimateId}`);
  await page.getByTestId('est-tab-bidding').click();

  const cards = page.getByTestId('sub-line-card');
  await expect(cards).toHaveCount(3);
  expect(await cards.count()).toBe(subLines);

  const plumbing = cards.filter({ hasText: 'Plumbing – Rough in' });
  await expect(plumbing).toHaveCount(1);
  await expect(plumbing).toContainText('$850.00');
  await expect(cards.filter({ hasText: 'Electric – Rough in' })).toContainText('$7,000.00');
  await expect(cards.filter({ hasText: 'Electric – Finish' })).toContainText('$300.00');

  // The section is context, and the two-line section says what still works per section.
  await expect(page.getByText('Section: Rough Phase')).toBeVisible();
  await expect(page.getByTestId('section-bids-note')).toHaveCount(1);
  await expect(page.getByTestId('section-bids-note')).toContainText('2 sub lines');
});
