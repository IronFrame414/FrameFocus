import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// The three subcontractor criteria that #127 blocked — A-59, A-59e, A-45b2.
// ============================================================================
//
// All three were `[live — BLOCKED on TECH_DEBT #127]`: rebuild-test had no
// subcontractor identity, so each would SKIP rather than pass. #127 closed in
// S113 (josh+qa-sub@worthprop.com — real profile, linked company_members row,
// project assignment), and these are the assertions it was closed to enable.
//
// ---------------------------------------------------------------------------
// ⚠️ A-45b2 IS ASSERTED AS RULED, NOT AS WRITTEN IN THE ORIGINAL CRITERION
// ---------------------------------------------------------------------------
//   The criterion as authored [S102, D-47] said a sub sees "own plus
//   assigned-project expenses, nothing beyond". THAT RULE WAS WITHDRAWN.
//   RULING 1 [Josh, S106], migration 20260827000000_expenses_subcontractor_floor,
//   took subcontractors out of `expenses` ENTIRELY — the author-own arm
//   included, plus a matching floor on INSERT. The spec body records the
//   reversal (§4.13.3, "Subcontractors are no longer in this sentence"); the
//   acceptance criterion was never rewritten to match, and this harness follows
//   the ruling and the shipped policy rather than the stale line. A-45b2 has
//   been corrected in the spec alongside this file.
//
//   Writing it as originally worded would have asserted a withdrawn rule, and
//   it would have FAILED — which is the good outcome; the bad one is writing it
//   loosely enough to pass either way.
//
//   This also RETIRES A WORKAROUND. 20260827000000's own header records that,
//   with #127 open, its proof "flips one existing identity's profiles.role to
//   'subcontractor' for the duration and restores it". That proof was real but
//   not reproducible — nobody could re-run it by signing in, which is the exact
//   complaint #127 was raised about. The expenses assertions below re-prove the
//   same migration against a PERMANENT identity, so the flip is no longer the
//   only evidence. The migration file's comment is left as written rather than
//   edited after the fact; this note is the correction.
//
// ---------------------------------------------------------------------------
// WHY THESE ARE DB ASSERTIONS AND NOT SCREEN ASSERTIONS
// ---------------------------------------------------------------------------
//   Each of the three is a claim about what the DATABASE hands the caller. A
//   screen-level check would pass on a build that filters in the service layer
//   while still shipping the rows to the client — TECH_DEBT #136's mistake. The
//   browser halves that do exist live in e2e/m-sections.spec.ts (A-33c) and
//   e2e/m-destinations.spec.ts (A-45b2's rendered-row arm).
//
// Fixtures come from scripts/seed-test-identities.mjs. The two tests that must
// WRITE (A-59) create their own rows and remove them in afterAll, because a
// permanent fixture cannot prove that a create SUCCEEDS.

const SUB = 'josh+qa-sub@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';

/** Company A — Bishop Contracting. */
const COMPANY = '03bb903f-1084-4ab4-afb8-03192cb58d30';
/** QA A — isolation fixture, the project the sub is assigned to. */
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9';

const ASSIGNED = 'QA D-57 ASSIGNED to the sub';

let sub: SupabaseClient;
let owner: SupabaseClient;
let crew: SupabaseClient;
let subMemberId: string;

/** Rows this harness created, torn down in afterAll whatever happened. */
const madeLists: string[] = [];
const madeItems: string[] = [];

beforeAll(async () => {
  assertRebuildTest();
  sub = await sessionFor(SUB);
  owner = await sessionFor(OWNER);
  crew = await sessionFor(CREW);

  const { data: mid } = await sub.rpc('get_my_member_id');
  subMemberId = mid as string;

  // Fail loudly and specifically rather than as three mystifying assertions.
  const { data: role } = await sub.rpc('get_my_role');
  if (role !== 'subcontractor' || !subMemberId) {
    throw new Error(
      `the QA sub is not usable (role=${role}, member=${subMemberId}). Run: node scripts/seed-test-identities.mjs`
    );
  }
});

afterAll(async () => {
  if (madeItems.length) await admin.from('punch_list_items').delete().in('id', madeItems);
  if (madeLists.length) await admin.from('punch_lists').delete().in('id', madeLists);
});

// ===========================================================================
// A-59 — a subcontractor may CREATE punch lists and items, and COMPLETE them
// ===========================================================================
//
// The criterion was REWRITTEN [S110] when Josh withdrew D-52's subcontractor
// exclusion. Its superseded form asserted the opposite ("a sub is refused punch
// create, complete and verify"), so the risk here is a build that still carries
// the old exclusion somewhere. D-57 narrowed what a sub can SEE; it deliberately
// did not touch INSERT, and this is the criterion that would catch someone
// "finishing" the narrowing by flooring INSERT too.
describe('A-59 — a subcontractor creates punch lists and items, and completes them', () => {
  it('creates a punch list on a project they are assigned to', async () => {
    const { data, error } = await sub
      .from('punch_lists')
      .insert({ company_id: COMPANY, project_id: PROJECT, name: `QA A-59 list ${Date.now()}` })
      .select('id')
      .single();
    expect(error, `punch list insert refused: ${error?.code} ${error?.message}`).toBeNull();
    expect(data?.id).toBeTruthy();
    madeLists.push(data!.id as string);
  });

  it('creates an item, and the chained RETURNING survives its own SELECT policy', async () => {
    // NOT an incidental detail. Postgres refuses INSERT ... RETURNING when the
    // new row fails the SELECT policy and rolls the whole statement back — the
    // silent-discard trap that 20260827000000's header documents against
    // `expenses`. A sub's new punch item passes D-57's author arm
    // (created_by = auth.uid()), so the RETURNING is legal here. If someone
    // later narrows the author arm out of the SELECT policy, punch creation
    // starts failing for subs in a way that names RLS rather than the rule, and
    // this assertion is what catches it.
    const listId = madeLists[0];
    expect(listId, 'the list test must run first').toBeTruthy();

    const { data, error } = await sub
      .from('punch_list_items')
      .insert({
        company_id: COMPANY,
        project_id: PROJECT,
        punch_list_id: listId,
        title: `QA A-59 item ${Date.now()}`,
        status: 'open',
      })
      .select('id, created_by')
      .single();

    expect(error, `punch item insert refused: ${error?.code} ${error?.message}`).toBeNull();
    expect(data?.id).toBeTruthy();
    madeItems.push(data!.id as string);
  });

  it('completes the item it authored', async () => {
    const itemId = madeItems[0];
    expect(itemId, 'the item test must run first').toBeTruthy();

    const { data, error } = await sub
      .from('punch_list_items')
      .update({ status: 'complete' })
      .eq('id', itemId)
      .select('id, status');

    expect(error, `complete refused: ${error?.code}`).toBeNull();
    // RLS refuses by matching no rows, not by erroring — so an empty array is
    // the failure to guard, and it is why this asserts length rather than !error.
    expect(data ?? []).toHaveLength(1);
    expect(data![0].status).toBe('complete');
  });

  it('still cannot reach an item that is neither theirs to do nor theirs to have written', async () => {
    // A-59 must not be read as "subs may write to punch". Paired with the three
    // passes above so a policy that simply grants subs everything fails here.
    const { data: target } = await admin
      .from('punch_list_items')
      .select('id')
      .eq('project_id', PROJECT)
      .eq('title', 'QA D-57 NEITHER — sub must not see this')
      .single();

    const { data } = await sub
      .from('punch_list_items')
      .update({ status: 'complete' })
      .eq('id', target!.id)
      .select('id');
    expect(data ?? []).toHaveLength(0);
  });
});

// ===========================================================================
// A-59e — the M-3 Punch badge counts only what D-57 lets the sub see
// ===========================================================================
//
// §4.11.14's D-57 caveat. `getOpenPunchCounts` (lib/services/punch.ts:102)
// reads through the caller's RLS-scoped client, so a narrowed count is what
// CORRECT behaviour looks like — the same shape A-11j already accepts for crew.
//
// THE TEMPTING FIX IS TO BYPASS RLS TO MAKE THE NUMBER LOOK RIGHT, and that is
// what this asserts against: no code path may recover a project-wide total for
// a sub. Asserted by reproducing getOpenPunchCounts' exact query shape as each
// role and comparing, rather than by hard-coding a number that would drift.
describe('A-59e — a subcontractor Punch badge counts only their visible items', () => {
  /** getOpenPunchCounts' query, verbatim in shape, for one caller. */
  async function counts(client: SupabaseClient) {
    const [{ data: memberId }, { data }] = await Promise.all([
      client.rpc('get_my_member_id'),
      client
        .from('punch_list_items')
        .select('project_id, assignee_id')
        .eq('project_id', PROJECT)
        .eq('is_deleted', false)
        .in('status', ['open', 'in_progress']),
    ]);
    const rows = data ?? [];
    return {
      total: rows.length,
      mine: rows.filter((r) => memberId && r.assignee_id === memberId).length,
    };
  }

  it('the sub total is strictly smaller than the owner total on the same project', async () => {
    const s = await counts(sub);
    const o = await counts(owner);
    // Strictly smaller, not merely different: the fixtures put an item on this
    // project that the sub must not see, so equality means D-57 stopped working.
    expect(s.total).toBeLessThan(o.total);
  });

  it('counts exactly the items the sub can read — and it is not zero', async () => {
    const s = await counts(sub);
    const { data: visible } = await sub
      .from('punch_list_items')
      .select('id')
      .eq('project_id', PROJECT)
      .eq('is_deleted', false)
      .in('status', ['open', 'in_progress']);

    expect(s.total).toBe((visible ?? []).length);
    // The paired half. A badge reading 0 would also satisfy "counts only what
    // they can see", and would be indistinguishable from the feature working.
    expect(s.total).toBeGreaterThan(0);
  });

  it('"mine" keys on the MEMBER id, and is a subset of the total', async () => {
    // GAP-1b's trap: assignee_id is a company_members id. Comparing it to a
    // user id returns 0 for everyone rather than erroring, so a broken build
    // reports "mine: 0" and looks merely quiet.
    const s = await counts(sub);
    const { data: assignedToSub } = await admin
      .from('punch_list_items')
      .select('id')
      .eq('project_id', PROJECT)
      .eq('assignee_id', subMemberId)
      .eq('is_deleted', false)
      .in('status', ['open', 'in_progress']);

    expect(s.mine).toBe((assignedToSub ?? []).length);
    expect(s.mine).toBeGreaterThan(0);
    expect(s.mine).toBeLessThanOrEqual(s.total);
  });

  it('no wider count is reachable — the sub cannot read the project total by any query', async () => {
    // The criterion's real claim. A count() with head:true goes through the
    // same policy, so if some arm did leak a project-wide figure this is where
    // it would show.
    const { count } = await sub
      .from('punch_list_items')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', PROJECT)
      .eq('is_deleted', false);
    const { count: ownerCount } = await owner
      .from('punch_list_items')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', PROJECT)
      .eq('is_deleted', false);

    expect(count).toBeLessThan(ownerCount!);
  });
});

// ===========================================================================
// A-45b2 — a subcontractor and `expenses`, AS RULED (S106 Ruling 1)
// ===========================================================================
//
// See the file header: the criterion as originally written is superseded.
// Migration 20260827000000 removed subcontractors from `expenses` entirely.
//   expenses_select_scoped      — sub reads NOTHING, author-own arm included
//   expenses_insert_authorized  — sub gains an explicit role floor
//
// The two ship together deliberately. Closing only the read would turn "a sub
// submits a receipt" into a SILENT DISCARD, because createExpense chains
// .select().single() and Postgres rolls back INSERT ... RETURNING when the new
// row fails the SELECT policy. The INSERT assertion below therefore runs
// WITHOUT a chained .select(), which is the only way to tell a real WITH CHECK
// floor apart from that rollback.
describe('A-45b2 — a subcontractor is out of expenses entirely (S106 Ruling 1)', () => {
  it('reads zero expenses, across every project', async () => {
    const { data, error } = await sub.from('expenses').select('id').eq('is_deleted', false);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('reads zero even on the project they ARE assigned to', async () => {
    // The arm D-47 had opened and Ruling 1 closed. Named separately so a
    // migration that restores the role array fails here specifically.
    const { data } = await sub
      .from('expenses')
      .select('id')
      .eq('project_id', PROJECT)
      .eq('is_deleted', false);
    expect(data ?? []).toHaveLength(0);
  });

  it('the exclusion is real, not an empty table — crew sees many on the same data', async () => {
    // Without this, every assertion above passes on a database with no expenses
    // at all. crew_member is the role Ruling 1 explicitly RETAINED, so it is
    // the right comparison: same rows, different role, different answer.
    const { data } = await crew.from('expenses').select('id').eq('is_deleted', false);
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('INSERT is refused by the policy itself, with no chained select to mask why', async () => {
    const { error } = await sub.from('expenses').insert({
      company_id: COMPANY,
      project_id: PROJECT,
      description: 'QA A-45b2 must never land',
      amount: 1.23,
      state: 'actual',
    });
    expect(error).not.toBeNull();
    // 42501 = insufficient_privilege. Asserting the CODE rather than the
    // message: a row that lands and is then invisible would surface as a
    // different failure, and this is the one that means the WITH CHECK refused.
    expect(error!.code).toBe('42501');
  });

  it('and nothing landed — the refusal is not a rolled-back write that half-happened', async () => {
    const { data } = await admin
      .from('expenses')
      .select('id')
      .eq('description', 'QA A-45b2 must never land');
    expect(data ?? []).toHaveLength(0);
  });
});
