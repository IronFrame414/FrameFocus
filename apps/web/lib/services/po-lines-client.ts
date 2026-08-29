import { createClient } from '@/lib/supabase-browser';

// PO module — the browser half of the line lifecycle (spec §4.8). Thin RPC
// wrappers: every gate lives in the database function, never re-derived here.
// Flagging goes through the ROUTE, not the RPC directly, because the
// notification (R7) rides the server after the write.

export interface PoLifecycleResult {
  success: boolean;
  error?: string;
}

/** R-Q5 per-line issue. Owner/Admin/PM (the RPC gates). Numbering (R-L3),
 *  the footing total and the commitment sync all happen inside. */
export async function issuePoLines(
  poId: string,
  itemIds: string[]
): Promise<PoLifecycleResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('issue_po_lines', {
    p_po_id: poId,
    p_item_ids: itemIds,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Review-time act, Owner/Admin (the RPC gates). Shrinks the commitment;
 *  closes the PO when nothing is outstanding. */
export async function markPoLinesPurchased(
  poId: string,
  itemIds: string[]
): Promise<PoLifecycleResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('mark_po_lines_purchased', {
    p_po_id: poId,
    p_item_ids: itemIds,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** R6.3 — through the route so the R7 notification fires server-side. */
export async function flagPoItemMissing(
  itemId: string,
  note: string
): Promise<PoLifecycleResult> {
  const res = await fetch(`/api/po-items/${itemId}/flag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    return { success: false, error: payload.error ?? 'Could not flag the line.' };
  }
  return { success: true };
}

/** R6.2 — tag a member to a line. O/A/PM by RLS; staff roles only (the
 *  INSERT policy joins profiles — R-Q3). */
export async function assignMemberToPoItem(
  poItemId: string,
  memberId: string
): Promise<PoLifecycleResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('purchase_order_item_assignments')
    .insert({ po_item_id: poItemId, member_id: memberId });
  if (error) {
    return {
      success: false,
      error: error.code === '23505' ? 'Already assigned to that line.' : error.message,
    };
  }
  return { success: true };
}

/** Unassign = soft delete (no DELETE policy, the standard pattern). */
export async function unassignPoItemAssignment(
  assignmentId: string
): Promise<PoLifecycleResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('purchase_order_item_assignments')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', assignmentId)
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!data?.length) return { success: false, error: 'Unassign was not applied.' };
  return { success: true };
}

// ── §4.8 — the drafting service (a plain client service, NOT an RPC) ────────
//
// Drafts never write total_amount (that column is first written at issue,
// inside the RPC, under the trigger exemption — R-L2), so the caller's own
// O/A/PM INSERT policies are the whole authority. Reads are caller-RLS-scoped:
// a PM can only draft from an estimate whose rows they can read (their own —
// the estimates floor), which renders as fewer draftable lines, never an
// error.

export interface DraftableLine {
  budgetItemId: string;
  sourceLineRowId: string;
  description: string;
  qty: number;
  unit: string | null;
  unitCost: number;
  vendorId: string | null;
  vendorName: string | null;
  costCode: string | null;
  alreadyDrafted: boolean;
}

/** Material lines the estimate contributed to this project's budget, with
 *  vendor + cost, and whether a live PO line already claims them (dedup —
 *  "Pull more from the estimate" uses the same read). */
export async function listDraftableLines(projectId: string): Promise<DraftableLine[]> {
  const supabase = createClient();

  const { data: items } = await supabase
    .from('project_budget_items')
    .select(
      'id, cost_code, source_line_row_id, row:estimate_line_rows(id, name, quantity, unit_cost, unit_of_measure, row_type, vendor_id, vendor:subcontractors!estimate_line_rows_vendor_id_fkey(company_name))'
    )
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .not('source_line_row_id', 'is', null);

  const { data: claimed } = await supabase
    .from('purchase_order_items')
    .select('source_line_row_id, purchase_order:purchase_orders!inner(project_id, is_deleted)')
    .eq('purchase_order.project_id', projectId)
    .eq('purchase_order.is_deleted', false)
    .eq('is_deleted', false)
    .not('source_line_row_id', 'is', null);
  const claimedRowIds = new Set((claimed ?? []).map((c) => c.source_line_row_id as string));

  const out: DraftableLine[] = [];
  for (const item of items ?? []) {
    const row = Array.isArray(item.row) ? item.row[0] : item.row;
    if (!row || row.row_type !== 'material') continue;
    if (row.unit_cost == null || row.quantity == null) continue;
    const vendor = Array.isArray(row.vendor) ? row.vendor[0] : row.vendor;
    out.push({
      budgetItemId: item.id,
      sourceLineRowId: row.id,
      description: row.name,
      qty: Number(row.quantity),
      unit: row.unit_of_measure,
      unitCost: Number(row.unit_cost),
      vendorId: row.vendor_id,
      vendorName: vendor?.company_name ?? null,
      costCode: item.cost_code,
      alreadyDrafted: claimedRowIds.has(row.id),
    });
  }
  return out;
}

export type DraftGroupBy = 'vendor' | 'category' | 'single';

export interface DraftedPoPreview {
  vendorId: string | null;
  vendorName: string | null; // display; NULL vendor = the "no vendor yet" card
  label: string;
  lines: DraftableLine[];
  total: number; // Σ qty × unitCost — COST, per §1
}

/** Group not-yet-drafted lines into PO previews. Pure — the screen renders
 *  this, then createDraftPos() writes it. */
export function groupDraftableLines(
  lines: DraftableLine[],
  groupBy: DraftGroupBy
): DraftedPoPreview[] {
  const fresh = lines.filter((l) => !l.alreadyDrafted);
  const groups = new Map<string, DraftedPoPreview>();
  for (const line of fresh) {
    const key =
      groupBy === 'single'
        ? 'all'
        : groupBy === 'category'
          ? (line.costCode ?? 'uncategorized')
          : (line.vendorId ?? 'unassigned');
    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
      existing.total = Math.round((existing.total + line.qty * line.unitCost) * 100) / 100;
    } else {
      groups.set(key, {
        vendorId: groupBy === 'vendor' ? line.vendorId : null,
        vendorName: groupBy === 'vendor' ? line.vendorName : null,
        label:
          groupBy === 'single'
            ? 'One PO for everything'
            : groupBy === 'category'
              ? (line.costCode ?? 'No category')
              : (line.vendorName ?? 'No vendor yet'),
        lines: [line],
        total: Math.round(line.qty * line.unitCost * 100) / 100,
      });
    }
  }
  // The no-vendor card last, called out rather than silently dropped.
  return [...groups.values()].sort((a, b) =>
    a.vendorId === null && b.vendorId !== null && a.vendorName === null
      ? 1
      : a.label.localeCompare(b.label)
  );
}

/** Write the previews as DRAFT POs — batch line inserts (the
 *  createPurchaseOrder shape), nothing committed, no totals written. */
export async function createDraftPos(
  projectId: string,
  sourceEstimateId: string | null,
  previews: DraftedPoPreview[]
): Promise<{ success: boolean; created?: number; error?: string }> {
  const supabase = createClient();
  let created = 0;
  for (const preview of previews) {
    if (preview.lines.length === 0) continue;
    const { data: po, error } = await supabase
      .from('purchase_orders')
      .insert({
        project_id: projectId,
        vendor_id: preview.vendorId,
        vendor_name: preview.vendorName ?? 'TBD',
        source_estimate_id: sourceEstimateId,
        status: 'draft',
      })
      .select('id')
      .single();
    if (error) return { success: false, created, error: error.message };

    const { error: lineError } = await supabase.from('purchase_order_items').insert(
      preview.lines.map((l, i) => ({
        purchase_order_id: po.id,
        description: l.description,
        qty_ordered: l.qty,
        unit: l.unit,
        sort_order: i,
        unit_cost: l.unitCost,
        budget_item_id: l.budgetItemId,
        source_line_row_id: l.sourceLineRowId,
      }))
    );
    if (lineError) return { success: false, created, error: lineError.message };
    created += 1;
  }
  return { success: true, created };
}

// ── §S2 — the review popup's PO context ─────────────────────────────────────

export interface ReviewPoLine {
  id: string;
  description: string;
  qtyOrdered: number;
  unitCost: number | null;
  budgetItemId: string | null;
  lineStatus: 'issued' | 'flagged';
  flagNote: string | null;
}

export interface ReviewPo {
  id: string;
  poNumber: string | null;
  vendorName: string | null;
  lines: ReviewPoLine[];
}

/** The PO a pending run expense was bought against (source_po_id), with its
 *  OPEN lines only — issued and flagged; purchased/draft lines are not up
 *  for reconciliation. Reader is the reviewer (Owner/Admin); RLS scopes. */
export async function getReviewPo(poId: string): Promise<ReviewPo | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(
      'id, po_number, vendor_name, items:purchase_order_items(id, description, qty_ordered, unit_cost, budget_item_id, line_status, flag_note, sort_order, is_deleted)'
    )
    .eq('id', poId)
    .single();
  if (error || !data) return null;
  const lines = (data.items ?? [])
    .filter((i) => !i.is_deleted && (i.line_status === 'issued' || i.line_status === 'flagged'))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({
      id: i.id,
      description: i.description,
      qtyOrdered: i.qty_ordered,
      unitCost: i.unit_cost,
      budgetItemId: i.budget_item_id,
      lineStatus: i.line_status as 'issued' | 'flagged',
      flagNote: i.flag_note,
    }));
  return { id: data.id, poNumber: data.po_number, vendorName: data.vendor_name, lines };
}
