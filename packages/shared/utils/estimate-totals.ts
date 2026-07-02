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

export type RowType = 'labor' | 'material' | 'subcontractor' | 'other';

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
 * Pre-markup, pre-tax cost of a single row. For allowance material
 * rows the unit cost IS the allowance amount and quantity is ignored
 * (§4.14).
 */
export function computeRowCost(row: RowPricingInput): number {
  switch (row.row_type) {
    case 'labor':
      return roundMoney((row.rate ?? 0) * (row.quantity ?? 0));
    case 'material':
      if (row.unit_of_measure === 'allowance') return roundMoney(row.unit_cost ?? 0);
      return roundMoney((row.quantity ?? 0) * (row.unit_cost ?? 0));
    case 'subcontractor':
    case 'other':
      return roundMoney(row.amount ?? 0);
    default:
      return 0;
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
      return defaults.material_markup_percent ?? null;
    case 'subcontractor':
    case 'other':
      return defaults.subcontractor_markup_percent ?? null;
    default:
      return null;
  }
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
}): RowPricing {
  const cost = computeRowCost(input.row);
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
