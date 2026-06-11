import { createClient } from '@/lib/supabase-browser';
import type { Database } from '@framefocus/shared/types/database';

// CHECK-constrained columns come back as loose `string` from the type
// generator; re-narrow them to the literal unions per CLAUDE.md.

export type EstimateStatus =
  | 'draft'
  | 'review'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'revised';

export type DiscountType = 'percent' | 'fixed';

export type ProposalPricingLevel = 'total_only' | 'category_totals' | 'line_items';

export type DeclineReasonCode =
  | 'too_expensive'
  | 'chose_competitor'
  | 'project_canceled'
  | 'timing'
  | 'scope_changed'
  | 'other';

export interface TermsSection {
  name: string;
  content: string;
}

type EstimateRow = Database['public']['Tables']['estimates']['Row'];
type EstimateInsert = Database['public']['Tables']['estimates']['Insert'];

export type Estimate = Omit<
  EstimateRow,
  'status' | 'discount_type' | 'proposal_pricing_level' | 'decline_reason_code'
> & {
  status: EstimateStatus;
  discount_type: DiscountType | null;
  proposal_pricing_level: ProposalPricingLevel;
  decline_reason_code: DeclineReasonCode | null;
};

export type CreateEstimateInput = Pick<EstimateInsert, 'name' | 'contact_id'> & {
  contact_address_id?: string | null;
};

// Content fields only — lifecycle transitions (Mark as Sent, accept,
// decline, new version) are 4D scope and get dedicated functions there.
export type UpdateEstimateInput = Partial<
  Pick<
    EstimateInsert,
    | 'name'
    | 'contact_id'
    | 'contact_address_id'
    | 'tax_rate'
    | 'subcontractor_markup_percent'
    | 'material_markup_percent'
    | 'labor_markup_percent'
    | 'discount_amount'
    | 'cover_letter'
    | 'scope_of_work'
    | 'terms_sections'
    | 'expiration_days'
  > & {
    discount_type: DiscountType | null;
    proposal_pricing_level: ProposalPricingLevel;
  }
>;

export interface ListEstimatesFilters {
  status?: EstimateStatus;
  contact_id?: string;
  search?: string;
}

type CategoryRow = Database['public']['Tables']['estimate_categories']['Row'];
type SubcategoryRow = Database['public']['Tables']['estimate_subcategories']['Row'];
type LineItemRow = Database['public']['Tables']['estimate_line_items']['Row'];
type LineMaterialRow = Database['public']['Tables']['estimate_line_materials']['Row'];
type SubBidRow = Database['public']['Tables']['estimate_sub_bids']['Row'];
type EstimateFileRow = Database['public']['Tables']['estimate_files']['Row'];

export type LineType = 'detailed' | 'lump_sum';

export type MaterialUnitOfMeasure =
  | 'each'
  | 'sq_ft'
  | 'linear_ft'
  | 'box'
  | 'bundle'
  | 'bag'
  | 'gallon'
  | 'pair'
  | 'set'
  | 'allowance'
  | 'other';

export type EstimateAttachmentType = 'site_photo' | 'plan' | 'sub_bid' | 'other';

export type EstimateCategory = CategoryRow;
export type EstimateSubcategory = SubcategoryRow;
export type EstimateLineItem = Omit<LineItemRow, 'line_type' | 'discount_type'> & {
  line_type: LineType;
  discount_type: DiscountType | null;
};
export type EstimateLineMaterial = Omit<LineMaterialRow, 'unit_of_measure'> & {
  unit_of_measure: MaterialUnitOfMeasure;
};
export type EstimateSubBid = SubBidRow;
export type EstimateFile = Omit<EstimateFileRow, 'attachment_type'> & {
  attachment_type: EstimateAttachmentType;
};

export interface EstimateWithChildren {
  estimate: Estimate;
  categories: EstimateCategory[];
  subcategories: EstimateSubcategory[];
  lineItems: EstimateLineItem[];
  materials: EstimateLineMaterial[];
  subBids: EstimateSubBid[];
  files: EstimateFile[];
}

/**
 * Role scoping (D2) is enforced by RLS: Owner/Admin see company-wide,
 * PM sees only own (created_by), Foreman/Crew see none.
 */
export async function listEstimates(filters?: ListEstimatesFilters): Promise<Estimate[]> {
  const supabase = createClient();

  let query = supabase
    .from('estimates')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.contact_id) {
    query = query.eq('contact_id', filters.contact_id);
  }
  if (filters?.search) {
    query = query.or(`name.ilike.%${filters.search}%,estimate_number.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as Estimate[];
}

/**
 * Single fetch with all children. No is_deleted filter on the estimate
 * itself (CLAUDE.md trash-bin pattern — restore flows must be able to
 * read soft-deleted rows by id); soft-deleted sub bids are excluded
 * because they are a listing within the estimate.
 */
export async function getEstimate(id: string): Promise<EstimateWithChildren | null> {
  const supabase = createClient();

  const { data: estimate } = await supabase.from('estimates').select('*').eq('id', id).single();
  if (!estimate) return null;

  const [categories, subcategories, lineItems, subBids, files] = await Promise.all([
    supabase
      .from('estimate_categories')
      .select('*')
      .eq('estimate_id', id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('estimate_subcategories')
      .select('*')
      .eq('estimate_id', id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('estimate_line_items')
      .select('*')
      .eq('estimate_id', id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('estimate_sub_bids')
      .select('*')
      .eq('estimate_id', id)
      .eq('is_deleted', false)
      .order('received_at', { ascending: true }),
    supabase
      .from('estimate_files')
      .select('*')
      .eq('estimate_id', id)
      .order('sort_order', { ascending: true }),
  ]);

  const lineItemIds = (lineItems.data ?? []).map((li) => li.id);
  const materials =
    lineItemIds.length > 0
      ? await supabase
          .from('estimate_line_materials')
          .select('*')
          .in('line_item_id', lineItemIds)
          .order('created_at', { ascending: true })
      : { data: [] };

  return {
    estimate: estimate as Estimate,
    categories: (categories.data ?? []) as EstimateCategory[],
    subcategories: (subcategories.data ?? []) as EstimateSubcategory[],
    lineItems: (lineItems.data ?? []) as EstimateLineItem[],
    materials: (materials.data ?? []) as EstimateLineMaterial[],
    subBids: (subBids.data ?? []) as EstimateSubBid[],
    files: (files.data ?? []) as EstimateFile[],
  };
}

/**
 * Creates a Draft estimate. The DB fills in:
 * - estimate_number via next_estimate_number() column default (D5 —
 *   atomic, company-scoped, no gaps on failed inserts)
 * - created_by_role via get_my_role() column default
 * - company_id / created_by / updated_by via per-tenant defaults
 * This function copies the company's default markups, tax rate, and
 * terms onto the estimate (§4.4a cascade: company → estimate → line).
 */
export async function createEstimate(
  input: CreateEstimateInput
): Promise<{ success: boolean; id?: string; estimate_number?: string; error?: string }> {
  const supabase = createClient();

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select(
      'default_tax_rate, default_subcontractor_markup_percent, default_material_markup_percent, default_labor_markup_percent, default_terms_sections'
    )
    .single();

  if (companyError) return { success: false, error: companyError.message };

  const { data, error } = await supabase
    .from('estimates')
    .insert({
      name: input.name,
      contact_id: input.contact_id,
      contact_address_id: input.contact_address_id ?? null,
      tax_rate: company.default_tax_rate,
      subcontractor_markup_percent: company.default_subcontractor_markup_percent,
      material_markup_percent: company.default_material_markup_percent,
      labor_markup_percent: company.default_labor_markup_percent,
      terms_sections: company.default_terms_sections,
    })
    .select('id, estimate_number')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id, estimate_number: data.estimate_number };
}

/**
 * Draft guard (D3): enforced here AND in RLS. The RLS UPDATE policy
 * hard-freezes PMs to Draft; this guard covers Owner/Admin content
 * edits too, since their RLS path must stay open for status
 * transitions (4D).
 */
export async function updateEstimate(
  id: string,
  input: UpdateEstimateInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { data: current, error: fetchError } = await supabase
    .from('estimates')
    .select('status')
    .eq('id', id)
    .single();

  if (fetchError || !current) return { success: false, error: 'Estimate not found' };
  if (current.status !== 'draft') {
    return {
      success: false,
      error: `Estimate is frozen and cannot be edited (status: ${current.status})`,
    };
  }

  // BEFORE UPDATE trigger `estimates_set_updated_by` handles updated_by.
  // updated_at is handled by the existing updated_at trigger.
  const { data, error } = await supabase
    .from('estimates')
    .update(input)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Estimate not found or not editable' };
  }
  return { success: true };
}

/**
 * Soft delete. RLS restricts setting is_deleted = true to Owner/Admin
 * (§4.13 "Delete estimate").
 */
export async function softDeleteEstimate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { data, error } = await supabase
    .from('estimates')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'Estimate not found or you cannot delete it' };
  }
  return { success: true };
}
