/**
 * S97CT-PASSTHRU — sub-retainage pass-through default (7C/7E §4.2, S97).
 *
 * A new sub-contract inherits its project's retainage rate when the caller
 * specifies none, so the rate is typed once instead of twice.
 *
 * FAILING-THEN-PASSING: assertion 1 fails before 20260814000000 (the inherited
 * percent is NULL) and passes after.
 *
 * All fixtures are created and deleted here. No existing contract is read or
 * written — the trigger is INSERT-only and deliberately never touches one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest } from './live-session';

const MARKER = 'S97PASSTHRU';

let companyId: string;
let ownerMemberId: string;
let subMemberId: string;
let contactId: string;
/** retainage 10% */
let projectWithRetainage: string;
/** no retainage at all */
let projectWithout: string;
const contracts: string[] = [];

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function project(name: string, retainage: number | null): Promise<string> {
  const { data: counters } = await admin
    .from('companies')
    .select('estimate_number_sequence, project_internal_sequence').eq('id', companyId).single();
  const seq = counters!.estimate_number_sequence + 1;
  const internal = counters!.project_internal_sequence + 1;

  const { data, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId, name: `${MARKER} ${name}`, contact_id: contactId,
      project_type: 'fixed_price', retainage_percent: retainage,
      project_number: `PRJ-${String(seq).padStart(3, '0')}`, project_internal_seq: internal,
    })
    .select('id').single();
  must(`project ${name}`, error);

  must('counters', (await admin.from('companies').update({
    estimate_number_sequence: seq, project_internal_sequence: internal,
  }).eq('id', companyId)).error);
  return data!.id;
}

async function subContract(
  projectId: string,
  fields: Record<string, unknown>
): Promise<{ retainage_percent: number | null; retainage_shape: string | null }> {
  const { data, error } = await admin
    .from('subcontractor_contracts')
    .insert({
      company_id: companyId, project_id: projectId, member_id: subMemberId,
      scope_of_work: `${MARKER} scope`, contract_value: 5000, status: 'draft',
      ...fields,
    })
    .select('id, retainage_percent, retainage_shape').single();
  must('sub contract', error);
  contracts.push(data!.id);
  return {
    retainage_percent: data!.retainage_percent === null ? null : Number(data!.retainage_percent),
    retainage_shape: data!.retainage_shape,
  };
}

beforeAll(async () => {
  assertRebuildTest();

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Sabal Point Construction').single();
  companyId = company!.id;

  const { data: ownerProfile } = await admin
    .from('profiles').select('id').eq('email', 'josh+test50@worthprop.com').single();
  ownerMemberId = (await admin
    .from('company_members').select('id').eq('profile_id', ownerProfile!.id).single()).data!.id;
  void ownerMemberId;

  subMemberId = (await admin
    .from('company_members').select('id')
    .eq('company_id', companyId).eq('member_type', 'subcontractor').limit(1).single()).data!.id;

  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId, contact_type: 'client',
      first_name: MARKER, last_name: 'Client', email: `${MARKER.toLowerCase()}@example.invalid`,
    })
    .select('id').single();
  must('contact', cErr);
  contactId = contact!.id;

  projectWithRetainage = await project('with-retainage', 10);
  projectWithout = await project('no-retainage', null);
}, 240_000);

describe('S97CT-PASSTHRU — the rate is typed once', () => {
  it('1. a sub-contract that says nothing INHERITS the project rate', async () => {
    const row = await subContract(projectWithRetainage, {});
    expect(row.retainage_percent, 'the project rate did not pass through').toBe(10);
    // The percent alone would be inert — shape NULL means "no retainage" — so
    // the default has to carry the shape with it. PROVISIONAL: percent_across
    // mirrors the client side, where 7D withholds from EVERY invoice.
    expect(row.retainage_shape).toBe('percent_across');
  });

  it('2. an EXPLICIT rate is left exactly as given', async () => {
    const row = await subContract(projectWithRetainage, {
      retainage_percent: 5, retainage_shape: 'percent_across',
    });
    expect(row.retainage_percent).toBe(5);
    expect(row.retainage_shape).toBe('percent_across');
  });

  it('3. an explicit "no retainage" is respected — the default does not override it', async () => {
    // The caller said something (a shape), so the trigger must stand down. This
    // is the assertion that stops a convenience default from silently adding
    // withholding a user deliberately declined.
    const row = await subContract(projectWithRetainage, { retainage_shape: 'final_hold' });
    expect(row.retainage_shape).toBe('final_hold');
    expect(row.retainage_percent).toBeNull();
  });

  it('4. no retainage on the job means nothing passes through', async () => {
    const row = await subContract(projectWithout, {});
    expect(row.retainage_percent).toBeNull();
    expect(row.retainage_shape).toBeNull();
  });

  it('5. EXISTING contracts are untouched — this is INSERT-only', async () => {
    // Back-filling shipped rows would be rewriting money terms, not defaulting.
    // Josh's five NULL contracts must still be NULL.
    const { data } = await admin
      .from('subcontractor_contracts')
      .select('id, retainage_percent')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .not('id', 'in', `(${contracts.join(',')})`);
    const changed = (data ?? []).filter((c) => c.retainage_percent === 10);
    // Josh's pre-existing contracts carry 10.00 legitimately (he set them), so
    // this asserts the COUNT did not grow — the trigger added none of them.
    expect(changed.length).toBeLessThanOrEqual(4);
  });
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  if (contracts.length) {
    check('contracts', (await admin.from('subcontractor_contracts').delete().in('id', contracts)).error);
  }

  // ⚠️ CHILDREN BEFORE PARENTS [S135]. `convert_estimate_to_project()` writes
  // `project_assignments` for the converting user, so deleting the project
  // first violated `project_assignments_project_id_fkey` and this teardown
  // reported "rows left: 18" while looking like it had run. Those orphans then
  // broke `s123-assignment-routes.live.ts`, which picked "the first project in
  // the company" — a leak in one harness surfacing as a failure in another,
  // which is the whole of TECH_DEBT #149/#150.
  const projectIds = [projectWithRetainage, projectWithout].filter(Boolean) as string[];
  if (projectIds.length) {
    check(
      'assignments',
      (await admin.from('project_assignments').delete().in('project_id', projectIds)).error
    );
  }
  for (const id of [projectWithRetainage, projectWithout]) {
    if (id) check('project', (await admin.from('projects').delete().eq('id', id)).error);
  }
  if (contactId) check('contact', (await admin.from('contacts').delete().eq('id', contactId)).error);

  const { count } = await admin
    .from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  console.log(`\n[${MARKER} TEARDOWN] rows left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`);
  // ⚠️ [S168] THIS THROW IS THE POINT. The teardown has always collected
  // `errors` and only PRINTED them, so when the S168 delete boundary began
  // refusing this suite's signed change order the cleanup failed in silence,
  // the project FK-blocked behind it, and the NEXT run died on a duplicate
  // `co_number` in `beforeAll` — a failure reported by a different suite, one
  // run later, with no trace of the cause. A cleanup that cannot fail its own
  // run is not a cleanup.
  if (errors.length) throw new Error(`[${MARKER}] teardown failed: ${JSON.stringify(errors)}`);
}, 180_000);
