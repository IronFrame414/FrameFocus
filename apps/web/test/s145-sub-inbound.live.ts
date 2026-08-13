import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S145 — 7F §12 sub-inbound, driven against RLS as real users.
//
// Migration: 20260925000000_7f_sub_inbound.sql
// Rulings:   (i) upload-back · (ii) completion→CONDITIONAL, payment→UNCONDITIONAL
//            (iii) Owner/Admin · (iv) own template rows · B1(b) explicit
//            completed_at · B2 completion→sub_contract_id, payment→expense_id
// ============================================================================
//
// ⚠️ ROLE WRITES RUN AS REAL USERS. `admin` (service role) only seeds and
// evaluates counterfactuals OUTSIDE the guard under test.
//
// ⚠️ WHAT IS NOT ASSERTED HERE, AND WHY. There is no tokenised sub-signing
// route to probe: ruling (i) is upload-back, and §6.5's tokenised path is the
// one part of this area still behind Gate 1. Its absence is the design.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN_USER = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';

let ownerC: SupabaseClient;
let adminC: SupabaseClient;
let pmC: SupabaseClient;

let companyId = '';
let subContractId = '';
let expenseId = '';
let subTemplateId = '';
const madeReleases: string[] = [];

beforeAll(async () => {
  assertRebuildTest();
  [ownerC, adminC, pmC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(ADMIN_USER),
    sessionFor(PM),
  ])) as SupabaseClient[];

  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyId = (prof as { company_id: string }).company_id;

  // ⚠️ THE FIXTURE MUST SIT ON A PROJECT THE PM IS ASSIGNED TO, and the first
  // version of this did not constrain it. `subcontractor_contracts_select_
  // visible` requires `can_view_project`, so an unassigned project's contract
  // is invisible to the PM — and S2's refusal would then pass for the WRONG
  // REASON: no visibility rather than no authority. It passed on first run by
  // row ordering alone and broke the moment another harness churned the rows.
  const { data: pmProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', PM)
    .eq('is_deleted', false)
    .single();
  const { data: pmMember } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', (pmProfile as { id: string }).id)
    .maybeSingle();
  const { data: assignments } = await admin
    .from('project_assignments')
    .select('project_id')
    .eq('member_id', (pmMember as { id: string }).id);
  const assignedProjectIds = (assignments ?? []).map((a) => a.project_id);
  expect(assignedProjectIds.length, 'the PM identity has no project assignments').toBeGreaterThan(0);

  const { data: contract } = await admin
    .from('subcontractor_contracts')
    .select('id, project_id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('project_id', assignedProjectIds)
    .limit(1)
    .single();
  subContractId = (contract as { id: string }).id;

  const { data: expense } = await admin
    .from('expenses')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('project_id', assignedProjectIds)
    .limit(1)
    .single();
  expenseId = (expense as { id: string }).id;

  const { data: template } = await admin
    .from('lien_release_templates')
    .select('id')
    .eq('company_id', companyId)
    .eq('direction', 'sub_inbound')
    .limit(1)
    .single();
  subTemplateId = (template as { id: string }).id;
});

afterAll(async () => {
  if (madeReleases.length) await admin.from('lien_releases').delete().in('id', madeReleases);
  await admin
    .from('subcontractor_contracts')
    .update({ completed_at: null, completed_by: null })
    .eq('id', subContractId);
});

describe('S145-S1 — the four sub templates exist and are pre-named, not pre-filled', () => {
  // [S146] SCOPED TO `is_default`. These three counts are about WHAT THE SEED
  // LAYS DOWN, and they were counting every template on the company — so any
  // non-default template broke them: a fixture from another harness, or simply
  // a custom form a real user uploads through Company Settings, which the
  // product supports. Third instance of the fixture-drift class S146 fixed in
  // `s140-lien-releases.live.ts`; scoping states the intent instead of relying
  // on the company never having a custom template.
  it('every company has four default sub_inbound templates spanning type × is_final', async () => {
    const { data } = await admin
      .from('lien_release_templates')
      .select('type, is_final, pdf_file_id')
      .eq('company_id', companyId)
      .eq('direction', 'sub_inbound')
      .eq('is_default', true);
    expect(data).toHaveLength(4);
    const slots = (data ?? []).map((t) => `${t.type}|${t.is_final}`).sort();
    expect(slots).toEqual([
      'conditional|false',
      'conditional|true',
      'unconditional|false',
      'unconditional|true',
    ]);
    // Pre-NAMED, not pre-filled — the product authors no legal text in either
    // direction. The liability posture does not change because the lienor does.
    for (const t of data ?? []) expect(t.pdf_file_id).toBeNull();
  });

  it('client and sub sets are separate — one direction never sees the other', async () => {
    const { data: client } = await admin
      .from('lien_release_templates')
      .select('id')
      .eq('company_id', companyId)
      .eq('direction', 'client_outbound')
      .eq('is_default', true);
    expect(client).toHaveLength(4);
    // Eight seeded in total, four each. Not one shared set of four.
    const { data: all } = await admin
      .from('lien_release_templates')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_default', true);
    expect(all).toHaveLength(8);
  });
});

describe('S145-S2 — completed_at is Owner/Admin (ruling B1(b) + iii)', () => {
  it('Owner may mark a subcontract complete', async () => {
    const { error } = await ownerC
      .from('subcontractor_contracts')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', subContractId);
    expect(error).toBeNull();

    const { data } = await admin
      .from('subcontractor_contracts')
      .select('completed_at')
      .eq('id', subContractId)
      .single();
    expect((data as { completed_at: string | null }).completed_at).toBeTruthy();
  });

  it('Admin may too', async () => {
    const { error } = await adminC
      .from('subcontractor_contracts')
      .update({ completed_at: null, completed_by: null })
      .eq('id', subContractId);
    expect(error).toBeNull();
  });

  it('a PM is REFUSED BY THE DATABASE, and the row is unchanged', async () => {
    // Non-vacuity: the PM can reach this row and can update a column they own.
    const { data: readable } = await pmC
      .from('subcontractor_contracts')
      .select('id')
      .eq('id', subContractId);
    expect(readable, 'PM cannot see the contract — probe would be vacuous').toHaveLength(1);
    const { error: harmless } = await pmC
      .from('subcontractor_contracts')
      .update({ notes: 'S145 PM touch' })
      .eq('id', subContractId);
    expect(harmless, 'PM cannot update at all — refusal below would be ambiguous').toBeNull();

    const before = await admin
      .from('subcontractor_contracts')
      .select('completed_at')
      .eq('id', subContractId)
      .single();

    const { error } = await pmC
      .from('subcontractor_contracts')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', subContractId);
    expect(error, 'a PM marked a subcontract complete').toBeTruthy();
    expect(error?.message).toMatch(/Owner\/Admin only/i);

    const after = await admin
      .from('subcontractor_contracts')
      .select('completed_at')
      .eq('id', subContractId)
      .single();
    expect((after.data as { completed_at: string | null }).completed_at).toBe(
      (before.data as { completed_at: string | null }).completed_at
    );
  });
});

describe('S145-S3 — the subject CHECK enforces ruling B2', () => {
  // CHECK constraints bind the service role, so these are valid run as admin.
  it('completion hangs off sub_contract_id and payment off expense_id', async () => {
    const { data: a, error: aErr } = await admin
      .from('lien_releases')
      .insert({
        company_id: companyId,
        template_id: subTemplateId,
        direction: 'sub_inbound',
        sub_contract_id: subContractId,
        type: 'conditional',
        amount: 100,
      })
      .select('id')
      .single();
    expect(aErr).toBeNull();
    madeReleases.push((a as { id: string }).id);

    const { data: b, error: bErr } = await admin
      .from('lien_releases')
      .insert({
        company_id: companyId,
        template_id: subTemplateId,
        direction: 'sub_inbound',
        expense_id: expenseId,
        type: 'unconditional',
        amount: 50,
      })
      .select('id')
      .single();
    expect(bErr).toBeNull();
    madeReleases.push((b as { id: string }).id);
  });

  it('a sub_inbound release carrying an invoice_id is REFUSED', async () => {
    const { data: invoice } = await admin
      .from('invoices')
      .select('id')
      .eq('company_id', companyId)
      .limit(1)
      .single();
    const { data, error } = await admin
      .from('lien_releases')
      .insert({
        company_id: companyId,
        template_id: subTemplateId,
        direction: 'sub_inbound',
        invoice_id: (invoice as { id: string }).id,
        type: 'conditional',
        amount: 1,
      })
      .select('id');
    expect(error, 'a sub-inbound release accepted a client invoice').toBeTruthy();
    expect(error?.message).toMatch(/subject_check/i);
    if (data) madeReleases.push(...(data as { id: string }[]).map((r) => r.id));
  });

  it('BOTH subjects at once is refused — exactly one, never two', async () => {
    const { data, error } = await admin
      .from('lien_releases')
      .insert({
        company_id: companyId,
        template_id: subTemplateId,
        direction: 'sub_inbound',
        sub_contract_id: subContractId,
        expense_id: expenseId,
        type: 'conditional',
        amount: 1,
      })
      .select('id');
    expect(error).toBeTruthy();
    if (data) madeReleases.push(...(data as { id: string }[]).map((r) => r.id));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// [S146] WHY THE TRIGGER→TYPE MAPPING IS NOT A DATABASE CHECK.
//
// It was proposed at S146 as `sub_contract_id IS NOT NULL -> conditional` (and
// the payment arm likewise), on the reasoning that four findings in this project
// — #117, the compliance floor, the invoice-void hole and the contract-void hole
// S145 closed — all had the rule in the service while the database disagreed.
// RULED [Josh, S146]: FILE IT, DO NOT BUILD IT. The reasoning, so nobody
// re-derives it from that list and reaches the opposite conclusion:
//
//   1. THOSE FOUR ARE ABOUT AUTHORITY — who may do a thing. That belongs in the
//      database, and `enforce_contract_void_authority` is the right shape for it.
//      Trigger→type is about WHICH OF TWO LEGAL INSTRUMENTS the workflow offers
//      by default. The ruling makes that layer optional: the system prompts, it
//      never blocks. A CHECK there converts an optional prompt into a
//      schema-level refusal of a valid waiver.
//
//   2. BOTH ARMS WOULD BLOCK REAL INSTRUMENTS. `expense_id` + CONDITIONAL is the
//      conditional waiver on progress payment — what a GC collects BEFORE
//      releasing a stage payment, and the sub-side analogue of the
//      client-outbound flow 7F already ships. `sub_contract_id` + UNCONDITIONAL
//      is the final waiver covering a whole contract that has been paid out.
//
//   3. THE SCHEMA ALREADY SAYS SO. Both partial unique indexes are keyed
//      `(subject, TYPE)`, not `(subject)`. That is a deliberate statement that
//      both types may exist against one subject — and the test immediately below
//      asserts it. A CHECK would make the `type` column of
//      `idx_lien_releases_one_per_sub_contract_type` dead and turn that test red.
//
// The mapping is enforced where it belongs: the generate route derives the type
// from the trigger and refuses to take one from the caller. That is EXECUTED, not
// asserted structurally — `s146-generate-route.live.ts` S146-G3, "the caller
// CANNOT choose the type".
// ─────────────────────────────────────────────────────────────────────────────

describe('S145-S4 — one release per subject per type (ruling B2)', () => {
  it('a second live conditional on the same subcontract is refused', async () => {
    const { data, error } = await admin
      .from('lien_releases')
      .insert({
        company_id: companyId,
        template_id: subTemplateId,
        direction: 'sub_inbound',
        sub_contract_id: subContractId,
        type: 'conditional',
        amount: 999,
      })
      .select('id');
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/duplicate key|one_per_sub_contract_type/i);
    if (data) madeReleases.push(...(data as { id: string }[]).map((r) => r.id));
  });

  it('but the UNCONDITIONAL slot on the same subcontract is still free', async () => {
    // The two types are different instruments and both may exist — the index is
    // per (subject, type), not per subject.
    const { data, error } = await admin
      .from('lien_releases')
      .insert({
        company_id: companyId,
        template_id: subTemplateId,
        direction: 'sub_inbound',
        sub_contract_id: subContractId,
        type: 'unconditional',
        amount: 10,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    madeReleases.push((data as { id: string }).id);
  });
});

describe('S145-S5 — sub-inbound inherits the Owner/Admin floor (ruling iii)', () => {
  it('a PM reads NO sub_inbound releases and NO sub templates', async () => {
    const { data: reachable } = await pmC.from('projects').select('id').limit(1);
    expect(reachable, 'PM session is broken').toBeTruthy();

    const { data: releases } = await pmC
      .from('lien_releases')
      .select('id')
      .eq('direction', 'sub_inbound');
    expect(releases ?? []).toHaveLength(0);

    const { data: templates } = await pmC
      .from('lien_release_templates')
      .select('id')
      .eq('direction', 'sub_inbound');
    expect(templates ?? []).toHaveLength(0);

    // Counterfactual OUTSIDE the policy — the rows genuinely exist.
    const { data: real } = await admin
      .from('lien_release_templates')
      .select('id')
      .eq('direction', 'sub_inbound');
    expect((real ?? []).length).toBeGreaterThan(0);
  });

  it('a PM cannot INSERT a sub_inbound release', async () => {
    const { data, error } = await pmC
      .from('lien_releases')
      .insert({
        template_id: subTemplateId,
        direction: 'sub_inbound',
        sub_contract_id: subContractId,
        type: 'conditional',
        amount: 1,
      })
      .select('id');
    expect(error).toBeTruthy();
    expect(data).toBeNull();
    if (data) madeReleases.push(...(data as { id: string }[]).map((r) => r.id));
  });
});
