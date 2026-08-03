/**
 * S97CT-IMMUTABILITY — a budget line is never removed. [S97]
 *
 * RUN: cd apps/web && npx vitest run --config test/live.vitest.config.ts s97ct-budget-immutability
 *
 * WHY THIS EXISTS. The rule "a budget line is never removed once created,
 * corrections go through a negative CO" was true but UNGUARDED. It held because
 * nobody ever authored an UPDATE or DELETE policy on project_budget_items — an
 * absence, not a decision anything recorded. A future migration adding a
 * routine update policy would have opened both soft-delete and hard-delete and
 * broken nothing visible.
 *
 * Two halves, asserted separately because they are not equally strong:
 *
 *   1  THE POLICY SET (tests 1-4). Fragile: one CREATE POLICY undoes it.
 *      Test 1 pins the exact set. Tests 2-4 assert the EFFECT independently, so
 *      the guard survives even if someone deletes test 1.
 *
 *   2  THE FK (test 5). Load-bearing and robust — a CHARGED line cannot be
 *      deleted by anyone, service role included. Nothing proved this before.
 *
 * Test 6 pins the capability that must SURVIVE: an UNCHARGED line is still
 * deletable by the service role, because every other live harness relies on
 * exactly that to clean up after itself. If test 6 fails, the other harnesses
 * are about to start leaking rows.
 *
 * NOTE ON TESTS 2-4: with no UPDATE/DELETE policy, RLS does not raise — the
 * statement simply matches zero rows and returns success. So these assert the
 * ROW IS UNCHANGED afterwards, read back through the service role. Asserting
 * "an error came back" would be wrong and would fail for the wrong reason.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARKER = 'S97IMMUT';

const EMAILS = {
  owner: 'josh+test50@worthprop.com',
  admin: 'josh+qa-admin@worthprop.com',
  project_manager: 'josh+pm@worthprop.com',
} as const;

type Role = keyof typeof EMAILS;

/** The policy set this table is allowed to have. Changing this list is a
 *  deliberate act — read the comment on project_budget_items first. */
const EXPECTED_POLICIES = [
  { policy_name: 'project_budget_items_insert_admin', policy_cmd: 'INSERT' },
  { policy_name: 'project_budget_items_select_visible', policy_cmd: 'SELECT' },
] as const;

const WHY = `
project_budget_items must carry EXACTLY these policies and no others:
  project_budget_items_select_visible  (SELECT)
  project_budget_items_insert_admin    (INSERT, Owner/Admin)

THE ABSENCE OF UPDATE AND DELETE IS DELIBERATE — it IS the immutability rule.
A budget line is never removed once created; a correction is a NEGATIVE CHANGE
ORDER (apply_change_order_budget), never an edit or a delete of this row.

Adding an UPDATE policy also makes is_deleted writable, which hands every Owner
a soft-delete the design does not have — and a soft-deleted line disappears from
every reader while its project_budget_amounts row survives, because that row
cascades only on a HARD delete.

If you added a policy on purpose, you are changing the data model, not fixing a
test. See the comment on the table (migration 20260818000000) first.`;

let companyId: string;
let ownerMemberId: string;
let contactId: string;
let projectId: string;
/** Charged: has an expense_allocation. Must be undeletable by anyone. */
let chargedItemId: string;
/** Uncharged: no allocation. Must stay deletable by the service role. */
let spareItemId: string;
/** The row tests 2-4 try to mutate and must fail to. */
let victimItemId: string;
let expenseId: string;
let allocationId: string;
const sessions: Record<Role, SupabaseClient> = {} as Record<Role, SupabaseClient>;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

/** One budget line plus its amounts row, the way every writer makes them. */
async function line(description: string, budgeted: number): Promise<string> {
  const { data, error } = await admin
    .from('project_budget_items')
    .insert({
      company_id: companyId,
      project_id: projectId,
      description,
      actual_amount: 0,
      committed_amount: 0,
    })
    .select('id')
    .single();
  must(`budget line ${description}`, error);

  must(
    `budget amount ${description}`,
    (
      await admin.from('project_budget_amounts').insert({
        company_id: companyId,
        budget_item_id: data!.id,
        budgeted_amount: budgeted,
      })
    ).error
  );
  return data!.id;
}

beforeAll(async () => {
  assertRebuildTest();

  const { data: company } = await admin
    .from('companies')
    .select('id')
    .eq('name', 'Bishop Contracting')
    .single();
  companyId = company!.id;

  const { data: ownerProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', EMAILS.owner)
    .single();
  const { data: ownerMember } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', ownerProfile!.id)
    .single();
  ownerMemberId = ownerMember!.id;

  for (const [role, email] of Object.entries(EMAILS) as [Role, string][]) {
    sessions[role] = await sessionFor(email);
  }

  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      contact_type: 'client',
      first_name: MARKER,
      last_name: 'Client',
      email: `${MARKER.toLowerCase()}@example.invalid`,
    })
    .select('id')
    .single();
  must('contact', cErr);
  contactId = contact!.id;

  const { data: counters } = await admin
    .from('companies')
    .select('estimate_number_sequence, project_internal_sequence')
    .eq('id', companyId)
    .single();
  const seq = counters!.estimate_number_sequence + 1;
  const internal = counters!.project_internal_sequence + 1;

  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      name: `${MARKER} — budget line immutability`,
      contact_id: contactId,
      project_type: 'fixed_price',
      project_number: `PRJ-${String(seq).padStart(3, '0')}`,
      project_internal_seq: internal,
    })
    .select('id')
    .single();
  must('project', pErr);
  projectId = project!.id;
  must(
    'counters',
    (
      await admin
        .from('companies')
        .update({ estimate_number_sequence: seq, project_internal_sequence: internal })
        .eq('id', companyId)
    ).error
  );

  // The PM must REACH the job, so a refusal in tests 2-4 is attributable to the
  // missing policy and not to project visibility.
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', 'josh+pm@worthprop.com')
    .single();
  const { data: member } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', profile!.id)
    .single();
  must(
    'pm assignment',
    (
      await admin
        .from('project_assignments')
        .insert({ company_id: companyId, project_id: projectId, member_id: member!.id })
    ).error
  );

  victimItemId = await line(`${MARKER} victim`, 1000);
  chargedItemId = await line(`${MARKER} charged`, 2000);
  spareItemId = await line(`${MARKER} spare`, 0);

  // Charge the charged line — one approved expense with one allocation.
  const { data: expense, error: eErr } = await admin
    .from('expenses')
    .insert({
      company_id: companyId,
      project_id: projectId,
      author_member_id: ownerMemberId,
      supplier: `${MARKER} supplier`,
      expense_date: '2026-08-01',
      amount: 500,
      cost_category: 'material',
      state: 'actual',
      status: 'approved',
    })
    .select('id')
    .single();
  must('expense', eErr);
  expenseId = expense!.id;

  const { data: allocation, error: aErr } = await admin
    .from('expense_allocations')
    .insert({
      company_id: companyId,
      expense_id: expenseId,
      budget_item_id: chargedItemId,
      amount: 500,
    })
    .select('id')
    .single();
  must('allocation', aErr);
  allocationId = allocation!.id;
}, 240_000);

// ════════════════════════════════════════════════════════════════════════════
describe('S97CT-IMMUTABILITY — the policy set is pinned', () => {
  it('1. project_budget_items carries EXACTLY the SELECT and INSERT policies', async () => {
    const { data, error } = await admin.rpc('budget_line_policy_digest');
    expect(
      error,
      'budget_line_policy_digest() is missing — migration 20260818000000 did not apply'
    ).toBeNull();

    const actual = (data ?? []).map((r: { policy_name: string; policy_cmd: string }) => ({
      policy_name: r.policy_name,
      policy_cmd: r.policy_cmd,
    }));

    expect(actual, WHY).toEqual([...EXPECTED_POLICIES]);

    // Stated separately so the failure names the verb that appeared.
    for (const row of actual) {
      expect(
        ['SELECT', 'INSERT'],
        `a ${row.policy_cmd} policy (${row.policy_name}) now exists on project_budget_items.${WHY}`
      ).toContain(row.policy_cmd);
    }
  });
});

describe('S97CT-IMMUTABILITY — no authenticated role can mutate a line', () => {
  // Independent of test 1: these hold even if the digest function is removed.
  for (const role of Object.keys(EMAILS) as Role[]) {
    it(`2-${role}. cannot UPDATE a budget line`, async () => {
      await sessions[role]
        .from('project_budget_items')
        .update({ description: `${MARKER} HACKED by ${role}` })
        .eq('id', victimItemId);

      const { data } = await admin
        .from('project_budget_items')
        .select('description')
        .eq('id', victimItemId)
        .single();
      expect(
        data?.description,
        `${role} EDITED a budget line — an UPDATE policy was added.${WHY}`
      ).toBe(`${MARKER} victim`);
    });

    it(`3-${role}. cannot DELETE a budget line`, async () => {
      await sessions[role].from('project_budget_items').delete().eq('id', victimItemId);

      const { count } = await admin
        .from('project_budget_items')
        .select('id', { count: 'exact', head: true })
        .eq('id', victimItemId);
      expect(count, `${role} DELETED a budget line — a DELETE policy was added.${WHY}`).toBe(1);
    });

    it(`4-${role}. cannot SOFT-delete a budget line`, async () => {
      // The subtler half: is_deleted is filtered by every reader, so setting it
      // hides the line everywhere while its amounts row survives (that cascades
      // only on a HARD delete). An UPDATE policy would open this door too.
      await sessions[role]
        .from('project_budget_items')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', victimItemId);

      const { data } = await admin
        .from('project_budget_items')
        .select('is_deleted, deleted_at')
        .eq('id', victimItemId)
        .single();
      expect(
        data?.is_deleted,
        `${role} SOFT-DELETED a budget line — is_deleted became writable.${WHY}`
      ).toBe(false);
      expect(data?.deleted_at).toBeNull();
    });
  }
});

describe('S97CT-IMMUTABILITY — a CHARGED line is undeletable by anyone', () => {
  it('5. the service role itself is refused — expense_allocations FK is NO ACTION', async () => {
    // The load-bearing half. Not RLS: the service role bypasses RLS entirely,
    // so this is the FK and nothing else.
    const { error } = await admin
      .from('project_budget_items')
      .delete()
      .eq('id', chargedItemId);

    expect(
      error,
      'A CHARGED budget line was DELETED. expense_allocations_budget_item_id_fkey ' +
        'is no longer ON DELETE NO ACTION — real cost allocations, and the ' +
        'invoice_cost_claims that reference them, can now be erased with a line.'
    ).not.toBeNull();
    expect(error!.code, `expected FK violation 23503, got ${error!.code}`).toBe('23503');

    const { count } = await admin
      .from('project_budget_items')
      .select('id', { count: 'exact', head: true })
      .eq('id', chargedItemId);
    expect(count, 'the charged line survived the refused delete').toBe(1);
  });

  it('5-i. the allocation and its amounts row are both intact after the refusal', async () => {
    const { count: allocCount } = await admin
      .from('expense_allocations')
      .select('id', { count: 'exact', head: true })
      .eq('id', allocationId);
    expect(allocCount, 'the allocation was destroyed by a delete that should have failed').toBe(1);

    const { count: amtCount } = await admin
      .from('project_budget_amounts')
      .select('id', { count: 'exact', head: true })
      .eq('budget_item_id', chargedItemId);
    expect(amtCount, 'the amounts row was cascaded away by a refused delete').toBe(1);
  });
});

describe('S97CT-IMMUTABILITY — the harness cleanup capability survives', () => {
  it('6. an UNCHARGED line is still deletable by the service role, and cascades', async () => {
    // Every other live harness deletes the budget lines it creates. If this
    // fails, s97ct-roles / -budget-writers / -budget-floor / -derivation are
    // about to start leaking rows into rebuild-test.
    const { error } = await admin.from('project_budget_items').delete().eq('id', spareItemId);
    expect(
      error,
      'an UNCHARGED budget line can no longer be deleted by the service role — ' +
        'the four other live harnesses can no longer clean up after themselves'
    ).toBeNull();

    const { count: itemCount } = await admin
      .from('project_budget_items')
      .select('id', { count: 'exact', head: true })
      .eq('id', spareItemId);
    expect(itemCount).toBe(0);

    // ON DELETE CASCADE on project_budget_amounts.budget_item_id — no orphan.
    const { count: amtCount } = await admin
      .from('project_budget_amounts')
      .select('id', { count: 'exact', head: true })
      .eq('budget_item_id', spareItemId);
    expect(amtCount, 'the amounts row was orphaned — the FK is no longer CASCADE').toBe(0);
  });
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  // Order matters: the allocation must go before the line it charges, which is
  // the very rule this harness proves.
  if (allocationId) {
    check('allocation', (await admin.from('expense_allocations').delete().eq('id', allocationId)).error);
  }
  if (expenseId) {
    check('expense', (await admin.from('expenses').delete().eq('id', expenseId)).error);
  }
  // spareItemId is included even though test 6 deletes it: if the suite aborts
  // before test 6 runs, leaving it behind blocks the project delete and leaks
  // the whole fixture. Deleting an already-gone row is a no-op.
  const remaining = [victimItemId, chargedItemId, spareItemId].filter(Boolean);
  if (remaining.length) {
    check(
      'amounts',
      (await admin.from('project_budget_amounts').delete().in('budget_item_id', remaining)).error
    );
    check('items', (await admin.from('project_budget_items').delete().in('id', remaining)).error);
  }
  if (projectId) {
    check(
      'assignments',
      (await admin.from('project_assignments').delete().eq('project_id', projectId)).error
    );
    check('project', (await admin.from('projects').delete().eq('id', projectId)).error);
  }
  if (contactId) check('contact', (await admin.from('contacts').delete().eq('id', contactId)).error);

  const { count } = await admin
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER}%`);
  console.log(
    `\n[${MARKER} TEARDOWN] rows left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`
  );
}, 180_000);
