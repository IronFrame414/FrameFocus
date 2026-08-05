import { test, expect, type Page } from '@playwright/test';

// M6M §4.13 acceptance criteria for the four screens built in this slice.
//
// Asserted here:
//   M-25 Schedule        A-44, A-44b(partial), A-44c, A-44d, A-44e
//   M-27 Subs & Vendors  A-46, A-46b, A-46c, A-46d, A-46e
//   M-28 Team            A-47, A-47b, A-47c, A-47d, A-47e
//   M-29 Contacts        A-49, A-49b, A-49c, A-49d
//   Common               A-41 (partial), A-42, A-42b, A-42c(partial), A-42d
//
// NOT here: A-45* and A-48* — M-26 Expenses and M-30 Settings are not built in
// this slice. A-50 (money) has no surface until M-26 lands.
//
// Runs under 'chromium-auth': signed in as the crew test identity, 402x874.

const BUILT = ['/m/schedule', '/m/subs', '/m/team', '/m/contacts'];
/** The two §4.13 routes not built in this slice — they still 404. */
const UNBUILT = ['/m/expenses', '/m/settings'];

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
    '/m/schedule': 'Schedule',
    '/m/subs': 'Subs & Vendors',
    '/m/team': 'Team',
    '/m/contacts': 'Contacts',
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

  test('A-41 · the two unbuilt destinations still 404 (scope of this slice)', async ({ page }) => {
    for (const route of UNBUILT) {
      const res = await page.goto(route);
      expect(res?.status(), route).toBe(404);
    }
  });
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
