/**
 * S151 Part A — what the "Retainage held" line may claim about its rate.
 *
 * RULING [Josh, S150/S151]: retainage rate changes are PROSPECTIVE ONLY, and
 * therefore:
 *
 *   The line may name a rate only when that rate accounts for the ENTIRE held
 *   total. A multi-rate accrual must not claim a single rate.
 *
 * Pure — no database. The live half (that the rate is recorded at all, and that
 * a revision does not restate it) is `s151-retainage-rate-recorded.live.ts`.
 *
 * ⚠️ THE CASE THAT MATTERS IS TEST 3. Everything else is a boundary; test 3 is
 * the defect: the dollars were always right and the sentence beside them was
 * wrong, which is the harder kind to notice.
 */
import { describe, expect, it } from 'vitest';
import {
  retainageHeldExplanation,
  retainageHeldLabel,
} from '../lib/services/payables-shared';

type P = {
  retainage_withheld: number;
  retainage_percent_applied: number | null;
  is_deleted: boolean | null;
};

/** A stage payment that withheld `withheld` at `rate`. */
const paid = (withheld: number, rate: number | null, deleted = false): P => ({
  retainage_withheld: withheld,
  retainage_percent_applied: rate,
  is_deleted: deleted,
});

const across = { retainage_shape: 'percent_across', retainage_percent: 10 };

// The helper only reads three fields; the Row type carries ~15 it never touches.
const explain = (
  contract: { retainage_shape: string | null; retainage_percent: number | null },
  payments: P[]
) => retainageHeldExplanation(contract, payments as never);

const label = (
  contract: { retainage_shape: string | null; retainage_percent: number | null },
  payments: P[]
) => retainageHeldLabel(explain(contract, payments));

describe('S151 Part A — retainage held, rate attribution', () => {
  it('1. one rate across every withhold — the rate MAY be named', () => {
    const payments = [paid(1000, 10), paid(500, 10)];
    expect(explain(across, payments)).toEqual({ kind: 'single_rate', rate: 10 });
    expect(label(across, payments)).toBe('10% withheld across payments');
  });

  it('2. nothing withheld — no clause at all, not a zero', () => {
    // A contract can carry a percent and have taken nothing yet. Saying "10%
    // withheld across payments" over $0 is a claim about payments that do not
    // exist.
    expect(explain(across, [paid(0, null)])).toEqual({ kind: 'none' });
    expect(label(across, [paid(0, null)])).toBeNull();
  });

  it('3. TWO rates — the total names NEITHER, and says the current rate is current', () => {
    // The reachable defect, exactly: 10% on the first payment, revised to 5%,
    // then a second payment. $1,500 held on $20,000 billed is neither 10% nor
    // 5%. The old line printed "(5% across payments)".
    const revised = { retainage_shape: 'percent_across', retainage_percent: 5 };
    const payments = [paid(1000, 10), paid(500, 5)];

    expect(explain(revised, payments)).toEqual({ kind: 'multi_rate', currentRate: 5 });
    const out = label(revised, payments)!;

    // It must NOT read as an explanation of the total...
    expect(out).toContain('more than one rate');
    // ...and where it does name 5, "currently" must be carrying the distinction
    // between a forward fact and a claim about what is already held.
    expect(out).toBe('withheld across payments at more than one rate · currently 5%');
    expect(out).not.toMatch(/^5% withheld/);
  });

  it('4. final_hold is never described as withholding across payments', () => {
    // Fault (a) from the audit. Latent today — a pure final_hold contract
    // accrues nothing, so the line does not render — but the sentence was
    // false whenever it did.
    const finalHold = { retainage_shape: 'final_hold', retainage_percent: 10 };
    expect(explain(finalHold, [paid(1000, 10)])).toEqual({ kind: 'final_hold' });
    expect(label(finalHold, [paid(1000, 10)])).toBe('held from the final stage');
  });

  it('5. an UNRECORDED rate is unknown, not agreement', () => {
    // Rows written before 20261003000000 carry no rate. One known rate plus one
    // unknown must NOT collapse to "10% explains everything" — that is the same
    // false claim the fix exists to prevent, arrived at by a different route.
    const payments = [paid(1000, 10), paid(500, null)];
    expect(explain(across, payments)).toEqual({ kind: 'rate_unknown', currentRate: 10 });
    expect(label(across, payments)).toBe('withheld across payments · currently 10%');
  });

  it('6. soft-deleted payments are excluded — derivation self-corrects', () => {
    // 7C's correction path is soft-delete + re-enter. A voided payment must not
    // keep dragging its rate into the attribution.
    const payments = [paid(1000, 10), paid(500, 5, true)];
    expect(explain(across, payments)).toEqual({ kind: 'single_rate', rate: 10 });
  });

  it('7. a rate with no current percent still reports honestly', () => {
    const noCurrent = { retainage_shape: 'percent_across', retainage_percent: null };
    const payments = [paid(1000, 10), paid(500, 5)];
    expect(label(noCurrent, payments)).toBe('withheld across payments at more than one rate');
  });

  it('8. numeric(5,2) trailing zeros do not reach the screen', () => {
    // The column round-trips 10 as 10.00; "10.00% withheld" reads as a bug.
    expect(label(across, [paid(1000, 10.0)])).toBe('10% withheld across payments');
    // A genuine fraction survives.
    const half = { retainage_shape: 'percent_across', retainage_percent: 7.5 };
    expect(label(half, [paid(750, 7.5)])).toBe('7.5% withheld across payments');
  });
});
