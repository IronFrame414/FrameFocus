import { test, expect, type Page } from '@playwright/test';
import { signInAs } from './sign-in-as';

// M6M §4.13 acceptance criteria for ALL SIX hamburger destinations.
// M-25/27/28/29 landed in 13b1a8e; M-26 and M-30 complete the set.
//
// Asserted here:
//   M-25 Schedule        A-44, A-44b(partial), A-44c, A-44d, A-44e
//   M-27 Subs & Vendors  A-46, A-46b, A-46c, A-46d, A-46e
//   M-28 Team            A-47, A-47b, A-47c, A-47d, A-47e
//   M-29 Contacts        A-49, A-49b, A-49c, A-49d
//   M-26 Expenses        A-45, A-45b, A-45b2, A-45c, A-45d, A-45e, A-45f, A-45g, A-45h
//   M-30 Settings        A-48, A-48b, A-48c, A-48d, A-48e
//   §2 tokens            A-50 (D-46's money format)
//   Common               A-41, A-42, A-42b, A-42c(partial), A-42d — SIX OF SIX
//
// A-45b2 IS here as of S114, and it asserts the OPPOSITE of what it originally
// said. Two things changed since that criterion was written:
//   - #127 closed [S113], so a real subcontractor identity exists to sign in as.
//   - RULING 1 [Josh, S106], migration 20260827000000, took subcontractors out
//     of `expenses` ENTIRELY — author-own arm included, plus an INSERT floor.
// A-45b2 as authored [S102, D-47] said a sub sees "own plus assigned-project
// expenses"; that rule is withdrawn, and the criterion has been corrected in the
// spec. The DB half lives in test/s114-subcontractor-surfaces.live.ts; what is
// asserted here is the SCREEN half — an empty state, not a broken one.
//
// Runs under 'chromium-auth': signed in as the crew test identity, 402x874.

// All SIX §4.13 destinations are built as of S102 — A-41 and A-42 are now
// reachable at six of six rather than four.
// ⚠️ SEVEN [chat ND-36, S126] — `/m/logs` joins the walk, because it became a
// hamburger destination when Chat took its tab slot. A-41 and A-42 were both
// rewritten from six routes to seven; A-42's count would otherwise have failed
// silently as an off-by-one.
const BUILT = [
  '/m/logs',
  '/m/schedule',
  '/m/expenses',
  '/m/subs',
  '/m/team',
  '/m/contacts',
  '/m/settings',
];

async function openSheet(page: Page) {
  await page.getByTestId('m-hamburger').click();
  await expect(page.getByTestId('m-nav-sheet')).toBeVisible();
}

// ===========================================================================
// §4.13 common rules — A-41 / A-42 family, now partially reachable
// ===========================================================================
test.describe('§4.13 common rules on the built screens', () => {
  for (const route of BUILT) {
    test(`A-42 · no tab is active on ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId('m-tabbar')).toBeVisible();
      // None of the six destinations is owned by Projects/Timeclock/Logs/Field.
      expect(await page.locator('[data-testid^="m-tab-"][aria-current="page"]').count()).toBe(0);
    });

    test(`A-42b · ${route} carries the hamburger, not a back chevron`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId('m-hamburger')).toHaveCount(1);
      await expect(page.getByTestId('m-back')).toHaveCount(0);
    });

    test(`A-42d · every number on ${route} renders in IBM Plex Mono`, async ({ page }) => {
      await page.goto(route);
      // Every element the screens mark as mono must RESOLVE to Plex Mono —
      // computed font-family, not the class name in the markup.
      const monoish = page.locator('.font-mono');
      const n = await monoish.count();
      expect(n, `no mono nodes on ${route}`).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const family = await monoish.nth(i).evaluate((el) => getComputedStyle(el).fontFamily);
        expect(family, `mono node ${i} on ${route}`).toMatch(/Plex Mono/i);
      }
    });

    test(`A-5 · every interactive element on ${route} is >=44px`, async ({ page }) => {
      await page.goto(route);
      const els = await page
        .locator('a, button, input, select, textarea, [role="button"]')
        .all();
      const undersized: string[] = [];
      for (const el of els) {
        if (!(await el.isVisible())) continue;
        const box = await el.boundingBox();
        if (!box) continue;
        if (Math.min(box.width, box.height) < 44) {
          undersized.push(
            `${await el.evaluate((n) => n.getAttribute('data-testid') ?? n.textContent?.trim().slice(0, 20))} ${box.width}x${box.height}`
          );
        }
      }
      expect(undersized, `undersized on ${route}`).toEqual([]);
    });
  }

  // A-41 — the highlight is now REACHABLE for the four built tiles. The two
  // unbuilt routes still 404, so the walk covers four of six.
  const TILE_FOR: Record<string, string> = {
    // A-C32 [chat ND-36, S126] — /m/logs joins the walk and lights the Logs
    // tile. This is M6M A-41 extended to a seventh route.
    '/m/logs': 'Logs',
    '/m/schedule': 'Schedule',
    '/m/expenses': 'Expenses',
    '/m/subs': 'Subs & Vendors',
    '/m/team': 'Team',
    '/m/contacts': 'Contacts',
    '/m/settings': 'Settings',
  };
  for (const route of BUILT) {
    test(`A-41 · on ${route} exactly the matching tile is highlighted`, async ({ page }) => {
      await page.goto(route);
      await openSheet(page);
      const current = page.locator('[data-testid^="m-sheet-tile-"][data-current="true"]');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveAttribute('data-testid', `m-sheet-tile-${TILE_FOR[route]}`);
    });
  }

});

// ===========================================================================
// M-25 Schedule — §4.13.2
// ===========================================================================
test.describe('M-25 · Schedule', () => {
  test('A-44 · binds to the company-wide calendar — no projectId, no ownMemberId', async ({
    page,
  }) => {
    await page.goto('/m/schedule');
    // The screen renders either events or its own empty state; both prove the
    // company-wide call returned rather than erroring on a missing projectId.
    const rows = page.getByTestId('m-event-row');
    const empty = page.getByTestId('m-empty');
    expect((await rows.count()) + (await empty.count())).toBeGreaterThan(0);
  });

  test('A-44c · event source is a text label, not colour alone', async ({ page }) => {
    await page.goto('/m/schedule');
    const sources = page.getByTestId('m-event-source');
    if ((await sources.count()) === 0) test.skip(true, 'no events on rebuild-test');
    for (let i = 0; i < (await sources.count()); i++) {
      await expect(sources.nth(i)).toHaveText(/Task|Schedule|Inspection/);
    }
  });

  test('A-44d · groups by day, past ABOVE today, upcoming ascending', async ({ page }) => {
    await page.goto('/m/schedule');
    const groups = page.getByTestId('m-day-group');
    const count = await groups.count();
    if (count === 0) test.skip(true, 'no events on rebuild-test');

    const days: string[] = [];
    for (let i = 0; i < count; i++) {
      days.push((await groups.nth(i).getAttribute('data-day'))!);
    }

    // The anchor separates past from upcoming in DOM order.
    const anchorY = (await page.getByTestId('m-today-anchor').boundingBox())!.y;
    const past: string[] = [];
    const upcoming: string[] = [];
    for (let i = 0; i < count; i++) {
      const y = (await groups.nth(i).boundingBox())!.y;
      (y < anchorY ? past : upcoming).push(days[i]);
    }

    // Each side ascending, and every past day earlier than every upcoming day.
    expect(past).toEqual([...past].sort());
    expect(upcoming).toEqual([...upcoming].sort());
    if (past.length && upcoming.length) {
      expect(past[past.length - 1] < upcoming[0]).toBe(true);
    }
    // Past days are NOT dropped — the whole set is still rendered.
    expect(past.length + upcoming.length).toBe(count);
  });

  test('A-44e · rows carry title + mono range; a null project_label leaves no empty slot', async ({
    page,
  }) => {
    await page.goto('/m/schedule');
    const rows = page.getByTestId('m-event-row');
    const n = await rows.count();
    if (n === 0) test.skip(true, 'no events on rebuild-test');
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      // A mono date is always present.
      const mono = row.locator('.font-mono').first();
      await expect(mono).toHaveText(/\d{4}-\d{2}-\d{2}/);
      // No paragraph is rendered empty or as a stray separator.
      const texts = await row.locator('p').allTextContents();
      for (const t of texts) {
        expect(t.trim()).not.toBe('');
        expect(t.trim()).not.toBe('·');
        expect(t.trim().startsWith('·')).toBe(false);
        expect(t.trim().endsWith('·')).toBe(false);
      }
    }
  });
});

// ===========================================================================
// M-27 Subs & Vendors — §4.13.4
// ===========================================================================
test.describe('M-27 · Subs & Vendors', () => {
  test('A-46 · no default_hourly_rate, default_markup_percent or ein — as CREW', async ({
    page,
  }) => {
    await page.goto('/m/subs');
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    // The three cut columns, by the shapes they would render as.
    expect(body).not.toMatch(/markup/i);
    expect(body).not.toMatch(/\bEIN\b/i);
    expect(body).not.toMatch(/\/\s*hr|per hour|hourly/i);
    // And no currency anywhere — M-27 carries no money at all.
    expect(body).not.toMatch(/\$\d/);
  });

  test('A-46b · an expired insurance date carries danger AND a text label', async ({ page }) => {
    await page.goto('/m/subs');
    const expired = page.locator('[data-testid="m-insurance"][data-expired="true"]');
    const n = await expired.count();
    if (n === 0) test.skip(true, 'no expired insurance rows on rebuild-test');
    for (let i = 0; i < n; i++) {
      // Text label, not colour alone.
      await expect(expired.nth(i)).toHaveText(/Insurance expired/);
      const colour = await expired.nth(i).evaluate((el) => getComputedStyle(el).color);
      // #c0362c
      expect(colour).toBe('rgb(192, 54, 44)');
    }
  });

  test('A-46c · phone/mobile/email are tap-to-act', async ({ page }) => {
    await page.goto('/m/subs');
    const tel = page.getByTestId('m-tel').first();
    const mail = page.getByTestId('m-mail').first();
    if ((await tel.count()) > 0) await expect(tel).toHaveAttribute('href', /^tel:/);
    if ((await mail.count()) > 0) await expect(mail).toHaveAttribute('href', /^mailto:/);
    if ((await tel.count()) === 0 && (await mail.count()) === 0) {
      test.skip(true, 'no sub carries a phone or email on rebuild-test');
    }
  });

  test('A-46d · chips are All / Subs / Vendors, single-select, and each changes the list', async ({
    page,
  }) => {
    await page.goto('/m/subs');
    const chips = page.getByTestId('m-chips').getByRole('link');
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(0)).toHaveText('All');
    await expect(chips.nth(1)).toHaveText('Subs');
    await expect(chips.nth(2)).toHaveText('Vendors');

    const countFor = async (href: string) => {
      await page.goto(href);
      return page.getByTestId('m-sub-row').count();
    };
    const all = await countFor('/m/subs');
    const subs = await countFor('/m/subs?type=subcontractor');
    const vendors = await countFor('/m/subs?type=vendor');
    // The chips cover the domain: All = Subs ∪ Vendors.
    expect(subs + vendors).toBe(all);

    // Single-select: exactly one chip active at a time.
    await page.goto('/m/subs?type=vendor');
    expect(await page.locator('[data-testid^="m-chip-"][data-active="true"]').count()).toBe(1);
  });

  test('A-46e · license_number in mono where set, no empty slot where null; pill carries text', async ({
    page,
  }) => {
    await page.goto('/m/subs');
    const rows = page.getByTestId('m-sub-row');
    const n = await rows.count();
    if (n === 0) test.skip(true, 'no subs on rebuild-test');

    const lic = page.getByTestId('m-license');
    for (let i = 0; i < (await lic.count()); i++) {
      await expect(lic.nth(i)).not.toHaveText(/^Lic\s*$/);
      const family = await lic.nth(i).evaluate((el) => getComputedStyle(el).fontFamily);
      expect(family).toMatch(/Plex Mono/i);
    }
    // Every status pill carries a word, never colour alone.
    const pills = page.getByTestId('m-status-pill');
    for (let i = 0; i < (await pills.count()); i++) {
      await expect(pills.nth(i)).toHaveText(/Active|Inactive|Archived/);
    }
  });
});

// ===========================================================================
// M-28 Team — §4.13.5
// ===========================================================================
test.describe('M-28 · Team', () => {
  test('A-47 · bound to company_members — subs appear, no profiles.role rendered', async ({
    page,
  }) => {
    await page.goto('/m/team');
    const rows = page.getByTestId('m-member-row');
    expect(await rows.count()).toBeGreaterThan(0);

    // Subcontractor members exist and are listed — the failure a getTeamMembers()
    // binding produces is that they silently vanish.
    await page.goto('/m/team?type=subcontractor');
    expect(await page.getByTestId('m-member-row').count()).toBeGreaterThan(0);

    // No profiles.role rendered. Scoped to the member-type label rather than the
    // whole screen ON PURPOSE: rebuild-test's roster genuinely contains display
    // names like "QA Admin A" and "QA Foreman A", so a body-wide regex for role
    // words matches a NAME and fails a correct build. §4.13.5's sentence is that
    // the roster shows member_type and not role — so that is what is asserted.
    await page.goto('/m/team');
    const labels = page.getByTestId('m-member-type');
    const n = await labels.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      // company_members_member_type_check permits exactly these two. A role
      // would render as owner/admin/project_manager/foreman/crew_member here.
      await expect(labels.nth(i)).toHaveText(/^(crew|subcontractor)$/);
    }
  });

  test('A-47b · the Team tile badge equals the row count', async ({ page }) => {
    await page.goto('/m/team');
    const rows = await page.getByTestId('m-member-row').count();
    await openSheet(page);
    const badge = await page.getByTestId('m-sheet-badge').textContent();
    expect(Number(badge)).toBe(rows);
  });

  test('A-47c · no invite/deactivate/role-change/reset, and no rate', async ({ page }) => {
    await page.goto('/m/team');
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    expect(body).not.toMatch(/invite|deactivate|reset password|change role/i);
    expect(body).not.toMatch(/\$\d|rate|burden/i);
    // The only links inside the content are none — the roster is inert.
    expect(await page.getByTestId('m-content').getByRole('button').count()).toBe(0);
  });

  test('A-47d · chips are All / Crew / Subs and cover the domain', async ({ page }) => {
    await page.goto('/m/team');
    const chips = page.getByTestId('m-chips').getByRole('link');
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(1)).toHaveText('Crew');
    await expect(chips.nth(2)).toHaveText('Subs');

    const countFor = async (href: string) => {
      await page.goto(href);
      return page.getByTestId('m-member-row').count();
    };
    const all = await countFor('/m/team');
    const crew = await countFor('/m/team?type=crew');
    const subs = await countFor('/m/team?type=subcontractor');
    expect(crew + subs).toBe(all);
  });

  test('A-47e · null schedule_color falls back to amber, never untinted', async ({ page }) => {
    await page.goto('/m/team');
    const avatars = page.getByTestId('m-member-avatar');
    const n = await avatars.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const bg = await avatars.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor);
      // Never transparent and never fully unset.
      expect(bg).not.toBe('rgba(0, 0, 0, 0)');
      expect(bg).not.toBe('transparent');
    }
  });
});

// ===========================================================================
// M-29 Contacts — §4.13.6
// ===========================================================================
test.describe('M-29 · Contacts', () => {
  test('A-49 · chips are All / Leads / Clients, and All keeps the other five types reachable', async ({
    page,
  }) => {
    await page.goto('/m/contacts');
    const chips = page.getByTestId('m-chips').getByRole('link');
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(0)).toHaveText('All');
    await expect(chips.nth(1)).toHaveText('Leads');
    await expect(chips.nth(2)).toHaveText('Clients');

    const countFor = async (href: string) => {
      await page.goto(href);
      return page.getByTestId('m-contact-row').count();
    };
    const all = await countFor('/m/contacts');
    const leads = await countFor('/m/contacts?type=lead');
    const clients = await countFor('/m/contacts?type=client');

    // THE CRITERION THAT MATTERS: the chips do NOT cover the domain, so All must
    // be >= their sum. A build that filters All to lead|client makes these equal
    // and loses the other five contact types silently.
    expect(all).toBeGreaterThanOrEqual(leads + clients);

    // Single-select.
    await page.goto('/m/contacts?type=lead');
    expect(await page.locator('[data-testid^="m-chip-"][data-active="true"]').count()).toBe(1);
  });

  test('A-49b · company_name fallback, and no blank row or stray separator', async ({ page }) => {
    await page.goto('/m/contacts');
    const rows = page.getByTestId('m-contact-row');
    const n = await rows.count();
    if (n === 0) test.skip(true, 'no contacts on rebuild-test');
    for (let i = 0; i < n; i++) {
      const name = rows.nth(i).locator('p').first();
      const text = (await name.textContent())?.trim() ?? '';
      expect(text).not.toBe('');
      expect(text).not.toBe('·');
      expect(text.startsWith('·')).toBe(false);
    }
  });

  test('A-49c · contact_type renders from the label map, never the raw enum', async ({ page }) => {
    await page.goto('/m/contacts');
    const types = page.getByTestId('m-contact-type');
    const n = await types.count();
    if (n === 0) test.skip(true, 'no contacts on rebuild-test');
    for (let i = 0; i < n; i++) {
      const t = (await types.nth(i).textContent())?.trim() ?? '';
      // The two that give a raw-enum build away.
      expect(t).not.toBe('building_dept');
      expect(t).not.toBe('other_external');
      expect(t).not.toMatch(/_/);
    }
    // Status pills carry their text.
    const pills = page.getByTestId('m-status-pill');
    for (let i = 0; i < (await pills.count()); i++) {
      await expect(pills.nth(i)).toHaveText(/Active|Inactive|Archived/);
    }
  });

  test('A-49d · no notes and no tags render', async ({ page }) => {
    await page.goto('/m/contacts');
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    expect(body).not.toMatch(/\bnotes\b/i);
    expect(body).not.toMatch(/\btags\b/i);
  });
});

// ===========================================================================
// A-42c — each screen's OWN empty state (the copy written in Part 1)
// ===========================================================================
test.describe('A-42c · per-screen empty states', () => {
  // Asserted against a filter guaranteed to return nothing rather than by
  // emptying the database: the point is that the screen names what is missing.
  const CASES: Array<{ url: string; text: string }> = [
    { url: '/m/subs?type=vendor', text: 'No vendors.' },
    { url: '/m/team?type=subcontractor', text: 'No subs.' },
    { url: '/m/contacts?type=client', text: 'No clients.' },
  ];

  for (const { url, text } of CASES) {
    test(`${url} names what is missing when empty`, async ({ page }) => {
      await page.goto(url);
      const empty = page.getByTestId('m-empty');
      if ((await empty.count()) === 0) {
        test.skip(true, `rebuild-test has rows for ${url}; empty path not reachable`);
      }
      await expect(empty).toHaveText(text);
    });
  }

  test('every built screen renders the offline strip when the network drops', async ({
    page,
    context,
  }) => {
    for (const route of BUILT) {
      await page.goto(route);
      await context.setOffline(true);
      await expect(page.getByTestId('m-offline-strip')).toBeVisible();
      await context.setOffline(false);
    }
  });
});

// ===========================================================================
// M-26 Expenses — §4.13.3 · the first currency on /m
// ===========================================================================
test.describe('M-26 · Expenses', () => {
  test('A-45 · amount renders in IBM Plex Mono on every row', async ({ page }) => {
    await page.goto('/m/expenses');
    const amounts = page.getByTestId('m-expense-amount');
    const n = await amounts.count();
    if (n === 0) test.skip(true, 'no expenses visible to the crew identity');
    for (let i = 0; i < n; i++) {
      const family = await amounts.nth(i).evaluate((el) => getComputedStyle(el).fontFamily);
      expect(family).toMatch(/Plex Mono/i);
    }
  });

  test('A-45b · after D-47 crew sees assigned-project expenses, and nothing beyond', async ({
    page,
  }) => {
    // The browser half of A-45b. The DB half — that an UNASSIGNED project's
    // expense stays invisible — was proved under impersonation in migration
    // 20260825000000's evidence; here we assert the screen renders what RLS
    // returns without a UI role branch narrowing it further.
    await page.goto('/m/expenses');
    const rows = page.getByTestId('m-expense-row');
    const all = await rows.count();

    await page.goto('/m/expenses?filter=mine');
    const mine = await page.getByTestId('m-expense-row').count();

    // Post-widening, a crew member can see rows they did NOT author. Before
    // D-47 these two counts were necessarily equal.
    expect(all).toBeGreaterThanOrEqual(mine);
  });

  // -------------------------------------------------------------------------
  // A-45b2 [S114] — the subcontractor arm, as RULED rather than as authored.
  // -------------------------------------------------------------------------
  // RULING 1 [S106] removed subs from `expenses` entirely, so the screen half
  // of this criterion is: /m/expenses renders for a sub, and renders NOTHING.
  //
  // The distinction that makes this worth a browser test at all — RLS returning
  // zero rows must surface as M-26's ORDINARY EMPTY STATE, not as an error, a
  // crash, or a "not permitted" panel. A-45d forbids a UI role branch; a build
  // that reacted to the empty set by rendering a permission notice would be
  // introducing exactly that branch, and no DB-level assertion can see it.
  test('A-45b2 · a subcontractor sees no expense rows, and gets the ordinary empty state', async ({
    page,
  }) => {
    // RULING A [S131] — the FIFTH copy of the sign-in wait, inlined rather than
    // in a helper, which is why a grep for the helper would have missed it. A
    // subcontractor lands on /m/projects now; `signInAs` derives that.
    await signInAs(page, 'josh+qa-sub@worthprop.com');

    await page.goto('/m/expenses');

    // Zero rows — Ruling 1's whole content.
    await expect(page.getByTestId('m-expense-row')).toHaveCount(0);

    // …presented as the empty state, not as a failure. This is the half a DB
    // assertion cannot reach.
    await expect(page.getByTestId('m-empty')).toHaveCount(1);
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    expect(body).not.toMatch(/not permitted|no access|restricted|error|something went wrong/i);

    // And no currency leaked into the empty state's own copy.
    expect(body).not.toMatch(/[$£€]\s?\d/);
  });

  test('A-45d · no UI ROLE check — one declared exception, and it is role-blind', async ({
    page,
  }) => {
    await page.goto('/m/expenses');
    const rows = await page.getByTestId('m-expense-row').count();
    const empty = await page.getByTestId('m-empty').count();
    // Exactly one of the two states, never a third "not permitted" state — a
    // build that added a role gate would render neither rows nor an empty list.
    expect(rows > 0 || empty === 1).toBe(true);
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    expect(body).not.toMatch(/not permitted|no access|restricted/i);

    // AMENDED [S103, D-49]: the rendered set is what getExpenses() returns with
    // ONE declared exception — is_retainage rows, excluded for EVERY role. The
    // exception is role-blind, so this criterion still forbids a role branch;
    // A-45i is what proves the exclusion actually happens.
  });

  test('A-45i · no retainage row renders — the criterion that fails if the filter goes', async ({
    page,
  }) => {
    await page.goto('/m/expenses');
    const rows = page.getByTestId('m-expense-row');
    const n = await rows.count();

    // NOT VACUOUS, and this is the part worth stating. The identity this suite
    // signs in as (crew) CAN read retainage rows through RLS — verified S103
    // under the S90 impersonation harness: 3 retainage rows readable, 0 of them
    // authored by this member, all arriving via the role arm D-47 added. So if
    // app/m/expenses/page.tsx's `!e.is_retainage` filter were deleted, those
    // rows WOULD appear here and this test WOULD fail.
    expect(n).toBeGreaterThan(0);

    // Asserted on the rendered supplier because is_retainage is deliberately
    // NOT in the DOM — putting the flag in the markup to make it testable would
    // leak the very thing being hidden. The PAGE filters on the column; only
    // the TEST reads the label, which is the right way round.
    for (let i = 0; i < n; i++) {
      const text = (await rows.nth(i).textContent()) ?? '';
      expect(text, `row ${i}`).not.toMatch(/Retainage held/i);
    }
  });

  test('A-45e · no job-cost ROLLUP figure — no labor, burden or committed total', async ({
    page,
  }) => {
    await page.goto('/m/expenses');
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    // §4.13.3 cuts getJobCostRollup() IN ITS ENTIRETY — labor.totalCost burdened
    // from Owner/Admin-only rate snapshots, and payables.committedRemaining /
    // retainageHeld. Those are DERIVED TOTALS, and none of them appears here.
    expect(body).not.toMatch(/labor|burden|committed total|still owed|total cost/i);

    // NOT asserted: the absence of the word "retainage". Rebuild-test holds
    // ordinary expense ROWS whose `supplier` reads "Retainage held — DVDF", and
    // they render because expenses_select_scoped returns them — which is exactly
    // what A-45d requires this screen to do. Filtering them out would be a UI
    // filter disagreeing with RLS, which §4.13's common rules forbid. Flagged
    // for Josh: §4.13.3's payables exclusion was written against the ROLLUP and
    // does not obviously contemplate retainage accrual rows reaching a crew
    // phone as line items.
  });

  test('A-45f · no approve, reject, capture or allocation control', async ({ page }) => {
    await page.goto('/m/expenses');
    const content = page.getByTestId('m-content');
    // The load-bearing assertion: approve, reject, capture and allocate would
    // all be CONTROLS, and this screen has none. A text scan cannot stand in for
    // it — §4.13.3 requires the status pill to carry the words "Approved" and
    // "Rejected", so /approve|reject/ matches a correct build.
    expect(await content.getByRole('button').count()).toBe(0);
    expect(await content.locator('input, select, textarea, [role="button"]').count()).toBe(0);
    const body = (await content.textContent()) ?? '';
    expect(body).not.toMatch(/add expense|new expense|allocat/i);
  });

  test('A-45g · chips are All / Mine / Pending, single-select, and each changes the list', async ({
    page,
  }) => {
    await page.goto('/m/expenses');
    const chips = page.getByTestId('m-chips').getByRole('link');
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(0)).toHaveText('All');
    await expect(chips.nth(1)).toHaveText('Mine');
    await expect(chips.nth(2)).toHaveText('Pending');

    const countFor = async (href: string) => {
      await page.goto(href);
      return page.getByTestId('m-expense-row').count();
    };
    const all = await countFor('/m/expenses');
    const mine = await countFor('/m/expenses?filter=mine');
    const pending = await countFor('/m/expenses?filter=pending');
    // Both chips narrow — neither can exceed the unfiltered set.
    //
    // ⚠️ THESE TWO ASSERTIONS ALONE PASSED WITH THE FAIL-OPEN BUG PRESENT
    // [S107]: `mine <= all` is equally true of a filter that narrows, one that
    // is inert, and one that returns EVERYTHING because it could not identify
    // the caller. The null-member half is unreachable from a browser — every
    // seeded identity has a company_members row — so it is asserted directly
    // in test/m6m-expenses.test.ts against the extracted selectMine().
    expect(mine).toBeLessThanOrEqual(all);
    expect(pending).toBeLessThanOrEqual(all);

    // When a chip yields nothing, the empty state must name WHICH chip — this
    // is the copy the fail-open path could never reach.
    if (mine === 0) {
      await page.goto('/m/expenses?filter=mine');
      await expect(page.getByTestId('m-empty')).toHaveText('No expenses of yours.');
    }
    if (pending === 0) {
      await page.goto('/m/expenses?filter=pending');
      await expect(page.getByTestId('m-empty')).toHaveText('No pending expenses.');
    }

    await page.goto('/m/expenses?filter=pending');
    expect(await page.locator('[data-testid^="m-chip-"][data-active="true"]').count()).toBe(1);
  });

  test('A-45h · a receipt links to M-9, and no second image surface exists here', async ({
    page,
  }) => {
    await page.goto('/m/expenses');
    const links = page.getByTestId('m-receipt-link');
    const n = await links.count();
    if (n === 0) test.skip(true, 'no expense with a receipt visible to this identity');
    for (let i = 0; i < n; i++) {
      await expect(links.nth(i)).toHaveAttribute('href', /^\/m\/p\/[0-9a-f-]+\/photos\/[0-9a-f-]+$/);
    }
    // No lightbox, no <dialog>, no inline <img> gallery on this screen.
    expect(await page.getByTestId('m-content').locator('img, dialog').count()).toBe(0);

    // ⚠️ THE ASSERTIONS ABOVE PASSED WHILE EVERY ONE OF THESE LINKS 404'd
    // [S107]. They check the href's SHAPE and never that the destination
    // resolves — and it did not: M-26 uploads receipts as category 'receipts'
    // while M-9 resolved only 'photos', so the failure rate was 100%, not
    // intermittent. FOLLOW the link and assert a rendered viewer.
    //
    // THE TIMEOUTS ARE EXPLICIT AND THIS IS WHY [S107]. M-9 is the first
    // heavy route this spec reaches, and in `next dev` it COLD-COMPILES on the
    // first request — measured at 4.5s / 900 modules, against Playwright's 5s
    // default. The first run of this test lost by ~half a second: the compile
    // finished, but the assertion had already given up and the navigation was
    // abandoned. Once warm the same route serves in ~500ms, and m-photos.spec
    // exercises it repeatedly without trouble.
    //
    // So this is COMPILE latency, not product latency, and the number is
    // raised deliberately rather than to paper over a slow screen. #135 is the
    // same family, and CI matters more than local here: it is ALWAYS cold, has
    // no warm-up step, and would fail this on a correct build.
    const COLD_COMPILE_MS = 30_000; // auth.setup.ts uses the same allowance
    await links.first().click();
    await expect(page).toHaveURL(/\/m\/p\/[0-9a-f-]+\/photos\/[0-9a-f-]+$/, {
      timeout: COLD_COMPILE_MS,
    });
    await expect(page.getByTestId('m-viewer-actions')).toBeVisible({ timeout: COLD_COMPILE_MS });
    await expect(page.getByTestId('m-stage-image')).toBeVisible({ timeout: COLD_COMPILE_MS });

    // MARKUP IS NOT OFFERED ON A RECEIPT. The item lives INSIDE the overflow
    // menu, which only renders when open — asserting its absence against a
    // closed menu would pass even if markup were fully available, which is the
    // same shape of vacuous check this test just replaced. So: open, then look.
    await page.getByTestId('m-viewer-overflow').click();
    await expect(page.getByTestId('m-viewer-menu')).toBeVisible();
    expect(await page.getByTestId('m-viewer-markup').count()).toBe(0);
  });
});

// ===========================================================================
// M-30 Settings — §4.13.7 · read-only
// ===========================================================================
test.describe('M-30 · Settings', () => {
  test('A-48 · no editable control of any kind', async ({ page }) => {
    await page.goto('/m/settings');
    const content = page.getByTestId('m-content');
    // §4.13.7 rules read-only for EVERY role including Owner. The crew identity
    // this suite signs in as would see nothing either way, so the assertion is
    // structural: the screen contains no control at all.
    expect(await content.locator('input, select, textarea, button, [role="button"]').count()).toBe(0);
  });

  test('A-48b · renders name, role, member_type, company and timezone in mono', async ({
    page,
  }) => {
    await page.goto('/m/settings');
    await expect(page.getByTestId('m-settings-name')).not.toHaveText('—');
    await expect(page.getByTestId('m-settings-role')).not.toHaveText('—');
    await expect(page.getByTestId('m-settings-member-type')).not.toHaveText('—');
    await expect(page.getByTestId('m-settings-company-name')).not.toHaveText('—');

    const tz = page.getByTestId('m-settings-timezone');
    await expect(tz).not.toHaveText('—');
    const family = await tz.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family).toMatch(/Plex Mono/i);
  });

  test('A-48c · no OT threshold, week start, break rule or GPS mode', async ({ page }) => {
    await page.goto('/m/settings');
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    // getCompanyTimeSettings() returns all four alongside the timezone this
    // screen does render — the easiest cut in §4.13 to undo by accident.
    expect(body).not.toMatch(/overtime|\bOT\b|week start|weekStartsOn|paid break|gps/i);
  });

  test('A-48d · no Sign out on the screen — it lives in the sheet', async ({ page }) => {
    await page.goto('/m/settings');
    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    expect(body).not.toMatch(/sign out|log out/i);
    // And it IS in the sheet, so the function is not simply missing.
    await openSheet(page);
    await expect(page.getByTestId('m-sign-out')).toBeVisible();
  });

  test('A-48e · role comes from a service function, not the shell or an inline query', async ({
    page,
  }) => {
    // Asserted behaviourally: the role renders on M-30 and is ABSENT from the
    // shell everywhere else. If it had been threaded through MobileShell it
    // would be available to — and liable to leak into — every mobile screen.
    await page.goto('/m/settings');
    const role = (await page.getByTestId('m-settings-role').textContent())?.trim();
    expect(role).toBeTruthy();

    for (const route of ['/m/timeclock', '/m/team', '/m/schedule']) {
      await page.goto(route);
      await expect(page.getByTestId('m-settings-role')).toHaveCount(0);
    }
  });
});

// ===========================================================================
// A-50 — §2's money token (D-46)
// ===========================================================================
test.describe('A-50 · money format', () => {
  test('every currency figure on /m is $1,234.56 / -$1,234.56 / — for null', async ({ page }) => {
    await page.goto('/m/expenses');
    const amounts = page.getByTestId('m-expense-amount');
    const n = await amounts.count();
    if (n === 0) test.skip(true, 'no expenses visible to the crew identity');
    for (let i = 0; i < n; i++) {
      const text = (await amounts.nth(i).textContent())?.trim() ?? '';
      // $ leading, comma thousands, EXACTLY two decimals; negatives put the
      // minus before the symbol; null renders the em-dash, never $0.00.
      expect(text, `amount ${i}`).toMatch(/^(—|-?\$\d{1,3}(,\d{3})*\.\d{2})$/);
      // Never a truncated or variable precision.
      if (text !== '—') expect(text).not.toMatch(/\.\d$|\.\d{3}/);
    }
  });
});

// ===========================================================================
// M-27 DETAIL — the whole row opens the sub (D-55) [S121]
// ===========================================================================
// Reported from a device [S120, Josh]: no detail view exists for subs and
// vendors. Same D-55 instance as M-37, M-36 and M-35 — "every list row opens
// its own page with its own route" — and the same structural care M-36 needed:
// the tap-to-act circles are SIBLINGS of the row link, never nested inside it.
//
// The leak check is repeated on the detail SURFACE deliberately. A-46 above
// passes on the list, and a detail screen is exactly where a build fills the
// space with the three cut columns — `getSubcontractor()` is `select('*')` and
// `subcontractors_select_authenticated` carries no role floor, so nothing but
// the page file keeps `default_markup_percent` out of the DOM.
test.describe('M-27 detail · /m/subs/[subId]', () => {
  test('the row opens the sub, and the tap-to-act circles still dial', async ({ page }) => {
    await page.goto('/m/subs');
    const rows = page.getByTestId('m-sub-row');
    if ((await rows.count()) === 0) test.skip(true, 'no subs on rebuild-test');

    // ⚠️ ASSERTED SEPARATELY FROM THE ROW HREF, and that is the point: a "does
    // the row navigate" test cannot see that a nested anchor has silently
    // become a navigation. The tel: link must still be a tel: link.
    const tel = rows.first().getByTestId('m-tel');
    if ((await tel.count()) > 0) await expect(tel).toHaveAttribute('href', /^tel:/);

    await rows.first().getByTestId('m-row-link').click();
    await expect(page).toHaveURL(/\/m\/subs\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(page.getByTestId('m-sub-detail')).toBeVisible();
    await expect(page.getByTestId('m-sub-name')).not.toBeEmpty();
  });

  test('a way back — the chevron, and the LIST keeps its hamburger', async ({ page }) => {
    await page.goto('/m/subs');
    const rows = page.getByTestId('m-sub-row');
    if ((await rows.count()) === 0) test.skip(true, 'no subs on rebuild-test');

    // The list is a sheet destination: hamburger, no chevron (A-42b).
    await expect(page.getByTestId('m-hamburger')).toBeVisible();

    await rows.first().getByTestId('m-row-link').click();
    await expect(page).toHaveURL(/\/m\/subs\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(page.getByTestId('m-back')).toBeVisible();
    await expect(page.getByTestId('m-hamburger')).toHaveCount(0);
    // Company-scoped, so NO tab is active — the A-42 family, not M-37's.
    expect(await page.locator('[data-testid^="m-tab-"][aria-current="page"]').count()).toBe(0);
  });

  test('A-46 on the DETAIL surface · still no rate, markup or EIN', async ({ page }) => {
    await page.goto('/m/subs');
    const rows = page.getByTestId('m-sub-row');
    if ((await rows.count()) === 0) test.skip(true, 'no subs on rebuild-test');
    await rows.first().getByTestId('m-row-link').click();
    await expect(page.getByTestId('m-sub-detail')).toBeVisible();

    const body = (await page.getByTestId('m-content').textContent()) ?? '';
    expect(body).not.toMatch(/markup/i);
    expect(body).not.toMatch(/\bEIN\b/i);
    expect(body).not.toMatch(/\/\s*hr|per hour|hourly/i);
    expect(body).not.toMatch(/\$\d/);
  });

  test('an id that does not exist 404s rather than rendering an empty shell', async ({ page }) => {
    const resp = await page.goto('/m/subs/11111111-1111-1111-1111-111111111111');
    expect(resp?.status()).toBe(404);
  });
});
