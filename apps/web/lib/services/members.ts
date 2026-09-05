import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

type MemberRow = Database['public']['Tables']['company_members']['Row'];
export type CompanyMember = Omit<MemberRow, 'member_type'> & {
  member_type: 'crew' | 'subcontractor';
  // #89: the linked subcontractor's type, so callers can label a member "(Sub)"
  // vs "(Vendor)" — `member_type` alone cannot tell them apart (both are
  // 'subcontractor'). Null when the member has no linked sub row (crew, or an
  // unresolved directory sub whose `member_id` was never backfilled).
  // Optional: only the list `getMembers()` embeds it; the single-row fetchers
  // (`getMember`/`getMyMember`) do not, so it is absent there rather than lied about.
  sub_type?: 'subcontractor' | 'vendor' | null;
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
    // #89: embed the linked sub's type via subcontractors.member_id so pickers
    // can distinguish subcontractor from vendor. Reverse embed → array (0/1 rows).
    .select('*, subcontractors!subcontractors_member_id_fkey(sub_type)')
    .eq('is_deleted', false)
    .order('display_name', { ascending: true });

  if (filters?.member_type) {
    query = query.eq('member_type', filters.member_type);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map((row) => {
    const { subcontractors, ...m } = row as Record<string, unknown> & {
      subcontractors?: { sub_type?: string }[] | { sub_type?: string } | null;
    };
    const sub = Array.isArray(subcontractors) ? subcontractors[0] : subcontractors;
    const subType = sub?.sub_type;
    return {
      ...m,
      sub_type:
        subType === 'vendor' || subType === 'subcontractor' ? subType : null,
    } as CompanyMember;
  });
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

/**
 * The `profiles` row behind a member, for the M-40 edit form. [S121]
 *
 * ⚠️ BY PROFILE ID, and only ever called with `company_members.profile_id` —
 * never with a member id. That confusion is A-47's trap, and it is why this
 * takes a distinctly named parameter rather than `id`.
 *
 * Returns null when the member has no profile, which for most of the roster is
 * the ordinary state: 32 of rebuild-test's 33 subcontractor members are
 * directory rows with `profile_id` null.
 */
export async function getTeamMemberProfile(profileId: string): Promise<{
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: string;
} | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, phone, role')
    .eq('id', profileId)
    .maybeSingle();
  return data ?? null;
}
