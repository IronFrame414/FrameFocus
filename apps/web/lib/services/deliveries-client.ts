import { createClient } from '@/lib/supabase-browser';
import type {
  DeliveryCheckInInput,
  DeliveryEditInput,
} from '@framefocus/shared/validation/deliveries';
export type {
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderItem,
  PurchaseOrderSummary,
  DeliveryWithItems,
  PoLineRollup,
} from '@/lib/services/deliveries';

/**
 * "PO-2041 · Jones Lumber" or the vendor·date fallback (Phase 3 Q6).
 * Lives here (client-safe) and is re-exported by the server service, per the
 * projects.ts / projects-client.ts presentation-constant pattern.
 */
export function poTitle(po: {
  po_number: string | null;
  vendor_name: string;
  ordered_at: string | null;
}): string {
  if (po.po_number) return `${po.po_number} · ${po.vendor_name}`;
  return po.ordered_at ? `${po.vendor_name} · ${po.ordered_at}` : po.vendor_name;
}

// 6D — client mutations. RLS enforces authority: PO create/edit
// Owner/Admin/PM; close = Owner/Admin (update with_check); delivery edit =
// receiver or Owner/Admin; soft-deletes Owner/Admin. Derived state
// (has_exceptions, PO auto-close/reopen) is DB-owned — nothing here writes
// status or has_exceptions except the explicit manual close.

type MutationResult = { success: boolean; error?: string };
type CreateResult = { success: boolean; id?: string; error?: string };

export interface PoFields {
  vendor_name: string;
  po_number?: string | null;
  ordered_at?: string | null;
}

export interface PoLineInput {
  /** Present when editing an existing line; absent for new lines. */
  id?: string;
  description: string;
  qty_ordered: number;
  unit?: string | null;
}

export async function createPurchaseOrder(
  projectId: string,
  fields: PoFields,
  lines: PoLineInput[]
): Promise<CreateResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('purchase_orders')
    .insert({
      project_id: projectId,
      vendor_name: fields.vendor_name,
      po_number: fields.po_number ?? null,
      ordered_at: fields.ordered_at ?? null,
    })
    .select('id')
    .single();
  if (error) return { success: false, error: error.message };

  if (lines.length > 0) {
    const { error: itemError } = await supabase.from('purchase_order_items').insert(
      lines.map((l, i) => ({
        purchase_order_id: data.id,
        description: l.description,
        qty_ordered: l.qty_ordered,
        unit: l.unit ?? null,
        sort_order: i,
      }))
    );
    if (itemError) return { success: false, id: data.id, error: itemError.message };
  }
  return { success: true, id: data.id };
}

export async function updatePurchaseOrder(id: string, fields: PoFields): Promise<MutationResult> {
  const supabase = createClient();
  // BEFORE UPDATE triggers own updated_at / updated_by.
  const { error } = await supabase
    .from('purchase_orders')
    .update({
      vendor_name: fields.vendor_name,
      po_number: fields.po_number ?? null,
      ordered_at: fields.ordered_at ?? null,
    })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Reconcile PO lines: update rows with ids, insert new, hard-delete missing. */
export async function setPurchaseOrderItems(
  poId: string,
  lines: PoLineInput[]
): Promise<MutationResult> {
  const supabase = createClient();
  const { data: current, error: readError } = await supabase
    .from('purchase_order_items')
    .select('id, unit_cost')
    .eq('purchase_order_id', poId)
    .eq('is_deleted', false);
  if (readError) return { success: false, error: readError.message };

  // R-B2 corollary: costed lines are lifecycle-managed (issue/flag/purchase,
  // commitment re-sync). This legacy reconciler predates all of that and
  // would hard-delete an issued line while its cost stays committed. Refuse
  // the whole write rather than partially applying it.
  if ((current ?? []).some((r) => r.unit_cost !== null)) {
    return {
      success: false,
      error: "This PO's lines carry costs and are managed from the PO record, not this editor.",
    };
  }

  const keptIds = new Set(lines.filter((l) => l.id).map((l) => l.id as string));
  const removeIds = (current ?? []).map((r) => r.id).filter((id) => !keptIds.has(id));
  if (removeIds.length > 0) {
    const { error } = await supabase.from('purchase_order_items').delete().in('id', removeIds);
    if (error) return { success: false, error: error.message };
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.id) {
      const { error } = await supabase
        .from('purchase_order_items')
        .update({
          description: line.description,
          qty_ordered: line.qty_ordered,
          unit: line.unit ?? null,
          sort_order: i,
        })
        .eq('id', line.id);
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase.from('purchase_order_items').insert({
        purchase_order_id: poId,
        description: line.description,
        qty_ordered: line.qty_ordered,
        unit: line.unit ?? null,
        sort_order: i,
      });
      if (error) return { success: false, error: error.message };
    }
  }
  return { success: true };
}

/**
 * Manual close (§5.1) — Owner/Admin per RLS with_check; closed_reason
 * required by CHECK. closed_by = the closer's member id (a human clicked
 * this — unlike the trigger's auto-close, which leaves it NULL).
 */
export async function closePurchaseOrder(id: string, reason: string): Promise<MutationResult> {
  const supabase = createClient();
  const { data: memberId } = await supabase.rpc('get_my_member_id');
  const { error } = await supabase
    .from('purchase_orders')
    .update({ status: 'closed', closed_reason: reason, closed_by: memberId ?? null })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function softDeletePurchaseOrder(id: string): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('purchase_orders')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Save a delivery edit via the server route (S90 — replaces the former
 * client-direct updateDelivery/setDeliveryItems pair, so the damage-photo
 * rule and photo binding are enforced server-side; the route also
 * regenerates the record PDF). The DB trigger chain recomputes
 * exception/PO state on every item write.
 */
export async function saveDeliveryEdit(
  deliveryId: string,
  input: DeliveryEditInput
): Promise<MutationResult> {
  const res = await fetch(`/api/deliveries/${deliveryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { success: false, error: body?.error ?? `Save failed (${res.status})` };
  }
  return { success: true };
}

export async function softDeleteDelivery(id: string): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('deliveries')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Generate (or regenerate) the delivery's record PDF via the server route
 * (S90; mirrors generateDailyLogPdf). Best-effort at call sites — the record
 * itself is already saved when this runs.
 */
export async function generateDeliveryPdf(
  deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/deliveries/${deliveryId}/pdf`, { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { success: false, error: body?.error ?? `PDF generation failed (${res.status})` };
  }
  return { success: true };
}

/**
 * Check in a truck (§2/§4) via the server route — inserts under the caller's
 * RLS, then emails Owner/Admin/assigned-PMs best-effort (§7: send failure
 * never rolls back the insert).
 */
export async function checkInDelivery(
  input: DeliveryCheckInInput
): Promise<{ success: boolean; deliveryId?: string; emailErrors?: string[]; error?: string }> {
  const res = await fetch('/api/deliveries/check-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => null)) as
    | { deliveryId?: string; emailErrors?: string[]; error?: string }
    | null;
  if (!res.ok) {
    return { success: false, error: body?.error ?? `Check-in failed (${res.status})` };
  }
  return { success: true, deliveryId: body?.deliveryId, emailErrors: body?.emailErrors };
}
