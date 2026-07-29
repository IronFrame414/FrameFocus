import { describe, it, expect } from 'vitest';
import {
  PAYABLE_OR_FILTER,
  COMPLIANCE_ALERT_DAYS,
  isPayableRow,
  countsTowardCommitted,
  grossPaid,
  committedRemaining,
  netCashOut,
  daysUntilExpiry,
  deriveComplianceStatus,
} from './payables-shared';
import type { ExpensePayment } from './payables-shared';

// Payment factory. amount/retainage_withheld are NOT NULL in the schema —
// the null-branch tests below cast past the type on purpose to exercise the
// `?? 0` defense; the DB forbids the value.
function payment(
  amount: number,
  retainage_withheld = 0,
  is_deleted: boolean | null = false
): Pick<ExpensePayment, 'amount' | 'retainage_withheld' | 'is_deleted'> {
  return { amount, retainage_withheld, is_deleted };
}

describe('isPayableRow', () => {
  const base = {
    state: 'actual',
    sub_contract_id: null,
    purchase_order_id: null,
    is_retainage: false,
  };

  it('admits on committed state alone', () => {
    expect(isPayableRow({ ...base, state: 'committed' })).toBe(true);
  });

  it('admits on sub_contract_id alone', () => {
    expect(isPayableRow({ ...base, sub_contract_id: 'sc1' })).toBe(true);
  });

  it('admits on purchase_order_id alone', () => {
    expect(isPayableRow({ ...base, purchase_order_id: 'po1' })).toBe(true);
  });

  it('admits on is_retainage alone', () => {
    expect(isPayableRow({ ...base, is_retainage: true })).toBe(true);
  });

  it('admits on hasPayments alone', () => {
    expect(isPayableRow(base, true)).toBe(true);
  });

  it('settled manual bill (state actual, no linkage) matches nothing without hasPayments', () => {
    expect(isPayableRow(base)).toBe(false);
  });

  it('settled manual bill is caught via its payments', () => {
    expect(isPayableRow(base, true)).toBe(true);
  });
});

describe('PAYABLE_OR_FILTER', () => {
  it('stays in lockstep with the isPayableRow predicate (exact string)', () => {
    expect(PAYABLE_OR_FILTER).toBe(
      'state.eq.committed,sub_contract_id.not.is.null,purchase_order_id.not.is.null,is_retainage.eq.true'
    );
  });
});

describe('countsTowardCommitted', () => {
  it('approved + open + not deleted counts', () => {
    expect(
      countsTowardCommitted({ status: 'approved', closed_out_at: null, is_deleted: false })
    ).toBe(true);
  });

  it('pending counts nowhere (the 7A gate)', () => {
    expect(
      countsTowardCommitted({ status: 'pending', closed_out_at: null, is_deleted: false })
    ).toBe(false);
  });

  it('closed-out row exits every committed Σ', () => {
    expect(
      countsTowardCommitted({
        status: 'approved',
        closed_out_at: '2026-07-01T00:00:00Z',
        is_deleted: false,
      })
    ).toBe(false);
  });

  it('soft-deleted row is excluded', () => {
    expect(
      countsTowardCommitted({ status: 'approved', closed_out_at: null, is_deleted: true })
    ).toBe(false);
  });

  it('is_deleted null is treated as not deleted — counts', () => {
    expect(
      countsTowardCommitted({ status: 'approved', closed_out_at: null, is_deleted: null })
    ).toBe(true);
  });
});

describe('grossPaid', () => {
  it('empty payments array — never-paid commitment baseline is 0', () => {
    expect(grossPaid([])).toBe(0);
  });

  it('sums amounts across payments', () => {
    expect(grossPaid([payment(1000), payment(500)])).toBe(1500);
  });

  it('excludes soft-deleted payments', () => {
    expect(grossPaid([payment(1000), payment(500, 0, true)])).toBe(1000);
  });

  it('is_deleted null counts as not deleted', () => {
    expect(grossPaid([payment(1000, 0, null)])).toBe(1000);
  });

  it('null amount treated as 0 (defensive — DB forbids it)', () => {
    expect(grossPaid([{ amount: null as unknown as number, is_deleted: false }])).toBe(0);
  });
});

describe('committedRemaining', () => {
  it('full settlement → 0', () => {
    expect(committedRemaining({ amount: 1500 }, [payment(1500)])).toBe(0);
  });

  it('partial payment leaves the remainder', () => {
    expect(committedRemaining({ amount: 1500 }, [payment(1000)])).toBe(500);
  });

  it('over-payment clamps to 0 — never negative', () => {
    expect(committedRemaining({ amount: 1500 }, [payment(2000)])).toBe(0);
  });

  it('soft-deleted payment re-derives out — remaining reopens', () => {
    expect(committedRemaining({ amount: 1500 }, [payment(1500, 0, true)])).toBe(1500);
  });

  it('null amount treated as 0 (defensive — DB forbids it)', () => {
    expect(committedRemaining({ amount: null as unknown as number }, [])).toBe(0);
  });
});

describe('netCashOut', () => {
  it('S92 click-tested case: $1,500 gross with $75 withheld reads $1,425', () => {
    expect(netCashOut([payment(1500, 75)])).toBe(1425);
  });

  it('empty payments array → 0', () => {
    expect(netCashOut([])).toBe(0);
  });

  it('sums net across multiple payments', () => {
    expect(netCashOut([payment(1500, 75), payment(2000, 100)])).toBe(3325);
  });

  it('excludes soft-deleted payments', () => {
    expect(netCashOut([payment(1500, 75), payment(2000, 100, true)])).toBe(1425);
  });

  it('is_deleted null counts as not deleted', () => {
    expect(netCashOut([payment(1500, 75, null)])).toBe(1425);
  });

  it('null retainage_withheld treated as 0 (defensive — DB forbids it)', () => {
    expect(
      netCashOut([
        { amount: 1500, retainage_withheld: null as unknown as number, is_deleted: false },
      ])
    ).toBe(1500);
  });

  it('full settlement incl. retainage release (withheld = 0) equals contract value', () => {
    // $10,000 contract, 5% retainage. Two progress payments bill the work
    // ($5,000 gross, $250 withheld each); the release pays the accrued $500
    // with nothing withheld. Net across ALL payments = contract value.
    const all = [payment(5000, 250), payment(5000, 250), payment(500, 0)];
    expect(netCashOut(all)).toBe(10000);
  });
});

describe('grossPaid vs netCashOut — the distinction the model rests on', () => {
  it('they diverge by exactly the withheld total', () => {
    const payments = [payment(1500, 75), payment(2000, 100), payment(3000, 150)];
    const withheldTotal = 75 + 100 + 150;
    expect(grossPaid(payments) - netCashOut(payments)).toBe(withheldTotal);
  });

  it('with zero withheld they agree', () => {
    const payments = [payment(1500), payment(2000)];
    expect(grossPaid(payments)).toBe(netCashOut(payments));
  });
});

describe('daysUntilExpiry', () => {
  const today = '2026-07-29';

  it('null expiration → null (no expiry)', () => {
    expect(daysUntilExpiry(null, today)).toBeNull();
  });

  it('expires today → 0', () => {
    expect(daysUntilExpiry('2026-07-29', today)).toBe(0);
  });

  it('past date → negative', () => {
    expect(daysUntilExpiry('2026-07-17', today)).toBe(-12);
  });

  it('future date → positive whole days', () => {
    expect(daysUntilExpiry('2026-08-28', today)).toBe(30);
  });
});

describe('deriveComplianceStatus', () => {
  const today = '2026-07-29';

  it('null expiration (W9) → no_expiry', () => {
    expect(deriveComplianceStatus(null, today)).toBe('no_expiry');
  });

  it('past date → expired', () => {
    expect(deriveComplianceStatus('2026-07-28', today)).toBe('expired');
  });

  it('expires today (day 0) → expiring_soon, not expired', () => {
    expect(deriveComplianceStatus('2026-07-29', today)).toBe('expiring_soon');
  });

  it('exactly 30 days out → expiring_soon (boundary inclusive)', () => {
    expect(deriveComplianceStatus('2026-08-28', today)).toBe('expiring_soon');
  });

  it('31 days out → current', () => {
    expect(deriveComplianceStatus('2026-08-29', today)).toBe('current');
  });
});

describe('COMPLIANCE_ALERT_DAYS', () => {
  it('pinned to [30, 7] — the 7 has no consumer yet; it awaits the unbuilt calendar expiry wiring (7C §6.10), NOT a 7-day derived status', () => {
    expect(COMPLIANCE_ALERT_DAYS).toEqual([30, 7]);
  });
});
