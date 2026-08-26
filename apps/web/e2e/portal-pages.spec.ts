import { test, expect } from '@playwright/test';
import { signIn } from './chat-fixture';

// ============================================================================
// S168 — the portal is FOUR PAGES, and each one renders. [Josh]
// ============================================================================
//
// Josh, after walking the built portal: *"it is all 1 page but should be broken
// up with separate pages just like the company side is. Overall it looks good
// and like it has all of the right information."* The content was right; the
// shape was not.
//
// ⚠️ WHY A BROWSER TEST AND NOT ONLY THE LIVE HARNESS. `s164-m9-portal-shell`
// proves the SERVICE reads with the caller's client, and P7b now proves no file
// in the tree reaches for the service role. Neither fact proves a page renders.
// A split is exactly the change that compiles, type-checks, passes every data
// probe, and then throws at request time on one of the four routes — the three
// that were copied first look fine, and nothing in the suite visits the fourth.
//
// ⚠️ AND THIS SPEC WRITES NOTHING. It signs in, navigates and asserts. No
// fixture is created, mutated or deleted — S167's inventory is about fixtures
// moving under tests, and a UI-shape test has no business touching data.

const LINKED = 'josh+qa-client-linked@worthprop.com';

/** The rich fixture project — the one with documents, photos and bills. */
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9';

test.describe('S168 · the portal project view is four pages', () => {
  test('all four routes render, and the tabs carry the active state', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, LINKED, /\/portal/);

    await page.goto(`/portal/${PROJECT}`);
    await expect(page.getByTestId('portal-tabs')).toBeVisible();

    // Dashboard — "where things stand" and the schedule.
    await expect(page.getByRole('heading', { name: 'Where things stand' })).toBeVisible();
    await expect(page.getByTestId('portal-tab-dashboard')).toHaveAttribute('aria-current', 'page');

    // Financials — the one page the S164 Q3 ruling still governs. Proposals,
    // change orders and billing together, with totals added.
    await page.getByTestId('portal-tab-financials').click();
    await expect(page).toHaveURL(new RegExp(`/portal/${PROJECT}/financials$`));
    await expect(page.getByRole('heading', { name: 'Proposals' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Change orders' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
    await expect(page.getByTestId('portal-tab-financials')).toHaveAttribute('aria-current', 'page');

    // Files & photos — documents, photos, and the questions thread.
    await page.getByTestId('portal-tab-files').click();
    await expect(page).toHaveURL(new RegExp(`/portal/${PROJECT}/files$`));
    // `exact` for the same reason as 'Photos' below: [S175 stage 6] added a
    // "Shared documents" card, of which 'Documents' is a substring, so a loose
    // name now resolves to two headings and fails on strict mode rather than on
    // the page. Both cards are asserted, so the addition is covered rather than
    // merely tolerated.
    await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Shared documents' })).toBeVisible();
    // `exact` — 'Photos' is a substring of 'Questions and photos', and the
    // accessible-name match is case-insensitive, so a loose name resolves to two
    // headings and fails on strict mode rather than on the page.
    await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Questions and photos' })).toBeVisible();

    // Selections. ⚠️ **NO LONGER THE DEAD PAGE** — S175 stage 7 built it.
    //
    // _Superseded assertion, quoted not deleted:_
    //   `await expect(page.getByTestId('portal-selections-empty')).toBeVisible();`
    //   under the comment *"Selections — the deliberate dead page."*
    //
    // That assertion cannot survive the page going live, and not because the
    // testid moved: `desktop-selections.spec.ts` RELEASES selections onto this
    // very project, concurrently, in the same run. "The client sees nothing
    // here" would then pass or fail on worker ordering — the S157 trap of an
    // assertion whose name says "none" reading a live, shared, mutable row
    // instead of a fact.
    //
    // `portal-selections` is present in BOTH of the page's states, so this
    // proves the ROUTE RENDERS without depending on what happens to be on it.
    // What is ON it is proved by `portal-selections.spec.ts`, on its own
    // fixture, and by `s175-stage7-portal-selections.live.ts`.
    await page.getByTestId('portal-tab-selections').click();
    await expect(page).toHaveURL(new RegExp(`/portal/${PROJECT}/selections$`));
    await expect(page.getByTestId('portal-selections')).toBeAttached();
    await expect(page.getByTestId('portal-tab-selections')).toHaveAttribute('aria-current', 'page');
  });

  test('⚠️ the change orders are on Financials and NOT on Files & photos', async ({ page }) => {
    // `getPortalDocuments()` returns contracts and change orders in one list,
    // and Josh's page table names them on different pages. The split is done at
    // the point of render, so the two filters are complements — this asserts
    // they actually are, rather than both pages showing everything or a change
    // order falling through the gap between them.
    test.setTimeout(120_000);
    await signIn(page, LINKED, /\/portal/);

    await page.goto(`/portal/${PROJECT}/financials`);
    const coCard = page.locator('section', { has: page.getByRole('heading', { name: 'Change orders' }) });
    await expect(coCard).toBeVisible();
    const coRows = await coCard.getByText(/QA M9/).count();
    expect(coRows, 'no fixture change order on Financials — this probe is vacuous').toBeGreaterThan(0);

    await page.goto(`/portal/${PROJECT}/files`);
    await expect(page.getByRole('heading', { name: 'Change orders' })).toHaveCount(0);
  });

  test('the shell, the guard and the branding survive on every page', async ({ page }) => {
    // Four routes must not become four guards. The layout owns the project
    // lookup, so a project that is not hers 404s from ALL of them — asserted on
    // the last one added, which is the one a hand-maintained guard list forgets.
    test.setTimeout(120_000);
    await signIn(page, LINKED, /\/portal/);

    const notHers = '11111111-1111-1111-1111-111111111111';
    for (const path of ['', '/financials', '/files', '/selections']) {
      const res = await page.goto(`/portal/${notHers}${path}`);
      expect(res?.status(), `/portal/<not hers>${path} did not 404`).toBe(404);
    }
  });
});
