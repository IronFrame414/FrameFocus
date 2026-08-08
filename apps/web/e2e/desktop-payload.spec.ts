import { test, expect, type Page } from '@playwright/test';
import { adminClient } from './hub-fixture';

// THE PAYLOAD, NOT THE PIXELS. [S121]
//
// ===========================================================================
// WHY THIS FILE EXISTS — A DOM TEST IS WHAT LET ALL THREE INSTANCES SHIP
// ===========================================================================
// Three separate leaks of the same shape reached main:
//
//   #136  dashboard/expenses          retainage rows to crew   (raised S103, never fixed)
//   #117  .../changes                 CO money to PM/foreman/crew
//   new   .../changes/[coId]          CO lines: unit_cost, rate, markup, total
//
// In every one, a server component computed a correct role gate and then handed
// the client component the FULL rows anyway. The gate decided what was DRAWN.
// So every DOM assertion — "a crew member sees no dollar figure" — passed, on
// all three, while the figures sat in the RSC payload one view-source away.
//
// **A test that reads rendered output cannot see this class of bug.** These
// tests read the payload the server actually sent.
//
// ===========================================================================
// HOW: `page.content()` after a full navigation
// ===========================================================================
// Next serialises the RSC payload into `<script>self.__next_f.push(...)</script>`
// tags in the document. `page.content()` returns the DOM including those script
// bodies, so a value that travelled is findable there whether or not any element
// renders it. Asserting on `page.content()` rather than on a locator is the
// whole point of the file — do not "simplify" these to `toBeVisible()` checks.
//
// The figures are searched as their SERIALISED forms (`211563.12`, and the key
// names), because a redacted payload contains the key with `null` while a
// leaking one contains the key with a number.

const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

const CREW = 'josh+crew@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/**
 * How many PAYABLE rows travelled — counted by value, never by key name.
 *
 * `is_retainage`, `sub_contract_id` and `purchase_order_id` are columns on every
 * `expenses` row, so a plain receipt carries `is_retainage:false` and two nulls.
 * Only a truthy flag or a non-null link marks a payable.
 */
function payableMarkers(html: string) {
  const count = (re: RegExp) => (html.match(re) ?? []).length;
  return {
    retainage: count(/is_retainage\\?":\s*true/g),
    subContract: count(/sub_contract_id\\?":\s*\\?"/g),
    purchaseOrder: count(/purchase_order_id\\?":\s*\\?"/g),
  };
}

/** Every `"key":<number>` occurrence in the document, payload scripts included. */
function numericOccurrences(html: string, key: string): string[] {
  return [...html.matchAll(new RegExp(`\\\\?"${key}\\\\?":\\s*(-?\\d[\\d.]*)`, 'g'))].map(
    (m) => m[1]
  );
}

test.describe('#117 · the CO list ships no money to a role that may not see it', () => {
  for (const [role, email] of [
    ['crew_member', CREW],
    ['foreman', FOREMAN],
    ['project_manager', PM],
  ] as const) {
    test(`${role} — no net_delta, no markup, no tax_rate in the payload`, async ({ page }) => {
      await signIn(page, email);
      await page.goto(`/dashboard/projects/${PROJECT}/changes`);
      // The page has rendered its rows — so the payload under test is the real
      // one, not a redirect or an error boundary.
      await expect(page.locator('body')).toContainText(/Change Orders|Awaiting Signature/i, {
        timeout: 20_000,
      });

      const html = await page.content();
      for (const key of [
        'net_delta',
        'labor_markup_percent',
        'material_markup_percent',
        'subcontractor_markup_percent',
        'tax_rate',
      ]) {
        expect(
          numericOccurrences(html, key),
          `${role} received numeric ${key} in the RSC payload`
        ).toEqual([]);
      }
    });
  }

  test('an OWNER still receives them — the redaction must not blank everybody', async ({
    page,
  }) => {
    // The half that makes the tests above meaningful. Without it, a page that
    // crashed, redirected, or shipped zero change orders would pass all three.
    await signIn(page, OWNER);
    await page.goto(`/dashboard/projects/${PROJECT}/changes`);
    await expect(page.locator('body')).toContainText(/Awaiting Signature/i, { timeout: 20_000 });

    const html = await page.content();
    expect(
      numericOccurrences(html, 'net_delta').length,
      'the owner received no net_delta — the fixture or the page is broken, not the floor'
    ).toBeGreaterThan(0);
  });
});

test.describe('#117 · the CO DETAIL ships no line-level cost or margin', () => {
  test('a crew member gets no unit_cost, rate, markup_percent, total or amount', async ({
    page,
  }) => {
    // ⚠️ THE ID COMES FROM THE DATABASE, NOT FROM A LINK. The desktop CO row
    // navigates with `router.push` in an onClick (changes-panel.tsx:304), not an
    // <a href> — so a link-scraping first draft found nothing and SKIPPED,
    // which proves less than failing would have.
    const { data: cos } = await adminClient()
      .from('change_orders')
      .select('id')
      .eq('project_id', PROJECT)
      .eq('is_deleted', false)
      .limit(1);
    if (!cos?.length) test.skip(true, 'no change orders on the fixture project');
    const href = `/dashboard/projects/${PROJECT}/changes/${cos![0].id}`;

    await signIn(page, CREW);
    const resp = await page.goto(href);
    // After the row floor this route may 404 for crew, which is a stronger
    // outcome than redaction and equally acceptable here.
    if (resp && resp.status() === 404) return;

    const html = await page.content();
    for (const key of ['unit_cost', 'rate', 'markup_percent', 'total', 'amount', 'total_price']) {
      expect(
        numericOccurrences(html, key),
        `crew received numeric ${key} on the CO detail payload`
      ).toEqual([]);
    }
  });
});

test.describe('#136 · expenses ships no payable rows to crew — and still hides them', () => {
  test('crew receives no retainage amounts in the payload', async ({ page }) => {
    await signIn(page, CREW);
    await page.goto('/dashboard/expenses');
    await expect(page.locator('body')).toContainText(/Receipts|Expenses/i, { timeout: 20_000 });

    const html = await page.content();
    // ⚠️ ASSERT THE VALUE, NOT THE KEY. `is_retainage` and `sub_contract_id`
    // are columns on EVERY expense row, so a plain crew receipt carries
    // `is_retainage:false`. A first draft of this test searched for the key
    // name and failed against a correct fix — the payable marker is the value.
    expect(
      payableMarkers(html),
      'crew received payable rows in the RSC payload (#136)'
    ).toEqual({ retainage: 0, subContract: 0, purchaseOrder: 0 });
  });

  test('⚠️ the receipts tab still HIDES payables — the regression the naive fix causes', async ({
    page,
  }) => {
    // #136's filed fix was "pass billRows only when seesBills". That would have
    // emptied `payableIds`, which the Receipts tab uses to EXCLUDE payables —
    // so the leak would have been traded for payables appearing on a tab that
    // exists to omit them. The ids are now passed separately for this reason,
    // and this asserts the behaviour that protects.
    await signIn(page, CREW);
    await page.goto('/dashboard/expenses');
    await expect(page.locator('body')).toContainText(/Receipts|Expenses/i, { timeout: 20_000 });
    // No row reaching crew may be a payable at all — the server strips them, so
    // the client filter has nothing left to do. Payables carry a sub-contract
    // or PO link, or the retainage flag; a receipt carries none of the three.
    const html = await page.content();
    expect(payableMarkers(html)).toEqual({ retainage: 0, subContract: 0, purchaseOrder: 0 });
  });

  test('a PM still receives bill rows — the audience gate is unchanged', async ({ page }) => {
    // SEES_BILLS is owner/admin/PM/foreman, and a fix that starved everyone
    // would pass every assertion above while breaking the screen for its users.
    //
    // ⚠️ PM, NOT FOREMAN, AND MEASURED RATHER THAN ASSUMED. The first draft used
    // the foreman and failed: on rebuild-test `expenses_select_scoped` gives
    // that identity ONE expense row and ZERO payables, so the assertion would
    // have been vacuous either way. PM receives 36 sub-contract rows and 6
    // retainage rows, and is not owner/admin — so it proves the gate admits a
    // non-reviewer rather than collapsing to Owner/Admin.
    await signIn(page, PM);
    await page.goto('/dashboard/expenses');
    await expect(page.locator('body')).toContainText(/Bills|Receipts|Expenses/i, {
      timeout: 20_000,
    });
    const html = await page.content();
    const markers = payableMarkers(html);
    expect(
      markers.retainage + markers.subContract + markers.purchaseOrder,
      'the PM lost the Bills & Commitments payload — over-corrected'
    ).toBeGreaterThan(0);
  });
});
