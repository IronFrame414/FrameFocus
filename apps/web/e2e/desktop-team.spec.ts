import { test, expect } from '@playwright/test';
import { OWNER, profileIdFor, signIn } from './chat-fixture';

// ============================================================================
// S175 item 6 — `#1-s168`: A CLIENT IS NOT A TEAM MEMBER, IN A REAL BROWSER.
// ============================================================================
//
// Josh, from a click-test: *"client should be removed from team side."*
//
// ⚠️ WHY THIS EXISTS ALONGSIDE `s175-team-clients-off.live.ts`. The live harness
// proves the SERVICE — `getTeamMembers()` drops the rows, `getTeamMember()`
// returns null, the four server actions refuse. None of that proves the ROUTE
// redirects: `/dashboard/team/[id]` is a server component whose gate is a
// `redirect()` on a falsy return, and the only thing that can demonstrate a
// redirect is something that follows one.
//
// **That distinction is the whole finding.** TECH_DEBT #1-s168's fifth limb:
// *"The detail route is reachable by URL for a client's profile id whether or
// not the list shows it. Dropping the row from the list is cosmetic on its
// own."* Observing that the list no longer shows the row and concluding the
// route is closed are two different claims, and only the second one is the fix.
//
// ⚠️ AND THIS SPEC WRITES NOTHING. It signs in, navigates and asserts. Profile
// ids are looked up by email at run time rather than hard-coded, so a re-seed
// cannot quietly turn these into probes against a row that no longer exists.
//
// ===========================================================================
// ⚠️ THE FILENAME IS LOAD-BEARING, AND THAT IS A TRAP THIS FILE FELL INTO FIRST
// ===========================================================================
// `playwright.config.ts` splits its two browser projects on `/m-.*\.spec\.ts/`
// — `chromium-auth` matches it, `chromium` ignores it. **The regex is not
// anchored.** This spec was first written as `team-clients-off.spec.ts`, and
// `tea` + `m-clients-off.spec.ts` matches: it ran in `chromium-auth`, at the
// 402x874 mobile viewport, carrying the CREW storage state — for a DESKTOP
// roster test signed in as the Owner. It passed anyway, because `signIn()`
// clears cookies first and the assertions are DOM-level, which is the worst
// outcome available: routed to the wrong project and silent about it.
//
// Renamed to `desktop-team.spec.ts`, which carries no `m-`. No existing spec in
// the tree hits this (checked, S175 item 6) — any future one whose name contains
// `m-` anywhere will.

const CLIENT = 'josh+qa-client@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';

test.describe('S175 · #1-s168 — clients are off the Team side', () => {
  test('the list drops clients, keeps the subcontractor, and the detail route redirects', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const [clientId, crewId, subId] = await Promise.all([
      profileIdFor(CLIENT),
      profileIdFor(CREW),
      profileIdFor(SUB),
    ]);

    await signIn(page, OWNER);
    await page.goto('/dashboard/team');
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible({ timeout: 20_000 });

    // ── the list ─────────────────────────────────────────────────────────────
    const table = page.locator('table').first();
    const roleChips = table.locator('tbody tr td:nth-child(2)');
    const chipCount = await roleChips.count();
    expect(chipCount, 'the Team list is empty — that is not a filter, that is a break').toBeGreaterThan(0);

    const roles = await roleChips.allInnerTexts();
    expect(roles.map((r) => r.trim()), 'a Client is still listed on the Team page').not.toContain('Client');

    // ⚠️ Q6.1 IN THE BROWSER. `.in('role', DASHBOARD_ROLES)` — the tidy reach
    // TECH_DEBT calls *"a scope decision, not a freebie"* — would satisfy the
    // assertion above and fail this one.
    expect(
      roles.map((r) => r.trim()),
      'the subcontractor was dropped from the Team list — that is Q6.1, ruled the other way'
    ).toContain('Subcontractor');

    // ── ⚠️ THE ROUTE, WHICH IS THE SUBSTANCE ────────────────────────────────
    await page.goto(`/dashboard/team/${clientId}`);
    await expect(page, 'a client profile id still renders the staff editor').toHaveURL(
      /\/dashboard\/team$/
    );
    await expect(page.getByRole('heading', { name: 'Edit Team Member' })).toHaveCount(0);

    // The paired positive — without it a gate that redirected EVERYBODY passes.
    await page.goto(`/dashboard/team/${crewId}`);
    await expect(page).toHaveURL(new RegExp(`/dashboard/team/${crewId}$`));
    await expect(page.getByRole('heading', { name: 'Edit Team Member' })).toBeVisible();

    // And Q6.1 on the detail route as well.
    await page.goto(`/dashboard/team/${subId}`);
    await expect(page, 'a subcontractor lost their team detail page').toHaveURL(
      new RegExp(`/dashboard/team/${subId}$`)
    );
    await expect(page.getByRole('heading', { name: 'Edit Team Member' })).toBeVisible();
  });

  test('the invite form no longer offers Client, and still offers the four staff roles', async ({
    page,
  }) => {
    // Limb 1. The local `INVITABLE_ROLES` duplicate is gone and the form renders
    // the shared list; this asserts what an Owner actually sees, which is the
    // thing Josh was looking at when he raised it.
    test.setTimeout(120_000);
    await signIn(page, OWNER);
    await page.goto('/dashboard/team/invite');

    const options = page.locator('input[name="role"]');
    await expect(options.first()).toBeVisible({ timeout: 20_000 });
    const values = await options.evaluateAll((els) =>
      els.map((e) => (e as HTMLInputElement).value)
    );

    expect(values, 'the Team invite form still offers a Client role').not.toContain('client');
    // Non-vacuous, and the Owner arm: `admin` is only offered to an Owner, so
    // all four being present is also the paired positive for that filter.
    expect(values.sort()).toEqual(['admin', 'crew_member', 'foreman', 'project_manager']);
    await expect(page.getByText('Portal access to project timeline')).toHaveCount(0);
  });
});
