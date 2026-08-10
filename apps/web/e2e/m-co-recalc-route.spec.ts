import { adminClient } from './hub-fixture';
import { test, expect, type Page } from '@playwright/test';
import { signInAs } from './sign-in-as';

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
/** The project the rest of the mobile suite drives — the PM reaches it. */
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
/** Well-formed and nonexistent — must 404, never 500. */
const ABSENT_CO = '11111111-1111-1111-1111-111111111111';


// signInAs now comes from `./sign-in-as` — RULING A [S131]. This file held one
// of FIVE byte-identical copies that each waited for `/dashboard`, which a
// subcontractor no longer reaches. The destination belongs in one place.

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

  test('200 — a PM recalculating a change order they AUTHORED', async ({ page }) => {
    // THE POINT OF THE WHOLE FIX. Before D-62 a PM could not recalculate a
    // cost-plus CO at all: the rates were unreadable and pricing refused with a
    // message naming a cause that was false. This is the assertion that the
    // role gate ADMITS a PM rather than merely that it refuses everyone else —
    // without it, a route that 403'd universally would pass every test above.
    // ⚠️ A PM-AUTHORED, NON-VOIDED CO, CREATED AND REMOVED BY THIS TEST [S121].
    //
    // This used the shared `SAFE_CO` constant, which the OWNER wrote. After the
    // #117 floor (20260830000000) `change_orders_select_visible` returns a CO to
    // Owner/Admin and its AUTHOR only, so the route's own read 404s for a PM on
    // someone else's CO — the floor working, not a regression.
    //
    // Pointing it at the PM's existing CO was not enough either: their only one
    // is `voided`, and recalc refuses a voided CO with 422. Measured rather than
    // assumed. So the fixture is made here, used, and deleted — which keeps the
    // criterion ("the gate ADMITS a PM") exercisable without depending on seed
    // data that was never chosen for it.
    const db = adminClient();
    const { data: pmProfile } = await db
      .from('profiles')
      .select('id, user_id')
      .eq('email', 'josh+pm@worthprop.com')
      .single();
    const { data: pmMember } = await db
      .from('company_members')
      .select('id, company_id')
      .eq('profile_id', pmProfile!.id)
      .single();

    const { data: made, error: makeErr } = await db
      .from('change_orders')
      .insert({
        company_id: pmMember!.company_id,
        project_id: PROJECT,
        co_number: `CO-E2E-${String(Date.now()).slice(-6)}`,
        // `change_orders_co_type_check` permits fixed_price | time_and_materials
        // | cost_plus. Matching SAFE_CO's shape (markup pricing) keeps the
        // fixture on the same recalc path the criterion is about.
        co_type: 'fixed_price',
        title: 'E2E recalc fixture',
        author_member_id: pmMember!.id,
        created_by: pmProfile!.user_id,
        net_delta: 0,
        pricing_mode: 'markup',
        status: 'draft',
      })
      .select('id')
      .single();
    expect(makeErr, `could not create the PM fixture CO: ${makeErr?.message}`).toBeNull();

    try {
      await signInAs(page, 'josh+pm@worthprop.com');
      expect(await recalc(page, made!.id as string)).toBe(200);
    } finally {
      await db.from('change_orders').delete().eq('id', made!.id);
    }
  });
});
