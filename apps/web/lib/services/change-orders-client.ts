import { createClient } from '@/lib/supabase-browser';
import type { Database } from '@framefocus/shared/types/database';
import {
  applyInstrumentRateOverrides,
  assertInstrumentRatesInForce,
  computeLineTotalsFromRows,
  NoRateInForceError,
  roundMoney,
  type ContractType,
  type EstimateMarkupDefaults,
  type RowPricingInput,
} from '@framefocus/shared/utils/estimate-totals';
import { loadInstrumentPricingContext } from '@/lib/services/estimate-items-client';
import type {
  ChangeOrder,
  ChangeOrderLineItem,
  ChangeOrderLineItemWithRows,
  ChangeOrderLineRow,
  ChangeOrderStatus,
  ChangeOrderType,
  ChangeOrderWithAuthor,
  ChangeOrderWithChildren,
  CoLaborUnit,
  CoPricingMode,
  CoRowType,
  CoSigningSession,
} from '@/lib/services/change-orders';
export type {
  ChangeOrder,
  ChangeOrderLineItem,
  ChangeOrderLineItemWithRows,
  ChangeOrderLineRow,
  ChangeOrderStatus,
  ChangeOrderType,
  ChangeOrderWithAuthor,
  ChangeOrderWithChildren,
  CoLaborUnit,
  CoPricingMode,
  CoRowType,
  CoSigningSession,
};
// Presentation label map. Kept in this client-safe module (not change-orders.ts,
// which imports the server Supabase client) so client components can import it
// directly. change-orders.ts re-exports it for server-side consumers.
export const CO_STATUS_LABELS: Record<ChangeOrderStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  signed: 'Signed',
  voided: 'Voided',
};

// 5D — client-side CO writes. A CO mirrors an estimate: typed rows with
// SIGNED values — a credit is a normal row with a negative rate /
// unit_cost / amount (D-2), and §4.4a tax-then-markup applies to it
// unchanged (D-3). Send and void go through API routes because
// co_signing_sessions has no client write policies (service-role only,
// M4 pattern).

type ChangeOrderInsert = Database['public']['Tables']['change_orders']['Insert'];
type CoLineItemInsert = Database['public']['Tables']['change_order_line_items']['Insert'];
type CoLineRowInsert = Database['public']['Tables']['change_order_line_rows']['Insert'];

type Result = { success: boolean; error?: string };
type CreateResult = { success: boolean; id?: string; error?: string };

// ── Change orders ──

export interface CreateChangeOrderInput {
  project_id: string;
  title: string;
  description?: string | null;
  co_type?: ChangeOrderType;
  reason_category?: string | null;
  schedule_impact_days?: number | null;
}

/**
 * Creates a draft CO: pulls the next CO-####-## number from the
 * project's sequence (D-7, row-locked RPC) and copies the §4.4a pricing
 * context from the source estimate so CO rows inherit estimate math
 * (falls back to the project tax rate for a project without one).
 * company_id / author_member_id / created_by fill from column defaults.
 */
export async function createChangeOrder(input: CreateChangeOrderInput): Promise<CreateResult> {
  const supabase = createClient();

  const { data: coNumber, error: numberError } = await supabase.rpc('next_co_number', {
    p_project_id: input.project_id,
  });
  if (numberError || !coNumber) {
    return { success: false, error: numberError?.message ?? 'Could not reserve a CO number' };
  }

  const { data: project } = await supabase
    .from('projects')
    .select('source_estimate_id, tax_rate, project_type')
    .eq('id', input.project_id)
    .single();

  let pricing: Pick<
    ChangeOrderInsert,
    | 'pricing_mode'
    | 'tax_rate'
    | 'subcontractor_markup_percent'
    | 'material_markup_percent'
    | 'labor_markup_percent'
  > = {
    pricing_mode: 'markup',
    tax_rate: project?.tax_rate ?? null,
    subcontractor_markup_percent: null,
    material_markup_percent: null,
    labor_markup_percent: null,
  };

  if (project?.source_estimate_id) {
    const { data: estimate } = await supabase
      .from('estimates')
      .select(
        'pricing_mode, tax_rate, subcontractor_markup_percent, material_markup_percent, labor_markup_percent'
      )
      .eq('id', project.source_estimate_id)
      .single();
    if (estimate) pricing = estimate;
  }

  const payload: ChangeOrderInsert = {
    project_id: input.project_id,
    co_number: coNumber,
    title: input.title,
    description: input.description ?? null,
    co_type: input.co_type ?? (project?.project_type as ChangeOrderType | undefined) ?? 'fixed_price',
    reason_category: input.reason_category ?? null,
    schedule_impact_days: input.schedule_impact_days ?? null,
    ...pricing,
  };

  const { data, error } = await supabase
    .from('change_orders')
    .insert(payload)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export type UpdateChangeOrderInput = Partial<
  Pick<
    ChangeOrderInsert,
    'title' | 'description' | 'reason_category' | 'schedule_impact_days'
  > & { co_type: ChangeOrderType }
>;

/** Draft-detail edits. Lifecycle moves go through send/void, never here. */
export async function updateChangeOrder(
  id: string,
  input: UpdateChangeOrderInput
): Promise<Result> {
  const supabase = createClient();

  // BEFORE UPDATE trigger `change_orders_set_updated_by` handles updated_by.
  // updated_at is handled by the existing updated_at trigger.
  const { data, error } = await supabase
    .from('change_orders')
    .update(input)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Change order not found or not editable' };
  }
  return { success: true };
}

/** Soft delete (trash-bin pattern). UI restricts this to Owner/Admin (§8). */
export async function softDeleteChangeOrder(id: string): Promise<Result> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('change_orders')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Change order not found' };
  }
  return { success: true };
}

/**
 * Send (D-4: sending IS the internal contractor-side acceptance) — the
 * API route flips draft → sent and mints the tokenized signing link the
 * contractor shares manually (client delivery is Decision-Gate-gated).
 */
export async function sendChangeOrder(
  id: string,
  input?: {
    recipient_name?: string;
    recipient_email?: string;
    // Contractor signature (signed-artifact spec §4.2) — required by the send
    // route on first send; reused verbatim on re-send so omitted then.
    contractor_signature_mode?: 'saved_image' | 'typed_name';
    contractor_signature_name?: string;
  }
): Promise<{ success: boolean; signingUrl?: string; error?: string }> {
  try {
    const res = await fetch(`/api/change-orders/${id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    });
    const json = await res.json();
    if (!res.ok) return { success: false, error: json.error ?? 'Send failed' };
    return { success: true, signingUrl: json.signingUrl };
  } catch {
    return { success: false, error: 'Network error — please try again.' };
  }
}

/** Void a draft or sent-but-unsigned CO; revising means void + write a new CO. */
export async function voidChangeOrder(id: string): Promise<Result> {
  try {
    const res = await fetch(`/api/change-orders/${id}/void`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) return { success: false, error: json.error ?? 'Void failed' };
    return { success: true };
  } catch {
    return { success: false, error: 'Network error — please try again.' };
  }
}

// ── Line items ──

export type CreateCoLineItemInput = Pick<
  CoLineItemInsert,
  'change_order_id' | 'name' | 'description' | 'sort_order'
>;
export type UpdateCoLineItemInput = Partial<
  Pick<CoLineItemInsert, 'name' | 'description' | 'sort_order'>
>;

export async function createCoLineItem(input: CreateCoLineItemInput): Promise<CreateResult> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('change_order_line_items')
    .insert(input)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateCoLineItem(
  id: string,
  input: UpdateCoLineItemInput
): Promise<Result> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by; updated_at trigger handles updated_at.
  const { data, error } = await supabase
    .from('change_order_line_items')
    .update(input)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Line item not found or not editable' };
  }
  return { success: true };
}

/** Hard delete — mirrors estimate line items; rows go with it. */
export async function deleteCoLineItem(id: string): Promise<Result> {
  const supabase = createClient();

  // Rows first: the FK has no ON DELETE CASCADE.
  const { error: rowsError } = await supabase
    .from('change_order_line_rows')
    .delete()
    .eq('line_item_id', id);
  if (rowsError) return { success: false, error: rowsError.message };

  const { data, error } = await supabase
    .from('change_order_line_items')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Line item not found or not editable' };
  }
  return { success: true };
}

// ── Line rows (labor / material / subcontractor / other) ──

export type CreateCoLineRowInput = Pick<
  CoLineRowInsert,
  | 'line_item_id'
  | 'name'
  | 'sort_order'
  | 'markup_percent'
  | 'apply_tax'
  | 'rate'
  | 'quantity'
  | 'unit_cost'
  | 'amount'
  | 'subcontractor_id'
> & {
  row_type: CoRowType;
  labor_unit?: CoLaborUnit | null;
  unit_of_measure?: string | null;
};

// row_type is immutable after creation (different column validity).
export type UpdateCoLineRowInput = Partial<Omit<CreateCoLineRowInput, 'line_item_id' | 'row_type'>>;

/**
 * Builds an insert payload with only the columns valid for the row type
 * non-null (mirrors the DB CHECK `change_order_line_rows_type_columns`).
 * Values are SIGNED — negative rate/unit_cost/amount is a credit (D-2).
 * `total` is left to recalculateChangeOrderTotals.
 */
function rowInsertPayload(input: CreateCoLineRowInput): CoLineRowInsert {
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

export async function createCoLineRow(input: CreateCoLineRowInput): Promise<CreateResult> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('change_order_line_rows')
    .insert(rowInsertPayload(input))
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateCoLineRow(id: string, input: UpdateCoLineRowInput): Promise<Result> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by. `total` is recomputed by
  // recalculateChangeOrderTotals, which the caller invokes after.
  const { data, error } = await supabase
    .from('change_order_line_rows')
    .update(input)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Row not found or not editable' };
  }
  return { success: true };
}

export async function deleteCoLineRow(id: string): Promise<Result> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('change_order_line_rows')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Row not found or not editable' };
  }
  return { success: true };
}

// ── Totals recompute (§4.4a — app-maintained, identical to estimates) ──

/**
 * Recomputes every row total, every line's total_price, and the CO's
 * net_delta (= Σ line totals, signed — negative for net-credit COs).
 * Call after any edit that affects pricing. COs have no line discounts
 * or overrides; a row's markup defaults from the CO's copied estimate
 * context for its type, and per-row tax applies to material /
 * subcontractor / other rows exactly as on an estimate (D-3).
 */
export async function recalculateChangeOrderTotals(changeOrderId: string): Promise<Result> {
  const supabase = createClient();

  const { data: co, error: coError } = await supabase
    .from('change_orders')
    .select(
      'id, pricing_mode, co_type, tax_rate, subcontractor_markup_percent, material_markup_percent, labor_markup_percent'
    )
    .eq('id', changeOrderId)
    .single();

  if (coError || !co) return { success: false, error: 'Change order not found' };

  const pricingMode = co.pricing_mode as CoPricingMode;
  const defaults: EstimateMarkupDefaults = {
    subcontractor_markup_percent: co.subcontractor_markup_percent,
    material_markup_percent: co.material_markup_percent,
    labor_markup_percent: co.labor_markup_percent,
  };

  // Money representation P4/P5: a cost-plus/T&M CO prices by its own
  // negotiated rate(s) in force today, overriding per-row markup.
  const rateCtx = await loadInstrumentPricingContext(
    supabase,
    { change_order_id: changeOrderId },
    (co.co_type ?? 'fixed_price') as ContractType
  );

  // A rateless non-fixed instrument must never price (0% would silently sell
  // at cost) — bail BEFORE any row/line/net_delta is persisted.
  try {
    assertInstrumentRatesInForce(rateCtx);
  } catch (e) {
    if (e instanceof NoRateInForceError) return { success: false, error: e.message };
    throw e;
  }

  const { data: lines, error: linesError } = await supabase
    .from('change_order_line_items')
    .select('id')
    .eq('change_order_id', changeOrderId);

  if (linesError) return { success: false, error: linesError.message };

  const lineIds = (lines ?? []).map((l) => l.id);
  const { data: rows } =
    lineIds.length > 0
      ? await supabase
          .from('change_order_line_rows')
          .select(
            'id, line_item_id, row_type, markup_percent, apply_tax, rate, quantity, unit_of_measure, unit_cost, amount'
          )
          .in('line_item_id', lineIds)
          .order('sort_order', { ascending: true })
      : { data: [] };

  type RowRec = NonNullable<typeof rows>[number];
  const rowsByLine = new Map<string, RowRec[]>();
  for (const r of rows ?? []) {
    const list = rowsByLine.get(r.line_item_id) ?? [];
    list.push(r);
    rowsByLine.set(r.line_item_id, list);
  }

  let netDelta = 0;

  for (const line of lines ?? []) {
    const lineRows = rowsByLine.get(line.id) ?? [];
    const rowInputs: RowPricingInput[] = lineRows.map((r) => ({
      row_type: r.row_type as CoRowType,
      rate: r.rate,
      quantity: r.quantity,
      unit_of_measure: r.unit_of_measure,
      unit_cost: r.unit_cost,
      amount: r.amount,
      markup_percent: r.markup_percent,
      apply_tax: r.apply_tax,
    }));

    const lineTotals = computeLineTotalsFromRows({
      rows: applyInstrumentRateOverrides(rowInputs, rateCtx),
      pricing_mode: pricingMode,
      tax_rate: co.tax_rate,
      defaults,
      tm_labor_hourly: rateCtx.tm_labor_hourly,
    });

    for (let i = 0; i < lineRows.length; i++) {
      const { error: rowUpdateError } = await supabase
        .from('change_order_line_rows')
        .update({ total: lineTotals.rowTotals[i] })
        .eq('id', lineRows[i].id);
      if (rowUpdateError) return { success: false, error: rowUpdateError.message };
    }

    const { error: lineUpdateError } = await supabase
      .from('change_order_line_items')
      .update({ total_price: lineTotals.total_price })
      .eq('id', line.id);

    if (lineUpdateError) return { success: false, error: lineUpdateError.message };
    netDelta += lineTotals.total_price;
  }

  const { error: totalsError } = await supabase
    .from('change_orders')
    .update({ net_delta: roundMoney(netDelta) })
    .eq('id', changeOrderId);

  if (totalsError) return { success: false, error: totalsError.message };
  return { success: true };
}
