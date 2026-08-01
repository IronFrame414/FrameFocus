import { describe, it, expect } from 'vitest';
import {
  canVoidInvoice,
  companyDay,
  findSplitDays,
  laborRateType,
  nonLaborRateType,
  rateRowInForce,
  type RateRow,
} from '@/lib/services/invoices-shared';
import {
  groupSelectedHours,
  type SelectedSegment,
} from '@framefocus/shared/utils/invoice-derivation';

// Module 7D1 §9/§10 lifecycle rules and §6.1 rate resolution.

describe('§9 — who may void, and when', () => {
  const base = { hasPayment: false, paymentSyncedToQuickBooks: false, status: 'sent' as const };

  it('UNPAID: Owner and Admin may void; PM may not', () => {
    expect(canVoidInvoice({ ...base, role: 'owner' }).allowed).toBe(true);
    expect(canVoidInvoice({ ...base, role: 'admin' }).allowed).toBe(true);
    const pm = canVoidInvoice({ ...base, role: 'project_manager' });
    expect(pm.allowed).toBe(false);
    expect(pm.allowed === false && pm.reason).toContain('Owner or Admin');
  });

  it('PARTIALLY PAID, not yet in QuickBooks: Owner ONLY, and it warns', () => {
    const owner = canVoidInvoice({ ...base, hasPayment: true, role: 'owner' });
    expect(owner.allowed).toBe(true);
    expect(owner.allowed === true && owner.warning).toContain('client credit');

    const admin = canVoidInvoice({ ...base, hasPayment: true, role: 'admin' });
    expect(admin.allowed).toBe(false);
    expect(admin.allowed === false && admin.reason).toContain('only the Owner');
  });

  it('PAYMENT ALREADY IN QUICKBOOKS: nobody may void — 7E credit or refund', () => {
    for (const role of ['owner', 'admin', 'project_manager']) {
      const decision = canVoidInvoice({
        ...base,
        hasPayment: true,
        paymentSyncedToQuickBooks: true,
        role,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.allowed === false && decision.reason).toContain('7E');
    }
  });

  it('a voided invoice is terminal — it can never be voided again', () => {
    const decision = canVoidInvoice({ ...base, status: 'voided', role: 'owner' });
    expect(decision.allowed).toBe(false);
  });

  it('a draft is DELETED, not voided (§9)', () => {
    expect(canVoidInvoice({ ...base, status: 'draft', role: 'owner' }).allowed).toBe(false);
    expect(canVoidInvoice({ ...base, status: 'pending_approval', role: 'owner' }).allowed).toBe(false);
  });
});

describe('§6.1 — rate-type mapping and rate-row resolution (A-9)', () => {
  it('cost-plus maps each category to ITS OWN rate type; T&M maps all to one', () => {
    expect(nonLaborRateType('cost_plus', 'material')).toBe('cost_plus_material_percent');
    expect(nonLaborRateType('cost_plus', 'subcontractor')).toBe('cost_plus_subcontractor_percent');
    expect(nonLaborRateType('cost_plus', 'other')).toBe('cost_plus_other_percent');
    expect(nonLaborRateType('time_and_materials', 'material')).toBe('tm_nonlabor_percent');
    expect(nonLaborRateType('time_and_materials', 'subcontractor')).toBe('tm_nonlabor_percent');
  });

  it('labor keeps its own type per contract type (A-9 decision)', () => {
    expect(laborRateType('cost_plus')).toBe('cost_plus_labor_hourly');
    expect(laborRateType('time_and_materials')).toBe('tm_labor_hourly');
  });

  const rows: RateRow[] = [
    { id: 'r1', rate_type: 'cost_plus_material_percent', rate: 15, effective_from: '2026-05-01', superseded_at: null },
    { id: 'r2', rate_type: 'cost_plus_material_percent', rate: 20, effective_from: '2026-06-01', superseded_at: null },
    { id: 'r3', rate_type: 'cost_plus_material_percent', rate: 99, effective_from: '2026-05-15', superseded_at: '2026-06-02T00:00:00Z' },
    { id: 'r4', rate_type: 'cost_plus_material_percent', rate: 25, effective_from: '2026-09-01', superseded_at: null },
  ];

  it('returns the rate in force ON THE COST’S OWN DATE, with its row identity', () => {
    expect(rateRowInForce(rows, 'cost_plus_material_percent', '2026-05-20')).toEqual({ id: 'r1', rate: 15 });
    expect(rateRowInForce(rows, 'cost_plus_material_percent', '2026-06-15')).toEqual({ id: 'r2', rate: 20 });
  });

  it('a SUPERSEDED row never wins, and a FUTURE row is dormant (P5)', () => {
    // r3 (99%) is superseded and must never be selected, even on its own date.
    expect(rateRowInForce(rows, 'cost_plus_material_percent', '2026-05-20')?.rate).not.toBe(99);
    // r4 is future-dated on this date — dormant, not in force.
    expect(rateRowInForce(rows, 'cost_plus_material_percent', '2026-06-15')?.rate).toBe(20);
  });

  it('returns null before any rate exists — the caller must refuse to price at 0%', () => {
    expect(rateRowInForce(rows, 'cost_plus_material_percent', '2026-04-01')).toBeNull();
    expect(rateRowInForce(rows, 'cost_plus_other_percent', '2026-06-01')).toBeNull();
  });
});

describe('§S K6 — an hour belongs to its COMPANY-tz calendar day [S97]', () => {
  const NY = 'America/New_York';

  // 2026-06-02 20:00 EDT is stored as 2026-06-03T00:00:00Z. Evening work is
  // ordinary on a jobsite, so this is the common case, not an edge case.
  const eveningEdt = '2026-06-03T00:00:00.000Z';

  it('a 20:00 EDT segment belongs to June 2, not June 3', () => {
    expect(companyDay(eveningEdt, NY)).toBe('2026-06-02');
  });

  it('REGRESSION: it must not fall back to the UTC day', () => {
    // The pre-[S97] implementation returned the toISOString() slice.
    expect(new Date(eveningEdt).toISOString().slice(0, 10)).toBe('2026-06-03');
    expect(companyDay(eveningEdt, NY)).not.toBe(
      new Date(eveningEdt).toISOString().slice(0, 10)
    );
  });

  it('holds in winter too — 19:00 EST is still the same local day (DST)', () => {
    // 2026-01-14 19:00 EST = 2026-01-15T00:00:00Z.
    expect(companyDay('2026-01-15T00:00:00.000Z', NY)).toBe('2026-01-14');
  });

  it('is driven by the passed timezone, never hardcoded', () => {
    // The same instant is still Jun 2 on the west coast (17:00 PDT).
    expect(companyDay(eveningEdt, 'America/Los_Angeles')).toBe('2026-06-02');
    // …and genuinely Jun 3 for a company that keeps UTC.
    expect(companyDay(eveningEdt, 'UTC')).toBe('2026-06-03');
  });

  it('midday work is unaffected — the fix moves only the evening tail', () => {
    // 2026-06-02 13:00 EDT = 17:00Z, same day either way.
    expect(companyDay('2026-06-02T17:00:00.000Z', NY)).toBe('2026-06-02');
  });

  // The money consequence: §7.2 rounds each person-day UP to the half hour, so
  // splitting one worked day into two groups bills the client for MORE time.
  it('keeps one worked day in ONE rounding group — 5h00m bills 5.0, not 5.5', () => {
    const afternoon = '2026-06-02T19:00:00.000Z'; // 15:00 EDT, 3h10m
    const evening = eveningEdt; //                  20:00 EDT, 1h50m

    const correct: SelectedSegment[] = [
      { segmentId: 's1', memberId: 'm1', workDate: companyDay(afternoon, NY), rawHours: 3.1667 },
      { segmentId: 's2', memberId: 'm1', workDate: companyDay(evening, NY), rawHours: 1.8333 },
    ];
    const groups = groupSelectedHours(correct);
    expect(groups).toHaveLength(1);
    expect(groups[0].workDate).toBe('2026-06-02');
    expect(groups[0].billableHours).toBe(5);

    // Under the old UTC day the same two segments split into two groups, each
    // rounding up on its own — half an hour of over-billing per person per day.
    const utcSplit: SelectedSegment[] = [
      { segmentId: 's1', memberId: 'm1', workDate: afternoon.slice(0, 10), rawHours: 3.1667 },
      { segmentId: 's2', memberId: 'm1', workDate: evening.slice(0, 10), rawHours: 1.8333 },
    ];
    const splitGroups = groupSelectedHours(utcSplit);
    expect(splitGroups).toHaveLength(2);
    expect(splitGroups.reduce((sum, g) => sum + g.billableHours, 0)).toBe(5.5);
  });
});

describe('§7.2 — split-day warning (PROVISIONAL P-4)', () => {
  const available = [
    { segmentId: 's1', memberId: 'm1', memberName: 'A', workDate: '2026-06-02', rawHours: 3, segmentType: 'work', taskTitle: null, ageDays: 1 },
    { segmentId: 's2', memberId: 'm1', memberName: 'A', workDate: '2026-06-02', rawHours: 4, segmentType: 'work', taskTitle: null, ageDays: 1 },
    { segmentId: 's3', memberId: 'm2', memberName: 'B', workDate: '2026-06-02', rawHours: 5, segmentType: 'work', taskTitle: null, ageDays: 1 },
  ];

  it('warns when only PART of a person-day is selected', () => {
    const selected: SelectedSegment[] = [
      { segmentId: 's1', memberId: 'm1', workDate: '2026-06-02', rawHours: 3 },
    ];
    expect(findSplitDays(selected, available)).toEqual([{ memberId: 'm1', workDate: '2026-06-02' }]);
  });

  it('does not warn when a whole person-day is selected', () => {
    const selected: SelectedSegment[] = [
      { segmentId: 's1', memberId: 'm1', workDate: '2026-06-02', rawHours: 3 },
      { segmentId: 's2', memberId: 'm1', workDate: '2026-06-02', rawHours: 4 },
    ];
    expect(findSplitDays(selected, available)).toEqual([]);
  });

  it('another person’s unselected day is not a split', () => {
    const selected: SelectedSegment[] = [
      { segmentId: 's1', memberId: 'm1', workDate: '2026-06-02', rawHours: 3 },
      { segmentId: 's2', memberId: 'm1', workDate: '2026-06-02', rawHours: 4 },
    ];
    // m2's day is untouched — not selected at all, so nothing is split.
    expect(findSplitDays(selected, available)).toEqual([]);
  });
});
