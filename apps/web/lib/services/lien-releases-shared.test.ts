import { describe, it, expect } from 'vitest';
import {
  canVoidRelease,
  fitTextToBox,
  isLegalValueKey,
  MIN_FONT_SIZE,
  releaseAmount,
  releaseEffectOfInvoiceVoid,
  REMOVED_VALUE_KEYS,
  selectTemplate,
  VALUE_CATALOG,
  type TemplateChoice,
} from './lien-releases-shared';

const tpl = (o: Partial<TemplateChoice>): TemplateChoice => ({
  id: 'x',
  name: 'T',
  type: 'conditional',
  is_final: false,
  direction: 'client_outbound',
  jurisdiction_state: null,
  hasPdf: true,
  ...o,
});

describe('§4.2 template selection', () => {
  const four: TemplateChoice[] = [
    tpl({ id: 'c', name: 'Conditional Release', type: 'conditional', is_final: false }),
    tpl({ id: 'u', name: 'Unconditional Release', type: 'unconditional', is_final: false }),
    tpl({ id: 'uf', name: 'Unconditional — Final', type: 'unconditional', is_final: true }),
    tpl({ id: 'cf', name: 'Conditional — Final', type: 'conditional', is_final: true }),
  ];

  it('the retainage release invoice (is_final) selects Conditional Final', () => {
    const sel = selectTemplate(four, {
      type: 'conditional',
      isFinal: true,
      direction: 'client_outbound',
    });
    expect(sel.preselected?.id).toBe('cf');
    expect(sel.ambiguous).toBe(false);
  });

  it('an ordinary invoice send selects the plain Conditional', () => {
    const sel = selectTemplate(four, {
      type: 'conditional',
      isFinal: false,
      direction: 'client_outbound',
    });
    expect(sel.preselected?.id).toBe('c');
  });

  it('ALWAYS returns the full option list — the picker is never skipped', () => {
    const sel = selectTemplate(four, {
      type: 'conditional',
      isFinal: false,
      direction: 'client_outbound',
    });
    expect(sel.options).toHaveLength(4);
  });

  it('§4.3 — two templates in one slot is flagged, not silently resolved', () => {
    const sel = selectTemplate(
      [...four, tpl({ id: 'c2', name: 'Conditional (lender form)' })],
      { type: 'conditional', isFinal: false, direction: 'client_outbound' }
    );
    expect(sel.ambiguous).toBe(true);
    expect(sel.preselected).toBeTruthy();
    expect(sel.options).toHaveLength(5);
  });

  it('sub_inbound templates never appear in a client_outbound picker', () => {
    const sel = selectTemplate(
      [...four, tpl({ id: 's', direction: 'sub_inbound' })],
      { type: 'conditional', isFinal: false, direction: 'client_outbound' }
    );
    expect(sel.options.map((o) => o.id)).not.toContain('s');
  });

  it('no match yields a null preselection rather than an arbitrary one', () => {
    const sel = selectTemplate([four[0]], {
      type: 'unconditional',
      isFinal: true,
      direction: 'client_outbound',
    });
    expect(sel.preselected).toBeNull();
    expect(sel.options).toHaveLength(1);
  });
});

describe('§6 value catalog', () => {
  it('accepts a live key', () => {
    expect(isLegalValueKey('release_amount')).toBe(true);
    expect(isLegalValueKey('property_address')).toBe(true);
  });

  it('REFUSES every key removed at S98 — they must not come back', () => {
    for (const removed of REMOVED_VALUE_KEYS) {
      expect(isLegalValueKey(removed), `${removed} is live again`).toBe(false);
    }
  });

  it('refuses an unknown key outright', () => {
    expect(isLegalValueKey('notary_signature')).toBe(false);
    expect(isLegalValueKey('')).toBe(false);
  });

  it('carries no notary field at all — the notary fills that area (§6.6)', () => {
    const notaryish = VALUE_CATALOG.filter((v) => /notar/i.test(v.key) || /notar/i.test(v.label));
    expect(notaryish).toHaveLength(0);
  });

  it('every catalog key is unique', () => {
    const keys = VALUE_CATALOG.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('§3.1 text overflow — shrink to fit, with a floor', () => {
  // widthPerChar 0.5 => a 10-char string at size 10 is 50pt wide.
  it('leaves text that already fits alone', () => {
    const r = fitTextToBox('SHORT', 100, 10, 0.5);
    expect(r.fontSize).toBe(10);
    expect(r.shrunk).toBe(false);
    expect(r.overflows).toBe(false);
  });

  it('shrinks text that does not fit, and says it shrank', () => {
    // 20 chars at widthPerChar 0.5 needs `boxWidth / 10` points of size. An
    // 80pt box therefore needs 8pt — a real shrink from 10, and comfortably
    // above the 6pt floor, so this exercises the shrink path and NOT the
    // overflow path. (A 50pt box would need 5pt, below the floor: that is the
    // next test, and getting the two mixed up is how a floor stops being
    // tested at all.)
    const r = fitTextToBox('A'.repeat(20), 80, 10, 0.5);
    expect(r.fontSize).toBe(8);
    expect(r.shrunk).toBe(true);
    expect(r.overflows).toBe(false);
    expect(r.fontSize * 20 * 0.5).toBeLessThanOrEqual(80);
  });

  it('never goes below the legibility floor, and flags the overflow', () => {
    const r = fitTextToBox('A'.repeat(200), 20, 10, 0.5);
    expect(r.fontSize).toBe(MIN_FONT_SIZE);
    expect(r.overflows).toBe(true);
    expect(r.shrunk).toBe(true);
  });

  it('NEVER truncates — the full string is always the caller\'s to render', () => {
    // The contract is that this returns a SIZE, never a shortened string. A
    // truncated name or amount on a legal instrument reads as complete and
    // says something else; that is why truncation was rejected.
    const r = fitTextToBox('Bishop Contracting LLC', 10, 12, 0.5);
    expect(typeof r.fontSize).toBe('number');
    expect(Object.keys(r).sort()).toEqual(['fontSize', 'overflows', 'shrunk']);
  });

  it('degrades safely on empty or zero-width input', () => {
    expect(fitTextToBox('', 100, 10, 0.5).fontSize).toBe(10);
    expect(fitTextToBox('x', 0, 10, 0.5).fontSize).toBe(10);
    expect(fitTextToBox('x', 100, 10, 0).fontSize).toBe(10);
  });
});

describe('§8.1 void', () => {
  it('requires a reason', () => {
    expect(canVoidRelease('sent', '').allowed).toBe(false);
    expect(canVoidRelease('sent', '   ').allowed).toBe(false);
    expect(canVoidRelease('sent', 'wrong amount').allowed).toBe(true);
  });

  it('a SENT release can still be voided — the record is the point', () => {
    expect(canVoidRelease('sent', 'issued against the wrong invoice').allowed).toBe(true);
  });

  it('refuses to void twice', () => {
    const d = canVoidRelease('voided', 'again');
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('already voided');
  });
});

describe('§8.1 invoice-void interaction', () => {
  it('a successor invoice re-prompts a release', () => {
    expect(releaseEffectOfInvoiceVoid('sent', true)).toBe('void_and_reprompt');
  });

  it('a terminal void prompts nothing — there is nothing left to release', () => {
    expect(releaseEffectOfInvoiceVoid('sent', false)).toBe('void_only');
  });

  it('an already-voided release is untouched', () => {
    expect(releaseEffectOfInvoiceVoid('voided', true)).toBe('none');
  });
});

describe('§6.4 the amount rule', () => {
  it('a conditional carries what is payable NOW', () => {
    expect(releaseAmount('conditional', 9500, 0).amount).toBe(9500);
  });

  it('an unconditional carries what actually ARRIVED, not the receivable', () => {
    const r = releaseAmount('unconditional', 9500, 4000);
    expect(r.amount).toBe(4000);
    expect(r.clamped).toBe(false);
  });

  it('CLAMPS if applications ever exceed the receivable, and says so', () => {
    // 7E's P-4 makes this impossible today. The guard exists for the day P-4
    // is relaxed — an over-waiver is not a rounding error, it is a legal
    // instrument giving away more than was received.
    const r = releaseAmount('unconditional', 5000, 6000);
    expect(r.amount).toBe(5000);
    expect(r.clamped).toBe(true);
  });

  it('an unpaid invoice yields a zero unconditional, never the receivable', () => {
    expect(releaseAmount('unconditional', 9500, 0).amount).toBe(0);
  });
});
