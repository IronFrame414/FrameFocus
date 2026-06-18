import { createClient } from '@/lib/supabase-browser';
import type {
  CompanyData,
  EstimatingSettings,
  PricingMode,
  ProposalSettings,
  TermsSection,
} from '@/lib/services/company';

export type { CompanyData, EstimatingSettings, PricingMode, ProposalSettings, TermsSection };

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
