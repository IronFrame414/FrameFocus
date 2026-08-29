import 'server-only';
import { createClient } from '@/lib/supabase-server';
import type { PoPdfData } from '@/lib/po/po-template';

// PO module R-L4 — one loader feeds BOTH the download route and the send
// route, so the emailed PDF and the downloaded PDF can never disagree (the
// #129 rule). Reads run on the CALLER's session: RLS answers who may render.

export async function loadPoPdfData(
  poId: string
): Promise<{ data: PoPdfData | null; companyId: string | null; vendorEmail: string | null; projectId: string | null; error: string | null }> {
  const supabase = await createClient();

  const { data: po } = await supabase
    .from('purchase_orders')
    .select(
      `id, po_number, vendor_name, status, total_amount, ordered_at, need_by, deliver_to, company_id, project_id,
       vendor:subcontractors!purchase_orders_vendor_id_fkey(company_name, email),
       project:projects!inner(name),
       items:purchase_order_items(description, qty_ordered, unit, unit_cost, line_status, sort_order, is_deleted,
         budget_item:project_budget_items(cost_code))`
    )
    .eq('id', poId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!po) return { data: null, companyId: null, vendorEmail: null, projectId: null, error: 'Purchase order not found' };

  const { data: company } = await supabase
    .from('companies')
    .select('name, brand_color')
    .eq('id', po.company_id)
    .maybeSingle();

  const vendor = Array.isArray(po.vendor) ? po.vendor[0] : po.vendor;
  const project = Array.isArray(po.project) ? po.project[0] : po.project;

  const lines = (po.items ?? [])
    .filter((i) => !i.is_deleted)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => {
      const budget = Array.isArray(i.budget_item) ? i.budget_item[0] : i.budget_item;
      return {
        description: i.description,
        costCode: budget?.cost_code ?? null,
        qty: Number(i.qty_ordered),
        unit: i.unit,
        unitCost: i.unit_cost != null ? Number(i.unit_cost) : null,
      };
    });

  const lineBearing = lines.some((l) => l.unitCost != null);
  const footed = lines.reduce(
    (sum, l) => (l.unitCost != null ? sum + Math.round(l.qty * l.unitCost * 100) / 100 : sum),
    0
  );
  const total = lineBearing ? footed : po.total_amount != null ? Number(po.total_amount) : null;

  return {
    data: {
      companyName: company?.name ?? 'Purchase order',
      brandColor: company?.brand_color ?? '#1a2437',
      poNumber: po.po_number ?? 'Draft PO',
      vendorName: vendor?.company_name ?? po.vendor_name,
      projectName: project?.name ?? '',
      orderedAt: po.ordered_at,
      needBy: po.need_by,
      deliverTo: po.deliver_to,
      lines,
      totalLabel:
        total != null
          ? `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : '—',
      // R-L1: a typed total over costless lines is stated, never re-derived.
      legacyUnfooted: !lineBearing && po.total_amount != null,
    },
    companyId: po.company_id,
    projectId: po.project_id,
    vendorEmail: vendor?.email ?? null,
    error: null,
  };
}
