import { describe, expect, it } from 'vitest';
import {
  SCHEDULE_NEUTRAL,
  SCHEDULE_PALETTE,
  contrastRatio,
  normaliseTrade,
  scheduleColor,
  scheduleColorNote,
  tradeColor,
} from '@framefocus/shared/utils/schedule-colors';

// S121 5-G [RULED Josh, ASK-7] — crew by person (auto, stable, overridable);
// subs/vendors by TRADE (not per person, not editable); no trade → neutral,
// never invisible. And every colour stays legible under its label.

const TRADES = [
  'Electrical', 'Plumbing', 'HVAC', 'Framing', 'Drywall', 'Painting', 'Roofing',
  'Concrete', 'Flooring', 'Landscaping', 'Waterproofing', 'Some Unmapped Trade',
];

describe('contrast — every colour ≥ 4.5:1 against white (white labels; tinted chips)', () => {
  const all = new Set<string>([...SCHEDULE_PALETTE, SCHEDULE_NEUTRAL, ...TRADES.map(tradeColor)]);
  for (const c of all) {
    it(`${c} ≥ 4.5`, () => {
      expect(contrastRatio(c, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('the check can fail: a light amber is refused', () => {
    expect(contrastRatio('#fbbf24', '#ffffff')).toBeLessThan(4.5);
  });
});

describe('crew', () => {
  it('stable per person across loads (the same id → the same colour, every call)', () => {
    const a = scheduleColor({ memberId: 'm-123', memberType: 'crew', explicit: null, trade: null });
    for (let i = 0; i < 5; i++) {
      expect(scheduleColor({ memberId: 'm-123', memberType: 'crew', explicit: null, trade: null })).toBe(a);
    }
    expect(SCHEDULE_PALETTE).toContain(a);
  });
  it('the picker overrides it', () => {
    expect(scheduleColor({ memberId: 'm-123', memberType: 'crew', explicit: '#15803d', trade: null })).toBe('#15803d');
  });
  it('a malformed stored colour is ignored, not rendered', () => {
    const auto = scheduleColor({ memberId: 'm-123', memberType: 'crew', explicit: null, trade: null });
    expect(scheduleColor({ memberId: 'm-123', memberType: 'crew', explicit: 'red', trade: null })).toBe(auto);
  });
});

describe('subs and vendors — by TRADE, not per person, not editable', () => {
  it('all electricians share one colour, whatever the spelling', () => {
    const c = tradeColor('Electrical');
    for (const t of ['electrician', 'ELECTRIC ', '  electrical   contractor']) expect(tradeColor(t)).toBe(c);
  });
  it('two different subs with the same trade → the same colour; per-person ids do not matter', () => {
    const a = scheduleColor({ memberId: 'sub-a', memberType: 'subcontractor', explicit: null, trade: 'Plumbing' });
    const b = scheduleColor({ memberId: 'sub-b', memberType: 'subcontractor', explicit: null, trade: 'plumbing' });
    expect(a).toBe(b);
  });
  it('a sub’s own schedule_color is IGNORED (not editable)', () => {
    expect(
      scheduleColor({ memberId: 'sub-a', memberType: 'subcontractor', explicit: '#be185d', trade: 'Plumbing' })
    ).toBe(tradeColor('Plumbing'));
  });
  it('an unmapped trade still gets ONE stable colour for everyone in it', () => {
    expect(tradeColor('Pool Builders')).toBe(tradeColor('pool   builders'));
    expect(SCHEDULE_PALETTE).toContain(tradeColor('Pool Builders'));
  });
  it('NO trade → neutral slate and the "no trade" note — never invisible', () => {
    for (const t of [null, '', '   ']) {
      expect(normaliseTrade(t)).toBeNull();
      expect(scheduleColor({ memberId: 'sub-x', memberType: 'subcontractor', explicit: null, trade: t })).toBe(SCHEDULE_NEUTRAL);
      expect(scheduleColorNote({ memberType: 'subcontractor', trade: t })).toBe('no trade');
    }
  });
});
