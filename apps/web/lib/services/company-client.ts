import { createClient } from '@/lib/supabase-browser';
import type { CompanyData } from '@/lib/services/company';

export type { CompanyData };

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
