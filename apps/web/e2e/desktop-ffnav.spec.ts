import { test, expect, type Page } from '@playwright/test';

// FFNav reindex — A-N1, A-N2. Spec: docs/specs/ffnav-reindex-spec.md
//
// desktop-*.spec.ts, so this lands in the anonymous `chromium` project at a
// desktop viewport and signs in per role — the precedent desktop-punch.spec.ts
// set. Five roles, because §3's whole claim is that the order is the SAME and
// only items are removed; one role could not show that.

const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';

const ROLES = {
  owner: 'josh+test50@worthprop.com',
  admin: 'josh+qa-admin@worthprop.com',
  pm: 'josh+pm@worthprop.com',
  foreman: 'josh+qa-foreman@worthprop.com',
  crew: 'josh+crew@worthprop.com',
} as const;

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/** Nav labels in RENDER order, headers included as `— Label —`. */
async function navRows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nav = document.querySelector('aside nav');
    if (!nav) return [];
    // Walking the rendered DOM rather than querying the two kinds separately,
    // because ORDER is what is being asserted and separate queries would lose
    // the interleaving.
    return Array.from(nav.querySelectorAll('a, p'))
      .map((el) => {
        const text = (el.textContent ?? '').trim();
        return el.tagName === 'P' ? `— ${text} —` : text.replace(/\d+\+?$/, '').trim();
      })
      .filter(Boolean);
  });
}

const TOP = [
  'Dashboard',
  'Projects',
  'Schedule',
  'Field Ops',
  'Timeclock',
  'Expenses',
  'Estimates',
  'Notifications',
];

test.describe('A-N1 — three sections, in the ruled order', () => {
  // ⚠️ WAS 14 [inverted, "move Billing into Settings"]. Billing became an
  // owner-only Settings TAB, so it is gone from the sidebar for everyone —
  // including the owner. The Admin section is now Settings alone. S157 inversion.
  test('Owner sees 13 across three sections (Billing moved to Settings)', async ({ page }) => {
    await signIn(page, ROLES.owner);
    expect(await navRows(page)).toEqual([
      ...TOP,
      '— Reference —',
      'Contacts',
      'Subs & Vendors',
      'Team',
      'Cost Catalog',
      '— Admin —',
      'Settings',
    ]);
  });

  test('the top layer carries NO header', async ({ page }) => {
    await signIn(page, ROLES.owner);
    // Ruled: the top layer is ungrouped. A build that labelled it "Daily" or
    // "Main" would satisfy every ordering assertion above.
    const rows = await navRows(page);
    expect(rows[0]).toBe('Dashboard');
    expect(rows.slice(0, 8).some((r) => r.startsWith('—'))).toBe(false);
  });

  test('headers are labels, and there are exactly two', async ({ page }) => {
    await signIn(page, ROLES.owner);
    await expect(page.getByTestId('nav-section-reference')).toHaveText('Reference');
    await expect(page.getByTestId('nav-section-admin')).toHaveText('Admin');
    await expect(page.locator('aside nav p')).toHaveCount(2);
  });
});

test.describe('A-N3 — same order, items removed', () => {
  // ⚠️ WAS "Admin loses Billing only" — the delta between owner and admin. Now
  // Billing is a Settings tab, gone from the sidebar for BOTH, so admin and owner
  // see the identical 13-item nav. Asserted as an equality so a change to one
  // role's nav that misses the other fails here. Admin's LACK of the billing tab
  // is proven separately in desktop-settings-billing.spec.ts.
  test('Admin sees the SAME nav as the owner now — Billing is gone for both', async ({ page }) => {
    await signIn(page, ROLES.owner);
    const owner = await navRows(page);
    await signIn(page, ROLES.admin);
    const admin = await navRows(page);
    expect(admin).toEqual(owner);
    expect(admin).not.toContain('Billing');
    // Admin still reaches the Admin section — Settings is owner/admin.
    expect(admin).toContain('Settings');
  });

  test('PM keeps Estimates and Cost Catalog, and loses the whole Admin section', async ({
    page,
  }) => {
    await signIn(page, ROLES.pm);
    expect(await navRows(page)).toEqual([
      ...TOP,
      '— Reference —',
      'Contacts',
      'Subs & Vendors',
      'Team',
      'Cost Catalog',
    ]);
  });

  test('foreman and crew get the SAME list — asked directly, answered no', async ({ page }) => {
    // §3: foreman order is the same as crew. Asserted as an equality between
    // the two rather than twice against a literal, so a change to one that
    // misses the other fails here.
    await signIn(page, ROLES.foreman);
    const foreman = await navRows(page);
    await signIn(page, ROLES.crew);
    const crew = await navRows(page);
    expect(foreman).toEqual(crew);
  });
});

test.describe('A-N2 — an empty section renders NO header', () => {
  for (const role of ['crew', 'foreman', 'pm'] as const) {
    test(`${role} sees no Admin header`, async ({ page }) => {
      await signIn(page, ROLES[role]);
      // ⚠️ THE ABSENCE IS THE CRITERION. A labelled group with nothing under it
      // is worse than no group, and a build that rendered the header
      // unconditionally would pass every ordering assertion in this file.
      await expect(page.getByTestId('nav-section-admin')).toHaveCount(0);
      await expect(page.getByTestId('nav-section-reference')).toHaveCount(1);
    });
  }

  test('crew Reference is Contacts, Subs & Vendors and Team', async ({ page }) => {
    await signIn(page, ROLES.crew);
    expect(await navRows(page)).toEqual([
      'Dashboard',
      'Projects',
      'Schedule',
      'Field Ops',
      'Timeclock',
      'Expenses',
      // No Estimates — gated.
      'Notifications',
      '— Reference —',
      'Contacts',
      'Subs & Vendors',
      // Team is UNGATED, so crew keep it. This is the consequence §2b records:
      // the interview's example said crew's Reference was two items, and Team's
      // placement makes it three. A gate change would be the alternative, and
      // this work was told not to make one.
      'Team',
      // No Cost Catalog — gated.
    ]);
  });
});
