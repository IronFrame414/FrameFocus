import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// M6M — the [live] halves of A-55, A-58 and A-67b.
// ============================================================================
//
// S117 marked these three PARTIALLY SATISFIED and named what was missing; S118
// wrote the missing halves. Each test is shaped around the failure the S117
// note identified rather than around the happy path.
//
//   A-58  Part C asserted the PRE-TAP SURFACE — the notice renders, the button
//         is disabled — and never reached `verifyPunchItem`. **A build that
//         deleted the service-layer check and kept the disabled button passed
//         that test and defeated the rule.** So this file calls the function.
//   A-55  Part C proved net_delta CHANGED (0.00 → not 0.00). It did not prove
//         it MATCHES. So this asserts the identity net_delta = Σ line totals.
//   A-67b Part C read the list NAME rendered beside the item. So this reads
//         `punch_list_id`.
//
// ---------------------------------------------------------------------------
// ⚠️ THIS FILE CREATES EVERYTHING IT ASSERTS ON, AND REMOVES IT. [TECH_DEBT #144]
// ---------------------------------------------------------------------------
// The S118 version READ the Playwright suite's leftovers — A-55 scanned COs
// titled `E2E %`, A-67b matched an `E2E Item <stamp>` to its list. That was the
// coupling that blocked #144's cleanup: adding an `afterAll` to
// `e2e/m-writes.spec.ts` would have left both with nothing to assert, and they
// would have thrown their "run the Playwright suite first" error.
//
// **The dependency is gone.** This harness now builds its own change order and
// its own punch list through the SAME service functions the screens call, so it
// runs standalone like every other `*.live.ts` — and `m-writes.spec.ts` is free
// to clean up after itself.
//
// ---------------------------------------------------------------------------
// WHAT IS STUBBED, AND WHY IT DOES NOT WEAKEN ANYTHING
// ---------------------------------------------------------------------------
// `vi.mock('@/lib/supabase-browser')` — the CLIENT FACTORY only, replaced with
// a real supabase-js client carrying a real user JWT. Precedent:
// `s97ct-7e-clicktest.live.ts`, which stubs the same factory for the same
// reason. **The functions are real; only their transport is substituted.**
//
// For A-58 that matters specifically: the criterion is explicitly NOT about
// RLS — §4.11.10b records that RLS accepts a direct UPDATE setting
// `status='verified'` from any role (open item 7). The rule lives in
// TypeScript, so executing that TypeScript IS the test.
//
// ⚠️ ONE DELIBERATE SUBSTITUTION IN A-55. `recalculateChangeOrderTotals()`
// (client) POSTs to `/api/change-orders/[id]/recalculate`, which needs a
// running Next server and a relative-URL fetch that node cannot resolve. This
// harness calls **`recalculateChangeOrderTotalsPrivileged(admin, id)`** — the
// server half that route delegates to (§4.11.12a / #140). Same arithmetic,
// same shared pricing functions; what is skipped is the route's 401/403/404
// gate, which `e2e/m-co-recalc-route.spec.ts` already covers as A-68d.

const state: { client: SupabaseClient | null } = { client: null };
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));

const { verifyPunchItem, createPunchList } = await import('@/lib/services/punch-client');
// ⚠️ [S123 / ND-18] `createPunchItem` is NO LONGER IMPORTED FROM punch-client.
// It now POSTs to /api/punch-items so §3b can notify the assignee from a server
// path, and a relative-URL fetch has no origin node can resolve — the SAME
// substitution this file already documents for A-55's
// `recalculateChangeOrderTotalsPrivileged`. The harness calls the route's WRITE
// HALF, which runs the identical insert under the same caller session.
//
// That is also how the harness stays out of the notification path by
// construction rather than by a flag: only the ROUTE notifies. This particular
// call passes no `assignee_id`, so it would write nothing either way — but the
// property should not depend on that.
const { insertPunchItemAsCaller } = await import('@/lib/services/assignments-server');
const { createChangeOrder, createCoLineItem, createCoLineRow } = await import(
  '@/lib/services/change-orders-client'
);
const { recalculateChangeOrderTotalsPrivileged } = await import(
  '@/lib/services/change-order-totals-server'
);

const OWNER = 'josh+test50@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';

/** Everything this file makes is named with this, and removed by it. */
const TAG = 'QA S118 harness';

let projectId: string;
let companyId: string;
let foremanMemberId: string;

// Created rows, torn down in reverse.
let coId: string | null = null;
let a58ListId: string | null = null;
let a58ItemId: string | null = null;
let a67bListId: string | null = null;

// ⚠️ EVERY ADMIN INSERT SETS company_id EXPLICITLY. Per-tenant tables carry
// `company_id DEFAULT get_my_company_id()`; under the SERVICE ROLE there is no
// `auth.uid()`, so that default evaluates to NULL and the insert dies on the
// NOT NULL constraint. Cost a run to rediscover [S118].

beforeAll(async () => {
  assertRebuildTest();

  // Company A's isolation fixture project: the seed assigns PM, foreman and
  // crew to it, so a Foreman+ completer is available — which the m-sections
  // project could not offer before #143 was closed.
  const { data: project } = await admin
    .from('projects')
    .select('id, company_id')
    .eq('name', 'QA A — isolation fixture')
    .single();
  projectId = project!.id;
  companyId = project!.company_id as string;

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', FOREMAN)
    .single();
  const { data: member } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', profile!.id)
    .eq('is_deleted', false)
    .single();
  foremanMemberId = member!.id;
});

afterAll(async () => {
  // Reverse order, children first — the CO line-row FK has no ON DELETE CASCADE.
  if (coId) {
    const { data: lines } = await admin
      .from('change_order_line_items')
      .select('id')
      .eq('change_order_id', coId);
    const lineIds = (lines ?? []).map((l) => l.id);
    if (lineIds.length > 0) {
      await admin.from('change_order_line_rows').delete().in('line_item_id', lineIds);
      await admin.from('change_order_line_items').delete().eq('change_order_id', coId);
    }
    await admin.from('change_orders').delete().eq('id', coId);
  }
  for (const listId of [a58ListId, a67bListId]) {
    if (!listId) continue;
    await admin.from('punch_list_items').delete().eq('punch_list_id', listId);
    await admin.from('punch_lists').delete().eq('id', listId);
  }
});

// ===========================================================================
// A-58 — verifyPunchItem refuses the member who COMPLETED the item
// ===========================================================================
describe('A-58 — the separate-eyes rule, executed rather than displayed', () => {
  beforeAll(async () => {
    const { data: list, error: listError } = await admin
      .from('punch_lists')
      .insert({ project_id: projectId, company_id: companyId, name: `${TAG} A-58` })
      .select('id')
      .single();
    if (listError) throw new Error(`A-58 list: ${listError.message}`);
    a58ListId = list!.id;

    // Complete, requiring verification, completed BY THE FOREMAN.
    const { data: item, error } = await admin
      .from('punch_list_items')
      .insert({
        punch_list_id: a58ListId,
        project_id: projectId,
        company_id: companyId,
        title: `${TAG} A-58 item`,
        status: 'complete',
        requires_verification: true,
        requires_completion_photo: false,
        completed_by: foremanMemberId,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(`A-58 item: ${error.message}`);
    a58ItemId = item!.id;
  });

  it('REFUSES the foreman who completed it — the criterion itself', async () => {
    state.client = await sessionFor(FOREMAN);

    const result = await verifyPunchItem(
      {
        id: a58ItemId!,
        status: 'complete',
        requires_verification: true,
        completed_by: foremanMemberId,
      },
      'foreman'
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/completed an item cannot verify/i);

    // AND NOTHING WAS WRITTEN. A refusal that returns false after updating the
    // row would satisfy the assertion above and defeat the rule.
    const { data } = await admin
      .from('punch_list_items')
      .select('status, verified_by')
      .eq('id', a58ItemId!)
      .single();
    expect(data!.status).toBe('complete');
    expect(data!.verified_by).toBeNull();
  });

  it('REFUSES a crew member by ROLE, before the separate-eyes check', async () => {
    state.client = await sessionFor(CREW);

    const result = await verifyPunchItem(
      { id: a58ItemId!, status: 'complete', requires_verification: true, completed_by: foremanMemberId },
      'crew_member'
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/foreman and above/i);
  });

  it('ACCEPTS a different Foreman+ member — so the refusals are not vacuous', async () => {
    // ⚠️ THE PAIRED HALF. Without it, a `verifyPunchItem` that refused
    // everybody would pass both assertions above.
    state.client = await sessionFor(OWNER);

    const result = await verifyPunchItem(
      { id: a58ItemId!, status: 'complete', requires_verification: true, completed_by: foremanMemberId },
      'owner'
    );

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    const { data } = await admin
      .from('punch_list_items')
      .select('status, verified_by')
      .eq('id', a58ItemId!)
      .single();
    expect(data!.status).toBe('verified');
    expect(data!.verified_by).not.toBe(foremanMemberId);
  });

  it('⚠️ RLS WOULD HAVE ALLOWED IT — the rule is TypeScript and nothing else', async () => {
    // Not a criterion; a standing demonstration that open item 7 is real, so a
    // reader does not mistake A-58 passing for a database guarantee. The crew
    // member refused above writes the SAME transition through their own client.
    const crew = await sessionFor(CREW);

    const { data: probe } = await admin
      .from('punch_list_items')
      .insert({
        punch_list_id: a58ListId,
        project_id: projectId,
        company_id: companyId,
        title: `${TAG} A-58 RLS probe`,
        status: 'complete',
        requires_verification: true,
        requires_completion_photo: false,
      })
      .select('id')
      .single();

    const { error } = await crew
      .from('punch_list_items')
      .update({ status: 'verified' })
      .eq('id', probe!.id);

    expect(error).toBeNull(); // RLS permits it. THIS IS THE POINT.
    const { data: after } = await admin
      .from('punch_list_items')
      .select('status')
      .eq('id', probe!.id)
      .single();
    expect(after!.status).toBe('verified');

    await admin.from('punch_list_items').delete().eq('id', probe!.id);
  });
});

// ===========================================================================
// A-55 — net_delta MATCHES the sum of its line totals, not merely "changed"
// ===========================================================================
describe('A-55 — the persisted net_delta equals the persisted line totals', () => {
  beforeAll(async () => {
    // Built through the SAME client functions M-32 calls, as an owner (CO
    // writes are DB-floored to owner/admin/PM, so the session matters).
    state.client = await sessionFor(OWNER);

    const co = await createChangeOrder({
      project_id: projectId,
      title: `${TAG} A-55`,
      co_type: 'fixed_price',
    });
    if (!co.success || !co.id) throw new Error(`A-55 createChangeOrder: ${co.error}`);
    coId = co.id;

    // TWO line items, so a build that summed only the first fails.
    for (const [i, amount] of [500, 250.5].entries()) {
      const line = await createCoLineItem({
        change_order_id: coId,
        name: `${TAG} line ${i + 1}`,
        description: null,
        sort_order: i,
      });
      if (!line.success || !line.id) throw new Error(`A-55 createCoLineItem: ${line.error}`);

      const row = await createCoLineRow({
        line_item_id: line.id,
        row_type: 'other',
        name: `${TAG} row ${i + 1}`,
        sort_order: 0,
        markup_percent: null,
        rate: null,
        quantity: null,
        unit_cost: null,
        amount,
        subcontractor_id: null,
      });
      if (!row.success) throw new Error(`A-55 createCoLineRow: ${row.error}`);
    }

    const priced = await recalculateChangeOrderTotalsPrivileged(admin, coId);
    if (!priced.success) throw new Error(`A-55 recalculation refused: ${priced.error}`);
  });

  it('net_delta equals Σ line_items.total_price, to the cent', async () => {
    const { data: co } = await admin
      .from('change_orders')
      .select('net_delta')
      .eq('id', coId!)
      .single();
    const { data: lines } = await admin
      .from('change_order_line_items')
      .select('total_price')
      .eq('change_order_id', coId!);

    expect((lines ?? []).length, 'the fixture must carry line items').toBe(2);

    const sum = (lines ?? []).reduce((acc, l) => acc + Number(l.total_price ?? 0), 0);

    // Integer cents on both sides: the claim is agreement, not float identity.
    expect(
      Math.round(Number(co!.net_delta ?? 0) * 100),
      `net_delta ${co!.net_delta} vs Σ line totals ${sum}`
    ).toBe(Math.round(sum * 100));
  });

  it('and it is NOT zero — "matches" and "is not 0" are different claims', async () => {
    // A build could satisfy the identity above with 0 = Σ(0), which is exactly
    // the state A-55 was written to catch: rows written, recalculation skipped.
    const { data: co } = await admin
      .from('change_orders')
      .select('net_delta')
      .eq('id', coId!)
      .single();
    expect(Number(co!.net_delta ?? 0)).not.toBe(0);
  });

  it('every line total is itself the sum of its rows', async () => {
    // One level down. If a line's total disagreed with its rows the CO total
    // could still match Σ lines and be wrong — the error would just be hidden
    // one level deeper.
    const { data: lines } = await admin
      .from('change_order_line_items')
      .select('id, total_price')
      .eq('change_order_id', coId!);

    for (const line of lines ?? []) {
      const { data: rows } = await admin
        .from('change_order_line_rows')
        .select('total')
        .eq('line_item_id', line.id);
      const rowSum = (rows ?? []).reduce((acc, r) => acc + Number(r.total ?? 0), 0);
      expect(Math.round(Number(line.total_price ?? 0) * 100)).toBe(Math.round(rowSum * 100));
    }
  });
});

// ===========================================================================
// A-67b — the item's punch_list_id points at the list that was just created
// ===========================================================================
describe('A-67b — read the column, not the label rendered beside it', () => {
  it('createPunchList then createPunchItem — and the item points at that list', async () => {
    // M-33's exact two-write shape, through the same two functions
    // (`punch-form.tsx`): the list is created first, its id is used for the
    // item. Run as CREW, because D-52-as-corrected opens punch creation to
    // every role and crew is the narrowest one that is not a subcontractor.
    state.client = await sessionFor(CREW);

    const listName = `${TAG} A-67b list`;
    const created = await createPunchList(projectId, listName);
    expect(created.success, created.error).toBe(true);
    a67bListId = created.id!;

    // `state.client` is the CREW session the mock hands to punch-client; the
    // write half takes it explicitly, so the insert still runs as crew under
    // punch_list_items_insert_authenticated — which is what A-67b is about.
    const item = await insertPunchItemAsCaller(state.client!, {
      punch_list_id: a67bListId,
      project_id: projectId,
      title: `${TAG} A-67b item`,
    });
    expect(item.success, item.error).toBe(true);

    // THE ASSERTION S117 ASKED FOR: the COLUMN, read directly, and compared to
    // the id `createPunchList` returned — not to a name rendered beside it.
    const { data } = await admin
      .from('punch_list_items')
      .select('punch_list_id')
      .eq('id', item.id!)
      .single();
    expect(data!.punch_list_id).toBe(a67bListId);
  });

  it('an empty list left behind by a failed item insert is a LEGAL state', async () => {
    // A-67b: "A failed item insert leaves the new list behind, which is
    // accepted (D-60) and must not be 'fixed' with a cleanup." Asserted as the
    // absence of a cleanup — the list survives, un-deleted, with no items.
    state.client = await sessionFor(CREW);

    const orphan = await createPunchList(projectId, `${TAG} A-67b orphan`);
    expect(orphan.success).toBe(true);

    const { count } = await admin
      .from('punch_list_items')
      .select('id', { count: 'exact', head: true })
      .eq('punch_list_id', orphan.id!);
    expect(count ?? 0).toBe(0);

    const { data: still } = await admin
      .from('punch_lists')
      .select('is_deleted')
      .eq('id', orphan.id!)
      .single();
    expect(still!.is_deleted).toBe(false);

    await admin.from('punch_lists').delete().eq('id', orphan.id!);
  });
});
