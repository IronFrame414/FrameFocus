import { describe, it, expect } from 'vitest';
import {
  canVoidInvoice,
  findSplitDays,
  laborRateType,
  nonLaborRateType,
  rateRowInForce,
  type RateRow,
} from '@/lib/services/invoices-shared';
import type { SelectedSegment } from '@framefocus/shared/utils/invoice-derivation';

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
