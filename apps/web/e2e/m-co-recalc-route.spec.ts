import { test, expect, type Page } from '@playwright/test';

// A-68d [S115, D-62] — /api/change-orders/[id]/recalculate refuses BEFORE the
// privilege.
//
// ---------------------------------------------------------------------------
// WHY THIS IS A BROWSER TEST AND NOT A [live] ONE
// ---------------------------------------------------------------------------
// The route's whole job is the three checks it makes before handing control to
// a SERVICE-ROLE function that bypasses RLS entirely — the record_client_payment
// trap the S97 isolation proof caught. Those checks read the caller's SESSION,
// so they can only be exercised by a real authenticated HTTP request. The live
// harness calls the privileged function directly and therefore cannot see them
// at all; it proves the pricing, this proves the gate.
//
// The pricing itself is test/s115-co-recalc-rates.live.ts. The two halves are
// deliberately separate: a route test that also asserted totals would be
// asserting arithmetic through an HTTP layer that has nothing to do with it.
//
// ---------------------------------------------------------------------------
// THE FIXTURE IS CHOSEN TO BE HARMLESS
// ---------------------------------------------------------------------------
// CO-105-01 is cost_plus with ZERO line rows and net_delta 0. Recalculating it
// is a genuine success path — the usage-based guard finds no row type in use,
// so it prices to 0 and persists 0, which is what it already holds. The test
// therefore exercises the real route end to end WITHOUT mutating a fixture any
// other assertion depends on.

/** CO-105-01 — cost_plus, no rows, net_delta 0. Project a0a85240, PM assigned. */
const SAFE_CO = 'b5570a37-15c2-4e2c-8ee6-4445727f9beb';
/** Well-formed and nonexistent — must 404, never 500. */
const ABSENT_CO = '11111111-1111-1111-1111-111111111111';

const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/** POST through the PAGE, so the session cookies travel exactly as they would. */
async function recalc(page: Page, coId: string): Promise<number> {
  return page.evaluate(async (id) => {
    const r = await fetch(`/api/change-orders/${id}/recalculate`, { method: 'POST' });
    return r.status;
  }, coId);
}

test.describe('A-68d · the recalculate route refuses before the privilege', () => {
  test('401 — unauthenticated', async ({ page }) => {
    // Land on a real origin first so fetch has one, then drop the session.
    await page.goto('/sign-in');
    await page.context().clearCookies();
    expect(await recalc(page, SAFE_CO)).toBe(401);
  });

  test('403 — a crew member is refused by ROLE, not by a 404', async ({ page }) => {
    // The distinction CLAUDE.md requires: a permission failure must say so and
    // must never fall through to "not found". A build that 404'd here would
    // look identical to a working one from the client's side.
    await signInAs(page, 'josh+crew@worthprop.com');
    expect(await recalc(page, SAFE_CO)).toBe(403);
  });

  test('403 — a subcontractor is refused too', async ({ page }) => {
    // Asserted separately from crew so a role array that names one and not the
    // other fails visibly — the same reason A-45b2 is separate from A-45b.
    await signInAs(page, 'josh+qa-sub@worthprop.com');
    expect(await recalc(page, SAFE_CO)).toBe(403);
  });

  test('404 — a PM asking for a change order that does not exist', async ({ page }) => {
    // Reached only AFTER auth and role pass, which is what makes 404 mean what
    // CLAUDE.md says it means: the caller was allowed, the record was not there.
    await signInAs(page, 'josh+pm@worthprop.com');
    expect(await recalc(page, ABSENT_CO)).toBe(404);
  });

  test('200 — a PM recalculating a change order they can reach', async ({ page }) => {
    // THE POINT OF THE WHOLE FIX. Before D-62 a PM could not recalculate a
    // cost-plus CO at all: the rates were unreadable and pricing refused with a
    // message naming a cause that was false. This is the assertion that the
    // role gate ADMITS a PM rather than merely that it refuses everyone else —
    // without it, a route that 403'd universally would pass every test above.
    await signInAs(page, 'josh+pm@worthprop.com');
    expect(await recalc(page, SAFE_CO)).toBe(200);
  });
});
