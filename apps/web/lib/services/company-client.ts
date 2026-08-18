import { createClient } from '@/lib/supabase-browser';
import type {
  CompanyData,
  EstimatingSettings,
  GLMappingSettings,
  PricingMode,
  ProposalSettings,
  TermsSection,
  TimeTrackingSettings,
} from '@/lib/services/company';
import type { GpsClockMode } from '@framefocus/shared/utils/time-tracking';

export type {
  CompanyData,
  EstimatingSettings,
  GLMappingSettings,
  GpsClockMode,
  PricingMode,
  ProposalSettings,
  TermsSection,
  TimeTrackingSettings,
};

/**
 * R17 [S150] — a write RLS discarded, reported as the failure it is.
 *
 * ⚠️ ZERO AFFECTED ROWS IS NOT AN ERROR IN POSTGRES. When a policy matches
 * nothing, the UPDATE is valid and changes nothing; PostgREST returns no error,
 * so a caller that only checks `error` returns success over a row it never
 * touched. `companies_update_owner_admin` is the policy in question — a caller
 * whose role or company no longer matches gets "Settings saved successfully."
 * over an unchanged row.
 *
 * `.select('id')` is what makes the affected rows observable at all.
 *
 * The message names no cause it has not verified (CLAUDE.md): an empty result
 * cannot distinguish "policy refused you" from "the row is gone", so it says
 * both. Same helper and same wording as `contracts-client.ts`, where this
 * defect (`#1-s146`) was first fixed.
 */
const DISCARDED =
  'That change was not applied. You may not have permission to make it, or the record no longer exists.';

function applied(rows: unknown[] | null): boolean {
  return Array.isArray(rows) && rows.length > 0;
}

// ── Company Settings pass [S86] — time-tracking settings ──
// timezone is excluded: it predates this pass and has no UI control yet;
// this form updates only the five S86 columns.
export type UpdateTimeTrackingSettingsInput = Partial<
  Omit<TimeTrackingSettings, 'id' | 'timezone'>
>;

export async function updateTimeTrackingSettings(
  companyId: string,
  updates: UpdateTimeTrackingSettingsInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // companies pre-trigger holdover (CLAUDE.md): set updated_at
  // explicitly — companies_set_updated_by trigger does not exist.
  const { error } = await supabase
    .from('companies')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', companyId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

// ── 7A §5.8 — GL account mapping + company fixed burden ──
// Owner/Admin (page-level gate; companies RLS scopes the row). A
// fixed_burden_per_hour change is FORWARD-ONLY: it affects future session
// approvals, never already-frozen snapshots (7A-spec §2.6).
export type UpdateGLMappingSettingsInput = Partial<Omit<GLMappingSettings, 'id'>>;

export async function updateGLMappingSettings(
  companyId: string,
  updates: UpdateGLMappingSettingsInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // companies pre-trigger holdover (CLAUDE.md): set updated_at
  // explicitly — companies_set_updated_by trigger does not exist.
  const { error } = await supabase
    .from('companies')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', companyId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function updateCompany(
  companyId: string,
  updates: Partial<Omit<CompanyData, 'id'>>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // R17 [S150] — `.select('id')` so a discarded write is visible. `updated_at`
  // is still set explicitly here: `companies` has no `set_updated_by` trigger
  // and no `updated_at` trigger, which CLAUDE.md records as a known holdover.
  // Fixing THAT is a migration and is not this change.
  const { data, error } = await supabase
    .from('companies')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', companyId)
    .select('id');

  if (error) {
    return { success: false, error: error.message };
  }
  if (!applied(data)) {
    return { success: false, error: DISCARDED };
  }
  return { success: true };
}

// 4M — estimating settings. estimate_number_sequence is system-
// managed (read-only in the UI) and intentionally not updatable.
// estimate_number_prefix is normalized to uppercase here so the
// stored value always matches the validation regex.
export type UpdateEstimatingSettingsInput = Partial<
  Omit<EstimatingSettings, 'id' | 'estimate_number_sequence'>
>;

export async function updateEstimatingSettings(
  companyId: string,
  updates: UpdateEstimatingSettingsInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const payload: UpdateEstimatingSettingsInput = { ...updates };
  if (typeof payload.estimate_number_prefix === 'string') {
    payload.estimate_number_prefix = payload.estimate_number_prefix.trim().toUpperCase();
  }

  // companies pre-trigger holdover (CLAUDE.md): set updated_at
  // explicitly — companies_set_updated_by trigger does not exist.
  const { error } = await supabase
    .from('companies')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', companyId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * The company logo, into the PUBLIC company-logos bucket (migration
 * 20260818000000 — the bucket was lost in the TECH_DEBT #79 squash and every
 * upload had been failing with "Bucket not found"; see that migration).
 *
 * PNG/JPEG only [S97, Josh — no SVG this pass]. The extension is derived from
 * the MIME TYPE, not from the filename: the bucket enforces an
 * allowed_mime_types allowlist, so a "logo.jpeg" holding a PNG (or a file named
 * with no extension at all) must not decide the stored path. Deriving it one
 * way also means there are at most TWO possible object keys per company, and
 * the other one is removed below — otherwise switching PNG -> JPG would leave
 * an orphan blob behind and logo_url would point at whichever was written last.
 */
export async function uploadCompanyLogo(
  companyId: string,
  file: File
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = createClient();

  const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    return { success: false, error: 'A logo must be a PNG or a JPEG.' };
  }
  const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
  const filePath = `${companyId}/logo.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('company-logos')
    .upload(filePath, file, { upsert: true, contentType: mime });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  // Drop the other-format object so exactly one logo blob exists per company.
  // Best-effort: a failure here leaves a harmless orphan and must not fail an
  // upload that already succeeded.
  const stalePath = `${companyId}/logo.${ext === 'png' ? 'jpg' : 'png'}`;
  await supabase.storage.from('company-logos').remove([stalePath]);

  const {
    data: { publicUrl },
  } = supabase.storage.from('company-logos').getPublicUrl(filePath);

  const { error: updateError } = await supabase
    .from('companies')
    .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', companyId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true, url: publicUrl };
}


// Signed-artifact spec §4.2 — the saved contractor signature image. The bytes
// live in the PRIVATE project-files bucket at {companyId}/signatures/; only the
// storage PATH is persisted on companies.contractor_signature_path (never the
// bytes, and never base64 in the row). The CO send flow reads the bytes
// server-side to composite the contractor signature onto v1.
// (contractor_signature_path is a new column — expected type errors against the
// un-regenerated database.ts / CompanyData until the migration is applied.)
export async function uploadContractorSignature(
  companyId: string,
  file: File
): Promise<{ success: boolean; path?: string; error?: string }> {
  const supabase = createClient();

  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
  const filePath = `${companyId}/signatures/signature.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('project-files')
    .upload(filePath, file, { upsert: true, contentType: file.type || 'image/png' });
  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { error: updateError } = await supabase
    .from('companies')
    .update({ contractor_signature_path: filePath, updated_at: new Date().toISOString() })
    .eq('id', companyId);
  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true, path: filePath };
}

export async function clearContractorSignature(
  companyId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('companies')
    .update({ contractor_signature_path: null, updated_at: new Date().toISOString() })
    .eq('id', companyId);
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/** Short-lived signed URL to preview the saved signature (private bucket). */
export async function getContractorSignatureUrl(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage.from('project-files').createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}


// Spec 2 — proposals & email defaults. Same autosave path as the
// estimating settings; companies pre-trigger holdover applies.
export type UpdateProposalSettingsInput = Partial<Omit<ProposalSettings, 'id'>>;

export async function updateProposalSettings(
  companyId: string,
  updates: UpdateProposalSettingsInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { error } = await supabase
    .from('companies')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', companyId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}


/** Proposal email defaults for the resend modal prefill. */
export async function getProposalEmailDefaults(): Promise<{
  subject: string | null;
  body: string | null;
}> {
  const supabase = createClient();

  const { data } = await supabase
    .from('companies')
    .select('default_proposal_email_subject, default_proposal_email_body')
    .maybeSingle();

  return {
    subject: data?.default_proposal_email_subject ?? null,
    body: data?.default_proposal_email_body ?? null,
  };
}
