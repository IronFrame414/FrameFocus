import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

// 6D Material Deliveries — server reads (6D-spec §U; handoff 4e). Visibility
// is RLS-governed throughout: POs and deliveries are visible exactly as their
// project is (can_view_project). Derived state (has_exceptions, PO status)
// is DB-owned by the as-built trigger chain — these reads never recompute it,
// they only aggregate quantities for the usable bars.

type PurchaseOrderRow = Database['public']['Tables']['purchase_orders']['Row'];
type PoItemRow = Database['public']['Tables']['purchase_order_items']['Row'];
type DeliveryRow = Database['public']['Tables']['deliveries']['Row'];
type DeliveryItemRow = Database['public']['Tables']['delivery_items']['Row'];

export type PurchaseOrderStatus = 'open' | 'closed';

export type PurchaseOrder = Omit<PurchaseOrderRow, 'status'> & {
  status: PurchaseOrderStatus;
};

export type PurchaseOrderItem = PoItemRow;
export type DeliveryItem = DeliveryItemRow;

export interface DeliveryWithItems extends DeliveryRow {
  items: DeliveryItemRow[];
  receiver: { display_name: string } | null;
}

/** Per-PO-line aggregate for the 4e ordered-vs-usable bars. */
export interface PoLineRollup {
  item: PoItemRow;
  receivedTotal: number;
  damagedTotal: number;
  usableTotal: number;
  filled: boolean;
}

export interface PurchaseOrderSummary extends PurchaseOrder {
  items: PoItemRow[];
  lines: PoLineRollup[];
  orderedTotal: number;
  usableTotal: number;
  anyDamaged: boolean;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  lines: PoLineRollup[];
  deliveries: DeliveryWithItems[];
  author: { display_name: string } | null;
  closer: { display_name: string } | null;
}

export type DeliverySummary = Pick<
  DeliveryRow,
  'id' | 'vendor_name' | 'delivery_date' | 'has_exceptions' | 'notes'
>;

const DELIVERY_SELECT =
  '*, items:delivery_items(*), receiver:company_members(display_name)';

function activeItems(items: DeliveryItemRow[]): DeliveryItemRow[] {
  return items.filter((i) => !i.is_deleted);
}

function rollupLines(items: PoItemRow[], deliveries: DeliveryWithItems[]): PoLineRollup[] {
  const byPoItem = new Map<string, { received: number; damaged: number }>();
  for (const d of deliveries) {
    if (d.is_deleted) continue;
    for (const i of activeItems(d.items)) {
      if (!i.po_item_id) continue;
      const agg = byPoItem.get(i.po_item_id) ?? { received: 0, damaged: 0 };
      agg.received += Number(i.qty_received);
      agg.damaged += Number(i.qty_damaged);
      byPoItem.set(i.po_item_id, agg);
    }
  }
  return items
    .filter((i) => !i.is_deleted)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => {
      const agg = byPoItem.get(item.id) ?? { received: 0, damaged: 0 };
      const usable = agg.received - agg.damaged;
      return {
        item,
        receivedTotal: agg.received,
        damagedTotal: agg.damaged,
        usableTotal: usable,
        filled: usable >= Number(item.qty_ordered),
      };
    });
}

/** The project's POs with items + usable rollups, newest first. */
export async function getPurchaseOrders(projectId: string): Promise<PurchaseOrderSummary[]> {
  const supabase = await createClient();
  const [{ data: pos, error }, deliveries] = await Promise.all([
    supabase
      .from('purchase_orders')
      .select('*, items:purchase_order_items(*)')
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false }),
    getProjectDeliveries(projectId),
  ]);
  if (error || !pos) return [];

  return (pos as unknown as (PurchaseOrder & { items: PoItemRow[] })[]).map((po) => {
    const lines = rollupLines(
      po.items,
      deliveries.filter((d) => d.purchase_order_id === po.id)
    );
    return {
      ...po,
      lines,
      orderedTotal: lines.reduce((s, l) => s + Number(l.item.qty_ordered), 0),
      usableTotal: lines.reduce((s, l) => s + Math.max(0, l.usableTotal), 0),
      anyDamaged: lines.some((l) => l.damagedTotal > 0),
    };
  });
}

/** One PO with line rollups and its trucks (handoff 4e). */
export async function getPurchaseOrderDetail(poId: string): Promise<PurchaseOrderDetail | null> {
  const supabase = await createClient();
  // Two company_members FKs exist on purchase_orders — explicit hints.
  const { data: po, error } = await supabase
    .from('purchase_orders')
    .select(
      '*, items:purchase_order_items(*), ' +
        'author:company_members!purchase_orders_author_member_id_fkey(display_name), ' +
        'closer:company_members!purchase_orders_closed_by_fkey(display_name)'
    )
    .eq('id', poId)
    .maybeSingle();
  if (error || !po) return null;

  const { data: rawDeliveries } = await supabase
    .from('deliveries')
    .select(DELIVERY_SELECT)
    .eq('purchase_order_id', poId)
    .eq('is_deleted', false)
    .order('delivery_date', { ascending: true })
    .order('created_at', { ascending: true });

  const typed = po as unknown as PurchaseOrder & {
    items: PoItemRow[];
    author: { display_name: string } | null;
    closer: { display_name: string } | null;
  };
  const deliveries = (rawDeliveries ?? []) as unknown as DeliveryWithItems[];
  return {
    ...typed,
    lines: rollupLines(typed.items, deliveries),
    deliveries,
    author: typed.author,
    closer: typed.closer,
  };
}

/** All of a project's deliveries with items (PO-linked and orderless). */
export async function getProjectDeliveries(projectId: string): Promise<DeliveryWithItems[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deliveries')
    .select(DELIVERY_SELECT)
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('delivery_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as DeliveryWithItems[];
}

/** Orderless check-ins (§4 escape hatch) for the list's second section. */
export async function getOrderlessDeliveries(projectId: string): Promise<DeliveryWithItems[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deliveries')
    .select(DELIVERY_SELECT)
    .eq('project_id', projectId)
    .is('purchase_order_id', null)
    .eq('is_deleted', false)
    .order('delivery_date', { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as DeliveryWithItems[];
}

/** Single delivery (trash-bin convention: no is_deleted filter). */
export async function getDelivery(id: string): Promise<
  | (DeliveryWithItems & { purchase_order: Pick<PurchaseOrderRow, 'id' | 'po_number' | 'vendor_name'> | null })
  | null
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deliveries')
    .select(`${DELIVERY_SELECT}, purchase_order:purchase_orders(id, po_number, vendor_name)`)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const delivery = data as unknown as DeliveryWithItems & {
    purchase_order: Pick<PurchaseOrderRow, 'id' | 'po_number' | 'vendor_name'> | null;
  };
  delivery.items = activeItems(delivery.items);
  return delivery;
}

/** files row subset for a delivery's photos (S90). */
export interface DeliveryPhoto {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  /** null on delivery-level (whole-truck) photos. */
  delivery_item_id: string | null;
  client_visible: boolean;
  created_at: string;
}

/**
 * Photos bound to a delivery's lines — LINE-BOUND via files.delivery_item_id
 * (migration 20260723000000), mirroring the 6B log-bound pattern. Takes the
 * delivery's item ids (the caller already holds them via getDelivery).
 */
export async function getDeliveryPhotos(itemIds: string[]): Promise<DeliveryPhoto[]> {
  if (itemIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('files')
    .select('id, file_name, file_path, mime_type, delivery_item_id, client_visible, created_at')
    // .filter — delivery_item_id is not in database.ts until the next type
    // regen (prod batch pending); switch to .in then.
    .filter('delivery_item_id', 'in', `(${itemIds.join(',')})`)
    .like('mime_type', 'image/%')
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as unknown as DeliveryPhoto[];
}

/**
 * General whole-delivery photos — DELIVERY-bound via files.delivery_id
 * (migration 20260723020000). Always optional, never the damage evidence;
 * per-line photos live on files.delivery_item_id instead.
 */
export async function getDeliveryLevelPhotos(deliveryId: string): Promise<DeliveryPhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('files')
    .select('id, file_name, file_path, mime_type, delivery_item_id, client_visible, created_at')
    // .filter — delivery_id is not in database.ts until the next type regen
    // (prod batch pending); switch to .eq then.
    .filter('delivery_id', 'eq', deliveryId)
    .like('mime_type', 'image/%')
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as unknown as DeliveryPhoto[];
}

/**
 * The deliveries checked in against a project on a calendar date — the 6B
 * daily-log read-only card (6B-spec §6.3). delivery_date is a DATE; no
 * timezone bucketing needed.
 */
export async function getDeliveriesForProjectDay(
  projectId: string,
  date: string
): Promise<DeliverySummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deliveries')
    .select('id, vendor_name, delivery_date, has_exceptions, notes')
    .eq('project_id', projectId)
    .eq('delivery_date', date)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });
  if (error) return [];
  return data ?? [];
}

// Presentation helper lives in the client-safe sibling so client components
// can import it without dragging this server module (next/headers) into the
// client bundle. Re-exported here for server-side consumers.
export { poTitle } from './deliveries-client';
