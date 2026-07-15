import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

// Signed-artifact spec §6 — assembles everything the CO renderer needs as one
// serializable object. Mirrors proposal-data.ts: takes the Supabase client as a
// parameter so it works under RLS (dashboard / send route) AND with the
// service-role client (public signing completion, cron). The CO document STANDS
// ALONE — it embeds neither the original estimate nor the contract (spec §6):
// CO number, title, description, its own line items/pricing, net delta,
// schedule impact, and two signature blocks. The signatures are rendered
// natively by co-template.tsx (React-PDF), not stamped afterward.
//
// Signature data comes from two places:
//   * Contractor block — reconstructed from the change_orders row (mode / ref /
//     name / signed_at), which is written at send BEFORE the PDF renders, so it
//     is always in the DB at both v1 and v2 render time. A saved-image
//     signature is downloaded to a base64 data-URI here (admin client).
//   * Client block — supplied by the caller via `signatureOverride`. At v2
//     render time the client signature is NOT yet persisted (completeCoSignature
//     renders before it writes the session/CO rows, keeping a failed render
//     retryable), so it is passed in from the in-memory signing payload.

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
    signedAt: string | null;
  };
  // Contractor signature block, reconstructed from the change_orders row. Null
  // until the CO has been sent (contractor signs at send). `imageDataUri` is
  // populated only for the saved_image mode; typed_name renders `name`.
  contractorSignature: {
    mode: 'typed_name' | 'saved_image';
    name: string;
    imageDataUri: string | null;
    signedAt: string;
  } | null;
  // Client signature block. Always an image (PNG data-URI — the signing UI
  // renders both drawn and typed marks to a canvas). Supplied via the caller's
  // `signatureOverride` at v2 render time; null for v1.
  clientSignature: {
    name: string;
    imageDataUri: string;
    signedAt: string;
    ip: string | null;
  } | null;
  project: { name: string } | null;
  client: {
    name: string;
    companyName: string | null;
    email: string | null;
  } | null;
  lineItems: CoLineItem[];
}

// Client signature block supplied by the caller (v2), since it is not yet
// persisted when completeCoSignature renders the fully-signed PDF.
export interface ClientSignatureOverride {
  name: string;
  imageDataUri: string; // PNG data-URL
  signedAt: string;
  ip: string | null;
}

export interface ChangeOrderDataOptions {
  clientSignature?: ClientSignatureOverride;
}

export async function getChangeOrderData(
  supabase: SupabaseClient<Database>,
  changeOrderId: string,
  options: ChangeOrderDataOptions = {}
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

  // Contractor signature block — reconstructed from the CO row. Present only
  // once the CO has been sent (contractor signs at send). Type casts guard the
  // new columns against the un-regenerated database.ts (see note below).
  const contractorSignedAt = co.contractor_signed_at as string | null;
  const contractorMode = co.contractor_signature_mode as 'typed_name' | 'saved_image' | null;
  const contractorName = co.contractor_signature_name as string | null;
  const contractorRef = co.contractor_signature_ref as string | null;
  let contractorSignature: ChangeOrderData['contractorSignature'] = null;
  if (contractorSignedAt && contractorMode && contractorName) {
    // Saved-image mode: download the stored PNG to a base64 data-URI for the
    // React-PDF <Image>. A missing image degrades to null (the block still
    // renders the printed name as a fallback mark), never blocking the render.
    let imageDataUri: string | null = null;
    if (contractorMode === 'saved_image' && contractorRef) {
      const base64 = await downloadImageBase64(supabase, 'project-files', contractorRef);
      if (base64) imageDataUri = `data:image/png;base64,${base64}`;
    }
    contractorSignature = {
      mode: contractorMode,
      name: contractorName,
      imageDataUri,
      signedAt: contractorSignedAt,
    };
  }

  // Client signature block — supplied by the caller (v2 render); null for v1.
  const clientSignature: ChangeOrderData['clientSignature'] = options.clientSignature
    ? {
        name: options.clientSignature.name,
        imageDataUri: options.clientSignature.imageDataUri,
        signedAt: options.clientSignature.signedAt,
        ip: options.clientSignature.ip,
      }
    : null;

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
      signedAt: co.signed_at,
    },
    contractorSignature,
    clientSignature,
    project: project ? { name: project.name } : null,
    client,
    lineItems,
  };
}

/**
 * Downloads a stored image (e.g. the company's saved contractor signature) as
 * base64. Returns null on any failure — a missing image must not block the
 * render (the typed-name / printed-name path is always available). Lives here
 * because co-data is its sole consumer; co-pdf-service re-exports it so the
 * historical import path stays valid.
 */
export async function downloadImageBase64(
  admin: SupabaseClient<Database>,
  bucket: 'project-files',
  path: string
): Promise<string | null> {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return buf.toString('base64');
}
