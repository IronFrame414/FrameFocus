import { createClient } from '@/lib/supabase-browser';
import type { Database } from '@framefocus/shared/types/database';
import { recalculateEstimateTotals } from '@/lib/services/estimate-items-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applied, DISCARDED } from './mutation-result';

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
  | 'revised'
  | 'converted'; // Module 5 (5A §8): terminal state after estimate → project conversion

export type DiscountType = 'percent' | 'fixed';

export type PricingMode = 'markup' | 'margin';

// Money representation P4: contract type lives on the INSTRUMENT. Value set
// matches change_orders.co_type — one spelling everywhere.
export type ContractType = 'fixed_price' | 'cost_plus' | 'time_and_materials';

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  fixed_price: 'Fixed price',
  cost_plus: 'Cost plus',
  time_and_materials: 'Time & materials',
};

// 4D-rev3: single estimate-level five-value proposal presentation.
export type ProposalPricingLevel =
  | 'lump_sum'
  | 'category_with_price'
  | 'category_no_price'
  | 'detail_with_price_qty'
  | 'detail_no_price';

// Shared labels for the five proposal detail levels — reused by the Details tab
// selector, the proposal preview selector, and the company-default settings form.
export const PROPOSAL_PRICING_LEVEL_OPTIONS: ReadonlyArray<{
  value: ProposalPricingLevel;
  label: string;
}> = [
  { value: 'lump_sum', label: 'Lump sum (one total)' },
  { value: 'category_with_price', label: 'Category totals' },
  { value: 'category_no_price', label: 'Category names only' },
  { value: 'detail_with_price_qty', label: 'Full detail (price & qty)' },
  { value: 'detail_no_price', label: 'Full detail (no price)' },
];

export type DeclineReasonCode =
  | 'too_expensive'
  | 'chose_competitor'
  | 'project_canceled'
  | 'timing'
  | 'scope_changed'
  | 'other';

// Type alias (not interface) so it gets an implicit index signature
// and stays assignable to the generated Json type on JSONB columns.
export type TermsSection = {
  name: string;
  content: string;
};

type EstimateRow = Database['public']['Tables']['estimates']['Row'];
type EstimateInsert = Database['public']['Tables']['estimates']['Insert'];

export type Estimate = Omit<
  EstimateRow,
  | 'status'
  | 'discount_type'
  | 'proposal_pricing_level'
  | 'decline_reason_code'
  | 'pricing_mode'
  | 'contract_type'
> & {
  status: EstimateStatus;
  discount_type: DiscountType | null;
  proposal_pricing_level: ProposalPricingLevel;
  decline_reason_code: DeclineReasonCode | null;
  pricing_mode: PricingMode;
  contract_type: ContractType;
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
    | 'scope_summary'
    | 'scope_sections'
    | 'terms_sections'
    | 'expiration_days'
    | 'internal_notes'
    // Money representation §4.2/§7.1 S-3 — Owner/Admin-gated in the UI
    // (projected_value is user-entered, never derived; NULL is normal).
    | 'projected_value'
  > & {
    discount_type: DiscountType | null;
    proposal_pricing_level: ProposalPricingLevel;
    contract_type: ContractType;
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
type LineRowRow = Database['public']['Tables']['estimate_line_rows']['Row'];
type SubBidRow = Database['public']['Tables']['estimate_sub_bids']['Row'];
type EstimateFileRow = Database['public']['Tables']['estimate_files']['Row'];

// 4D-rev: a line item is composed of typed rows.
/** [S170] 'allowance' added (allowances-selections-spec §2). */
export type RowType = 'labor' | 'material' | 'subcontractor' | 'other' | 'allowance';

export type LaborUnit = 'hours' | 'days';

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
  | 'other';
// [S170] 'allowance' left this union — it is a ROW TYPE now (20261025000000).

export type EstimateAttachmentType = 'site_photo' | 'plan' | 'sub_bid' | 'other';

export type EstimateCategory = CategoryRow;
export type EstimateSubcategory = SubcategoryRow;
export type EstimateLineItem = Omit<LineItemRow, 'discount_type'> & {
  discount_type: DiscountType | null;
};
export type EstimateLineRow = Omit<LineRowRow, 'row_type' | 'unit_of_measure' | 'labor_unit'> & {
  row_type: RowType;
  unit_of_measure: MaterialUnitOfMeasure | null;
  labor_unit: LaborUnit | null;
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
  rows: EstimateLineRow[];
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
  const rows =
    lineItemIds.length > 0
      ? await supabase
          .from('estimate_line_rows')
          .select('*')
          .in('line_item_id', lineItemIds)
          .order('sort_order', { ascending: true })
      : { data: [] };

  return {
    estimate: estimate as Estimate,
    categories: (categories.data ?? []) as EstimateCategory[],
    subcategories: (subcategories.data ?? []) as EstimateSubcategory[],
    lineItems: (lineItems.data ?? []) as EstimateLineItem[],
    rows: (rows.data ?? []) as EstimateLineRow[],
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
      'default_tax_rate, default_pricing_mode, default_subcontractor_markup_percent, default_material_markup_percent, default_labor_markup_percent, default_subcontractor_margin_percent, default_material_margin_percent, default_labor_margin_percent, default_terms_sections, default_expiration_days, default_proposal_pricing_level'
    )
    .single();

  if (companyError) return { success: false, error: companyError.message };

  // The estimate's three percent columns hold markups OR margins,
  // interpreted by pricing_mode — so seed them from whichever set
  // matches the company's default mode (Spec 1 decision).
  const mode = company.default_pricing_mode as PricingMode;
  const seededPercents =
    mode === 'margin'
      ? {
          subcontractor_markup_percent: company.default_subcontractor_margin_percent,
          material_markup_percent: company.default_material_margin_percent,
          labor_markup_percent: company.default_labor_margin_percent,
        }
      : {
          subcontractor_markup_percent: company.default_subcontractor_markup_percent,
          material_markup_percent: company.default_material_markup_percent,
          labor_markup_percent: company.default_labor_markup_percent,
        };

  const { data, error } = await supabase
    .from('estimates')
    .insert({
      name: input.name,
      contact_id: input.contact_id,
      contact_address_id: input.contact_address_id ?? null,
      pricing_mode: mode,
      tax_rate: company.default_tax_rate,
      ...seededPercents,
      terms_sections: company.default_terms_sections,
      // Spec 2 seeds: company defaults for expiration + pricing level
      expiration_days: company.default_expiration_days,
      proposal_pricing_level: company.default_proposal_pricing_level,
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
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

/**
 * Caller's profile row — used for service-layer role guards on top
 * of RLS (defense in depth) and for reviewed_by (FK profiles).
 */
async function getMyProfile(
  supabase: SupabaseClient<Database>
): Promise<{ id: string; role: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .maybeSingle();

  return data ?? null;
}

/**
 * Soft delete. RLS restricts setting is_deleted = true to Owner/Admin
 * (§4.13 "Delete estimate"); the explicit role guard here is
 * defense in depth on top of the RLS WITH CHECK.
 */
export async function softDeleteEstimate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const profile = await getMyProfile(supabase);
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return { success: false, error: 'Only Owner or Admin can delete an estimate' };
  }

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
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}


// ── Status workflow (4D) ──
//
// Owner/Admin-created estimates: Draft → Sent directly (markAsSent).
// PM-created estimates: Draft → Review (submitForReview), then
// Owner/Admin Approve & Send (approveAndSend) → Sent.
// All guards run in the service layer AND RLS (D3 defense in depth).

function expiresAtFrom(sentAtIso: string, expirationDays: number): string {
  const d = new Date(sentAtIso);
  d.setDate(d.getDate() + expirationDays);
  return d.toISOString();
}

/**
 * Owner/Admin direct send (hand-delivery flow). Freezes the
 * estimate: status sent, sent_at now, expires_at computed from
 * expiration_days.
 */
export async function markAsSent(
  estimateId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const profile = await getMyProfile(supabase);
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return { success: false, error: 'Only Owner or Admin can mark an estimate as sent' };
  }

  const { data: current, error: fetchError } = await supabase
    .from('estimates')
    .select('status, expiration_days')
    .eq('id', estimateId)
    .single();

  if (fetchError || !current) return { success: false, error: 'Estimate not found' };
  if (current.status !== 'draft') {
    return {
      success: false,
      error: `Only Draft estimates can be marked as sent (status: ${current.status})`,
    };
  }

  const sentAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('estimates')
    .update({
      status: 'sent',
      sent_at: sentAt,
      expires_at: expiresAtFrom(sentAt, current.expiration_days),
    })
    .eq('id', estimateId)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

/** PM submits their Draft estimate for Owner/Admin review. */
export async function submitForReview(
  estimateId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const profile = await getMyProfile(supabase);
  if (!profile || profile.role !== 'project_manager') {
    return { success: false, error: 'Only a PM submits estimates for review' };
  }

  const { data: current, error: fetchError } = await supabase
    .from('estimates')
    .select('status')
    .eq('id', estimateId)
    .single();

  if (fetchError || !current) return { success: false, error: 'Estimate not found' };
  if (current.status !== 'draft') {
    return {
      success: false,
      error: `Only Draft estimates can be submitted for review (status: ${current.status})`,
    };
  }

  // RLS additionally restricts PMs to their own Draft estimates.
  const { data, error } = await supabase
    .from('estimates')
    .update({ status: 'review' })
    .eq('id', estimateId)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

/**
 * Owner/Admin approves a PM submission: records reviewed_by /
 * reviewed_at, then proceeds with the markAsSent logic.
 */
export async function approveAndSend(
  estimateId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const profile = await getMyProfile(supabase);
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return { success: false, error: 'Only Owner or Admin can approve and send' };
  }

  const { data: current, error: fetchError } = await supabase
    .from('estimates')
    .select('status, expiration_days')
    .eq('id', estimateId)
    .single();

  if (fetchError || !current) return { success: false, error: 'Estimate not found' };
  if (current.status !== 'review') {
    return {
      success: false,
      error: `Only estimates in Review can be approved (status: ${current.status})`,
    };
  }

  const sentAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('estimates')
    .update({
      status: 'sent',
      reviewed_by: profile.id,
      reviewed_at: sentAt,
      sent_at: sentAt,
      expires_at: expiresAtFrom(sentAt, current.expiration_days),
    })
    .eq('id', estimateId)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

// ── Pricing mode toggle (4D) ──

/**
 * Atomic markup/margin switch via the switch_pricing_mode RPC
 * (sticky-value semantics: values still at the active-mode company
 * default swap to the new-mode default; modified values and total
 * overrides stay exactly as left). Then a full totals recompute
 * with the new mode's equations.
 */
export async function updatePricingMode(
  estimateId: string,
  newMode: PricingMode
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { error } = await supabase.rpc('switch_pricing_mode', {
    p_estimate_id: estimateId,
    p_new_mode: newMode,
  });

  if (error) return { success: false, error: error.message };
  return recalculateEstimateTotals(estimateId);
}

// ── Clone (4K) ──

export interface CloneEstimateServiceInput {
  contact_id: string;
  contact_address_id: string;
  name: string;
}

/**
 * Atomic clone via the clone_estimate RPC: new Draft estimate +
 * full child tree (categories / subcategories / line items /
 * materials) in one transaction. Snapshot pricing — no catalog
 * refresh. Sub bids, files, internal notes, timestamps, and the
 * signed proposal never carry over. Fresh estimate_number from the
 * company sequence; cloned_from_estimate_id records lineage.
 */
export async function cloneEstimate(
  sourceEstimateId: string,
  input: CloneEstimateServiceInput
): Promise<{ success: boolean; id?: string; estimate_number?: string; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('clone_estimate', {
    p_source_id: sourceEstimateId,
    p_contact_id: input.contact_id,
    p_contact_address_id: input.contact_address_id,
    p_name: input.name,
  });

  if (error) return { success: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { success: false, error: 'Clone failed' };
  return {
    success: true,
    id: row.new_estimate_id,
    estimate_number: row.new_estimate_number,
  };
}


// ── Reminders (4J) ──

/**
 * Per-estimate reminder override: null = company default, [] = off.
 * Intentionally NOT draft-guarded — opting a client out of
 * reminders matters most AFTER the proposal is sent. Owner/Admin
 * only (reminders are an operational concern, not estimate content).
 */
export async function updateReminderSchedule(
  estimateId: string,
  schedule: number[] | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const profile = await getMyProfile(supabase);
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return { success: false, error: 'Only Owner or Admin can change reminder settings' };
  }

  const { data, error } = await supabase
    .from('estimates')
    .update({ reminder_schedule: schedule })
    .eq('id', estimateId)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}
