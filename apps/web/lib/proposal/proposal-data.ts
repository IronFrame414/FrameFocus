import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import {
  roundMoney,
  computeRowCost,
  resolveRowMarkupPercent,
  type DiscountType,
  type RowType,
} from '@framefocus/shared/utils/estimate-totals';
import { proposalFormatShowsCost } from '@framefocus/shared/utils/proposal-format';

const ROW_TYPES: readonly RowType[] = ['labor', 'material', 'subcontractor', 'other', 'allowance'];

// Spec 2 (4E/4F) — assembles everything the proposal renderers
// (React-PDF document + public signing page HTML) need, as one
// serializable object. Takes the Supabase client as a parameter so
// it works under RLS (dashboard preview / generate route) AND with
// the service-role client (public signing page, email send).

// 4D-rev3: single estimate-level five-value proposal presentation. The renderer
// (template + html) decides what each level shows; the data layer always
// supplies the full category → line → row tree and lets the renderer hide.
export type ProposalPricingLevel =
  // Legacy five — STORED on 23 sent estimates; the renderer keeps their exact
  // behaviour (never remapped, so what a client was sent never changes).
  | 'lump_sum'
  | 'category_with_price'
  | 'category_no_price'
  | 'detail_with_price_qty'
  | 'detail_no_price'
  // Canonical eight (estimates-redesign §3.4). The renderer handles these via a
  // SEPARATE code path from the legacy five.
  | 'total_only'
  | 'summary'
  | 'summary_with_descriptions'
  | 'itemized'
  | 'itemized_with_descriptions'
  | 'itemized_no_unit_pricing'
  | 'cost_plus_itemized'
  | 'time_and_materials_itemized';

export interface ProposalRow {
  name: string;
  total: number;
  /** Row instrument type ('labor' | 'material' | …). Harmless to carry; the
   *  T&M layout partitions on it. */
  rowType: string;
  // ── Open-book only — populated ONLY when the estimate's format shows cost
  //    (cost_plus / t&m). Null otherwise, so a non-open-book payload never
  //    carries cost, and the cost-disclosure boundary holds in the DATA, not
  //    just the renderer (audit O6). ──
  /** Pre-markup, pre-tax cost of this row. */
  cost: number | null;
  /** Labor hourly rate (T&M Time section). */
  rate: number | null;
  /** Labor hours / material quantity (T&M Time section). */
  hours: number | null;
}

export interface ProposalLine {
  name: string;
  description: string | null;
  total: number;
  /** Pre-discount amount — present only when a per-line discount applies (E1). */
  originalTotal: number | null;
  discountLabel: string | null;
  /** Line contractor price = Σ row costs. Open-book only, else null. */
  cost: number | null;
  /** The line's effective markup %, shown only when it is UNIFORM across the
   *  line's rows (open-book only). Null when rows carry different markups or
   *  cost is hidden — never a blended figure invented to fill the column. */
  markupPercent: number | null;
  /**
   * 4D-rev3: the line's marked-up rows. Always populated; the renderer shows
   * them only at the detail / open-book levels.
   */
  rows: ProposalRow[];
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

  // Version is DERIVED, never the stored `version_number` (whose 'v1.1' default
  // is vestigial). get_estimate_version walks the void/reissue supersede chain;
  // the label is "v" || depth — first send v1, one reissue v2 (§1.2, R2′/Q2).
  const { data: versionDepth } = await supabase.rpc('get_estimate_version', {
    p_estimate_id: estimateId,
  });
  const derivedVersion = `v${versionDepth ?? 1}`;

  const pricingLevel = estimate.proposal_pricing_level as ProposalPricingLevel;

  // The cost-disclosure boundary, decided ONCE here (audit O6 / §3.4). When
  // false, no cost, rate, hours or markup is ever written into ProposalData —
  // so the six non-open-book formats cannot leak cost even through the JSON
  // payload, not merely through the renderer.
  const showsCost = proposalFormatShowsCost(pricingLevel);
  const markupDefaults = {
    labor_markup_percent: estimate.labor_markup_percent,
    material_markup_percent: estimate.material_markup_percent,
    subcontractor_markup_percent: estimate.subcontractor_markup_percent,
  };

  const lineItems = lineItemsRes.data ?? [];
  const lineIds = lineItems.map((l) => l.id);
  const { data: allRows } =
    lineIds.length > 0
      ? await supabase
          .from('estimate_line_rows')
          .select(
            'line_item_id, row_type, name, total, unit_of_measure, unit_cost, quantity, rate, amount, markup_percent, apply_tax, sort_order'
          )
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
    quantity: number | null;
    rate: number | null;
    amount: number | null;
    markup_percent: number | null;
    apply_tax: boolean;
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

        // 4D-rev3: always supply the line's marked-up rows. Cost/rate/hours and
        // the effective markup are populated ONLY for open-book formats.
        const recs = rowsByLine.get(l.id) ?? [];
        const rows: ProposalRow[] = recs.map((r) => {
          const knownType = (ROW_TYPES as readonly string[]).includes(r.row_type);
          const cost =
            showsCost && knownType
              ? computeRowCost({
                  row_type: r.row_type as RowType,
                  rate: r.rate,
                  quantity: r.quantity,
                  unit_cost: r.unit_cost,
                  amount: r.amount,
                })
              : null;
          return {
            name: r.name,
            total: r.total,
            rowType: r.row_type,
            cost,
            rate: showsCost && r.row_type === 'labor' ? r.rate : null,
            hours: showsCost && r.row_type === 'labor' ? r.quantity : null,
          };
        });

        // Line contractor price and the line's markup, for the Cost Plus layout.
        // The markup is shown only when every row resolves to the SAME effective
        // markup — otherwise the column is left blank rather than blending a
        // figure the estimate never carried.
        let lineCost: number | null = null;
        let lineMarkup: number | null = null;
        if (showsCost && recs.length > 0) {
          lineCost = roundMoney(rows.reduce((sum, r) => sum + (r.cost ?? 0), 0));
          const markups = recs
            .filter((r) => (ROW_TYPES as readonly string[]).includes(r.row_type))
            .map((r) =>
              resolveRowMarkupPercent(r.row_type as RowType, r.markup_percent, markupDefaults)
            );
          const first = markups[0] ?? null;
          lineMarkup =
            markups.length > 0 && markups.every((m) => m === first) ? first : null;
        }

        return {
          name: l.name,
          description: l.description,
          total: l.total_price,
          originalTotal,
          discountLabel,
          cost: lineCost,
          markupPercent: lineMarkup,
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
    // [S170] allowance is a ROW TYPE; the material/unit_of_measure='allowance'
    // representation was retired by 20261025000000. Same box, new predicate.
    .filter((r) => r.row_type === 'allowance')
    .map((r) => ({
      name: r.name,
      lineName: lineNameById.get(r.line_item_id) ?? '',
      // quantity × unit_cost — the row's cost, same as computeRowCost. The old
      // box read unit_cost alone because quantity was ignored on the retired
      // representation; a 2 × $5,000 allowance would have printed as $5,000.
      amount: Math.round((r.quantity ?? 0) * (r.unit_cost ?? 0) * 100) / 100,
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
      version: derivedVersion,
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
