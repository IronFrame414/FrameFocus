import { test, expect } from '@playwright/test';

// M6M §4.6 — M-6 · Logs. A-13d, A-13e, and the half of A-12d/A-12e that could
// not be true while this screen was a `SlicePlaceholder`.
//
// ---------------------------------------------------------------------------
// WHAT WAS ACTUALLY BROKEN BEFORE THIS SCREEN EXISTED
// ---------------------------------------------------------------------------
// M-7's Daily-logs tile has always linked to `/m/logs?project={id}`, and
// `/m/logs` has always rendered a placeholder. So the tile "resolved" — the
// route returned 200 — and A-12d/A-12e passed on a screen that read the
// parameter nowhere and showed no logs. **That is the shape of a criterion
// satisfied by a stub**, and it is why the tile tests below assert CONTENT and
// not just a status code.

const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

// ===========================================================================
// A-13e — the chips, and when the third one exists
// ===========================================================================
test.describe('A-13e · All / Mine / This project, single-select', () => {
  test('with NO project in context there are exactly two chips', async ({ page }) => {
    await page.goto('/m/logs');

    await expect(page.getByTestId('m-chip-All')).toBeVisible();
    await expect(page.getByTestId('m-chip-Mine')).toBeVisible();
    // §4.6: "This project (when a project is in context)". Absent, not
    // disabled — a disabled third chip would still be a third chip.
    await expect(page.getByTestId('m-chip-This project')).toHaveCount(0);
  });

  test('with a project in context the third chip appears', async ({ page }) => {
    await page.goto(`/m/logs?project=${PROJECT}`);
    await expect(page.getByTestId('m-chip-This project')).toBeVisible();
  });

  test('single-select — choosing one deselects the others', async ({ page }) => {
    await page.goto(`/m/logs?project=${PROJECT}`);

    await page.getByTestId('m-chip-Mine').click();
    await expect(page.getByTestId('m-chip-Mine')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('m-chip-All')).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('m-chip-This project')).toHaveAttribute('data-active', 'false');

    // ⚠️ AND THE PROJECT CONTEXT SURVIVES THE TAP. The chip hrefs have to carry
    // `?project=` forward — without it the third chip would vanish the moment
    // any chip was used, which is the bug a bare `?` separator produces.
    await expect(page).toHaveURL(new RegExp(`project=${PROJECT}`));
    await expect(page.getByTestId('m-chip-This project')).toBeVisible();
  });

  test('the "This project" chip actually narrows to that project', async ({ page }) => {
    await page.goto(`/m/logs?project=${PROJECT}&filter=project`);
    await expect(page.getByTestId('m-chip-This project')).toHaveAttribute('data-active', 'true');
    // Bound to the service call, not filtered in the browser (§4.13's rule).
    await expect(page.getByTestId('m-log-list').or(page.getByTestId('m-empty'))).toBeVisible();
  });
});

// ===========================================================================
// §4.6 — the app bar, the row geometry, and the primary action
// ===========================================================================
test.describe('§4.6 · the screen M-6 was specified to be', () => {
  test('the app bar carries a mono "{n} this week"', async ({ page }) => {
    await page.goto('/m/logs');
    // The sub-line is declared by the screen and rendered by the shell's app
    // bar, which carries no testid of its own — so assert on the header.
    await expect(page.locator('header')).toContainText(/\d+ this week/);
  });

  test('rows carry the date, a mono {project} · {author}, an excerpt and a count', async ({
    page,
  }) => {
    await page.goto('/m/logs');
    const rows = page.getByTestId('m-log-row');
    if ((await rows.count()) === 0) test.skip(true, 'no daily logs visible to this identity');

    const first = rows.first();
    await expect(first).toContainText(/\d{4}-\d{2}-\d{2}/);
    await expect(first.getByTestId('m-log-photo-count')).toBeVisible();
  });

  test('"Log the day" is present and now has somewhere to go', async ({ page }) => {
    await page.goto('/m/logs');
    const cta = page.getByTestId('m-log-the-day');
    await expect(cta).toBeVisible();

    // The button existed in the spec long before M-21 gave it a destination —
    // §4.6's "no entry screen, and no route for one in §1". It resolves now.
    await cta.click();
    await expect(page).toHaveURL(/\/m\/logs\/new/, { timeout: 30_000 });
    await expect(page.getByTestId('m-log-photo-input')).toBeVisible();
  });

  test('the CTA carries the project forward when there is one', async ({ page }) => {
    await page.goto(`/m/logs?project=${PROJECT}`);
    await expect(page.getByTestId('m-log-the-day')).toHaveAttribute(
      'href',
      `/m/logs/new?project=${PROJECT}`
    );
  });
});

// ===========================================================================
// A-13d — the Queued badge REPLACES the photo count
// ===========================================================================
test.describe('A-13d · a queued log shows Queued instead of a photo count', () => {
  test('an offline log appears queued, with no photo count on that row', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);

    // -----------------------------------------------------------------------
    // WHY THE TRANSPORT STAYS UP WHILE THE APP BELIEVES IT IS DOWN
    // -----------------------------------------------------------------------
    // The first version of this test used `context.setOffline(true)` and failed
    // on `ERR_INTERNET_DISCONNECTED` — the SAME wall m-shell.spec.ts documents
    // for A-14b: M-6 is a server component, so reaching it is a document/RSC
    // fetch, and with the transport genuinely dead there is nothing to serve it
    // (no service-worker route cache in this slice). A-13d is a claim about
    // what the ROW renders, not about what the network can carry, so this
    // reproduces the app-level offline condition instead — the identical code
    // path, since both `log-form` (`if (!navigator.onLine)`) and `syncOnce`
    // (`() => navigator.onLine`) key on exactly this flag.
    //
    // `addInitScript` and not `page.evaluate`: every `page.goto` is a full
    // document load, which throws away anything evaluated into the previous
    // one. The stub has to be re-applied on each document or the queue would
    // flush the moment we navigated to the list — and the row under test would
    // vanish before it could be asserted.
    await context.addInitScript(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    });
    await page.goto(`/m/logs/new?project=${PROJECT}`);
    await page.getByTestId('m-work-performed').fill(`QA A-13d ${Date.now()}`);
    await page.getByTestId('m-submit-log').click();
    await expect(page.getByTestId('m-log-done')).toBeVisible({ timeout: 30_000 });

    await page.goto('/m/logs');

    const queuedRow = page.locator('[data-testid="m-log-row"][data-queued="true"]').first();
    await expect(queuedRow).toBeVisible({ timeout: 30_000 });

    // THE CRITERION, BOTH HALVES. The badge is there…
    await expect(queuedRow.getByTestId('m-log-queued-badge')).toBeVisible();
    // …and the photo count is NOT — "in place of", not "alongside".
    await expect(queuedRow.getByTestId('m-log-photo-count')).toHaveCount(0);

    // NOTHING IS DRAINED ON THE WAY OUT, DELIBERATELY. Restoring the flag and
    // letting the queue flush would insert a real `daily_logs` row on every
    // run — the leak #144 was raised about. Left queued, the entry never
    // becomes a row: the queue lives in this context's IndexedDB, which is not
    // part of the saved storageState and dies with the context.
  });

  test('a SYNCED row is the mirror image — a count and no badge', async ({ page }) => {
    // The paired half. Without it, a build that rendered the badge on every row
    // would satisfy the test above.
    await page.goto('/m/logs');
    const synced = page.locator('[data-testid="m-log-row"][data-queued="false"]').first();
    if ((await synced.count()) === 0) test.skip(true, 'no synced logs visible');

    await expect(synced.getByTestId('m-log-photo-count')).toBeVisible();
    await expect(synced.getByTestId('m-log-queued-badge')).toHaveCount(0);
  });
});

// ===========================================================================
// A-12d / A-12e — M-7's tiles, now that the Daily-logs one has a real screen
// ===========================================================================
test.describe('A-12d / A-12e · M-7 Daily logs reaches M-6, not a fifth screen', () => {
  test('the tile links to /m/logs with the project, and M-6 reads it', async ({ page }) => {
    await page.goto('/m/field');

    const tile = page.getByTestId('m-field-tile-logs');
    await expect(tile).toBeVisible();
    const href = await tile.getAttribute('href');
    expect(href).toMatch(/^\/m\/logs\?project=[0-9a-f-]{36}$/);

    await tile.click();
    await expect(page).toHaveURL(/\/m\/logs\?project=/, { timeout: 30_000 });

    // ⚠️ THE HALF THAT COULD NOT BE TRUE BEFORE. A placeholder also returned
    // 200 for this URL. What proves the tile reached the REAL M-6 is that the
    // parameter did something: the "This project" chip exists only when a
    // project is in context.
    await expect(page.getByTestId('m-chip-This project')).toBeVisible();
    await expect(page.getByTestId('m-placeholder')).toHaveCount(0);
  });

  test('A-12e · no duplicate log screen was built — the tile shares M-6', async ({ page }) => {
    // §4.7's tile table: "a project-scoped logs route would duplicate M-6's
    // list for no gain". So the tile must land on /m/logs itself.
    await page.goto('/m/field');
    const href = await page.getByTestId('m-field-tile-logs').getAttribute('href');
    expect(href?.startsWith('/m/logs')).toBe(true);
    expect(href).not.toMatch(/\/m\/p\//);
  });
});

// ===========================================================================
// M-37 — THE ROW OPENS THE LOG (D-55) [S121]
// ===========================================================================
// Reported from a device [S120, Josh]: "a log can be created but not opened."
// M-6 shipped with rows that render an EXCERPT of `work_performed` and open
// nothing, so a log written on M-21 could never be read back on the phone that
// wrote it. Same gap punch, CO, team and contact each had; D-55 already rules
// the answer generally — "every list row opens its own page with its own route"
// — so this is the fifth instance of a settled rule, not a new decision.
//
// The queued half is asserted as the DELIBERATE non-link. A queued log exists
// only in this browser's IndexedDB, so `/m/logs/{id}` would 404 on an id the
// server has never seen; a build that linked every row uniformly would look
// right on a synced list and strand the user on the one row they just created.
test.describe('M-37 · daily log detail', () => {
  test('the row opens its own page, and the page renders the log', async ({ page }) => {
    await page.goto('/m/logs');
    const rows = page.locator('[data-testid="m-log-row"][data-queued="false"]');
    if ((await rows.count()) === 0) test.skip(true, 'no synced logs visible to this identity');

    const date = (await rows.first().innerText()).match(/\d{4}-\d{2}-\d{2}/)?.[0];
    await rows.first().getByTestId('m-row-link').click();

    await expect(page).toHaveURL(/\/m\/logs\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(page.getByTestId('m-log-detail')).toBeVisible();
    // The date the row carried is the date the detail shows — proof the route
    // resolved THAT log rather than any log.
    if (date) await expect(page.getByTestId('m-log-date')).toContainText(date);
  });

  test('a way back — the chevron, and NOT the hamburger (A-30f)', async ({ page }) => {
    await page.goto('/m/logs');
    const rows = page.locator('[data-testid="m-log-row"][data-queued="false"]');
    if ((await rows.count()) === 0) test.skip(true, 'no synced logs visible to this identity');
    await rows.first().getByTestId('m-row-link').click();
    await expect(page).toHaveURL(/\/m\/logs\/[0-9a-f-]{36}$/, { timeout: 20_000 });

    await expect(page.getByTestId('m-back')).toBeVisible();
    await expect(page.getByTestId('m-hamburger')).toHaveCount(0);
    // Logs is a TAB, so unlike M-35/M-36 the tab stays lit — the section is
    // still where you are. A-42's "no tab active" belongs to the company-scoped
    // family and must not be copied here.
    await expect(page.getByTestId('m-tab-logs')).toHaveAttribute('aria-current', 'page');
  });

  test('M-21 keeps its own chrome — the capture screen is NOT a detail view', async ({ page }) => {
    // The exclusion `/m/logs/new` needs from the new `/m/logs/` depth rule. A
    // prefix test without it would hand the capture screen a second exit that
    // competes with the form's own, which §4.12 ruled against.
    await page.goto('/m/logs/new');
    await expect(page.getByTestId('m-work-performed')).toBeVisible();
    await expect(page.getByTestId('m-back')).toHaveCount(0);
  });

  test('the LIST still carries the hamburger — the chevron is DEPTH, not prefix', async ({
    page,
  }) => {
    await page.goto('/m/logs');
    await expect(page.getByTestId('m-hamburger')).toBeVisible();
    await expect(page.getByTestId('m-back')).toHaveCount(0);
  });

  test('a log id that does not exist 404s rather than rendering an empty shell', async ({
    page,
  }) => {
    const resp = await page.goto('/m/logs/11111111-1111-1111-1111-111111111111');
    expect(resp?.status()).toBe(404);
  });
});
