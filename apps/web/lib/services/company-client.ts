import { createClient } from '@/lib/supabase-browser';
import type {
  CompanyData,
  EstimatingSettings,
  PricingMode,
  ProposalSettings,
  TermsSection,
  TimeTrackingSettings,
} from '@/lib/services/company';
import type { GpsClockMode } from '@framefocus/shared/utils/time-tracking';

export type {
  CompanyData,
  EstimatingSettings,
  GpsClockMode,
  PricingMode,
  ProposalSettings,
  TermsSection,
  TimeTrackingSettings,
};

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

export async function updateCompany(
  companyId: string,
  updates: Partial<Omit<CompanyData, 'id'>>
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

export async function uploadCompanyLogo(
  companyId: string,
  file: File
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = createClient();

  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
  const filePath = `${companyId}/logo.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('company-logos')
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

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
