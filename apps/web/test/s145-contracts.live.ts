import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S145 — Module 7I contracts, schema + guards, driven against RLS.
//
// Migration: 20260926000000_7i_contracts.sql
// Spec:      docs/specs/7I-spec.md §8 (roles, REWRITTEN S145), §10 (schema)
// Scope:     schema, services and probes only [C4=(b)]. UI is next session.
// ============================================================================
//
// ⚠️ THE MOST IMPORTANT TEST IN THIS FILE IS S145-C4. It closes a hole that is
// LIVE ON PRODUCTION: `contracts-panel.tsx:145` voids a client contract through
// `updateClientContract`, `status` is not frozen by either 5A column-scope
// trigger, and `client_contracts_update_authorized` admits an assigned PM. So
// an assigned PM can void a client contract today with no database opinion.
//
// §8's ORIGINAL reasoning — "7I's role gate is a UI gate over an open database"
// — would have argued a builder out of fixing that. It was corrected at S145
// before this was written, which is the whole reason the audit came first.
//
// ⚠️ ROLE ACTIONS RUN AS REAL USERS. `admin` (service role) only seeds and
// evaluates counterfactuals OUTSIDE the guard under test.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN_USER = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';

let ownerC: SupabaseClient;
let adminC: SupabaseClient;
let pmC: SupabaseClient;
let foremanC: SupabaseClient;

let companyId = '';
let estimateId = '';
let subContractId = '';
let clientContractId = '';
let templateId = '';
const madeTemplates: string[] = [];
const madeDocuments: string[] = [];

beforeAll(async () => {
  assertRebuildTest();
  [ownerC, adminC, pmC, foremanC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(ADMIN_USER),
    sessionFor(PM),
    sessionFor(FOREMAN),
  ])) as SupabaseClient[];

  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyId = (prof as { company_id: string }).company_id;

  const { data: estimate } = await admin
    .from('estimates')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .limit(1)
    .single();
  estimateId = (estimate as { id: string }).id;

  // Deferred until the PM's assignments are known — same reason as above.

  // A client contract on a project the PM is ASSIGNED to.
  //
  // ⚠️ THE ASSIGNMENT IS LOAD-BEARING AND THE FIRST VERSION OF THIS MISSED IT.
  // `client_contracts_select_visible` requires `can_view_project`, so an
  // unassigned project's contract is invisible to the PM — and then C4's
  // refusal would pass for the WRONG REASON: no visibility rather than no
  // authority. Picking "any non-void contract" passed on first run purely by
  // row ordering and broke the moment the fixtures churned.
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

  const { data: clientContract } = await admin
    .from('client_contracts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .neq('status', 'void')
    .in('project_id', assignedProjectIds)
    .limit(1)
    .single();
  clientContractId = (clientContract as { id: string }).id;

  const { data: subContract } = await admin
    .from('subcontractor_contracts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .neq('status', 'void')
    .in('project_id', assignedProjectIds)
    .limit(1)
    .single();
  subContractId = (subContract as { id: string }).id;

  const { data: template } = await admin
    .from('contract_templates')
    .insert({ company_id: companyId, name: 'S145 fixture', document_kind: 'client_contract' })
    .select('id')
    .single();
  templateId = (template as { id: string }).id;
  madeTemplates.push(templateId);
});

afterAll(async () => {
  if (madeDocuments.length) await admin.from('contract_documents').delete().in('id', madeDocuments);
  if (madeTemplates.length) {
    await admin.from('contract_template_boxes').delete().in('template_id', madeTemplates);
    await admin.from('contract_templates').delete().in('id', madeTemplates);
  }
  // Restore anything the void probes touched.
  await admin.from('client_contracts').update({ status: 'signed' }).eq('id', clientContractId);
});

describe('S145-C1 — the Owner/Admin floor, SELECT included (§8)', () => {
  const gated: [string, () => SupabaseClient][] = [
    ['project_manager', () => pmC],
    ['foreman', () => foremanC],
  ];

  it('Owner and Admin read the 7I tables', async () => {
    for (const [label, client] of [
      ['owner', ownerC],
      ['admin', adminC],
    ] as const) {
      const { data, error } = await client.from('contract_templates').select('id').limit(1);
      expect(error, `${label} could not read contract_templates`).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    }
  });

  for (const [role, client] of gated) {
    it(`${role} reads NOTHING across all four tables — and is not a broken session`, async () => {
      const { data: reachable } = await client().from('projects').select('id').limit(1);
      expect(reachable, `${role} session is broken`).toBeTruthy();

      for (const table of [
        'contract_templates',
        'contract_template_boxes',
        'contract_documents',
        'contract_signing_sessions',
      ]) {
        const { data } = await client().from(table).select('id');
        expect(data ?? [], `${role} read ${table}`).toHaveLength(0);
      }

      // Counterfactual OUTSIDE the policy: a template genuinely exists.
      const { data: real } = await admin
        .from('contract_templates')
        .select('id')
        .eq('id', templateId);
      expect(real).toHaveLength(1);
    });
  }

  it('a PM cannot INSERT a template', async () => {
    const { data, error } = await pmC
      .from('contract_templates')
      .insert({ name: 'PM should not', document_kind: 'client_contract' })
      .select('id');
    expect(error).toBeTruthy();
    expect(data).toBeNull();
    if (data) madeTemplates.push(...(data as { id: string }[]).map((r) => r.id));
  });
});

describe('S145-C2 — the subject CHECK on contract_documents (§10.4)', () => {
  it('a client_contract document takes an estimate and nothing else', async () => {
    const { data, error } = await admin
      .from('contract_documents')
      .insert({
        company_id: companyId,
        template_id: templateId,
        document_kind: 'client_contract',
        estimate_id: estimateId,
        delivery_mode: 'esignature',
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    madeDocuments.push((data as { id: string }).id);
  });

  it('a client_contract carrying a SUB contract is refused', async () => {
    const { data, error } = await admin
      .from('contract_documents')
      .insert({
        company_id: companyId,
        template_id: templateId,
        document_kind: 'client_contract',
        sub_contract_id: subContractId,
        delivery_mode: 'esignature',
      })
      .select('id');
    expect(error, 'kind and subject were allowed to disagree').toBeTruthy();
    expect(error?.message).toMatch(/subject_check/i);
    if (data) madeDocuments.push(...(data as { id: string }[]).map((r) => r.id));
  });

  it('BOTH subjects at once is refused', async () => {
    const { data, error } = await admin
      .from('contract_documents')
      .insert({
        company_id: companyId,
        template_id: templateId,
        document_kind: 'sub_contract',
        estimate_id: estimateId,
        sub_contract_id: subContractId,
        delivery_mode: 'notary',
      })
      .select('id');
    expect(error).toBeTruthy();
    if (data) madeDocuments.push(...(data as { id: string }[]).map((r) => r.id));
  });

  it('a void with no reason is refused, even service-role', async () => {
    const { error } = await admin
      .from('contract_documents')
      .update({ status: 'voided' })
      .eq('id', madeDocuments[0]);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/void_shape/i);
  });
});

describe('S145-C3 — the box payload CHECK (§10.2)', () => {
  it('a value box with no key is refused', async () => {
    const { error } = await admin
      .from('contract_template_boxes')
      .insert({
        company_id: companyId,
        template_id: templateId,
        x: 0.1, y: 0.1, width: 0.2, height: 0.05,
        kind: 'value',
      })
      .select('id');
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/payload_check/i);
  });

  // ⚠️ FIXED AT S157 — THE TEST WAS WRONG, THE SCHEMA IS RIGHT.
  //
  // This inserted an `initial` box with no `party` and expected success. The
  // live `contract_template_boxes_payload_check` reads, for the signature and
  // initial kinds: `value_key IS NULL AND custom_label IS NULL AND party IS NOT
  // NULL`. So the insert was refused with CHECK 23514 and had been red ever
  // since `party` shipped.
  //
  // The test was written from 7I-spec.md §10.2's schema sketch, which lists
  // kind/value_key/custom_label and does NOT mention `party` — the column was
  // added afterwards. The constraint is deliberate and correct: a signature or
  // initial box has to say WHOSE mark it is (contractor or recipient), which is
  // the whole point of a two-party contract. The title's claim — "takes neither
  // key nor label" — is still exactly right; the test just never supplied the
  // one thing the kind DOES require.
  it("an 'initial' box takes neither key nor label, but does take a party — §7.3d", async () => {
    const { data, error } = await admin
      .from('contract_template_boxes')
      .insert({
        company_id: companyId,
        template_id: templateId,
        x: 0.1, y: 0.2, width: 0.1, height: 0.04,
        kind: 'initial',
        party: 'recipient',
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  // The other half of the same constraint, which nothing covered: without a
  // party there is no such thing as an initial box. Added S157 so the fix above
  // cannot be mistaken for the constraint having been loosened.
  it("an 'initial' box with NO party is refused — §10.2", async () => {
    const { error } = await admin
      .from('contract_template_boxes')
      .insert({
        company_id: companyId,
        template_id: templateId,
        x: 0.1, y: 0.3, width: 0.1, height: 0.04,
        kind: 'initial',
      })
      .select('id');
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/payload_check/i);
  });

  it('an out-of-bounds box is refused — fractions, never points', async () => {
    const { error } = await admin
      .from('contract_template_boxes')
      .insert({
        company_id: companyId,
        template_id: templateId,
        x: 72, y: 0.1, width: 0.2, height: 0.05,
        kind: 'value', value_key: 'contract_value',
      })
      .select('id');
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/bounds_check/i);
  });
});

describe('S145-C4 — CONTRACT VOID AUTHORITY: the hole that is live today', () => {
  it('a PM can reach and update the client contract — so the refusal below is the guard', async () => {
    // NON-VACUITY, and it is the whole point. The shipped UI exposes this
    // action to a PM; `client_contracts_update_authorized` admits them; and
    // `status` is frozen by neither 5A column-scope trigger.
    const { data: readable } = await pmC
      .from('client_contracts')
      .select('id')
      .eq('id', clientContractId);
    expect(readable, 'PM cannot see the contract — probe would be vacuous').toHaveLength(1);

    const { error: harmless } = await pmC
      .from('client_contracts')
      .update({ notes: 'S145 PM touch' })
      .eq('id', clientContractId);
    expect(harmless, 'PM cannot update at all — the refusal would be ambiguous').toBeNull();
  });

  it('a PM is REFUSED BY THE DATABASE when voiding a client contract', async () => {
    const before = await admin
      .from('client_contracts')
      .select('status')
      .eq('id', clientContractId)
      .single();

    const { error } = await pmC
      .from('client_contracts')
      .update({ status: 'void' })
      .eq('id', clientContractId);
    expect(error, 'a PM voided a client contract').toBeTruthy();
    expect(error?.message).toMatch(/Voiding a contract is Owner\/Admin only/i);

    const after = await admin
      .from('client_contracts')
      .select('status')
      .eq('id', clientContractId)
      .single();
    expect((after.data as { status: string }).status).toBe(
      (before.data as { status: string }).status
    );
  });

  it('an Owner may void it', async () => {
    const { error } = await ownerC
      .from('client_contracts')
      .update({ status: 'void' })
      .eq('id', clientContractId);
    expect(error).toBeNull();
    const { data } = await admin
      .from('client_contracts')
      .select('status')
      .eq('id', clientContractId)
      .single();
    expect((data as { status: string }).status).toBe('void');
  });

  it('the guard is NARROW — a PM may still make an ordinary non-void update', async () => {
    // The trigger must fire only on a transition INTO a voided state. A PM
    // editing a contract's notes is legitimate and must be unaffected — the
    // reason this is a trigger and not a narrowing of the UPDATE policy.
    const { error } = await pmC
      .from('client_contracts')
      .update({ notes: 'still allowed' })
      .eq('id', clientContractId);
    expect(error).toBeNull();
  });

  it('the same guard covers subcontractor_contracts', async () => {
    const before = await admin
      .from('subcontractor_contracts')
      .select('status')
      .eq('id', subContractId)
      .single();

    const { error } = await pmC
      .from('subcontractor_contracts')
      .update({ status: 'void' })
      .eq('id', subContractId);
    expect(error).toBeTruthy();

    const after = await admin
      .from('subcontractor_contracts')
      .select('status')
      .eq('id', subContractId)
      .single();
    expect((after.data as { status: string }).status).toBe(
      (before.data as { status: string }).status
    );
  });
});

describe('S145-C5 — the two-level toggle exists on both levels (§5.2)', () => {
  // ⚠️ REWRITTEN AT S157 — IT ASSERTED A COLUMN DEFAULT BY READING A ROW.
  //
  // The old form read `client_contracts_enabled` off the SHARED fixture company
  // and expected `false`, commenting "Off by default". But a default is a
  // property of the SCHEMA, and this read a value any Owner can toggle in
  // Settings and `s146-contract-services` toggles on purpose. It went red
  // because the flag was left on.
  //
  // And it could never have recovered on its own: s146 captures the PRIOR value
  // and restores THAT in its `finally`, which is correct isolation — but it
  // means that once the flag is left on, every later run faithfully restores it
  // ON. A test that inherits shared state cannot police that state.
  //
  // The schema default IS `false NOT NULL` (verified against
  // information_schema at S157), so the product was never wrong. What this
  // describe block actually claims is that "the two-level toggle EXISTS on both
  // levels", so it now proves the toggle is real and company-controlled by
  // driving it, and restores whatever it found.
  //
  // ⚠️ DRIVEN ON COMPANY B, NOT THE CANONICAL COMPANY [full-audit fix 5].
  // This test and s146-C5 were the ONLY two writers of
  // `client_contracts_enabled`, both driving company A's row in write-restore
  // loops — under the parallel battery they raced EACH OTHER (three sightings:
  // s146-C5 read `false` mid-way through this test's [false,true,false]
  // sweep). The claim here is "the master toggle exists and is writable both
  // ways", which ANY company's row proves — so this drives company B, whose
  // toggle nothing else in the suite touches, and s146-C5 now owns company
  // A's toggle alone. Do not move either back onto the other's company.
  it('companies carries the master toggle, and it is writable both ways', async () => {
    const { data: bProf } = await admin
      .from('profiles')
      .select('company_id')
      .eq('email', 'josh+qa-b-owner@worthprop.com')
      .eq('is_deleted', false)
      .single();
    const companyBId = (bProf as { company_id: string }).company_id;
    const { data: before } = await admin
      .from('companies')
      .select('client_contracts_enabled')
      .eq('id', companyBId)
      .single();
    const prior = (before as { client_contracts_enabled: boolean }).client_contracts_enabled;

    try {
      for (const value of [false, true, false]) {
        const { error } = await admin
          .from('companies')
          .update({ client_contracts_enabled: value })
          .eq('id', companyBId);
        expect(error).toBeNull();

        const { data: read } = await admin
          .from('companies')
          .select('client_contracts_enabled')
          .eq('id', companyBId)
          .single();
        expect((read as { client_contracts_enabled: boolean }).client_contracts_enabled).toBe(
          value
        );
      }
    } finally {
      await admin
        .from('companies')
        .update({ client_contracts_enabled: prior })
        .eq('id', companyBId);
    }
  });

  it('estimates carries the per-proposal flag and defaults it OFF', async () => {
    const { data } = await admin
      .from('estimates')
      .select('include_client_contract')
      .eq('id', estimateId)
      .single();
    expect((data as { include_client_contract: boolean }).include_client_contract).toBe(false);
  });

  it('every estimate-side carrier column landed', async () => {
    const { data, error } = await admin
      .from('estimates')
      .select(
        'signed_contract_file_id, start_date, target_end_date, retainage_percent, legal_description, substantial_completion_days'
      )
      .eq('id', estimateId)
      .single();
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });
});
