import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

type SubcontractorRow = Database['public']['Tables']['subcontractors']['Row'];
export type Subcontractor = Omit<SubcontractorRow, 'sub_type' | 'status'> & {
  sub_type: 'subcontractor' | 'vendor';
  status: 'active' | 'inactive' | 'archived';
};

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
