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
  // [S97] The company's own email address. It already drove two shipped
  // behaviors with NO CONTROL ANYWHERE to set it: resolveCompanyReplyTo() uses
  // it as the FIRST choice of Reply-To on every client-facing send, and the
  // invoice/CO PDF letterhead prints it. With no control it was always NULL, so
  // every client reply fell through to the OWNER's personal address. The column
  // has existed since the company_settings migration; only the input was
  // missing. ("A setting with no control is a bug" — the M4 lesson.)
  | 'email'
  | 'website'
  | 'trade_type'
  | 'license_number'
  | 'logo_url'
  // 7F §10.2 [S140] — the printed name and title on a lien release. The
  // signature IMAGE is `contractor_signature_path`, which already existed and
  // already stamps change orders; only these two are net-new.
  | 'signatory_name'
  | 'signatory_title'
  | 'contractor_signature_path'
  // 7I §5.2 [S150] — the MASTER half of the two-level client-contract toggle.
  // Read here so Company Settings can render its current state; WRITTEN by
  // `setClientContractsEnabled()` in contracts-client.ts, never by
  // `updateCompany()` — that writer has no row-count guard and would report a
  // discarded write as success (#1-s146). Off by default: §12.1 requires that
  // off leaves every other surface byte-identical to today.
  | 'client_contracts_enabled'
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
      'id, name, address_line1, address_line2, city, state, zip, phone, email, website, trade_type, license_number, logo_url, signatory_name, signatory_title, contractor_signature_path, client_contracts_enabled'
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

// ── 7A §5.8 — GL account mapping + company fixed burden ──
// The four gl_account_* columns are free-text QB account paths consumed by
// the future 7G connector (7A only stores them). fixed_burden_per_hour is the
// '+' arm of the per-member burden toggle (7A-spec §2.6) — NULL treated as 0.

export type GLMappingSettings = Pick<
  CompaniesRow,
  | 'id'
  | 'gl_account_labor'
  | 'gl_account_material'
  | 'gl_account_subcontractor'
  | 'gl_account_other'
  | 'fixed_burden_per_hour'
>;

export async function getGLMappingSettings(): Promise<GLMappingSettings | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('companies')
    .select(
      'id, gl_account_labor, gl_account_material, gl_account_subcontractor, gl_account_other, fixed_burden_per_hour'
    )
    .maybeSingle();

  return (data as GLMappingSettings | null) ?? null;
}

// ----------------------------------------------------------------------------
// M1-03 [S152] — the Settings page reads this row ONCE.
// ----------------------------------------------------------------------------
//
// WHAT WAS WRONG. `settings/page.tsx` awaited getCompany(), getEstimatingSettings(),
// getProposalSettings(), getTimeTrackingSettings() and getGLMappingSettings() in
// series — FIVE sequential round trips against the SAME `companies` row, each
// selecting a different column list. getCompany() additionally re-ran
// `auth.getUser()` and re-read `profiles`, both of which the page had already
// done itself to evaluate its role gate.
//
// The four individual readers are KEPT: `getCompany` is also used by
// `/m/settings` and `getGLMappingSettings` by `team/[id]`. This is an addition,
// not a replacement, so no other surface moves.
//
// ⚠️ THE COLUMN LIST IS ENUMERATED, NOT `select('*')`. `companies` carries 72
// columns and one UPDATE policy over all of them (M1-05), so `*` here would ship
// QuickBooks tokens and billing state into a payload that needs neither. The
// union below is 48 of the 72 and each one is on the page.
//
// The intersection type works because all five shapes are Pick/Omit of the same
// Row and they re-narrow DISJOINT CHECK-constrained columns (`gps_clock_mode`,
// `default_pricing_mode`, `default_proposal_pricing_level`,
// `default_terms_sections`, `default_reminder_schedule`). A structurally wider
// object satisfies each narrower prop type, so the page passes one object to all
// five forms without slicing it.

export type CompanySettingsBundle = CompanyData &
  TimeTrackingSettings &
  EstimatingSettings &
  ProposalSettings &
  GLMappingSettings;

const SETTINGS_BUNDLE_COLUMNS = [
  // CompanyData
  'id, name, address_line1, address_line2, city, state, zip, phone, email, website',
  'trade_type, license_number, logo_url, signatory_name, signatory_title',
  'contractor_signature_path, client_contracts_enabled',
  // TimeTrackingSettings
  'timezone, week_starts_on, ot_threshold_hours, breaks_paid, paid_break_cap_minutes, gps_clock_mode',
  // EstimatingSettings
  'estimate_number_prefix, estimate_number_sequence, default_pricing_mode',
  'default_subcontractor_markup_percent, default_material_markup_percent, default_labor_markup_percent',
  'default_subcontractor_margin_percent, default_material_margin_percent, default_labor_margin_percent',
  'default_tax_rate, default_labor_rate, default_terms_sections',
  // ProposalSettings
  'brand_color, default_proposal_email_subject, default_proposal_email_body',
  'default_reminder_email_subject, default_reminder_email_body, default_reminder_schedule',
  'default_expiration_days, default_proposal_pricing_level',
  // GLMappingSettings
  'gl_account_labor, gl_account_material, gl_account_subcontractor, gl_account_other',
  'fixed_burden_per_hour',
].join(', ');

/**
 * Every `companies` field the Settings page renders, in one round trip.
 *
 * Takes `companyId` rather than resolving it, because the only caller has
 * already read the profile to evaluate its role gate. That is the duplicated
 * lookup this removes — not an optimisation the caller has to remember, just
 * the value it already holds.
 *
 * `.eq('id', …)` and not a bare `.maybeSingle()`: `companies_select_own` admits
 * a platform admin to EVERY company row, and `maybeSingle()` errors on more than
 * one. The four readers this replaces all have that latent bug; pinning the id
 * does not.
 */
export async function getCompanySettingsBundle(
  companyId: string
): Promise<CompanySettingsBundle | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('companies')
    .select(SETTINGS_BUNDLE_COLUMNS)
    .eq('id', companyId)
    .maybeSingle();

  return (data as CompanySettingsBundle | null) ?? null;
}
