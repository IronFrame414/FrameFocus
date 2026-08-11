import { test, expect, type Page, type Locator } from '@playwright/test';
// Service role, carrying hub-fixture's rebuild-test guard. Used only by A-N44,
// which needs a real unread row to prove the badge reaches the shell.
import { adminClient } from './hub-fixture';

// M6M §10 acceptance criteria that the SHELL SLICE can carry.
//
// Asserted here: A-1, A-1c, A-2, A-3, A-3b, A-3c (negative half), A-3d, A-5,
// A-14b, and — added [S100] once D-36/D-38 landed — A-40, A-40b and A-43.
// Everything else in §10 needs a screen this slice does not build.
//
// NOT assertable here, and why:
//   A-3c (positive half) / A-41  need §4.13's six screens. The tiles point at
//        /m routes now, but those routes 404 until M-25 … M-30 are built, so the
//        sheet cannot be opened while standing on one of them.
//   A-42 … A-42d                 same reason — they are about those six screens.
//
// Runs under the 'chromium-auth' project (playwright.config.ts): signed in as
// the crew test identity, 402x874 — §2's reference canvas.

// The routes the shell exists on today. `/m` itself is a redirect, so it is
// exercised via its destination rather than listed.
const SHELL_ROUTES = ['/m/timeclock', '/m/projects', '/m/logs', '/m/field', '/m/offline'];

/**
 * §3.3's SIX tiles, in §3.3's order — copied from the spec line verbatim:
 *   "Tiles: Schedule · Expenses · Subs & Vendors · Team (count) · Contacts · Settings. Six."
 * Dashboard was the seventh and is CUT (D-38).
 */
// ⚠️ SEVEN [chat ND-36, S126]. Logs joined the sheet as it left the tab bar,
// and it is FIRST — §3.3 never ordered a seventh tile, and Logs is the one
// destination here a foreman reaches daily.
const SHEET_TILES = [
  'Logs',
  'Schedule',
  'Expenses',
  'Subs & Vendors',
  'Team',
  'Contacts',
  'Settings',
];

async function openSheet(page: Page) {
  // THE RETRY IS ABOUT HYDRATION, NOT ABOUT THE SHEET.
  //
  // The app bar is server-rendered, so the hamburger exists and is clickable
  // before React has attached its onClick. A click in that window is not slow —
  // it is LOST, and no timeout on the following assertion can recover it. Under
  // a loaded dev server (several spec files, one server, cold route compiles)
  // that window is wide enough to hit.
  //
  // toPass() re-runs the click until the sheet appears. THE ASSERTION IS
  // UNCHANGED — the sheet must still open; a build where it never opens fails
  // here exactly as before, just after a few more attempts.
  await expect(async () => {
    await page.getByTestId('m-hamburger').click();
    await expect(page.getByTestId('m-nav-sheet')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/** A real project id on rebuild-test. A-1c only needs the ROUTE SHAPE to resolve. */
const PROJECT_ID = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

// ===========================================================================
// A-1 — the tab bar renders on every /m/** route and does not scroll out of view
// ===========================================================================
// ===========================================================================
// /m STAYS ON /m — the S107 redirect-chain regression.
// ===========================================================================
// An authenticated request to /m must land in the MOBILE SHELL. It used to end
// at /dashboard, via a two-hop chain that no single file showed: the mobile
// layout could not refresh a stale session (a Server Component cannot persist
// cookies), redirected to /sign-in, and middleware bounced that to /dashboard.
//
// ⚠️ WHAT THIS CANNOT DO, stated so it is not mistaken for full cover: it runs
// on a FRESH token (auth.setup signs in immediately before), and the defect only
// appeared once the access token went stale — so this test would NOT have caught
// the original bug. The assertion that would have is structural, on the matcher
// contents, in test/middleware-matcher.test.ts. What this DOES catch is any
// future change that sends an authenticated /m visitor to the desktop app —
// a redirect added to the layout, a matcher rule that starts bouncing /m, or a
// regression in the D-12 landing.
test.describe('/m does not bounce an authenticated visitor to the desktop app', () => {
  test('bare /m lands on the mobile shell, not /dashboard', async ({ page }) => {
    await page.goto('/m');
    // D-12: /m redirects to the timeclock, and must stay under /m.
    await expect(page).toHaveURL(/\/m\/timeclock$/);
    await expect(page).not.toHaveURL(/\/dashboard/);
    // The shell itself rendered — a URL alone would not prove the mobile app
    // is what loaded.
    await expect(page.getByTestId('m-tabbar')).toBeVisible();
    // TEMPORARY [S133] — deliberate failure proving a shard failure turns the
    // workflow red. REVERTED IMMEDIATELY AFTER THE RUN.
    await expect(page.getByTestId('zz-deliberate-failure-s133')).toBeVisible({ timeout: 3000 });
  });

  test('a deep /m route is not bounced either', async ({ page }) => {
    await page.goto('/m/projects');
    await expect(page).toHaveURL(/\/m\/projects$/);
    await expect(page.getByTestId('m-tabbar')).toBeVisible();
  });
});

test.describe('A-1 · tab bar is present and locked on every /m route', () => {
  for (const route of SHELL_ROUTES) {
    test(`renders on ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId('m-tabbar')).toBeVisible();
    });
  }

  test('renders on the project hub', async ({ page }) => {
    await page.goto(`/m/p/${PROJECT_ID}`);
    await expect(page.getByTestId('m-tabbar')).toBeVisible();
  });

  test('/m redirects to /m/timeclock (D-12) and the bar is there too', async ({ page }) => {
    await page.goto('/m');
    await expect(page).toHaveURL(/\/m\/timeclock$/);
    await expect(page.getByTestId('m-tabbar')).toBeVisible();
  });

  test('does not scroll out of view', async ({ page }) => {
    await page.goto('/m/timeclock');
    const bar = page.getByTestId('m-tabbar');
    const before = await bar.boundingBox();

    // The shell confines scrolling to <main>, so scroll THAT — scrolling the
    // window would be a no-op and the assertion would pass without testing
    // anything. Force real overflow first so there is something to scroll.
    const content = page.getByTestId('m-content');
    await content.evaluate((el) => {
      const filler = document.createElement('div');
      filler.style.height = '4000px';
      el.appendChild(filler);
      el.scrollTop = el.scrollHeight;
    });
    // Confirm the scroll actually happened, or the rest proves nothing.
    expect(await content.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);

    const after = await bar.boundingBox();
    expect(after!.y).toBeCloseTo(before!.y, 0);
    await expect(bar).toBeInViewport();
  });
});

// ===========================================================================
// A-1c — the active tab reflects the current screen
// ===========================================================================
test.describe('A-1c · the active tab reflects the current screen', () => {
  const CASES: Array<{ route: string; active: string }> = [
    { route: '/m/timeclock', active: 'm-tab-timeclock' },
    // ⚠️ `/m/logs` REMOVED [chat ND-36, S126]. Superseded, quoted not
    // rewritten: `{ route: '/m/logs', active: 'm-tab-logs' },`. The Logs slot
    // left the bar when Chat took it, so there is no tab for that route to
    // light — and the criterion covering `/m/logs` is now A-C33 ("the bar
    // renders and NO slot carries the active state"), asserted in
    // m-chat-shell.spec.ts. A-1c itself was rewritten rather than satisfied,
    // because the Chat slot owns no screen to reflect.
    { route: '/m/projects', active: 'm-tab-projects' },
    { route: '/m/field', active: 'm-tab-field' },
  ];

  for (const { route, active } of CASES) {
    test(`${route} lights ${active}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId(active)).toHaveAttribute('aria-current', 'page');
      // Exactly one, not merely "at least this one".
      expect(await page.locator('[data-testid^="m-tab-"][aria-current="page"]').count()).toBe(1);
    });
  }

  // The clause A-1c names explicitly: "arriving at /m/p/{id} BY ANY PATH leaves
  // Projects active". Both paths are exercised, because a route-table build can
  // pass the direct one and fail the navigated one.
  test('/m/p/{id} reached by URL leaves Projects active', async ({ page }) => {
    await page.goto(`/m/p/${PROJECT_ID}`);
    await expect(page.getByTestId('m-tab-projects')).toHaveAttribute('aria-current', 'page');
    expect(await page.locator('[data-testid^="m-tab-"][aria-current="page"]').count()).toBe(1);
  });

  test('/m/p/{id} reached by in-app navigation leaves Projects active', async ({ page }) => {
    // Starts from Timeclock rather than Logs [chat ND-36, S126] — Logs no
    // longer owns a slot, so it could not have been lit to begin with. What the
    // test is actually for is unchanged: arriving at a project must MOVE the
    // active state, not merely fail to set it.
    await page.goto('/m/timeclock');
    await expect(page.getByTestId('m-tab-timeclock')).toHaveAttribute('aria-current', 'page');
    await page.goto(`/m/p/${PROJECT_ID}`);
    await expect(page.getByTestId('m-tab-projects')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('m-tab-timeclock')).not.toHaveAttribute('aria-current', 'page');
  });
});

// ===========================================================================
// A-2 — the tab bar is visible AND TAPPABLE through the open sheet
// ===========================================================================
test.describe('A-2 · the open sheet does not swallow the tab bar', () => {
  test('tapping Timeclock through the open sheet navigates', async ({ page }) => {
    await page.goto('/m/logs');
    await openSheet(page);

    // Visible is the easy half.
    await expect(page.getByTestId('m-tabbar')).toBeVisible();

    // Tappable is the criterion. A plain .click() would auto-scroll and force
    // its way through, which is exactly the failure this test exists to catch,
    // so the hit test is done first and explicitly: whatever is painted at the
    // centre of the Timeclock tab must BE the Timeclock tab.
    const tab = page.getByTestId('m-tab-timeclock');
    const box = (await tab.boundingBox())!;
    const hit = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x as number, y as number);
        return el?.closest('[data-testid]')?.getAttribute('data-testid') ?? null;
      },
      [box.x + box.width / 2, box.y + box.height / 2]
    );
    expect(hit).toBe('m-tab-timeclock');

    // And the tap lands and navigates, with the sheet open at the moment of it.
    await tab.click();
    await expect(page).toHaveURL(/\/m\/timeclock$/);
  });

  test('the scrim covers the content but not the tab bar', async ({ page }) => {
    await page.goto('/m/timeclock');
    await openSheet(page);

    const scrim = (await page.getByTestId('m-sheet-scrim').boundingBox())!;
    const bar = (await page.getByTestId('m-tabbar').boundingBox())!;
    // The scrim's bottom edge stops at or above the tab bar's top edge. This is
    // the layout fact that makes the tap above land; asserting it separately
    // means a regression names its own cause.
    expect(scrim.y + scrim.height).toBeLessThanOrEqual(bar.y + 1);
  });
});

// ===========================================================================
// A-3 / A-3b / A-3c — the sheet's contents
// ===========================================================================
// ⚠️ THREE, NOT FOUR [chat ND-36, S126]. A-3 was REWRITTEN, not repaired: it
// named Logs among the tiles that must NOT appear, and moving Logs into the
// sheet makes that false by design. The other three stay forbidden because the
// bar still owns them.
test.describe('A-3 · the sheet omits the three tab destinations', () => {
  for (const forbidden of ['Projects', 'Timeclock', 'Field']) {
    test(`no ${forbidden} tile`, async ({ page }) => {
      await page.goto('/m/timeclock');
      await openSheet(page);
      await expect(page.getByTestId(`m-sheet-tile-${forbidden}`)).toHaveCount(0);
      // Also by visible text, so a renamed testid cannot hide a re-added tile.
      await expect(
        page.getByTestId('m-sheet-grid').getByText(forbidden, { exact: true })
      ).toHaveCount(0);
    });
  }
});

test.describe('A-3b · the sheet holds exactly the seven named tiles + Sign out', () => {
  test('exactly seven tiles, in order, and nothing else', async ({ page }) => {
    await page.goto('/m/timeclock');
    await openSheet(page);

    const tiles = page.getByTestId('m-sheet-grid').getByRole('link');
    await expect(tiles).toHaveCount(SHEET_TILES.length);
    // toHaveText on the collection asserts CONTENT AND ORDER together. The Team
    // tile also renders its count badge, so each entry is a substring match.
    for (let i = 0; i < SHEET_TILES.length; i++) {
      await expect(tiles.nth(i)).toContainText(SHEET_TILES[i]);
    }
  });

  test('the full-width Sign out row is present', async ({ page }) => {
    await page.goto('/m/timeclock');
    await openSheet(page);

    const signOut = page.getByTestId('m-sign-out');
    await expect(signOut).toBeVisible();
    await expect(signOut).toHaveText(/sign out/i);

    // "Full-width" and "58px" are the spec's words, so they are measured.
    const row = (await signOut.boundingBox())!;
    const sheet = (await page.getByTestId('m-nav-sheet').boundingBox())!;
    expect(row.height).toBeCloseTo(58, 0);
    // Full width of the sheet's 18px content inset.
    expect(row.width).toBeCloseTo(sheet.width - 36, 0);
  });

  test('Sign out is not one of the seven tiles', async ({ page }) => {
    await page.goto('/m/timeclock');
    await openSheet(page);
    await expect(
      page.getByTestId('m-sheet-grid').getByText(/sign out/i)
    ).toHaveCount(0);
  });
});

test.describe('A-3c · current-location highlight', () => {
  test('no tile is highlighted while on a /m route, and none is mis-highlighted', async ({
    page,
  }) => {
    await page.goto('/m/timeclock');
    await openSheet(page);

    // NOTE ON WHAT THIS PROVES, UPDATED FOR §4.13.
    //
    // The tiles now point at /m routes, so a match is possible in principle —
    // that is what §4.13 changed. But /m/timeclock is NOT one of the six
    // destinations, so nothing should be highlighted here, and that is a real
    // assertion rather than the vacuous one it used to be: the previous version
    // passed because no tile COULD match anywhere; this one passes because none
    // matches on THIS route.
    //
    // A-3c's positive half is still not assertable in this slice — §4.13's six
    // screens are not built, so /m/expenses 404s and the sheet cannot be opened
    // standing on it. A-41 is the criterion that walks all six and it lands with
    // those screens, not with the shell.
    await expect(page.locator('[data-testid^="m-sheet-tile-"][data-current="true"]')).toHaveCount(
      0
    );
    await expect(page.locator('[data-testid^="m-sheet-tile-"][aria-current]')).toHaveCount(0);
  });
});

// ===========================================================================
// A-3d — dismissal
// ===========================================================================
test.describe('A-3d · the sheet closes', () => {
  test('tapping the scrim closes it', async ({ page }) => {
    await page.goto('/m/timeclock');
    await openSheet(page);

    // The scrim spans the whole content region and the panel sits ON it, so a
    // fixed offset can land on the panel instead (it did, at y=400 — the panel
    // is ~475px tall). Aim at exposed scrim: below the panel's bottom edge.
    const panel = (await page.getByTestId('m-nav-sheet').boundingBox())!;
    const scrim = (await page.getByTestId('m-sheet-scrim').boundingBox())!;
    const y = panel.y + panel.height + 30;
    // If the panel ever grows to fill the region there is no scrim left to tap,
    // and this test would silently start clicking the panel. Fail instead.
    expect(y).toBeLessThan(scrim.y + scrim.height - 5);

    await page.mouse.click(scrim.x + 20, y);
    await expect(page.getByTestId('m-nav-sheet')).toHaveCount(0);
  });

  test('tapping the hamburger closes it', async ({ page }) => {
    await page.goto('/m/timeclock');
    await openSheet(page);
    await page.getByTestId('m-hamburger').click();
    await expect(page.getByTestId('m-nav-sheet')).toHaveCount(0);
  });

  test('the hamburger reports its state to assistive tech', async ({ page }) => {
    await page.goto('/m/timeclock');
    const burger = page.getByTestId('m-hamburger');
    await expect(burger).toHaveAttribute('aria-expanded', 'false');
    await burger.click();
    await expect(burger).toHaveAttribute('aria-expanded', 'true');
  });
});

// ===========================================================================
// A-5 — every interactive element measures >=44px in its smallest dimension
// ===========================================================================
test.describe('A-5 · tap targets', () => {
  // §2's declared exception is the markup colour swatches (34px, 8px apart),
  // which live on M-10 — a screen this slice does not build. So on these routes
  // there is NO exception, and the floor is unconditional.
  const INTERACTIVE = 'a, button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';

  async function measureAll(page: Page): Promise<Array<{ id: string; w: number; h: number }>> {
    const els = await page.locator(INTERACTIVE).all();
    const out: Array<{ id: string; w: number; h: number }> = [];
    for (const el of els) {
      if (!(await el.isVisible())) continue;
      const box = await el.boundingBox();
      if (!box) continue;
      const id = await describe(el);
      out.push({ id, w: box.width, h: box.height });
    }
    return out;
  }

  async function describe(el: Locator): Promise<string> {
    return el.evaluate(
      (node) =>
        `${node.tagName.toLowerCase()}` +
        `[${node.getAttribute('data-testid') ?? node.getAttribute('aria-label') ?? (node.textContent ?? '').trim().slice(0, 24)}]`
    );
  }

  for (const route of SHELL_ROUTES) {
    test(`every interactive element on ${route} is >=44px`, async ({ page }) => {
      await page.goto(route);
      const measured = await measureAll(page);
      // Guard against a vacuous pass: a route where the selector matched
      // nothing would "pass" silently.
      expect(measured.length).toBeGreaterThan(4);
      const undersized = measured.filter((m) => Math.min(m.w, m.h) < 44);
      expect(undersized, `undersized targets: ${JSON.stringify(undersized)}`).toEqual([]);
    });
  }

  test('every interactive element on the project hub is >=44px', async ({ page }) => {
    await page.goto(`/m/p/${PROJECT_ID}`);
    const measured = await measureAll(page);
    expect(measured.length).toBeGreaterThan(4);
    expect(measured.filter((m) => Math.min(m.w, m.h) < 44)).toEqual([]);
  });

  test('every interactive element in the OPEN sheet is >=44px', async ({ page }) => {
    await page.goto('/m/timeclock');
    await openSheet(page);
    const measured = await measureAll(page);
    // Six tiles + sign out + scrim + hamburger + four tabs + camera = 14.
    // The floor is a vacuous-pass guard, not the assertion; A-3b owns the count.
    expect(measured.length).toBeGreaterThan(12);
    const undersized = measured.filter((m) => Math.min(m.w, m.h) < 44);
    expect(undersized, `undersized targets: ${JSON.stringify(undersized)}`).toEqual([]);
  });

  test('the shell hits its specified sizes exactly, not merely >=44', async ({ page }) => {
    await page.goto('/m/timeclock');

    // §3.1 — 44px hamburger.
    const burger = (await page.getByTestId('m-hamburger').boundingBox())!;
    expect(burger.width).toBeCloseTo(44, 0);
    expect(burger.height).toBeCloseTo(44, 0);

    // §3.2 — 66px amber camera circle, breaking the bar's top edge.
    const cam = (await page.getByTestId('m-camera').boundingBox())!;
    expect(cam.width).toBeCloseTo(66, 0);
    expect(cam.height).toBeCloseTo(66, 0);
    const bar = (await page.getByTestId('m-tabbar').boundingBox())!;
    expect(cam.y).toBeLessThan(bar.y); // it breaks the edge, it does not sit on it

    // §2 — 56px tab-bar items.
    const tab = (await page.getByTestId('m-tab-projects').boundingBox())!;
    expect(tab.height).toBeCloseTo(56, 0);

    // The 38px avatar assertion that stood here is GONE — D-36 cut the avatar,
    // so "it is a 38px div" is no longer a true statement about the app bar.
    // Its replacement is A-40 / A-40b below, which assert the absence rather
    // than the dimensions.
  });

  test('§3.3 tiles are 76px', async ({ page }) => {
    await page.goto('/m/timeclock');
    await openSheet(page);
    // Measures the FIRST tile by name rather than by index, and the name comes
    // from SHEET_TILES so it tracks §3.3. This previously named Dashboard,
    // which D-38 cut — a stale literal here would have failed as a missing
    // element rather than as the count mismatch A-3b is for.
    const tile = (await page.getByTestId(`m-sheet-tile-${SHEET_TILES[0]}`).boundingBox())!;
    expect(tile.height).toBeCloseTo(76, 0);
  });
});

// ===========================================================================
// A-40 / A-40b — the app bar after D-36 cut the avatar, AS AMENDED BY ND-14
// ===========================================================================
//
// ⚠️ BOTH CRITERIA ARE REWRITTEN, NOT DELETED, AND THIS IS WHY.
//
// _Superseded wording, quoted not rewritten:_
//   A-40  "the app bar renders NO right-hand element … no avatar, badge, icon
//          or button on the right"
//   A-40b "the app bar has EXACTLY ONE interactive control on every route"
//
// ND-13 as amended [S123, Josh] put a notifications bell in the app bar's right
// slot — the slot D-36 emptied — so "no right-hand element" and "exactly one
// control" now assert something deliberately untrue. Seven cases failed on
// exactly that and none of them were defects.
//
// THE JOB THESE CRITERIA DO SURVIVES THE AMENDMENT, which is why they are
// rewritten rather than dropped. D-36 cut the avatar for TWO reasons — it had
// no action, and at 38px it sat under §2/A-5's 44px floor — and the empty slot
// existed to stop both mistakes returning. Neither reason is retired by the
// bell: it has one unambiguous action and it is 44px. So the criteria become
// the narrowest statements that still catch the original edit:
//
//   A-40  no right-hand element OTHER than the bell, and the bell clears 44px.
//         Stops the avatar coming back and stops the slot becoming a dumping
//         ground for a second icon.
//   A-40b exactly TWO interactive controls, one per side — the left one
//         (hamburger XOR back) and the bell. A restored avatar is a THIRD
//         control and fails the count.
test.describe('A-40 · the app bar renders no right-hand element OTHER than the bell', () => {
  const ROUTES = [...SHELL_ROUTES, `/m/p/${PROJECT_ID}`];

  for (const route of ROUTES) {
    test(`only the bell on the right on ${route}`, async ({ page }) => {
      await page.goto(route);

      // Unchanged, and still the sharpest assertion in the file: the element
      // that used to be there, by its own testid. Fails if the avatar returns
      // exactly as it was.
      await expect(page.getByTestId('m-avatar')).toHaveCount(0);

      // The general form, because a restored avatar might be rebuilt under a
      // different testid. The app bar's own row is the scope.
      const bar = page.locator('header > div').first();
      const children = await bar.evaluate((el) =>
        Array.from(el.children).map((c) => c.getAttribute('data-testid') ?? c.tagName.toLowerCase())
      );
      // hamburger|back + title block + bell. Exactly THREE, in that order.
      // The count is the part that matters: a fourth child is the dumping
      // ground this criterion exists to prevent, whatever it is called.
      expect(children).toHaveLength(3);
      expect(['m-hamburger', 'm-back']).toContain(children[0]);
      expect(children[1]).toBe('div');
      expect(children[2]).toBe('m-bell');

      // A-5's 44px floor, on the element that is only allowed in this slot
      // because it clears it. THE AVATAR WAS 38px, and shipping a 38px bell
      // would reinstate half of D-36's defect in the very slot D-36 emptied —
      // with a test that passed, because "the bell is present" would still be
      // true. Asserted as the floor rather than as `=== 44` so a future 48px
      // target is not a failure; the component ships exactly 44.
      const bell = (await page.getByTestId('m-bell').boundingBox())!;
      expect(bell.width, `bell width on ${route}`).toBeGreaterThanOrEqual(44);
      expect(bell.height, `bell height on ${route}`).toBeGreaterThanOrEqual(44);
    });
  }
});

test.describe('A-40b · the hamburger or the back chevron, never both', () => {
  test('company-scoped routes carry the hamburger only', async ({ page }) => {
    for (const route of SHELL_ROUTES) {
      await page.goto(route);
      await expect(page.getByTestId('m-hamburger')).toHaveCount(1);
      await expect(page.getByTestId('m-back')).toHaveCount(0);
    }
  });

  test('a project route carries the back chevron only', async ({ page }) => {
    await page.goto(`/m/p/${PROJECT_ID}`);
    await expect(page.getByTestId('m-back')).toHaveCount(1);
    await expect(page.getByTestId('m-hamburger')).toHaveCount(0);
  });

  test('the app bar has exactly TWO interactive controls — one per side', async ({ page }) => {
    // _Superseded: "exactly ONE interactive control on every route."_ The
    // second is THE NOTIFICATIONS BELL (ND-13 as amended), and naming it is the
    // point — a bare `toBe(2)` would be satisfied by a restored avatar sitting
    // next to the hamburger with the bell missing entirely, which is precisely
    // the edit D-36 was written to stop.
    for (const route of [...SHELL_ROUTES, `/m/p/${PROJECT_ID}`]) {
      await page.goto(route);
      const controls = page.locator('header').locator('a, button, [role="button"]');
      // The offline strip is inside <header> too, but only while offline; these
      // runs are online, so the app bar is the whole of it.
      expect(await controls.count(), `on ${route}`).toBe(2);

      // WHICH two, not just how many.
      const ids = await controls.evaluateAll((els) =>
        els.map((e) => e.getAttribute('data-testid') ?? e.tagName.toLowerCase())
      );
      expect(['m-hamburger', 'm-back'], `left control on ${route}`).toContain(ids[0]);
      expect(ids[1], `right control on ${route}`).toBe('m-bell');
    }
  });

  test('A-N44 · the badge is absent at zero and shows the count when there is one', async ({
    page,
  }) => {
    // A BELL THAT NEVER SHOWS A COUNT IS NOT THE FEATURE. The unit suite covers
    // the three render states off a prop; this covers the thing only the real
    // shell can answer — that the layout's getUnreadCount() actually reaches
    // the badge for the signed-in user. Those are different claims, and the
    // second one is the one that breaks when a query is scoped wrong.
    //
    // Seeded through the SERVICE ROLE via adminClient(), which carries the
    // rebuild-test guard, and removed in `finally` so a mid-test failure cannot
    // leave the crew identity with a permanent unread badge that quietly makes
    // the zero-state half of this test unrunnable ever after.
    const admin = adminClient();

    const { data: profile } = await admin
      .from('profiles')
      .select('id, company_id')
      .eq('email', 'josh+crew@worthprop.com')
      .eq('is_deleted', false)
      .single();

    // Guard the fixture: a leftover unread row would make the zero-state
    // assertion below fail for a reason that is not the bell's fault.
    const { count: preexisting } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_profile_id', profile!.id)
      .is('read_at', null);
    expect(preexisting ?? 0, 'crew must start with no unread notifications').toBe(0);

    // ZERO STATE FIRST — an always-present "0" trains people to ignore the
    // control and would pass any "the badge exists" assertion.
    await page.goto('/m/timeclock');
    await expect(page.getByTestId('m-bell')).toHaveCount(1);
    await expect(page.getByTestId('m-bell-badge')).toHaveCount(0);

    let seededId: string | null = null;
    try {
      const { data: row, error } = await admin
        .from('notifications')
        .insert({
          company_id: profile!.company_id,
          recipient_profile_id: profile!.id,
          type: 'assignment',
          title: 'A-N44 badge fixture',
        })
        .select('id')
        .single();
      expect(error?.message ?? null, 'badge fixture insert').toBeNull();
      seededId = row!.id;

      await page.goto('/m/timeclock');
      const badge = page.getByTestId('m-bell-badge');
      await expect(badge).toHaveCount(1);
      await expect(badge).toHaveText('1');

      // The badge must not push the tap target off the 44px floor — it is
      // absolutely positioned for exactly this reason, and a layout-flow badge
      // would shrink or stretch the bell without changing any count.
      const bell = (await page.getByTestId('m-bell').boundingBox())!;
      expect(bell.width).toBeGreaterThanOrEqual(44);
      expect(bell.height).toBeGreaterThanOrEqual(44);
    } finally {
      if (seededId) await admin.from('notifications').delete().eq('id', seededId);
    }
  });

  test('the bell NAVIGATES — it is a link, not a menu button', async ({ page }) => {
    // The other shape D-36's edit could return in: keep the count at two but
    // make the right-hand control open a popover. A menu in the app bar is the
    // avatar's behaviour wearing a different icon, so the criterion asserts the
    // element kind and destination rather than only the tally.
    await page.goto('/m/timeclock');
    const bell = page.getByTestId('m-bell');
    await expect(bell).toHaveJSProperty('tagName', 'A');
    await expect(bell).toHaveAttribute('href', '/m/notifications');
  });
});

// ===========================================================================
// A-43 — Dashboard is cut (D-38): no tile AND no route
// ===========================================================================
test.describe('A-43 · Dashboard is cut', () => {
  test('the sheet renders no Dashboard tile', async ({ page }) => {
    await page.goto('/m/timeclock');
    await openSheet(page);
    await expect(page.getByTestId('m-sheet-tile-Dashboard')).toHaveCount(0);
    await expect(
      page.getByTestId('m-sheet-grid').getByText('Dashboard', { exact: true })
    ).toHaveCount(0);
  });

  test('/m/dashboard does not resolve', async ({ page }) => {
    const response = await page.goto('/m/dashboard');
    // A tile with no route is an inert tile; a route with no tile is an orphan.
    // A-43 asserts both halves, so this is the second one.
    expect(response?.status()).toBe(404);
  });
});

// ===========================================================================
// A-14b — tapping the status strip navigates to M-4
// ===========================================================================
test.describe('A-14b · the offline strip reaches M-4', () => {
  test('the strip is absent while online', async ({ page }) => {
    await page.goto('/m/timeclock');
    await expect(page.getByTestId('m-offline-strip')).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // A-14b IS SPLIT IN TWO, AND THE SPLIT IS A FINDING, NOT A CONVENIENCE.
  //
  // "Tapping the status strip navigates to M-4" has two halves, and this slice
  // can only carry one of them end to end:
  //
  //   (1) the strip renders while the transport is genuinely down, and points
  //       at M-4 — asserted below with context.setOffline(true);
  //   (2) the tap lands and M-4 renders — asserted below with the APP believing
  //       it is offline while the transport still works.
  //
  // They are separate because with the transport truly down the navigation
  // CANNOT be served: there is no service worker in this slice, so Next has to
  // fetch /m/offline's RSC payload over a dead network. The first version of
  // this test proved exactly that — it landed on chrome-error://chromewebdata/.
  // Priming the client router cache does not help either: every page.goto is a
  // full document load, which discards it.
  //
  // So the real, un-fudged status is: A-14b's wiring is asserted; A-14b under a
  // genuinely dead network cannot pass until the service worker lands. Recorded
  // here rather than hidden behind a test that only looks green.
  // -------------------------------------------------------------------------

  test('with the transport down, the strip renders and points at M-4', async ({
    page,
    context,
  }) => {
    await page.goto('/m/timeclock');
    await context.setOffline(true);

    const strip = page.getByTestId('m-offline-strip');
    await expect(strip).toBeVisible();

    // §4.4's parts: dot + "Offline · last synced {h:mm}" + a queued-count pill.
    await expect(strip).toContainText(/Offline · last synced/);
    await expect(page.getByTestId('m-queued-pill')).toBeVisible();

    // The wiring itself, independent of whether the network can serve it.
    await expect(strip).toHaveAttribute('href', '/m/offline');

    await context.setOffline(false);
  });

  test('tapping the strip navigates to M-4 and M-4 renders', async ({ page }) => {
    await page.goto('/m/timeclock');

    // The APP-LEVEL offline condition — which is what §4.4's strip actually
    // keys on — without killing the transport. navigator.onLine is stubbed and
    // the offline event fired, exactly as a real disconnect would do, so the
    // component under test takes the identical code path.
    await page.evaluate(() => {
      Object.defineProperty(window.navigator, 'onLine', {
        value: false,
        configurable: true,
      });
      window.dispatchEvent(new Event('offline'));
    });

    const strip = page.getByTestId('m-offline-strip');
    await expect(strip).toBeVisible();

    await strip.click();
    await expect(page).toHaveURL(/\/m\/offline$/);

    // M-4's own content, per §4.4. Addressed by ROLE, not by text: "No
    // connection" legitimately appears twice on this screen — as §4.4's 23px
    // heading and as §3.1's app-bar sub-line — and a bare text locator matches
    // both. Scoping to the heading also means this keeps testing §4.4's block
    // rather than passing on the app bar alone.
    await expect(page.getByRole('heading', { name: 'No connection' })).toBeVisible();
    await expect(page.getByTestId('m-waiting-to-sync')).toBeVisible();
    await expect(page.getByTestId('m-try-again')).toBeVisible();
    await expect(page.getByTestId('m-keep-working')).toBeVisible();
  });

  test('the strip is app-wide, not only on M-4 (the A-14 half this slice can carry)', async ({
    page,
    context,
  }) => {
    // A-14 proper names the projects list, the project hub and the timeclock —
    // two of which are unbuilt screens. What IS assertable now is that the
    // strip comes from the SHELL and therefore renders on every /m route,
    // which is the mechanism A-14 depends on.
    for (const route of ['/m/timeclock', '/m/projects', '/m/logs', '/m/field']) {
      // Load the route first, THEN pull the network — a cold load with the
      // transport already down cannot be served without a service worker, and
      // that is a different (later) slice's problem, not this assertion's.
      await page.goto(route);
      await context.setOffline(true);
      await expect(page.getByTestId('m-offline-strip')).toBeVisible();
      await context.setOffline(false);
    }
  });
});
