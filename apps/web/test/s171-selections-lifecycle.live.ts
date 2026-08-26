import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import {
  completeSelectionSignature,
  computeChosenFigures,
  declineSelection,
  offerSelection,
  releaseSelections,
  reopenSelection,
  reviseSelection,
  selectionConsentTextFor,
  withdrawSelectionOffer,
} from '@/lib/services/selection-lifecycle-service';
import { signSelectionOptionImages } from '@/lib/services/selections';

// ============================================================================
// S171 — Allowances & Selections STAGE 4: offer, sign, deny, revise.
// Migration 20261027000000 (notification types). Spec §5.3, §6; Q4 Q7 Q8 Q9.
//
// [S173, Josh] REWORKED, not deleted: "chosen" is the CLIENT's act. The offer
// releases priced options and stamps NOTHING; the client picks (`is_chosen`,
// stage 7's portal write — the admin client stands in for it here; the REAL
// client write shipped at S175 stage 7 and is exercised as her in
// `s175-stage7-portal-selections.live.ts`) and the
// SIGNATURE computes Q7's figures from her picks and stamps `signed_*`.
// Probes that asserted the company-chooses model are INVERTED below, each with
// its superseded assertion quoted.
// ============================================================================
//
// This file calls the REAL service functions with REAL sessions — the PM's for
// offer/revise, the LINKED client's for sign/decline, the CONTROL client's for
// the refusals — so what is proven is the write path the routes call, not a
// copy of it. Caller context is passed exactly as /api/portal/sign-selection
// passes it.
//
// THE SENTENCE THIS FILE EXISTS TO PROVE: approving a selection changes
// NEITHER input of 7B's contract-value derivation (project_financials
// .contract_value and Σ signed CO net_delta) and writes NOTHING to
// project_budget_items. [S175] Stage 5 READS those inputs (contract-value.ts
// sums signed_variance as a THIRD term) and still writes none of them — B3's
// assertion is about the writes and stands. _Superseded wording, quoted not
// deleted: "Stage 5 is not here, and the test says so."_

const MARKER = 'S171LIFE';
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9'; // QA A — isolation fixture
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const LINKED = 'josh+qa-client-linked@worthprop.com';
const CONTROL = 'josh+qa-client@worthprop.com';

type Client = SupabaseClient<Database>;
const S: Partial<Record<'owner' | 'pm' | 'sub' | 'linked' | 'control', Client>> = {};
const pid: Partial<Record<'owner' | 'pm' | 'sub' | 'linked' | 'control', string>> = {};
let companyId: string;
let allowanceItemId: string;
let materialMarkup: number;
let selId: string; // the money selection
let suppliedId: string; // the client-supplied one
let optA: string;
let optB: string;
let budgetBaseline: number;
let financialsBaseline: { contract: number | null; signedDelta: number };

const must = (l: string, e: { message: string } | null) => { if (e) throw new Error(`${l}: ${e.message}`); };
const sig = { signatureType: 'draw' as const, signatureData: 'data:image/png;base64,iVBORw0KGgo=', signerName: 'QA Client', signerIp: '127.0.0.1', signerUserAgent: 'vitest' };

async function sweep(): Promise<void> {
  const { data: sels } = await admin.from('selections').select('id').like('name', `${MARKER}%`);
  const ids = (sels ?? []).map((s) => s.id);
  if (ids.length) {
    await admin.from('notifications').delete().in('source_id', ids).eq('source_table', 'selections');
    await admin.from('selections').update({ signed_session_id: null }).in('id', ids);
    await admin.from('selection_signing_sessions').delete().in('selection_id', ids);
    const { data: opts } = await admin.from('selection_options').select('id').in('selection_id', ids);
    const oids = (opts ?? []).map((o) => o.id);
    if (oids.length) {
      await admin.from('selection_option_amounts').delete().in('option_id', oids);
      await admin.from('selection_options').delete().in('id', oids);
    }
    await admin.from('selection_notes').delete().in('selection_id', ids);
    await admin.from('selection_threads').delete().in('selection_id', ids);
    await admin.from('selections').delete().in('id', ids);
  }
  await admin.from('selection_areas').delete().like('name', `${MARKER}%`);
  // The fixture allowance budget line — UNCHARGED, so the service role may
  // delete it (s97ct-budget-immutability #6). Amounts first.
  const { data: items } = await admin.from('project_budget_items').select('id').eq('project_id', PROJECT).like('description', `${MARKER}%`);
  const iids = (items ?? []).map((i) => i.id);
  if (iids.length) {
    await admin.from('project_budget_amounts').delete().in('budget_item_id', iids);
    await admin.from('project_budget_items').delete().in('id', iids);
  }
}

async function financials() {
  const { data: f } = await admin.from('project_financials').select('contract_value').eq('project_id', PROJECT).maybeSingle();
  const { data: cos } = await admin.from('change_orders').select('net_delta').eq('project_id', PROJECT).eq('status', 'signed').eq('is_deleted', false);
  return { contract: f?.contract_value == null ? null : Number(f.contract_value), signedDelta: (cos ?? []).reduce((n, c) => n + Number(c.net_delta ?? 0), 0) };
}
async function budgetCount() {
  const { count } = await admin.from('project_budget_items').select('id', { count: 'exact', head: true }).eq('project_id', PROJECT);
  return count ?? 0;
}
const sel = async () => (await admin.from('selections').select('*').eq('id', selId).single()).data!;
const sessions = async (id = selId) => (await admin.from('selection_signing_sessions').select('*').eq('selection_id', id).order('created_at')).data ?? [];

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  const { data: co } = await admin.from('companies').select('id, default_material_markup_percent').eq('name', 'Bishop Contracting').single();
  companyId = co!.id;
  materialMarkup = Number(co!.default_material_markup_percent ?? 0);
  for (const [k, e] of [['owner', OWNER], ['pm', PM], ['sub', SUB], ['linked', LINKED], ['control', CONTROL]] as const) {
    S[k] = (await sessionFor(e)) as Client;
    const { data: p } = await admin.from('profiles').select('id, contact_id').eq('email', e).single();
    pid[k] = p!.id;
    if (k === 'linked' && !p!.contact_id) throw new Error('LINKED client is unlinked — run the seed.');
  }
  // A $5,000 allowance budget line with NO source row → markup falls to the
  // company material default (Q3 chain, last rung).
  const { data: item, error: iErr } = await admin
    .from('project_budget_items')
    .insert({ company_id: companyId, project_id: PROJECT, row_type: 'allowance', description: `${MARKER} tile allowance`, created_by: null })
    .select('id').single();
  must('budget item', iErr);
  allowanceItemId = item!.id;
  must('budget amount', (await admin.from('project_budget_amounts').insert({ company_id: companyId, budget_item_id: allowanceItemId, budgeted_amount: 5000 })).error);

  budgetBaseline = await budgetCount();
  financialsBaseline = await financials();

  const { data: area } = await admin.from('selection_areas').insert({ company_id: companyId, project_id: PROJECT, name: `${MARKER} Bath` }).select('id').single();
  const { data: s, error: sErr } = await admin
    .from('selections')
    .insert({ company_id: companyId, project_id: PROJECT, area_id: area!.id, name: `${MARKER} floor tile`, allowance_budget_item_id: allowanceItemId, allow_multiple: true })
    .select('id').single();
  must('selection', sErr);
  selId = s!.id;
  // [S173] Assembled UNCHOSEN — choosing is the client's act, made later (A5).
  const { data: a } = await admin.from('selection_options').insert({ company_id: companyId, selection_id: selId, name: `${MARKER} porcelain`, is_chosen: false }).select('id').single();
  const { data: b } = await admin.from('selection_options').insert({ company_id: companyId, selection_id: selId, name: `${MARKER} trim`, is_chosen: false }).select('id').single();
  optA = a!.id; optB = b!.id;
  // Sell: 10 × 500 × 1.20 = 6000 ; 1 × 250 × 1.20 = 300 → 6300
  must('amt A', (await admin.from('selection_option_amounts').insert({ company_id: companyId, option_id: optA, quantity: 10, unit_cost: 500, markup_percent: 20 })).error);
  must('amt B', (await admin.from('selection_option_amounts').insert({ company_id: companyId, option_id: optB, quantity: 1, unit_cost: 250, markup_percent: 20 })).error);

  const { data: sup, error: supErr } = await admin
    .from('selections')
    .insert({ company_id: companyId, project_id: PROJECT, area_id: area!.id, name: `${MARKER} client mirror`, client_supplied: true, allowance_budget_item_id: allowanceItemId })
    .select('id').single();
  must('supplied', supErr);
  suppliedId = sup!.id;
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin.from('selections').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  const { count: bc } = await admin.from('project_budget_items').select('id', { count: 'exact', head: true }).like('description', `${MARKER}%`);
  expect(count, 'selections left behind').toBe(0);
  expect(bc, 'the fixture allowance line was left behind').toBe(0);
}, 240_000);

// ───────────────────────────────────────────────────────────────────────────
describe('S171-4A [as reworked S173] — release: priced options out, NOTHING chosen, NOTHING stamped', () => {
  it('A0 — the gate is "a priced option EXISTS": a selection whose only option is unpriced is refused; pricing it opens the gate', async () => {
    const { data: bare } = await admin.from('selections').insert({ company_id: companyId, project_id: PROJECT, name: `${MARKER} unpriced shelf` }).select('id').single();
    const { data: o } = await admin.from('selection_options').insert({ company_id: companyId, selection_id: bare!.id, name: `${MARKER} pine`, is_chosen: false }).select('id').single();
    const refused = await offerSelection(S.pm!, bare!.id);
    expect(refused.success).toBe(false);
    expect(refused.error).toMatch(/priced option/);
    must('price it', (await admin.from('selection_option_amounts').insert({ company_id: companyId, option_id: o!.id, quantity: 1, unit_cost: 100, markup_percent: 0 })).error);
    expect((await offerSelection(S.pm!, bare!.id)).success).toBe(true);
  });

  it('A1 — with NOTHING chosen the figures are not computable: that refusal now belongs to the SIGNATURE, not the offer', async () => {
    // _Superseded probe, quoted not deleted: "A1 — figures: Σ chosen sell
    // 6300 …" computed BEFORE the offer, over company-ticked options._
    const f = await computeChosenFigures(admin, selId);
    expect('error' in f && f.error).toMatch(/Choose at least one option/);
  });

  it('A2 — a SUB cannot offer: the RLS update affects zero rows and the status is unchanged', async () => {
    const r = await offerSelection(S.sub!, selId);
    expect(r.success).toBe(false);
    expect((await sel()).status).toBe('draft');
    expect(await sessions()).toHaveLength(0);
  });

  it('A3 — the PM releases with NOTHING chosen: awaiting_approval, offered_* NULL, one pending session', async () => {
    // _Superseded assertion: "offered_* STAMPED … expect(Number(
    // s.offered_sell_amount)).toBe(6300)". The offer stamps nothing now —
    // there is no chosen set to price until the client picks._
    const r = await offerSelection(S.pm!, selId);
    expect(r.success, r.error).toBe(true);
    const s = await sel();
    expect(s.status).toBe('awaiting_approval');
    expect(s.offered_sell_amount).toBeNull();
    expect(s.offered_at).toBeNull();
    const ss = await sessions();
    expect(ss).toHaveLength(1);
    expect(ss[0].status).toBe('pending');
    expect(ss[0].signer_channel).toBe('portal_session');
  });

  it('A4 — a cost edit after release still writes no stamp; the client signs the figure computed AT the signature', async () => {
    must('edit', (await admin.from('selection_option_amounts').update({ unit_cost: 999 }).eq('option_id', optB)).error);
    expect((await sel()).offered_sell_amount).toBeNull();
    must('restore', (await admin.from('selection_option_amounts').update({ unit_cost: 250 }).eq('option_id', optB)).error);
  });

  it('A5 — the CLIENT picks (stage-7 stand-in) and Q7 prices the picked set: Σ 6300, deduction = 5000 × (1 + material default)', async () => {
    must('pick A', (await admin.from('selection_options').update({ is_chosen: true }).eq('id', optA)).error);
    must('pick B', (await admin.from('selection_options').update({ is_chosen: true }).eq('id', optB)).error);
    const f = await computeChosenFigures(admin, selId);
    if ('error' in f) throw new Error(f.error);
    const expectedDeduction = Math.round(5000 * (1 + materialMarkup / 100) * 100) / 100;
    expect(f.sellAmount).toBe(6300);
    expect(f.allowanceDeduction).toBe(expectedDeduction);
    expect(f.variance).toBe(Math.round((6300 - expectedDeduction) * 100) / 100);
    expect(f.lines.map((l) => l.sell).sort()).toEqual([300, 6000]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S171-4B — sign (Q4): the binding instrument, portal caller-context, one write path', () => {
  it('B1 — CONTROL client is refused (her RLS arm returns no row) and nothing changes', async () => {
    const r = await completeSelectionSignature(S.control!, selId, { ...sig, caller: { kind: 'portal_session', profileId: pid.control! } });
    expect(r.success).toBe(false);
    expect((await sel()).status).toBe('awaiting_approval');
    expect((await sessions())[0].status).toBe('pending');
  });

  it('B1b — signing with NOTHING picked is refused: the choose-first gate moved from the offer to the signature', async () => {
    must('unpick', (await admin.from('selection_options').update({ is_chosen: false }).in('id', [optA, optB])).error);
    const r = await completeSelectionSignature(S.linked!, selId, { ...sig, caller: { kind: 'portal_session', profileId: pid.linked! } });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Choose at least one option/);
    expect((await sel()).status).toBe('awaiting_approval');
    must('repick A', (await admin.from('selection_options').update({ is_chosen: true }).eq('id', optA)).error);
    must('repick B', (await admin.from('selection_options').update({ is_chosen: true }).eq('id', optB)).error);
  });

  it('B2 — LINKED client signs: approved, signed_* computed AT the signature from HER picks, offered_* still NULL', async () => {
    // _Superseded assertion: "signed_* = offered_*" — the signature copied the
    // offer's stamp. There is no offer stamp any more; the signature IS the
    // pricing moment (Q7 over the client's chosen set)._
    const r = await completeSelectionSignature(S.linked!, selId, { ...sig, caller: { kind: 'portal_session', profileId: pid.linked! } });
    expect(r.success, r.error).toBe(true);
    const s = await sel();
    expect(s.status).toBe('approved');
    expect(Number(s.signed_sell_amount)).toBe(6300);
    expect(s.offered_sell_amount).toBeNull();
    expect(s.signed_variance).not.toBeNull();
    expect(s.signed_session_id).not.toBeNull();
    const [ss] = await sessions();
    expect(ss.status).toBe('completed');
    expect(ss.signer_channel).toBe('portal_session');
    expect(ss.signer_profile_id).toBe(pid.linked);
    expect(ss.consent_given).toBe(true);
    expect(ss.consent_text).toMatch(/This signature is binding and accepts the stated costs/);
    expect(ss.consent_text).toMatch(/\$6,300\.00/);
    const snap = ss.snapshot as { chosen_options: unknown[]; consent_text: string; agreed: { sell_amount: number } };
    expect(snap.chosen_options).toHaveLength(2);
    expect(snap.agreed.sell_amount).toBe(6300);
    expect(snap.consent_text).toBe(ss.consent_text);
  });

  it('B3 — ⚠️ NO CHANGE ORDER was generated, 7B inputs are UNCHANGED, project_budget_items UNCHANGED (stage 5 reads them; it writes none of them)', async () => {
    const { count } = await admin.from('change_orders').select('id', { count: 'exact', head: true }).eq('project_id', PROJECT).like('title', `%${MARKER}%`);
    expect(count).toBe(0);
    expect(await financials()).toEqual(financialsBaseline);
    expect(await budgetCount()).toBe(budgetBaseline);
  });

  it('B4 — Owner/Admin got a selection_approved notification naming the added price (Q9)', async () => {
    const { data } = await admin.from('notifications').select('recipient_profile_id, type, title, body, link_key').eq('source_table', 'selections').eq('source_id', selId).eq('type', 'selection_approved');
    expect((data ?? []).length).toBeGreaterThan(0);
    expect(data!.some((n) => n.recipient_profile_id === pid.owner)).toBe(true);
    expect(data![0].link_key).toBe('selection');
    expect(data![0].body).toMatch(/Added price|Credit owed/);
  });

  it('B5 — signing again is refused: the selection is no longer awaiting approval', async () => {
    const r = await completeSelectionSignature(S.linked!, selId, { ...sig, caller: { kind: 'portal_session', profileId: pid.linked! } });
    expect(r.success).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S171-4C — revise (Q9): prior signature RETAINED, one current at a time', () => {
  it('C1 — the PM revises: in_discussion, signed_* cleared, the completed session SUPERSEDED not deleted', async () => {
    const r = await reviseSelection(S.pm!, selId);
    expect(r.success, r.error).toBe(true);
    const s = await sel();
    expect(s.status).toBe('in_discussion');
    expect(s.signed_at).toBeNull();
    expect(s.signed_session_id).toBeNull();
    const ss = await sessions();
    expect(ss).toHaveLength(1);
    expect(ss[0].status).toBe('completed');
    expect(ss[0].superseded_at).not.toBeNull();
    expect(ss[0].signature_data, 'the old signature was destroyed').toBe(sig.signatureData);
  });

  it('C2 — re-offer and re-sign: a SECOND completed session; the first still superseded; exactly one current', async () => {
    expect((await offerSelection(S.pm!, selId)).success).toBe(true);
    const r = await completeSelectionSignature(S.linked!, selId, { ...sig, signerName: 'QA Client (2nd)', caller: { kind: 'portal_session', profileId: pid.linked! } });
    expect(r.success, r.error).toBe(true);
    const ss = await sessions();
    expect(ss.filter((x) => x.status === 'completed')).toHaveLength(2);
    expect(ss.filter((x) => x.status === 'completed' && x.superseded_at === null)).toHaveLength(1);
    expect((await sel()).status).toBe('approved');
  });

  it('C3 — a SUB cannot revise (zero rows); the selection stays approved', async () => {
    expect((await reviseSelection(S.sub!, selId)).success).toBe(false);
    expect((await sel()).status).toBe('approved');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S171-4D — deny (Q9 as amended S172): DENIED is a RESTING state; reopen is the company\'s act', () => {
  // [S172] INVERTED, not deleted. _Superseded title: "deny (Q9): a return to
  // DRAFT, not a terminus" — asserting status 'draft' and stamps cleared right
  // after the client declined._ Josh: "it should be flagged as denied. A user
  // can choose to re-open it, which moves to draft."
  it('D1 — revise → offer → LINKED declines with a note: session declined, selection DENIED, Owner/Admin notified', async () => {
    // _Superseded assertion [S172]: "stamps KEPT … expect(Number(
    // s.offered_sell_amount), 'the company must still see what was refused')
    // .toBe(6300)". Under client-choice there IS no offered figure to keep —
    // what was refused is the released option set, and the record of the
    // refusal is the DECLINED SESSION and its note, asserted below._
    expect((await reviseSelection(S.pm!, selId)).success).toBe(true);
    expect((await offerSelection(S.pm!, selId)).success).toBe(true);
    const r = await declineSelection(S.linked!, selId, { caller: { kind: 'portal_session', profileId: pid.linked! }, notes: 'Too dark for the bath' });
    expect(r.success, r.error).toBe(true);
    const s = await sel();
    expect(s.status).toBe('denied');
    expect(s.offered_sell_amount).toBeNull();
    const declined = (await sessions()).filter((x) => x.status === 'declined');
    expect(declined).toHaveLength(1);
    expect(declined[0].decline_notes).toBe('Too dark for the bath');
    const { data } = await admin.from('notifications').select('body').eq('source_id', selId).eq('type', 'selection_denied');
    expect((data ?? []).length).toBeGreaterThan(0);
    expect(data![0].body).toMatch(/Too dark/);
    expect(data![0].body).toMatch(/reopen/);
  });

  it('D1b — a denied selection does NOT auto-return: it is still denied, the LINKED client still sees it, offer is refused', async () => {
    expect((await sel()).status).toBe('denied');
    const { data } = await S.linked!.from('selections').select('id, status').eq('id', selId);
    expect(data?.[0]?.status).toBe('denied');
    expect((await offerSelection(S.pm!, selId)).success, 'a denied selection was re-offered without reopening').toBe(false);
  });

  it('D1c — a SUB cannot reopen (zero rows); the PM reopens → draft, stamps cleared, declined session kept', async () => {
    expect((await reopenSelection(S.sub!, selId)).success).toBe(false);
    expect((await sel()).status).toBe('denied');
    const r = await reopenSelection(S.pm!, selId);
    expect(r.success, r.error).toBe(true);
    const s = await sel();
    expect(s.status).toBe('draft');
    expect(s.offered_sell_amount).toBeNull();
    expect((await sessions()).filter((x) => x.status === 'declined')).toHaveLength(1);
  });

  it('D2 — CONTROL cannot decline (no row); a draft cannot be declined', async () => {
    expect((await offerSelection(S.pm!, selId)).success).toBe(true);
    expect((await declineSelection(S.control!, selId, { caller: { kind: 'portal_session', profileId: pid.control! }, notes: null })).success).toBe(false);
    expect((await sel()).status).toBe('awaiting_approval');
  });

  it('D3 — withdraw (company): awaiting_approval → draft, pending session INVALIDATED (kept)', async () => {
    expect((await withdrawSelectionOffer(S.sub!, selId)).success, 'a sub withdrew').toBe(false);
    const r = await withdrawSelectionOffer(S.owner!, selId);
    expect(r.success, r.error).toBe(true);
    expect((await sel()).status).toBe('draft');
    expect((await sessions()).filter((x) => x.status === 'invalidated').length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S171-4E — client-supplied (Q6): no money, no-money wording, allowance untouched', () => {
  it('E1 — the consent wording has a no-money variant and a money variant', () => {
    expect(selectionConsentTextFor({ clientSupplied: true })).toMatch(/supplying this item myself; no charge applies. This signature is binding/);
    expect(selectionConsentTextFor({ clientSupplied: false, sellAmount: 6300, allowanceDeduction: 5000, variance: 1300 })).toMatch(/accept the stated price of \$6,300\.00, less my allowance of \$5,000\.00, for an added price of \$1,300\.00/);
    expect(selectionConsentTextFor({ clientSupplied: false, sellAmount: 4200, allowanceDeduction: 5000, variance: -800 })).toMatch(/for a credit of \$800\.00/);
  });

  it('E2 — offer + sign a client-supplied selection: approved with NO stamps; the session carries the no-money wording', async () => {
    expect((await offerSelection(S.pm!, suppliedId)).success).toBe(true);
    const r = await completeSelectionSignature(S.linked!, suppliedId, { ...sig, caller: { kind: 'portal_session', profileId: pid.linked! } });
    expect(r.success, r.error).toBe(true);
    const { data: s } = await admin.from('selections').select('*').eq('id', suppliedId).single();
    expect(s!.status).toBe('approved');
    expect(s!.signed_sell_amount).toBeNull();
    expect(s!.offered_sell_amount).toBeNull();
    const [ss] = await sessions(suppliedId);
    expect(ss.status).toBe('completed');
    expect(ss.consent_text).toMatch(/no charge applies/);
    expect(ss.consent_text).not.toMatch(/stated costs/);
  });

  it('E3 — Q8: an UNLINKED selection is a pure add — deduction 0, variance = full sell', async () => {
    const { data: u } = await admin.from('selections').insert({ company_id: companyId, project_id: PROJECT, name: `${MARKER} unlinked rug` }).select('id').single();
    const { data: o } = await admin.from('selection_options').insert({ company_id: companyId, selection_id: u!.id, name: `${MARKER} rug`, is_chosen: true }).select('id').single();
    must('amt', (await admin.from('selection_option_amounts').insert({ company_id: companyId, option_id: o!.id, quantity: 1, unit_cost: 1000, markup_percent: 10 })).error);
    const f = await computeChosenFigures(admin, u!.id);
    if ('error' in f) throw new Error(f.error);
    expect(f.allowanceDeduction).toBe(0);
    expect(f.variance).toBe(1100);

    // [S173] `allow_multiple` is enforced where the figures are computed: the
    // rug selection is single-choice (column default false), so a second pick
    // is refused rather than silently summed.
    const { data: o2 } = await admin.from('selection_options').insert({ company_id: companyId, selection_id: u!.id, name: `${MARKER} rug 2`, is_chosen: true }).select('id').single();
    must('amt2', (await admin.from('selection_option_amounts').insert({ company_id: companyId, option_id: o2!.id, quantity: 1, unit_cost: 500, markup_percent: 0 })).error);
    const g = await computeChosenFigures(admin, u!.id);
    expect('error' in g && g.error).toMatch(/only one choice/);
  });

  it('E4 — [S173 Job 3] releaseSelections: a PARTIAL batch — the refused one does not un-release the others', async () => {
    // Two fresh selections: one priced, one with no options at all. Released
    // together, the priced one goes awaiting and the bare one is refused with
    // its own error — the batch is delivery, not a transaction.
    const { data: ok } = await admin.from('selections').insert({ company_id: companyId, project_id: PROJECT, name: `${MARKER} batch ok` }).select('id').single();
    const { data: opt } = await admin.from('selection_options').insert({ company_id: companyId, selection_id: ok!.id, name: `${MARKER} slate`, is_chosen: false }).select('id').single();
    must('amt', (await admin.from('selection_option_amounts').insert({ company_id: companyId, option_id: opt!.id, quantity: 1, unit_cost: 200, markup_percent: 0 })).error);
    const { data: bare } = await admin.from('selections').insert({ company_id: companyId, project_id: PROJECT, name: `${MARKER} batch bare` }).select('id').single();

    const { results } = await releaseSelections(S.pm!, [ok!.id, bare!.id]);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.id === ok!.id)!.success).toBe(true);
    expect(results.find((r) => r.id === bare!.id)!.success).toBe(false);
    expect(results.find((r) => r.id === bare!.id)!.error).toMatch(/priced option/);
    const { data: after } = await admin.from('selections').select('id, status').in('id', [ok!.id, bare!.id]);
    expect(after!.find((s) => s.id === ok!.id)!.status).toBe('awaiting_approval');
    expect(after!.find((s) => s.id === bare!.id)!.status).toBe('draft');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S172-B — option images through the SECURITY DEFINER read: "if you can see the selection, you can see its images"', () => {
  let fileId: string;
  let optId: string;
  it('B0 — fixture: a PM-uploaded image (client_visible FALSE) on a chosen option of the money selection', async () => {
    // Written as the PM would write it: files_insert_non_client forbids
    // client_visible=true for a PM, so this row is invisible to the client
    // through the general files arm. That is the point of the probe.
    // A real object — createSignedUrl refuses a key that does not exist.
    const path = `${companyId}/${PROJECT}/${MARKER}-tile.jpg`;
    const { error: upErr } = await admin.storage.from('project-files').upload(path, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { contentType: 'image/jpeg', upsert: true });
    must('storage', upErr);
    const { data: f, error } = await admin.from('files').insert({
      company_id: companyId, project_id: PROJECT, category: 'photos', file_name: `${MARKER}-tile.jpg`,
      file_path: `${companyId}/${PROJECT}/${MARKER}-tile.jpg`, file_size: 1, mime_type: 'image/jpeg', client_visible: false, created_by: null,
    }).select('id').single();
    must('file', error);
    fileId = f!.id;
    optId = optA;
    must('attach', (await admin.from('selection_options').update({ image_file_id: fileId }).eq('id', optId)).error);
    // The selection is in draft right now (D1c); re-offer it so the client arm admits it.
    expect((await offerSelection(S.pm!, selId)).success).toBe(true);
  });

  it('B1 — the LINKED client CANNOT read the file row directly (not client_visible) …', async () => {
    const { data } = await S.linked!.from('files').select('id').eq('id', fileId);
    expect(data ?? []).toHaveLength(0);
  });

  it('B2 — … but the definer read returns its path to her, keyed on the selection', async () => {
    const { data, error } = await S.linked!.rpc('selection_option_images', { p_selection_id: selId });
    expect(error).toBeNull();
    const rows = (data ?? []) as { option_id: string; kind: string; file_id: string }[];
    expect(rows.some((r) => r.option_id === optId && r.file_id === fileId && r.kind === 'image')).toBe(true);
  });

  it('B3 — and signSelectionOptionImages() hands her a signed URL for it', async () => {
    const map = await signSelectionOptionImages(selId, S.linked!);
    expect(map[optId]?.image).toMatch(/^https?:\/\//);
  });

  for (const role of ['owner', 'pm', 'sub'] as const) {
    it(`B4-${role} — staff who can see the selection get the path too`, async () => {
      const { data } = await S[role]!.rpc('selection_option_images', { p_selection_id: selId });
      expect(((data ?? []) as { file_id: string }[]).some((r) => r.file_id === fileId)).toBe(true);
    });
  }

  it('B5 — CONTROL client (no project) gets NOTHING — and it is not a broken session', async () => {
    const { data: me } = await S.control!.from('profiles').select('id').limit(1); // own row only, by RLS
    expect(me?.length).toBe(1);
    const { data, error } = await S.control!.rpc('selection_option_images', { p_selection_id: selId });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
    expect(await signSelectionOptionImages(selId, S.control!)).toEqual({});
  });

  it('B6 — a DRAFT selection\'s images are hidden from the client but not from staff (the arm is restated correctly)', async () => {
    expect((await withdrawSelectionOffer(S.owner!, selId)).success).toBe(true); // → draft
    const { data: c } = await S.linked!.rpc('selection_option_images', { p_selection_id: selId });
    expect(c ?? []).toHaveLength(0);
    const { data: s } = await S.sub!.rpc('selection_option_images', { p_selection_id: selId });
    expect(((s ?? []) as unknown[]).length).toBeGreaterThan(0);
  });

  it('B7 — the general client_visible mechanism is untouched: the file row still says FALSE', async () => {
    const { data } = await admin.from('files').select('client_visible').eq('id', fileId).single();
    expect(data!.client_visible).toBe(false);
    await admin.from('selection_options').update({ image_file_id: null }).eq('id', optId);
    await admin.from('files').delete().eq('id', fileId);
    await admin.storage.from('project-files').remove([`${companyId}/${PROJECT}/${MARKER}-tile.jpg`]);
  });
});
