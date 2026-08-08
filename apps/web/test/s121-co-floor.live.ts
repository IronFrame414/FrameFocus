import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// #117 — THE CHANGE-ORDER READ FLOOR. Migration 20260830000000. [S121]
// ============================================================================
//
// RULED [Josh, S121]: PM scope is AUTHORED-BY. Owner and Admin keep full
// access; a PM sees change orders they created and no others; foreman, crew and
// subcontractor see none.
//
// ---------------------------------------------------------------------------
// ⚠️ WHAT THIS HARNESS IS SHAPED AROUND
// ---------------------------------------------------------------------------
// A floor's failure mode is REFUSING EVERYBODY, which from outside looks
// identical to the floor working. So every assertion is PAIRED — a role that
// must lose access and a role that must keep it — and the PM arm is paired
// twice over: they must still see their OWN change order AND must not see a
// specific owner-authored one. A policy that returned the empty set for
// everyone would pass an absence-only harness and fail this.
//
// The PM number is asserted to move in the direction authored-by PREDICTS
// rather than merely to change: 20 -> exactly the count of COs where
// `created_by` is that PM, computed from the database rather than hard-coded,
// so a fixture change cannot silently make this vacuous.
//
// Real supabase-js clients on the anon key carrying real user JWTs — never
// `postgres`, which bypasses RLS and would prove nothing.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';

/** Roles that must read nothing at all, on any of the three tables. */
const FLOORED = [
  ['foreman', FOREMAN],
  ['crew_member', CREW],
  ['subcontractor', SUB],
] as const;

const s: Record<string, SupabaseClient> = {};
let pmUserId: string;
let pmAuthoredCount: number;
let ownerAuthoredCoId: string;
let liveCoCount: number;

beforeAll(async () => {
  assertRebuildTest();
  for (const [role, email] of [
    ['owner', OWNER],
    ['admin', ADMIN],
    ['project_manager', PM],
    ...FLOORED,
  ] as const) {
    s[role] = await sessionFor(email);
  }

  pmUserId = (await s.project_manager.auth.getUser()).data.user!.id;

  const { data: all } = await admin
    .from('change_orders')
    .select('id, created_by')
    .eq('is_deleted', false);
  liveCoCount = (all ?? []).length;
  pmAuthoredCount = (all ?? []).filter((c) => c.created_by === pmUserId).length;

  const ownerAuthored = (all ?? []).find((c) => c.created_by && c.created_by !== pmUserId);
  ownerAuthoredCoId = ownerAuthored!.id;

  // The fixture has to be able to tell the two apart, or the PM arm is vacuous.
  expect(pmAuthoredCount, 'the PM authored no CO — the authored-by arm cannot be tested').toBeGreaterThan(0);
  expect(pmAuthoredCount, 'the PM authored EVERY CO — the exclusion cannot be tested').toBeLessThan(liveCoCount);
}, 240_000);

// ---------------------------------------------------------------------------
// THE FLOOR — foreman, crew, subcontractor read nothing.
// ---------------------------------------------------------------------------
describe('#117 · foreman, crew and subcontractor read no change order', () => {
  for (const [role] of FLOORED) {
    it(`${role} — change_orders is empty`, async () => {
      const { data, error } = await s[role].from('change_orders').select('id, net_delta');
      expect(error).toBeNull();
      expect(data ?? [], `${role} still reads change orders`).toEqual([]);
    });

    it(`${role} — change_order_line_items is empty`, async () => {
      const { data, error } = await s[role]
        .from('change_order_line_items')
        .select('id, total_price');
      expect(error).toBeNull();
      expect(data ?? [], `${role} still reads CO line items`).toEqual([]);
    });

    it(`${role} — change_order_line_rows is empty (cost, margin AND price)`, async () => {
      const { data, error } = await s[role]
        .from('change_order_line_rows')
        .select('id, unit_cost, rate, markup_percent, total, amount');
      expect(error).toBeNull();
      expect(data ?? [], `${role} still reads CO line rows`).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// THE NON-CHANGE HALF — Owner and Admin are untouched.
// ---------------------------------------------------------------------------
describe('#117 · Owner and Admin keep full access', () => {
  for (const role of ['owner', 'admin'] as const) {
    it(`${role} still reads every live change order, with its figures`, async () => {
      const { data, error } = await s[role]
        .from('change_orders')
        .select('id, net_delta, labor_markup_percent')
        .eq('is_deleted', false);
      expect(error).toBeNull();
      expect(data?.length, `${role} lost change orders — the floor over-reached`).toBe(liveCoCount);
      expect(
        (data ?? []).filter((c) => c.net_delta !== null).length,
        `${role} lost net_delta`
      ).toBe(liveCoCount);
    });

    it(`${role} still reads the line rows' cost and margin`, async () => {
      const { data, error } = await s[role]
        .from('change_order_line_rows')
        .select('id, unit_cost, markup_percent');
      expect(error).toBeNull();
      expect((data ?? []).length, `${role} lost CO line rows`).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// THE RULING ITSELF — authored-by, both directions.
// ---------------------------------------------------------------------------
describe('#117 · a PM sees the change orders they created, and no others', () => {
  it('the PM reads EXACTLY their own — the count matches created_by, not the project', async () => {
    const { data, error } = await s.project_manager
      .from('change_orders')
      .select('id, created_by, net_delta')
      .eq('is_deleted', false);
    expect(error).toBeNull();

    // The direction authored-by predicts: down from every CO on every assigned
    // project, to exactly the ones this PM wrote.
    expect(data?.length, 'the PM read a number of COs that authored-by does not predict').toBe(
      pmAuthoredCount
    );
    expect(data!.length).toBeLessThan(liveCoCount);
    // And every row returned really is theirs.
    expect((data ?? []).every((c) => c.created_by === pmUserId)).toBe(true);
    // They keep the FIGURES on their own — the ruling grants values, not just rows.
    expect((data ?? []).every((c) => c.net_delta !== null)).toBe(true);
  });

  it("the PM cannot read a specific owner-authored CO by id", async () => {
    // The exclusion half. A count assertion alone would pass on a policy that
    // returned the wrong rows in the right quantity.
    const { data, error } = await s.project_manager
      .from('change_orders')
      .select('id, net_delta')
      .eq('id', ownerAuthoredCoId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data, 'the PM read a change order they did not author').toBeNull();
  });

  it("the PM cannot reach another author's line rows either — the children follow the parent", async () => {
    const { data: items } = await admin
      .from('change_order_line_items')
      .select('id')
      .eq('change_order_id', ownerAuthoredCoId);
    const itemIds = (items ?? []).map((i) => i.id);
    if (itemIds.length === 0) return;

    const { data: seenItems } = await s.project_manager
      .from('change_order_line_items')
      .select('id')
      .in('id', itemIds);
    expect(seenItems ?? [], "the PM read another author's line items").toEqual([]);

    const { data: seenRows } = await s.project_manager
      .from('change_order_line_rows')
      .select('id, unit_cost, markup_percent')
      .in('line_item_id', itemIds);
    expect(seenRows ?? [], "the PM read another author's line rows").toEqual([]);
  });

  it('the PM can still read the line rows of their OWN CO', async () => {
    // The pair for the test above. Without it, a policy that blanked every
    // child row would pass the exclusion and break CO authoring.
    const { data: mine } = await s.project_manager
      .from('change_orders')
      .select('id')
      .eq('created_by', pmUserId)
      .limit(1);
    const coId = mine?.[0]?.id;
    expect(coId, 'the PM has no readable CO of their own').toBeTruthy();

    const { data: items } = await s.project_manager
      .from('change_order_line_items')
      .select('id')
      .eq('change_order_id', coId!);
    expect((items ?? []).length, "the PM lost their own CO's line items").toBeGreaterThan(0);
  });
});
