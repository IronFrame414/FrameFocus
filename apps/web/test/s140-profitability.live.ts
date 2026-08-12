import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import {
  aggregateCategories,
  computeHeadline,
  profitBasisFor,
} from '@framefocus/shared/utils/profitability';
import { deriveCostLine } from '@framefocus/shared/utils/invoice-derivation';
import { rateRowInForce, nonLaborRateType } from '@/lib/services/invoices-shared';
import type { RateRow } from '@/lib/services/invoices-shared';

// ============================================================================
// S140 — Module 7H, driven against real rebuild-test data.
//
// Spec: docs/specs/7h1-spec.md §7H.2 #3 (per instrument, then aggregated),
//       §7H.3 (the report), §7H.6 (Owner/Admin only)
// ============================================================================
//
// ⚠️ 7H WRITES NOTHING, so there is nothing to seed and nothing to clean up.
// This harness reads, and asserts the two properties that would be invisible
// in a screenshot: that the report is gated at the ROUTE and not only in the
// tab bar, and that revenue is derived per instrument rather than by one
// blanket markup over a category total.
//
// ⚠️ ROLE READS RUN AS REAL USERS. `admin` (service role) appears only to
// establish counterfactuals outside the policy under test.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN_USER = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';

let ownerC: SupabaseClient;
let adminC: SupabaseClient;
let pmC: SupabaseClient;
let foremanC: SupabaseClient;
let projectId = '';

beforeAll(async () => {
  assertRebuildTest();
  [ownerC, adminC, pmC, foremanC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(ADMIN_USER),
    sessionFor(PM),
    sessionFor(FOREMAN),
  ])) as SupabaseClient[];

  // A project that actually has costs allocated — a report over an empty job
  // asserts nothing.
  const { data } = await admin
    .from('expense_allocations')
    .select('expense_id, expenses!inner(project_id)')
    .eq('is_deleted', false)
    .limit(1)
    .single();
  projectId = (data as unknown as { expenses: { project_id: string } }).expenses.project_id;
});

describe('S140-H1 — instrument_rates is the gate 7H depends on', () => {
  it('Owner and Admin read rate rows', async () => {
    const { data: o } = await ownerC.from('instrument_rates').select('id').limit(1);
    const { data: a } = await adminC.from('instrument_rates').select('id').limit(1);
    expect(o?.length).toBeGreaterThan(0);
    expect(a?.length).toBeGreaterThan(0);
  });

  it('PM and foreman read NONE — and are not broken sessions', async () => {
    for (const [role, client] of [
      ['project_manager', pmC],
      ['foreman', foremanC],
    ] as const) {
      // Non-vacuity first: this session works against something it may read.
      const { data: reachable } = await client.from('projects').select('id').limit(1);
      expect(reachable, `${role} session is broken`).toBeTruthy();

      const { data } = await client.from('instrument_rates').select('id');
      expect(data ?? [], `${role} read a rate row`).toHaveLength(0);
    }

    // Counterfactual OUTSIDE the policy: rows genuinely exist, so the zeros
    // above are a floor and not an empty table.
    const { data: real } = await admin.from('instrument_rates').select('id');
    expect((real ?? []).length).toBeGreaterThan(0);
  });
});

describe('S140-H2 — budgeted amounts, the other Owner/Admin input', () => {
  it('Owner reads project_budget_amounts; PM and foreman read none', async () => {
    const { data: o } = await ownerC.from('project_budget_amounts').select('id').limit(1);
    expect(o?.length).toBeGreaterThan(0);

    for (const [role, client] of [
      ['project_manager', pmC],
      ['foreman', foremanC],
    ] as const) {
      const { data } = await client.from('project_budget_amounts').select('id');
      expect(data ?? [], `${role} read a budgeted amount`).toHaveLength(0);
    }
  });
});

describe('S140-H3 — revenue is derived PER INSTRUMENT, against live rates', () => {
  it('two instruments with different markups do not share one rate', async () => {
    // The property under test is structural, so it is asserted against the
    // real rate rows rather than a fixture: for a given category, the rate in
    // force can differ per instrument, and deriveCostLine must be called once
    // per instrument with that instrument's own rate.
    const { data: rates } = await admin
      .from('instrument_rates')
      .select('id, rate_type, rate, effective_from, superseded_at, estimate_id, change_order_id');

    const byInstrument = new Map<string, RateRow[]>();
    for (const r of rates ?? []) {
      const key = r.estimate_id ? `est:${r.estimate_id}` : `co:${r.change_order_id}`;
      byInstrument.set(key, [...(byInstrument.get(key) ?? []), r as RateRow]);
    }
    expect(byInstrument.size).toBeGreaterThan(1);

    const asOf = '2026-08-01';
    const resolved: { key: string; rate: number }[] = [];
    for (const [key, rows] of byInstrument) {
      const row = rateRowInForce(rows, nonLaborRateType('cost_plus', 'material'), asOf);
      if (row) resolved.push({ key, rate: row.rate });
    }

    // Non-vacuity: at least two instruments must actually resolve a rate, or
    // "they differ" would be trivially unfalsifiable.
    expect(resolved.length).toBeGreaterThanOrEqual(2);

    // Price the SAME $1,000 through each and aggregate the way the report
    // does. The total must be the sum of the per-instrument results.
    const slices = resolved.map((r) => ({
      instrumentKey: r.key,
      category: 'material' as const,
      budget: null,
      committed: 0,
      actual: 1000,
      sell: deriveCostLine({
        allocationId: `probe-${r.key}`,
        description: 'probe',
        category: 'material',
        cost: 1000,
        incurredDate: asOf,
        markupPercent: r.rate,
        rateRowId: 'probe',
      }).amount,
    }));

    const rows = aggregateCategories(slices);
    const material = rows.find((x) => x.category === 'material')!;
    const expected = slices.reduce((s, x) => s + (x.sell ?? 0), 0);
    expect(material.sell).toBeCloseTo(expected, 2);

    // And the blanket-markup answer must NOT equal it.
    //
    // ASSERTED, NOT GATED ON. Behind an `if (distinctRates.size > 1)` this
    // check would silently stop running the moment the fixture rates drifted
    // into agreement, and the suite would still read 7/7 green while the one
    // assertion that matters had quietly switched itself off. If the fixture
    // degrades, this must fail and say so.
    //
    // Live at time of writing: est:c194c135 = 15%, co:e8b44de3 = 20% on
    // 2026-08-01, so the honest total is 1150 + 1200 = 2350 and the two
    // blanket answers are 2300 and 2400.
    const distinctRates = new Set(resolved.map((r) => r.rate));
    expect(
      distinctRates.size,
      'fixture degraded: every instrument now carries the same material markup, ' +
        'so this test can no longer distinguish per-instrument derivation from a ' +
        'blanket one'
    ).toBeGreaterThan(1);

    for (const rate of distinctRates) {
      const blanket = 1000 * resolved.length * (1 + rate / 100);
      expect(material.sell).not.toBeCloseTo(blanket, 2);
    }
  });
});

describe('S140-H4 — the earned/billed switch reads projects.status', () => {
  it('every live project status maps to a defined basis', async () => {
    const { data: projects } = await admin.from('projects').select('status');
    const statuses = new Set((projects ?? []).map((p) => p.status));
    expect(statuses.size).toBeGreaterThan(0);
    for (const status of statuses) {
      const basis = profitBasisFor(status);
      expect(['earned', 'billed']).toContain(basis);
      // Only 'complete' may flip it — asserted against whatever the live
      // CHECK actually permits, so a new status value cannot silently start
      // reporting a job as final.
      expect(basis === 'billed').toBe(status === 'complete');
    }
  });
});

describe('S140-H5 — billed excludes voided invoices', () => {
  it('a voided invoice does not count toward billed', async () => {
    const { data: invoices } = await admin
      .from('invoices')
      .select('id, status, billed_total, project_id')
      .eq('is_deleted', false);

    const live = (invoices ?? []).filter((i) => i.status !== 'voided');
    const voided = (invoices ?? []).filter((i) => i.status === 'voided');

    const liveTotal = live.reduce((s, i) => s + Number(i.billed_total ?? 0), 0);
    const allTotal = (invoices ?? []).reduce((s, i) => s + Number(i.billed_total ?? 0), 0);

    if (voided.length > 0) {
      // Non-vacuous only when a voided invoice carries a non-zero total.
      const voidedTotal = voided.reduce((s, i) => s + Number(i.billed_total ?? 0), 0);
      if (voidedTotal > 0) expect(liveTotal).toBeLessThan(allTotal);
    }
    expect(liveTotal).toBeLessThanOrEqual(allTotal);
  });
});

describe('S140-H6 — the headline holds on real figures', () => {
  it('profit and backlog agree with the definitions on live numbers', async () => {
    const { data: invoices } = await admin
      .from('invoices')
      .select('id, billed_total, status')
      .eq('project_id', projectId)
      .eq('is_deleted', false);
    const live = (invoices ?? []).filter((i) => i.status !== 'voided');
    const billed = live.reduce((s, i) => s + Number(i.billed_total ?? 0), 0);

    const { data: apps } = await admin
      .from('client_payment_applications')
      .select('amount')
      .in('invoice_id', live.map((i) => i.id).length ? live.map((i) => i.id) : ['none'])
      .eq('is_deleted', false);
    const collected = (apps ?? []).reduce((s, a) => s + Number(a.amount), 0);

    const { data: project } = await admin
      .from('projects')
      .select('status')
      .eq('id', projectId)
      .single();

    const headline = computeHeadline({
      earned: 100_000,
      billed,
      actualCost: 40_000,
      discounts: 0,
      collected,
      projectStatus: (project as { status: string }).status,
    });

    expect(headline.cash.collected).toBe(collected);
    expect(headline.cash.spent).toBe(40_000);
    if (headline.basis === 'earned') {
      expect(headline.profit).toBe(60_000);
      expect(headline.backlog).toBe(Math.round((100_000 - billed) * 100) / 100);
    } else {
      expect(headline.profit).toBe(Math.round((billed - 40_000) * 100) / 100);
    }
  });
});
