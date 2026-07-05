import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

type MemberRow = Database['public']['Tables']['company_members']['Row'];
export type CompanyMember = Omit<MemberRow, 'member_type'> & {
  member_type: 'crew' | 'subcontractor';
};

/**
 * List assignable members (crew + subcontractors) for assignment pickers,
 * schedule rendering, and team assignment. Soft-deleted members are filtered
 * here, not in RLS (trash-bin pattern).
 */
export async function getMembers(filters?: {
  member_type?: 'crew' | 'subcontractor';
}): Promise<CompanyMember[]> {
  const supabase = await createClient();

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

export async function getMember(id: string): Promise<CompanyMember | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('company_members')
    .select('*')
    .eq('id', id)
    .single();

  return (data as CompanyMember | null) ?? null;
}

/**
 * The caller's own member row (via profiles.user_id = auth.uid()).
 * Mirrors the SQL helper get_my_member_id().
 */
export async function getMyMember(): Promise<CompanyMember | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) return null;

  const { data } = await supabase
    .from('company_members')
    .select('*')
    .eq('profile_id', profile.id)
    .eq('is_deleted', false)
    .maybeSingle();

  return (data as CompanyMember | null) ?? null;
}
