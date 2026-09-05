import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { withMemberNames } from '@/lib/services/punch';
import { adminMemberNameResolver } from '@/lib/services/member-names';

// ============================================================================
// RULING B's PUNCH CONSEQUENCE, CLOSED — S131.
// ============================================================================
//
// Ruling B floors `company_members`: a subcontractor reads their own row and
// Owner/Admin/PM, and 39 of 46 rows on rebuild-test have no account at all. The
// three embedded joins in `punch.ts` ran as the CALLER, so a sub kept the item
// and lost the name. Measured before the fix: 2 items visible, 2 with an
// assignee, ONE assignee row readable — the invisible one being the item the
// sub AUTHORED and assigned to a crew member.
//
// ⚠️ WHY THIS DRIVES THE TWO STEPS RATHER THAN CALLING `getPunchLists()`.
// That function builds its own request-scoped client through `cookies()` and
// throws outside a request — the exact trap `lib/chat/photos.ts` documents
// after `withPhotos` was caught half-using its client. So this reads the rows
// AS THE SUB (which is the RLS half, D-57 deciding what is visible) and then
// decorates them with the REAL resolver the service defaults to. Same two
// steps, same order, same code.

const SUB = 'josh+qa-sub@worthprop.com';
const ASSIGNED = 'QA D-57 ASSIGNED to the sub';
const AUTHORED = 'QA D-57 AUTHORED by the sub';

interface RawItem {
  id: string;
  title: string;
  assignee_id: string | null;
  completed_by: string | null;
  verified_by: string | null;
  status: string;
  priority: string | null;
}

let subC: SupabaseClient;
let rows: RawItem[];

beforeAll(async () => {
  assertRebuildTest();
  subC = await sessionFor(SUB);

  // GUARD THE FIXTURE. These three rows are seeded, not created here (s113
  // relies on the same ones). Without this a green run could mean "the sub sees
  // no items", which would pass every assertion below by having nothing to name.
  const { data: seeded } = await admin
    .from('punch_list_items')
    .select('title')
    .like('title', 'QA D-57%');
  if ((seeded ?? []).length !== 3) {
    throw new Error(
      `expected the 3 D-57 fixtures, found ${(seeded ?? []).length}. ` +
        'Run scripts/seed-test-identities.mjs.'
    );
  }

  const { data, error } = await subC
    .from('punch_list_items')
    .select('id, title, assignee_id, completed_by, verified_by, status, priority')
    .like('title', 'QA D-57%');
  if (error) throw new Error(`sub read: ${error.message}`);
  rows = (data ?? []) as RawItem[];
});

describe('the RLS half is unchanged — D-57 still decides what is visible', () => {
  it('the sub sees the two that are theirs, and not the third', async () => {
    const titles = rows.map((r) => r.title).sort();
    expect(titles).toEqual([ASSIGNED, AUTHORED].sort());
  });
});

describe('⚠️ the floor is INTACT — the name cannot be coming from the caller', () => {
  it('the sub still cannot read the crew assignee\'s company_members row', async () => {
    // THE COUNTERFACTUAL. If the sub could read that row, this whole suite would
    // pass on the OLD code too and prove nothing about the fix. The name must be
    // arriving despite the floor, not because the floor is leaking.
    const authored = rows.find((r) => r.title === AUTHORED)!;
    expect(authored.assignee_id, 'fixture: the authored item must be assigned').not.toBeNull();

    const { data: asSub } = await subC
      .from('company_members')
      .select('id')
      .eq('id', authored.assignee_id!);
    expect(asSub ?? [], 'Ruling B has stopped flooring company_members').toEqual([]);

    // Evaluated OUTSIDE the policy, because a zero read through a policy and a
    // row that does not exist are the same answer.
    const { data: asAdmin } = await admin
      .from('company_members')
      .select('id, display_name')
      .eq('id', authored.assignee_id!)
      .single();
    expect(asAdmin, 'the member row must really exist').not.toBeNull();
  });
});

describe('the decoration supplies every name the caller cannot see', () => {
  it('⚠️ EVERY visible item with an assignee gets a name — including the crew one', async () => {
    const decorated = await withMemberNames(
      rows as never,
      adminMemberNameResolver()
    );

    expect(decorated).toHaveLength(2);
    for (const item of decorated) {
      if (item.assignee_id) {
        expect(item.assignee, `${item.title} lost its assignee name`).not.toBeNull();
        expect(item.assignee!.display_name.length).toBeGreaterThan(0);
        expect(item.assignee!.id).toBe(item.assignee_id);
      }
    }

    // Named specifically, not just counted: this is the one that was blank.
    // The crew member's DISPLAYED name is company_members.display_name (punch.ts
    // reads that, not profiles.first/last), which the seed reconciles to
    // "QA Crew A" [S176 rename]. Was 'Casey Crew' — stale; the seed/app is the
    // source of truth for the displayed name.
    const authored = decorated.find((i) => i.title === AUTHORED)!;
    expect(authored.assignee, 'the crew-assigned item is the regression').not.toBeNull();
    expect(authored.assignee!.display_name).toBe('QA Crew A');

    // And the paired one, whose assignee IS the sub — readable either way, so it
    // is the control that shows the decorator did not simply replace everything.
    const assigned = decorated.find((i) => i.title === ASSIGNED)!;
    expect(assigned.assignee).not.toBeNull();
    expect(assigned.assignee!.display_name).not.toBe('QA Crew A');
  });

  it('an item with no assignee stays null — absent is not the same as unresolvable', async () => {
    const none: RawItem[] = [
      { ...rows[0], id: rows[0].id, assignee_id: null, completed_by: null, verified_by: null },
    ];
    const [item] = await withMemberNames(none as never, adminMemberNameResolver());
    expect(item.assignee).toBeNull();
    expect(item.completer).toBeNull();
    expect(item.verifier).toBeNull();
  });

  it('an id that resolves to nothing stays null rather than becoming an empty name', async () => {
    const ghost: RawItem[] = [
      { ...rows[0], assignee_id: '11111111-1111-1111-1111-111111111111' },
    ];
    const [item] = await withMemberNames(ghost as never, adminMemberNameResolver());
    expect(item.assignee, 'a deleted member must not render as a blank name').toBeNull();
  });
});
