import { test, expect, type Page } from '@playwright/test';

// M6M Part B — the five detail views: M-31, M-34, M-35, M-36, and M-16's
// file-open path. D-55 ("every list row opens its own page") and D-54
// ("hide AND actually block").
//
// ---------------------------------------------------------------------------
// WHAT THIS SUITE IS SHAPED AROUND
// ---------------------------------------------------------------------------
// Three things, and the third is the one that would otherwise ship broken:
//
//   1. THE ROW OPENS THE PAGE. §4.11.16 is explicit that on contacts this means
//      the WHOLE ROW, not the tap-to-call circle that already existed. So the
//      assertions navigate by clicking the row body and then check the URL —
//      a test that only asserted "a link exists" would pass on a build where
//      the link is the phone icon.
//
//   2. THE TWO AFFORDANCES DO NOT SWALLOW EACH OTHER. The row link and the
//      `tel:`/`mailto:` circles are siblings, not nested. Nesting an <a> in an
//      <a> is invalid and browsers resolve it by closing the outer one early —
//      the call button would navigate to the contact instead of dialling. That
//      failure is invisible to a "does the row navigate" test, so the circles'
//      hrefs are asserted separately.
//
//   3. THE GUARD IS THE GATE, NOT THE HIDDEN ROW. D-54's whole point is that a
//      hidden affordance is not a permission. Every gating test therefore TYPES
//      THE URL rather than looking for a missing link — that is the only thing
//      a screenshot, a bookmark or a stale PWA cache would do.
//
// ---------------------------------------------------------------------------
// ⚠️ WHAT THESE TESTS DO **NOT** PROVE, AND MUST NOT BE READ AS PROVING
// ---------------------------------------------------------------------------
// On M-31, M-35, M-36 and the file-open path the subcontractor exclusion is
// **UI-ONLY**. `change_orders`, `company_members`, `contacts` and `files` carry
// no `subcontractor` arm on SELECT (§4.11.10b's third conflict). A `curl` with
// a subcontractor's token still reads every one of those rows — measured [S115]:
// the QA sub read both change orders on an assigned project at full value,
// net_delta 1410 and 21385.91.
//
// So "the sub is redirected" below means the SCREEN refuses. It does not mean
// the data is protected. M-34 is the one detail route where the 404 IS real
// enforcement (D-57's migration), and it is asserted separately for that reason.

const CREW = 'josh+crew@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';

/** The project e2e/m-sections.spec.ts drives: 2 COs, 1 punch item, 1 contact, 4 assignments. */
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
/** A project where the crew identity can see 2 non-photo files (of 13 — the rest are DB-floored). */
const FILES_PROJECT = '545edc73-e3e6-402a-a594-a8da00701f09';

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

// ===========================================================================
// D-55 — every list row opens its own page
// ===========================================================================
test.describe('D-55 · the row opens the detail page', () => {
  test('M-13 → M-31 · a change-order row opens the change order', async ({ page }) => {
    await page.goto(`/m/p/${PROJECT}/changes`);
    const row = page.getByTestId('m-co-row').first();
    await expect(row).toBeVisible();
    await row.getByTestId('m-row-link').click();
    await expect(page).toHaveURL(new RegExp(`/m/p/${PROJECT}/changes/[0-9a-f-]{36}$`));
    await expect(page.getByTestId('m-co-detail')).toBeVisible();
  });

  test('M-14 → M-34 · a punch row opens the punch item', async ({ page }) => {
    await page.goto(`/m/p/${PROJECT}/punch`);
    const row = page.getByTestId('m-punch-row').first();
    await expect(row).toBeVisible();
    await row.getByTestId('m-row-link').click();
    await expect(page).toHaveURL(new RegExp(`/m/p/${PROJECT}/punch/[0-9a-f-]{36}$`));
    await expect(page.getByTestId('m-punch-detail')).toBeVisible();
  });

  test('M-18 → M-35 · an assignment row opens the member', async ({ page }) => {
    await page.goto(`/m/p/${PROJECT}/team`);
    const row = page.getByTestId('m-assignment-row').first();
    await expect(row).toBeVisible();
    await row.getByTestId('m-row-link').click();
    await expect(page).toHaveURL(/\/m\/team\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('m-member-detail')).toBeVisible();
  });

  test('M-28 → M-35 · the company roster reaches the same route', async ({ page }) => {
    // Two entry points, ONE route (§4.11.15). Asserted because a build that
    // gave each list its own destination would satisfy both navigation tests
    // and double the surface.
    await page.goto('/m/team');
    const row = page.getByTestId('m-member-row').first();
    await expect(row).toBeVisible();
    await row.getByTestId('m-row-link').click();
    await expect(page).toHaveURL(/\/m\/team\/[0-9a-f-]{36}$/);
  });

  test('M-29 → M-36 · the company directory reaches the contact', async ({ page }) => {
    await page.goto('/m/contacts');
    const row = page.getByTestId('m-contact-row').first();
    await expect(row).toBeVisible();
    await row.getByTestId('m-row-link').click();
    await expect(page).toHaveURL(/\/m\/contacts\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('m-contact-detail')).toBeVisible();
  });
});

// ===========================================================================
// §4.11.16 — "the WHOLE ROW opens the contact", and the circles survive
// ===========================================================================
test.describe('§4.11.16 · the row and the call button do not swallow each other', () => {
  test('M-17 · the whole row navigates — not just the phone element', async ({ page }) => {
    // The thing that was absent before this pass: ListRow was a plain <li> with
    // no href, and the only tappable things were the tel:/mailto: circles.
    await page.goto(`/m/p/${PROJECT}/contacts`);
    const row = page.getByTestId('m-project-contact-row').first();
    await expect(row).toBeVisible();
    await row.getByTestId('m-row-link').click();
    await expect(page).toHaveURL(/\/m\/contacts\/[0-9a-f-]{36}$/);
  });

  test('M-17 · the tel: circle is still a tel: link, not the row link', async ({ page }) => {
    // THE NESTED-ANCHOR REGRESSION. If the row link wrapped the circles, this
    // href would be the contact route and tapping "call" would navigate.
    await page.goto(`/m/p/${PROJECT}/contacts`);
    const tel = page.getByTestId('m-tel').first();
    if ((await tel.count()) === 0) test.skip(true, 'no project contact carries a phone');
    await expect(tel).toHaveAttribute('href', /^tel:/);
  });

  test('M-29 · the same, on the company directory', async ({ page }) => {
    await page.goto('/m/contacts');
    const tel = page.getByTestId('m-tel').first();
    if ((await tel.count()) === 0) test.skip(true, 'no contact carries a phone');
    await expect(tel).toHaveAttribute('href', /^tel:/);
    // And the row link is a sibling that points somewhere else entirely.
    const rowHref = await page.getByTestId('m-contact-row').first().getByTestId('m-row-link').getAttribute('href');
    expect(rowHref).toMatch(/^\/m\/contacts\/[0-9a-f-]{36}$/);
  });

  test('every row link and action circle clears §2\'s 44px floor', async ({ page }) => {
    await page.goto('/m/contacts');
    for (const testId of ['m-row-link', 'm-tel', 'm-mail']) {
      const el = page.getByTestId(testId).first();
      if ((await el.count()) === 0) continue;
      const box = await el.boundingBox();
      expect(box, `${testId} has no box`).not.toBeNull();
      expect(box!.height, `${testId} height`).toBeGreaterThanOrEqual(43.5);
    }
  });
});

// ===========================================================================
// M-31 — the money gate. UI-ONLY, and that is the point.
// ===========================================================================
test.describe('M-31 · net_delta is Owner/Admin/PM only (D-51), and it is UI-only (#117)', () => {
  async function firstCoUrl(page: Page): Promise<string> {
    await page.goto(`/m/p/${PROJECT}/changes`);
    const href = await page.getByTestId('m-co-row').first().getByTestId('m-row-link').getAttribute('href');
    return href!;
  }

  test('an owner sees the net delta', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(await firstCoUrl(page));
    await expect(page.getByTestId('m-co-net-delta')).toBeVisible();
  });

  test('a crew member reaches the SCREEN but sees no money anywhere on it', async ({ page }) => {
    // Reaching it is correct — D-53 keeps CO reading open to everyone but subs,
    // and bouncing crew would be Option C, rejected in §4.11.10a.
    const url = await firstCoUrl(page);
    await page.goto(url);
    await expect(page.getByTestId('m-co-detail')).toBeVisible();
    await expect(page.getByTestId('m-co-net-delta')).toHaveCount(0);
    await expect(page.getByTestId('m-co-line-total')).toHaveCount(0);
    // Belt and braces: no currency string anywhere in the content.
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    expect(body).not.toMatch(/[$£€]\s?\d/);
  });

  test('the signing token is never rendered', async ({ page }) => {
    // co_signing_sessions.token is a BEARER CREDENTIAL for the client's
    // signature and arrives in the payload (getCoSigningSessions select('*')).
    // A phone screen is where it gets photographed.
    await signInAs(page, OWNER);
    await page.goto(await firstCoUrl(page));
    const html = await page.content();
    // Tokens are long opaque strings; assert none of the signing-session
    // secrets leaked into the markup.
    expect(html).not.toMatch(/signing-token|"token"|signature_data|signer_ip/i);
  });
});

// ===========================================================================
// D-54 — hidden AND route-guarded. The guard is what is tested.
// ===========================================================================
test.describe('D-54 · a subcontractor is blocked from the four gated detail routes', () => {
  const GATED: Array<{ name: string; url: () => Promise<string> | string; backTo: RegExp }> = [];

  test('M-31 · typing the URL redirects, and the destination explains itself', async ({ page }) => {
    // Typed, not clicked. A hidden row is not a permission — this is what a
    // screenshot, a bookmark or a stale PWA cache would do.
    await page.goto(`/m/p/${PROJECT}/changes`);
    const href = await page.getByTestId('m-co-row').first().getByTestId('m-row-link').getAttribute('href');

    await signInAs(page, SUB);
    await page.goto(href!);
    await expect(page).toHaveURL(new RegExp(`/m/p/${PROJECT}/changes\\?denied=co$`));
    // A-66 — never a blank screen, never a silent bounce.
    await expect(page.getByTestId('m-denied')).toBeVisible();
    await expect(page.getByTestId('m-denied')).toContainText(/subcontractor/i);
  });

  test('M-36 · contact detail redirects with an explanation', async ({ page }) => {
    await page.goto('/m/contacts');
    const href = await page.getByTestId('m-contact-row').first().getByTestId('m-row-link').getAttribute('href');

    await signInAs(page, SUB);
    await page.goto(href!);
    await expect(page).toHaveURL(/\/m\/contacts\?denied=contact$/);
    await expect(page.getByTestId('m-denied')).toBeVisible();
  });

  test('M-35 · member detail redirects with an explanation', async ({ page }) => {
    await page.goto('/m/team');
    const href = await page.getByTestId('m-member-row').first().getByTestId('m-row-link').getAttribute('href');

    await signInAs(page, SUB);
    await page.goto(href!);
    await expect(page).toHaveURL(/\/m\/team\?denied=member$/);
    await expect(page.getByTestId('m-denied')).toBeVisible();
  });

  test('the row tap is ALSO hidden — D-54 step 1, on top of the guard', async ({ page }) => {
    await signInAs(page, SUB);
    // The LIST is still reachable (§4.11.10b: "Gets the list"), so this is not
    // a bounce — the rows are simply not links.
    await page.goto('/m/contacts');
    await expect(page.getByTestId('m-contact-row').first()).toBeVisible();
    await expect(page.getByTestId('m-row-link')).toHaveCount(0);

    await page.goto('/m/team');
    await expect(page.getByTestId('m-member-row').first()).toBeVisible();
    await expect(page.getByTestId('m-row-link')).toHaveCount(0);
  });

  test('the tap-to-act circles SURVIVE for a subcontractor', async ({ page }) => {
    // What a sub loses is the row navigation, not the ability to phone someone.
    // A build that hid the whole row would pass every assertion above.
    await signInAs(page, SUB);
    await page.goto('/m/contacts');
    const tel = page.getByTestId('m-tel').first();
    if ((await tel.count()) === 0) test.skip(true, 'no contact carries a phone');
    await expect(tel).toHaveAttribute('href', /^tel:/);
  });
});

// ===========================================================================
// M-34 is NOT gated — proving the guard was not over-applied
// ===========================================================================
test.describe('M-34 · a subcontractor DOES reach punch detail (D-52 corrected, D-57 narrows instead)', () => {
  test('the sub opens a punch item they are assigned, and is not redirected', async ({ page }) => {
    // The paired half of the gating tests. Without it, a build that gated all
    // five detail routes would pass every assertion above while reversing D-52.
    await signInAs(page, SUB);
    // The QA sub is assigned to the isolation-fixture project and D-57 lets
    // them see exactly the ASSIGNED and AUTHORED items there.
    await page.goto('/m/p/4a4f8567-67f8-4394-baae-181229974bd9/punch');
    const row = page.getByTestId('m-punch-row').first();
    await expect(row).toBeVisible();
    await row.getByTestId('m-row-link').click();
    await expect(page).toHaveURL(/\/punch\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('m-punch-detail')).toBeVisible();
    await expect(page.getByTestId('m-denied')).toHaveCount(0);
  });
});

// ===========================================================================
// M-16 — getSignedUrl actually gets called
// ===========================================================================
test.describe('M-16 · the file-open path exists (zero call sites before this pass)', () => {
  test('tapping a file requests a signed URL and navigates to it', async ({ page }) => {
    await page.goto(`/m/p/${FILES_PROJECT}/files`);
    const open = page.getByTestId('m-file-open').first();
    if ((await open.count()) === 0) test.skip(true, 'no non-photo file visible to this identity');

    // The request is the assertion: §4.11.6's "Tapping opens the signed URL"
    // was never true of the build, and the route handler is what makes it true.
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/files/signed-url')),
      open.click(),
    ]);
    const response = await request.response();
    expect(response?.status()).toBe(200);

    const body = (await response!.json()) as { url?: string };
    expect(body.url, 'the route returned no signed URL').toBeTruthy();
    // ⚠️ INLINE, NOT DOWNLOAD — ruled in §4.11.16. `?download=` would force a
    // save; previewing a plan on site is the field need.
    expect(body.url).not.toContain('download=');
  });

  test('a subcontractor gets no open control at all', async ({ page }) => {
    await signInAs(page, SUB);
    await page.goto(`/m/p/${FILES_PROJECT}/files`);
    await expect(page.getByTestId('m-file-open')).toHaveCount(0);
  });
});
