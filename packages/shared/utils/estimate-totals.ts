// Pure pricing math for Module 4 estimates (§4.4, §4.4a, §4.4b).
// All stored money values are app-maintained: the service layer calls
// these helpers and writes the results — the DB never computes totals
// because estimate totals aggregate across child rows.
//
// Conventions:
// - tax_rate and all markup percents are stored as percentages
//   (8.25 means 8.25%), matching how contractors enter them.
// - Money is rounded to 2 decimals at every stored boundary.
//
// Totals model (per §4.4b — whole-estimate discount reduces the
// post-tax, post-line-discount subtotal):
//   line total_price = costs + markups − line discount (tax included
//     in the material portion per §4.4a)
//   estimate subtotal   = Σ line total_price
//   estimate tax_total  = Σ line tax_amount (informational breakdown)
//   estimate discount_total = whole-estimate discount in dollars
//   estimate grand_total = subtotal − discount_total
// Note: §4.14's "grand_total = subtotal + tax_total − discount_total"
// predates the S41 markup model, where tax is already inside line
// totals (§4.4a); adding tax_total again would double-count it.

export type DiscountType = 'percent' | 'fixed';

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
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

/**
 * total_cost for a material row. For allowance rows the unit cost IS
 * the allowance amount and quantity is ignored (§4.14).
 */
export function computeMaterialTotalCost(input: {
  unit_of_measure: string;
  unit_cost: number;
  quantity: number | null | undefined;
}): number {
  if (input.unit_of_measure === 'allowance') return roundMoney(input.unit_cost);
  return roundMoney((input.quantity ?? 0) * input.unit_cost);
}

/** tax_amount for a detailed line: material_cost_subtotal × tax_rate (§4.4). */
export function computeLineTaxAmount(
  materialCostSubtotal: number,
  taxRatePercent: number | null | undefined
): number {
  return roundMoney(materialCostSubtotal * ((taxRatePercent ?? 0) / 100));
}

/**
 * Detailed line (§4.4a):
 * labor × (1 + labor markup) + (materials + tax) × (1 + material markup),
 * then the per-line discount (§4.4b).
 */
export function computeDetailedLineTotal(input: {
  labor_cost: number | null | undefined;
  material_cost_subtotal: number | null | undefined;
  tax_amount: number | null | undefined;
  labor_markup_percent: number | null | undefined;
  material_markup_percent: number | null | undefined;
  discount_type?: DiscountType | null;
  discount_amount?: number | null;
}): number {
  const labor = (input.labor_cost ?? 0) * (1 + (input.labor_markup_percent ?? 0) / 100);
  const material =
    ((input.material_cost_subtotal ?? 0) + (input.tax_amount ?? 0)) *
    (1 + (input.material_markup_percent ?? 0) / 100);
  return roundMoney(applyDiscount(labor + material, input.discount_type, input.discount_amount));
}

/**
 * Lump-sum line (§4.4a):
 * sub bid × (1 + subcontractor markup), then the per-line discount.
 */
export function computeLumpSumLineTotal(input: {
  sub_bid_amount: number | null | undefined;
  subcontractor_markup_percent: number | null | undefined;
  discount_type?: DiscountType | null;
  discount_amount?: number | null;
}): number {
  const total =
    (input.sub_bid_amount ?? 0) * (1 + (input.subcontractor_markup_percent ?? 0) / 100);
  return roundMoney(applyDiscount(total, input.discount_type, input.discount_amount));
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
