import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  paidMinutesForSession,
  timeActivityFields,
  timeActivityMarker,
  txnDateFor,
} from '@/lib/quickbooks/time-activity-body';

// ============================================================================
// S124 Part 1 — the TimeActivity body, and STOP RULE 6: the invoicing rule
// (round UP to the HALF hour, `invoice-derivation.ts`) must never reach the
// payroll push, nor the reverse.
//
// Two independent proofs:
//   A. VALUE: a 7h10m29s paid day pushes 430 minutes (7h10m) — the half-hour
//      rule would give 7h30m — and 7h10m30s rounds to 431 (nearest, not
//      truncated [Josh, RULED Q8]).
//   B. IMPORT GRAPH: neither the payroll rule nor the push body imports the
//      invoicing module, read from the source files (exact import lists).
// ============================================================================

const NO_BREAKS = { otThresholdHours: 40, breaksPaid: false, breakCapMinutes: 0 };
const TZ = 'America/New_York';

function session(id: string, inIso: string, outIso: string, breaks: [string, string][] = []) {
  return {
    id,
    session: { clock_in: inIso, clock_out: outIso },
    segments: breaks.map(([s, e]) => ({
      segment_type: 'break' as const,
      project_id: null,
      segment_start: s,
      segment_end: e,
    })),
  };
}

describe('A. paid minutes are ACTUAL time, nearest minute', () => {
  it('7h10m29s → 430 (7h10m), never the invoice half-hour 450', () => {
    const s = session('s1', '2026-10-05T12:00:00Z', '2026-10-05T19:10:29Z');
    expect(paidMinutesForSession('s1', [s], TZ, NO_BREAKS)).toBe(430);
  });

  it('7h10m30s → 431: rounds to nearest, does not truncate', () => {
    const s = session('s1', '2026-10-05T12:00:00Z', '2026-10-05T19:10:30Z');
    expect(paidMinutesForSession('s1', [s], TZ, NO_BREAKS)).toBe(431);
  });

  it('an unpaid 30-minute break comes off', () => {
    const s = session('s1', '2026-10-05T12:00:00Z', '2026-10-05T20:00:00Z', [
      ['2026-10-05T16:00:00Z', '2026-10-05T16:30:00Z'],
    ]);
    expect(paidMinutesForSession('s1', [s], TZ, NO_BREAKS)).toBe(450);
  });

  it('a paid-break cap is shared across the day: the later session gets what is left', () => {
    const paid = { otThresholdHours: 40, breaksPaid: true, breakCapMinutes: 30 };
    const a = session('a', '2026-10-05T12:00:00Z', '2026-10-05T16:00:00Z', [
      ['2026-10-05T14:00:00Z', '2026-10-05T14:20:00Z'],
    ]);
    const b = session('b', '2026-10-05T17:00:00Z', '2026-10-05T21:00:00Z', [
      ['2026-10-05T19:00:00Z', '2026-10-05T19:20:00Z'],
    ]);
    // a: 240 min, its 20-min break all paid. b: 240 min, 10 of its 20 unpaid.
    expect(paidMinutesForSession('a', [a, b], TZ, paid)).toBe(240);
    expect(paidMinutesForSession('b', [a, b], TZ, paid)).toBe(230);
  });

  it('refuses a session that is not among the day’s sessions', () => {
    expect(() => paidMinutesForSession('x', [], TZ, NO_BREAKS)).toThrow(
      'session x is not among the day’s sessions'.replace('’', "'")
    );
  });
});

describe('the body', () => {
  it('TxnDate is the COMPANY-tz date: 02:30Z on the 6th is the 5th in New York', () => {
    expect(txnDateFor('2026-10-06T02:30:00Z', TZ)).toBe('2026-10-05');
    expect(txnDateFor('2026-10-06T04:30:00Z', TZ)).toBe('2026-10-06');
  });

  it('is exactly these fields: employee, date, hours+minutes, not billable, the marker — no rate, no customer', () => {
    expect(
      timeActivityFields({ qbEmployeeId: '55', txnDate: '2026-10-05', paidMinutes: 431, sessionId: 'abc' })
    ).toEqual({
      NameOf: 'Employee',
      EmployeeRef: { value: '55' },
      TxnDate: '2026-10-05',
      Hours: 7,
      Minutes: 11,
      BillableStatus: 'NotBillable',
      Description: 'EZCB session abc',
    });
  });

  it('the marker is exactly "EZCB session <id>"', () => {
    expect(timeActivityMarker('9d9c')).toBe('EZCB session 9d9c');
  });

  it('refuses fractional or negative minutes', () => {
    expect(() =>
      timeActivityFields({ qbEmployeeId: '1', txnDate: '2026-10-05', paidMinutes: 7.5, sessionId: 'a' })
    ).toThrow('paid minutes must be a non-negative integer, got 7.5');
  });
});

describe('B. the two rounding rules cannot reach each other (import graph)', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const importsOf = (src: string) =>
    [...src.matchAll(/^import[\s\S]*?from\s+'([^']+)';/gm)].map((m) => m[1]).sort();

  it('the payroll rule (shared time-tracking.ts) imports nothing at all', () => {
    expect(importsOf(read('../../../packages/shared/utils/time-tracking.ts'))).toEqual([]);
  });

  it('the push body imports ONLY the payroll rule', () => {
    expect(importsOf(read('../lib/quickbooks/time-activity-body.ts'))).toEqual([
      '@framefocus/shared/utils/time-tracking',
    ]);
  });

  it('the invoicing rule (invoice-derivation.ts) imports only roundMoney, never the payroll rule', () => {
    expect(importsOf(read('../../../packages/shared/utils/invoice-derivation.ts'))).toEqual(['./estimate-totals']);
  });

  it('no module under lib/quickbooks IMPORTS the invoicing rule', () => {
    const dir = fileURLToPath(new URL('../lib/quickbooks/', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) =>
      importsOf(readFileSync(dir + f, 'utf8')).some((m) => /invoice-derivation$/.test(m))
    );
    expect(offenders).toEqual([]);
  });
});
