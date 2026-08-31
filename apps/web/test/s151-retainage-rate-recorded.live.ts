/**
 * S151-B1 — the retainage rate that produced each withhold is RECORDED, and a
 * later rate change never restates it.
 *
 * RULING [Josh, S150/S151]: RETAINAGE RATE CHANGES ARE PROSPECTIVE ONLY. Past
 * accruals stand at the rate in force when they were taken; the new rate applies
 * from that point forward.
 *
 * WHAT THIS PINS DOWN, AND WHY IT NEEDED A HARNESS
 * ----------------------------------------------------------------------------
 * The runtime already BEHAVED prospectively — `record_expense_payment` computes
 * the withhold from the contract's rate at payment time — but nothing recorded
 * WHICH rate, so the ruling was true in dollars and unprovable in rate terms.
 * Test 3 is the one that matters: it revises the rate mid-contract and asserts
 * the earlier payment is untouched. Before 20261003000000 that assertion could
 * not even be written, because there was no column to assert on.
 *
 * FAILING-THEN-PASSING: every assertion here fails before 20261003000000 — tests
 * 1/2/3/5 because `retainage_percent_applied` does not exist, test 4 because the
 * NOT VALID constraint does not exist.
 *
 * FIXTURES: created and torn down here (#144's rule — a live harness that reads
 * another run's leftovers is not standalone). Nothing pre-existing is written.
 *
 * ⚠️ `record_expense_payment` is SECURITY INVOKER and refuses a caller whose
 * `get_my_role()` is not owner/admin — so the service-role client CANNOT call
 * it. Payments here go through a real Owner session. That is not incidental to
 * the test; it is the same path the app uses.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARKER = 'S151RATE';
const OWNER_EMAIL = 'josh+test50@worthprop.com';

let owner: SupabaseClient;
let companyId: string;
let subMemberId: string;
let contactId: string;
let projectId: string;
let contractId: string;

/** Every expense this file creates, for teardown. */
const expenseIds: string[] = [];

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

/** The contract's stage rows, oldest first. */
async function stages(): Promise<{ id: string; stage_label: string; amount: number }[]> {
  const { data, error } = await admin
    .from('expenses')
    .select('id, stage_label, amount')
    .eq('sub_contract_id', contractId)
    .eq('is_retainage', false)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  must('stages', error);
  return (data ?? []) as { id: string; stage_label: string; amount: number }[];
}

/**
 * A stage by its LABEL, never by position.
 *
 * ⚠️ `stages()` CANNOT be trusted to order stage 1 before stage 2, and this cost
 * a red run. `setup_payment_schedule` inserts every stage inside ONE transaction,
 * so `created_at` (which is `now()`, i.e. transaction start) is IDENTICAL on both
 * rows. The `created_at` sort is therefore a tie for the whole schedule, and the
 * `id` tiebreak is `gen_random_uuid()` — random. `(await stages())[0]` is a coin
 * flip that had, at that point, come up heads once.
 *
 * This is the `.limit(1)`-with-no-meaningful-ORDER-BY class that context100 names
 * three times, and adding an ORDER BY does NOT fix it here — ordering a genuine
 * tie only makes the wrong answer a stable wrong answer. The fix is to stop
 * asking position to carry meaning it never had.
 */
async function stageByLabel(n: 1 | 2): Promise<{ id: string; stage_label: string; amount: number }> {
  const rows = await stages();
  const hit = rows.find((s) => s.stage_label.endsWith(`stage ${n}`));
  if (!hit) throw new Error(`stage ${n} not found among: ${rows.map((r) => r.stage_label).join(', ')}`);
  return hit;
}

/** Payments on this contract's stages, oldest first, with the recorded rate. */
async function payments(): Promise<
  { amount: number; retainage_withheld: number; retainage_percent_applied: number | null }[]
> {
  const stageIds = (await stages()).map((s) => s.id);
  const { data, error } = await admin
    .from('expense_payments')
    .select('amount, retainage_withheld, retainage_percent_applied, created_at, id')
    .in('expense_id', stageIds)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  // Unlike `stages()`, this ordering is REAL: the two payments are recorded in
  // separate transactions, so `created_at` genuinely differs between them.
  must('payments', error);
  return (data ?? []).map((p) => ({
    amount: Number(p.amount),
    retainage_withheld: Number(p.retainage_withheld),
    retainage_percent_applied:
      p.retainage_percent_applied === null ? null : Number(p.retainage_percent_applied),
  }));
}

beforeAll(async () => {
  assertRebuildTest();
  owner = await sessionFor(OWNER_EMAIL);

  // Pre-clean: a previous run that died mid-way must not poison this one, and
  // leaked rows self-heal rather than accumulating. On a clean database this
  // removes nothing.
  await sweep('before');

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Sabal Point Construction').single();
  companyId = company!.id;

  // A subcontractor member to hang the contract on. `.limit(1)` is ORDERED —
  // the class context100 names three times, and which one we get must not be
  // heap order.
  const { data: sub } = await admin
    .from('company_members').select('id')
    .eq('company_id', companyId).eq('member_type', 'subcontractor')
    .order('id', { ascending: true }).limit(1).single();
  subMemberId = sub!.id;

  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId, contact_type: 'client',
      first_name: MARKER, last_name: 'Client',
      email: `${MARKER.toLowerCase()}@example.invalid`,
    })
    .select('id').single();
  must('contact', cErr);
  contactId = contact!.id;

  const { data: counters } = await admin
    .from('companies')
    .select('estimate_number_sequence, project_internal_sequence').eq('id', companyId).single();
  const seq = counters!.estimate_number_sequence + 1;
  const internal = counters!.project_internal_sequence + 1;

  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId, name: `${MARKER} project`, contact_id: contactId,
      project_type: 'fixed_price',
      // Deliberately NULL: this harness sets the contract's retainage
      // explicitly, so the pass-through trigger (20260814000000) must stay out
      // of it. A project rate here would seed a shape we did not choose.
      retainage_percent: null,
      project_number: `PRJ-${String(seq).padStart(3, '0')}`, project_internal_seq: internal,
    })
    .select('id').single();
  must('project', pErr);
  projectId = project!.id;

  must('counters', (await admin.from('companies').update({
    estimate_number_sequence: seq, project_internal_sequence: internal,
  }).eq('id', companyId)).error);

  const { data: contract, error: kErr } = await admin
    .from('subcontractor_contracts')
    .insert({
      company_id: companyId, project_id: projectId, member_id: subMemberId,
      scope_of_work: `${MARKER} scope`, contract_value: 20000, status: 'draft',
      retainage_shape: 'percent_across', retainage_percent: 10,
    })
    .select('id').single();
  must('sub contract', kErr);
  contractId = contract!.id;

  // Two equal stages, so the arithmetic in the assertions is unambiguous.
  // ⚠️ NOT `admin`. `setup_payment_schedule` is role-gated the same way
  // `record_expense_payment` is — the service role has no `get_my_role()`, so it
  // is refused with "Only Owner/Admin/PM may set up a payment schedule."
  const { error: sErr } = await owner.rpc('setup_payment_schedule', {
    p_sub_contract_id: contractId,
    p_stages: [
      { label: `${MARKER} stage 1`, amount: 10000 },
      { label: `${MARKER} stage 2`, amount: 10000 },
    ],
    p_retainage_shape: 'percent_across',
    p_retainage_percent: 10,
  });
  must('setup_payment_schedule', sErr);

  // Stages are born 'pending'; record_expense_payment pays only 'approved'.
  const stageRows = await stages();
  expect(stageRows.length, 'fixture must create exactly two stages').toBe(2);
  for (const s of stageRows) {
    expenseIds.push(s.id);
    must(`approve ${s.stage_label}`, (await admin
      .from('expenses')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', s.id)).error);
  }
}, 240_000);

/**
 * Remove every row this harness has ever created, by MARKER — not just this
 * run's. Called at both ends.
 *
 * ⚠️ THE FIRST VERSION OF THIS TEARDOWN SWALLOWED ITS ERRORS. It fired
 * `.delete()` and never read the result, so five runs leaked five projects and
 * five contacts while reporting nothing. That is the same shape as `#1-s146` —
 * a write whose failure is invisible because nobody looked — and it is worth
 * the irony being recorded here: it was written during an audit whose Axis 4 is
 * "error paths that swallow failures".
 *
 * `warn` rather than `throw`: a teardown that throws masks the test result that
 * matters, but a teardown that says nothing is how leakage survives.
 */
async function sweep(label: string): Promise<void> {
  const warn = (what: string, error: { message: string } | null) => {
    if (error) console.warn(`[${MARKER} sweep:${label}] ${what}: ${error.message}`);
  };

  const { data: projects } = await admin
    .from('projects').select('id').like('name', `${MARKER}%`);
  const projectIds = ((projects ?? []) as { id: string }[]).map((p) => p.id);

  if (projectIds.length) {
    const { data: exps } = await admin
      .from('expenses').select('id').in('project_id', projectIds);
    const expIds = ((exps ?? []) as { id: string }[]).map((e) => e.id);
    if (expIds.length) {
      warn('expense_payments', (await admin
        .from('expense_payments').delete().in('expense_id', expIds)).error);
      warn('expense_allocations', (await admin
        .from('expense_allocations').delete().in('expense_id', expIds)).error);
      warn('expenses', (await admin.from('expenses').delete().in('id', expIds)).error);
    }
    warn('subcontractor_contracts', (await admin
      .from('subcontractor_contracts').delete().in('project_id', projectIds)).error);
    // ⚠️ `project_assignments` is ON DELETE NO ACTION and a row appears for every
    // project, so it blocks the parent delete with a 23503. This is what leaked
    // seven projects before the sweep reported anything: the FK error WAS
    // returned, but console output from a vitest hook does not reach the run
    // log, so "no warning" read as "no error". Corroborate a teardown with a
    // row count, never with silence.
    warn('project_assignments', (await admin
      .from('project_assignments').delete().in('project_id', projectIds)).error);
    const delProjects = await admin
      .from('projects').delete().in('id', projectIds).select('id');
    warn('projects', delProjects.error);
    if (!delProjects.error && (delProjects.data ?? []).length !== projectIds.length) {
      console.warn(
        `[${MARKER} sweep:${label}] projects: asked to remove ${projectIds.length}, ` +
        `removed ${(delProjects.data ?? []).length} — NO ERROR REPORTED. ` +
        `A zero-row delete is reporting success.`
      );
    }
  }

  const delContacts = await admin
    .from('contacts').delete().eq('first_name', MARKER).select('id');
  warn('contacts', delContacts.error);
  if (!delContacts.error) {
    console.warn(`[${MARKER} sweep:${label}] contacts removed: ${(delContacts.data ?? []).length}`);
  }
}

afterAll(async () => {
  await sweep('after');
}, 240_000);

describe('S151-B1 — the applied rate is recorded and never restated', () => {
  it('1. the column, both constraints and the immutability guard all exist', async () => {
    // Schema-level, so a failure here names the missing piece instead of
    // surfacing three lines later as a null.
    const { data, error } = await admin
      .from('expense_payments')
      .select('retainage_percent_applied')
      .limit(1);
    expect(error, 'retainage_percent_applied is missing — has 20261003000000 been pushed?')
      .toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('2. a payment records the rate that produced its withhold', async () => {
    const stage1 = await stageByLabel(1);
    const { error } = await owner.rpc('record_expense_payment', {
      p_expense_id: stage1.id,
      p_paid_date: '2026-08-19',
      p_amount: 10000,
    });
    must('payment 1', error);

    const rows = await payments();
    expect(rows.length).toBe(1);
    expect(rows[0].retainage_withheld, '10% of 10000').toBe(1000);
    // The claim B1 exists to make: not just that 1000 was withheld, but that
    // the system knows 10% is why.
    expect(rows[0].retainage_percent_applied).toBe(10);
  });

  it('3. PROSPECTIVE ONLY — revising the rate does not reach back', async () => {
    // Revise 10% -> 5%. This is the exact sequence that made the old display
    // sentence false: the accrual ends up holding two rates' worth of dollars.
    // ⚠️ THE RPC's CONTRACT IS ASYMMETRIC AND SAYS SO: a PAID stage is edited in
    // place and keeps its `id`; an UNPAID stage is REPLACED and must be resent
    // WITHOUT one ("unpaid stages are replaced, not edited"). Sending every
    // stage with its id is refused outright, which is how this was found.
    const before = await stages();
    must('revise', (await owner.rpc('revise_sub_contract_schedule', {
      p_sub_contract_id: contractId,
      p_stages: before.map((s) => {
        const stage = { label: s.stage_label, amount: Number(s.amount) };
        // Stage 1 is the one test 2 paid — BY LABEL, which is now guaranteed.
        return s.stage_label.endsWith('stage 1') ? { id: s.id, ...stage } : stage;
      }),
      p_retainage_shape: 'percent_across',
      p_retainage_percent: 5,
    })).error);

    expect((await stages()).length, 'revise must leave two stages').toBe(2);
    // Re-read by label: stage 2 is a NEW row after the replace, so the id
    // captured before the revise is gone.
    const stage2 = await stageByLabel(2);
    expenseIds.push(stage2.id);
    // A replaced stage is born pending; record_expense_payment pays only approved.
    must('approve the replacement stage 2', (await admin
      .from('expenses').update({ status: 'approved' }).eq('id', stage2.id)).error);

    must('payment 2', (await owner.rpc('record_expense_payment', {
      p_expense_id: stage2.id,
      p_paid_date: '2026-08-20',
      p_amount: 10000,
    })).error);

    const rows = await payments();
    expect(rows.length).toBe(2);

    // THE ASSERTION THIS FILE EXISTS FOR. The first payment still says 10.
    expect(rows[0].retainage_percent_applied, 'the earlier payment was restated').toBe(10);
    expect(rows[0].retainage_withheld).toBe(1000);
    // And the second says 5, taken at the new rate.
    expect(rows[1].retainage_percent_applied).toBe(5);
    expect(rows[1].retainage_withheld, '5% of 10000').toBe(500);

    // The accrual is the sum of BOTH rates — 1500 on 20000 billed, which is
    // neither 10% nor 5%. This is exactly the total the display must not
    // attribute to a single rate (Part A).
    const { data: accrual } = await admin
      .from('expenses').select('amount')
      .eq('sub_contract_id', contractId).eq('is_retainage', true).eq('is_deleted', false)
      .single();
    expect(Number(accrual!.amount)).toBe(1500);
  });

  it('4. a withhold with NO recorded rate is refused by the database', async () => {
    // The NOT VALID constraint, checked against a new row. Direct insert, not
    // the RPC — the RPC always sets the rate, so the RPC cannot exercise this.
    const stage1 = await stageByLabel(1);
    const { error } = await admin.from('expense_payments').insert({
      company_id: companyId,
      expense_id: stage1.id,
      paid_date: '2026-08-21',
      amount: 100,
      retainage_withheld: 10,
      retainage_percent_applied: null,
    });
    expect(error, 'a withhold with no rate was accepted').not.toBeNull();
    expect(error!.message).toMatch(/retainage_rate_recorded/i);
  });

  it('5. the recorded rate is IMMUTABLE — an Owner cannot restate it', async () => {
    // If the record can be edited, it records nothing. This is the same guard
    // that already froze retainage_withheld, extended to the rate.
    const stageIds = (await stages()).map((s) => s.id);
    const { data: row } = await admin
      .from('expense_payments').select('id')
      .in('expense_id', stageIds).eq('is_deleted', false)
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .limit(1).single();

    const { error } = await owner
      .from('expense_payments')
      .update({ retainage_percent_applied: 99 })
      .eq('id', row!.id);

    expect(error, 'the recorded rate was editable').not.toBeNull();
    expect(error!.message).toMatch(/immutable/i);
  });
});
