import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

// 5D — Change Orders (docs/specs/5D-spec.md). A CO is written identically
// to an estimate: line items → typed rows, same §4.4a tax-then-markup
// (D-1). Credits are negative values on normal rows (D-2/D-3). Money is
// display-only: projects.contract_value is never mutated here (D-6;
// TECH_DEBT #80 closed by derivation — lib/services/contract-value.ts is
// the revised-contract authority, 7B).

type ChangeOrderRow = Database['public']['Tables']['change_orders']['Row'];
type CoLineItemRow = Database['public']['Tables']['change_order_line_items']['Row'];
type CoLineRowRow = Database['public']['Tables']['change_order_line_rows']['Row'];
type CoSigningSessionRow = Database['public']['Tables']['co_signing_sessions']['Row'];

export type ChangeOrderStatus = 'draft' | 'sent' | 'signed' | 'voided';
export type ChangeOrderType = 'fixed_price' | 'time_and_materials' | 'cost_plus';
export type CoPricingMode = 'markup' | 'margin';
/** [S170] 'allowance' added (allowances-selections-spec §2). */
export type CoRowType = 'labor' | 'material' | 'subcontractor' | 'other' | 'allowance';
export type CoLaborUnit = 'hours' | 'days';

export type ChangeOrder = Omit<ChangeOrderRow, 'status' | 'co_type' | 'pricing_mode'> & {
  status: ChangeOrderStatus;
  co_type: ChangeOrderType;
  pricing_mode: CoPricingMode;
};

export type ChangeOrderWithAuthor = ChangeOrder & {
  author: { id: string; display_name: string } | null;
};

export type ChangeOrderLineItem = CoLineItemRow;

export type ChangeOrderLineRow = Omit<CoLineRowRow, 'row_type' | 'labor_unit'> & {
  row_type: CoRowType;
  labor_unit: CoLaborUnit | null;
};

export type ChangeOrderLineItemWithRows = ChangeOrderLineItem & {
  rows: ChangeOrderLineRow[];
};

export type ChangeOrderWithChildren = ChangeOrderWithAuthor & {
  line_items: ChangeOrderLineItemWithRows[];
};

export type CoSigningSession = CoSigningSessionRow;

// CO_STATUS_LABELS lives in the client-safe sibling so client components can
// import it without dragging this server module (next/headers) into the client
// bundle. Re-exported here for server-side consumers.
export { CO_STATUS_LABELS } from './change-orders-client';

/**
 * The supersession pair for one change order — what it replaces, and what
 * replaced it. [S168]
 *
 * ⚠️ TWO DIRECTIONS, AND THE SECOND IS THE ONE THAT IS EASY TO GET WRONG.
 * `supersedes_change_order_id` on a row points BACKWARDS — it names the voided
 * CO this one replaces. It cannot answer "has this CO been reissued?", which is
 * a question about a DIFFERENT row pointing AT this one. Reading the column on
 * the row in front of you and calling that "already reissued" is a real trap; a
 * voided CO that has been replaced still has a NULL column of its own.
 *
 * Both reads are RLS-scoped, so a caller who cannot see the counterpart CO gets
 * null and no link — the same answer they would get from the list.
 */
export async function getCoSupersession(changeOrderId: string): Promise<{
  supersedes: { id: string; co_number: string } | null;
  supersededBy: { id: string; co_number: string } | null;
}> {
  const supabase = await createClient();

  const { data: self } = await supabase
    .from('change_orders')
    .select('supersedes_change_order_id')
    .eq('id', changeOrderId)
    .maybeSingle();

  const [{ data: back }, { data: forward }] = await Promise.all([
    self?.supersedes_change_order_id
      ? supabase
          .from('change_orders')
          .select('id, co_number')
          .eq('id', self.supersedes_change_order_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // `change_orders_supersedes_once` makes this at most one row, so there is
    // nothing to order and nothing to choose between.
    supabase
      .from('change_orders')
      .select('id, co_number')
      .eq('supersedes_change_order_id', changeOrderId)
      .maybeSingle(),
  ]);

  return {
    supersedes: back ?? null,
    supersededBy: forward ?? null,
  };
}

const AUTHOR_JOIN =
  'author:company_members!change_orders_author_member_id_fkey(id, display_name)';

/**
 * COs for a project, newest sequence first. Soft-deleted rows are
 * filtered here, not in RLS (trash-bin pattern).
 */
export async function getChangeOrders(projectId: string): Promise<ChangeOrderWithAuthor[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('change_orders')
    .select(`*, ${AUTHOR_JOIN}`)
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('co_number', { ascending: true });

  if (error) return [];
  return (data ?? []) as unknown as ChangeOrderWithAuthor[];
}

/**
 * Single CO by id with its line items and typed rows. Does NOT filter
 * is_deleted (trash-bin pattern — a restore flow must be able to fetch
 * a soft-deleted CO).
 */
export async function getChangeOrder(id: string): Promise<ChangeOrderWithChildren | null> {
  const supabase = await createClient();

  const { data: co } = await supabase
    .from('change_orders')
    .select(`*, ${AUTHOR_JOIN}`)
    .eq('id', id)
    .single();

  if (!co) return null;

  const { data: items } = await supabase
    .from('change_order_line_items')
    .select('*')
    .eq('change_order_id', id)
    .order('sort_order', { ascending: true });

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: rows } =
    itemIds.length > 0
      ? await supabase
          .from('change_order_line_rows')
          .select('*')
          .in('line_item_id', itemIds)
          .order('sort_order', { ascending: true })
      : { data: [] as CoLineRowRow[] };

  const typedRows = (rows ?? []) as ChangeOrderLineRow[];
  const line_items: ChangeOrderLineItemWithRows[] = (items ?? []).map((item) => ({
    ...item,
    rows: typedRows.filter((r) => r.line_item_id === item.id),
  }));

  return { ...(co as unknown as ChangeOrderWithAuthor), line_items };
}

/**
 * Signed COs as ROWS (lists, panels). For the revised-contract FIGURE, the
 * derivation authority is lib/services/contract-value.ts (7B §2.2) — do not
 * re-derive original + Σ(net_delta) from this function's results.
 */
export async function getSignedChangeOrders(projectId: string): Promise<ChangeOrderWithAuthor[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('change_orders')
    .select(`*, ${AUTHOR_JOIN}`)
    .eq('project_id', projectId)
    .eq('status', 'signed')
    .eq('is_deleted', false)
    .order('co_number', { ascending: true });

  if (error) return [];
  return (data ?? []) as unknown as ChangeOrderWithAuthor[];
}

/**
 * Signing sessions for a CO, newest first. RLS restricts SELECT to
 * Owner/Admin/PM (co_signing_sessions_select_manager) — others get [].
 */
export async function getCoSigningSessions(changeOrderId: string): Promise<CoSigningSession[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('co_signing_sessions')
    .select('*')
    .eq('change_order_id', changeOrderId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return data ?? [];
}
