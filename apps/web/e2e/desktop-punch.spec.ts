import { test, expect } from '@playwright/test';
import { adminClient } from './hub-fixture';

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
// ⚠️ PROJECT SCOPING IS NOW ASSERTED — see the D-65 part 3 block at the end of
// this file. It was held at first build (1 of 33 subs carried an assignment
// row), and the hold is recorded there together with the re-measurement that
// cleared it.

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

  // ⚠️ A SKEW ASSERTION LIVED HERE AND IS GONE [S121]. It read
  // `expect(subs.length).toBeGreaterThan(crew.length)` — true of the COMPANY
  // roster (33 subs, 6 crew) and the reason the flat list was unusable, but
  // false once D-65 part 3 scopes the picker to the project, where the fixture
  // carries 4 crew and 1 sub. The claim it made is now carried properly by the
  // scoping tests at the end of this file, which compare the picker against the
  // project's actual assignment rows instead of a company-wide shape.
  expect(crew.length + subs.length).toBeGreaterThan(0);
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

// ===========================================================================
// D-65 PART 3 — THE PICKER IS SCOPED TO THE PROJECT [S121]
// ===========================================================================
// Held at first build and now unheld. The bar the hold set, and the
// re-measurement that cleared it:
//
//   project_assignments      19 -> 24     (subcontractor rows 2 -> 7)
//   projects with BOTH sides  2 -> 5 of 8
//   sub side empty on         6 -> 3 of 8
//
// ⚠️ WRITING THIS CRITERION IS THE POINT. Its ABSENCE was itself recorded as a
// finding when the scoping was held: "a green test over an empty picker is the
// worst outcome available here". So every assertion below is paired with a
// non-vacuity half, the way A-33c's subcontractor arm is — a scoped picker that
// returned nothing to everybody would satisfy a naive "the roster is not shown"
// test and be useless.
test.describe('D-65 part 3 · the picker is scoped to the project', () => {
  test('the picker offers FEWER members than the company roster, and not zero', async ({
    page,
  }) => {
    const db = adminClient();
    const { data: roster } = await db
      .from('company_members')
      .select('id, member_type')
      .eq('is_deleted', false);
    const { data: assigns } = await db
      .from('project_assignments')
      .select('member_id')
      .eq('project_id', PROJECT)
      .eq('is_deleted', false);

    const assigned = new Set((assigns ?? []).map((a) => a.member_id));
    const onProject = (roster ?? []).filter((m) => assigned.has(m.id));
    const expectedCrew = onProject.filter((m) => m.member_type !== 'subcontractor').length;
    const expectedSubs = onProject.filter((m) => m.member_type === 'subcontractor').length;

    // NON-VACUITY, HALF 1: the fixture must be able to tell scoped from
    // unscoped. If the project held the whole roster this test would pass
    // against a picker that did no filtering at all.
    expect(
      onProject.length,
      'every member is on this project — scoping is indistinguishable from not scoping'
    ).toBeLessThan((roster ?? []).length);
    expect(expectedCrew, 'no crew on the fixture project — the crew side cannot be tested').toBeGreaterThan(0);
    expect(expectedSubs, 'no sub on the fixture project — the sub side cannot be tested').toBeGreaterThan(0);

    const select = page.getByTestId('punch-assignee');

    await page.getByTestId('punch-assignee-side-crew').click();
    const crew = await select.locator('option:not([value=""])').evaluateAll((els) =>
      els.map((e) => (e as HTMLOptionElement).value)
    );
    expect(crew.length, 'the crew side is not scoped to the project').toBe(expectedCrew);

    await page.getByTestId('punch-assignee-side-subcontractor').click();
    const subs = await select.locator('option:not([value=""])').evaluateAll((els) =>
      els.map((e) => (e as HTMLOptionElement).value)
    );
    expect(subs.length, 'the sub side is not scoped to the project').toBe(expectedSubs);

    // NON-VACUITY, HALF 2: neither side is empty. The whole reason the scoping
    // was held is that an empty side is worse than a flat list.
    expect(crew.length).toBeGreaterThan(0);
    expect(subs.length).toBeGreaterThan(0);

    // And every offered member really is on the project.
    for (const id of [...crew, ...subs]) expect(assigned.has(id)).toBe(true);
  });

  test('a member NOT on the project is absent from both sides', async ({ page }) => {
    // The exclusion half. A count assertion alone would pass on a picker that
    // returned the right NUMBER of the wrong people.
    const db = adminClient();
    const { data: roster } = await db
      .from('company_members')
      .select('id, display_name')
      .eq('is_deleted', false);
    const { data: assigns } = await db
      .from('project_assignments')
      .select('member_id')
      .eq('project_id', PROJECT)
      .eq('is_deleted', false);
    const assigned = new Set((assigns ?? []).map((a) => a.member_id));
    const off = (roster ?? []).find((m) => !assigned.has(m.id));
    expect(off, 'every member is assigned — nobody to exclude').toBeTruthy();

    const select = page.getByTestId('punch-assignee');
    const seen: string[] = [];
    for (const side of ['crew', 'subcontractor'] as const) {
      await page.getByTestId(`punch-assignee-side-${side}`).click();
      seen.push(
        ...(await select.locator('option:not([value=""])').evaluateAll((els) =>
          els.map((e) => (e as HTMLOptionElement).value)
        ))
      );
    }
    expect(seen, 'a member who is not on this project was offered').not.toContain(off!.id);
  });
});
