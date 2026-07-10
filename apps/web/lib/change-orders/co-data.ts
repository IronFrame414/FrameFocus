import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

// Signed-artifact spec §6 — assembles everything the CO renderers need
// (React-PDF document + signed-PDF composite) as one serializable object.
// Mirrors proposal-data.ts: takes the Supabase client as a parameter so it
// works under RLS (dashboard / send route) AND with the service-role client
// (public signing completion, cron). The CO document STANDS ALONE — it embeds
// neither the original estimate nor the contract (spec §6): CO number, title,
// description, its own line items/pricing, net delta, schedule impact, and two
// signature blocks (stamped by the composite, not rendered here).

export interface CoLineRow {
  name: string;
  total: number;
}

export interface CoLineItem {
  name: string;
  description: string | null;
  total: number;
  rows: CoLineRow[];
}

export interface ChangeOrderData {
  company: {
    name: string;
    logoUrl: string | null;
    brandColor: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    phone: string | null;
    email: string | null;
    licenseNumber: string | null;
  };
  changeOrder: {
    id: string;
    number: string;
    title: string;
    description: string | null;
    status: string;
    date: string;
    netDelta: number;
    scheduleImpactDays: number | null;
    contractorSignatureName: string | null;
    contractorSignedAt: string | null;
    signedAt: string | null;
  };
  project: { name: string } | null;
  client: {
    name: string;
    companyName: string | null;
    email: string | null;
  } | null;
  lineItems: CoLineItem[];
}

export async function getChangeOrderData(
  supabase: SupabaseClient<Database>,
  changeOrderId: string
): Promise<ChangeOrderData | null> {
  const { data: co } = await supabase
    .from('change_orders')
    .select('*')
    .eq('id', changeOrderId)
    .maybeSingle();
  if (!co || co.is_deleted) return null;

  const [companyRes, projectRes, itemsRes] = await Promise.all([
    supabase
      .from('companies')
      .select(
        'name, logo_url, brand_color, address_line1, address_line2, city, state, zip, phone, email, license_number'
      )
      .eq('id', co.company_id)
      .single(),
    supabase.from('projects').select('name, contact_id').eq('id', co.project_id).maybeSingle(),
    supabase
      .from('change_order_line_items')
      .select('id, name, description, total_price, sort_order')
      .eq('change_order_id', changeOrderId)
      .order('sort_order', { ascending: true }),
  ]);

  const company = companyRes.data;
  if (!company) return null;

  const items = itemsRes.data ?? [];
  const itemIds = items.map((i) => i.id);
  const { data: allRows } =
    itemIds.length > 0
      ? await supabase
          .from('change_order_line_rows')
          .select('line_item_id, name, total, sort_order')
          .in('line_item_id', itemIds)
          .order('sort_order', { ascending: true })
      : { data: [] };

  type CoRowRec = { line_item_id: string; name: string; total: number; sort_order: number };
  const rowsByItem = new Map<string, CoRowRec[]>();
  for (const r of (allRows ?? []) as CoRowRec[]) {
    const list = rowsByItem.get(r.line_item_id) ?? [];
    list.push(r);
    rowsByItem.set(r.line_item_id, list);
  }

  const lineItems: CoLineItem[] = items.map((item) => ({
    name: item.name,
    description: item.description,
    total: item.total_price,
    rows: (rowsByItem.get(item.id) ?? []).map((r) => ({ name: r.name, total: r.total })),
  }));

  // The client resolves through the change order's project to its primary
  // contact (mirrors the proposal's contact resolution). May be null before a
  // contact is set on the project.
  let client: ChangeOrderData['client'] = null;
  const project = projectRes.data;
  if (project?.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('first_name, last_name, company_name, email')
      .eq('id', project.contact_id)
      .maybeSingle();
    if (contact) {
      client = {
        name: `${contact.first_name} ${contact.last_name}`.trim(),
        companyName: contact.company_name,
        email: contact.email,
      };
    }
  }

  return {
    company: {
      name: company.name,
      logoUrl: company.logo_url,
      brandColor: company.brand_color || '#1a56db',
      addressLine1: company.address_line1,
      addressLine2: company.address_line2,
      city: company.city,
      state: company.state,
      zip: company.zip,
      phone: company.phone,
      email: company.email,
      licenseNumber: company.license_number,
    },
    changeOrder: {
      id: co.id,
      number: co.co_number,
      title: co.title,
      description: co.description,
      status: co.status,
      date: co.created_at ?? new Date().toISOString(),
      netDelta: co.net_delta,
      scheduleImpactDays: co.schedule_impact_days,
      // New columns (this spec's migration) — expected type errors against the
      // un-regenerated database.ts until the migration is applied.
      contractorSignatureName: co.contractor_signature_name,
      contractorSignedAt: co.contractor_signed_at,
      signedAt: co.signed_at,
    },
    project: project ? { name: project.name } : null,
    client,
    lineItems,
  };
}
