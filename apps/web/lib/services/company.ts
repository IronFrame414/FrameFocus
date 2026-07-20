import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';
import {
  DEFAULT_TIME_SETTINGS,
  WEEK_STARTS_ON,
  type GpsClockMode,
  type TimeSettings,
} from '@framefocus/shared/utils/time-tracking';

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

// ── Company Settings pass [S86] — time-tracking settings ──
// Five columns (migration 20260721050000) + timezone, read together so the
// time screens make one fetch. gps_clock_mode is CHECK-constrained; re-narrow
// the generator's loose `string` per CLAUDE.md.

export type TimeTrackingSettings = Omit<
  Pick<
    Database['public']['Tables']['companies']['Row'],
    | 'id'
    | 'timezone'
    | 'week_starts_on'
    | 'ot_threshold_hours'
    | 'breaks_paid'
    | 'paid_break_cap_minutes'
    | 'gps_clock_mode'
  >,
  'gps_clock_mode'
> & { gps_clock_mode: GpsClockMode };

/**
 * Raw settings row for the settings page (needs `id` for updates). RLS scopes
 * companies to the caller's own row. Returns null when the caller can't be
 * resolved — the semantic accessor below carries the fallbacks.
 */
export async function getTimeTrackingSettings(): Promise<TimeTrackingSettings | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('companies')
    .select(
      'id, timezone, week_starts_on, ot_threshold_hours, breaks_paid, paid_break_cap_minutes, gps_clock_mode'
    )
    .maybeSingle();

  return (data as TimeTrackingSettings | null) ?? null;
}

/** Semantic shape the time screens consume (shared-helper parameter types). */
export interface CompanyTimeSettings {
  timezone: string;
  /** 0 = Sunday … 6 = Saturday (companies.week_starts_on). */
  weekStartsOn: number;
  /** OT threshold + paid-break rules, in the pure helpers' shape. */
  time: TimeSettings;
  gpsClockMode: GpsClockMode;
}

/**
 * The caller's time settings with column-default fallbacks when the caller
 * can't be resolved (mirrors getCompanyTimezone's old behavior). Single
 * source for every screen that formats wall-clock times, computes week/day
 * boundaries, or derives paid hours / OT (Module 6A).
 */
export async function getCompanyTimeSettings(): Promise<CompanyTimeSettings> {
  const row = await getTimeTrackingSettings();
  if (!row) {
    return {
      timezone: 'America/New_York',
      weekStartsOn: WEEK_STARTS_ON,
      time: DEFAULT_TIME_SETTINGS,
      gpsClockMode: 'capture',
    };
  }
  return {
    timezone: row.timezone,
    weekStartsOn: row.week_starts_on,
    time: {
      otThresholdHours: row.ot_threshold_hours,
      breaksPaid: row.breaks_paid,
      breakCapMinutes: row.paid_break_cap_minutes,
    },
    gpsClockMode: row.gps_clock_mode,
  };
}

/**
 * The caller's company timezone (companies.timezone, migration 20260719000000).
 * Kept for screens that need only the timezone; delegates to
 * getCompanyTimeSettings so there is one read path.
 */
export async function getCompanyTimezone(): Promise<string> {
  return (await getCompanyTimeSettings()).timezone;
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

// 4D-rev3: single estimate-level five-value proposal presentation.
export type ProposalPricingLevel =
  | 'lump_sum'
  | 'category_with_price'
  | 'category_no_price'
  | 'detail_with_price_qty'
  | 'detail_no_price';

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
