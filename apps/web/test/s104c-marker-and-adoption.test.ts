import { describe, it, expect } from 'vitest';
import {
  ADOPTION_WINDOW_DAYS,
  adoptionWindow,
  linkMarker,
  memoMatches,
  priorAttemptReachedIntuit,
  withMarker,
} from '@/lib/quickbooks/reconcile';

const ID = '9f30d966-2b85-432b-a7ad-6f68968dace8';
const OTHER = '0beaa076-658d-427c-8b51-0d16e7d3d2e5';

/**
 * ⚠️ R1 [ruled Josh, S104c] — THE MARKER MUST NEVER DESTROY A BOOKKEEPER'S MEMO.
 *
 * `PrivateNote` is the QuickBooks **Memo** field and a person types in it. The
 * first version of this shipped as an unconditional
 * `PrivateNote: withMarker(note, id)` on a body shared by create AND update, so
 * an expense with no project note REPLACED whatever was there with the bare
 * marker. Measured on the sandbox: **22 of 39 Purchases carry no project note**,
 * so that was the common case, not the edge.
 */
describe('S104c-A — withMarker() preserves and is idempotent', () => {
  it('appends to an existing memo rather than replacing it', () => {
    expect(withMarker('Paid by card, receipt in the folder', ID)).toBe(
      `Paid by card, receipt in the folder ${linkMarker(ID)}`
    );
  });

  it('returns the bare marker when there is genuinely no memo', () => {
    // The create path: nothing to preserve.
    expect(withMarker(null, ID)).toBe(linkMarker(ID));
    expect(withMarker(undefined, ID)).toBe(linkMarker(ID));
    expect(withMarker('', ID)).toBe(linkMarker(ID));
  });

  it('⚠️ IS IDEMPOTENT — a memo that already carries OUR marker is unchanged', () => {
    // Josh's condition. The update path feeds the existing memo back in, so
    // without this every amendment would grow another identical tag.
    const once = withMarker('Monthly Payment', ID);
    expect(withMarker(once, ID)).toBe(once);
    expect(withMarker(withMarker(withMarker(once, ID), ID), ID)).toBe(once);
  });

  it('⚠️ marker-LIKE text that is not ours does NOT suppress the append', () => {
    // Josh's second condition. Another row's marker, or a bookkeeper's own
    // square brackets, must not be mistaken for ours — the row would then be
    // unadoptable and a retry would duplicate it.
    const foreign = `Reversal of ${linkMarker(OTHER)}`;
    expect(withMarker(foreign, ID)).toBe(`${foreign} ${linkMarker(ID)}`);

    for (const lookalike of ['[FF:]', '[FF: ]', 'FF:' + ID, `[ff:${ID}]`, '[FFX:' + ID + ']']) {
      expect(withMarker(lookalike, ID), `"${lookalike}" wrongly suppressed the marker`)
        .toBe(`${lookalike} ${linkMarker(ID)}`);
    }
  });

  it('⚠️ THE TOKEN ITSELF IS FROZEN — anything already written stays adoptable', () => {
    // Josh: "if withMarker() changes shape, adoption has to still match what's
    // already written." Composition may change; this string may not.
    expect(linkMarker(ID)).toBe(`[FF:${ID}]`);
    // And the reader still recognises every composition this module produces.
    expect(memoMatches(withMarker(null, ID), ID)).toBe(true);
    expect(memoMatches(withMarker('a memo', ID), ID)).toBe(true);
    expect(memoMatches(withMarker(withMarker('a memo', ID), ID), ID)).toBe(true);
    expect(memoMatches(withMarker('a memo', OTHER), ID)).toBe(false);
  });
});

/**
 * ⚠️ R2 — adoption must fire for a RE-ENQUEUED row, not only a retried one.
 * A terminal failure retires the queue row, and the one-live-row index does not
 * cover `failed_terminal`, so a status round-trip can produce a fresh row with
 * `attempts = 0`. `markRecordFailed()` writes `qb_push_status='failed'` on the
 * record itself, which survives that.
 */
describe('S104c-B — priorAttemptReachedIntuit()', () => {
  it('false on a genuinely first attempt — the probe must not cost a metered read', () => {
    expect(priorAttemptReachedIntuit({ attempts: 0 }, { qb_push_status: 'not_pushed' })).toBe(false);
    expect(priorAttemptReachedIntuit({ attempts: 0 }, null)).toBe(false);
    expect(priorAttemptReachedIntuit({ attempts: 0 }, undefined)).toBe(false);
    expect(priorAttemptReachedIntuit({ attempts: 0 }, {})).toBe(false);
  });

  it('true on a retry of the same queue row', () => {
    expect(priorAttemptReachedIntuit({ attempts: 1 }, { qb_push_status: 'not_pushed' })).toBe(true);
  });

  it('⚠️ true on a FRESH row whose record already failed — the R2 hole', () => {
    expect(priorAttemptReachedIntuit({ attempts: 0 }, { qb_push_status: 'failed' })).toBe(true);
  });

  it('a pushed or queued record does not trigger the probe', () => {
    for (const s of ['pushed', 'queued', 'not_pushed', null]) {
      expect(priorAttemptReachedIntuit({ attempts: 0 }, { qb_push_status: s })).toBe(false);
    }
  });
});

/**
 * ⚠️ R3 — `TxnDate` was part of the adoption key, and `expenses.expense_date` is
 * mutable (`enforce_expenses_column_scope` does not freeze it, and Owner/Admin
 * bypass that trigger). An exact-date probe misses an edited record and creates
 * a second Purchase.
 */
describe('S104c-C — adoptionWindow()', () => {
  it('spans the record date symmetrically', () => {
    const w = adoptionWindow('2026-09-06');
    expect(w.from).toBe('2026-06-08');
    expect(w.to).toBe('2026-12-05');
  });

  it('covers an edit of up to ADOPTION_WINDOW_DAYS in either direction', () => {
    // ⚠️ MY FIRST VERSION OF THIS ASSERTION WAS WRONG AND THE TEST CAUGHT IT.
    // It asserted the window centred on the NEWEST sandbox Purchase reaches the
    // OLDEST (2026-09-06 back to 2026-05-22, 107 days) — which ±90 does not, and
    // which is not what the window is for. The window is centred on the
    // RECORD'S OWN date and bounds how far that date may have MOVED, not how
    // much history it spans.
    expect(ADOPTION_WINDOW_DAYS).toBeGreaterThanOrEqual(30);
    const w = adoptionWindow('2026-09-06');
    const day = 24 * 60 * 60 * 1000;
    const edited = (n: number) =>
      new Date(Date.parse('2026-09-06T00:00:00Z') + n * day).toISOString().slice(0, 10);

    for (const drift of [-ADOPTION_WINDOW_DAYS, -30, -1, 0, 1, 30, ADOPTION_WINDOW_DAYS]) {
      const d = edited(drift);
      expect(d >= w.from && d <= w.to, `a ${drift}-day edit escaped the window`).toBe(true);
    }
    // ⚠️ AND THE LIMIT, STATED RATHER THAN HIDDEN: a bigger edit than the window
    // still escapes, and the push would duplicate. A year-typo is the realistic
    // one. Recorded in TECH_DEBT rather than met with an ever-wider net.
    expect(edited(ADOPTION_WINDOW_DAYS + 1) <= w.to).toBe(false);
  });

  it('handles a month and a year boundary without drifting', () => {
    expect(adoptionWindow('2026-01-01').from).toBe('2025-10-03');
    expect(adoptionWindow('2026-12-31').to).toBe('2027-03-31');
  });
});
