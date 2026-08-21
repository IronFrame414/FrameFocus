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
import { applied } from '@/lib/services/mutation-result';
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
// ⚠️ M5-03 [S163] — THESE SIX WERE ALREADY GUARDED, BY HAND. They now go
// through the SAME `applied()` the rest of the platform uses, because
// `mutation-result.ts` says so without an exception and a fifth private copy of
// a row-count check is how the four earlier ones drifted apart.
//
// **The MESSAGES are deliberately kept.** `DISCARDED` says "you may not have
// permission, or the record no longer exists" — correct, and deliberately
// vague, for a caller who cannot tell those apart. These call sites CAN:
// `change_orders_update_authorized` admits owner/admin/PM, so a discarded write
// here means the row is gone or not editable, and "Change order not found or
// not editable" is the more truthful sentence. The shared helper is the
// mechanism; the wording is still the caller's to choose.

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
  if (!applied(data)) return { success: false, error: 'Change order not found or not editable' };
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
  if (!applied(data)) return { success: false, error: 'Change order not found' };
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

/**
 * Void a change order — draft, sent, or SIGNED.
 *
 * ⚠️ [S168] A REASON IS REQUIRED IN EVERY CASE, and the requirement does not
 * soften for an unsigned CO. Josh ruled explicitly against distinguishing the
 * two: *"user should give reason for void."* One path, one requirement — so
 * there is one function, and neither surface gets to decide the reason is
 * optional on its own screen (CLAUDE.md PARITY).
 *
 * The reason is checked in the route AND in the database
 * (`enforce_change_order_void_authority`, plus `change_orders_void_shape_check`
 * behind it). This client-side check exists only to save a round trip; it is
 * not the gate and must not be treated as one.
 *
 * The signed copy is RETAINED — `signed-artifact-spec.md`. Voiding retires a
 * document the client saw; it never destroys it.
 */
export async function voidChangeOrder(id: string, reason: string): Promise<Result> {
  if (!reason.trim()) {
    return { success: false, error: 'A reason is required to void a change order.' };
  }
  try {
    const res = await fetch(`/api/change-orders/${id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const json = await res.json();
    if (!res.ok) return { success: false, error: json.error ?? 'Void failed' };
    return { success: true };
  } catch {
    return { success: false, error: 'Network error — please try again.' };
  }
}

/**
 * Reissue a VOIDED change order as a fresh draft — the path
 * `enforce_change_order_immutability()` has advertised since 20260809000000
 * ("void and reissue instead") and that did not exist until S168.
 *
 * Returns the new draft's id so the caller can navigate straight into it.
 */
export async function reissueChangeOrder(id: string): Promise<CreateResult> {
  try {
    const res = await fetch(`/api/change-orders/${id}/reissue`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) return { success: false, error: json.error ?? 'Reissue failed' };
    return { success: true, id: json.id };
  } catch {
    return { success: false, error: 'Network error — please try again.' };
  }
}

/**
 * Permanently delete an UNSIGNED change order. There is no trash bin here and
 * that is deliberate — see the route.
 *
 * ⚠️ A SIGNED CO IS NEVER DELETABLE [Josh, S168]: *"a change order is a legal
 * document, and being able to prove you never sent one is a claim the system
 * must not be able to make falsely."* The boundary is enforced by a BEFORE
 * DELETE trigger that has no service-role escape, not by this function.
 */
export async function deleteChangeOrder(id: string): Promise<Result> {
  try {
    const res = await fetch(`/api/change-orders/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) return { success: false, error: json.error ?? 'Delete failed' };
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
  if (!applied(data)) return { success: false, error: 'Line item not found or not editable' };
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
  if (!applied(data)) return { success: false, error: 'Line item not found or not editable' };
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
    case 'allowance':
      // [S170] the MATERIAL shape (see estimate-items-client.ts — same arm,
      // same reason; the CO table has no catalog link to omit).
      return {
        ...base,
        apply_tax: input.apply_tax ?? true,
        unit_of_measure: input.unit_of_measure ?? 'each',
        unit_cost: input.unit_cost ?? null,
        quantity: input.quantity ?? 1,
      };
    case 'subcontractor':
      return {
        ...base,
        apply_tax: input.apply_tax ?? false, // opt-in
        amount: input.amount ?? null,
        subcontractor_id: input.subcontractor_id ?? null,
      };
    case 'other':
      return {
        ...base,
        apply_tax: input.apply_tax ?? false, // opt-in
        amount: input.amount ?? null,
      };
    default:
      // [S170] no fall-through — see estimate-items-client.ts rowInsertPayload.
      throw new Error(`coRowInsertPayload: unknown row_type ${String(input.row_type)}`);
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
  if (!applied(data)) return { success: false, error: 'Row not found or not editable' };
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
  if (!applied(data)) return { success: false, error: 'Row not found or not editable' };
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
  // ROUTED THROUGH A PRIVILEGED SERVER PATH [S115, TECH_DEBT #140 / M6M D-62].
  //
  // This function used to do the arithmetic here, in the browser, reading
  // `instrument_rates` with the caller's own client. That table is floored to
  // Owner/Admin (20260806000000), and `change_orders_insert_authorized` admits
  // PROJECT MANAGERS — so a PM recalculating a cost-plus or T&M change order
  // read ZERO rate rows and was refused by `assertInstrumentRatesInForce` with
  // "set a rate before totals can recalculate", naming a cause that was false:
  // the rate existed, the PM simply could not see it.
  //
  // The pricing now runs in `change-order-totals-server.ts` under the service
  // role, behind a route that does auth + role + an RLS-scoped CO read first.
  // NO RATE VALUE COMES BACK — the response is a success flag, and totals are
  // re-read from the CO by the caller exactly as before.
  //
  // The SIGNATURE IS UNCHANGED on purpose: all three existing call sites are
  // desktop (co-builder, correct-rates, renegotiate-rate) and none of them
  // needed editing, which is what keeps A-28's regression assertion meaningful
  // rather than merely satisfied.
  const response = await fetch(`/api/change-orders/${changeOrderId}/recalculate`, {
    method: 'POST',
  });

  if (!response.ok) {
    // The route returns a plain message for 401/403/404/422 alike. A network or
    // non-JSON failure must not surface as "undefined" — the caller renders
    // this string directly.
    const message = await response
      .json()
      .then((b: { error?: string }) => b?.error)
      .catch(() => undefined);
    return { success: false, error: message ?? `Recalculation failed (${response.status})` };
  }

  return { success: true };
}
