import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

// CHECK-constrained columns come back as loose `string` from the
// type generator; re-narrow per CLAUDE.md.
export type PricingMode = 'markup' | 'margin';

// Type alias (not interface) so it gets an implicit index signature
// and stays assignable to the generated Json type on JSONB columns.
export type TermsSection = {
  name: string;
  content: string;
};

export type CompanyData = Pick<
  Database['public']['Tables']['companies']['Row'],
  | 'id'
  | 'name'
  | 'address_line1'
  | 'address_line2'
  | 'city'
  | 'state'
  | 'zip'
  | 'phone'
  | 'website'
  | 'trade_type'
  | 'license_number'
  | 'logo_url'
>;

export async function getCompany(): Promise<CompanyData | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) return null;

  const { data: company } = await supabase
    .from('companies')
    .select(
      'id, name, address_line1, address_line2, city, state, zip, phone, website, trade_type, license_number, logo_url'
    )
    .eq('id', profile.company_id)
    .single();

  return company ?? null;
}

// ── 4M — Estimating settings ──

type CompaniesRow = Database['public']['Tables']['companies']['Row'];

export type EstimatingSettings = Omit<
  Pick<
    CompaniesRow,
    | 'id'
    | 'estimate_number_prefix'
    | 'estimate_number_sequence'
    | 'default_pricing_mode'
    | 'default_subcontractor_markup_percent'
    | 'default_material_markup_percent'
    | 'default_labor_markup_percent'
    | 'default_subcontractor_margin_percent'
    | 'default_material_margin_percent'
    | 'default_labor_margin_percent'
    | 'default_tax_rate'
    | 'default_labor_rate'
    | 'default_terms_sections'
  >,
  'default_pricing_mode' | 'default_terms_sections'
> & {
  default_pricing_mode: PricingMode;
  default_terms_sections: TermsSection[] | null;
};

export async function getEstimatingSettings(): Promise<EstimatingSettings | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS scopes companies to the caller's own row.
  const { data } = await supabase
    .from('companies')
    .select(
      'id, estimate_number_prefix, estimate_number_sequence, default_pricing_mode, default_subcontractor_markup_percent, default_material_markup_percent, default_labor_markup_percent, default_subcontractor_margin_percent, default_material_margin_percent, default_labor_margin_percent, default_tax_rate, default_labor_rate, default_terms_sections'
    )
    .maybeSingle();

  return (data as EstimatingSettings | null) ?? null;
}


// ── Spec 2 (4E/4J) — proposals & email settings ──

export type ProposalPricingLevel = 'total_only' | 'category_totals' | 'line_items';

export type ProposalSettings = Omit<
  Pick<
    CompaniesRow,
    | 'id'
    | 'brand_color'
    | 'default_proposal_email_subject'
    | 'default_proposal_email_body'
    | 'default_reminder_email_subject'
    | 'default_reminder_email_body'
    | 'default_reminder_schedule'
    | 'default_expiration_days'
    | 'default_proposal_pricing_level'
  >,
  'default_proposal_pricing_level' | 'default_reminder_schedule'
> & {
  default_proposal_pricing_level: ProposalPricingLevel;
  default_reminder_schedule: number[] | null;
};

export async function getProposalSettings(): Promise<ProposalSettings | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('companies')
    .select(
      'id, brand_color, default_proposal_email_subject, default_proposal_email_body, default_reminder_email_subject, default_reminder_email_body, default_reminder_schedule, default_expiration_days, default_proposal_pricing_level'
    )
    .maybeSingle();

  return (data as ProposalSettings | null) ?? null;
}
