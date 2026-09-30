// S121 5-G — SCHEDULE COLOURS. ONE rule, every surface. [RULED Josh, ASK-7]
//
//   CREW       auto-assigned, STABLE per person across loads (a hash of the
//              member id into the palette), overridable by the colour picker on
//              the team profile (company_members.schedule_color).
//   SUBS AND   take their colour from their TRADE, not per person — all
//   VENDORS    electricians share one colour, all plumbers another. NOT
//              editable (a sub's own schedule_color is ignored).
//   NO TRADE   a sub/vendor with no trade_type renders in NEUTRAL slate and is
//              labelled "no trade" — never an invisible bar.
//   NO PERSON  job-level events (inspections) render in the same slate.
//
// ⚠️ Before this, desktop fell back to a hash palette (components/schedule/
// member-color.ts) and /m to a flat amber (app/m/team/page.tsx) — the SAME
// member in two colours on two surfaces. Both now call this module (PARITY).
//
// ⚠️ CONTRAST: every colour here carries a WHITE label (Gantt bars) and is
// also used as TEXT on a pale tint of itself (calendar chips). Each is a
// -700-weight shade chosen for ≥ 4.5:1 against white, and
// test/s121-schedule-colors.test.ts computes the WCAG ratio for every entry —
// a lighter colour added later fails that test, not a user's eyes.

/** The crew palette (and the fallback for an unmapped trade). */
export const SCHEDULE_PALETTE = [
  '#1d4ed8', // blue
  '#15803d', // green
  '#b45309', // amber
  '#b91c1c', // red
  '#6d28d9', // violet
  '#0e7490', // cyan
  '#be185d', // pink
  '#4d7c0f', // lime
  '#c2410c', // orange
  '#4338ca', // indigo
] as const;

/** Slate: no person, or a sub/vendor with no trade. */
export const SCHEDULE_NEUTRAL = '#475569';

/**
 * Named trades → a fixed colour. Matched on the NORMALISED trade text (lower
 * case, trimmed, runs of spaces collapsed) by keyword, because
 * subcontractors.trade_type is free text (no CHECK): "Electrical",
 * "electrician" and "ELECTRIC " are one trade.
 */
const TRADE_KEYWORDS: readonly (readonly [RegExp, string])[] = [
  [/electric/, '#b45309'],
  [/plumb/, '#1d4ed8'],
  [/hvac|mechanical|heating|air ?cond/, '#0e7490'],
  [/fram|carpent/, '#c2410c'],
  [/drywall|sheetrock/, '#6d28d9'],
  [/paint/, '#be185d'],
  [/roof/, '#b91c1c'],
  [/concrete|mason|stucco/, '#4338ca'],
  [/floor|tile/, '#15803d'],
  [/landscap|irrigat/, '#4d7c0f'],
  [/waterproof/, '#0369a1'],
];

export function normaliseTrade(trade: string | null | undefined): string | null {
  if (!trade) return null;
  const t = trade.trim().toLowerCase().replace(/\s+/g, ' ');
  return t === '' ? null : t;
}

function hashIndex(s: string, n: number): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return hash % n;
}

/** A trade's colour: a named trade's fixed colour, else a STABLE pick for that trade text. */
export function tradeColor(trade: string | null | undefined): string {
  const t = normaliseTrade(trade);
  if (!t) return SCHEDULE_NEUTRAL;
  for (const [re, c] of TRADE_KEYWORDS) if (re.test(t)) return c;
  return SCHEDULE_PALETTE[hashIndex(`trade:${t}`, SCHEDULE_PALETTE.length)];
}

export interface ColorSubject {
  memberId: string | null;
  /** company_members.member_type: 'crew' | 'subcontractor'. */
  memberType: string | null;
  /** company_members.schedule_color — honoured for CREW only. */
  explicit: string | null;
  /** subcontractors.trade_type — used for subs and vendors. */
  trade: string | null;
}

/** THE colour of a schedule bar. */
export function scheduleColor(s: ColorSubject): string {
  if (!s.memberId) return SCHEDULE_NEUTRAL;
  if (s.memberType === 'subcontractor') return tradeColor(s.trade);
  if (s.explicit && /^#[0-9a-f]{6}$/i.test(s.explicit)) return s.explicit;
  return SCHEDULE_PALETTE[hashIndex(s.memberId, SCHEDULE_PALETTE.length)];
}

/** "no trade" when a sub/vendor carries none — shown beside the neutral bar. */
export function scheduleColorNote(s: Pick<ColorSubject, 'memberType' | 'trade'>): string | null {
  return s.memberType === 'subcontractor' && !normaliseTrade(s.trade) ? 'no trade' : null;
}

/** WCAG relative-luminance contrast ratio of two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
