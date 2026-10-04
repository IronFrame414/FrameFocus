import { test, expect, type Page } from '@playwright/test';
import { adminClient } from './hub-fixture';
import { signIn, OWNER } from './chat-fixture';

// ============================================================================
// S128 1c — Part G: "More actions" on the estimate Details page opened DOWN and
// its last item ("Delete estimate") fell under the fixed totals bar.
//
// ⚠️ The proof is that the menu's LAST item is reachable and clickable WITH THE
// BAR PRESENT — not that the menu opened. Three independent checks:
//   1. its box sits inside the viewport and above the bar's top edge;
//   2. the element at its centre point IS that item (nothing paints over it);
//   3. a REAL click (Playwright's actionability check, no dispatchEvent) opens
//      the delete confirm.
// Run at the desktop viewport the repo already tests (Desktop Chrome, 1280×720)
// and a shorter one, scrolled to the end of the page where the bug lived.
// ============================================================================

const MARKER = 'E2ES128MA';
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
  const { data: ct } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', company!.id)
    .eq('is_deleted', false)
    .order('id')
    .limit(1)
    .single();
  const { data: est, error } = await admin
    .from('estimates')
    .insert({
      company_id: company!.id,
      contact_id: ct!.id,
      name: `${MARKER} estimate`,
      status: 'draft',
      estimate_number: 'EST-E2ES128MA',
      created_by_role: 'owner',
      contract_type: 'fixed_price',
      pricing_mode: 'markup',
      tax_rate: 0,
    })
    .select('id')
    .single();
  if (error) throw new Error(`estimate: ${error.message}`);
  estimateId = est!.id;
});

test.afterAll(async () => {
  await sweep();
});

async function openMenuAtPageEnd(page: Page): Promise<void> {
  await signIn(page, OWNER);
  await page.goto(`/dashboard/estimates/${estimateId}`);
  const trigger = page.getByRole('button', { name: /more actions/i });
  await expect(trigger).toBeVisible();
  // Where the bug lived: the bottom of the Details page, trigger just above the bar.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await trigger.click();
  await expect(page.getByTestId('more-actions-menu')).toBeVisible();
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1280, height: 600 },
]) {
  test(`G · the LAST item is reachable and clickable above the totals bar (${viewport.width}×${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openMenuAtPageEnd(page);

    const bar = page.getByTestId('estimate-totals-bar');
    await expect(bar).toBeVisible();
    const barBox = (await bar.boundingBox())!;

    const items = page.getByTestId('more-actions-menu').getByRole('button');
    await expect(items).toHaveCount(2);
    const last = items.last();
    await expect(last).toHaveText('Delete estimate');
    const box = (await last.boundingBox())!;

    // 1 — inside the viewport, and clear of the bar.
    expect(box.y, 'last item starts above the top of the viewport').toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, 'last item runs under the totals bar').toBeLessThanOrEqual(barBox.y);

    // 2 — nothing paints over it: the element at its centre is the item itself.
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.textContent?.trim() ?? null,
      [box.x + box.width / 2, box.y + box.height / 2]
    );
    expect(hit, 'something covers the last item').toBe('Delete estimate');

    // 3 — a real click lands and opens the confirm. Cancelled: nothing is deleted.
    await last.click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-cancel').click();
    const { data } = await adminClient()
      .from('estimates')
      .select('is_deleted')
      .eq('id', estimateId)
      .single();
    expect(data!.is_deleted).toBe(false);
  });
}
