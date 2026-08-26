import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import {
  completeSelectionSignature,
  offerSelection,
  reviseSelection,
} from '@/lib/services/selection-lifecycle-service';
import {
  getPortfolioRevisedContract,
  getRevisedContract,
  getRevisedContractMap,
  getSelectionBilling,
} from '@/lib/services/contract-value';

// ============================================================================
// S175 #3 — Allowances & Selections STAGE 5: an approved selection becomes
// MONEY. Migrations 20261034000000 + 20261035000000. Spec §5.4, §7.1, §7.2;
// Josh's S175 rulings Q3.1–Q3.4 (docs/specs/S175-questions.md).
// ============================================================================
//
// WHAT THIS FILE PROVES, in the order the money flows:
//
//   A  the DATABASE shape — three-way instrument CHECK, the line-item shape
//      check refusing a selection line BY CONSTRUCTION (no third arm needed),
//      and every refusal re-read through the service role, because a 42501 /
//      23514 alone cannot tell a refused WRITE from a refused RETURNING.
//   B  the selection CEILING — the overage escapes the CONTRACT ceiling on a
//      fully-billed fixed-price contract (the same amount against the estimate
//      is refused), is capped at signed_variance, restores on void, refuses an
//      unsigned selection, treats variance 0.00 as a cap of zero, and applies
//      on a cost-plus project too (signed_variance is not a P11 projection).
//   C  the COST side — `expense_allocations.source_selection_id` has a shape
//      (same project, not client-supplied, the linked allowance line) and
//      `approve_expense()` carries it through its delete-and-reinsert.
//   D  contract value — `getRevisedContract` rises by signed_variance on the
//      fixed-price job, and on the cost-plus control the variance is EXCLUDED
//      and says so (`selectionDeltaExcluded`), never silently absent.
//   E  `getSelectionBilling()` — billed vs signed → remaining, per kind.
//   F  profitability — the selection is a third instrument: its cost and its
//      sell both reach the report, and the `allowance` category is no longer
//      dropped by `aggregateCategories`.
//   G  the budget subcategory (§5.4) — derived in budget.ts, nothing written.
//
// EVERY selection here is approved THROUGH THE REAL SIGNATURE PATH — the
// owner releases, the client picks (admin stands in for stage 7's portal
// write), the LINKED client signs via completeSelectionSignature — because a
// selection with hand-written signed_* stamps would prove the stamps, not the
// path that produces them.
//
// ⚠️ FIXTURE KEYS ARE COLLIDABLE (spec §10 #19): every row carries MARKER in
// its name and is swept in beforeAll AND afterAll; afterAll asserts zero
// residue and THROWS, so a leak fails this run rather than the next.
// ============================================================================

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

const MARKER = 'S175S5';
const OWNER = 'josh+test50@worthprop.com';
const LINKED = 'josh+qa-client-linked@worthprop.com';

type Client = SupabaseClient<Database>;
let ownerC: Client;
let linkedC: Client;
let companyId: string;
let ownerMemberId: string;
let linkedProfileId: string;
let linkedContactId: string;

/** The fixed-price job: estimate + project + $10,000 contract. */
let estimateId: string;
let projectId: string;
let allowanceItemId: string; // $5,000 tile allowance, linked
let otherItemId: string; // a second budget line, for the "wrong line" probe
/** The cost-plus control. */
let cpEstimateId: string;
let cpProjectId: string;
let cpAllowanceItemId: string;

/** Selections on the fixed-price job. */
let selId: string; // approved, positive variance
let selVariance: number;
let selSell: number;
let zeroSelId: string; // approved, variance exactly 0.00
let creditSelId: string; // approved, negative variance
let creditVariance: number;
let pendingSelId: string; // released, never signed
let suppliedSelId: string; // client-supplied, approved with no stamps
/** On the cost-plus control. */
let cpSelId: string;
let cpVariance: number;

const invoiceIds: string[] = [];

const must = (l: string, e: { message: string } | null) => {
  if (e) throw new Error(`${l}: ${e.message}`);
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const sig = {
  signatureType: 'draw' as const,
  signatureData: 'data:image/png;base64,iVBORw0KGgo=',
  signerName: 'QA Client',
  signerIp: '127.0.0.1',
  signerUserAgent: 'vitest',
};

// ── sweep ───────────────────────────────────────────────────────────────────
async function sweep(): Promise<void> {
  // Invoices first (lines cascade). Sent/voided invoices refuse a direct line
  // delete but the parent delete cascades cleanly.
  const { data: projs } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  const pids = (projs ?? []).map((p) => p.id);
  if (pids.length) {
    await admin.from('invoices').delete().in('project_id', pids);
    const { data: exps } = await admin.from('expenses').select('id').in('project_id', pids);
    const eids = (exps ?? []).map((e) => e.id);
    if (eids.length) {
      await admin.from('expense_allocations').delete().in('expense_id', eids);
      await admin.from('expenses').delete().in('id', eids);
    }
  }
  const { data: sels } = await admin.from('selections').select('id').like('name', `${MARKER}%`);
  const sids = (sels ?? []).map((s) => s.id);
  if (sids.length) {
    await admin.from('notifications').delete().in('source_id', sids).eq('source_table', 'selections');
    // The FK runs BOTH ways (selections.signed_session_id → sessions →
    // selections), and the four signed_* stamps travel together by CHECK — so
    // all four are cleared at once, with the status they imply, before the
    // session rows can go. Nulling the session id alone fails that CHECK
    // silently and the sweep then dies on the selections delete.
    must('unstamp', (await admin.from('selections').update({
      status: 'draft', signed_session_id: null, signed_sell_amount: null,
      signed_allowance_deduction: null, signed_variance: null, signed_at: null,
    }).in('id', sids)).error);
    must('sessions', (await admin.from('selection_signing_sessions').delete().in('selection_id', sids)).error);
    const { data: opts } = await admin.from('selection_options').select('id').in('selection_id', sids);
    const oids = (opts ?? []).map((o) => o.id);
    if (oids.length) {
      await admin.from('selection_option_amounts').delete().in('option_id', oids);
      await admin.from('selection_options').delete().in('id', oids);
    }
    await admin.from('selection_amounts').delete().in('selection_id', sids);
    await admin.from('selection_notes').delete().in('selection_id', sids);
    await admin.from('selection_threads').delete().in('selection_id', sids);
    must('sweep selections', (await admin.from('selections').delete().in('id', sids)).error);
  }
  await admin.from('selection_areas').delete().like('name', `${MARKER}%`);
  if (pids.length) {
    const { data: items } = await admin.from('project_budget_items').select('id').in('project_id', pids);
    const iids = (items ?? []).map((i) => i.id);
    if (iids.length) {
      await admin.from('project_budget_amounts').delete().in('budget_item_id', iids);
      must('sweep budget items', (await admin.from('project_budget_items').delete().in('id', iids)).error);
    }
    await admin.from('project_financials').delete().in('project_id', pids);
    must('sweep projects', (await admin.from('projects').delete().in('id', pids)).error);
  }
  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const estIds = (ests ?? []).map((e) => e.id);
  if (estIds.length) {
    await admin.from('estimate_categories').delete().in('estimate_id', estIds);
    must('sweep estimates', (await admin.from('estimates').delete().in('id', estIds)).error);
  }
  await admin.from('contacts').delete().like('first_name', `${MARKER}%`);
}

// ── fixture builders ────────────────────────────────────────────────────────
async function makeJob(kind: 'fixed_price' | 'cost_plus', label: string, contract: number) {
  const { data: counters } = await admin
    .from('companies')
    .select('estimate_number_sequence, project_internal_sequence')
    .eq('id', companyId)
    .single();
  const seq = counters!.estimate_number_sequence + 1;
  const internal = counters!.project_internal_sequence + 1;
  const { data: est, error: eErr } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      contact_id: linkedContactId,
      name: `${MARKER} — ${label}`,
      estimate_number: `EST-${String(seq).padStart(4, '0')}`,
      status: 'accepted',
      contract_type: kind,
      created_by_role: 'owner',
      subtotal: contract,
      grand_total: contract,
      discount_total: 0,
    })
    .select('id')
    .single();
  must(`estimate ${label}`, eErr);
  const { data: proj, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      name: `${MARKER} — ${label}`,
      // The LINKED client reaches the project through projects.contact_id
      // (STATE.md arm a) — that is what lets her sign here.
      contact_id: linkedContactId,
      project_type: kind,
      source_estimate_id: est!.id,
      project_number: `PRJ-${String(seq).padStart(3, '0')}`,
      project_internal_seq: internal,
    })
    .select('id')
    .single();
  must(`project ${label}`, pErr);
  must(
    `financials ${label}`,
    (await admin.from('project_financials').insert({
      company_id: companyId,
      project_id: proj!.id,
      contract_value: contract,
    })).error
  );
  must(
    'counters',
    (await admin
      .from('companies')
      .update({ estimate_number_sequence: seq, project_internal_sequence: internal })
      .eq('id', companyId)).error
  );
  return { estimateId: est!.id, projectId: proj!.id };
}

async function makeBudgetLine(pid: string, rowType: string, desc: string, budgeted: number) {
  const { data: item, error } = await admin
    .from('project_budget_items')
    .insert({ company_id: companyId, project_id: pid, row_type: rowType, description: `${MARKER} ${desc}`, created_by: null })
    .select('id')
    .single();
  must(`budget line ${desc}`, error);
  must(
    `budget amount ${desc}`,
    (await admin.from('project_budget_amounts').insert({
      company_id: companyId,
      budget_item_id: item!.id,
      budgeted_amount: budgeted,
    })).error
  );
  return item!.id;
}

/** A selection with the given priced options, released and (optionally)
 *  signed by the LINKED client through the real path. */
async function makeSelection(
  pid: string,
  name: string,
  allowanceId: string | null,
  options: { name: string; quantity: number; unit_cost: number; markup_percent: number | null }[],
  opts: { sign?: boolean; client_supplied?: boolean } = {}
): Promise<{ id: string; variance: number | null; sell: number | null }> {
  const { data: s, error } = await admin
    .from('selections')
    .insert({
      company_id: companyId,
      project_id: pid,
      name: `${MARKER} ${name}`,
      allowance_budget_item_id: allowanceId,
      allow_multiple: true,
      client_supplied: opts.client_supplied ?? false,
    })
    .select('id')
    .single();
  must(`selection ${name}`, error);
  const id = s!.id;
  for (const o of options) {
    const { data: opt, error: oErr } = await admin
      .from('selection_options')
      .insert({ company_id: companyId, selection_id: id, name: `${MARKER} ${o.name}`, is_chosen: false })
      .select('id')
      .single();
    must(`option ${o.name}`, oErr);
    if (!opts.client_supplied) {
      must(
        `amounts ${o.name}`,
        (await admin.from('selection_option_amounts').insert({
          company_id: companyId,
          option_id: opt!.id,
          quantity: o.quantity,
          unit_cost: o.unit_cost,
          markup_percent: o.markup_percent,
        })).error
      );
    }
  }
  const released = await offerSelection(ownerC, id);
  if (!released.success) throw new Error(`release ${name}: ${released.error}`);
  if (!opts.sign) return { id, variance: null, sell: null };
  // The CLIENT picks (stage-7 stand-in), then signs.
  must('pick', (await admin.from('selection_options').update({ is_chosen: true }).eq('selection_id', id)).error);
  const signed = await completeSelectionSignature(linkedC, id, {
    ...sig,
    caller: { kind: 'portal_session', profileId: linkedProfileId },
  });
  if (!signed.success) throw new Error(`sign ${name}: ${signed.error}`);
  const { data: row } = await admin
    .from('selections')
    .select('status, signed_variance, signed_sell_amount')
    .eq('id', id)
    .single();
  if (row!.status !== 'approved') throw new Error(`sign ${name}: status ${row!.status}`);
  return {
    id,
    variance: row!.signed_variance === null ? null : Number(row!.signed_variance),
    sell: row!.signed_sell_amount === null ? null : Number(row!.signed_sell_amount),
  };
}

async function makeInvoice(pid: string, title: string): Promise<string> {
  const { data, error } = await admin
    .from('invoices')
    .insert({
      company_id: companyId,
      project_id: pid,
      author_member_id: ownerMemberId,
      title: `${MARKER} ${title}`,
      presentation_level: 'full_detail',
    })
    .select('id')
    .single();
  must(`invoice ${title}`, error);
  invoiceIds.push(data!.id);
  return data!.id;
}

const linesOn = async (invoiceId: string) =>
  (await admin.from('invoice_lines').select('id, billed_amount, source_selection_id').eq('invoice_id', invoiceId)).data ?? [];

/** A line written AS THE OWNER through RLS, exactly as addFixedLine writes it. */
async function ownerLine(
  invoiceId: string,
  line: Partial<Database['public']['Tables']['invoice_lines']['Insert']> & { billed_amount: number }
) {
  return ownerC
    .from('invoice_lines')
    .insert({
      invoice_id: invoiceId,
      line_type: 'fixed',
      description: `${MARKER} line`,
      derived_amount: line.billed_amount,
      sort_order: 0,
      ...line,
    })
    .select('id')
    .single();
}

// ── setup ───────────────────────────────────────────────────────────────────
beforeAll(async () => {
  assertRebuildTest();
  await sweep();

  const { data: co } = await admin.from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = co!.id;
  ownerC = (await sessionFor(OWNER)) as Client;
  linkedC = (await sessionFor(LINKED)) as Client;
  state.client = ownerC;

  const { data: ownerProfile } = await admin.from('profiles').select('id').eq('email', OWNER).single();
  const { data: member } = await admin.from('company_members').select('id').eq('profile_id', ownerProfile!.id).single();
  ownerMemberId = member!.id;
  const { data: linked } = await admin.from('profiles').select('id, contact_id').eq('email', LINKED).single();
  if (!linked?.contact_id) throw new Error('LINKED client is unlinked — run the seed.');
  linkedProfileId = linked.id;
  linkedContactId = linked.contact_id;

  // ── the fixed-price job ──
  ({ estimateId, projectId } = await makeJob('fixed_price', 'stage 5', 10000));
  allowanceItemId = await makeBudgetLine(projectId, 'allowance', 'tile allowance', 5000);
  otherItemId = await makeBudgetLine(projectId, 'material', 'lumber', 2000);

  // Sell 6,300 against a 5,000 allowance at the company material default.
  const main = await makeSelection(projectId, 'floor tile', allowanceItemId, [
    { name: 'porcelain', quantity: 10, unit_cost: 500, markup_percent: 20 },
    { name: 'trim', quantity: 1, unit_cost: 250, markup_percent: 20 },
  ], { sign: true });
  selId = main.id;
  selVariance = main.variance!;
  selSell = main.sell!;
  if (!(selVariance > 0)) throw new Error(`fixture: expected a positive variance, got ${selVariance}`);

  // Variance EXACTLY 0.00: one option at the allowance's own cost, inheriting
  // the allowance's own markup (NULL = inherit the S174 snapshot).
  const zero = await makeSelection(projectId, 'zero variance', allowanceItemId, [
    { name: 'same tile', quantity: 1, unit_cost: 5000, markup_percent: null },
  ], { sign: true });
  zeroSelId = zero.id;
  if (zero.variance !== 0) throw new Error(`fixture: expected variance 0, got ${zero.variance}`);

  // A credit: sold under the allowance.
  const credit = await makeSelection(projectId, 'cheaper tile', allowanceItemId, [
    { name: 'ceramic', quantity: 1, unit_cost: 1000, markup_percent: 20 },
  ], { sign: true });
  creditSelId = credit.id;
  creditVariance = credit.variance!;
  if (!(creditVariance < 0)) throw new Error(`fixture: expected a credit, got ${creditVariance}`);

  pendingSelId = (await makeSelection(projectId, 'undecided grout', allowanceItemId, [
    { name: 'grey', quantity: 1, unit_cost: 100, markup_percent: 0 },
  ])).id;

  suppliedSelId = (await makeSelection(projectId, 'client mirror', allowanceItemId, [
    { name: 'their mirror', quantity: 1, unit_cost: 0, markup_percent: 0 },
  ], { client_supplied: true, sign: true })).id;

  // ── the cost-plus control ──
  ({ estimateId: cpEstimateId, projectId: cpProjectId } = await makeJob('cost_plus', 'cost-plus control', 1000));
  cpAllowanceItemId = await makeBudgetLine(cpProjectId, 'allowance', 'cp tile allowance', 1000);
  const cp = await makeSelection(cpProjectId, 'cp floor tile', cpAllowanceItemId, [
    { name: 'cp porcelain', quantity: 1, unit_cost: 2000, markup_percent: 20 },
  ], { sign: true });
  cpSelId = cp.id;
  cpVariance = cp.variance!;
  if (!(cpVariance > 0)) throw new Error(`fixture: expected a positive cp variance, got ${cpVariance}`);
}, 300_000);

afterAll(async () => {
  await sweep();
  const left: Record<string, number | null> = {};
  left.projects = (await admin.from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`)).count;
  left.selections = (await admin.from('selections').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`)).count;
  left.estimates = (await admin.from('estimates').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`)).count;
  left.budgetItems = (await admin.from('project_budget_items').select('id', { count: 'exact', head: true }).like('description', `${MARKER}%`)).count;
  left.invoices = (await admin.from('invoices').select('id', { count: 'exact', head: true }).like('title', `${MARKER}%`)).count;
  const residue = Object.entries(left).filter(([, n]) => (n ?? 0) > 0);
  if (residue.length) throw new Error(`[${MARKER}] residue: ${JSON.stringify(residue)}`);
}, 300_000);

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S5 A — the DATABASE shape (Q3.4: ONE CHECK edit)', () => {
  it('A0 — the fixture is not vacuous: an approved selection with a signed variance exists', async () => {
    const { data } = await admin.from('selections').select('status, signed_variance').eq('id', selId).single();
    expect(data!.status).toBe('approved');
    expect(Number(data!.signed_variance)).toBe(selVariance);
    expect(selSell).toBe(6300);
  });

  it('A1 — a line carrying BOTH the estimate and a selection is refused by the three-way CHECK, and the write did not land', async () => {
    const inv = await makeInvoice(projectId, 'A1');
    const { error } = await ownerLine(inv, { billed_amount: 10, source_estimate_id: estimateId, source_selection_id: selId });
    expect(error, 'accepted an estimate+selection line').not.toBeNull();
    expect(error!.message).toMatch(/invoice_lines_one_instrument_check/);
    expect(await linesOn(inv)).toHaveLength(0); // RETURNING vs WRITE — re-read as service role
  });

  it('A2 — a line carrying a CHANGE ORDER and a selection is refused the same way', async () => {
    const { data: anyCo } = await admin
      .from('change_orders')
      .select('id')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true }) // any FK-valid CO will do — the CHECK is under test
      .limit(1)
      .maybeSingle();
    if (!anyCo) {
      console.warn('[S175S5 A2] UNVERIFIED — no change order in the company to build the probe from');
      return;
    }
    const inv = await makeInvoice(projectId, 'A2');
    const { error } = await ownerLine(inv, { billed_amount: 10, source_change_order_id: anyCo.id, source_selection_id: selId });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/invoice_lines_one_instrument_check/);
    expect(await linesOn(inv)).toHaveLength(0);
  });

  it('A3 — an estimate LINE ITEM on a selection line is refused BY CONSTRUCTION: the shape check needs no third arm', async () => {
    // invoice_lines_estimate_line_shape_check says line_item ⇒ estimate; the
    // three-way check says estimate ⇒ no selection. Together they refuse this
    // row without either naming the other.
    const { data: anyLineItem } = await admin
      .from('estimate_line_items')
      .select('id')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true }) // any FK-valid line item — the CHECK pair is under test
      .limit(1)
      .maybeSingle();
    if (!anyLineItem) {
      console.warn('[S175S5 A3] UNVERIFIED — no estimate line item in the company');
      return;
    }
    const inv = await makeInvoice(projectId, 'A3');
    const { error } = await ownerLine(inv, { billed_amount: 10, source_estimate_line_item_id: anyLineItem.id, source_selection_id: selId });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/invoice_lines_estimate_line_shape_check/);
    expect(await linesOn(inv)).toHaveLength(0);
  });

  it('A4 — a ZERO-instrument line is still legal (standalone income keeps its scope)', async () => {
    const inv = await makeInvoice(projectId, 'A4');
    const { error } = await ownerLine(inv, { billed_amount: 10 });
    expect(error).toBeNull();
    expect(await linesOn(inv)).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S5 B — the selection CEILING (Q3.3: a read does not constrain a write)', () => {
  let fullInvoice: string;

  it('B1 — the overage ESCAPES a fully-billed contract; the same amount against the ESTIMATE is refused', async () => {
    fullInvoice = await makeInvoice(projectId, 'B1 full contract');
    // Bill the whole $10,000 contract as a draw.
    must('draw', (await ownerLine(fullInvoice, { billed_amount: 10000, source_estimate_id: estimateId })).error);
    // Another dollar against the estimate: refused with the CO wording.
    const { error: refused } = await ownerLine(fullInvoice, { billed_amount: 1, source_estimate_id: estimateId });
    expect(refused).not.toBeNull();
    expect(refused!.message).toMatch(/Raise the scope with a change order/);
    // The selection's overage: accepted, because it bills the selection
    // instrument, which is what Q4 made binding.
    const { error: ok } = await ownerLine(fullInvoice, {
      billed_amount: r2(selVariance / 2),
      source_selection_id: selId,
      category: 'allowance',
      description: `${MARKER} half the overage`,
    });
    expect(ok, ok?.message).toBeNull();
    const lines = await linesOn(fullInvoice);
    expect(lines.filter((l) => l.source_selection_id === selId)).toHaveLength(1);
  });

  it('B2 — exceeding signed_variance is refused, naming the figures; nothing landed', async () => {
    const before = (await linesOn(fullInvoice)).length;
    const { error } = await ownerLine(fullInvoice, { billed_amount: selVariance, source_selection_id: selId });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/more than the selection's approved variance/);
    expect(error!.message).toContain(String(selVariance.toFixed(2)));
    expect((await linesOn(fullInvoice)).length).toBe(before);
  });

  it('B3 — billing EXACTLY the remainder is allowed (equality permitted, as the contract ceiling)', async () => {
    const remainder = r2(selVariance - r2(selVariance / 2));
    const { error } = await ownerLine(fullInvoice, { billed_amount: remainder, source_selection_id: selId });
    expect(error, error?.message).toBeNull();
    const billed = (await linesOn(fullInvoice))
      .filter((l) => l.source_selection_id === selId)
      .reduce((n, l) => n + Number(l.billed_amount), 0);
    expect(r2(billed)).toBe(selVariance);
  });

  it('B4 — a THIRD invoice cannot bill a cent more; VOIDING the first restores the headroom with no cleanup', async () => {
    const third = await makeInvoice(projectId, 'B4 third');
    const { error: refused } = await ownerLine(third, { billed_amount: 0.01, source_selection_id: selId });
    expect(refused).not.toBeNull();
    // Send, then void the full invoice (a draft cannot be voided).
    must('send', (await admin.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', fullInvoice)).error);
    must('void', (await admin.from('invoices').update({
      status: 'voided', voided_at: new Date().toISOString(), voided_by: ownerMemberId, void_reason: `${MARKER} restore`,
    }).eq('id', fullInvoice)).error);
    const { error: ok } = await ownerLine(third, { billed_amount: selVariance, source_selection_id: selId });
    expect(ok, ok?.message).toBeNull();
    expect((await linesOn(third)).filter((l) => l.source_selection_id === selId)).toHaveLength(1);
  });

  it('B5 — an UNSIGNED (released, never approved) selection cannot be billed at all', async () => {
    const inv = await makeInvoice(projectId, 'B5');
    const { error } = await ownerLine(inv, { billed_amount: 1, source_selection_id: pendingSelId });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/no signed variance/);
    expect(await linesOn(inv)).toHaveLength(0);
  });

  it('B6 — variance EXACTLY 0.00 is a cap of ZERO, not a credit: a positive bill is refused, a credit line passes', async () => {
    const inv = await makeInvoice(projectId, 'B6');
    const { error: refused } = await ownerLine(inv, { billed_amount: 0.01, source_selection_id: zeroSelId });
    expect(refused, 'a zero-variance selection accepted a positive bill').not.toBeNull();
    expect(await linesOn(inv)).toHaveLength(0);
    const { error: ok } = await ownerLine(inv, {
      billed_amount: -5, line_type: 'credit_allowance', source_selection_id: zeroSelId, derived_amount: -5,
    });
    expect(ok, ok?.message).toBeNull();
  });

  it('B7 — a CREDIT selection (negative variance) takes a sourced credit_allowance line on a NON-final invoice (§7.2)', async () => {
    const inv = await makeInvoice(projectId, 'B7 not final');
    const { data: invRow } = await admin.from('invoices').select('is_final').eq('id', inv).single();
    expect(invRow!.is_final).toBe(false);
    const { error } = await ownerLine(inv, {
      billed_amount: creditVariance, derived_amount: creditVariance,
      line_type: 'credit_allowance', source_selection_id: creditSelId,
    });
    expect(error, error?.message).toBeNull();
    expect((await linesOn(inv)).filter((l) => l.source_selection_id === creditSelId)).toHaveLength(1);
  });

  it('B8 — the ceiling is NOT gated on project type: it applies on the cost-plus control too', async () => {
    const inv = await makeInvoice(cpProjectId, 'B8 cost-plus');
    const { error: refused } = await ownerLine(inv, { billed_amount: r2(cpVariance + 0.01), source_selection_id: cpSelId });
    expect(refused).not.toBeNull();
    expect(refused!.message).toMatch(/approved variance/);
    expect(await linesOn(inv)).toHaveLength(0);
    const { error: ok } = await ownerLine(inv, { billed_amount: cpVariance, source_selection_id: cpSelId });
    expect(ok, ok?.message).toBeNull();
    // Cleared again so section E's as_incurred figure is about the derivation, not this probe.
    must('clear', (await admin.from('invoices').delete().eq('id', inv)).error);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S5 C — the COST side: ONE EXPENSE PER SELECTION has a shape, and approval keeps it', () => {
  async function pendingExpense(pid: string, amount: number, label: string): Promise<string> {
    const { data, error } = await admin
      .from('expenses')
      .insert({
        company_id: companyId, project_id: pid, author_member_id: ownerMemberId,
        supplier: `${MARKER} ${label}`, expense_date: '2026-08-01', amount,
        cost_category: 'material', state: 'actual', status: 'pending',
      })
      .select('id')
      .single();
    must(`expense ${label}`, error);
    return data!.id;
  }
  const allocs = async (expenseId: string) =>
    (await admin.from('expense_allocations').select('budget_item_id, amount, source_selection_id').eq('expense_id', expenseId)).data ?? [];

  it('C1 — a cost tagged with a selection, against ITS allowance line, is accepted', async () => {
    const e = await pendingExpense(projectId, 500, 'C1');
    const { error } = await ownerC.from('expense_allocations').insert({
      expense_id: e, budget_item_id: allowanceItemId, amount: 500, source_selection_id: selId,
    });
    expect(error, error?.message).toBeNull();
    expect((await allocs(e))[0]?.source_selection_id).toBe(selId);
  });

  it('C2 — tagged against a DIFFERENT line than the one the selection draws on: refused, nothing landed', async () => {
    const e = await pendingExpense(projectId, 500, 'C2');
    const { error } = await ownerC.from('expense_allocations').insert({
      expense_id: e, budget_item_id: otherItemId, amount: 500, source_selection_id: selId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/draws on a different allowance line/);
    expect(await allocs(e)).toHaveLength(0);
  });

  it('C3 — a CLIENT-SUPPLIED selection carries no cost: refused', async () => {
    const e = await pendingExpense(projectId, 50, 'C3');
    const { error } = await ownerC.from('expense_allocations').insert({
      expense_id: e, budget_item_id: allowanceItemId, amount: 50, source_selection_id: suppliedSelId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/client-supplied/);
    expect(await allocs(e)).toHaveLength(0);
  });

  it('C4 — a selection from ANOTHER project: refused', async () => {
    const e = await pendingExpense(projectId, 50, 'C4');
    const { error } = await ownerC.from('expense_allocations').insert({
      expense_id: e, budget_item_id: allowanceItemId, amount: 50, source_selection_id: cpSelId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/different project/);
    expect(await allocs(e)).toHaveLength(0);
  });

  it('C5 — approve_expense() CARRIES the tag through its delete-and-reinsert; omitted, the cost is the allowance\'s', async () => {
    // Tagged at capture, approved WITH the key → survives.
    const e1 = await pendingExpense(projectId, 300, 'C5 tagged');
    must('capture', (await ownerC.from('expense_allocations').insert({
      expense_id: e1, budget_item_id: allowanceItemId, amount: 300, source_selection_id: selId,
    })).error);
    const { error: a1 } = await ownerC.rpc('approve_expense', {
      p_expense_id: e1,
      p_allocations: [{ budget_item_id: allowanceItemId, amount: 300, source_selection_id: selId }],
    });
    expect(a1, a1?.message).toBeNull();
    const after1 = await allocs(e1);
    expect(after1).toHaveLength(1);
    expect(after1[0].source_selection_id).toBe(selId);
    expect((await admin.from('expenses').select('status').eq('id', e1).single()).data!.status).toBe('approved');

    // Approved WITHOUT the key → the allowance's own, by design (untagged).
    const e2 = await pendingExpense(projectId, 200, 'C5 untagged');
    const { error: a2 } = await ownerC.rpc('approve_expense', {
      p_expense_id: e2,
      p_allocations: [{ budget_item_id: allowanceItemId, amount: 200 }],
    });
    expect(a2, a2?.message).toBeNull();
    expect((await allocs(e2))[0].source_selection_id).toBeNull();
  });

  it('C6 — the RPC cannot smuggle a bad tag past the trigger (shape is enforced in ONE place)', async () => {
    const e = await pendingExpense(projectId, 100, 'C6');
    const { error } = await ownerC.rpc('approve_expense', {
      p_expense_id: e,
      p_allocations: [{ budget_item_id: otherItemId, amount: 100, source_selection_id: selId }],
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/draws on a different allowance line/);
    expect((await admin.from('expenses').select('status').eq('id', e).single()).data!.status).toBe('pending');
    expect(await allocs(e)).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S5 D — CONTRACT VALUE: the third term, FIXED-PRICE ONLY, and the exclusion is a VALUE (Q3.2)', () => {
  it('D1 — fixed-price: revised = original + Σ signed_variance over APPROVED selections; client-supplied contributes nothing', async () => {
    const c = await getRevisedContract(projectId);
    expect(c.original).toBe(10000);
    expect(c.signedDelta).toBe(0);
    // main (+), zero (0), credit (−); "client mirror" is approved with NULL stamps.
    const expected = r2(selVariance + 0 + creditVariance);
    expect(c.selectionDelta).toBe(expected);
    expect(c.selectionDeltaExcluded).toBe(false);
    expect(c.revised).toBe(r2(10000 + expected));
  });

  it('D2 — cost-plus: the variance is EXCLUDED, selectionDelta is 0, and selectionDeltaExcluded is TRUE — never a silent absence', async () => {
    const c = await getRevisedContract(cpProjectId);
    expect(c.original).toBe(1000);
    expect(c.selectionDelta).toBe(0);
    expect(c.selectionDeltaExcluded).toBe(true);
    expect(c.revised).toBe(1000);
  });

  it('D3 — the map deriver agrees with the per-project one on both jobs', async () => {
    const map = await getRevisedContractMap([projectId, cpProjectId]);
    const one = await getRevisedContract(projectId);
    expect(map[projectId]).toEqual(one);
    expect(map[cpProjectId].selectionDeltaExcluded).toBe(true);
    expect(map[cpProjectId].revised).toBe(1000);
  });

  it('D4 — the portfolio sums the FIXED side only, and agrees with an independent service-role derivation', async () => {
    const { data: projs } = await admin
      .from('projects').select('id, project_type')
      .eq('company_id', companyId).eq('status', 'active').eq('is_deleted', false);
    const fixedIds = (projs ?? []).filter((p) => p.project_type === 'fixed_price').map((p) => p.id);
    const { data: sels } = await admin
      .from('selections').select('signed_variance')
      .in('project_id', fixedIds).eq('status', 'approved').eq('is_deleted', false).not('signed_variance', 'is', null);
    const independent = r2((sels ?? []).reduce((n, s) => n + Number(s.signed_variance), 0));
    const portfolio = await getPortfolioRevisedContract();
    expect(portfolio.selectionDeltaSum).toBe(independent);
    // Non-vacuous: this job's own variance is inside that figure.
    expect(fixedIds).toContain(projectId);
    expect(Math.abs(independent)).toBeGreaterThan(0);
  });

  it('D5 — REVISION drops the term (acceptance #11): revise → in_discussion, stamps cleared, contract value falls by the old variance', async () => {
    const before = await getRevisedContract(projectId);
    const extra = await makeSelection(projectId, 'revisable vanity', null, [
      { name: 'vanity', quantity: 1, unit_cost: 800, markup_percent: 25 },
    ], { sign: true });
    expect(extra.variance).toBe(1000); // unlinked (Q8): variance = full sell
    const during = await getRevisedContract(projectId);
    expect(during.selectionDelta).toBe(r2(before.selectionDelta + 1000));
    const r = await reviseSelection(ownerC, extra.id);
    expect(r.success, r.error).toBe(true);
    const after = await getRevisedContract(projectId);
    expect(after.selectionDelta).toBe(before.selectionDelta);
    expect(after.revised).toBe(before.revised);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S5 E — getSelectionBilling(): billed vs signed → remaining, per KIND', () => {
  let thirdInvoice: string;

  it('E1 — three kinds on the fixed-price job; a DRAFT bills nothing on the fixed side, but a placed credit is already spoken for', async () => {
    const b = await getSelectionBilling(projectId);
    const main = b.selections.find((s) => s.selectionId === selId)!;
    const zero = b.selections.find((s) => s.selectionId === zeroSelId)!;
    const credit = b.selections.find((s) => s.selectionId === creditSelId)!;
    expect(b.selections.map((s) => s.selectionId).sort()).toEqual([selId, zeroSelId, creditSelId].sort());
    expect(main.kind).toBe('fixed_remaining');
    expect(main.billed).toBe(0); // B4's line sits on a DRAFT
    expect(main.remaining).toBe(selVariance);
    expect(zero.kind).toBe('fixed_remaining');
    expect(zero.remaining).toBe(0);
    expect(credit.kind).toBe('credit');
    expect(credit.remaining).toBeNull();
    expect(credit.billed).toBe(Math.abs(creditVariance)); // B7's credit line, live draft
    expect(b.fixedCount).toBe(2);
    expect(b.creditCount).toBe(1);
    expect(b.asIncurredCount).toBe(0);
    expect(b.fixedRemaining).toBe(selVariance);
  });

  it('E2 — SENDING the draft bills it: remaining falls to zero; excluding that invoice restores it for the builder', async () => {
    const { data: inv } = await admin
      .from('invoices').select('id').eq('project_id', projectId).eq('title', `${MARKER} B4 third`).single();
    thirdInvoice = inv!.id;
    must('send', (await admin.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', thirdInvoice)).error);
    const b = await getSelectionBilling(projectId);
    const main = b.selections.find((s) => s.selectionId === selId)!;
    expect(main.billed).toBe(selVariance);
    expect(main.remaining).toBe(0);
    expect(b.fixedRemaining).toBe(0);
    const excl = await getSelectionBilling(projectId, thirdInvoice);
    expect(excl.selections.find((s) => s.selectionId === selId)!.remaining).toBe(selVariance);
  });

  it('E3 — the cost-plus control: AS INCURRED — no remaining, no fixed amount', async () => {
    const b = await getSelectionBilling(cpProjectId);
    expect(b.selections).toHaveLength(1);
    expect(b.selections[0].kind).toBe('as_incurred');
    expect(b.selections[0].remaining).toBeNull();
    expect(b.asIncurredCount).toBe(1);
    expect(b.fixedCount).toBe(0);
  });
});
