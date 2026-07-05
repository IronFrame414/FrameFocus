import { createClient } from '@/lib/supabase-browser';
import type { CompanyMember } from '@/lib/services/members';
export type { CompanyMember };

/**
 * Client-side member reads for assignment pickers inside 'use client'
 * components. Writes (schedule_color, display_name) are Owner/Admin per RLS.
 */
export async function listMembers(filters?: {
  member_type?: 'crew' | 'subcontractor';
}): Promise<CompanyMember[]> {
  const supabase = createClient();

  let query = supabase
    .from('company_members')
    .select('*')
    .eq('is_deleted', false)
    .order('display_name', { ascending: true });

  if (filters?.member_type) {
    query = query.eq('member_type', filters.member_type);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as CompanyMember[];
}

export async function updateMember(
  id: string,
  updates: { display_name?: string; schedule_color?: string | null }
): Promise<{ error: string | null }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger `company_members_set_updated_by` handles updated_by.
  // updated_at is handled by the existing updated_at trigger.
  const { error } = await supabase.from('company_members').update(updates).eq('id', id);

  return { error: error?.message ?? null };
}
