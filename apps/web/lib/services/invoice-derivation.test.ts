import { describe, it, expect } from 'vitest';
import {
  computeDepositCreditLine,
  computeDrawAmount,
  computeDrawSchedule,
  computeInvoiceTotals,
  deriveCostLine,
  deriveLaborLines,
  depositRemaining,
  groupSelectedHours,
  presentInvoice,
  roundUpToHalfHour,
  type InvoiceLineAmount,
  type PresentationLine,
  type SelectedCost,
  type SelectedSegment,
} from '@framefocus/shared/utils/invoice-derivation';

// Module 7D1 acceptance traces (docs/specs/7d1-spec.md §15). Every figure
// asserted here is quoted from the spec — these tests fail if the derivation
// ever stops reproducing the founder-sourced numbers.

const rate = (id: string) => id; // instrument_rates.id stand-in

/** Sum a list of already-rounded money values the way production does — every
 *  aggregation in the derivation passes through roundMoney. Raw `reduce` on
 *  IEEE-754 doubles drifts (1200+1800+275+958.48+625.20 = 4858.679999999999),
 *  which is a property of the test's own arithmetic, not of the derivation. */
const sum = (values: number[]) => Math.round(values.reduce((s, v) => s + v, 0) * 100) / 100;

describe('§15-A — fixed-price draw with retainage (real values, §7.10)', () => {
  it('bills $18,000, withholds $1,800, and makes $16,200 the receivable', () => {
    const lines: InvoiceLineAmount[] = [{ lineType: 'fixed', billedAmount: 18000 }];
    const totals = computeInvoiceTotals(lines, { percent: 10, eligible: true });

    expect(totals.billedTotal).toBe(18000);
    expect(totals.retainageWithheld).toBe(1800);
    // §5: the receivable is the ONLY figure that ages; the $1,800 is outside it.
    expect(totals.amountReceivable).toBe(16200);
  });

  it('a deposit or T&M invoice withholds nothing even with a project percentage set', () => {
    const lines: InvoiceLineAmount[] = [{ lineType: 'fixed', billedAmount: 18000 }];
    const totals = computeInvoiceTotals(lines, { percent: 10, eligible: false });
    expect(totals.retainageWithheld).toBe(0);
    expect(totals.amountReceivable).toBe(18000);
  });
});

describe('§15-B — cost-plus invoice (REAL values, S97)', () => {
  // One 20% rate ran the whole job, but each row prices at its OWN category's
  // rate in force on its OWN incurred date (§6.1).
  const costs: SelectedCost[] = [
    { allocationId: 'a1', description: 'subcontractor #1', category: 'subcontractor', cost: 1200.0, incurredDate: '2026-05-28', markupPercent: 20, rateRowId: rate('r-sub') },
    { allocationId: 'a2', description: 'subcontractor #2', category: 'subcontractor', cost: 1800.0, incurredDate: '2026-06-01', markupPercent: 20, rateRowId: rate('r-sub') },
    { allocationId: 'a3', description: 'subcontractor #3', category: 'subcontractor', cost: 275.0, incurredDate: '2026-06-01', markupPercent: 20, rateRowId: rate('r-sub') },
    { allocationId: 'a4', description: 'lumber', category: 'material', cost: 958.48, incurredDate: '2026-05-20', markupPercent: 20, rateRowId: rate('r-mat') },
    { allocationId: 'a5', description: 'plumbing fixtures', category: 'material', cost: 625.2, incurredDate: '2026-05-19', markupPercent: 20, rateRowId: rate('r-mat') },
  ];

  const derived = costs.map(deriveCostLine);

  it('prices subs $3,275.00 -> $3,930.00 and materials $1,583.68 -> $1,900.42', () => {
    const subs = derived.filter((l) => l.category === 'subcontractor');
    const mats = derived.filter((l) => l.category === 'material');

    expect(sum(subs.map((l) => l.costBasis))).toBe(3275.0);
    expect(sum(subs.map((l) => l.amount))).toBe(3930.0);
    expect(sum(mats.map((l) => l.costBasis))).toBe(1583.68);
    expect(sum(mats.map((l) => l.amount))).toBe(1900.42);
  });

  it('totals cost $4,858.68 + markup $971.74 = $5,830.42', () => {
    const totals = computeInvoiceTotals(
      derived.map((l) => ({ lineType: 'derived_cost' as const, derivedAmount: l.amount, billedAmount: l.amount })),
      { percent: null, eligible: false }
    );
    expect(totals.derivedTotal).toBe(5830.42);
    expect(totals.billedTotal).toBe(5830.42);

    const cost = sum(derived.map((l) => l.costBasis));
    expect(cost).toBe(4858.68);
    expect(Math.round((totals.billedTotal - cost) * 100) / 100).toBe(971.74);
  });

  it('renders layout A: each cost at actual cost, Subtotal, Markup @ 20%, TOTAL', () => {
    const presented = presentInvoice(
      derived.map((l): PresentationLine => ({
        description: l.description,
        category: l.category,
        costBasis: l.costBasis,
        amount: l.amount,
        lineType: 'derived_cost',
      })),
      'full_detail'
    );
    expect(presented.nonLaborLines).toHaveLength(5);
    expect(presented.nonLaborSubtotal).toBe(4858.68);
    expect(presented.nonLaborMarkup).toBe(971.74);
    expect(presented.total).toBe(5830.42);
    // §6.4 — the cost column shown to the client is UNBURDENED: it is exactly
    // the stored cost, never multiplied by anything.
    expect(presented.nonLaborLines.map((l) => l.costBasis)).toEqual([
      1200, 1800, 275, 958.48, 625.2,
    ]);
  });

  it('stores the RATE ROW IDENTITY on every derived line (§8 — §10 needs it)', () => {
    expect(derived.every((l) => typeof l.rateRowId === 'string' && l.rateRowId.length > 0)).toBe(true);
  });

  it('per-ROW rounding is the settled convention and matches per-invoice here (§8 VERIFY)', () => {
    const perRow = sum(derived.map((l) => l.amount));
    const perInvoice = Math.round(4858.68 * 1.2 * 100) / 100;
    expect(perRow).toBe(5830.42);
    expect(perInvoice).toBe(5830.42); // identical on THIS trace, per §15-B
  });

  it('a row prices at ITS OWN category rate when the categories differ (A-9)', () => {
    const mixed = [
      { ...costs[0], markupPercent: 15 }, // sub at 15%
      { ...costs[3], markupPercent: 22 }, // material at 22%
    ].map(deriveCostLine);
    expect(mixed[0].amount).toBe(1380); // 1200 x 1.15
    expect(mixed[1].amount).toBe(1169.35); // 958.48 x 1.22 = 1169.3456 -> 1169.35
  });
});

describe('§15-C — T&M invoice (REAL values, S97)', () => {
  it('bills 42 h x $100 labor plus two materials at 20% = $4,612.08', () => {
    const laborLines = deriveLaborLines([
      {
        group: { memberId: 'm1', workDate: '2026-06-02', rawHours: 42, billableHours: 42, segmentIds: ['s1'] },
        hourlyRate: 100,
        rateRowId: rate('r-labor'),
      },
    ]);
    expect(laborLines).toHaveLength(1);
    expect(laborLines[0].amount).toBe(4200.0);
    // §6.4/§7 — no burden, no markup on labor.
    expect(laborLines[0].unitRate).toBe(100);

    const materials = [
      { allocationId: 'a1', description: 'material', category: 'material' as const, cost: 175.2, incurredDate: '2026-06-01', markupPercent: 20, rateRowId: rate('r-mat') },
      { allocationId: 'a2', description: 'material', category: 'material' as const, cost: 168.2, incurredDate: '2026-06-03', markupPercent: 20, rateRowId: rate('r-mat') },
    ].map(deriveCostLine);

    expect(materials[0].amount).toBe(210.24);
    expect(materials[1].amount).toBe(201.84);

    const totals = computeInvoiceTotals(
      [
        { lineType: 'derived_labor', derivedAmount: 4200, billedAmount: 4200 },
        ...materials.map((m) => ({ lineType: 'derived_cost' as const, derivedAmount: m.amount, billedAmount: m.amount })),
      ],
      { percent: 10, eligible: false } // §5/§7 — NO retainage on T&M
    );

    expect(totals.billedTotal).toBe(4612.08);
    expect(totals.retainageWithheld).toBe(0);
    expect(totals.amountReceivable).toBe(4612.08);

    // "Markup earned on material: $68.68"
    const markupEarned =
      Math.round((materials.reduce((s, m) => s + m.amount - m.costBasis, 0)) * 100) / 100;
    expect(markupEarned).toBe(68.68);
  });

  it('§11 R3 layout — labor sits OUTSIDE the subtotal/markup block, TOTAL sums both', () => {
    const presented = presentInvoice(
      [
        { description: 'Labor — 42 hrs @ $100/hr', category: 'labor', costBasis: null, amount: 4200, lineType: 'derived_labor' },
        { description: 'sub #1', category: 'subcontractor', costBasis: 1200, amount: 1440, lineType: 'derived_cost' },
        { description: 'materials', category: 'material', costBasis: 3658.68, amount: 4390.42, lineType: 'derived_cost' },
      ],
      'full_detail'
    );
    expect(presented.laborLines).toHaveLength(1);
    expect(presented.nonLaborSubtotal).toBe(4858.68);
    expect(presented.nonLaborMarkup).toBe(971.74);
    expect(presented.total).toBe(10030.42); // labor + non-labor + markup, per §11
  });

  it('by_section rolls up to labor / materials / subs', () => {
    const presented = presentInvoice(
      [
        { description: 'Labor', category: 'labor', costBasis: null, amount: 4200, lineType: 'derived_labor' },
        { description: 'sub', category: 'subcontractor', costBasis: 3275, amount: 3930, lineType: 'derived_cost' },
        { description: 'mat', category: 'material', costBasis: 1583.68, amount: 1900.42, lineType: 'derived_cost' },
      ],
      'by_section'
    );
    expect(presented.sections).toEqual([
      { label: 'Labor', amount: 4200 },
      { label: 'Materials', amount: 1900.42 },
      { label: 'Subcontractors', amount: 3930 },
    ]);
  });
});

describe('§15-C-1 — billable-hours rounding (real, §7.2)', () => {
  it('sums the DAY first: 3h10m + 4h05m = 7h15m -> 7.5 billable hours', () => {
    const segments: SelectedSegment[] = [
      { segmentId: 's1', memberId: 'm1', workDate: '2026-06-02', rawHours: 3 + 10 / 60 },
      { segmentId: 's2', memberId: 'm1', workDate: '2026-06-02', rawHours: 4 + 5 / 60 },
    ];
    const groups = groupSelectedHours(segments);
    expect(groups).toHaveLength(1);
    expect(groups[0].rawHours).toBeCloseTo(7.25, 4);
    expect(groups[0].billableHours).toBe(7.5);

    // Rounding each segment separately would give 3.5 + 4.5 = 8.0 — WRONG.
    const wrong = roundUpToHalfHour(3 + 10 / 60) + roundUpToHalfHour(4 + 5 / 60);
    expect(wrong).toBe(8);
    expect(groups[0].billableHours).not.toBe(wrong);
  });

  it('rounds UP to the half hour, never the quarter (§7.2 correction notice)', () => {
    expect(roundUpToHalfHour(7.25)).toBe(7.5);
    expect(roundUpToHalfHour(7.5)).toBe(7.5); // already exact — no free half hour
    expect(roundUpToHalfHour(7.51)).toBe(8);
    expect(roundUpToHalfHour(0.1)).toBe(0.5);
    expect(roundUpToHalfHour(0)).toBe(0);
    // A quarter-hour rule would give 7.25 here; the half-hour rule must not.
    expect(roundUpToHalfHour(7.2)).toBe(7.5);
  });

  it('float noise does not steal half an hour', () => {
    expect(roundUpToHalfHour(0.5 + 0.1 + 0.2 + 0.2 + 6.5)).toBe(7.5);
  });

  it('rounds ONCE PER PERSON PER DAY — two people, two days stay separate', () => {
    const groups = groupSelectedHours([
      { segmentId: 's1', memberId: 'm1', workDate: '2026-06-02', rawHours: 3.1 },
      { segmentId: 's2', memberId: 'm1', workDate: '2026-06-03', rawHours: 3.1 },
      { segmentId: 's3', memberId: 'm2', workDate: '2026-06-02', rawHours: 3.1 },
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.billableHours === 3.5)).toBe(true);
  });

  it('an hour with NO task is grouped and billed exactly like any other (§7.2 D2)', () => {
    const groups = groupSelectedHours([
      { segmentId: 's1', memberId: 'm1', workDate: '2026-06-02', rawHours: 4, taskId: 'task-1' },
      { segmentId: 's2', memberId: 'm1', workDate: '2026-06-02', rawHours: 3.25, taskId: null },
    ]);
    expect(groups[0].billableHours).toBe(7.5);
    expect(groups[0].segmentIds).toEqual(['s1', 's2']);
  });

  it('the rounded quantity is RE-DERIVABLE from the stored claim rows (§S storage)', () => {
    // What the hour claims persist: (member, day, raw_hours) per segment.
    const claims = [
      { memberId: 'm1', workDate: '2026-06-02', rawHours: 3 + 10 / 60, segmentId: 's1' },
      { memberId: 'm1', workDate: '2026-06-02', rawHours: 4 + 5 / 60, segmentId: 's2' },
    ];
    const regrouped = groupSelectedHours(claims);
    expect(regrouped[0].billableHours).toBe(7.5);
  });

  it('labor lines merge by RATE, summing already-rounded daily hours', () => {
    const lines = deriveLaborLines([
      { group: { memberId: 'm1', workDate: '2026-06-02', rawHours: 7.25, billableHours: 7.5, segmentIds: ['s1'] }, hourlyRate: 100, rateRowId: 'r1' },
      { group: { memberId: 'm2', workDate: '2026-06-02', rawHours: 8.1, billableHours: 8.5, segmentIds: ['s2'] }, hourlyRate: 100, rateRowId: 'r1' },
      // A renegotiated rate on a later day is its own line (§6.1 rate-in-force).
      { group: { memberId: 'm1', workDate: '2026-07-01', rawHours: 4, billableHours: 4, segmentIds: ['s3'] }, hourlyRate: 110, rateRowId: 'r2' },
    ]);
    expect(lines).toHaveLength(2);
    const first = lines.find((l) => l.rateRowId === 'r1');
    expect(first?.quantity).toBe(16); // 7.5 + 8.5, NOT re-rounded
    expect(first?.amount).toBe(1600);
    const second = lines.find((l) => l.rateRowId === 'r2');
    expect(second?.amount).toBe(440);
  });
});

describe('§15-D — change-order / selection-overage invoice', () => {
  it('bills the $1,200 overage as its own invoice, separate from the draws', () => {
    // Allowance $5,000, selection $6,200 -> overage $1,200 (the signed CO's
    // net_delta). 7D bills the CO; it NEVER writes contract value (7B derives).
    const overage = 6200 - 5000;
    const totals = computeInvoiceTotals(
      [{ lineType: 'fixed', derivedAmount: overage, billedAmount: overage }],
      { percent: null, eligible: false }
    );
    expect(totals.billedTotal).toBe(1200);
  });
});

describe('§15-E — allowance true-up, client UNDER', () => {
  it('carries an $800 credit line when the client asks at the final invoice', () => {
    const withCredit = computeInvoiceTotals(
      [
        { lineType: 'fixed', billedAmount: 5000 },
        { lineType: 'credit_allowance', billedAmount: -800 },
      ],
      { percent: null, eligible: false }
    );
    expect(withCredit.billedTotal).toBe(4200);

    // "Either the final invoice carries an $800 credit line, or it does not
    // and the $800 is retained. Both are correct outcomes."
    const withoutCredit = computeInvoiceTotals(
      [{ lineType: 'fixed', billedAmount: 5000 }],
      { percent: null, eligible: false }
    );
    expect(withoutCredit.billedTotal).toBe(5000);
  });

  it('retainage is computed on positive work only — a credit never inflates the withheld', () => {
    const totals = computeInvoiceTotals(
      [
        { lineType: 'fixed', billedAmount: 10000 },
        { lineType: 'credit_allowance', billedAmount: -800 },
      ],
      { percent: 10, eligible: true }
    );
    expect(totals.retainageWithheld).toBe(1000); // 10% of the 10,000 of work
    expect(totals.billedTotal).toBe(9200);
    expect(totals.amountReceivable).toBe(8200);
  });
});

describe('§15-G — percentage-of-source draw schedule (REAL values, S97)', () => {
  const CONTRACT = 14413.75;

  it('prices each draw off the ORIGINAL contract value (rule a)', () => {
    expect(computeDrawAmount({ label: 'deposit', percent: 10 }, CONTRACT, 0)).toBe(1441.38);
    expect(computeDrawAmount({ label: 'permit', percent: 30 }, CONTRACT, 0)).toBe(4324.13);
    expect(computeDrawAmount({ label: 'rough-in', percent: 25 }, CONTRACT, 0)).toBe(3603.44);
    expect(computeDrawAmount({ label: 'cabinets', percent: 25 }, CONTRACT, 0)).toBe(3603.44);
  });

  it('makes the FINAL draw the REMAINDER, and the schedule sum EXACT (rule b)', () => {
    const schedule = computeDrawSchedule(
      [
        { label: 'deposit', percent: 10 },
        { label: 'permit approval', percent: 30 },
        { label: 'rough-in', percent: 25 },
        { label: 'cabinets', percent: 25 },
        { label: 'substantial completion', isFinal: true },
      ],
      CONTRACT
    );

    expect(schedule.map((d) => d.amount)).toEqual([
      1441.38, 4324.13, 3603.44, 3603.44, 1441.36,
    ]);
    expect(sum(schedule.slice(0, 4).map((d) => d.amount))).toBe(12972.39);

    const total = sum(schedule.map((d) => d.amount));
    expect(total).toBe(CONTRACT); // exactly — no two-cent overrun

    // A fresh 10% final would overshoot; that is precisely why rule (b) exists.
    const freshFinal = Math.round(CONTRACT * 0.1 * 100) / 100;
    expect(Math.round((12972.39 + freshFinal) * 100) / 100).toBe(14413.77);
  });

  it('a signed CO never re-prices the draws (rule a / P4)', () => {
    // The CO raised the revised contract to $16,000 via 7B derivation; the
    // draw still prices off the ORIGINAL $14,413.75.
    expect(computeDrawAmount({ label: 'rough-in', percent: 25 }, CONTRACT, 0)).toBe(3603.44);
    expect(computeDrawAmount({ label: 'rough-in', percent: 25 }, 16000, 0)).not.toBe(3603.44);
  });

  it('an edited fixed amount bills exactly what was typed (§2)', () => {
    expect(computeDrawAmount({ label: 'draw 2', fixedAmount: 18000 }, CONTRACT, 0)).toBe(18000);
  });
});

describe('§3a — deposit credit balance draw-down (R6)', () => {
  it('applies the deposit as a credit line up to the invoice total, never hidden netting', () => {
    // $5,000 deposit; first derived invoice is $3,000 -> settles to zero,
    // $2,000 carries forward.
    const first = computeDepositCreditLine(3000, 5000);
    expect(first).toBe(-3000);
    expect(depositRemaining(5000, 3000)).toBe(2000);

    const totals = computeInvoiceTotals(
      [
        { lineType: 'derived_cost', derivedAmount: 3000, billedAmount: 3000 },
        { lineType: 'credit_deposit', billedAmount: first as number },
      ],
      { percent: null, eligible: false }
    );
    // The client sees the work in full AND the credit; the invoice settles to 0.
    expect(totals.derivedTotal).toBe(3000);
    expect(totals.billedTotal).toBe(0);
  });

  it('once exhausted, invoices are payable in cash', () => {
    expect(computeDepositCreditLine(4000, 2000)).toBe(-2000); // partial cover
    expect(depositRemaining(5000, 5000)).toBe(0);
    expect(computeDepositCreditLine(4000, 0)).toBeNull();
  });

  it('never returns a positive credit and never over-applies', () => {
    expect(computeDepositCreditLine(1000, 5000)).toBe(-1000);
    expect(depositRemaining(5000, 6000)).toBe(0); // clamped, never negative
  });
});

describe('§15-H — negative change order lands as a credit line (R4)', () => {
  it('nets the next invoice $5,000 lower with the work still shown in full', () => {
    const totals = computeInvoiceTotals(
      [
        { lineType: 'fixed', derivedAmount: 12000, billedAmount: 12000 },
        { lineType: 'credit_negative_co', billedAmount: -5000 },
      ],
      { percent: null, eligible: false }
    );
    expect(totals.derivedTotal).toBe(12000);
    expect(totals.billedTotal).toBe(7000); // QB sees the smaller invoice
  });
});

describe('§8 — derived vs billed, and discount lines (R1)', () => {
  it('keeps BOTH figures: derived stands, the discount is its own negative line', () => {
    const totals = computeInvoiceTotals(
      [
        { lineType: 'derived_cost', derivedAmount: 5830.42, billedAmount: 5830.42 },
        { lineType: 'discount', billedAmount: -330.42 },
      ],
      { percent: null, eligible: false }
    );
    expect(totals.derivedTotal).toBe(5830.42); // what the system computed
    expect(totals.billedTotal).toBe(5500); // what the client was charged
  });

  it('an upward override is permitted and stays visible (§8)', () => {
    const totals = computeInvoiceTotals(
      [{ lineType: 'derived_cost', derivedAmount: 5000, billedAmount: 5200 }],
      { percent: null, eligible: false }
    );
    expect(totals.derivedTotal).toBe(5000);
    expect(totals.billedTotal).toBe(5200);
  });
});
