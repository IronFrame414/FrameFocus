// Estimates redesign — service #5: the proposal format mapper.
// Spec: docs/specs/estimates-redesign-spec.md §3.4; R8/Q4; audit §9.3.
//
// The ONE place that maps a STORED proposal-format value to what the client is
// shown, and — the load-bearing part — whether the client sees your COST. Both
// the send PDF (proposal-data) and the client portal import THIS, so the
// cost-disclosure boundary cannot diverge between the two surfaces (audit O6).
//
// ⚠️ STORED values and DISPLAY names diverge BY DESIGN. The legacy five codes
// remain stored on 23 sent estimates and must NEVER be rewritten (a sent
// proposal's format is part of what the client agreed to); they map to the
// nearest display name here. The canonical eight are what new estimates store.
//
// ⚠️ COST DISCLOSURE: only the two OPEN-BOOK formats print cost — and because
// they print cost they also print the fee/markup on top of it. The six others
// (and every legacy code) NEVER print cost or markup; "Itemized" prints a
// CLIENT PRICE per line, which is not the same as showing cost. Getting
// `showsCost` wrong shows a client your margin.

export type ProposalTier = 'lump_sum' | 'detailed' | 'open_book';

/** The eight canonical stored codes (new estimates store these). */
export type CanonicalProposalFormat =
  | 'total_only'
  | 'summary'
  | 'summary_with_descriptions'
  | 'itemized'
  | 'itemized_with_descriptions'
  | 'itemized_no_unit_pricing'
  | 'cost_plus_itemized'
  | 'time_and_materials_itemized';

export interface ProposalFormatInfo {
  /** The canonical code this stored value resolves to. */
  code: CanonicalProposalFormat;
  /** The name shown to the user (picker, preview, PDF header). */
  label: string;
  tier: ProposalTier;
  /** ⚠️ Does the printed proposal expose your cost (and thus your fee/markup)? */
  showsCost: boolean;
  /** True when the stored value is a retired legacy code mapped to its nearest
   *  display name — the row is never rewritten, only presented. */
  legacy: boolean;
}

const CANONICAL: Record<CanonicalProposalFormat, Omit<ProposalFormatInfo, 'code' | 'legacy'>> = {
  total_only:                 { label: 'Total Only',                 tier: 'lump_sum', showsCost: false },
  summary:                    { label: 'Summary',                    tier: 'lump_sum', showsCost: false },
  summary_with_descriptions:  { label: 'Summary with Descriptions',  tier: 'lump_sum', showsCost: false },
  itemized:                   { label: 'Itemized',                   tier: 'detailed', showsCost: false },
  itemized_with_descriptions: { label: 'Itemized with Descriptions', tier: 'detailed', showsCost: false },
  itemized_no_unit_pricing:   { label: 'Itemized, No Unit Pricing',  tier: 'detailed', showsCost: false },
  cost_plus_itemized:         { label: 'Cost Plus — Itemized',       tier: 'open_book', showsCost: true },
  time_and_materials_itemized:{ label: 'Time & Materials — Itemized', tier: 'open_book', showsCost: true },
};

// Legacy five → nearest canonical code. NONE of the legacy codes is open-book,
// so all resolve to showsCost:false — safe by construction.
const LEGACY_TO_CANONICAL: Record<string, CanonicalProposalFormat> = {
  lump_sum:              'total_only',
  category_with_price:   'summary',
  category_no_price:     'summary',                 // nearest: category-level, no line items
  detail_with_price_qty: 'itemized',
  detail_no_price:       'itemized_no_unit_pricing',// nearest: lines shown, no per-line price
};

/** The eight, in tier order, for a picker. */
export const PROPOSAL_FORMAT_ORDER: CanonicalProposalFormat[] = [
  'total_only', 'summary', 'summary_with_descriptions',
  'itemized', 'itemized_with_descriptions', 'itemized_no_unit_pricing',
  'cost_plus_itemized', 'time_and_materials_itemized',
];

/** Resolve any stored proposal-format value (canonical OR legacy) to its
 *  presentation. Unknown values fall back to total_only/no-cost — the safe
 *  default (never accidentally disclose cost). */
export function resolveProposalFormat(stored: string | null | undefined): ProposalFormatInfo {
  if (stored && stored in CANONICAL) {
    const code = stored as CanonicalProposalFormat;
    return { code, legacy: false, ...CANONICAL[code] };
  }
  if (stored && stored in LEGACY_TO_CANONICAL) {
    const code = LEGACY_TO_CANONICAL[stored];
    return { code, legacy: true, ...CANONICAL[code] };
  }
  // Unknown → safest: a single total, no cost shown.
  return { code: 'total_only', legacy: false, ...CANONICAL.total_only };
}

/** ⚠️ The cost-disclosure predicate. The single source of truth both surfaces
 *  use to decide whether to print cost/markup. */
export function proposalFormatShowsCost(stored: string | null | undefined): boolean {
  return resolveProposalFormat(stored).showsCost;
}

/** The canonical-eight render plan — the ONE source both proposal renderers
 *  (React-PDF `proposal-template` and signing-page `proposal-html`) switch on,
 *  so the format taxonomy cannot fork into two disagreeing implementations
 *  (the #129 parity hazard). Legacy stored values are handled by each renderer's
 *  own legacy path and never reach here. */
export type ProposalLayout =
  | 'total' // one grand total, no lines, no categories
  | 'category' // one price per category, no line items
  | 'itemized' // line items listed (prices per §linePrices)
  | 'cost_plus' // open book: contractor price · markup % · sell, sell totals only
  | 'time_and_materials'; // open book: Time (rate·hrs·total) + Material (total only)

export interface ProposalRenderPlan {
  layout: ProposalLayout;
  /** List individual line items (itemized/open-book layouts). */
  showLines: boolean;
  /** Show a per-line sell price (false for itemized_no_unit_pricing). */
  linePrices: boolean;
  /** Show line descriptions (the *_with_descriptions variants). */
  descriptions: boolean;
  /** Open book — cost (and thus markup) is printed. */
  showsCost: boolean;
}

const RENDER_PLAN: Record<CanonicalProposalFormat, ProposalRenderPlan> = {
  total_only:                 { layout: 'total',    showLines: false, linePrices: false, descriptions: false, showsCost: false },
  summary:                    { layout: 'category', showLines: false, linePrices: false, descriptions: false, showsCost: false },
  summary_with_descriptions:  { layout: 'category', showLines: false, linePrices: false, descriptions: true,  showsCost: false },
  itemized:                   { layout: 'itemized', showLines: true,  linePrices: true,  descriptions: false, showsCost: false },
  itemized_with_descriptions: { layout: 'itemized', showLines: true,  linePrices: true,  descriptions: true,  showsCost: false },
  itemized_no_unit_pricing:   { layout: 'itemized', showLines: true,  linePrices: false, descriptions: false, showsCost: false },
  cost_plus_itemized:         { layout: 'cost_plus', showLines: true, linePrices: true,  descriptions: false, showsCost: true },
  time_and_materials_itemized:{ layout: 'time_and_materials', showLines: true, linePrices: true, descriptions: false, showsCost: true },
};

/** Resolve a CANONICAL format code to its render plan. Callers must pass a
 *  canonical code (resolve legacy separately) — a legacy or unknown value falls
 *  back to the safest plan (a single total, no cost). */
export function proposalRenderPlan(code: CanonicalProposalFormat): ProposalRenderPlan {
  return RENDER_PLAN[code] ?? RENDER_PLAN.total_only;
}

/** Q4: open-book (a cost-showing format) on a fixed-price/lump-sum contract is
 *  ALLOWED but FLAGGED — the same posture as T&M-presented-as-lump-sum. Returns
 *  a flag message when the pairing is worth warning about, else null. Never
 *  blocks. */
export function proposalFormatContractWarning(
  stored: string | null | undefined,
  contractType: string | null | undefined
): string | null {
  const info = resolveProposalFormat(stored);
  if (info.showsCost && contractType === 'fixed_price') {
    return 'This is a fixed-price contract shown in an open-book format — the client will see your cost and fee. Allowed, but confirm that is intended.';
  }
  if (!info.showsCost && contractType === 'time_and_materials' && info.tier === 'lump_sum') {
    return 'This is a T&M contract presented as a lump sum — the client will not see the rates they are billed against. Allowed, but a common way to lose an argument later.';
  }
  return null;
}
