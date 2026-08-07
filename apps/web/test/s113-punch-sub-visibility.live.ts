import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// D-57 / D-58 — a subcontractor sees (and writes) only their own punch items.
// ============================================================================
//
// M6M §4.11.14a. Two policies, one migration:
//   punch_list_items_select_visible        (D-57)
//   punch_list_items_update_authenticated  (D-58)
//
// THE RULE. A subcontractor sees a punch item only if
//   assignee_id = get_my_member_id()   OR   created_by = auth.uid()
// and nothing else on the project. Every other role is unchanged.
//
// ---------------------------------------------------------------------------
// WHY THIS RUNS AGAINST THE REAL DATABASE AND NOT A FAKE
// ---------------------------------------------------------------------------
//   The rule IS the policy. A unit test with a stubbed client would assert my
//   own reimplementation of the predicate, which is the one thing that cannot
//   go wrong here — what can go wrong is the SQL. These sessions are real
//   supabase-js clients on the anon key carrying real user JWTs, so RLS applies
//   exactly as it does in the app.
//
// ---------------------------------------------------------------------------
// THE FAILURE MODE THIS HARNESS IS SHAPED AROUND — read before editing
// ---------------------------------------------------------------------------
//   D-57's failure mode is A SUB SEEING NOTHING, which from the outside is
//   indistinguishable from the rule working. So an absence assertion alone
//   ("the sub cannot see NEITHER") passes on a policy that returns the empty
//   set for everybody. Every sub assertion below is therefore PAIRED: something
//   they MUST see, and something they must NOT. A regression that blanks the
//   table fails the first half.
//
//   THE TWO ARMS SIT ON DIFFERENT IDENTITY AXES and the fixtures reflect that:
//     assignee_id -> company_members(id)   compared to get_my_member_id()
//     created_by  -> auth.users(id)        compared to auth.uid()
//   The ASSIGNED fixture is assigned-not-authored and the AUTHORED fixture is
//   authored-not-assigned, so a predicate that reads the wrong column fails
//   rather than coincidentally passing.
//
// Fixtures are seeded permanently and idempotently by
// scripts/seed-test-identities.mjs, so this is reproducible by anyone. It
// creates NOTHING of its own.

const SUB = 'josh+qa-sub@worthprop.com';
const OTHERS = [
  ['owner', 'josh+test50@worthprop.com'],
  ['admin', 'josh+qa-admin@worthprop.com'],
  ['project_manager', 'josh+pm@worthprop.com'],
  ['foreman', 'josh+qa-foreman@worthprop.com'],
  ['crew_member', 'josh+crew@worthprop.com'],
] as const;

const ASSIGNED = 'QA D-57 ASSIGNED to the sub';
const AUTHORED = 'QA D-57 AUTHORED by the sub';
const NEITHER = 'QA D-57 NEITHER — sub must not see this';

let projectId: string;
let subClient: SupabaseClient;
const titlesFor = new Map<string, string[]>();

async function visibleTitles(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client
    .from('punch_list_items')
    .select('title')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .like('title', 'QA D-57%');
  if (error) throw new Error(`visibleTitles: ${error.message}`);
  return (data ?? []).map((r) => r.title as string).sort();
}

beforeAll(async () => {
  assertRebuildTest();

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('name', 'QA A — isolation fixture')
    .single();
  projectId = project!.id;

  // Fail loudly and specifically if the seed has not been run, rather than
  // reporting three mystifying assertion failures.
  const { data: seeded } = await admin
    .from('punch_list_items')
    .select('title')
    .eq('project_id', projectId)
    .like('title', 'QA D-57%');
  const found = (seeded ?? []).map((r) => r.title).sort();
  if (found.length !== 3) {
    throw new Error(
      `expected the 3 D-57 fixtures, found ${found.length} (${found.join(', ') || 'none'}). ` +
        'Run: node scripts/seed-test-identities.mjs'
    );
  }

  subClient = await sessionFor(SUB);
  for (const [role, email] of OTHERS) {
    titlesFor.set(role, await visibleTitles(await sessionFor(email)));
  }
});

describe('D-57 — what a subcontractor can SEE', () => {
  it('is a real subcontractor identity with a member row (the #127 precondition)', async () => {
    // If this fails, nothing below means anything: a profile with no member row
    // is invisible to assignee_id and the ASSIGNED arm could never match.
    const { data: role } = await subClient.rpc('get_my_role');
    const { data: memberId } = await subClient.rpc('get_my_member_id');
    expect(role).toBe('subcontractor');
    expect(memberId).toBeTruthy();
  });

  it('sees the item ASSIGNED to them', async () => {
    expect(await visibleTitles(subClient)).toContain(ASSIGNED);
  });

  it('sees the item they AUTHORED', async () => {
    expect(await visibleTitles(subClient)).toContain(AUTHORED);
  });

  it('does NOT see an item that is neither theirs to do nor theirs to have written', async () => {
    expect(await visibleTitles(subClient)).not.toContain(NEITHER);
  });

  it('sees EXACTLY those two — both arms, and nothing else on the project', async () => {
    // The whole rule in one assertion. Stated as an exact set rather than two
    // contains + one not-contains, because "exactly" is the claim.
    expect(await visibleTitles(subClient)).toEqual([ASSIGNED, AUTHORED].sort());
  });
});

describe('D-57 — the non-change half: every other role is untouched', () => {
  for (const [role] of OTHERS) {
    it(`${role} still sees all three`, () => {
      expect(titlesFor.get(role)).toEqual([ASSIGNED, AUTHORED, NEITHER].sort());
    });
  }

  it('the other five agree with each other exactly', () => {
    // A cheaper guard than five separate counts against a hard-coded number:
    // if the shared arm of the policy is edited, all five move together and
    // this still catches it via the assertion above, while THIS one catches a
    // policy that accidentally role-splits among them.
    const sets = OTHERS.map(([role]) => JSON.stringify(titlesFor.get(role)));
    expect(new Set(sets).size).toBe(1);
  });
});

describe('D-58 — SELECT and UPDATE grant the same set (A-59f)', () => {
  // The defect this guards is DRIFT: two policies that are supposed to be the
  // same predicate, edited one at a time. Asserted as an agreement rather than
  // as two independent facts, so a divergence cannot pass by halves.
  async function canRead(title: string): Promise<boolean> {
    return (await visibleTitles(subClient)).includes(title);
  }

  /** Does UPDATE reach the row? `location` is inert and not part of any rule. */
  async function canWrite(title: string): Promise<boolean> {
    const { data: target } = await admin
      .from('punch_list_items').select('id, location')
      .eq('project_id', projectId).eq('title', title).single();

    const { data, error } = await subClient
      .from('punch_list_items')
      .update({ location: `probe-${title.slice(0, 8)}` })
      .eq('id', target!.id)
      .select('id');

    // Restore, whatever happened, so the harness is re-runnable.
    await admin
      .from('punch_list_items')
      .update({ location: target!.location })
      .eq('id', target!.id);

    if (error) return false;
    return (data ?? []).length > 0; // RLS refuses by matching no rows, not by erroring
  }

  for (const title of [ASSIGNED, AUTHORED, NEITHER]) {
    it(`read and write agree on "${title.slice(0, 28)}…"`, async () => {
      expect(await canWrite(title)).toBe(await canRead(title));
    });
  }

  it('and the agreement is not vacuous — at least one is writable and one is not', async () => {
    // Guards the degenerate pass where UPDATE is refused everywhere, which
    // would satisfy "they agree" while breaking D-52's grant that subs may
    // complete their own items.
    expect(await canWrite(ASSIGNED)).toBe(true);
    expect(await canWrite(NEITHER)).toBe(false);
  });
});
