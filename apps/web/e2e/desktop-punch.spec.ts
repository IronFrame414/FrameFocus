import { test, expect } from '@playwright/test';

// D-65 ON DESKTOP — the punch assignee picker. [S121]
//
// ===========================================================================
// WHY THIS FILE IS NOT NAMED m-*.spec.ts, AND WHY IT EXISTS AT ALL
// ===========================================================================
// `playwright.config.ts` routes `m-*.spec.ts` to `chromium-auth` — a 402x874
// viewport carrying a crew session. This tests **/dashboard**, at a desktop
// viewport, so it belongs to the anonymous `chromium` project and signs in
// itself, exactly as `sign-in-destination.spec.ts` does.
//
// Ruled [Josh, S121]: desktop's punch picker gets "the same two-step shape ...
// sharing the mobile implementation rather than a second copy where the two can
// drift". The desktop punch panel had NO browser coverage at all before this
// file, which is part of how it came to be worse than the mobile screen that
// replaced it: one flat `<select>` over all 39 members, no crew/sub split, and
// not even the `(Sub)` label the neighbouring Team panel manages.
//
// ⚠️ WHAT IS SHARED IS ASSERTED ON BOTH SIDES DELIBERATELY. `lib/assignee-picker.ts`
// holds the partition and the switch-clears-the-pick rule; `e2e/m-writes.spec.ts`
// asserts them through the mobile markup and this file asserts them through the
// desktop markup. Testing the hook once and trusting both renders would not
// catch a surface wiring the shared state up wrongly, which is the failure this
// pass is actually guarding against.
//
// ⚠️ PROJECT SCOPING IS NOT ASSERTED — it is not built. Held, per
// docs/specs/113c-award-assignment-spec.md §7: 1 of 33 subcontractor members
// carries any `project_assignments` row, so a scoped picker would be empty on
// six of eight projects. A green test over an empty picker is the worst
// available outcome, so no criterion was written for it.

const OWNER = 'josh+test50@worthprop.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

test.beforeEach(async ({ page }) => {
  await page.goto('/sign-in');
  await page.locator('#email').fill(OWNER);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  await page.goto(`/dashboard/projects/${PROJECT}/punch`);
  const add = page.getByRole('button', { name: /add item/i }).first();
  await expect(add).toBeVisible({ timeout: 20_000 });
  await add.click();
});

const sides = '[data-testid^="punch-assignee-side-"]';

test('two steps — neither side is preselected and the assignee select is inert', async ({
  page,
}) => {
  await expect(page.getByTestId('punch-assignee-side-crew')).toBeVisible();
  await expect(page.getByTestId('punch-assignee-side-subcontractor')).toBeVisible();
  await expect(page.locator(`${sides}[data-active="true"]`)).toHaveCount(0);

  // THE CRITERION IS THAT THE FLAT LIST IS GONE. A build that kept the full
  // roster and merely added a toggle above it passes "the toggle exists" and
  // fails this: before a side is chosen the select is disabled and holds only
  // its placeholder.
  const select = page.getByTestId('punch-assignee');
  await expect(select).toBeDisabled();
  await expect(select.locator('option')).toHaveCount(1);
});

test('each side offers only its own members, and the sides are disjoint', async ({ page }) => {
  const select = page.getByTestId('punch-assignee');

  await page.getByTestId('punch-assignee-side-crew').click();
  await expect(select).toBeEnabled();
  const crew = await select.locator('option:not([value=""])').evaluateAll((els) =>
    els.map((e) => (e as HTMLOptionElement).value)
  );
  expect(crew.length).toBeGreaterThan(0);

  await page.getByTestId('punch-assignee-side-subcontractor').click();
  const subs = await select.locator('option:not([value=""])').evaluateAll((els) =>
    els.map((e) => (e as HTMLOptionElement).value)
  );
  expect(subs.length).toBeGreaterThan(0);

  // Disjointness, not a count: a member on both sides means the filter is
  // reading the wrong column — `member_type` is not `profiles.role`, the
  // §4.11.10a trap, and 32 of 33 subs have no profile at all.
  expect(crew.filter((id) => subs.includes(id))).toEqual([]);

  // And the split is real rather than cosmetic: desktop's roster is
  // subcontractor-heavy, which is the whole reason the flat list was unusable.
  expect(subs.length).toBeGreaterThan(crew.length);
});

test('switching sides drops the other side’s pick — the shared rule, through desktop markup', async ({
  page,
}) => {
  const select = page.getByTestId('punch-assignee');

  await page.getByTestId('punch-assignee-side-crew').click();
  const first = await select.locator('option:not([value=""])').first().getAttribute('value');
  await select.selectOption(first!);
  await expect(select).toHaveValue(first!);

  await page.getByTestId('punch-assignee-side-subcontractor').click();

  // Without the clear, the form carries an assignee the visible list does not
  // contain: the user sees an empty select and submits someone they cannot see.
  await expect(select).toHaveValue('');
});

test('the side buttons carry an active state a screen reader can read', async ({ page }) => {
  const crew = page.getByTestId('punch-assignee-side-crew');
  await expect(crew).toHaveAttribute('aria-pressed', 'false');
  await crew.click();
  await expect(crew).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('punch-assignee-side-subcontractor')).toHaveAttribute(
    'aria-pressed',
    'false'
  );
});
