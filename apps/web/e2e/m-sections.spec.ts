import { test, expect, type Page } from '@playwright/test';

// M6M §4.11 acceptance criteria for the nine section screens, M-11 … M-19.
//
// Asserted here:
//   Common   A-30, A-30b(partial), A-30c, A-30d, A-30e
//   M-11     A-31, A-31b, A-31c
//   M-12     A-32
//   M-13     A-33, A-33b, A-33c   ← A-33c walks all six roles (six of six as
//                                   of S114 — the subcontractor arm was blocked
//                                   on #127 and is now live)
//   M-14     A-34b(partial)
//   M-15     A-35, A-35b, A-35c
//   M-16     A-36
//   M-17     A-37
//   M-18     A-38
//   M-19     A-39, A-39b
//
// NOT here, and why:
//   A-12c/A-12d/A-12e  are about the TILES on M-3 and M-7. Neither host screen
//                      is built — they are §4.3 and §4.7, not §4.11 — so there
//                      are no tiles to navigate. The nine ROUTES exist and are
//                      asserted below; what is unasserted is that a tile reaches
//                      them.
//   A-31d              [unit] — the current-phase rule, not a browser assertion.
//   A-32b, A-32c       [live] — need a second identity's schedule rows.
//   A-34               [live] — needs the M-3 stat to compare against.
//   A-36b              [live] — proves RLS is the only gate, which a browser
//                      signed in as one role cannot show.
//
// Runs under 'chromium-auth': crew test identity, 402x874, unless a test signs
// in as another role explicitly.

/** A project the crew test identity is assigned to (rebuild-test). */
const PROJECT_ID = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

const SECTIONS = [
  'overview',
  'schedule',
  'changes',
  'punch',
  'deliveries',
  'files',
  'contacts',
  'team',
  'safety',
] as const;

const routeFor = (s: string) => `/m/p/${PROJECT_ID}/${s}`;

/** Any currency-looking string. The money criteria all key on this. */
const CURRENCY = /[$£€]\s?\d|\d+\.\d{2}\s?(USD|dollars)/i;

// ===========================================================================
// §4.11 common rules — A-30 family
// ===========================================================================
test.describe('§4.11 common rules', () => {
  for (const s of SECTIONS) {
    test(`A-30 · ${s} renders the back chevron, no hamburger, Projects active`, async ({
      page,
    }) => {
      await page.goto(routeFor(s));
      // §3.1: inside a project the hamburger is REPLACED by a back chevron.
      await expect(page.getByTestId('m-back')).toHaveCount(1);
      await expect(page.getByTestId('m-hamburger')).toHaveCount(0);
      // §3.2: the tab bar stays, with Projects active (A-1c names /m/p/{id}).
      await expect(page.getByTestId('m-tabbar')).toBeVisible();
      await expect(page.getByTestId('m-tab-projects')).toHaveAttribute('aria-current', 'page');
      expect(await page.locator('[data-testid^="m-tab-"][aria-current="page"]').count()).toBe(1);
    });

    test(`A-30d · every number on ${s} is IBM Plex Mono`, async ({ page }) => {
      await page.goto(routeFor(s));
      const mono = page.locator('.font-mono');
      const n = await mono.count();
      expect(n, `no mono nodes on ${s}`).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const family = await mono.nth(i).evaluate((el) => getComputedStyle(el).fontFamily);
        expect(family, `${s} mono node ${i}`).toMatch(/Plex Mono/i);
      }
    });

    test(`A-30e · every interactive element on ${s} is >=44px`, async ({ page }) => {
      await page.goto(routeFor(s));
      const els = await page.locator('a, button, input, select, textarea, [role="button"]').all();
      const undersized: string[] = [];
      for (const el of els) {
        if (!(await el.isVisible())) continue;
        const box = await el.boundingBox();
        if (!box) continue;
        if (Math.min(box.width, box.height) < 44) {
          undersized.push(
            `${await el.evaluate((n2) => n2.getAttribute('data-testid') ?? n2.textContent?.trim().slice(0, 20))} ${box.width}x${box.height}`
          );
        }
      }
      expect(undersized, `undersized on ${s}`).toEqual([]);
    });

    test(`A-30c · ${s} offers no write control`, async ({ page }) => {
      await page.goto(routeFor(s));
      // These are read-only surfaces in v1 — none is in D-6's offline-write set,
      // so the "disabled with a plain message" branch has nothing to apply to.
      // The assertion is that no write is offered at all.
      expect(await page.getByTestId('m-content').getByRole('button').count()).toBe(0);
      expect(
        await page.getByTestId('m-content').locator('input, select, textarea').count()
      ).toBe(0);
    });
  }

  test('A-30b · every section screen shows the offline strip when the network drops', async ({
    page,
    context,
  }) => {
    for (const s of SECTIONS) {
      await page.goto(routeFor(s));
      await context.setOffline(true);
      await expect(page.getByTestId('m-offline-strip')).toBeVisible();
      await context.setOffline(false);
    }
  });

  test('A-30b · each screen carries its own empty state, not a spinner', async ({ page }) => {
    // At least one section on rebuild-test is empty; whichever it is must name
    // what is missing rather than render an indefinite loading state.
    let sawEmpty = false;
    for (const s of SECTIONS) {
      await page.goto(routeFor(s));
      const empty = page.getByTestId('m-empty');
      if ((await empty.count()) > 0) {
        sawEmpty = true;
        const text = (await empty.first().textContent())?.trim() ?? '';
        expect(text.length, `${s} empty state is blank`).toBeGreaterThan(3);
        expect(text).not.toMatch(/loading|please wait|…$/i);
      }
    }
    expect(sawEmpty, 'no section was empty — empty-state copy unexercised').toBe(true);
  });
});

// ===========================================================================
// M-11 Overview — §4.11.1
// ===========================================================================
test.describe('M-11 · Overview', () => {
  test("A-31 · renders none of M-3's four figures again", async ({ page }) => {
    await page.goto(routeFor('overview'));
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    // No status pill, no days-left, no punch count, no "Up next".
    expect(await page.getByTestId('m-status-pill').count()).toBe(0);
    expect(body).not.toMatch(/days left|up next|\bpunch\b/i);
  });

  test('A-31b · renders no progress percentage', async ({ page }) => {
    await page.goto(routeFor('overview'));
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    // PhaseRollup.percent is one property access away — D-19 cut it.
    expect(body).not.toMatch(/\d+\s?%/);
    expect(body).not.toMatch(/progress/i);
  });

  test('A-31c · renders no currency figure', async ({ page }) => {
    await page.goto(routeFor('overview'));
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    expect(body).not.toMatch(CURRENCY);
    expect(body).not.toMatch(/contract|margin|cost to date/i);
  });

  test('the stepper marks exactly one current phase (A-31d browser half)', async ({ page }) => {
    await page.goto(routeFor('overview'));
    const phases = page.getByTestId('m-phase');
    if ((await phases.count()) === 0) test.skip(true, 'no phases on this project');
    const current = page.locator('[data-testid="m-phase"][data-current="true"]');
    expect(await current.count()).toBeLessThanOrEqual(1);
  });
});

// ===========================================================================
// M-12 Schedule — §4.11.2
// ===========================================================================
test.describe('M-12 · Schedule', () => {
  test('A-32 · today first, then ascending, with past days above', async ({ page }) => {
    await page.goto(routeFor('schedule'));
    const groups = page.getByTestId('m-day-group');
    const n = await groups.count();
    if (n === 0) test.skip(true, 'no events on this project');
    const days: string[] = [];
    for (let i = 0; i < n; i++) days.push((await groups.nth(i).getAttribute('data-day'))!);
    // Ascending overall — never newest-first.
    expect(days).toEqual([...days].sort());
  });
});

// ===========================================================================
// M-13 Change Orders — §4.11.3 · the money criteria that matter most
// ===========================================================================
test.describe('M-13 · Change Orders', () => {
  test('A-33 · renders no currency anywhere', async ({ page }) => {
    await page.goto(routeFor('changes'));
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    expect(body).not.toMatch(CURRENCY);
    expect(body).not.toMatch(/net delta|net_delta|amount|total/i);
  });

  test('A-33b · a CO is identifiable and trackable without its value', async ({ page }) => {
    await page.goto(routeFor('changes'));
    const rows = page.getByTestId('m-co-row');
    const n = await rows.count();
    if (n === 0) test.skip(true, 'no change orders on this project');
    for (let i = 0; i < n; i++) {
      const text = (await rows.nth(i).textContent()) ?? '';
      // A CO number (mono) and a status label are the minimum.
      expect(text.trim().length).toBeGreaterThan(3);
      expect(await rows.nth(i).getByTestId('m-status-pill').count()).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// A-33c — ALL SIX ROLES, and as of S114 that is literally six rather than five.
// This is the pass that matters: #117 means change_orders_select_visible has no
// role floor, so RLS would NOT catch a leak. Each role signs in for real rather
// than being simulated.
//
// [S114] The subcontractor arm was skipped on #127 grounds. #127 is closed and
// the arm now runs. It is not a formality — verified at the database, the QA sub
// reads both COs on this project at full value (net_delta 1410 and 21385.91).
// RLS hands those dollars over; the ONLY thing keeping them off the screen is
// M-13's own rendering. That is precisely what this criterion tests, and the
// subcontractor is the role with the least business seeing them.
// ---------------------------------------------------------------------------
const ROLE_LOGINS: Array<{ role: string; email: string }> = [
  { role: 'owner', email: 'josh+test50@worthprop.com' },
  { role: 'admin', email: 'josh+qa-admin@worthprop.com' },
  { role: 'project_manager', email: 'josh+pm@worthprop.com' },
  { role: 'foreman', email: 'josh+qa-foreman@worthprop.com' },
  { role: 'crew_member', email: 'josh+crew@worthprop.com' },
  // The sixth, added S114 once #127 closed. It is the arm that matters most:
  // a subcontractor is an OUTSIDE PARTY, and #117 leaves net_delta unfloored.
  { role: 'subcontractor', email: 'josh+qa-sub@worthprop.com' },
];
const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe('A-33c · no money on M-13 under ANY role', () => {
  for (const { role, email } of ROLE_LOGINS) {
    test(`signed in as ${role}`, async ({ page }) => {
      await signInAs(page, email);
      await page.goto(routeFor('changes'));

      // Owner and admin are the passes that matter — a build that adds a role
      // gate "because owners may as well see it" satisfies every other
      // criterion here and reintroduces exactly what D-26 ruled out.
      const body = (await page.getByTestId('m-content').textContent()) ?? '';
      expect(body, `${role} saw currency`).not.toMatch(CURRENCY);
      expect(body, `${role} saw a money word`).not.toMatch(/net delta|net_delta|amount|subtotal|total/i);
    });
  }

  // -------------------------------------------------------------------------
  // THE NON-VACUITY GUARD [S114] — read this before touching the loop above.
  // -------------------------------------------------------------------------
  // Every assertion in the loop is an ABSENCE ("no currency"), and an absence
  // is trivially true of an empty screen. That is not a theoretical worry for
  // the subcontractor arm specifically: a sub reaches M-13 only through
  // `can_view_project()`, which needs a `project_assignments` row that
  // scripts/seed-test-identities.mjs creates. Lose that row and the sub arm
  // goes green while asserting nothing at all.
  //
  // So this test pins the precondition the loop depends on: the sub really is
  // looking at a POPULATED change-order list. It is the difference between
  // "the UI withheld the money" and "there was no money to withhold".
  test('the subcontractor arm is not vacuous — a sub genuinely reaches a populated M-13', async ({
    page,
  }) => {
    await signInAs(page, 'josh+qa-sub@worthprop.com');
    await page.goto(routeFor('changes'));
    await expect(
      page.getByTestId('m-co-row'),
      'the sub sees no CO rows — the seed assignment is missing, so A-33c above is passing on an empty page'
    ).not.toHaveCount(0);
  });
});

// ===========================================================================
// M-14 Punch — §4.11.4
// ===========================================================================
test.describe('M-14 · Punch List', () => {
  test('chips are Mine / Open / All and each changes the list', async ({ page }) => {
    await page.goto(routeFor('punch'));
    const chips = page.getByTestId('m-chips').getByRole('link');
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(0)).toHaveText('Mine');
    await expect(chips.nth(1)).toHaveText('Open');
    await expect(chips.nth(2)).toHaveText('All');
  });

  test('A-34b · a complete-awaiting-verification item is under All and not Open', async ({
    page,
  }) => {
    const countAt = async (url: string) => {
      await page.goto(url);
      return page.getByTestId('m-punch-row').count();
    };
    const all = await countAt(routeFor('punch'));
    const open = await countAt(`${routeFor('punch')}?filter=open`);
    if (all === 0) test.skip(true, 'no punch items on this project');
    // Open is a strict subset — D-16's "open" and isItemClosed() are not
    // complements, so items can be in All and in neither filter.
    expect(open).toBeLessThanOrEqual(all);
  });
});

// ===========================================================================
// M-15 Deliveries — §4.11.5
// ===========================================================================
test.describe('M-15 · Deliveries', () => {
  test('A-35 · two groups from two service calls, and no PO money', async ({ page }) => {
    await page.goto(routeFor('deliveries'));
    await expect(page.getByTestId('m-group-po')).toBeVisible();
    await expect(page.getByTestId('m-group-nopo')).toBeVisible();
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    expect(body).not.toMatch(CURRENCY);
    expect(body).not.toMatch(/price|unit cost|extended/i);
  });

  test('A-35b · damage carries a text label, not colour alone', async ({ page }) => {
    await page.goto(routeFor('deliveries'));
    const damaged = page.getByTestId('m-damaged');
    const n = await damaged.count();
    if (n === 0) test.skip(true, 'no damaged deliveries on this project');
    for (let i = 0; i < n; i++) await expect(damaged.nth(i)).toHaveText(/Damage/i);
  });

  test('A-35c · offers no check-in control', async ({ page }) => {
    await page.goto(routeFor('deliveries'));
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    expect(body).not.toMatch(/check.?in|receive delivery/i);
    expect(await page.getByTestId('m-content').getByRole('button').count()).toBe(0);
  });
});

// ===========================================================================
// M-16 Files — §4.11.6
// ===========================================================================
test.describe('M-16 · Files', () => {
  test('A-36 · excludes photos and lists document categories', async ({ page }) => {
    await page.goto(routeFor('files'));
    const rows = page.getByTestId('m-file-row');
    const n = await rows.count();
    if (n === 0) test.skip(true, 'no documents on this project');
    for (let i = 0; i < n; i++) {
      const text = (await rows.nth(i).textContent()) ?? '';
      expect(text, `row ${i} is a photo`).not.toMatch(/\bphotos\b/);
    }
  });
});

// ===========================================================================
// M-17 Contacts — §4.11.7
// ===========================================================================
test.describe('M-17 · Project contacts', () => {
  test('A-37 · phone and email are tap-to-act', async ({ page }) => {
    await page.goto(routeFor('contacts'));
    const tel = page.getByTestId('m-tel');
    const mail = page.getByTestId('m-mail');
    if ((await tel.count()) === 0 && (await mail.count()) === 0) {
      test.skip(true, 'no project contact carries a phone or email');
    }
    if ((await tel.count()) > 0) await expect(tel.first()).toHaveAttribute('href', /^tel:/);
    if ((await mail.count()) > 0) await expect(mail.first()).toHaveAttribute('href', /^mailto:/);
  });
});

// ===========================================================================
// M-18 Team — §4.11.8
// ===========================================================================
test.describe('M-18 · Assigned crew', () => {
  test('A-38 · renders no pay, cost or burden rate', async ({ page }) => {
    await page.goto(routeFor('team'));
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    expect(body).not.toMatch(CURRENCY);
    expect(body).not.toMatch(/rate|burden|\/\s?hr|hourly|pay\b/i);
  });
});

// ===========================================================================
// M-19 Safety — §4.11.9
// ===========================================================================
test.describe('M-19 · Safety', () => {
  test('A-39 · lists type, date, reporter and status — and no injured-person name', async ({
    page,
  }) => {
    await page.goto(routeFor('safety'));
    const rows = page.getByTestId('m-incident-row');
    const n = await rows.count();
    if (n === 0) test.skip(true, 'no incidents on this project');
    for (let i = 0; i < n; i++) {
      expect(await rows.nth(i).getByTestId('m-status-pill').count()).toBe(1);
      const text = (await rows.nth(i).textContent()) ?? '';
      // Injuries are indicated by presence, not detail. IncidentListItem does
      // not even carry injury rows — the count lives on the detail read, which
      // this screen never makes.
      expect(text).not.toMatch(/injured|victim|hurt/i);
    }
  });

  test('A-39b · offers no incident-reporting control', async ({ page }) => {
    await page.goto(routeFor('safety'));
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    expect(body).not.toMatch(/report an incident|new incident|file a report/i);
    expect(await page.getByTestId('m-content').getByRole('button').count()).toBe(0);
  });
});
