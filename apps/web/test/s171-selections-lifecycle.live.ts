import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import {
  completeSelectionSignature,
  computeOfferedFigures,
  declineSelection,
  offerSelection,
  reviseSelection,
  selectionConsentTextFor,
  withdrawSelectionOffer,
} from '@/lib/services/selection-lifecycle-service';

// ============================================================================
// S171 — Allowances & Selections STAGE 4: offer, sign, deny, revise.
// Migration 20261027000000 (notification types). Spec §5.3, §6; Q4 Q7 Q8 Q9.
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
// project_budget_items. Stage 5 is not here, and the test says so.

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
  const { data: a } = await admin.from('selection_options').insert({ company_id: companyId, selection_id: selId, name: `${MARKER} porcelain`, is_chosen: true }).select('id').single();
  const { data: b } = await admin.from('selection_options').insert({ company_id: companyId, selection_id: selId, name: `${MARKER} trim`, is_chosen: true }).select('id').single();
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
describe('S171-4A — offer: sum-then-compare (Q7) against the allowance sell', () => {
  it('A1 — figures: Σ chosen sell 6300, deduction = 5000 × (1 + material default), variance = the difference', async () => {
    const f = await computeOfferedFigures(admin, selId);
    if ('error' in f) throw new Error(f.error);
    const expectedDeduction = Math.round(5000 * (1 + materialMarkup / 100) * 100) / 100;
    expect(f.sellAmount).toBe(6300);
    expect(f.allowanceDeduction).toBe(expectedDeduction);
    expect(f.variance).toBe(Math.round((6300 - expectedDeduction) * 100) / 100);
    expect(f.lines.map((l) => l.sell).sort()).toEqual([300, 6000]);
  });

  it('A2 — a SUB cannot offer: the RLS update affects zero rows and the status is unchanged', async () => {
    const r = await offerSelection(S.sub!, selId);
    expect(r.success).toBe(false);
    expect((await sel()).status).toBe('draft');
    expect(await sessions()).toHaveLength(0);
  });

  it('A3 — the PM offers: status awaiting_approval, offered_* STAMPED, one pending session', async () => {
    const r = await offerSelection(S.pm!, selId);
    expect(r.success, r.error).toBe(true);
    const s = await sel();
    expect(s.status).toBe('awaiting_approval');
    expect(Number(s.offered_sell_amount)).toBe(6300);
    expect(s.offered_at).not.toBeNull();
    const ss = await sessions();
    expect(ss).toHaveLength(1);
    expect(ss[0].status).toBe('pending');
    expect(ss[0].signer_channel).toBe('portal_session');
  });

  it('A4 — editing a cost AFTER the offer does not move the offered stamp (the client signs a figure)', async () => {
    must('edit', (await admin.from('selection_option_amounts').update({ unit_cost: 999 }).eq('option_id', optB)).error);
    expect(Number((await sel()).offered_sell_amount)).toBe(6300);
    must('restore', (await admin.from('selection_option_amounts').update({ unit_cost: 250 }).eq('option_id', optB)).error);
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

  it('B2 — LINKED client signs: approved, signed_* = offered_*, session completed with consent + snapshot + channel', async () => {
    const r = await completeSelectionSignature(S.linked!, selId, { ...sig, caller: { kind: 'portal_session', profileId: pid.linked! } });
    expect(r.success, r.error).toBe(true);
    const s = await sel();
    expect(s.status).toBe('approved');
    expect(Number(s.signed_sell_amount)).toBe(6300);
    expect(s.signed_variance).toBe(s.offered_variance);
    expect(s.signed_session_id).not.toBeNull();
    const [ss] = await sessions();
    expect(ss.status).toBe('completed');
    expect(ss.signer_channel).toBe('portal_session');
    expect(ss.signer_profile_id).toBe(pid.linked);
    expect(ss.consent_given).toBe(true);
    expect(ss.consent_text).toMatch(/This signature is binding and accepts the stated costs/);
    expect(ss.consent_text).toMatch(/\$6,300\.00/);
    const snap = ss.snapshot as { chosen_options: unknown[]; consent_text: string };
    expect(snap.chosen_options).toHaveLength(2);
    expect(snap.consent_text).toBe(ss.consent_text);
  });

  it('B3 — ⚠️ NO CHANGE ORDER was generated, 7B inputs are UNCHANGED, project_budget_items UNCHANGED (stage 5 is not here)', async () => {
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
describe('S171-4D — deny (Q9): a return to DRAFT, not a terminus', () => {
  it('D1 — revise → offer → LINKED declines with a note: session declined, selection DRAFT, stamps cleared, Owner/Admin notified', async () => {
    expect((await reviseSelection(S.pm!, selId)).success).toBe(true);
    expect((await offerSelection(S.pm!, selId)).success).toBe(true);
    const r = await declineSelection(S.linked!, selId, { caller: { kind: 'portal_session', profileId: pid.linked! }, notes: 'Too dark for the bath' });
    expect(r.success, r.error).toBe(true);
    const s = await sel();
    expect(s.status).toBe('draft');
    expect(s.offered_sell_amount).toBeNull();
    const declined = (await sessions()).filter((x) => x.status === 'declined');
    expect(declined).toHaveLength(1);
    expect(declined[0].decline_notes).toBe('Too dark for the bath');
    const { data } = await admin.from('notifications').select('body').eq('source_id', selId).eq('type', 'selection_denied');
    expect((data ?? []).length).toBeGreaterThan(0);
    expect(data![0].body).toMatch(/Too dark/);
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
    const f = await computeOfferedFigures(admin, u!.id);
    if ('error' in f) throw new Error(f.error);
    expect(f.allowanceDeduction).toBe(0);
    expect(f.variance).toBe(1100);
  });
});
