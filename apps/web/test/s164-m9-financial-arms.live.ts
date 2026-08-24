/**
 * S164 — Module 9 stage 3b. The client FINANCIAL read surface.
 *
 * Migration: `20261020000000_m9_client_financial_arms.sql`.
 * Ruling: `CLAUDE.md` → "THE FLOOR GOVERNS STAFF. A CLIENT IS A COUNTERPARTY."
 * Spec: `9-spec.md` §4.
 *
 * ============================================================================
 * ⚠️ THE PAIR HERE IS TWO PAIRS, NOT ONE.
 * ============================================================================
 * The non-financial arms needed one counterfactual: LINKED vs CONTROL, because
 * a client reads 0 rows under a correct policy and under no policy at all.
 *
 * These arms need that one AND a second, because the gate Josh ruled into the
 * database is not an identity — it is `invoices.presentation_level`, a column
 * on the bill. So every financial assertion is made twice over:
 *
 *   LINKED vs CONTROL              — the arm is scoped to a real client
 *   full_detail vs lump_sum        — the GATE works, on the same client,
 *                                    on the same project, in the same query
 *
 * The second is the one that cannot be faked. All 11 invoices that existed
 * before this suite were `lump_sum`, so "the client reads no invoice lines" was
 * true of the entire table and would have passed against `USING (true)` on
 * `invoices` with no gate on the lines at all.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const LINKED = 'josh+qa-client-linked@worthprop.com';
const CONTROL = 'josh+qa-client@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';

let linked: SupabaseClient;
let control: SupabaseClient;
let owner: SupabaseClient;

let companyId: string;
let projectId: string;
let fullDetailId: string;
let bySectionId: string;
let lumpSumId: string;
let draftId: string;
let agreedRateId: string;

const invoiceIdByTitle = async (title: string) => {
  const { data } = await admin
    .from('invoices').select('id')
    .eq('company_id', companyId).eq('title', title).single();
  return (data as { id: string }).id;
};

beforeAll(async () => {
  assertRebuildTest();
  [linked, control, owner] = await Promise.all([
    sessionFor(LINKED),
    sessionFor(CONTROL),
    sessionFor(OWNER),
  ]);

  const { data: lp } = await admin
    .from('profiles').select('id, company_id, contact_id').eq('email', LINKED).single();
  const l = lp as { company_id: string; contact_id: string | null };
  if (!l.contact_id) {
    throw new Error(`${LINKED} is unlinked — run the seed; every assertion here would be vacuous.`);
  }
  companyId = l.company_id;

  [fullDetailId, bySectionId, lumpSumId, draftId] = await Promise.all([
    invoiceIdByTitle('QA M9 — full_detail bill'),
    invoiceIdByTitle('QA M9 — by_section bill'),
    invoiceIdByTitle('QA M9 — lump_sum bill'),
    invoiceIdByTitle('QA M9 — draft bill'),
  ]);

  const { data: pr } = await admin.from('invoices').select('project_id').eq('id', fullDetailId).single();
  projectId = (pr as { project_id: string }).project_id;

  // Resolved through the ESTIMATE, not by matching `rate = 95` — `rate` is
  // NUMERIC and comes back as the string '95.00', so the obvious filter finds
  // nothing and the failure looks like a missing fixture.
  const { data: est } = await admin
    .from('estimates').select('id').eq('company_id', companyId)
    .eq('estimate_number', 'EST-QA-M9').single();
  const { data: rate } = await admin
    .from('instrument_rates').select('id')
    .eq('estimate_id', (est as { id: string }).id)
    .eq('rate_type', 'tm_labor_hourly').single();
  agreedRateId = (rate as { id: string }).id;

  // [S173] RESTORE the counterfactual before asserting on it. ARM 15b says
  // "the UNSENT one is never returned" by reading a LIVE row any owner click
  // can flip — Josh's S172 click-test marked it as sent (2026-08-21 22:46)
  // and the arm went red two days later with nothing wrong in the code. The
  // seed's ensureRow is insert-if-missing and cannot heal this, so the probe
  // re-pins the fields its assertion depends on. (CLAUDE.md, S157: "if an
  // assertion's name says 'never', check that it is reading the schema and
  // not a row" — here the row is the only place the fact lives, so pin it.)
  const { error: unsentErr } = await admin
    .from('estimates')
    .update({ status: 'draft', sent_at: null, expires_at: null })
    .eq('company_id', companyId)
    .eq('estimate_number', 'EST-QA-M9-UNSENT');
  if (unsentErr) throw new Error(`restoring EST-QA-M9-UNSENT: ${unsentErr.message}`);
});

const rows = async (c: SupabaseClient, table: string, select: string) => {
  const { data, error } = await c.from(table).select(select);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as unknown as Record<string, unknown>[];
};

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 10 — invoices: the bill itself', () => {
  it('10a — LINKED reads her sent bills', async () => {
    const ids = (await rows(linked, 'invoices', 'id, title, status')).map((r) => r.id);
    expect(ids).toContain(fullDetailId);
    expect(ids).toContain(lumpSumId);
  });

  it('10b — CONTROL reads none', async () => {
    expect(await rows(control, 'invoices', 'id')).toHaveLength(0);
  });

  it('10c — ⚠️ the DRAFT bill is invisible, and it is full_detail so ONLY status can hide it', async () => {
    const { data: d } = await admin
      .from('invoices').select('presentation_level').eq('id', draftId).single();
    expect((d as { presentation_level: string }).presentation_level,
      'the draft fixture must be full_detail or 10c proves nothing').toBe('full_detail');

    const { data } = await linked.from('invoices').select('id').eq('id', draftId);
    expect(data ?? []).toHaveLength(0);
  });

  it('10d — she reads only her own projects’ bills, not the company ledger', async () => {
    const hers = await rows(linked, 'invoices', 'id, project_id');
    expect(hers.length).toBeGreaterThan(0);
    const { count: all } = await admin
      .from('invoices').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('is_deleted', false);
    expect(all!, 'the company must hold more invoices than hers').toBeGreaterThan(hers.length);
  });

  it('10e — and every row she reads carries a NULL void_reason (the CHECK, not the policy)', async () => {
    // RLS cannot hide a column. `invoices_void_shape_check` ties void_reason to
    // voided_at, and the arm excludes voided — so the constraint guarantees the
    // column is empty on every row she can reach.
    for (const r of await rows(linked, 'invoices', 'id, status, void_reason')) {
      expect(r.status).not.toBe('voided');
      expect(r.void_reason).toBeNull();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 11 — invoice_lines: the presentation gate, in the database', () => {
  it('11a — full_detail: LINKED reads the lines, with cost basis and agreed rate', async () => {
    const lines = (await rows(linked, 'invoice_lines', 'id, invoice_id, description, cost_basis, unit_rate'))
      .filter((r) => r.invoice_id === fullDetailId);
    expect(lines.length, 'full_detail must yield lines').toBe(2);

    // §4.4 (R7a): the pre-markup figure IS shown beside the marked-up one.
    const labor = lines.find((r) => String(r.description).includes('labor'))!;
    expect(Number(labor.cost_basis)).toBe(640);
    expect(Number(labor.unit_rate)).toBe(95);
  });

  it('11b — ⚠️ lump_sum: the SAME client, the SAME project, and NO line at all', async () => {
    const { data: lines } = await linked.from('invoice_lines').select('id').eq('invoice_id', lumpSumId);
    expect(lines ?? []).toHaveLength(0);

    // ...and the line genuinely exists, or this passes vacuously.
    const { count } = await admin
      .from('invoice_lines').select('id', { count: 'exact', head: true }).eq('invoice_id', lumpSumId);
    expect(count!, 'no lump_sum line fixture — 11b proves nothing').toBeGreaterThan(0);

    // ...and she CAN read the bill itself. If she could not, 11b would be
    // proving the invoices arm, not the gate.
    const { data: inv } = await linked.from('invoices').select('id, billed_total').eq('id', lumpSumId);
    expect(inv ?? [], 'she must read the lump-sum bill for this to be a gate test').toHaveLength(1);
  });

  it('11c — by_section: also no lines. The gate is full_detail, not "not lump sum"', async () => {
    const { data } = await linked.from('invoice_lines').select('id').eq('invoice_id', bySectionId);
    expect(data ?? []).toHaveLength(0);
    const { count } = await admin
      .from('invoice_lines').select('id', { count: 'exact', head: true }).eq('invoice_id', bySectionId);
    expect(count!).toBeGreaterThan(0);
  });

  it('11d — ⚠️ the RESTRICTIVE gate does NOT narrow staff', async () => {
    // A restrictive policy applies to every role. Without the
    // `get_my_role() <> \'client\'` escape this would have broken 7D outright,
    // and no client-facing test would have noticed.
    const { data } = await owner.from('invoice_lines').select('id').eq('invoice_id', lumpSumId);
    expect((data ?? []).length, 'the owner must still read lump-sum lines').toBeGreaterThan(0);
  });

  it('11e — CONTROL reads no line at any level', async () => {
    expect(await rows(control, 'invoice_lines', 'id')).toHaveLength(0);
  });

  it('11f — and no line of the DRAFT bill, though it is full_detail', async () => {
    const { data } = await linked.from('invoice_lines').select('id').eq('invoice_id', draftId);
    expect(data ?? []).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 12 — the claim tables stay shut (R8: no names anywhere)', () => {
  it('12a — LINKED reads no hour claim, and one EXISTS on a bill she can read', async () => {
    const { count } = await admin
      .from('invoice_hour_claims').select('id', { count: 'exact', head: true })
      .eq('invoice_id', fullDetailId);
    expect(count!, 'no hour-claim fixture — 12a would be vacuous').toBeGreaterThan(0);

    expect(await rows(linked, 'invoice_hour_claims', 'id')).toHaveLength(0);
  });

  it('12b — nor any cost claim', async () => {
    expect(await rows(linked, 'invoice_cost_claims', 'id')).toHaveLength(0);
  });

  it('12c — ⚠️ and the owner still reads them (the restrictive gate spared staff)', async () => {
    const { data } = await owner.from('invoice_hour_claims').select('id').eq('invoice_id', fullDetailId);
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 13 — instrument_rates: the agreed rate, only through her own line', () => {
  it('13a — LINKED reads the rate her full_detail line points at', async () => {
    const ids = (await rows(linked, 'instrument_rates', 'id, rate, rate_type')).map((r) => r.id);
    expect(ids).toContain(agreedRateId);
  });

  it('13b — ⚠️ and NOT the company’s other instrument rates', async () => {
    const mine = (await rows(linked, 'instrument_rates', 'id')).map((r) => r.id);
    const { count: all } = await admin
      .from('instrument_rates').select('id', { count: 'exact', head: true }).eq('company_id', companyId);
    expect(all!, 'need more rates than hers or 13b proves nothing').toBeGreaterThan(mine.length);
  });

  it('13c — ⚠️ the lump-sum exclusion is automatic: no readable line, no reachable rate', async () => {
    // Nothing in the instrument_rates arm mentions presentation_level. It is
    // filtered by containment through the gate on invoice_lines. This asserts
    // the mechanism, not just the outcome: every rate she reads is pointed at
    // by a line she can also read.
    const rateIds = (await rows(linked, 'instrument_rates', 'id')).map((r) => r.id);
    const lineRateIds = (await rows(linked, 'invoice_lines', 'id, instrument_rate_id'))
      .map((r) => r.instrument_rate_id)
      .filter(Boolean);
    for (const id of rateIds) expect(lineRateIds).toContain(id);
  });

  it('13d — CONTROL reads none, and the FLOOR still holds for a foreman', async () => {
    expect(await rows(control, 'instrument_rates', 'id')).toHaveLength(0);

    // The Financial Visibility Floor is not weakened by the client arm. If the
    // arm had been written without its `get_my_role() = \'client\'` clause it
    // would have granted every role a rate reachable from any invoice line.
    const foreman = await sessionFor('josh+qa-foreman@worthprop.com');
    expect(await rows(foreman, 'instrument_rates', 'id')).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 14 — by_section subtotals: a projection, not the lines', () => {
  const sections = async (c: SupabaseClient, invoiceId: string) => {
    const { data, error } = await c.rpc('client_invoice_sections', { p_invoice_id: invoiceId });
    if (error) throw new Error(`client_invoice_sections: ${error.message}`);
    return (data ?? []) as Record<string, unknown>[];
  };

  it('14a — LINKED gets labour and material subtotals for the by_section bill', async () => {
    const s = await sections(linked, bySectionId);
    expect(s.map((r) => r.category).sort()).toEqual(['labor', 'material']);
    const labor = s.find((r) => r.category === 'labor')!;
    expect(Number(labor.billed_subtotal)).toBe(380);
  });

  it('14b — ⚠️ and the shape carries NO cost basis and NO description', async () => {
    for (const r of await sections(linked, bySectionId)) {
      expect(Object.keys(r)).not.toContain('cost_basis');
      expect(Object.keys(r)).not.toContain('description');
      expect(Object.keys(r)).not.toContain('unit_rate');
    }
  });

  it('14c — ⚠️ lump_sum yields NO sections. The total is the whole disclosure', async () => {
    expect(await sections(linked, lumpSumId)).toHaveLength(0);
  });

  it('14d — CONTROL gets nothing from the function', async () => {
    expect(await sections(control, bySectionId)).toHaveLength(0);
    expect(await sections(control, fullDetailId)).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 15 — proposals are projected, and `estimates` stays shut', () => {
  const proposals = async (c: SupabaseClient) => {
    const { data, error } = await c.rpc('client_proposals', { p_project_id: projectId });
    if (error) throw new Error(`client_proposals: ${error.message}`);
    return (data ?? []) as Record<string, unknown>[];
  };

  it('15a — LINKED gets the sent proposal', async () => {
    const p = await proposals(linked);
    expect(p.map((r) => r.estimate_number)).toContain('EST-QA-M9');
  });

  it('15b — ⚠️ and NOT the unsent one', async () => {
    expect((await proposals(linked)).map((r) => r.estimate_number)).not.toContain('EST-QA-M9-UNSENT');
  });

  it('15c — ⚠️ the shape carries no internal_notes', async () => {
    for (const r of await proposals(linked)) {
      expect(Object.keys(r)).not.toContain('internal_notes');
    }
  });

  it('15d — ⚠️ the estimates TABLE is still closed, and so are the sub bids', async () => {
    // A table grant would have opened estimate_sub_bids by containment —
    // every subcontractor's bid on the job, with the sub identified.
    expect(await rows(linked, 'estimates', 'id')).toHaveLength(0);
    expect(await rows(linked, 'estimate_line_items', 'id')).toHaveLength(0);
    expect(await rows(linked, 'estimate_line_rows', 'id')).toHaveLength(0);
    expect(await rows(linked, 'estimate_sub_bids', 'id')).toHaveLength(0);
  });

  it('15e — CONTROL gets nothing', async () => {
    expect(await proposals(control)).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 16 — the floors that deliberately stay shut', () => {
  it('16a — co_signing_sessions: closed, and rows exist', async () => {
    const { count } = await admin
      .from('co_signing_sessions').select('id', { count: 'exact', head: true }).eq('company_id', companyId);
    expect(count!, 'no signing sessions — 16a would be vacuous').toBeGreaterThan(0);
    expect(await rows(linked, 'co_signing_sessions', 'id')).toHaveLength(0);
  });

  it('16b — signing_sessions: closed', async () => {
    expect(await rows(linked, 'signing_sessions', 'id')).toHaveLength(0);
  });

  it('16c — project_budget_amounts: closed. The internal budget is not her budget', async () => {
    const { count } = await admin
      .from('project_budget_amounts').select('id', { count: 'exact', head: true }).eq('company_id', companyId);
    expect(count!, 'no budget amounts — 16c would be vacuous').toBeGreaterThan(0);
    expect(await rows(linked, 'project_budget_amounts', 'id')).toHaveLength(0);
  });
});
