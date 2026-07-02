import { createClient } from '@/lib/supabase-browser';
import type { Database } from '@framefocus/shared/types/database';
import {
  computeEstimateTotals,
  computeLineTotalsFromRows,
  type EstimateMarkupDefaults,
  type RowPricingInput,
} from '@framefocus/shared/utils/estimate-totals';
import type {
  DiscountType,
  EstimateAttachmentType,
  LaborUnit,
  MaterialUnitOfMeasure,
  PricingMode,
  RowType,
} from '@/lib/services/estimates-client';

// Child-table writes are RLS-guarded (D4): company scope + parent
// estimate must be Draft + PMs must own the parent. A blocked UPDATE
// or DELETE surfaces as zero affected rows, so every mutation here
// selects back the touched row and reports failure explicitly.

type CategoryInsert = Database['public']['Tables']['estimate_categories']['Insert'];
type SubcategoryInsert = Database['public']['Tables']['estimate_subcategories']['Insert'];
type LineItemInsert = Database['public']['Tables']['estimate_line_items']['Insert'];
type LineRowInsert = Database['public']['Tables']['estimate_line_rows']['Insert'];
type SubBidInsert = Database['public']['Tables']['estimate_sub_bids']['Insert'];
type EstimateFileInsert = Database['public']['Tables']['estimate_files']['Insert'];

type Result = { success: boolean; error?: string };
type CreateResult = { success: boolean; id?: string; error?: string };

/** Company-wide default labor rate (4D-rev) — pre-fills new labor rows. */
export async function getCompanyDefaultLaborRate(): Promise<number | null> {
  const supabase = createClient();
  const { data } = await supabase.from('companies').select('default_labor_rate').single();
  return data?.default_labor_rate ?? null;
}

// ── Categories ──

export type CreateCategoryInput = Pick<
  CategoryInsert,
  'estimate_id' | 'name' | 'sort_order'
>;
export type UpdateCategoryInput = Partial<Pick<CategoryInsert, 'name' | 'sort_order'>>;

export async function createEstimateCategory(input: CreateCategoryInput): Promise<CreateResult> {
  const supabase = createClient();

  // Postgres defaults fill in company_id, created_by, updated_by.
  const { data, error } = await supabase
    .from('estimate_categories')
    .insert(input)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateEstimateCategory(
  id: string,
  input: UpdateCategoryInput
): Promise<Result> {
  const supabase = createClient();

  // BEFORE UPDATE trigger `estimate_categories_set_updated_by` handles
  // updated_by. updated_at is handled by the existing updated_at trigger.
  const { data, error } = await supabase
    .from('estimate_categories')
    .update(input)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Category not found or estimate not editable' };
  }
  return { success: true };
}

/** Hard delete (per spec) — cascades to subcategories and line items. */
export async function deleteEstimateCategory(id: string): Promise<Result> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_categories')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Category not found or estimate not editable' };
  }
  return { success: true };
}

// ── Subcategories ──

export type CreateSubcategoryInput = Pick<
  SubcategoryInsert,
  'estimate_id' | 'category_id' | 'name' | 'sort_order'
>;
export type UpdateSubcategoryInput = Partial<Pick<SubcategoryInsert, 'name' | 'sort_order'>>;

export async function createEstimateSubcategory(
  input: CreateSubcategoryInput
): Promise<CreateResult> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_subcategories')
    .insert(input)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateEstimateSubcategory(
  id: string,
  input: UpdateSubcategoryInput
): Promise<Result> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_subcategories')
    .update(input)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Subcategory not found or estimate not editable' };
  }
  return { success: true };
}

/** Hard delete — line items fall back to category level (FK SET NULL). */
export async function deleteEstimateSubcategory(id: string): Promise<Result> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_subcategories')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Subcategory not found or estimate not editable' };
  }
  return { success: true };
}

// ── Line items ──

export type CreateLineItemInput = Pick<
  LineItemInsert,
  | 'estimate_id'
  | 'category_id'
  | 'subcategory_id'
  | 'name'
  | 'description'
  | 'discount_amount'
  | 'notes'
  | 'sort_order'
> & {
  discount_type?: DiscountType | null;
};

export type UpdateLineItemInput = Partial<
  Omit<CreateLineItemInput, 'estimate_id'> &
    Pick<LineItemInsert, 'total_price_override'>
>;

export async function createEstimateLineItem(input: CreateLineItemInput): Promise<CreateResult> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_line_items')
    .insert(input)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateEstimateLineItem(
  id: string,
  input: UpdateLineItemInput
): Promise<Result> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_line_items')
    .update(input)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Line item not found or estimate not editable' };
  }
  return { success: true };
}

/** Hard delete — cascades to rows and sub bids. */
export async function deleteEstimateLineItem(id: string): Promise<Result> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_line_items')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Line item not found or estimate not editable' };
  }
  return { success: true };
}

// ── Line rows (labor / material / subcontractor / other) ──

export type CreateLineRowInput = Pick<
  LineRowInsert,
  | 'line_item_id'
  | 'name'
  | 'sort_order'
  | 'markup_percent'
  | 'apply_tax'
  | 'rate'
  | 'quantity'
  | 'catalog_item_id'
  | 'unit_cost'
  | 'amount'
  | 'subcontractor_id'
> & {
  row_type: RowType;
  labor_unit?: LaborUnit | null;
  unit_of_measure?: MaterialUnitOfMeasure | null;
};

// row_type is immutable after creation (different column validity).
export type UpdateLineRowInput = Partial<Omit<CreateLineRowInput, 'line_item_id' | 'row_type'>>;

/**
 * Builds an insert payload with only the columns valid for the row
 * type non-null (mirrors the DB CHECK `estimate_line_rows_type_columns`),
 * so a sloppy caller can never violate it. `total` is left to the
 * recompute (recalculateEstimateTotals) which has the pricing context.
 */
function rowInsertPayload(input: CreateLineRowInput): LineRowInsert {
  const base = {
    line_item_id: input.line_item_id,
    row_type: input.row_type,
    name: input.name,
    sort_order: input.sort_order,
    markup_percent: input.markup_percent ?? null,
  };

  switch (input.row_type) {
    case 'labor':
      return {
        ...base,
        apply_tax: false, // labor is never taxed
        rate: input.rate ?? null,
        quantity: input.quantity ?? null,
        labor_unit: input.labor_unit ?? 'hours',
      };
    case 'material':
      return {
        ...base,
        apply_tax: input.apply_tax ?? true, // materials taxed by default
        unit_of_measure: input.unit_of_measure ?? 'each',
        unit_cost: input.unit_cost ?? null,
        quantity: input.quantity ?? null,
        catalog_item_id: input.catalog_item_id ?? null,
      };
    case 'subcontractor':
      return {
        ...base,
        apply_tax: input.apply_tax ?? false, // opt-in
        amount: input.amount ?? null,
        subcontractor_id: input.subcontractor_id ?? null,
      };
    case 'other':
    default:
      return {
        ...base,
        apply_tax: input.apply_tax ?? false, // opt-in
        amount: input.amount ?? null,
      };
  }
}

export async function createEstimateLineRow(input: CreateLineRowInput): Promise<CreateResult> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_line_rows')
    .insert(rowInsertPayload(input))
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateEstimateLineRow(
  id: string,
  input: UpdateLineRowInput
): Promise<Result> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by. `total` is recomputed by
  // recalculateEstimateTotals, which the caller invokes after.
  const { data, error } = await supabase
    .from('estimate_line_rows')
    .update(input)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Row not found or estimate not editable' };
  }
  return { success: true };
}

export async function deleteEstimateLineRow(id: string): Promise<Result> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_line_rows')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Row not found or estimate not editable' };
  }
  return { success: true };
}

// ── Sub bids ──

export type CreateSubBidInput = Pick<
  SubBidInsert,
  | 'estimate_id'
  | 'line_item_id'
  | 'subcontractor_id'
  | 'bid_amount'
  | 'bid_document_file_id'
  | 'notes'
  | 'received_at'
>;

export type UpdateSubBidInput = Partial<
  Pick<SubBidInsert, 'bid_amount' | 'bid_document_file_id' | 'notes' | 'received_at'>
>;

export async function createEstimateSubBid(input: CreateSubBidInput): Promise<CreateResult> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_sub_bids')
    .insert(input)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateEstimateSubBid(
  id: string,
  input: UpdateSubBidInput
): Promise<Result> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { data, error } = await supabase
    .from('estimate_sub_bids')
    .update(input)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Sub bid not found or estimate not editable' };
  }
  return { success: true };
}

/** Soft delete — bids are an audit trail, never hard-deleted. */
export async function softDeleteEstimateSubBid(id: string): Promise<Result> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_sub_bids')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Sub bid not found or estimate not editable' };
  }
  return { success: true };
}

/**
 * Atomic winner flip via the set_winning_bid RPC (Rev 2 §2.5): clears
 * any previous winner, marks the new one, and upserts a single
 * subcontractor row on the line (insert if none, update if one, error
 * if 2+). Totals are then recomputed here because a row changed.
 */
export async function setWinningBid(
  lineItemId: string,
  subBidId: string
): Promise<Result> {
  const supabase = createClient();

  const { error } = await supabase.rpc('set_winning_bid', {
    p_line_item_id: lineItemId,
    p_sub_bid_id: subBidId,
  });

  if (error) return { success: false, error: error.message };

  const { data: line } = await supabase
    .from('estimate_line_items')
    .select('estimate_id')
    .eq('id', lineItemId)
    .single();

  if (line) {
    const recalc = await recalculateEstimateTotals(line.estimate_id);
    if (!recalc.success) return recalc;
  }
  return { success: true };
}

// ── Estimate files (junction) ──

export type AttachEstimateFileInput = Pick<
  EstimateFileInsert,
  'estimate_id' | 'file_id' | 'notes' | 'sort_order'
> & {
  attachment_type: EstimateAttachmentType;
};

export async function attachEstimateFile(input: AttachEstimateFileInput): Promise<CreateResult> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_files')
    .insert(input)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

/** Hard delete — unlinking the file removes the junction row. */
export async function detachEstimateFile(id: string): Promise<Result> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_files')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Attachment not found or estimate not editable' };
  }
  return { success: true };
}

// ── Totals recompute (§4.4a/§4.4b — app-maintained) ──

/**
 * Recomputes every row total, every line's total_price, and the
 * estimate's totals. Call after any edit that affects pricing
 * (row/markup/discount/tax changes, winner flips, mode switches).
 * A row's markup defaults from the estimate value for its type when
 * NULL (§4.4a), interpreted by the estimate's pricing_mode. Per-row
 * tax applies to material/subcontractor/other rows; labor is never
 * taxed. A non-NULL total_price_override always wins over the
 * computed line total.
 */
export async function recalculateEstimateTotals(estimateId: string): Promise<Result> {
  const supabase = createClient();

  const { data: estimate, error: estimateError } = await supabase
    .from('estimates')
    .select(
      'id, pricing_mode, tax_rate, subcontractor_markup_percent, material_markup_percent, labor_markup_percent, discount_type, discount_amount'
    )
    .eq('id', estimateId)
    .single();

  if (estimateError || !estimate) return { success: false, error: 'Estimate not found' };

  const pricingMode = estimate.pricing_mode as PricingMode;
  const defaults: EstimateMarkupDefaults = {
    subcontractor_markup_percent: estimate.subcontractor_markup_percent,
    material_markup_percent: estimate.material_markup_percent,
    labor_markup_percent: estimate.labor_markup_percent,
  };

  const { data: lines, error: linesError } = await supabase
    .from('estimate_line_items')
    .select('id, discount_type, discount_amount, total_price_override')
    .eq('estimate_id', estimateId);

  if (linesError) return { success: false, error: linesError.message };

  const lineIds = (lines ?? []).map((l) => l.id);
  const { data: rows } =
    lineIds.length > 0
      ? await supabase
          .from('estimate_line_rows')
          .select(
            'id, line_item_id, row_type, markup_percent, apply_tax, rate, quantity, unit_of_measure, unit_cost, amount'
          )
          .in('line_item_id', lineIds)
          .order('sort_order', { ascending: true })
      : { data: [] };

  // Group rows by line, preserving sort order.
  type RowRec = NonNullable<typeof rows>[number];
  const rowsByLine = new Map<string, RowRec[]>();
  for (const r of rows ?? []) {
    const list = rowsByLine.get(r.line_item_id) ?? [];
    list.push(r);
    rowsByLine.set(r.line_item_id, list);
  }

  const computedLines: Array<{ total_price: number; tax_amount: number | null }> = [];

  for (const line of lines ?? []) {
    const lineRows = rowsByLine.get(line.id) ?? [];
    const rowInputs: RowPricingInput[] = lineRows.map((r) => ({
      row_type: r.row_type as RowType,
      rate: r.rate,
      quantity: r.quantity,
      unit_of_measure: r.unit_of_measure,
      unit_cost: r.unit_cost,
      amount: r.amount,
      markup_percent: r.markup_percent,
      apply_tax: r.apply_tax,
    }));

    const lineTotals = computeLineTotalsFromRows({
      rows: rowInputs,
      pricing_mode: pricingMode,
      tax_rate: estimate.tax_rate,
      defaults,
      discount_type: line.discount_type as DiscountType | null,
      discount_amount: line.discount_amount,
      total_price_override: line.total_price_override,
    });

    // Persist each row's marked-up total.
    for (let i = 0; i < lineRows.length; i++) {
      const { error: rowUpdateError } = await supabase
        .from('estimate_line_rows')
        .update({ total: lineTotals.rowTotals[i] })
        .eq('id', lineRows[i].id);
      if (rowUpdateError) return { success: false, error: rowUpdateError.message };
    }

    const { error: lineUpdateError } = await supabase
      .from('estimate_line_items')
      .update({ total_price: lineTotals.total_price })
      .eq('id', line.id);

    if (lineUpdateError) return { success: false, error: lineUpdateError.message };
    computedLines.push({ total_price: lineTotals.total_price, tax_amount: lineTotals.tax_amount });
  }

  const totals = computeEstimateTotals(
    computedLines,
    estimate.discount_type as DiscountType | null,
    estimate.discount_amount
  );

  const { error: totalsError } = await supabase
    .from('estimates')
    .update(totals)
    .eq('id', estimateId);

  if (totalsError) return { success: false, error: totalsError.message };
  return { success: true };
}
