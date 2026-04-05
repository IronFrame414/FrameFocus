import { createClient } from '@/lib/supabase-server';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';

export interface CompanyData {
  id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  website: string | null;
  trade_type: string | null;
  license_number: string | null;
  logo_url: string | null;
}

// Server-side: fetch company data
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

// Client-side: update company data
export async function updateCompany(
  companyId: string,
  updates: Partial<Omit<CompanyData, 'id'>>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createBrowserClient();

  const { error } = await supabase
    .from('companies')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', companyId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

// Client-side: upload company logo
export async function uploadCompanyLogo(
  companyId: string,
  file: File
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = createBrowserClient();

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

  // Save the URL to the company record
  const { error: updateError } = await supabase
    .from('companies')
    .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', companyId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true, url: publicUrl };
}
