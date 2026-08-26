import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { optionSell } from '@/lib/selections/option-sell';
import { selectionConsentTextFor } from '@/lib/selections/consent-text';
import { getPortalProjectSelections } from '@/lib/services/selections';
import { completeSelectionSignature, offerSelection } from '@/lib/services/selection-lifecycle-service';

// ============================================================================
// S175 #5 — Allowances & Selections STAGE 7: THE PORTAL SELECTIONS PAGE.
// Migration 20261037000000. Spec §9.3. Rulings Q5.1, Q5.2, Q5.3 and the
// Phase-2 gate ruling on the client WRITE.
// ============================================================================
//
// ⚠️ WHAT MAKES THIS FILE DIFFERENT FROM EVERY EARLIER SELECTIONS HARNESS.
//
// Stages 2–6 all exercised the client's half by STANDING IN FOR HER with the
// admin client, because nothing shipped could perform her write:
// `selection_options` has no client UPDATE arm and `selections-client.ts`
// deleted `setChosenOptions` with a tombstone. Every "the client picks" probe in
// this repo has therefore been the SERVICE ROLE picking. This file is the first
// one where the pick and the sell-read are done AS HER, through the functions
// and the route that ship.
//
// WHAT THIS FILE PROVES:
//
//   A  THE FLOOR — the two definer reads are CLIENT-ONLY. Owner, PM, foreman,
//      crew and subcontractor get NOTHING from them, and every one of those
//      probes is non-vacuous because the same principal reads the selection
//      itself in the same test. Copying `selection_option_images()`'s arms
//      would have handed three of those roles a sell price.
//   B  THE MIRROR — the SQL sell agrees with `optionSell()` cent for cent on
//      the same rows, including the inherit-NULL case, and the figures she is
//      shown are the figures the signature stamps.
//   C  THE PICK RPC — every arm of it, each refusal re-read through the service
//      role rather than trusted.
//   D  THE ASSEMBLY — `getPortalProjectSelections()`: drafts absent, the
//      client-supplied deduction NULL and not 0, the `approvedAt` fallback, and
//      no cost basis anywhere in what it hands the browser.
//   E  THE REAL SHIPPED ROUTE — `/api/portal/pick-selection`, and the whole
//      loop through it: pick, sign, and Q5.3's refusal afterwards.
//   F  THE CONSENT TEXT SHE READS IS THE ONE STORED.
//
// ⚠️ E EXECUTES THE ROUTE, NOT THE SERVICE, for S174's reason two stages back:
// `s171-selections-lifecycle` was fully green while no client had ever received
// anything, because the mechanism was fine and nothing called it. A harness that
// calls `setClientSelectionPicks()` itself goes green on a page that reaches no
// route.
//
// ⚠️ FIXTURE KEYS ARE COLLIDABLE (spec §10 #19): every row carries MARKER, is
// swept in beforeAll AND afterAll, and afterAll asserts zero residue and THROWS.
// The fixture hangs off the shared QA A project, exactly as
// `s171-selections-lifecycle` does, because the STAFF principals' visibility of
// that project comes from the seed — a fresh project would need five
// assignments and the floor probes would be vacuous without them.
// ============================================================================

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

import { NextRequest } from 'next/server';
// THE REAL SHIPPED ROUTES.
import { POST as PICK } from '@/app/api/portal/pick-selection/route';
import { POST as SIGN } from '@/app/api/portal/sign-selection/route';

const MARKER = 'S175S7';
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9'; // QA A — isolation fixture
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const LINKED = 'josh+qa-client-linked@worthprop.com';
const CONTROL = 'josh+qa-client@worthprop.com'; // a real client, NOT of this project

type Client = SupabaseClient<Database>;
type Who = 'owner' | 'pm' | 'foreman' | 'crew' | 'sub' | 'linked' | 'control';
const S: Partial<Record<Who, Client>> = {};
const PROFILE: Partial<Record<Who, string>> = {};

let companyId: string;
let allowanceItemId: string;
let areaId: string;

let singleId: string; // allow_multiple = false, two priced options
let optA: string; // explicit 20% markup
let optB: string; // markup NULL -> the inherited snapshot
let multiId: string; // allow_multiple = true, two priced options — SIGNED by B3
let optM1: string;
let optM2: string;
let multi2Id: string; // allow_multiple = true, and stays awaiting so C4 is real
let optN1: string;
let optN2: string;
let unlinkedId: string; // no allowance link -> deduction 0 (Q8)
let optU: string;
let suppliedId: string; // client_supplied, linked to the allowance
let optS: string;
let approvedSuppliedId: string; // client_supplied AND signed -> approvedAt fallback
let draftId: string; // never reaches her at all

// ⚠️ THE REAL COUNTERFACTUAL — see A6. A second project belonging to a DIFFERENT
// contact, with a released, priced selection on it.
let otherProjectId: string;
let otherContactId: string;
let otherSelId: string;
let otherOptId: string;

const must = (l: string, e: { message: string } | null) => {
  if (e) throw new Error(`${l}: ${e.message}`);
};
const sig = {
  signatureType: 'draw' as const,
  signatureData: 'data:image/png;base64,iVBORw0KGgo=',
  signerName: 'QA Client Linked',
  signerIp: '127.0.0.1',
  signerUserAgent: 'vitest',
};

function req(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Service-role read of the pick state — never the caller's, so a refusal that
 *  "returned no rows" cannot be mistaken for a refusal that changed nothing. */
const chosenOf = async (selectionId: string): Promise<string[]> =>
  (
    (await admin
      .from('selection_options')
      .select('id, is_chosen')
      .eq('selection_id', selectionId)
      .eq('is_chosen', true)).data ?? []
  ).map((o) => o.id).sort();

const selRow = async (id: string) =>
  (await admin.from('selections').select('*').eq('id', id).single()).data!;

// ── sweep ───────────────────────────────────────────────────────────────────
async function sweep(): Promise<void> {
  const { data: sels } = await admin.from('selections').select('id').like('name', `${MARKER}%`);
  const ids = (sels ?? []).map((s) => s.id);
  if (ids.length) {
    await admin.from('notifications').delete().in('source_id', ids).eq('source_table', 'selections');
    // The four `signed_*` stamps travel together by CHECK and the FK runs both
    // ways, so all four clear at once with the status they imply — the stage-5
    // sweep found this the hard way and stage 6 recorded it.
    must('unstamp', (await admin.from('selections').update({
      status: 'draft', signed_session_id: null, signed_sell_amount: null,
      signed_allowance_deduction: null, signed_variance: null, signed_at: null,
    }).in('id', ids)).error);
    must('sessions', (await admin.from('selection_signing_sessions').delete().in('selection_id', ids)).error);
    const { data: opts } = await admin.from('selection_options').select('id').in('selection_id', ids);
    const oids = (opts ?? []).map((o) => o.id);
    if (oids.length) {
      await admin.from('selection_option_amounts').delete().in('option_id', oids);
      await admin.from('selection_options').delete().in('id', oids);
    }
    await admin.from('selection_amounts').delete().in('selection_id', ids);
    await admin.from('selection_notes').delete().in('selection_id', ids);
    await admin.from('selection_threads').delete().in('selection_id', ids);
    must('selections', (await admin.from('selections').delete().in('id', ids)).error);
  }
  await admin.from('selection_areas').delete().like('name', `${MARKER}%`);

  // The second-project fixture (A6). Its selections are MARKER-named and went
  // with the block above; the project and its contact are keyed by name.
  const { data: others } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  const opids = (others ?? []).map((p) => p.id);
  if (opids.length) {
    await admin.from('project_contacts').delete().in('project_id', opids);
    must('other projects', (await admin.from('projects').delete().in('id', opids)).error);
  }
  await admin.from('contacts').delete().like('last_name', `${MARKER}%`);

  const { data: items } = await admin
    .from('project_budget_items')
    .select('id')
    .eq('project_id', PROJECT)
    .like('description', `${MARKER}%`);
  const iids = (items ?? []).map((i) => i.id);
  if (iids.length) {
    await admin.from('project_budget_amounts').delete().in('budget_item_id', iids);
    must('budget items', (await admin.from('project_budget_items').delete().in('id', iids)).error);
  }
}

async function makeSelection(
  name: string,
  opts: {
    allowMultiple?: boolean;
    clientSupplied?: boolean;
    linked?: boolean;
    release?: boolean;
    options: { name: string; unitCost: number; markup: number | null }[];
  }
): Promise<{ id: string; optionIds: string[] }> {
  const { data: s, error } = await admin
    .from('selections')
    .insert({
      company_id: companyId,
      project_id: PROJECT,
      area_id: areaId,
      name: `${MARKER} ${name}`,
      allowance_budget_item_id: opts.linked === false ? null : allowanceItemId,
      allow_multiple: opts.allowMultiple ?? false,
      client_supplied: opts.clientSupplied ?? false,
    })
    .select('id')
    .single();
  must(`selection ${name}`, error);
  const optionIds: string[] = [];
  for (const [i, o] of opts.options.entries()) {
    const { data: opt, error: oErr } = await admin
      .from('selection_options')
      .insert({
        company_id: companyId,
        selection_id: s!.id,
        name: `${MARKER} ${o.name}`,
        spec_detail: `${o.name} spec`,
        is_chosen: false,
        sort_order: i,
      })
      .select('id')
      .single();
    must(`option ${o.name}`, oErr);
    optionIds.push(opt!.id);
    if (!opts.clientSupplied) {
      must(
        `amounts ${o.name}`,
        (await admin.from('selection_option_amounts').insert({
          company_id: companyId, option_id: opt!.id,
          quantity: 1, unit_cost: o.unitCost, markup_percent: o.markup,
        })).error
      );
    }
  }
  if (opts.release !== false) {
    const r = await offerSelection(S.owner!, s!.id);
    if (!r.success) throw new Error(`release ${name}: ${r.error}`);
  }
  return { id: s!.id, optionIds };
}

// ── setup ───────────────────────────────────────────────────────────────────
beforeAll(async () => {
  assertRebuildTest();
  await sweep();

  const { data: co } = await admin.from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = co!.id;
  for (const [k, e] of [
    ['owner', OWNER], ['pm', PM], ['foreman', FOREMAN], ['crew', CREW],
    ['sub', SUB], ['linked', LINKED], ['control', CONTROL],
  ] as const) {
    S[k] = (await sessionFor(e)) as Client;
    const { data: p } = await admin.from('profiles').select('id, contact_id').eq('email', e).single();
    PROFILE[k] = p!.id;
    if (k === 'linked' && !p!.contact_id) throw new Error('LINKED client is unlinked — run the seed.');
  }
  state.client = S.linked!;

  // A $5,000 allowance line with no source row, so the markup chain lands on
  // the company's material default. The snapshot trigger stamps
  // `selection_amounts.inherited_markup_percent` from the same chain.
  const { data: item, error: bErr } = await admin
    .from('project_budget_items')
    .insert({
      company_id: companyId, project_id: PROJECT, row_type: 'allowance',
      description: `${MARKER} tile allowance`, created_by: null,
    })
    .select('id').single();
  must('budget line', bErr);
  allowanceItemId = item!.id;
  must('budget amount', (await admin.from('project_budget_amounts').insert({
    company_id: companyId, budget_item_id: allowanceItemId, budgeted_amount: 5000,
  })).error);

  const { data: area, error: aErr } = await admin
    .from('selection_areas')
    .insert({ company_id: companyId, project_id: PROJECT, name: `${MARKER} Kitchen`, sort_order: 1 })
    .select('id').single();
  must('area', aErr);
  areaId = area!.id;

  const single = await makeSelection('countertop', {
    options: [
      { name: 'calacatta quartz', unitCost: 6000, markup: 20 },
      // ⚠️ markup NULL means INHERIT, and B2 exists to prove it is not read as
      // zero — the S174 #2 defect, in the figure a client would sign.
      { name: 'granite', unitCost: 4000, markup: null },
    ],
  });
  singleId = single.id;
  [optA, optB] = single.optionIds;

  const multi = await makeSelection('cabinet hardware', {
    allowMultiple: true,
    options: [
      { name: 'pulls', unitCost: 900, markup: 10 },
      { name: 'knobs', unitCost: 600, markup: 10 },
    ],
  });
  multiId = multi.id;
  [optM1, optM2] = multi.optionIds;

  // ⚠️ A SECOND `allow_multiple` SELECTION, AND IT EXISTS FOR ONE ASSERTION.
  // B3 signs `multiId`, so a "two picks are accepted" probe against it would be
  // refused for the Q5.3 reason and would pass against a backstop that refused
  // EVERY multi-pick. This one is never signed, so C4 tests the rule.
  const multi2 = await makeSelection('lighting package', {
    allowMultiple: true,
    options: [
      { name: 'pendant', unitCost: 700, markup: 15 },
      { name: 'flush mount', unitCost: 300, markup: 15 },
    ],
  });
  multi2Id = multi2.id;
  [optN1, optN2] = multi2.optionIds;

  const unlinked = await makeSelection('extra sconce', {
    linked: false,
    options: [{ name: 'brass sconce', unitCost: 500, markup: 20 }],
  });
  unlinkedId = unlinked.id;
  [optU] = unlinked.optionIds;

  const supplied = await makeSelection('their own tile', {
    clientSupplied: true,
    options: [{ name: 'client tile', unitCost: 0, markup: null }],
  });
  suppliedId = supplied.id;
  [optS] = supplied.optionIds;

  // Signed, client-supplied: the ONE row whose four `signed_*` stamps are all
  // NULL by CHECK. D4 reads its date and pins the stamp still NULL, so the
  // fallback cannot go quietly vacuous.
  const approvedSupplied = await makeSelection('supplied and signed', {
    clientSupplied: true,
    options: [{ name: 'client fixture', unitCost: 0, markup: null }],
  });
  approvedSuppliedId = approvedSupplied.id;
  const signed = await completeSelectionSignature(S.linked!, approvedSuppliedId, {
    ...sig,
    caller: { kind: 'portal_session', profileId: PROFILE.linked! },
  });
  if (!signed.success) throw new Error(`sign supplied: ${signed.error}`);

  const draft = await makeSelection('not sent yet', {
    release: false,
    options: [{ name: 'secret option', unitCost: 100, markup: 20 }],
  });
  draftId = draft.id;

  // ── THE COUNTERFACTUAL FIXTURE ────────────────────────────────────────────
  // A project of the SAME company belonging to a DIFFERENT contact, carrying a
  // released, priced selection. See A6 for why the CONTROL client is not enough.
  const { data: otherContact, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId, contact_type: 'client',
      first_name: 'QA', last_name: `${MARKER} Someone Else`,
      email: `s175s7-other@example.invalid`,
    })
    .select('id').single();
  must('other contact', cErr);
  otherContactId = otherContact!.id;

  // project_number and project_internal_seq are set explicitly: their defaults
  // resolve the company from get_my_company_id(), and the service role has no
  // caller company (hub-fixture.ts records the same trap).
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: otherProject, error: opErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: otherContactId,
      name: `${MARKER} — someone else's job`,
      project_type: 'fixed_price',
      status: 'active',
      project_number: `${MARKER}-X1`,
      project_internal_seq: (seqRow?.project_internal_seq ?? 0) + 1000,
    })
    .select('id').single();
  must('other project', opErr);
  otherProjectId = otherProject!.id;

  const { data: otherSel, error: osErr } = await admin
    .from('selections')
    .insert({
      company_id: companyId, project_id: otherProjectId,
      name: `${MARKER} someone else's countertop`,
      allow_multiple: false, status: 'awaiting_approval',
    })
    .select('id').single();
  must('other selection', osErr);
  otherSelId = otherSel!.id;
  const { data: otherOpt, error: ooErr } = await admin
    .from('selection_options')
    .insert({
      company_id: companyId, selection_id: otherSelId,
      name: `${MARKER} not hers`, is_chosen: false,
    })
    .select('id').single();
  must('other option', ooErr);
  otherOptId = otherOpt!.id;
  must('other amounts', (await admin.from('selection_option_amounts').insert({
    company_id: companyId, option_id: otherOptId,
    quantity: 1, unit_cost: 3000, markup_percent: 25,
  })).error);
}, 300_000);

afterAll(async () => {
  await sweep();
  const left: Record<string, number | null> = {};
  left.selections = (await admin.from('selections').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`)).count;
  left.areas = (await admin.from('selection_areas').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`)).count;
  left.options = (await admin.from('selection_options').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`)).count;
  left.budgetItems = (await admin.from('project_budget_items').select('id', { count: 'exact', head: true }).like('description', `${MARKER}%`)).count;
  left.projects = (await admin.from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`)).count;
  left.contacts = (await admin.from('contacts').select('id', { count: 'exact', head: true }).like('last_name', `${MARKER}%`)).count;
  const residue = Object.entries(left).filter(([, n]) => (n ?? 0) > 0);
  if (residue.length) throw new Error(`[${MARKER}] residue: ${JSON.stringify(residue)}`);
}, 300_000);

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S7 A — THE FLOOR: the two definer reads are CLIENT-ONLY', () => {
  it('A1 — the LINKED client reads a sell for every priced option, and the deduction', async () => {
    const { data: sell, error } = await S.linked!.rpc('selection_client_option_sell', { p_selection_id: singleId });
    expect(error, `sell refused: ${error?.message}`).toBeNull();
    expect(sell).toHaveLength(2);
    const { data: ded } = await S.linked!.rpc('selection_client_allowance_deduction', { p_selection_id: singleId });
    // 5,000 budgeted at the company material default. Non-zero is the point:
    // a zero here would make every A2 "reads nothing" pass vacuously.
    expect(Number(ded)).toBeGreaterThan(0);
  });

  it.each(['owner', 'pm', 'foreman', 'crew', 'sub'] as const)(
    'A2 — %s reads the SELECTION but gets NOTHING from either sell function',
    async (who) => {
      // ⚠️ NON-VACUITY FIRST. If the principal could not see the selection at
      // all, "reads no sell" would be true of every function, correct or not.
      const { data: visible } = await S[who]!.from('selections').select('id').eq('id', singleId);
      expect(visible, `${who} cannot see the selection — this probe would be vacuous`).toHaveLength(1);

      const { data: sell } = await S[who]!.rpc('selection_client_option_sell', { p_selection_id: singleId });
      expect(sell ?? [], `${who} was handed a per-option SELL price`).toHaveLength(0);
      const { data: ded } = await S[who]!.rpc('selection_client_allowance_deduction', { p_selection_id: singleId });
      expect(ded, `${who} was handed the allowance SELL`).toBeNull();
    }
  );

  it('A3 — the CONTROL client is refused BY RULE, not by absence', async () => {
    // She is a real, signed-in client of the same company with no project.
    const { data: own } = await S.control!.from('profiles').select('id').eq('id', PROFILE.control!);
    expect(own, 'the control client cannot read her own row — she is not a live principal').toHaveLength(1);
    const { data: sell } = await S.control!.rpc('selection_client_option_sell', { p_selection_id: singleId });
    expect(sell ?? []).toHaveLength(0);
    const { data: ded } = await S.control!.rpc('selection_client_allowance_deduction', { p_selection_id: singleId });
    expect(ded).toBeNull();
  });

  it('A4 — `allowance_sell_amount` is not reachable by ANY signed-in caller', async () => {
    // It returns a raw budget/sell figure keyed on a budget item; the Floor puts
    // that at Owner/Admin, and the client reaches it only through §3's gate.
    const { error } = await S.owner!.rpc('allowance_sell_amount', { p_budget_item_id: allowanceItemId });
    expect(error?.message ?? '').toMatch(/permission denied/i);
    const { data } = await admin.rpc('allowance_sell_amount', { p_budget_item_id: allowanceItemId });
    expect(Number(data)).toBeGreaterThan(0);
  });

  it('A5 — a DRAFT selection is invisible to her, and so are its figures', async () => {
    const { data: rows } = await S.linked!.from('selections').select('id').eq('id', draftId);
    expect(rows ?? []).toHaveLength(0);
    const { data: sell } = await S.linked!.rpc('selection_client_option_sell', { p_selection_id: draftId });
    expect(sell ?? []).toHaveLength(0);
    const { data: ded } = await S.linked!.rpc('selection_client_allowance_deduction', { p_selection_id: draftId });
    expect(ded).toBeNull();
  });

  it('A6 — ⚠️ THE REAL COUNTERFACTUAL: full access, wrong project, nothing back', async () => {
    // ===================================================================
    // WHY A3 IS NOT ENOUGH, AND THIS FOUND IT.
    // ===================================================================
    // The CONTROL client is UNLINKED (`contact_id IS NULL`), so
    // `my_client_access_level()` returns something other than 'full' for her and
    // `client_has_full_access()` is false. Every client arm in this feature
    // begins with that condition — so her refusal is decided BEFORE the project
    // test is reached, and A3 would pass identically against a function with no
    // project scoping in it at all. That is the standing rule in CLAUDE.md's own
    // terms: *a counterfactual run under the policy it is trying to bypass is
    // not a counterfactual*. E3 measured it — she is refused by the ROUTE with
    // 403, the access-level gate, not 409.
    //
    // So the counterfactual is the LINKED client — full access, a real client of
    // a real project — pointed at a selection on a DIFFERENT project, owned by a
    // DIFFERENT contact. `is_client_of_project()` has exactly two arms
    // (`projects.contact_id` and `project_contacts`) and neither reaches it, so
    // the project scoping is the ONLY thing that can refuse her here.
    const { data: rows } = await S.linked!.from('selections').select('id').eq('id', otherSelId);
    expect(rows ?? [], 'she can see a selection on a project that is not hers').toHaveLength(0);

    const { data: sell } = await S.linked!.rpc('selection_client_option_sell', { p_selection_id: otherSelId });
    expect(sell ?? [], 'a sell price leaked across projects').toHaveLength(0);
    const { data: ded } = await S.linked!.rpc('selection_client_allowance_deduction', { p_selection_id: otherSelId });
    expect(ded, 'an allowance figure leaked across projects').toBeNull();

    // Non-vacuous: the row, the option and its price all really exist.
    const { data: real } = await admin
      .from('selection_option_amounts').select('option_id').eq('option_id', otherOptId);
    expect(real, 'the counterfactual selection has no priced option — A6 is vacuous').toHaveLength(1);
    // And the same principal, on HER project, gets figures — proved in A1.
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S7 B — THE MIRROR: SQL sell === optionSell(), cent for cent', () => {
  it('B1 — every option the client is shown matches the TypeScript formula', async () => {
    // ⚠️ THIS IS THE PROBE THAT KEEPS `20261037000000` §2 HONEST. She reads the
    // SQL figure and signs the TypeScript one; a divergence is a price that
    // moved between the screen and the signature.
    const { data: sell } = await S.linked!.rpc('selection_client_option_sell', { p_selection_id: singleId });
    const { data: amounts } = await admin
      .from('selection_option_amounts')
      .select('option_id, quantity, unit_cost, markup_percent')
      .in('option_id', [optA, optB]);
    const { data: snap } = await admin
      .from('selection_amounts')
      .select('inherited_markup_percent')
      .eq('selection_id', singleId)
      .maybeSingle();
    const inherited = snap?.inherited_markup_percent ?? null;
    expect(inherited, 'no snapshot — B2 would be vacuous').not.toBeNull();

    const byOption = new Map((sell ?? []).map((r) => [r.option_id, Number(r.sell)]));
    expect(byOption.size).toBe(2);
    for (const a of amounts ?? []) {
      expect(byOption.get(a.option_id), `option ${a.option_id}`).toBe(optionSell(a, inherited));
    }
  });

  it('B2 — the inherit-NULL option prices at the SNAPSHOT, not at bare cost', async () => {
    // S174 #2: `markup_percent ?? 0` made "inherit" mean "no markup" in the
    // figure a client would have signed. A mirror that reproduced it would pass
    // B1 and still be wrong, so the inherit case is asserted on its own.
    const { data: sell } = await S.linked!.rpc('selection_client_option_sell', { p_selection_id: singleId });
    const b = (sell ?? []).find((r) => r.option_id === optB);
    expect(b, 'the inherit option is missing').toBeTruthy();
    expect(Number(b!.sell)).toBeGreaterThan(4000);
  });

  it('B3 — the deduction she reads is the one the SIGNATURE stamps', async () => {
    const { data: ded } = await S.linked!.rpc('selection_client_allowance_deduction', { p_selection_id: multiId });
    must('pick', (await admin.from('selection_options').update({ is_chosen: true }).eq('id', optM1)).error);
    const signed = await completeSelectionSignature(S.linked!, multiId, {
      ...sig,
      caller: { kind: 'portal_session', profileId: PROFILE.linked! },
    });
    expect(signed.error ?? null, 'signature refused').toBeNull();
    const row = await selRow(multiId);
    expect(Number(row.signed_allowance_deduction)).toBe(Number(ded));
    // ...and the chosen option's sell is the sell stamped, through the ONE
    // TypeScript formula the signature itself uses.
    expect(Number(row.signed_sell_amount)).toBe(
      optionSell(
        (await admin.from('selection_option_amounts').select('quantity, unit_cost, markup_percent').eq('option_id', optM1).single()).data!,
        (await admin.from('selection_amounts').select('inherited_markup_percent').eq('selection_id', multiId).maybeSingle()).data?.inherited_markup_percent ?? null
      )
    );
  });

  it('B4 — Q8: an UNLINKED selection reads a deduction of 0, not NULL', async () => {
    // 0 and NULL mean different things here: 0 is "no allowance to deduct" and
    // NULL is "you may not see this selection". Collapsing them would hide the
    // second behind the first.
    const { data: ded } = await S.linked!.rpc('selection_client_allowance_deduction', { p_selection_id: unlinkedId });
    expect(ded).not.toBeNull();
    expect(Number(ded)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S7 C — THE PICK: every arm, each refusal re-read through the service role', () => {
  it('C1 — she picks one, and the row says so', async () => {
    const { error } = await S.linked!.rpc('selection_client_pick', { p_selection_id: singleId, p_option_ids: [optA] });
    expect(error?.message ?? null).toBeNull();
    expect(await chosenOf(singleId)).toEqual([optA]);
  });

  it('C2 — picking the other one REPLACES rather than adds', async () => {
    await S.linked!.rpc('selection_client_pick', { p_selection_id: singleId, p_option_ids: [optB] });
    expect(await chosenOf(singleId)).toEqual([optB]);
  });

  it('C3 — Q5.2: two picks on a single-choice selection are refused, and NOTHING moves', async () => {
    const before = await chosenOf(singleId);
    const { error } = await S.linked!.rpc('selection_client_pick', {
      p_selection_id: singleId, p_option_ids: [optA, optB],
    });
    expect(error?.message ?? '').toMatch(/only one choice/i);
    expect(await chosenOf(singleId)).toEqual(before);
  });

  it('C4 — two picks ARE accepted when the selection allows several', async () => {
    // ⚠️ WITHOUT THIS, C3 WOULD PASS AGAINST A FUNCTION THAT REFUSED EVERY
    // MULTI-PICK. The backstop is `allow_multiple`'s rule, not a blanket no.
    // `multi2Id` is used rather than `multiId` because B3 signed that one, and
    // a Q5.3 refusal would look identical from here.
    const { error } = await S.linked!.rpc('selection_client_pick', {
      p_selection_id: multi2Id, p_option_ids: [optN1, optN2],
    });
    expect(error?.message ?? null).toBeNull();
    expect(await chosenOf(multi2Id)).toEqual([optN1, optN2].sort());
  });

  it('C5 — an empty array CLEARS her picks (the signature is what refuses empty)', async () => {
    await S.linked!.rpc('selection_client_pick', { p_selection_id: singleId, p_option_ids: [] });
    expect(await chosenOf(singleId)).toEqual([]);
    await S.linked!.rpc('selection_client_pick', { p_selection_id: singleId, p_option_ids: [optA] });
    expect(await chosenOf(singleId)).toEqual([optA]);
  });

  it('C6 — an option from ANOTHER selection is refused, and nothing moves', async () => {
    const before = await chosenOf(singleId);
    const { error } = await S.linked!.rpc('selection_client_pick', {
      p_selection_id: singleId, p_option_ids: [optU],
    });
    expect(error?.message ?? '').toMatch(/not on this selection/i);
    expect(await chosenOf(singleId)).toEqual(before);
    expect(await chosenOf(unlinkedId)).toEqual([]);
  });

  it.each(['owner', 'pm', 'foreman', 'sub'] as const)(
    'C7 — %s cannot pick, even though the selection is readable to them',
    async (who) => {
      const before = await chosenOf(singleId);
      const { error } = await S[who]!.rpc('selection_client_pick', {
        p_selection_id: singleId, p_option_ids: [optB],
      });
      expect(error?.message ?? '', `${who} was allowed to pick`).toMatch(/not found/i);
      expect(await chosenOf(singleId)).toEqual(before);
    }
  );

  it('C8 — the CONTROL client cannot pick on a project that is not hers', async () => {
    const before = await chosenOf(singleId);
    const { error } = await S.control!.rpc('selection_client_pick', {
      p_selection_id: singleId, p_option_ids: [optB],
    });
    expect(error?.message ?? '').toMatch(/not found/i);
    expect(await chosenOf(singleId)).toEqual(before);
  });

  it('C9 — a DRAFT selection cannot be picked on either', async () => {
    const { error } = await S.linked!.rpc('selection_client_pick', {
      p_selection_id: draftId, p_option_ids: [],
    });
    expect(error?.message ?? '').toMatch(/not found/i);
  });

  it('C10 — Q5.3: after APPROVAL she cannot re-pick, and the stamps still describe the signed set', async () => {
    const before = await chosenOf(multiId);
    const row = await selRow(multiId);
    const { error } = await S.linked!.rpc('selection_client_pick', {
      p_selection_id: multiId, p_option_ids: [optM2],
    });
    expect(error?.message ?? '').toMatch(/not awaiting your approval/i);
    expect(await chosenOf(multiId)).toEqual(before);
    const after = await selRow(multiId);
    expect(Number(after.signed_sell_amount)).toBe(Number(row.signed_sell_amount));
  });

  it('C11 — a client-supplied selection is still pickable (there is no money, but there is a choice)', async () => {
    const { error } = await S.linked!.rpc('selection_client_pick', {
      p_selection_id: suppliedId, p_option_ids: [optS],
    });
    expect(error?.message ?? null).toBeNull();
    expect(await chosenOf(suppliedId)).toEqual([optS]);
  });

  it('C13 — ⚠️ THE RPC IS THE ONLY DOOR: her direct UPDATE on `selection_options` moves nothing', async () => {
    // The Phase-2 gate ruled that `selection_options` must NOT get a client
    // UPDATE arm — RLS cannot restrict columns, so a policy letting her set
    // `is_chosen` would equally let her rewrite `name`, `spec_detail` and
    // `link_url` on the options her contractor assembled. This is the guard
    // against someone "simplifying" the definer away into a policy.
    const before = (await admin.from('selection_options').select('name, is_chosen').eq('id', optA).single()).data!;
    const { data } = await S.linked!
      .from('selection_options')
      .update({ is_chosen: true, name: 'pwned' })
      .eq('id', optA)
      .select('id');
    expect(data ?? [], 'the client has a direct UPDATE arm on selection_options').toHaveLength(0);
    const after = (await admin.from('selection_options').select('name, is_chosen').eq('id', optA).single()).data!;
    expect(after.name).toBe(before.name);
    expect(after.is_chosen).toBe(before.is_chosen);
  });

  it('C12 — ⚠️ and the counterfactual on the WRITE: full access, wrong project, refused', async () => {
    // A6's argument, applied to the pick. The CONTROL client (C8) is stopped by
    // `client_has_full_access()`; this principal is not, so only the project
    // scoping can refuse her.
    const { error } = await S.linked!.rpc('selection_client_pick', {
      p_selection_id: otherSelId, p_option_ids: [otherOptId],
    });
    expect(error?.message ?? '', 'she wrote a pick onto another client’s selection').toMatch(/not found/i);
    expect(await chosenOf(otherSelId)).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S7 D — THE ASSEMBLY the page renders', () => {
  it('D1 — grouped by area, and the DRAFT is not in it', async () => {
    const areas = await getPortalProjectSelections(PROJECT, S.linked!);
    const mine = areas.flatMap((a) => a.selections).filter((s) => s.name.startsWith(MARKER));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.map((s) => s.id)).not.toContain(draftId);
    expect(areas.find((a) => a.name === `${MARKER} Kitchen`), 'the fixture area is missing').toBeTruthy();
  });

  it('D2 — ⚠️ NO COST BASIS reaches the browser, asserted over the serialised payload', async () => {
    // The type has no cost fields, but a type is not a guarantee about what a
    // service actually put on the object. This reads the JSON the server
    // component would hand the client component.
    const areas = await getPortalProjectSelections(PROJECT, S.linked!);
    const json = JSON.stringify(areas);
    for (const leak of ['unit_cost', 'markup_percent', 'quantity', 'budgeted_amount', 'inherited_markup']) {
      expect(json, `"${leak}" reached the client payload`).not.toContain(leak);
    }
    // And it is not vacuous: a sell figure IS there.
    const single = areas.flatMap((a) => a.selections).find((s) => s.id === singleId)!;
    expect(single.options.some((o) => typeof o.sell === 'number' && o.sell > 0)).toBe(true);
  });

  it('D3 — ⚠️ a CLIENT-SUPPLIED selection has NULL deduction, not 0 — no phantom underage', async () => {
    // §5.4: excluded from the join. The fixture row IS linked to the allowance,
    // so a naive implementation would return 6,000 here and the page would tell
    // a client who bought her own tile that she had saved the whole allowance.
    const areas = await getPortalProjectSelections(PROJECT, S.linked!);
    const supplied = areas.flatMap((a) => a.selections).find((s) => s.id === suppliedId)!;
    expect(supplied.clientSupplied).toBe(true);
    expect(supplied.allowanceDeduction).toBeNull();
    expect(supplied.options.every((o) => o.sell === null)).toBe(true);
    // Non-vacuous: the SAME allowance yields a real figure on a money selection.
    const single = areas.flatMap((a) => a.selections).find((s) => s.id === singleId)!;
    expect(single.allowanceDeduction).toBeGreaterThan(0);
  });

  it('D4 — ⚠️ `approvedAt` falls back to the SESSION, and `signed_at` really is NULL', async () => {
    // Item 4's finding, one surface over. The CHECK nulls all four `signed_*`
    // columns on a client-supplied selection, `signed_at` included — so reading
    // the column alone prints a date on every selection EXCEPT this one.
    const stamp = await selRow(approvedSuppliedId);
    expect(stamp.status).toBe('approved');
    expect(stamp.signed_at, 'the stamp is not NULL — the fallback is untested').toBeNull();
    const areas = await getPortalProjectSelections(PROJECT, S.linked!);
    const row = areas.flatMap((a) => a.selections).find((s) => s.id === approvedSuppliedId)!;
    expect(row.approvedAt).toBeTruthy();
    expect(row.signed).toBeNull();
  });

  it('D5 — ⚠️ a STAFF caller gets NO figures out of this reader either', async () => {
    // If the portal reader is ever wired into a staff surface, it must hand
    // over nothing — the floor lives in the functions, not in the page.
    const areas = await getPortalProjectSelections(PROJECT, S.owner!);
    const mine = areas.flatMap((a) => a.selections).filter((s) => s.name.startsWith(MARKER));
    expect(mine.length, 'the owner sees no fixture selections — this probe is vacuous').toBeGreaterThan(0);
    expect(mine.every((s) => s.options.every((o) => o.sell === null))).toBe(true);
    expect(mine.every((s) => s.allowanceDeduction === null)).toBe(true);
  });

  it('D6 — Q8 through the assembly: the unlinked selection reads 0', async () => {
    const areas = await getPortalProjectSelections(PROJECT, S.linked!);
    const unlinked = areas.flatMap((a) => a.selections).find((s) => s.id === unlinkedId)!;
    expect(unlinked.allowanceDeduction).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S7 E — THE REAL SHIPPED ROUTE, and the loop through it', () => {
  it('E1 — the LINKED client picks through POST /api/portal/pick-selection', async () => {
    state.client = S.linked!;
    const res = await PICK(req('/api/portal/pick-selection', { selectionId: singleId, optionIds: [optB] }));
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    expect(await chosenOf(singleId)).toEqual([optB]);
  });

  it('E2 — the route relays the RPC’s own sentence on a refusal', async () => {
    state.client = S.linked!;
    const res = await PICK(req('/api/portal/pick-selection', { selectionId: singleId, optionIds: [optA, optB] }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/only one choice/i);
    expect(await chosenOf(singleId)).toEqual([optB]);
  });

  it('E3 — the CONTROL client is refused at the ACCESS-LEVEL gate, 403 — not by the project test', async () => {
    // ⚠️ MEASURED, NOT ASSUMED, AND IT IS WHY A6 EXISTS. She is unlinked, so
    // `my_client_access_level()` is not 'full' and the route stops her before
    // the RPC is ever called. A 403 here is CORRECT and is also the weaker of
    // the two refusals: it would be identical against a route with no project
    // scoping behind it. E3b is the one that proves the scoping.
    state.client = S.control!;
    const res = await PICK(req('/api/portal/pick-selection', { selectionId: singleId, optionIds: [optA] }));
    expect(res.status).toBe(403);
    expect(await chosenOf(singleId)).toEqual([optB]);
  });

  it('E3b — ⚠️ and a FULL-ACCESS client aimed at another client’s selection gets 409 from the RPC', async () => {
    state.client = S.linked!;
    const res = await PICK(req('/api/portal/pick-selection', { selectionId: otherSelId, optionIds: [otherOptId] }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/not found/i);
    expect(await chosenOf(otherSelId)).toEqual([]);
  });

  it('E4 — a STAFF caller never gets past the identity check', async () => {
    state.client = S.owner!;
    const res = await PICK(req('/api/portal/pick-selection', { selectionId: singleId, optionIds: [optA] }));
    expect(res.status).toBe(401);
    expect(await chosenOf(singleId)).toEqual([optB]);
  });

  it('E5 — THE LOOP: pick through the route, sign through the route, stamps match what she was shown', async () => {
    state.client = S.linked!;
    const picked = await PICK(req('/api/portal/pick-selection', { selectionId: singleId, optionIds: [optA] }));
    expect(picked.status).toBe(200);

    // The figures the PAGE would show, read the way the page reads them.
    const areas = await getPortalProjectSelections(PROJECT, S.linked!);
    const shown = areas.flatMap((a) => a.selections).find((s) => s.id === singleId)!;
    const shownSell = shown.options.filter((o) => o.is_chosen).reduce((n, o) => n + (o.sell ?? 0), 0);
    const shownDeduction = shown.allowanceDeduction!;
    expect(shownSell).toBeGreaterThan(0);

    const res = await SIGN(
      req('/api/portal/sign-selection', {
        selectionId: singleId,
        signature_type: 'draw',
        signature_data: sig.signatureData,
        signer_name: sig.signerName,
        consent_given: true,
      })
    );
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);

    const row = await selRow(singleId);
    expect(row.status).toBe('approved');
    expect(Number(row.signed_sell_amount)).toBe(shownSell);
    expect(Number(row.signed_allowance_deduction)).toBe(shownDeduction);
    expect(Number(row.signed_variance)).toBe(Math.round((shownSell - shownDeduction) * 100) / 100);
  });

  it('E6 — and Q5.3 holds through the route: she cannot re-pick afterwards', async () => {
    state.client = S.linked!;
    const before = await chosenOf(singleId);
    const res = await PICK(req('/api/portal/pick-selection', { selectionId: singleId, optionIds: [optB] }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/not awaiting your approval/i);
    expect(await chosenOf(singleId)).toEqual(before);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S7 F — the wording she reads is the wording stored', () => {
  it('F1 — `consent_text` on the completed session is `selectionConsentTextFor()` over the page figures', async () => {
    const row = await selRow(singleId);
    const expected = selectionConsentTextFor({
      clientSupplied: false,
      sellAmount: Number(row.signed_sell_amount),
      allowanceDeduction: Number(row.signed_allowance_deduction),
      variance: Number(row.signed_variance),
    });
    const { data: session } = await admin
      .from('selection_signing_sessions')
      .select('consent_text, status, superseded_at')
      .eq('selection_id', singleId)
      .eq('status', 'completed')
      .is('superseded_at', null)
      .single();
    expect(session!.consent_text).toBe(expected);
    // Non-vacuous: the sentence carries the actual figures, not placeholders.
    expect(session!.consent_text).toContain('accepts the stated costs');
  });

  it('F2 — the client-supplied variant is the no-money one, and says no charge applies', async () => {
    const { data: session } = await admin
      .from('selection_signing_sessions')
      .select('consent_text')
      .eq('selection_id', approvedSuppliedId)
      .eq('status', 'completed')
      .is('superseded_at', null)
      .single();
    expect(session!.consent_text).toBe(selectionConsentTextFor({ clientSupplied: true }));
    expect(session!.consent_text).not.toMatch(/\$/);
  });
});
