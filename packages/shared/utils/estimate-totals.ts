// Pure pricing math for Module 4 estimates (§4.4, §4.4a, §4.4b).
// All stored money values are app-maintained: the service layer calls
// these helpers and writes the results — the DB never computes totals
// because estimate totals aggregate across child rows.
//
// 4D-rev: a line item is composed of typed rows (labor, material,
// subcontractor, other). Each row carries its own markup (defaulting
// from the estimate when NULL) and its own per-row tax flag. The line
// total is the sum of its row totals, less the per-line discount,
// unless a total_price_override is set (then the override wins).
//
// Conventions:
// - tax_rate and all markup percents are stored as percentages
//   (8.25 means 8.25%), matching how contractors enter them.
// - Money is rounded to 2 decimals at every stored boundary.
// - Tax is computed on the row's pre-markup cost and folded into the
//   markup base (cost + tax) × markup — preserving the 4C material
//   behavior. Labor rows are never taxed.
//
// Totals model (§4.4b — whole-estimate discount reduces the post-line
// subtotal):
//   row total      = pricing(row_cost + row_tax)   [labor: tax = 0]
//   line total_price = Σ row total − line discount  (or override)
//   estimate subtotal     = Σ line total_price
//   estimate tax_total    = Σ row tax (informational breakdown)
//   estimate discount_total = whole-estimate discount in dollars
//   estimate grand_total  = subtotal − discount_total

export type DiscountType = 'percent' | 'fixed';

export type PricingMode = 'markup' | 'margin';

/**
 * [S170] 'allowance' is a FIFTH row type (allowances-selections-spec §2). It
 * prices as quantity × unit_cost and rides the instrument's MATERIAL markup at
 * every level (Josh, S169 Q3 as corrected). The old representation — a
 * material row with unit_of_measure = 'allowance' — was retired by
 * 20261025000000. Every switch on RowType below carries an explicit arm for
 * it; none may absorb it through a default, because every default here is a
 * silent $0 / null / undefined.
 */
export type RowType = 'labor' | 'material' | 'subcontractor' | 'other' | 'allowance';

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Applies a markup or margin percent to a cost (§4.4a + Session 48
 * margin equations):
 *   markup: cost × (1 + pct/100)
 *   margin: cost / (1 − pct/100)
 * Margin is Zod-capped at 99.99; the divisor guard is defensive
 * against bad stored data (returns the raw cost rather than
 * Infinity/negative).
 */
export function applyPricing(
  cost: number,
  pct: number | null | undefined,
  mode: PricingMode
): number {
  const p = pct ?? 0;
  if (mode === 'margin') {
    const divisor = 1 - p / 100;
    if (divisor <= 0) return cost;
    return cost / divisor;
  }
  return cost * (1 + p / 100);
}

export function applyDiscount(
  total: number,
  discountType: DiscountType | null | undefined,
  discountAmount: number | null | undefined
): number {
  if (!discountType || discountAmount == null) return total;
  if (discountType === 'percent') return total * (1 - discountAmount / 100);
  return total - discountAmount;
}

export interface RowPricingInput {
  row_type: RowType;
  // Labor
  rate?: number | null;
  quantity?: number | null;
  // Material (also uses quantity)
  unit_of_measure?: string | null;
  unit_cost?: number | null;
  // Subcontractor / Other
  amount?: number | null;
  // Shared
  markup_percent?: number | null;
  apply_tax?: boolean | null;
}

export interface EstimateMarkupDefaults {
  subcontractor_markup_percent?: number | null;
  material_markup_percent?: number | null;
  labor_markup_percent?: number | null;
}

/**
 * Pre-markup, pre-tax cost of a single row.
 *
 * [S170] An allowance is its own row type and prices as quantity × unit_cost —
 * the same shape as material. _Superseded (4D §4.14, quoted not deleted): "For
 * allowance material rows the unit cost IS the allowance amount and quantity
 * is ignored."_ That representation no longer exists; the migration rewrote
 * such rows with quantity = 1, so the figure is unchanged.
 *
 * The `default` is the trap this function used to be: an unknown type priced
 * at $0 with no error. It now throws, so a sixth type cannot ship quietly.
 */
export function computeRowCost(row: RowPricingInput): number {
  switch (row.row_type) {
    case 'labor':
      return roundMoney((row.rate ?? 0) * (row.quantity ?? 0));
    case 'material':
    case 'allowance':
      return roundMoney((row.quantity ?? 0) * (row.unit_cost ?? 0));
    case 'subcontractor':
    case 'other':
      return roundMoney(row.amount ?? 0);
    default:
      throw new Error(`computeRowCost: unknown row_type ${String(row.row_type)}`);
  }
}

/**
 * Effective markup for a row: its own markup_percent if set, else the
 * estimate-level default for the row's type (labor → labor default,
 * material → material default, subcontractor/other → subcontractor
 * default).
 */
export function resolveRowMarkupPercent(
  rowType: RowType,
  rowMarkup: number | null | undefined,
  defaults: EstimateMarkupDefaults
): number | null {
  if (rowMarkup != null) return rowMarkup;
  switch (rowType) {
    case 'labor':
      return defaults.labor_markup_percent ?? null;
    case 'material':
    // [S170] an allowance rides MATERIAL's default (Q3) — deliberately not its
    // own column, so fixed-price and cost-plus give the same answer by the
    // same rule ("sell derives per instrument").
    case 'allowance':
      return defaults.material_markup_percent ?? null;
    case 'subcontractor':
    case 'other':
      return defaults.subcontractor_markup_percent ?? null;
    default:
      return null;
  }
}

// ── Money-representation additions (docs/specs/money-representation.md) ──

/**
 * Budget cost of a row (spec §5.1 / A-1): pre-markup cost, TAX-INCLUSIVE on
 * any taxed row except labor (labor is never taxed by construction — the
 * type-column CHECK pins apply_tax = false). TS mirror of the SQL cost
 * mapping in convert_estimate_to_project / apply_change_order_budget
 * (migration 20260730010000). Tax here is never client-facing — it is cost
 * measurement only (P3).
 */
export function computeRowBudgetCost(
  row: RowPricingInput,
  taxRate: number | null | undefined
): number {
  const cost = computeRowCost(row);
  if (row.row_type === 'labor' || !row.apply_tax) return cost;
  return roundMoney(cost * (1 + (taxRate ?? 0) / 100));
}

/** Sell for a cost under a negotiated cost-plus (or T&M non-labor) markup
 *  rate — the rate OVERRIDES per-row markup and estimate defaults (P4). */
export function deriveCostPlusSell(cost: number, ratePercent: number): number {
  return roundMoney(cost * (1 + ratePercent / 100));
}

/** Flat labor sell: man-hours × the negotiated flat rate. Both T&M and
 *  cost-plus (A-9) bill own-crew labor this way. Sell-side only — overhead +
 *  profit are baked into the rate; it never touches cost, markup, or the
 *  burden multiplier (spec §4.2, 7d1 §6.1). */
export function deriveFlatLaborSell(hours: number, hourlyRate: number): number {
  return roundMoney(hours * hourlyRate);
}

export type ContractType = 'fixed_price' | 'cost_plus' | 'time_and_materials';

export interface InstrumentPricingContext {
  contract_type: ContractType;
  /** Rates in force for a cost-plus instrument (A-9 — four independent
   *  effective-dated rates; the legacy single cost_plus_percent is read-only
   *  history and never prices). Labor is a flat $/man-hour, the rest are
   *  per-category markups.
   *  S97 corrected ruling: the LABOR rates are NOT consumed by estimate/CO
   *  pricing — a labor row bills at its OWN rate (defaulted from the
   *  instrument rate at row creation, editable; the estimate is a
   *  projection). They default new labor rows and drive 7D invoicing
   *  (approved hours × rate-in-force at the worked date, 7d1 §7). */
  cost_plus_labor_hourly?: number | null;
  cost_plus_material_percent?: number | null;
  cost_plus_subcontractor_percent?: number | null;
  cost_plus_other_percent?: number | null;
  /** Rates in force for a T&M instrument (same labor caveat as above). */
  tm_labor_hourly?: number | null;
  tm_nonlabor_percent?: number | null;
}

const RATE_TYPE_LABELS = {
  cost_plus_labor_hourly: 'labor rate',
  cost_plus_material_percent: 'material markup rate',
  cost_plus_subcontractor_percent: 'subcontractor markup rate',
  cost_plus_other_percent: 'other markup rate',
  tm_labor_hourly: 'labor rate',
  tm_nonlabor_percent: 'non-labor markup rate',
} as const;

export type MissingRateType = keyof typeof RATE_TYPE_LABELS;

/**
 * A cost-plus/T&M instrument has no rate in force for a rate type its
 * contract type requires. A rateless instrument must never price — coalescing
 * to 0% would silently sell at cost (zero margin). Callers stop the recompute
 * and surface the message instead of persisting totals.
 */
export class NoRateInForceError extends Error {
  readonly rateType: MissingRateType;

  constructor(rateType: MissingRateType) {
    super(
      `No ${RATE_TYPE_LABELS[rateType]} in force for this instrument — set a rate before totals can recalculate.`
    );
    this.name = 'NoRateInForceError';
    this.rateType = rateType;
  }
}

/** The cost-plus markup in force for a non-labor row's category (A-9 — each
 *  category prices at ITS OWN independent rate, never a shared percent).
 *  Labor has no markup: it bills flat at the row's own rate (S97). */
function costPlusMarkupFor(
  ctx: InstrumentPricingContext,
  rowType: RowType
): number | null | undefined {
  switch (rowType) {
    case 'material':
    // [S170] cost-plus allowance rides cost_plus_material_percent — there is
    // no cost_plus_allowance_percent rate type, on purpose (no reader: 7D
    // bills actual costs by EXPENSE category, which never carries 'allowance').
    case 'allowance':
      return ctx.cost_plus_material_percent;
    case 'subcontractor':
      return ctx.cost_plus_subcontractor_percent;
    case 'other':
      return ctx.cost_plus_other_percent;
    default:
      return undefined;
  }
}

/**
 * Throws NoRateInForceError when a MARKUP rate the instrument actually uses
 * is null (none in force — e.g. the only rate was superseded). Call before
 * any pricing loop so nothing is persisted at a silent 0% markup.
 * Cost-plus markups are usage-based (7d1 §6.1 — fire when a rate the job's
 * rows actually need is missing); T&M requires its non-labor markup
 * regardless of rows (unchanged).
 * LABOR rates are NOT checked here (S97 corrected ruling): a labor row
 * bills flat at its OWN rate — the instrument labor rate only defaults new
 * rows and drives 7D invoicing — so estimate/CO pricing never needs it.
 * Fixed-price needs no rates and always passes.
 */
export function assertInstrumentRatesInForce(
  ctx: InstrumentPricingContext,
  rows: readonly Pick<RowPricingInput, 'row_type'>[]
): void {
  if (ctx.contract_type === 'cost_plus') {
    const used = new Set(rows.map((r) => r.row_type));
    for (const rowType of ['material', 'subcontractor', 'other', 'allowance'] as const) {
      if (used.has(rowType) && costPlusMarkupFor(ctx, rowType) == null) {
        // [S170] an allowance needs the MATERIAL rate — name that one, not a
        // non-existent cost_plus_allowance_percent.
        const needed = rowType === 'allowance' ? 'material' : rowType;
        throw new NoRateInForceError(`cost_plus_${needed}_percent`);
      }
    }
  }
  if (ctx.contract_type === 'time_and_materials') {
    if (ctx.tm_nonlabor_percent == null) throw new NoRateInForceError('tm_nonlabor_percent');
  }
}

/**
 * Applies the instrument's negotiated-rate overrides to row inputs (P4):
 * cost-plus — each non-labor row's markup_percent becomes ITS category's
 * rate (A-9 — independent material/sub/other markups, never one percent
 * across the board);
 * T&M — non-labor rows take tm_nonlabor_percent.
 * Labor rows on both are left untouched — they bill flat at their OWN rate
 * (hours × row rate via the flat_rate_labor path below, S97), so their
 * markup is irrelevant. Fixed-price returns the rows untouched.
 * A null markup rate a row actually needs throws NoRateInForceError —
 * never 0%, which would silently price at cost.
 */
export function applyInstrumentRateOverrides(
  rows: RowPricingInput[],
  ctx: InstrumentPricingContext
): RowPricingInput[] {
  assertInstrumentRatesInForce(ctx, rows);
  if (ctx.contract_type === 'cost_plus') {
    return rows.map((r) =>
      r.row_type === 'labor' ? r : { ...r, markup_percent: costPlusMarkupFor(ctx, r.row_type) }
    );
  }
  if (ctx.contract_type === 'time_and_materials') {
    return rows.map((r) =>
      r.row_type === 'labor' ? r : { ...r, markup_percent: ctx.tm_nonlabor_percent }
    );
  }
  return rows;
}

export interface RowPricing {
  cost: number;
  tax_amount: number;
  total: number;
}

/**
 * Full pricing for one row: cost, tax (0 for labor or untaxed rows),
 * and the marked-up/margined total. Tax is folded into the markup
 * base (cost + tax) to preserve the 4C material behavior.
 */
export function computeRowPricing(input: {
  row: RowPricingInput;
  pricing_mode: PricingMode;
  tax_rate: number | null | undefined;
  defaults: EstimateMarkupDefaults;
  /** Non-fixed instruments (cost-plus and T&M): labor rows bill FLAT —
   *  hours × the ROW's own rate, no markup, no tax, no burden (spec §4.2 /
   *  7d1 §6.1). S97 corrected ruling: the row rate IS the charge rate for
   *  the projection — it defaults from the instrument's labor rate in force
   *  at row creation and stays editable; 7D invoicing (not this function)
   *  bills approved hours at the rate in force per 7d1 §7. Omit/false on
   *  fixed-price: labor prices by the ordinary markup path. */
  flat_rate_labor?: boolean;
}): RowPricing {
  const cost = computeRowCost(input.row);
  if (input.row.row_type === 'labor' && input.flat_rate_labor) {
    return {
      cost,
      tax_amount: 0,
      total: deriveFlatLaborSell(input.row.quantity ?? 0, input.row.rate ?? 0),
    };
  }
  const taxable = input.row.row_type !== 'labor' && !!input.row.apply_tax;
  const tax = taxable ? roundMoney(cost * ((input.tax_rate ?? 0) / 100)) : 0;
  const markup = resolveRowMarkupPercent(input.row.row_type, input.row.markup_percent, input.defaults);
  const total = roundMoney(applyPricing(cost + tax, markup, input.pricing_mode));
  return { cost, tax_amount: tax, total };
}

export interface LineTotals {
  total_price: number;
  tax_amount: number;
  /** Per-row marked-up totals, in input order (for storing row.total). */
  rowTotals: number[];
}

/**
 * Line total from its rows (§4.4a/§4.4b): Σ row total, then the
 * per-line discount. A non-NULL total_price_override always wins over
 * the computed total. tax_amount is the informational sum of row tax.
 */
export function computeLineTotalsFromRows(input: {
  rows: RowPricingInput[];
  pricing_mode: PricingMode;
  tax_rate: number | null | undefined;
  defaults: EstimateMarkupDefaults;
  discount_type?: DiscountType | null;
  discount_amount?: number | null;
  total_price_override?: number | null;
  /** Non-fixed instruments only — see computeRowPricing. */
  flat_rate_labor?: boolean;
}): LineTotals {
  let sum = 0;
  let tax = 0;
  const rowTotals: number[] = [];
  for (const row of input.rows) {
    const p = computeRowPricing({
      row,
      pricing_mode: input.pricing_mode,
      tax_rate: input.tax_rate,
      defaults: input.defaults,
      flat_rate_labor: input.flat_rate_labor,
    });
    rowTotals.push(p.total);
    sum += p.total;
    tax += p.tax_amount;
  }
  const computed = roundMoney(applyDiscount(roundMoney(sum), input.discount_type, input.discount_amount));
  const total_price =
    input.total_price_override != null ? roundMoney(input.total_price_override) : computed;
  return { total_price, tax_amount: roundMoney(tax), rowTotals };
}

export interface EstimateTotals {
  subtotal: number;
  tax_total: number;
  discount_total: number;
  grand_total: number;
}

/**
 * Whole-estimate totals from already-computed line values (§4.4b).
 */
export function computeEstimateTotals(
  lines: Array<{ total_price: number; tax_amount: number | null | undefined }>,
  discountType: DiscountType | null | undefined,
  discountAmount: number | null | undefined
): EstimateTotals {
  const subtotal = roundMoney(lines.reduce((sum, l) => sum + l.total_price, 0));
  const taxTotal = roundMoney(lines.reduce((sum, l) => sum + (l.tax_amount ?? 0), 0));
  const grandTotal = roundMoney(applyDiscount(subtotal, discountType, discountAmount));
  return {
    subtotal,
    tax_total: taxTotal,
    discount_total: roundMoney(subtotal - grandTotal),
    grand_total: grandTotal,
  };
}
