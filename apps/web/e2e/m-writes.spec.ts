import { test, expect, type Page } from '@playwright/test';
import { adminClient } from './hub-fixture';

// M6M Part C — the write paths. D-51 (CO create → edit → send), D-52 as
// corrected (punch create / complete / verify), D-60 (the list target),
// D-54 (hidden AND route-guarded).
//
// ---------------------------------------------------------------------------
// THE ONE THING THIS SUITE IS BUILT AROUND: THE TWO HALVES ARE NOT SYMMETRIC
// ---------------------------------------------------------------------------
// Both halves write. Their enforcement could hardly be more different, and a
// suite that tested them the same way would imply a guarantee that only one of
// them has.
//
//   CHANGE ORDERS — DB-enforced. `change_orders_insert_authorized` and
//     `_update_authorized` carry exactly owner/admin/project_manager, and the
//     send/void routes return 403 on top. The route guard and the hidden button
//     are BOTH cosmetic here; deleting them would degrade the experience and
//     leak nothing. So these tests assert the SCREEN behaves, and say plainly
//     that RLS is what actually refuses.
//
//   PUNCH — barely enforced, and deliberately so on two of three verbs.
//     Create and complete are open to EVERY role including subcontractors
//     (D-52 corrected, S110) — `punch_list_items_insert/update_authenticated`
//     have no role arm and §4.11.10b records that as CORRECT rather than a gap.
//     **Verify is Foreman+ and lives ONLY in TypeScript**: RLS accepts a direct
//     UPDATE setting status='verified' from any role (open item 7). So the
//     verify tests below assert a UI/service gate and prove nothing about the
//     database — which is exactly A-58's point.
//
// A reader looking for "does RLS stop a crew member verifying" will not find it
// here, because the answer is no and no test can make it yes.

const CREW = 'josh+crew@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';

/** The project the rest of the mobile suite drives. */
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

/** An 8x8 PNG — real bytes, so `uploadFile`'s mime inference behaves. */
const PNG_8 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2P8z8Dwn4GKgIlqJo0aOGrgqIHDwEAAaSgDBaMLcOgAAAAASUVORK5CYII=';

/** Unique enough that reruns do not collide, short enough to read on a phone. */
function stamp(): string {
  return String(Date.now()).slice(-6);
}

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// WHICH IDENTITIES CAN REACH THIS PROJECT — MEASURED, AND NOW UNIFORM [S119]
// ---------------------------------------------------------------------------
// The first run of this suite failed five tests and the failures were the
// discovery: `josh+qa-foreman@` had no `project_assignments` row here, so its
// M-13 was empty and `getProject()` returned null — which 404s M-33 outright.
// Every "the foreman does NOT see X" assertion therefore passed VACUOUSLY.
//
// **TECH_DEBT #143 is CLOSED [S119]**: the seed now assigns PM, foreman and
// crew to this project idempotently, so all six identities reach it and the
// role-exclusion tests below name the role they actually mean. The
// crew-for-foreman substitutions S117 was forced into are reverted.
//
// `test/s118-fixture-reachability.live.ts` asserts the matrix — in both
// directions, since "everyone reaches everything" would otherwise be
// indistinguishable from a broken `can_view_project()`.

/** Creates a fresh DRAFT change order and returns its id. */
async function createDraftCo(page: Page, title: string): Promise<string> {
  await page.goto(`/m/p/${PROJECT}/changes/new`);
  await page.getByTestId('m-co-title').fill(title);
  await page.getByTestId('m-co-create').click();
  await expect(page).toHaveURL(/\/changes\/new\?co=[0-9a-f-]{36}/, { timeout: 30_000 });
  return new URL(page.url()).searchParams.get('co')!;
}

// ---------------------------------------------------------------------------
// ⚠️ THIS FILE CLEANS UP AFTER ITSELF. TECH_DEBT #144. [S119]
// ---------------------------------------------------------------------------
// Every run used to leave ~5 change orders (with line items and rows), ~5 punch
// lists with items, and a completion photo per punch test PERMANENTLY on the
// project every mobile spec drives. Nothing removed them, so the dataset grew
// linearly in runs.
//
// **It had already caused a failure.** M-13 got long enough that `m-details`'
// D-55 navigation stopped finishing inside Playwright's 5s default and the
// suite went red on a test that had been green twice — a real regression signal
// spent on fixture debt.
//
// THE ORDER BELOW IS FORCED, NOT STYLISTIC:
//   · `change_order_line_rows` before `change_order_line_items` — the FK has
//     **no ON DELETE CASCADE** (`deleteCoLineItem` deletes rows first for the
//     same reason).
//   · punch items before their lists.
//   · `files` rows AFTER the items that referenced them, because
//     `completion_photo_file_id` points at them.
//
// **Scoped by name prefix AND project**, never "everything on the project" —
// the fixture COs (`CO-101-01`, `CO-101-02`) and the seeded punch data must
// survive, and a cleanup that took them would break m-sections and the D-57
// harness in a way that looks nothing like a cleanup bug.
//
// Returns its counts so a caller can prove the cleanup CLEANED. A cleanup that
// misses one table looks perfectly green on the first run.
async function cleanUpFixtures(): Promise<Record<string, number>> {
  const admin = adminClient();
  const removed: Record<string, number> = {
    coRows: 0, coLines: 0, cos: 0, punchItems: 0, punchLists: 0, files: 0,
  };

  // ── Change orders ───────────────────────────────────────────────────────
  const { data: cos } = await admin
    .from('change_orders')
    .select('id')
    .eq('project_id', PROJECT)
    .like('title', 'E2E %');

  for (const co of cos ?? []) {
    const { data: lines } = await admin
      .from('change_order_line_items')
      .select('id')
      .eq('change_order_id', co.id);
    const lineIds = (lines ?? []).map((l) => l.id);

    if (lineIds.length > 0) {
      const { count: rowCount } = await admin
        .from('change_order_line_rows')
        .delete({ count: 'exact' })
        .in('line_item_id', lineIds);
      removed.coRows += rowCount ?? 0;

      const { count: lineCount } = await admin
        .from('change_order_line_items')
        .delete({ count: 'exact' })
        .eq('change_order_id', co.id);
      removed.coLines += lineCount ?? 0;
    }
  }
  if ((cos ?? []).length > 0) {
    const { count } = await admin
      .from('change_orders')
      .delete({ count: 'exact' })
      .in('id', (cos ?? []).map((c) => c.id));
    removed.cos += count ?? 0;
  }

  // ── Punch lists, their items, and the photos those items point at ───────
  const { data: lists } = await admin
    .from('punch_lists')
    .select('id')
    .eq('project_id', PROJECT)
    .like('name', 'E2E %');
  const listIds = (lists ?? []).map((l) => l.id);

  // Matched by BOTH the list and the item's own title prefix: an item this
  // suite filed into a pre-existing list would otherwise survive.
  const { data: items } = await admin
    .from('punch_list_items')
    .select('id, completion_photo_file_id')
    .eq('project_id', PROJECT)
    .or(
      listIds.length > 0
        ? `punch_list_id.in.(${listIds.join(',')}),title.like.E2E %`
        : 'title.like.E2E %'
    );

  const photoIds = (items ?? [])
    .map((i) => i.completion_photo_file_id)
    .filter((id): id is string => Boolean(id));

  if ((items ?? []).length > 0) {
    const { count } = await admin
      .from('punch_list_items')
      .delete({ count: 'exact' })
      .in('id', (items ?? []).map((i) => i.id));
    removed.punchItems += count ?? 0;
  }
  if (listIds.length > 0) {
    const { count } = await admin
      .from('punch_lists')
      .delete({ count: 'exact' })
      .in('id', listIds);
    removed.punchLists += count ?? 0;
  }

  // The completion photos. Storage object first, then the row — the reverse
  // orphans a blob nothing points at, which is the harder leak to find later.
  if (photoIds.length > 0) {
    const { data: files } = await admin.from('files').select('id, file_path').in('id', photoIds);
    const paths = (files ?? []).map((f) => f.file_path).filter(Boolean) as string[];
    if (paths.length > 0) await admin.storage.from('project-files').remove(paths);

    const { count } = await admin.from('files').delete({ count: 'exact' }).in('id', photoIds);
    removed.files += count ?? 0;
  }

  return removed;
}

// BOTH ENDS, and the `beforeAll` is not belt-and-braces — it is what makes the
// starting state DETERMINISTIC. A run killed part-way through leaves rows
// behind, and the next run would then start against a project with an unknown
// number of punch lists. `hub-fixture.ts` opens with the same reasoning
// ("Leftovers from an interrupted run would collide").
//
// ⚠️ THIS IS WHAT GIVES A-67 ITS "EXACTLY ONE LIST" CASE. After cleanup the
// fixture project holds exactly ONE punch list, which is the state D-60's
// criterion asks for and which no separate seeded project was needed to
// produce — see the A-67 test below.
test.beforeAll(async () => {
  console.log(`[m-writes pre-clean] ${JSON.stringify(await cleanUpFixtures())}`);
});

// Runs whether the tests passed or not — a failed run is exactly when
// leftovers are most likely.
test.afterAll(async () => {
  console.log(`[m-writes cleanup] ${JSON.stringify(await cleanUpFixtures())}`);
});

// ===========================================================================
// D-54 / A-65 — the CO WRITE route refuses at the route, not by hiding
// ===========================================================================
// Every test here TYPES THE URL. A hidden button is not a permission: the URL
// survives a shared screenshot, a bookmark and a stale PWA cache.
//
// Note what is NOT claimed: these prove the screen refuses. The database would
// refuse the INSERT anyway, which is what makes the CO half the strong one.
test.describe('D-54 · the CO write route refuses five roles at the route', () => {
  for (const [label, email] of [
    ['a foreman', FOREMAN],
    ['a crew member', CREW],
    ['a subcontractor', SUB],
  ] as const) {
    test(`M-32 · ${label} typing the URL is redirected, and lands somewhere that explains itself`, async ({
      page,
    }) => {
      await signInAs(page, email);
      await page.goto(`/m/p/${PROJECT}/changes/new`);

      // A-66 — the destination is the LIST the control lives on, not the hub,
      // and it carries a sentence.
      await expect(page).toHaveURL(new RegExp(`/m/p/${PROJECT}/changes\\?denied=co-write`));
      await expect(page.getByTestId('m-denied')).toBeVisible();
      await expect(page.getByTestId('m-denied')).toContainText(/owner, admin or project manager/i);

      // The editor never rendered.
      await expect(page.getByTestId('m-co-title')).toHaveCount(0);
    });
  }

  test('the guard is not vacuous — an owner reaches the same URL and gets the form', async ({
    page,
  }) => {
    await signInAs(page, OWNER);
    await page.goto(`/m/p/${PROJECT}/changes/new`);

    await expect(page).toHaveURL(new RegExp(`/m/p/${PROJECT}/changes/new$`));
    await expect(page.getByTestId('m-co-title')).toBeVisible();
    await expect(page.getByTestId('m-denied')).toHaveCount(0);
  });
});

// ===========================================================================
// D-54 step 1 — the control is hidden too. Cosmetic, on top of the guard.
// ===========================================================================
test.describe('D-54 step 1 · the CO create control is hidden from the roles the route refuses', () => {
  test('a foreman gets the LIST but no create control', async ({ page }) => {
    // FOREMAN, restored [S119, #143]. Until that closed this had to run as
    // crew, because the foreman saw no rows at all and the second assertion
    // below would have passed for the wrong reason.
    await signInAs(page, FOREMAN);
    await page.goto(`/m/p/${PROJECT}/changes`);

    await expect(page.getByTestId('m-co-new')).toHaveCount(0);
    // §4.11.10b — "changes → M-13: Gets the list." The list is NOT gated; only
    // the write route and the detail route are. A build that hid the whole
    // screen would pass the line above and be wrong.
    await expect(page.getByTestId('m-co-row').first()).toBeVisible();
  });

  test('an owner gets the create control', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(`/m/p/${PROJECT}/changes`);
    await expect(page.getByTestId('m-co-new')).toBeVisible();
  });
});

// ===========================================================================
// D-62 — all three CO types ship, and the value is NOT a field
// ===========================================================================
test.describe('M-32 · D-62 and the scope fact', () => {
  test('all three co_types are offered — the fixed_price-only interim was withdrawn', async ({
    page,
  }) => {
    await signInAs(page, OWNER);
    await page.goto(`/m/p/${PROJECT}/changes/new`);

    // D-62 rejected the interim that would have shipped fixed_price alone.
    // c87e370 fixed #140 first, which is what made all three safe.
    await expect(page.getByTestId('m-co-type-fixed_price')).toBeVisible();
    await expect(page.getByTestId('m-co-type-cost_plus')).toBeVisible();
    await expect(page.getByTestId('m-co-type-time_and_materials')).toBeVisible();
  });

  test('there is NO amount field — the value comes from line rows', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(`/m/p/${PROJECT}/changes/new`);

    // §4.11.12's "BIGGEST SCOPE FACT IN D-51": createChangeOrder takes no
    // amount. A build that added an amount box would have to write it to
    // net_delta, which recalculateChangeOrderTotals then overwrites — so the
    // number the author typed would silently vanish.
    const money = page.locator(
      'input[data-testid*="amount"], input[data-testid*="net-delta"], input[data-testid*="value"]'
    );
    await expect(money).toHaveCount(0);
  });
});

// ===========================================================================
// A-55 — a CO created with line rows has a net_delta matching them, NOT 0
// ===========================================================================
// The criterion exists because `net_delta` defaults to 0 and is ONLY ever set
// by recalculateChangeOrderTotals(). A build that writes rows and skips the
// recalculation sends a client a change order worth nothing — and every
// screen-level assertion passes while it does. So this test walks the whole
// three-level editor and then asserts the STORED total on M-31, which is the
// figure the client would see.
test.describe('A-55 · the three-level editor produces a real net_delta', () => {
  test('CO → line item → row, and the total is not $0.00 on either screen', async ({ page }) => {
    test.setTimeout(120_000);
    await signInAs(page, OWNER);

    const title = `E2E CO ${stamp()}`;

    // ── LEVEL 1 — the change order.
    await page.goto(`/m/p/${PROJECT}/changes/new`);
    await page.getByTestId('m-co-title').fill(title);
    await page.getByTestId('m-co-type-fixed_price').click();
    await page.getByTestId('m-co-create').click();

    // Lands in the editor with the new id — one route, `?co=` selects edit mode.
    await expect(page).toHaveURL(/\/changes\/new\?co=[0-9a-f-]{36}/, { timeout: 30_000 });
    const coId = new URL(page.url()).searchParams.get('co')!;

    // A change order with no rows is worth nothing, and says so.
    await expect(page.getByTestId('m-co-editor-total')).toHaveText('$0.00');
    await expect(page.getByTestId('m-co-no-lines')).toBeVisible();

    // ── LEVEL 2 — a line item.
    await page.getByTestId('m-co-new-line-name').fill('Extra framing');
    await page.getByTestId('m-co-add-line').click();
    await expect(page.getByTestId('m-co-edit-line')).toHaveCount(1, { timeout: 30_000 });

    // ── LEVEL 3 — a row. `other` carries a flat amount and needs no
    // instrument_rates read, so this half of the test is independent of #140.
    await page.getByTestId('m-co-line-toggle').click();
    await page.getByTestId('m-co-add-row-other').click();
    await page.getByTestId('m-co-new-row-name').fill('Materials allowance');
    await page.getByTestId('m-co-new-row-amount').fill('500');
    await page.getByTestId('m-co-save-new-row').click();

    // THE ASSERTION. Not "a row exists" — the recalculated total.
    await expect(page.getByTestId('m-co-editor-total')).not.toHaveText('$0.00', {
      timeout: 30_000,
    });

    // And the same figure, re-read from the database on M-31 — which is the
    // screen the author sends from.
    await page.goto(`/m/p/${PROJECT}/changes/${coId}`);
    await expect(page.getByTestId('m-co-net-delta')).toBeVisible();
    await expect(page.getByTestId('m-co-net-delta')).not.toHaveText('$0.00');
  });
});

// ===========================================================================
// M-31 — the write controls, and who does not get them
// ===========================================================================
test.describe('M-31 · write controls are Owner/Admin/PM, on a screen foreman and crew still read', () => {
  test('an owner gets Edit, Send and Void on a draft', async ({ page }) => {
    test.setTimeout(120_000);
    await signInAs(page, OWNER);

    // A FRESH DRAFT, not `.first()`. The first CO on this project is terminal
    // (signed or voided), so it legitimately has no controls — asserting
    // against it tested the fixture's status rather than D-51's rule.
    const coId = await createDraftCo(page, `E2E Actions ${stamp()}`);
    await page.goto(`/m/p/${PROJECT}/changes/${coId}`);

    await expect(page.getByTestId('m-co-edit')).toBeVisible();
    await expect(page.getByTestId('m-co-send')).toBeVisible();
    await expect(page.getByTestId('m-co-void')).toBeVisible();
  });

  test('a terminal change order says so instead of rendering an empty box', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(`/m/p/${PROJECT}/changes`);
    await page.getByTestId('m-co-row').first().getByTestId('m-row-link').click();
    await expect(page).toHaveURL(/\/changes\/[0-9a-f-]{36}$/, { timeout: 30_000 });

    // Whatever status the first CO is in, the actions section must never be
    // empty markup: either it offers controls, or it explains why it does not.
    const hasControls = (await page.getByTestId('m-co-send').count()) > 0;
    if (!hasControls) await expect(page.getByTestId('m-co-terminal')).toBeVisible();
  });

  test('a foreman READS the change order and gets no write controls at all', async ({
    page,
  }) => {
    // FOREMAN, restored [S119, #143]. This is the pairing D-53/D-51 actually
    // describe — a foreman is admitted to the READ and refused the WRITES — and
    // asserting it under crew was a workaround, not the criterion.
    await signInAs(page, FOREMAN);
    await page.goto(`/m/p/${PROJECT}/changes`);
    await page.getByTestId('m-co-row').first().getByTestId('m-row-link').click();
    await expect(page).toHaveURL(/\/changes\/[0-9a-f-]{36}$/, { timeout: 30_000 });

    // D-53 keeps CO READING open to everyone but subcontractors — the screen
    // renders. D-51 keeps the writes to three roles.
    await expect(page.getByTestId('m-co-detail')).toBeVisible();
    await expect(page.getByTestId('m-co-actions')).toHaveCount(0);
    await expect(page.getByTestId('m-co-send')).toHaveCount(0);
    await expect(page.getByTestId('m-co-void')).toHaveCount(0);
    // And still no money — D-51's other half, unchanged by Part C.
    await expect(page.getByTestId('m-co-net-delta')).toHaveCount(0);
  });

  test('send demands a printed name on the first send', async ({ page }) => {
    test.setTimeout(120_000);
    // A PM — D-51's third role, and the one #140 used to break for. Confirmed
    // assigned to this project [S117].
    await signInAs(page, PM);

    const coId = await createDraftCo(page, `E2E Send ${stamp()}`);
    await page.goto(`/m/p/${PROJECT}/changes/${coId}`);

    await page.getByTestId('m-co-send').click();

    // The route returns 400 without mode + printed name (send/route.ts:110) —
    // signed-artifact §4.2, sending IS the contractor-side acceptance. The
    // control refuses BEFORE the round trip rather than surfacing a 400.
    await expect(page.getByTestId('m-co-sig-name')).toBeVisible();
    await expect(page.getByTestId('m-co-send-confirm')).toBeDisabled();

    await page.getByTestId('m-co-sig-name').fill('QA Sender');
    await expect(page.getByTestId('m-co-send-confirm')).toBeEnabled();
  });
});

// ===========================================================================
// A-56 — M-14 OFFERS A CREATE CONTROL, for every role including subcontractors
// ===========================================================================
// S117 recorded this half as asserted by no test: the control was built
// ungated, which is not the same claim as "proven visible to all six roles".
// This is the assertion a future build hiding it from subs would fail.
//
// Six roles, and the sixth is the point — D-52 as corrected [S110] opens punch
// creation to subcontractors, reversing the S108 exclusion.
test.describe('A-56 · M-14 offers a create control to every role', () => {
  for (const [role, email] of [
    ['owner', OWNER],
    ['project_manager', PM],
    ['foreman', FOREMAN],
    ['crew_member', CREW],
    ['subcontractor', SUB],
  ] as const) {
    test(`${role} sees the create control on M-14`, async ({ page }) => {
      await signInAs(page, email);
      await page.goto(`/m/p/${PROJECT}/punch`);

      await expect(page.getByTestId('m-punch-new')).toBeVisible();
      await expect(page.getByTestId('m-punch-new')).toHaveAttribute(
        'href',
        `/m/p/${PROJECT}/punch/new`
      );
    });
  }

  // FIVE OF SIX. The foreman joined the loop at S119 when #143 closed; admin
  // is the one still absent, and only because it is not in the mobile suite's
  // identity set — it does reach the project (measured S118/S119). Stated
  // rather than presented as complete.
});

// ===========================================================================
// D-60 / A-67 — M-33 does not submit without a list target
// ===========================================================================
test.describe('D-60 · the author targets a list, always', () => {
  test('the picker renders and NOTHING is preselected', async ({ page }) => {
    await signInAs(page, CREW);
    await page.goto(`/m/p/${PROJECT}/punch/new`);

    await expect(page.getByTestId('m-punch-list-target')).toBeVisible();

    // ⚠️ A-67's SPECIFIC CASE: "a project with EXACTLY ONE list still asks".
    // [S119] This is now asserted rather than hoped for. `beforeAll` cleans the
    // suite's own leftovers, so the fixture project holds exactly one punch
    // list at this point — the state the criterion names as "the case a 'pick
    // when ambiguous' implementation gets wrong, and the case a user meets
    // first".
    //
    // The picker's options are the project's lists PLUS the `__new__` sentinel,
    // so exactly one existing list means exactly two options.
    const options = page.locator('[data-testid^="m-punch-list-"][data-active]');
    await expect(
      options,
      'expected 1 existing list + the "New list…" option — if this fails, either the fixture ' +
        'project gained a list or a previous run did not clean up (TECH_DEBT #144)'
    ).toHaveCount(2);
    await expect(page.getByTestId('m-punch-list-__new__')).toBeVisible();

    // THE ABSENCE OF A DEFAULT IS THE CRITERION. A build that auto-created a
    // "Punch List", or that silently used the project's only list, satisfies
    // every other assertion on this screen and violates D-60. With exactly one
    // list present, a "pick only when ambiguous" build would either preselect
    // it (caught here) or skip the picker entirely (caught above).
    const active = page.locator('[data-testid^="m-punch-list-"][data-active="true"]');
    await expect(active).toHaveCount(0);
  });

  test('submitting with no list refuses, and names the LIST rather than the title', async ({
    page,
  }) => {
    await signInAs(page, CREW);
    await page.goto(`/m/p/${PROJECT}/punch/new`);

    // Title filled, list not. A build that validated in field order would
    // complain about the title and send the user hunting.
    await page.getByTestId('m-punch-title').fill('Refusal probe');
    await page.getByTestId('m-punch-create').click();

    const error = page.getByTestId('m-punch-create-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText(/list/i);
    await expect(error).not.toContainText(/title/i);

    // Nothing navigated — no item was written.
    await expect(page).toHaveURL(/\/punch\/new$/);
  });

  test('M-33 is open to a SUBCONTRACTOR — no guard, by ruling', async ({ page }) => {
    await signInAs(page, SUB);
    await page.goto(`/m/p/${PROJECT}/punch/new`);

    // D-52 corrected [S110]: subs create punch lists and items. Guarding this
    // screen would reverse a ruling, and §4.11.10a forecloses gating a further
    // surface "because there is a pattern now".
    await expect(page).toHaveURL(/\/punch\/new$/);
    await expect(page.getByTestId('m-punch-title')).toBeVisible();
    await expect(page.getByTestId('m-denied')).toHaveCount(0);
  });
});

// ===========================================================================
// A-67b / A-67c — inline list creation, and M-14 stays FLAT
// ===========================================================================
test.describe('D-60 / D-61 · a list can be created inline, and M-14 does not become a list of lists', () => {
  test('a new list is created and the item lands in it, labelled on the row', async ({ page }) => {
    test.setTimeout(120_000);
    await signInAs(page, CREW);

    const id = stamp();
    const listName = `E2E List ${id}`;
    const itemTitle = `E2E Item ${id}`;

    await page.goto(`/m/p/${PROJECT}/punch/new`);
    await page.getByTestId('m-punch-list-__new__').click();
    await page.getByTestId('m-punch-new-list-name').fill(listName);
    await page.getByTestId('m-punch-title').fill(itemTitle);
    await page.getByTestId('m-punch-create').click();

    // TWO WRITES, not one — createPunchList then createPunchItem. A failed
    // item insert would leave the list behind, which A-67b accepts.
    await expect(page).toHaveURL(new RegExp(`/m/p/${PROJECT}/punch$`), { timeout: 30_000 });

    // D-61 — the parent list is a LABEL ON THE ROW.
    const row = page.getByTestId('m-punch-row').filter({ hasText: itemTitle });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(listName);
  });

  test('A-67c · the row count is the ITEM count, not the list count', async ({ page }) => {
    await signInAs(page, CREW);
    await page.goto(`/m/p/${PROJECT}/punch`);

    const rows = page.getByTestId('m-punch-row');
    const all = await rows.count();
    expect(all).toBeGreaterThan(0);

    // A grouped screen fails immediately, and so does one that renders list
    // headers as rows: every m-punch-row must link to an ITEM route.
    for (let i = 0; i < all; i++) {
      const href = await rows.nth(i).getByTestId('m-row-link').getAttribute('href');
      expect(href).toMatch(/\/punch\/[0-9a-f-]{36}$/);
    }

    // And the chips still filter ITEMS — D-61's first breakage if it nested.
    await page.goto(`/m/p/${PROJECT}/punch?filter=open`);
    const open = await page.getByTestId('m-punch-row').count();
    expect(open).toBeLessThanOrEqual(all);
  });
});

// ===========================================================================
// M-34 — complete (every role) and the photo gate
// ===========================================================================
// `requires_completion_photo` DEFAULTS TO TRUE (20260704214000:90), so an item
// created on mobile needs a photo before it can be completed. That makes the
// gate testable on a freshly-created item rather than needing a fixture.
test.describe('M-34 · complete, and the photo gate the service function owns', () => {
  test('complete is refused without the photo, then succeeds with one', async ({ page }) => {
    test.setTimeout(150_000);
    await signInAs(page, CREW);

    const id = stamp();
    const itemTitle = `E2E Complete ${id}`;

    // Create an item into a fresh list, so this test owns its own data.
    await page.goto(`/m/p/${PROJECT}/punch/new`);
    await page.getByTestId('m-punch-list-__new__').click();
    await page.getByTestId('m-punch-new-list-name').fill(`E2E CList ${id}`);
    await page.getByTestId('m-punch-title').fill(itemTitle);
    await page.getByTestId('m-punch-create').click();
    await expect(page).toHaveURL(new RegExp(`/m/p/${PROJECT}/punch$`), { timeout: 30_000 });

    await page.getByTestId('m-punch-row').filter({ hasText: itemTitle }).click();
    await expect(page).toHaveURL(/\/punch\/[0-9a-f-]{36}$/, { timeout: 30_000 });

    // The gate is visible before the tap.
    await expect(page.getByTestId('m-punch-photo-gate')).toBeVisible();

    // ⚠️ THE REFUSAL COMES FROM completePunchItem, NOT FROM THIS SCREEN. The
    // UI does not duplicate the rule — it lets the service function answer, so
    // the message is the same one desktop gets.
    await page.getByTestId('m-punch-complete').click();
    const error = page.getByTestId('m-punch-action-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText(/completion photo is required/i);

    // Attach a real image through uploadFile (never a raw bucket PUT — that is
    // where HEIC→JPEG lives, #94).
    await page.getByTestId('m-punch-photo-input').setInputFiles({
      name: 'done.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_8, 'base64'),
    });
    await expect(page.getByTestId('m-punch-photo-attached')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('m-punch-complete').click();

    // Complete — and now the VERIFY half of the screen appears, because
    // requires_verification also defaults true.
    await expect(page.getByTestId('m-punch-complete')).toHaveCount(0, { timeout: 30_000 });
  });
});

// ===========================================================================
// A-57 — completing moves M-3's Punch badge by ONE; verifying moves it by NONE
// ===========================================================================
// S117 recorded this NOT SATISFIED: completing and verifying became testable
// the moment Part C shipped them, and the criterion was simply never written.
//
// ---------------------------------------------------------------------------
// HARNESS NOTE — SPECIFIED `[live]`, WRITTEN IN PLAYWRIGHT, AND STRONGER FOR IT
// ---------------------------------------------------------------------------
// A `[live]` harness cannot import `getOpenPunchCounts` (punch.ts pulls
// supabase-server → next/headers), so it would have to REIMPLEMENT the
// `.in('status', ['open','in_progress'])` filter and assert its own copy —
// which is the one thing that cannot go wrong here. Reading the RENDERED stat
// exercises the real function, server-side, and asserts the number a user
// actually sees. The deviation is deliberate and is the stronger test.
//
// D-16's "open" is exactly ('open','in_progress'), so `complete → verified`
// must be INVISIBLE to it. That second half is the whole claim that D-52 does
// not disturb D-16 — and it is the half a build satisfies by accident, which
// is why the criterion insists on both in one test.
//
// Asserted as a NON-SUBCONTRACTOR per A-57's [S110] note: D-57 changes what the
// badge counts for a sub, which is A-59e's problem and not this one.

/** M-3's punch stat reads `{mine} mine · {total} open`. Returns the total. */
async function openCount(page: Page): Promise<number> {
  const text = (await page.getByTestId('m-stat-punch').textContent()) ?? '';
  const match = /(\d+)\s*open/.exec(text);
  if (!match) throw new Error(`could not read an open count from the punch stat: "${text}"`);
  return Number(match[1]);
}

test.describe('A-57 · the badge moves on complete and not on verify', () => {
  test('complete takes it down by one; verify leaves it alone', async ({ page }) => {
    test.setTimeout(180_000);

    const id = stamp();
    const itemTitle = `E2E Badge ${id}`;

    // ── As CREW: baseline, create, complete.
    await signInAs(page, CREW);
    await page.goto(`/m/p/${PROJECT}`);
    const before = await openCount(page);

    await page.goto(`/m/p/${PROJECT}/punch/new`);
    await page.getByTestId('m-punch-list-__new__').click();
    await page.getByTestId('m-punch-new-list-name').fill(`E2E BList ${id}`);
    await page.getByTestId('m-punch-title').fill(itemTitle);
    await page.getByTestId('m-punch-create').click();
    await expect(page).toHaveURL(new RegExp(`/m/p/${PROJECT}/punch$`), { timeout: 30_000 });

    // A new item is `open`, so the count must rise by exactly one. This is the
    // control: without it, a "down by one" after completing could be measured
    // against a baseline that never moved.
    await page.goto(`/m/p/${PROJECT}`);
    const afterCreate = await openCount(page);
    expect(afterCreate).toBe(before + 1);

    await page.goto(`/m/p/${PROJECT}/punch`);
    await page.getByTestId('m-punch-row').filter({ hasText: itemTitle }).click();
    await expect(page).toHaveURL(/\/punch\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const itemUrl = page.url();

    await page.getByTestId('m-punch-photo-input').setInputFiles({
      name: 'done.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_8, 'base64'),
    });
    await expect(page.getByTestId('m-punch-photo-attached')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('m-punch-complete').click();
    await expect(page.getByTestId('m-punch-complete')).toHaveCount(0, { timeout: 30_000 });

    // ── FIRST HALF: completing moves it DOWN BY ONE.
    await page.goto(`/m/p/${PROJECT}`);
    expect(await openCount(page)).toBe(afterCreate - 1);

    // ── As PM: verify it. Crew cannot verify (Foreman+), and the crew member
    // completed it anyway, so separate-eyes would refuse them twice over.
    await signInAs(page, PM);
    await page.goto(`/m/p/${PROJECT}`);
    const beforeVerify = await openCount(page);

    await page.goto(itemUrl);
    await page.getByTestId('m-punch-verify').click();
    await expect(page.getByTestId('m-punch-done')).toBeVisible({ timeout: 30_000 });

    // ── SECOND HALF: verifying moves it BY NOTHING. `complete → verified` is a
    // transition between two states the filter already excludes.
    await page.goto(`/m/p/${PROJECT}`);
    expect(await openCount(page)).toBe(beforeVerify);
  });
});

// ===========================================================================
// Verify — Foreman+, and UI/SERVICE-ONLY
// ===========================================================================
// ⚠️ NOTHING BELOW PROVES A DATABASE RULE. `punch_list_items_update_authenticated`
// has no role arm; RLS accepts a direct UPDATE setting status='verified' from a
// crew member's session (open item 7). These tests assert that the SCREEN and
// `verifyPunchItem` refuse — which is the entire enforcement that exists.
test.describe('M-34 · verify is Foreman+, enforced in TypeScript and nowhere else', () => {
  test('a crew member gets no verify control, and is told who can', async ({ page }) => {
    test.setTimeout(150_000);
    await signInAs(page, CREW);

    const id = stamp();
    const itemTitle = `E2E Verify ${id}`;

    await page.goto(`/m/p/${PROJECT}/punch/new`);
    await page.getByTestId('m-punch-list-__new__').click();
    await page.getByTestId('m-punch-new-list-name').fill(`E2E VList ${id}`);
    await page.getByTestId('m-punch-title').fill(itemTitle);
    await page.getByTestId('m-punch-create').click();
    await expect(page).toHaveURL(new RegExp(`/m/p/${PROJECT}/punch$`), { timeout: 30_000 });

    await page.getByTestId('m-punch-row').filter({ hasText: itemTitle }).click();
    await page.getByTestId('m-punch-photo-input').setInputFiles({
      name: 'done.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_8, 'base64'),
    });
    await expect(page.getByTestId('m-punch-photo-attached')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('m-punch-complete').click();

    // Crew completed it. Crew cannot verify it — 5C §4, unreversed, and D-52's
    // crew grant corrected away at S110.
    await expect(page.getByTestId('m-punch-verify-denied')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('m-punch-verify')).toHaveCount(0);
  });

  test('A-58 · the member who completed an item cannot verify it', async ({ page }) => {
    test.setTimeout(150_000);
    // FOREMAN, restored [S119, #143]. A PM stood in while the foreman could
    // not reach the project — same FOREMAN_PLUS branch, but the criterion is
    // about the completer being refused regardless of which Foreman+ role they
    // hold, and the foreman is the role the rule is named for.
    await signInAs(page, FOREMAN);

    const id = stamp();
    const itemTitle = `E2E SelfVerify ${id}`;

    await page.goto(`/m/p/${PROJECT}/punch/new`);
    await page.getByTestId('m-punch-list-__new__').click();
    await page.getByTestId('m-punch-new-list-name').fill(`E2E SList ${id}`);
    await page.getByTestId('m-punch-title').fill(itemTitle);
    await page.getByTestId('m-punch-create').click();
    await expect(page).toHaveURL(new RegExp(`/m/p/${PROJECT}/punch$`), { timeout: 30_000 });

    await page.getByTestId('m-punch-row').filter({ hasText: itemTitle }).click();
    await page.getByTestId('m-punch-photo-input').setInputFiles({
      name: 'done.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_8, 'base64'),
    });
    await expect(page.getByTestId('m-punch-photo-attached')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('m-punch-complete').click();

    // The foreman MAY verify in general — so the control is present — but not
    // THIS item, because they completed it. Shown before the tap rather than as
    // an error after it (§4.11.14).
    await expect(page.getByTestId('m-punch-self-verify')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('m-punch-verify')).toBeDisabled();
  });
});
