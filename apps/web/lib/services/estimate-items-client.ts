import { createClient } from '@/lib/supabase-browser';
import type { Database } from '@framefocus/shared/types/database';
import {
  computeDetailedLineTotal,
  computeEstimateTotals,
  computeLineTaxAmount,
  computeLumpSumLineTotal,
  computeMaterialTotalCost,
  roundMoney,
} from '@framefocus/shared/utils/estimate-totals';
import type {
  DiscountType,
  EstimateAttachmentType,
  LineType,
  MaterialUnitOfMeasure,
} from '@/lib/services/estimates-client';

// Child-table writes are RLS-guarded (D4): company scope + parent
// estimate must be Draft + PMs must own the parent. A blocked UPDATE
// or DELETE surfaces as zero affected rows, so every mutation here
// selects back the touched row and reports failure explicitly.

type CategoryInsert = Database['public']['Tables']['estimate_categories']['Insert'];
type SubcategoryInsert = Database['public']['Tables']['estimate_subcategories']['Insert'];
type LineItemInsert = Database['public']['Tables']['estimate_line_items']['Insert'];
type LineMaterialInsert = Database['public']['Tables']['estimate_line_materials']['Insert'];
type SubBidInsert = Database['public']['Tables']['estimate_sub_bids']['Insert'];
type EstimateFileInsert = Database['public']['Tables']['estimate_files']['Insert'];

type Result = { success: boolean; error?: string };
type CreateResult = { success: boolean; id?: string; error?: string };

// ── Categories ──

export type CreateCategoryInput = Pick<CategoryInsert, 'estimate_id' | 'name' | 'sort_order'>;
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
  | 'sub_bid_amount'
  | 'subcontractor_id'
  | 'labor_cost'
  | 'subcontractor_markup_percent'
  | 'labor_markup_percent'
  | 'material_markup_percent'
  | 'discount_amount'
  | 'notes'
  | 'sort_order'
> & {
  line_type: LineType;
  discount_type?: DiscountType | null;
};

export type UpdateLineItemInput = Partial<Omit<CreateLineItemInput, 'estimate_id'>>;

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

/** Hard delete — cascades to materials and sub bids. */
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

// ── Line materials ──

export type CreateLineMaterialInput = Pick<
  LineMaterialInsert,
  'line_item_id' | 'catalog_item_id' | 'name' | 'unit_cost' | 'quantity'
> & {
  unit_of_measure: MaterialUnitOfMeasure;
};

export type UpdateLineMaterialInput = Partial<Omit<CreateLineMaterialInput, 'line_item_id'>>;

/**
 * total_cost is computed here (app-maintained): quantity × unit_cost,
 * or just unit_cost for allowance rows. Catalog unit costs are
 * snapshotted by the caller passing unit_cost — catalog edits never
 * retro-change existing estimates.
 */
export async function createEstimateLineMaterial(
  input: CreateLineMaterialInput
): Promise<CreateResult> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_line_materials')
    .insert({
      ...input,
      total_cost: computeMaterialTotalCost({
        unit_of_measure: input.unit_of_measure,
        unit_cost: input.unit_cost,
        quantity: input.quantity,
      }),
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateEstimateLineMaterial(
  id: string,
  input: UpdateLineMaterialInput
): Promise<Result> {
  const supabase = createClient();

  // Re-fetch so total_cost recomputes from the merged row, not just
  // the fields present in this update.
  const { data: current, error: fetchError } = await supabase
    .from('estimate_line_materials')
    .select('unit_of_measure, unit_cost, quantity')
    .eq('id', id)
    .single();

  if (fetchError || !current) {
    return { success: false, error: 'Material not found' };
  }

  const merged = { ...current, ...input };
  const { data, error } = await supabase
    .from('estimate_line_materials')
    .update({
      ...input,
      total_cost: computeMaterialTotalCost({
        unit_of_measure: merged.unit_of_measure,
        unit_cost: merged.unit_cost,
        quantity: merged.quantity,
      }),
    })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Material not found or estimate not editable' };
  }
  return { success: true };
}

export async function deleteEstimateLineMaterial(id: string): Promise<Result> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('estimate_line_materials')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Material not found or estimate not editable' };
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
 * Atomic winner flip via the set_winning_bid RPC (Q4): clears any
 * previous winner, marks the new one, and copies bid_amount +
 * subcontractor onto the line item — all in one transaction, with
 * role/draft/ownership checks inside the function. Totals are then
 * recomputed here because the line's sub_bid_amount changed.
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
 * Recomputes every line's derived values and the estimate's totals.
 * Call after any edit that affects pricing (line/material/markup/
 * discount/tax changes, winner flips). Markup cascade: line-level
 * value if set, else the estimate-level value (§4.4a).
 */
export async function recalculateEstimateTotals(estimateId: string): Promise<Result> {
  const supabase = createClient();

  const { data: estimate, error: estimateError } = await supabase
    .from('estimates')
    .select(
      'id, tax_rate, subcontractor_markup_percent, material_markup_percent, labor_markup_percent, discount_type, discount_amount'
    )
    .eq('id', estimateId)
    .single();

  if (estimateError || !estimate) return { success: false, error: 'Estimate not found' };

  const { data: lines, error: linesError } = await supabase
    .from('estimate_line_items')
    .select('id, line_type, labor_cost, sub_bid_amount, subcontractor_markup_percent, labor_markup_percent, material_markup_percent, discount_type, discount_amount')
    .eq('estimate_id', estimateId);

  if (linesError) return { success: false, error: linesError.message };

  const lineIds = (lines ?? []).map((l) => l.id);
  const { data: materials } =
    lineIds.length > 0
      ? await supabase
          .from('estimate_line_materials')
          .select('line_item_id, total_cost')
          .in('line_item_id', lineIds)
      : { data: [] };

  const materialSubtotals = new Map<string, number>();
  for (const m of materials ?? []) {
    materialSubtotals.set(
      m.line_item_id,
      roundMoney((materialSubtotals.get(m.line_item_id) ?? 0) + m.total_cost)
    );
  }

  const computedLines: Array<{ total_price: number; tax_amount: number | null }> = [];

  for (const line of lines ?? []) {
    let materialCostSubtotal: number | null = null;
    let taxAmount: number | null = null;
    let totalPrice: number;

    if (line.line_type === 'lump_sum') {
      totalPrice = computeLumpSumLineTotal({
        sub_bid_amount: line.sub_bid_amount,
        subcontractor_markup_percent:
          line.subcontractor_markup_percent ?? estimate.subcontractor_markup_percent,
        discount_type: line.discount_type as DiscountType | null,
        discount_amount: line.discount_amount,
      });
    } else {
      materialCostSubtotal = materialSubtotals.get(line.id) ?? 0;
      taxAmount = computeLineTaxAmount(materialCostSubtotal, estimate.tax_rate);
      totalPrice = computeDetailedLineTotal({
        labor_cost: line.labor_cost,
        material_cost_subtotal: materialCostSubtotal,
        tax_amount: taxAmount,
        labor_markup_percent: line.labor_markup_percent ?? estimate.labor_markup_percent,
        material_markup_percent:
          line.material_markup_percent ?? estimate.material_markup_percent,
        discount_type: line.discount_type as DiscountType | null,
        discount_amount: line.discount_amount,
      });
    }

    const { error: lineUpdateError } = await supabase
      .from('estimate_line_items')
      .update({
        material_cost_subtotal: materialCostSubtotal,
        tax_amount: taxAmount,
        total_price: totalPrice,
      })
      .eq('id', line.id);

    if (lineUpdateError) return { success: false, error: lineUpdateError.message };
    computedLines.push({ total_price: totalPrice, tax_amount: taxAmount });
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
