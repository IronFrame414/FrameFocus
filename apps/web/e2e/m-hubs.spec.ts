import { test, expect, type Page } from '@playwright/test';
import {
  setupHubFixture,
  teardownHubFixture,
  openSegment,
  closeSegment,
  COMPANY_A,
  CREW_MEMBER,
  type HubFixture,
} from './hub-fixture';

// M6M §4.2, §4.3 and §4.7 — the three screens that make everything already
// built reachable. M-2 (projects list), M-3 (project sections hub), M-7 (field).
//
// Asserted here:
//   M-2   A-8, A-8b, A-9, A-9b(partial — see note), A-9c,
//         A-10, A-10b, A-10c, A-10d, A-10e
//   M-3   A-11, A-11b(Playwright half), A-11c, A-11d, A-11e,
//         A-11f, A-11g, A-11h, A-11i, A-11j,
//         A-12, A-12b, A-12c(8 of 9 — see note), A-13
//   M-7   A-13b, A-13c, A-12d(3 of 4), A-12e
//
// TWO CRITERIA CANNOT FULLY PASS YET, AND THE REASON IS THE SAME ONE:
//   A-12c / A-12d   M-8 (the gallery, §4.8) IS NOT BUILT. The Photos tile on
//                   both hubs points at /m/p/{id}/photos — its real route per
//                   §1 — which 404s until that slice lands. This follows the
//                   precedent the shell slice set for the six sheet tiles
//                   ("a tile pointing at its real future route is right; one
//                   pointing at a desktop page would have to be un-pointed
//                   later"). The eight other M-3 tiles and three other M-7
//                   tiles ARE asserted to render a real screen below, and the
//                   Photos tile is asserted to at least point at the right
//                   /m/** URL and not at /dashboard/**.
//
// A-9b's "each chip changes the rows listed" is asserted for All / Active /
// On hold. MINE CANNOT DIFFER FOR THIS IDENTITY, and that is RLS, not a build
// defect: projects_select_visible already limits a crew member to projects they
// are assigned to, so "Mine" and "All" are necessarily the same set. Asserted
// instead: Mine is a subset of All, and the chip is genuinely single-select.
//
// Runs under 'chromium-auth': crew test identity, 402x874.

let fx: HubFixture;

test.beforeAll(async () => {
  fx = await setupHubFixture();
});

test.afterAll(async () => {
  // Guarded: if setup threw, `fx` is undefined and an unguarded teardown raises
  // a second, unrelated error that buries the real one.
  if (fx) await teardownHubFixture(fx);
});

const cards = (page: Page) => page.getByTestId('m-project-card');

/** Every number on screen must be IBM Plex Mono (§2). */
async function assertMonoNumbers(page: Page, where: string) {
  const mono = page.locator('.font-mono');
  const n = await mono.count();
  expect(n, `no mono nodes on ${where}`).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const family = await mono.nth(i).evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family, `${where} mono node ${i}`).toMatch(/Plex Mono/i);
  }
}

// ===========================================================================
// M-2 · §4.2
// ===========================================================================
test.describe('M-2 · Projects list', () => {
  test('A-8 · the clocked-into project carries the blue border AND the "On site" pill; no other card does', async ({
    page,
  }) => {
    await openSegment(fx, 'work');
    await page.goto('/m/projects');

    const onSite = page.locator('[data-testid="m-project-card"][data-on-site="true"]');
    await expect(onSite).toHaveCount(1);

    // The pill and the border ride together — both on the same card.
    await expect(onSite.getByTestId('m-on-site')).toHaveText('On site');

    // THE BORDER IS ASSERTED BY COLOUR, NOT WIDTH, and that is deliberate:
    // Chromium rounds the USED border-width to whole device pixels, so
    // getComputedStyle reports the 1.5px rule as "1px" at dpr 1 and a width
    // assertion would fail on a correct build. The colour is the signal that
    // actually distinguishes the two branches — #3b4ae0 highlighted against
    // #e4e8ef default — and it cannot be produced by the default branch.
    const colour = await onSite.evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(colour).toBe('rgb(59, 74, 224)'); // #3b4ae0
    const plain = page.locator('[data-testid="m-project-card"][data-on-site="false"]').first();
    expect(await plain.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe(colour);

    // And nowhere else.
    await expect(page.getByTestId('m-on-site')).toHaveCount(1);
    expect(await cards(page).count()).toBeGreaterThan(1);
  });

  test('A-8b · on a break segment NO card is highlighted — and nothing falls back to a recent project', async ({
    page,
  }) => {
    // time_segments_project_gate_check FORCES project_id NULL on `break`, so
    // this is the state the DB guarantees exists. A-8 alone passes vacuously
    // here, which is why A-8b is separate.
    await openSegment(fx, 'break');
    await page.goto('/m/projects');

    // Clocked in, genuinely — but on a segment that carries no project.
    await expect(cards(page).first()).toBeVisible();
    await expect(page.locator('[data-testid="m-project-card"][data-on-site="true"]')).toHaveCount(0);
    await expect(page.getByTestId('m-on-site')).toHaveCount(0);
  });

  test('A-9 · the chips are single-select — choosing Mine deselects All', async ({ page }) => {
    await page.goto('/m/projects');
    await expect(page.getByTestId('m-chip-All')).toHaveAttribute('data-active', 'true');

    await page.getByTestId('m-chip-Mine').click();
    await expect(page.getByTestId('m-chip-Mine')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('m-chip-All')).toHaveAttribute('data-active', 'false');

    // Exactly one active chip, always.
    expect(await page.locator('[data-testid^="m-chip-"][data-active="true"]').count()).toBe(1);
  });

  test('A-9b · the row is exactly All / Active / Mine / On hold, and the chips change the rows listed', async ({
    page,
  }) => {
    await page.goto('/m/projects');
    const labels = await page.locator('[data-testid^="m-chip-"]').allInnerTexts();
    expect(labels.map((l) => l.trim())).toEqual(['All', 'Active', 'Mine', 'On hold']);

    const allCount = await cards(page).count();

    // On hold returns strictly fewer rows, and every one of them is on hold.
    await page.getByTestId('m-chip-On hold').click();
    await expect(page.getByTestId('m-chip-On hold')).toHaveAttribute('data-active', 'true');
    const heldCount = await cards(page).count();
    expect(heldCount).toBeGreaterThan(0);
    expect(heldCount).toBeLessThan(allCount);
    for (const pill of await page.getByTestId('m-status-pill').allInnerTexts()) {
      expect(pill.trim()).toMatch(/hold/i);
    }

    // Active likewise — and it excludes the on-hold fixture row.
    // Waiting on the chip's own state first: the chip is a server navigation,
    // so counting rows straight after the click can still see the PREVIOUS
    // filter's markup.
    await page.getByTestId('m-chip-Active').click();
    await expect(page.getByTestId('m-chip-Active')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('m-status-pill').first()).toHaveText(/active/i);
    const activeCount = await cards(page).count();
    expect(activeCount).toBeGreaterThan(0);
    expect(activeCount).toBeLessThan(allCount);
    for (const pill of await page.getByTestId('m-status-pill').allInnerTexts()) {
      expect(pill.trim()).toMatch(/active/i);
    }

    // Mine is a subset of All. It cannot be a STRICT subset for a crew
    // identity — see the header note.
    await page.getByTestId('m-chip-Mine').click();
    expect(await cards(page).count()).toBeLessThanOrEqual(allCount);
  });

  test('A-9c · typing filters live, with no submit action', async ({ page }) => {
    await page.goto('/m/projects');
    const before = await cards(page).count();
    expect(before).toBeGreaterThan(1);

    const url = page.url();
    await page.getByTestId('m-search').fill('M6M — on hold');

    // No Enter, no button — the list narrows on input alone.
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('M6M — on hold');
    expect(page.url()).toBe(url); // and nothing navigated
  });

  test('A-10 · every number renders in IBM Plex Mono', async ({ page }) => {
    await page.goto('/m/projects');
    await assertMonoNumbers(page, 'M-2');
  });

  test('A-10b · every status pill carries its text label', async ({ page }) => {
    await page.goto('/m/projects');
    const pills = page.getByTestId('m-status-pill');
    const n = await pills.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      expect((await pills.nth(i).innerText()).trim().length).toBeGreaterThan(0);
    }
  });

  test('A-10c · the app bar reads `{n} active` and nothing after it', async ({ page }) => {
    await page.goto('/m/projects');
    // The screen DECLARES its app-bar sub-line from a client effect
    // (SetMobileHeader), so the shell's pathname-derived default — the company
    // name — is what paints first. Retrying via toHaveText rather than reading
    // innerText once is what makes this assert the declared value.
    const sub = page.locator('header p.font-mono').first();
    await expect(sub).toHaveText(/^\d+ active$/);
    // No second count, no separator, no `estimating` figure (D-23).
    expect((await sub.innerText()).trim()).not.toMatch(/estimating|·/);
  });

  test('A-10d · no card renders a progress bar or a percentage anywhere', async ({ page }) => {
    await page.goto('/m/projects');
    await expect(page.locator('[role="progressbar"], progress')).toHaveCount(0);
    const body = await page.getByTestId('m-content').innerText();
    expect(body).not.toMatch(/\d\s*%/);
  });

  test('A-10e · the footer renders days-left in all three states', async ({ page }) => {
    await page.goto('/m/projects');

    const labelFor = async (name: string) =>
      (
        await page
          .locator('[data-testid="m-project-card"]', { hasText: name })
          .getByTestId('m-days-left')
          .innerText()
      ).trim();

    // Positive.
    expect(await labelFor('M6M — future target')).toMatch(/^\d+ days left$/);
    // NEGATIVE past target — not clamped at zero.
    expect(await labelFor('M6M — past target')).toMatch(/^-\d+ days left$/);
    // Empty state when target_end_date is null — the em-dash, never `0`.
    expect(await labelFor('M6M — no target')).toBe('—');
  });
});

// ===========================================================================
// M-3 · §4.3
// ===========================================================================
test.describe('M-3 · Project sections hub', () => {
  const hub = () => `/m/p/${fx.futureProject}`;

  test('A-11e · the stat strip is exactly two stats, 50/50, with a single 1px rule', async ({
    page,
  }) => {
    await page.goto(hub());
    const strip = page.getByTestId('m-stat-strip');
    await expect(strip).toBeVisible();

    // Two children, no third stat and no leftover empty slot.
    expect(await strip.locator(':scope > div').count()).toBe(2);

    const days = await page.getByTestId('m-stat-days').boundingBox();
    const punch = await page.getByTestId('m-stat-punch').boundingBox();
    expect(days).not.toBeNull();
    expect(punch).not.toBeNull();
    // 50/50 — not two thirds-width columns with a hole where Progress was.
    expect(Math.abs(days!.width - punch!.width)).toBeLessThanOrEqual(1);

    // A SINGLE 1px rule, on the centre line: the second cell's left border.
    const rule = await page
      .getByTestId('m-stat-punch')
      .evaluate((el) => getComputedStyle(el).borderLeftWidth);
    expect(parseFloat(rule)).toBeCloseTo(1, 1);

    // D-19: no Progress stat, anywhere.
    await expect(page.getByTestId('m-stat-strip')).not.toContainText(/progress/i);
  });

  test('A-11 · the Punch stat is amber when non-zero', async ({ page }) => {
    await page.goto(hub());
    const stat = page.getByTestId('m-stat-punch').locator('[data-tone]');
    await expect(stat).toHaveAttribute('data-tone', 'amber');
    expect(await stat.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(245, 158, 11)');
  });

  test('A-11 · the Punch stat is muted at zero', async ({ page }) => {
    // A project with no punch items at all — the other half of the rule, which
    // the fixture project cannot show.
    await page.goto(`/m/p/${fx.nullDateProject}`);
    const stat = page.getByTestId('m-stat-punch').locator('[data-tone]');
    await expect(stat).toHaveAttribute('data-tone', 'muted');
    expect(await stat.evaluate((el) => getComputedStyle(el).color)).not.toBe('rgb(245, 158, 11)');
  });

  test('A-11b · the stat and the Punch List tile both read `{mine} mine · {total} open`', async ({
    page,
  }) => {
    await page.goto(hub());
    // Fixture: 2 open + 1 in_progress assigned to this member = 3 mine;
    // plus 1 open assigned to someone else = 4 total.
    const expected = '3 mine · 4 open';
    await expect(page.getByTestId('m-stat-punch')).toContainText(expected);
    await expect(page.getByTestId('m-tile-punch')).toContainText(expected);
  });

  test('A-11c · a complete item drops out of both figures; an in_progress item stays in', async ({
    page,
  }) => {
    await page.goto(hub());
    // The fixture carries one `complete` and one `verified` item assigned to
    // this member. Neither is counted — 3/4, not 5/6.
    await expect(page.getByTestId('m-stat-punch')).toContainText('3 mine · 4 open');
    // And the in_progress one IS counted: without it the figure would be 2 mine.
    await expect(page.getByTestId('m-stat-punch')).not.toContainText('2 mine');
  });

  test('A-11d · the Days-left stat renders all three states', async ({ page }) => {
    const figure = async (projectId: string) => {
      await page.goto(`/m/p/${projectId}`);
      return (await page.getByTestId('m-stat-days').innerText()).replace(/days left/i, '').trim();
    };
    expect(await figure(fx.futureProject)).toMatch(/^\d+$/);
    expect(await figure(fx.pastProject)).toMatch(/^-\d+$/); // negative, not clamped
    expect(await figure(fx.nullDateProject)).toBe('—');
  });

  test('A-11f · "Up next" is the first event dated today or later', async ({ page }) => {
    await page.goto(hub());
    const card = page.getByTestId('m-up-next');
    // plus3 wins: plus5 is later, and the minus3 row is in the past.
    await expect(card).toContainText(fx.dates.plus3);
    await expect(card).not.toContainText(fx.dates.plus5);
    await expect(card).not.toContainText(fx.dates.minus3);
  });

  test('A-11f · a nearer-dated event added afterwards displaces it', async ({ page }) => {
    await page.goto(hub());
    await expect(page.getByTestId('m-up-next')).toContainText(fx.dates.plus3);

    const { data } = await fx.admin
      .from('schedule_entries')
      .insert({
        company_id: COMPANY_A,
        project_id: fx.futureProject,
        member_id: CREW_MEMBER,
        entry_date: fx.dates.plus1,
        general_kind: 'project',
        notes: 'M6M — nearer',
      })
      .select('id')
      .single();

    await page.reload();
    await expect(page.getByTestId('m-up-next')).toContainText(fx.dates.plus1);

    if (data) await fx.admin.from('schedule_entries').delete().eq('id', data.id);
  });

  test('A-11g · same-date events are tie-broken deterministically and identically on every render', async ({
    page,
  }) => {
    // Two general entries on the SAME date. The union sorts on date alone, so
    // without the tie-break the card flickers between them.
    const rows = [
      { title: 'M6M — tie B', notes: 'M6M — tie B' },
      { title: 'M6M — tie A', notes: 'M6M — tie A' },
    ];
    const inserted: string[] = [];
    for (const r of rows) {
      const { data } = await fx.admin
        .from('schedule_entries')
        .insert({
          company_id: COMPANY_A,
          project_id: fx.nullDateProject,
          member_id: CREW_MEMBER,
          entry_date: fx.dates.plus1,
          general_kind: 'project',
          notes: r.notes,
        })
        .select('id')
        .single();
      if (data) inserted.push(data.id);
    }

    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.goto(`/m/p/${fx.nullDateProject}`);
      seen.push((await page.getByTestId('m-up-next').innerText()).trim());
    }
    expect(new Set(seen).size, 'Up next changed between renders').toBe(1);

    if (inserted.length) await fx.admin.from('schedule_entries').delete().in('id', inserted);
  });

  test('A-11h · with nothing dated today or later, the card renders the empty state and is NOT omitted', async ({
    page,
  }) => {
    await page.goto(`/m/p/${fx.onHoldProject}`);
    const card = page.getByTestId('m-up-next');
    await expect(card).toBeVisible(); // present, not absent
    await expect(card).toContainText('Nothing scheduled');
  });

  test('A-11i · the date line renders the DATE, never a blank notes field', async ({ page }) => {
    await page.goto(hub());
    const line = page.getByTestId('m-up-next-date');
    await expect(line).toBeVisible();
    const text = (await line.innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(fx.dates.plus3);
  });

  test('A-11j · a crew member\'s "Up next" reflects only the schedule rows RLS grants them', async ({
    page,
  }) => {
    await page.goto(hub());
    // The teammate's entry is dated NEARER (plus1) than this member's (plus3).
    // A build querying with elevated rights would show it; RLS must withhold it.
    await expect(page.getByTestId('m-up-next')).toContainText(fx.dates.plus3);
    await expect(page.getByTestId('m-up-next')).not.toContainText(fx.dates.plus1);
    await expect(page.getByTestId('m-content')).not.toContainText('teammate');
  });

  test('A-12 · the grid renders exactly nine tiles and none is a finance tile', async ({ page }) => {
    await page.goto(hub());
    const tiles = page.getByTestId('m-section-grid').locator('a');
    await expect(tiles).toHaveCount(9);

    const labels = (await tiles.allInnerTexts()).map((t) => t.trim());
    for (const banned of ['Budget', 'Invoices', 'Payments', 'Contracts']) {
      expect(labels.join(' | ')).not.toContain(banned);
    }
    expect(labels.join(' | ')).toContain('Overview');
    expect(labels.join(' | ')).toContain('Photos');
  });

  test('A-12b · badge tones — Change Orders and Punch amber, Deliveries red, Photos and Team mono', async ({
    page,
  }) => {
    await page.goto(hub());
    await expect(page.getByTestId('m-tile-changes')).toHaveAttribute('data-tone', 'amber');
    await expect(page.getByTestId('m-tile-punch')).toHaveAttribute('data-tone', 'amber');
    await expect(page.getByTestId('m-tile-deliveries')).toHaveAttribute('data-tone', 'danger');
    await expect(page.getByTestId('m-tile-photos')).toHaveAttribute('data-tone', 'mono');
    await expect(page.getByTestId('m-tile-team')).toHaveAttribute('data-tone', 'mono');

    // The rendered colour, for the badges that have something to show.
    const punchBadge = page.getByTestId('m-tile-punch').getByTestId('m-tile-badge');
    expect(await punchBadge.evaluate((el) => getComputedStyle(el).color)).toBe(
      'rgb(245, 158, 11)'
    );
    const photoBadge = page.getByTestId('m-tile-photos').getByTestId('m-tile-badge');
    expect(await photoBadge.evaluate((el) => getComputedStyle(el).color)).toBe(
      'rgb(135, 146, 168)' // #8792a8 — m6m.muted, README ramp
    );
  });

  test('A-13 · the Photos tile shows the total count and NO dot', async ({ page }) => {
    await page.goto(hub());
    const tile = page.getByTestId('m-tile-photos');
    await expect(tile.getByTestId('m-tile-badge')).toHaveText(/^\d+$/);

    // D-14 as amended: the unseen dot is deferred to v2 and no view-tracking
    // table exists. Nothing round, coloured and decorative may render here.
    const dots = await tile.evaluate((el) => {
      return Array.from(el.querySelectorAll('*')).filter((n) => {
        const s = getComputedStyle(n as Element);
        const r = (n as HTMLElement).getBoundingClientRect();
        return (
          parseFloat(s.borderTopLeftRadius) >= r.width / 2 &&
          r.width > 0 &&
          r.width <= 14 &&
          r.height <= 14 &&
          s.backgroundColor !== 'rgba(0, 0, 0, 0)'
        );
      }).length;
    });
    expect(dots, 'an unseen-photo dot was rendered').toBe(0);
  });

  test('A-12c · eight of the nine tiles navigate to their own /m route and render a screen', async ({
    page,
  }) => {
    // M-8 is not built, so `photos` is asserted separately below.
    const built = [
      'overview',
      'schedule',
      'changes',
      'punch',
      'deliveries',
      'files',
      'contacts',
      'team',
    ];
    // `next dev` compiles a route on its first request, and this test visits
    // eight for the first time while the other spec files hammer the same
    // server. The BUDGET is raised; every assertion below is unchanged.
    test.setTimeout(180_000);

    for (const key of built) {
      await page.goto(hub());
      const tile = page.getByTestId(`m-tile-${key}`);
      await expect(tile).toHaveAttribute('href', `/m/p/${fx.futureProject}/${key}`);
      await tile.click();
      await page.waitForURL(new RegExp(`/m/p/${fx.futureProject}/${key}$`), { timeout: 60_000 });
      // It rendered a screen, not an error and not an empty shell.
      await expect(page.getByTestId('m-content')).toBeVisible();
      await expect(page.getByTestId('m-tabbar')).toBeVisible();
    }
  });

  test('A-12c · the Photos tile points at its own /m route, never at /dashboard (M-8 pending)', async ({
    page,
  }) => {
    await page.goto(hub());
    const href = await page.getByTestId('m-tile-photos').getAttribute('href');
    expect(href).toBe(`/m/p/${fx.futureProject}/photos`);
    expect(href).not.toContain('/dashboard');
  });

  test('A-30-family · M-3 keeps the back chevron, no hamburger, Projects active', async ({
    page,
  }) => {
    await page.goto(hub());
    await expect(page.getByTestId('m-back')).toHaveCount(1);
    await expect(page.getByTestId('m-hamburger')).toHaveCount(0);
    await expect(page.getByTestId('m-tab-projects')).toHaveAttribute('aria-current', 'page');
    await assertMonoNumbers(page, 'M-3');
  });
});

// ===========================================================================
// M-7 · §4.7
// ===========================================================================
test.describe('M-7 · Field', () => {
  test('A-13b · a 2-column grid of exactly four tiles, each with its badge slot', async ({
    page,
  }) => {
    await page.goto('/m/field');
    const tiles = page.getByTestId('m-field-grid').locator('a');
    await expect(tiles).toHaveCount(4);

    const labels = (await tiles.allInnerTexts()).map((t) => t.trim().split('\n')[0]);
    expect(labels).toEqual(
      expect.arrayContaining(['Daily logs', 'Deliveries', 'Safety', 'Photos'])
    );

    const cols = await page
      .getByTestId('m-field-grid')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(cols).toBe(2);
  });

  test('A-13c · the context row names the project, and switching re-points the tiles', async ({
    page,
  }) => {
    await page.goto(`/m/field?project=${fx.futureProject}`);

    const row = page.getByTestId('m-project-context');
    await expect(row).toContainText('M6M — future target');
    await expect(page.getByTestId('m-field-tile-safety')).toHaveAttribute(
      'href',
      `/m/p/${fx.futureProject}/safety`
    );

    // Tap it, choose another project.
    await row.click();
    await page
      .locator(`[data-testid="m-project-choice"][data-project-id="${fx.onHoldProject}"]`)
      .click();

    await expect(page.getByTestId('m-project-context')).toContainText('M6M — on hold');
    // THE TILES THEN REFLECT THE NEW PROJECT — the half A-13c exists for.
    await expect(page.getByTestId('m-field-tile-safety')).toHaveAttribute(
      'href',
      `/m/p/${fx.onHoldProject}/safety`
    );
    await expect(page.getByTestId('m-field-tile-deliveries')).toHaveAttribute(
      'href',
      `/m/p/${fx.onHoldProject}/deliveries`
    );
  });

  test('A-12d · three of the four tiles navigate to a real screen (Photos pends M-8)', async ({
    page,
  }) => {
    const expected: [string, string][] = [
      ['m-field-tile-logs', `/m/logs?project=${fx.futureProject}`],
      ['m-field-tile-deliveries', `/m/p/${fx.futureProject}/deliveries`],
      ['m-field-tile-safety', `/m/p/${fx.futureProject}/safety`],
    ];

    for (const [testId, href] of expected) {
      await page.goto(`/m/field?project=${fx.futureProject}`);
      const tile = page.getByTestId(testId);
      await expect(tile).toHaveAttribute('href', href);
      expect(href).not.toContain('/dashboard');
      await tile.click();
      await expect(page.getByTestId('m-content')).toBeVisible();
      await expect(page.getByTestId('m-tabbar')).toBeVisible();
    }

    // Photos: right URL, screen pending.
    await page.goto(`/m/field?project=${fx.futureProject}`);
    const photos = await page.getByTestId('m-field-tile-photos').getAttribute('href');
    expect(photos).toBe(`/m/p/${fx.futureProject}/photos`);
    expect(photos).not.toContain('/dashboard');
  });

  test('A-12e · the three shared tiles resolve to the EXISTING routes — no duplicates were built', async ({
    page,
  }) => {
    await page.goto(`/m/field?project=${fx.futureProject}`);

    // Photos -> M-8's route, Deliveries -> M-15's, Daily logs -> M-6 with the
    // project in context. None of them is a second, M-7-only screen.
    await expect(page.getByTestId('m-field-tile-photos')).toHaveAttribute(
      'href',
      `/m/p/${fx.futureProject}/photos`
    );
    await expect(page.getByTestId('m-field-tile-deliveries')).toHaveAttribute(
      'href',
      `/m/p/${fx.futureProject}/deliveries`
    );
    await expect(page.getByTestId('m-field-tile-logs')).toHaveAttribute(
      'href',
      `/m/logs?project=${fx.futureProject}`
    );

    // M-3 reaches the SAME deliveries and photos routes — one screen each.
    await page.goto(`/m/p/${fx.futureProject}`);
    await expect(page.getByTestId('m-tile-deliveries')).toHaveAttribute(
      'href',
      `/m/p/${fx.futureProject}/deliveries`
    );
    await expect(page.getByTestId('m-tile-photos')).toHaveAttribute(
      'href',
      `/m/p/${fx.futureProject}/photos`
    );
  });

  test('A-5 · every interactive element on M-7 and M-3 measures >=44px', async ({ page }) => {
    for (const url of [`/m/field?project=${fx.futureProject}`, `/m/p/${fx.futureProject}`]) {
      await page.goto(url);
      const els = await page.locator('a, button, input, select, textarea, [role="button"]').all();
      const undersized: string[] = [];
      for (const el of els) {
        if (!(await el.isVisible())) continue;
        const box = await el.boundingBox();
        if (!box) continue;
        if (Math.min(box.width, box.height) < 44) {
          undersized.push(`${await el.getAttribute('data-testid')} ${box.width}x${box.height}`);
        }
      }
      expect(undersized, `${url}: ${undersized.join(', ')}`).toHaveLength(0);
    }
  });
});

// ===========================================================================
// The clocked-out state must not leak into other spec files.
// ===========================================================================
test.afterAll(async () => {
  if (fx) await closeSegment(fx);
});
