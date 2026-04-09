import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

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
