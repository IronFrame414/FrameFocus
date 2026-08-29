import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { notify } from '@/lib/notify/notify';
import {
  getManagerNotifyRecipients,
  getProjectPmNotifyRecipients,
} from '@/lib/notify/recipients';

// PO module R7 — a flagged-missing PO line notifies Owner, Admin and PM. The
// item STAYS OPEN on the PO (the RPC keeps it in the committed sum); this is
// the decision-type ping that someone must reorder (R-Q4: Field chip +
// DECISION_TYPES).
//
// Raised by the flag ROUTE after flag_po_item_missing succeeds — the RPC
// cannot call application code, and notify() needs the service-role client
// for push (the incident-notify shape). Recipients are the incident/daily-log
// audiences reused, never re-derived: company managers + the project's
// assigned PMs; notify() de-duplicates by profile id.

export async function notifyPoItemMissing(
  admin: SupabaseClient<Database>,
  poItemId: string
): Promise<void> {
  const { data: item } = await admin
    .from('purchase_order_items')
    .select(
      'id, description, flag_note, purchase_order:purchase_orders!inner(id, po_number, project_id, company_id, vendor_name), flagger:company_members!purchase_order_items_flagged_by_fkey(display_name)'
    )
    .eq('id', poItemId)
    .single();
  if (!item) return;

  const po = Array.isArray(item.purchase_order)
    ? (item.purchase_order[0] as never)
    : item.purchase_order;
  const flagger = Array.isArray(item.flagger) ? item.flagger[0] : item.flagger;
  if (!po) return;

  const [managers, pms] = await Promise.all([
    getManagerNotifyRecipients(admin, po.company_id),
    getProjectPmNotifyRecipients(admin, po.project_id),
  ]);

  await notify({
    admin,
    companyId: po.company_id,
    type: 'po_item_missing',
    recipients: [...managers, ...pms],
    linkKey: 'po',
    linkParams: { projectId: po.project_id, id: po.id },
    render: () => ({
      title: `Missing on the run: ${item.description}`,
      body: `${flagger?.display_name ?? 'A crew member'} flagged "${item.description}" on ${po.po_number ?? 'a purchase order'}${item.flag_note ? ` — "${item.flag_note}"` : ''}. The line stays open until it's bought or cancelled.`,
    }),
  });
}
