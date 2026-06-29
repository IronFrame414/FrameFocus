import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { roundMoney, type DiscountType } from '@framefocus/shared/utils/estimate-totals';

// Spec 2 (4E/4F) — assembles everything the proposal renderers
// (React-PDF document + public signing page HTML) need, as one
// serializable object. Takes the Supabase client as a parameter so
// it works under RLS (dashboard preview / generate route) AND with
// the service-role client (public signing page, email send).

// 4D-rev3: single estimate-level five-value proposal presentation. The renderer
// (template + html) decides what each level shows; the data layer always
// supplies the full category → line → row tree and lets the renderer hide.
export type ProposalPricingLevel =
  | 'lump_sum'
  | 'category_with_price'
  | 'category_no_price'
  | 'detail_with_price_qty'
  | 'detail_no_price';

export interface ProposalLine {
  name: string;
  description: string | null;
  total: number;
  /** Pre-discount amount — present only when a per-line discount applies (E1). */
  originalTotal: number | null;
  discountLabel: string | null;
  /**
   * 4D-rev3: the line's marked-up rows. Always populated; the renderer shows
   * them only at the detail levels (detail_with_price_qty / detail_no_price).
   */
  rows: Array<{ name: string; total: number }>;
}

export interface ProposalCategory {
  name: string;
  subtotal: number;
  lines: ProposalLine[];
}

export interface ProposalScopeSection {
  title: string;
  bullets: string[];
}

export interface ProposalAllowance {
  name: string;
  lineName: string;
  amount: number;
}

export interface ProposalData {
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
  estimate: {
    id: string;
    number: string;
    version: string;
    name: string;
    status: string;
    date: string;
    expiresAt: string | null;
    expirationDays: number;
    pricingLevel: ProposalPricingLevel;
    coverLetter: string | null;
    scopeSummary: string | null;
    scopeSections: ProposalScopeSection[];
    termsSections: Array<{ name: string; content: string }>;
    subtotal: number;
    taxTotal: number;
    discountTotal: number;
    grandTotal: number;
  };
  client: {
    name: string;
    companyName: string | null;
    email: string | null;
  };
  jobSite: {
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    zip: string;
  } | null;
  categories: ProposalCategory[];
  allowances: ProposalAllowance[];
}

export async function getProposalData(
  supabase: SupabaseClient<Database>,
  estimateId: string
): Promise<ProposalData | null> {
  const { data: estimate } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', estimateId)
    .maybeSingle();
  if (!estimate || estimate.is_deleted) return null;

  const [companyRes, contactRes, addressRes, categoriesRes, lineItemsRes] = await Promise.all([
    supabase
      .from('companies')
      .select(
        'name, logo_url, brand_color, address_line1, address_line2, city, state, zip, phone, email, license_number'
      )
      .eq('id', estimate.company_id)
      .single(),
    supabase
      .from('contacts')
      .select('first_name, last_name, company_name, email')
      .eq('id', estimate.contact_id)
      .single(),
    estimate.contact_address_id
      ? supabase
          .from('contact_addresses')
          .select('address_line1, address_line2, city, state, zip')
          .eq('id', estimate.contact_address_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('estimate_categories')
      .select('id, name, sort_order')
      .eq('estimate_id', estimateId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('estimate_line_items')
      .select(
        'id, category_id, name, description, total_price, total_price_override, discount_type, discount_amount, sort_order'
      )
      .eq('estimate_id', estimateId)
      .order('sort_order', { ascending: true }),
  ]);

  const company = companyRes.data;
  const contact = contactRes.data;
  if (!company || !contact) return null;

  const pricingLevel = estimate.proposal_pricing_level as ProposalPricingLevel;
  const lineItems = lineItemsRes.data ?? [];
  const lineIds = lineItems.map((l) => l.id);
  const { data: allRows } =
    lineIds.length > 0
      ? await supabase
          .from('estimate_line_rows')
          .select('line_item_id, row_type, name, total, unit_of_measure, unit_cost, sort_order')
          .in('line_item_id', lineIds)
          .order('sort_order', { ascending: true })
      : { data: [] };

  type ProposalRowRec = {
    line_item_id: string;
    row_type: string;
    name: string;
    total: number;
    unit_of_measure: string | null;
    unit_cost: number | null;
    sort_order: number;
  };
  const rowsByLine = new Map<string, ProposalRowRec[]>();
  for (const r of (allRows ?? []) as ProposalRowRec[]) {
    const list = rowsByLine.get(r.line_item_id) ?? [];
    list.push(r);
    rowsByLine.set(r.line_item_id, list);
  }

  const categories: ProposalCategory[] = (categoriesRes.data ?? []).map((cat) => {
    const lines: ProposalLine[] = lineItems
      .filter((l) => l.category_id === cat.id)
      .map((l) => {
        // E1: show original → discount → line total. Reconstruct the
        // pre-discount amount from the stored total. Skipped when a
        // total override is active (the override IS the price).
        let originalTotal: number | null = null;
        let discountLabel: string | null = null;
        if (
          l.discount_type &&
          l.discount_amount != null &&
          l.discount_amount > 0 &&
          l.total_price_override == null
        ) {
          const type = l.discount_type as DiscountType;
          if (type === 'percent') {
            const divisor = 1 - l.discount_amount / 100;
            if (divisor > 0) originalTotal = roundMoney(l.total_price / divisor);
            discountLabel = `${l.discount_amount}%`;
          } else {
            originalTotal = roundMoney(l.total_price + l.discount_amount);
            discountLabel = `$${l.discount_amount.toFixed(2)}`;
          }
        }

        // 4D-rev3: always supply the line's marked-up rows. The renderer
        // shows them only at the detail levels.
        const rows = (rowsByLine.get(l.id) ?? []).map((r) => ({ name: r.name, total: r.total }));

        return {
          name: l.name,
          description: l.description,
          total: l.total_price,
          originalTotal,
          discountLabel,
          rows,
        };
      });

    return {
      name: cat.name,
      subtotal: roundMoney(lines.reduce((sum, l) => sum + l.total, 0)),
      lines,
    };
  });

  const lineNameById = new Map(lineItems.map((l) => [l.id, l.name]));
  const allowances: ProposalAllowance[] = (allRows ?? [])
    .filter((r) => r.row_type === 'material' && r.unit_of_measure === 'allowance')
    .map((r) => ({
      name: r.name,
      lineName: lineNameById.get(r.line_item_id) ?? '',
      amount: r.unit_cost ?? 0,
    }));

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
    estimate: {
      id: estimate.id,
      number: estimate.estimate_number,
      version: estimate.version_number,
      name: estimate.name,
      status: estimate.status,
      date: estimate.created_at ?? new Date().toISOString(),
      expiresAt: estimate.expires_at,
      expirationDays: estimate.expiration_days,
      pricingLevel,
      coverLetter: estimate.cover_letter,
      scopeSummary: estimate.scope_summary,
      scopeSections:
        (estimate.scope_sections as unknown as ProposalScopeSection[] | null) ?? [],
      termsSections:
        (estimate.terms_sections as Array<{ name: string; content: string }> | null) ?? [],
      subtotal: estimate.subtotal,
      taxTotal: estimate.tax_total,
      discountTotal: estimate.discount_total,
      grandTotal: estimate.grand_total,
    },
    client: {
      name: `${contact.first_name} ${contact.last_name}`.trim(),
      companyName: contact.company_name,
      email: contact.email,
    },
    jobSite: addressRes.data
      ? {
          addressLine1: addressRes.data.address_line1,
          addressLine2: addressRes.data.address_line2,
          city: addressRes.data.city,
          state: addressRes.data.state,
          zip: addressRes.data.zip,
        }
      : null,
    categories,
    allowances,
  };
}
