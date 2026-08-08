import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, assertRebuildTest } from './live-session';

// ============================================================================
// AWARD AUTO-ASSIGNS THE SUB. Migration 20260831000000. [S121]
// ============================================================================
//
// Every fixture here is created and destroyed by this file with the SERVICE
// ROLE, so it depends on no seeded contract and leaves nothing behind. The
// trigger is SECURITY DEFINER, so the service role exercises the same code path
// a browser insert would.
//
// ⚠️ WHAT THIS HARNESS IS SHAPED AROUND. The three rules are easy to state and
// easy to get subtly wrong in opposite directions, so each is paired:
//
//   · the trigger FIRES        — and does not fire on UPDATE (void).
//   · DO NOTHING is honoured   — a soft-deleted assignment stays deleted...
//                                ...AND a fresh pair still gets a row, or
//                                "DO NOTHING" would be indistinguishable from
//                                "the trigger is broken".
//   · nothing is duplicated    — a second contract on the same pair is a no-op
//                                rather than an error.

const STAMP = 'S121-award';

let companyId: string;
let projectId: string;
let subMemberId: string;
const madeContracts: string[] = [];

async function assignmentFor(pid: string, mid: string) {
  const { data } = await admin
    .from('project_assignments')
    .select('id, is_deleted, role_on_project')
    .eq('project_id', pid)
    .eq('member_id', mid)
    .maybeSingle();
  return data;
}

async function makeContract(status = 'draft'): Promise<string> {
  const { data, error } = await admin
    .from('subcontractor_contracts')
    .insert({
      company_id: companyId,
      project_id: projectId,
      member_id: subMemberId,
      scope_of_work: `${STAMP} fixture`,
      contract_value: 1000,
      status,
    })
    .select('id')
    .single();
  if (error) throw new Error(`makeContract: ${error.message}`);
  madeContracts.push(data.id);
  return data.id;
}

beforeAll(async () => {
  assertRebuildTest();

  // A project with NO subcontractor assignments, so the trigger's effect is
  // unambiguous. Picked rather than created: creating a project would drag in
  // the whole conversion path.
  const { data: projects } = await admin
    .from('projects')
    .select('id, company_id')
    .eq('is_deleted', false);
  const { data: members } = await admin
    .from('company_members')
    .select('id, company_id, member_type, display_name')
    .eq('member_type', 'subcontractor')
    .eq('is_deleted', false);
  const { data: assigns } = await admin
    .from('project_assignments')
    .select('project_id, member_id');

  const taken = new Set((assigns ?? []).map((a) => `${a.project_id}|${a.member_id}`));
  const { data: contracts } = await admin
    .from('subcontractor_contracts')
    .select('project_id, member_id');
  const contracted = new Set((contracts ?? []).map((c) => `${c.project_id}|${c.member_id}`));

  // A pair with neither an assignment nor an existing contract.
  outer: for (const p of projects ?? []) {
    for (const m of members ?? []) {
      if (m.company_id !== p.company_id) continue;
      const key = `${p.id}|${m.id}`;
      if (taken.has(key) || contracted.has(key)) continue;
      projectId = p.id;
      companyId = p.company_id;
      subMemberId = m.id;
      break outer;
    }
  }
  expect(projectId, 'no clean (project, sub) pair available for the fixture').toBeTruthy();
}, 240_000);

afterAll(async () => {
  if (madeContracts.length) {
    await admin.from('subcontractor_contracts').delete().in('id', madeContracts);
  }
  if (projectId && subMemberId) {
    await admin
      .from('project_assignments')
      .delete()
      .eq('project_id', projectId)
      .eq('member_id', subMemberId);
  }
});

describe('awarding a subcontract assigns the sub', () => {
  it('a fresh contract creates the assignment row', async () => {
    expect(await assignmentFor(projectId, subMemberId), 'the pair was already assigned').toBeNull();

    await makeContract('draft');

    const row = await assignmentFor(projectId, subMemberId);
    expect(row, 'the trigger did not create an assignment').not.toBeNull();
    expect(row!.is_deleted).toBe(false);
    expect(row!.role_on_project).toBe('subcontractor');
  });

  it('a SECOND contract on the same pair is a no-op, not an error', async () => {
    const before = await assignmentFor(projectId, subMemberId);
    await makeContract('draft');
    const after = await assignmentFor(projectId, subMemberId);
    // Same row, not a duplicate and not a rewrite — UNIQUE (project_id,
    // member_id) plus ON CONFLICT DO NOTHING.
    expect(after!.id).toBe(before!.id);
  });

  it('⚠️ VOIDING DOES NOT UNASSIGN — there is no UPDATE trigger, by ruling', async () => {
    const id = madeContracts[0];
    const { error } = await admin
      .from('subcontractor_contracts')
      .update({ status: 'void' })
      .eq('id', id);
    expect(error).toBeNull();

    const row = await assignmentFor(projectId, subMemberId);
    expect(row, 'voiding a contract removed the assignment').not.toBeNull();
    expect(row!.is_deleted, 'voiding a contract soft-deleted the assignment').toBe(false);
  });

  it('⚠️ A MANUAL REMOVAL BEATS A LATER AWARD — DO NOTHING leaves it deleted', async () => {
    // The half that pins ON CONFLICT DO NOTHING against DO UPDATE. A build that
    // resurrected the row would silently reverse a removal an owner performed.
    await admin
      .from('project_assignments')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('member_id', subMemberId);

    await makeContract('draft');

    const row = await assignmentFor(projectId, subMemberId);
    expect(row, 'the row vanished entirely').not.toBeNull();
    expect(
      row!.is_deleted,
      'a new award resurrected an assignment that had been removed by hand'
    ).toBe(true);
  });
});
