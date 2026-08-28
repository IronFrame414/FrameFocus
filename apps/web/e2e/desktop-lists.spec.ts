import { test, expect, type Page } from '@playwright/test';

// Desktop redesign, build step 4 — the §5b acceptance pass for the six list
// screens, run ONCE at the end of the step. Every screen renders for OWNER
// with real Bishop data, and for a GATED role (PM — the one gated role that
// can reach all six); the gated role sees LESS, NOT NOTHING.
//
// desktop-*.spec.ts → the anonymous `chromium` project; signs in per role,
// the desktop-ffnav precedent.

const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe('the six list screens render for Owner — real data, new anatomy', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, OWNER);
  });

  test('14a Projects — new columns and metric strip', async ({ page }) => {
    await page.goto('/dashboard/projects');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    // The [S97]-amended header survives the design, and the new columns exist.
    await expect(page.getByText('Contract / projected')).toBeVisible();
    for (const label of ['Progress', 'Billed', 'Margin', 'Needs attention']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    // Metric strip — all four cards for Owner.
    for (const label of ['Contract value', 'Unbilled work', 'Awaiting signature', 'Need attention']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    // NOT an empty state — real Bishop data is behind it.
    await expect(page.getByText('No projects')).toHaveCount(0);
  });

  test('14f Cost Catalog — stale chip and ruled usage wording', async ({ page }) => {
    await page.goto('/dashboard/catalog');
    await expect(page.getByRole('heading', { name: 'Cost Catalog' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Stale/ })).toBeVisible();
    // The ruled wording, if any item is used: "used N times", never
    // "used on N estimates".
    await expect(page.getByText(/used on \d+ estimates/)).toHaveCount(0);
  });

  test('14c Contacts — the two new columns', async ({ page }) => {
    await page.goto('/dashboard/contacts');
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
    await expect(page.getByText('Jobs', { exact: true })).toBeVisible();
    await expect(page.getByText('Client portal', { exact: true })).toBeVisible();
  });

  test('14e Team — burden and week columns', async ({ page }) => {
    await page.goto('/dashboard/team');
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
    await expect(page.getByText('Burden / hr', { exact: true })).toBeVisible();
    await expect(page.getByText('This week', { exact: true })).toBeVisible();
  });

  test('14d Subs & Vendors — W-9 and the sub-only money columns', async ({ page }) => {
    await page.goto('/dashboard/subcontractors');
    await expect(page.getByRole('heading', { name: 'Subs & Vendors' })).toBeVisible();
    for (const label of ['W-9', 'Committed open', '12-mo spend']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('14b Estimates — win rate, expiring soon, client activity', async ({ page }) => {
    await page.goto('/dashboard/estimates');
    await expect(page.getByRole('heading', { name: 'Estimates' })).toBeVisible();
    await expect(page.getByText('Win rate', { exact: true })).toBeVisible();
    await expect(page.getByText('Expiring soon', { exact: true })).toBeVisible();
    await expect(page.getByText('Client activity', { exact: true })).toBeVisible();
  });
});

test.describe('the gated role sees LESS, NOT NOTHING — the reflow, live', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, PM);
  });

  test('14a Projects as PM — money columns gone, page alive', async ({ page }) => {
    await page.goto('/dashboard/projects');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    // The floor: no Contract/Billed/Margin columns, no money metric cards.
    await expect(page.getByText('Contract / projected')).toHaveCount(0);
    await expect(page.getByText('Billed', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Margin', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Contract value', { exact: true })).toHaveCount(0);
    // Less, not nothing: the non-money anatomy is all still there.
    for (const label of ['Progress', 'Needs attention', 'Awaiting signature', 'Need attention']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText('No projects')).toHaveCount(0);
  });

  test('14d Subs & Vendors as PM — compliance skipped, list alive', async ({ page }) => {
    await page.goto('/dashboard/subcontractors');
    await expect(page.getByRole('heading', { name: 'Subs & Vendors' })).toBeVisible();
    // The read was SKIPPED server-side: no alert strip, and the W-9 column
    // renders em-dashes (never a false "Missing").
    await expect(page.getByText(/expired compliance/)).toHaveCount(0);
    await expect(page.getByText('Missing', { exact: true })).toHaveCount(0);
    // The table itself renders — company and type columns intact.
    await expect(page.getByText('Company', { exact: true })).toBeVisible();
  });
});
