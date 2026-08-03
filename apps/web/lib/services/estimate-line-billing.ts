import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';
import type { RowCategory } from '@framefocus/shared/utils/invoice-derivation';

// Module 7D1 §2 — BILL THE ESTIMATE'S LINE ITEMS on a fixed-price contract.
//
// JOSH'S RULING [S97]: "converting the contract onto an invoice brings ALL the
// estimate's line items across, ALL SELECTED BY DEFAULT. The user DESELECTS
// what this invoice should not carry." Presentation is chosen per invoice;
// per-line partial billing works the same way costs do, and the unbilled
// remainder of a line stays available for a later invoice.
//
// WHY THIS EXISTS AT ALL. §2's first creation path is "Convert an estimate into
// an invoice", and §2 also says the invoice's detail format "mirrors the
// source's format". What was built was only the DRAW — a percentage of the
// contract total, one lump line — so a fixed-price invoice could never mirror
// anything, and §11's full-detail and by-section levels had no content to
// render. Acceptance #1 tests only the draw half, which is why the gap survived
// a clean test pass.
//
// GRAIN: estimate_line_items. That is the CLIENT-FACING unit and the one
// carrying an agreed sell price. estimate_line_rows underneath it is the
// internal cost build-up (labor/material/sub/other, rates, quantities) and
// never faces a client — it is where the §11 CATEGORY comes from, and nothing
// else.
//
// REMAINING IS DERIVED, NEVER STORED:
//     remaining(item) = sell − Σ billed_amount on live invoice_lines
// so voiding an invoice returns the remainder with no cleanup step, exactly as
// §6.2a's partial cost claims, §2's income section, §3's remaining-to-bill and
// §3a's credit balance all do.
//
// THE WHOLE-ESTIMATE DISCOUNT. Per estimate-totals.ts the model is
//     line total_price = Σ row totals − line discount   (or an override)
//     subtotal         = Σ line total_price
//     grand_total      = subtotal − whole-estimate discount
// and a fixed-price contract value is grand_total. So Σ line items EXCEEDS the
// contract by exactly the whole-estimate discount. Billing every line without
// it would over-bill — and the DB ceiling would refuse the last line with a
// confusing message. Conversion therefore brings the discount across too, as an
// ordinary §8 discount line attributed to the contract, so the arithmetic
// closes exactly at the contract value.

export interface PickableEstimateLine {
  lineItemId: string;
  name: string;
  description: string | null;
  /** estimate_categories.name — the user's own grouping, shown for context. */
  costCode: string | null;
  /** §11 section, derived from the item's ROWS. */
  category: RowCategory;
  /** The agreed sell price: total_price_override when set, else total_price. */
  sell: number;
  /** Σ billed on live invoices. */
  billed: number;
  /** sell − billed. Zero means fully billed; the picker drops it. */
  remaining: number;
  sortOrder: number;
}

export interface EstimateLineBilling {
  estimateId: string | null;
  lines: PickableEstimateLine[];
  /** §8 — the whole-estimate discount, if any, still unbilled. Positive here;
   *  written as a NEGATIVE line. */
  undiscounted: number;
}

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * §11 category for a line ITEM, from the row types underneath it.
 *
 * One row type throughout → that type. Mixed, or no rows at all (a flat-priced
 * item), → 'other'. Deliberately not guessed by dominance: a §11 section is a
 * client-facing claim about what the money is, and a mixed item is honestly
 * "other" rather than probably-labor.
 */
export function categoryForLineItem(rowTypes: string[]): RowCategory {
  const distinct = [...new Set(rowTypes)];
  if (distinct.length === 1) {
    const only = distinct[0];
    if (only === 'labor' || only === 'material' || only === 'subcontractor' || only === 'other') {
      return only;
    }
  }
  return 'other';
}

/**
 * The estimate's line items with what is left to bill on each.
 *
 * Takes the CLIENT so the live harness exercises this exact function rather
 * than a copy of its query (the deriveInvoiceLines / loadProjectIncome /
 * loadDepositCredits precedent).
 */
export async function loadEstimateLineBilling(
  supabase: SupabaseClient,
  projectId: string
): Promise<EstimateLineBilling> {
  const { data: project } = await supabase
    .from('projects')
    .select('source_estimate_id, project_type')
    .eq('id', projectId)
    .maybeSingle();

  const estimateId = project?.source_estimate_id ?? null;
  const empty: EstimateLineBilling = { estimateId, lines: [], undiscounted: 0 };
  if (!estimateId) return empty;

  const [{ data: estimate }, { data: items }] = await Promise.all([
    supabase
      .from('estimates')
      .select('id, subtotal, grand_total, discount_total')
      .eq('id', estimateId)
      .maybeSingle(),
    supabase
      .from('estimate_line_items')
      .select('id, name, description, category_id, total_price, total_price_override, sort_order')
      .eq('estimate_id', estimateId)
      .order('sort_order', { ascending: true }),
  ]);
  if (!items || items.length === 0) return empty;

  const itemIds = items.map((i) => i.id);
  const categoryIds = [...new Set(items.map((i) => i.category_id).filter(Boolean))] as string[];

  const [{ data: rows }, { data: categories }, { data: billedLines }] = await Promise.all([
    supabase
      .from('estimate_line_rows')
      .select('line_item_id, row_type')
      .in('line_item_id', itemIds),
    categoryIds.length > 0
      ? supabase.from('estimate_categories').select('id, name').in('id', categoryIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    // Live invoices only — a VOIDED invoice's lines are retained (§9) but bill
    // nothing, so its share of a line returns with no cleanup step.
    supabase
      .from('invoice_lines')
      .select('source_estimate_line_item_id, billed_amount, invoice_id, invoices!inner(status, is_deleted)')
      .in('source_estimate_line_item_id', itemIds),
  ]);

  const rowTypesByItem = new Map<string, string[]>();
  for (const r of rows ?? []) {
    const list = rowTypesByItem.get(r.line_item_id) ?? [];
    list.push(r.row_type);
    rowTypesByItem.set(r.line_item_id, list);
  }

  const categoryNameById = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const billedByItem = new Map<string, number>();
  for (const l of (billedLines ?? []) as Array<{
    source_estimate_line_item_id: string | null;
    billed_amount: number;
    invoices: { status: string; is_deleted: boolean } | { status: string; is_deleted: boolean }[];
  }>) {
    if (!l.source_estimate_line_item_id) continue;
    // The embed comes back as an object or a one-element array depending on how
    // PostgREST infers the relation — handle both rather than assume (the
    // project_budget_amounts precedent in budget.ts).
    const inv = Array.isArray(l.invoices) ? l.invoices[0] : l.invoices;
    if (!inv || inv.is_deleted || inv.status === 'voided') continue;
    billedByItem.set(
      l.source_estimate_line_item_id,
      money((billedByItem.get(l.source_estimate_line_item_id) ?? 0) + Number(l.billed_amount))
    );
  }

  const lines: PickableEstimateLine[] = [];
  for (const item of items) {
    // A non-NULL override always wins over the computed price
    // (computeLineTotalsFromRows' own rule — not restated, mirrored).
    const sell = money(
      item.total_price_override !== null && item.total_price_override !== undefined
        ? Number(item.total_price_override)
        : Number(item.total_price)
    );
    const billed = billedByItem.get(item.id) ?? 0;
    const remaining = money(sell - billed);
    lines.push({
      lineItemId: item.id,
      name: item.name,
      description: item.description,
      costCode: item.category_id ? categoryNameById.get(item.category_id) ?? null : null,
      category: categoryForLineItem(rowTypesByItem.get(item.id) ?? []),
      sell,
      billed,
      remaining,
      sortOrder: item.sort_order,
    });
  }

  // §8 — the whole-estimate discount, still unapplied. Σ lines is the SUBTOTAL;
  // the contract is grand_total. Without bringing this across, billing every
  // line would exceed the contract by exactly this amount, and the DB ceiling
  // would refuse the last line with a message about the contract rather than
  // about the discount nobody applied.
  //
  // Already-applied is derived the same way as everything else: a discount line
  // carrying the CONTRACT instrument on a live invoice.
  const discountTotal = money(Number(estimate?.discount_total ?? 0));
  let discountApplied = 0;
  if (discountTotal > 0) {
    const { data: discountLines } = await supabase
      .from('invoice_lines')
      .select('billed_amount, invoices!inner(status, is_deleted)')
      .eq('line_type', 'discount')
      .eq('source_estimate_id', estimateId);
    for (const l of (discountLines ?? []) as Array<{
      billed_amount: number;
      invoices: { status: string; is_deleted: boolean } | { status: string; is_deleted: boolean }[];
    }>) {
      const inv = Array.isArray(l.invoices) ? l.invoices[0] : l.invoices;
      if (!inv || inv.is_deleted || inv.status === 'voided') continue;
      discountApplied = money(discountApplied + Math.abs(Number(l.billed_amount)));
    }
  }

  return {
    estimateId,
    lines: lines.filter((l) => l.remaining > 0),
    undiscounted: Math.max(0, money(discountTotal - discountApplied)),
  };
}

/** Server wrapper — RLS-scoped. */
export async function getEstimateLineBilling(projectId: string): Promise<EstimateLineBilling> {
  const supabase = await createClient();
  return loadEstimateLineBilling(supabase as unknown as SupabaseClient, projectId);
}
