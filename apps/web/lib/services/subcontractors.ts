import { createClient } from '@/lib/supabase-server';

export interface Subcontractor {
  id: string;
  company_id: string;
  sub_type: 'subcontractor' | 'vendor';
  status: 'active' | 'inactive' | 'archived';
  company_name: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  trade_type: string | null;
  license_number: string | null;
  insurance_expiry: string | null;
  rating: number | null;
  rating_notes: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export async function getSubcontractors(filters?: {
  sub_type?: string;
  status?: string;
  trade_type?: string;
}): Promise<Subcontractor[]> {
  const supabase = await createClient();

  let query = supabase
    .from('subcontractors')
    .select('*')
    .eq('is_deleted', false)
    .order('company_name', { ascending: true });

  if (filters?.sub_type) {
    query = query.eq('sub_type', filters.sub_type);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.trade_type) {
    query = query.eq('trade_type', filters.trade_type);
  }

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

export async function getSubcontractor(id: string): Promise<Subcontractor | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('subcontractors')
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .single();

  return data ?? null;
}
