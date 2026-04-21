import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type InvitationRow = Database['public']['Tables']['invitations']['Row'];

export type TeamMember = Pick<
  ProfileRow,
  'id' | 'first_name' | 'last_name' | 'role' | 'created_at'
>;

export type Invitation = Pick<
  InvitationRow,
  'id' | 'email' | 'role' | 'status' | 'created_at' | 'expires_at'
> & { token?: string };
export type TeamMemberDetail = Pick<
  ProfileRow,
  | 'id'
  | 'user_id'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'role'
  | 'notes'
  | 'is_deleted'
  | 'created_at'
>;

/** Fetch a single team member by profile id (for edit page) */
export async function getTeamMember(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_id, first_name, last_name, email, phone, role, notes, is_deleted, created_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as TeamMemberDetail;
}

/** Update editable fields on a team member's profile. RLS enforces who can change what. */
export async function updateTeamMember(
  supabase: SupabaseClient,
  id: string,
  updates: {
    first_name?: string;
    last_name?: string;
    phone?: string | null;
    role?: string;
    notes?: string | null;
  }
) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select('id, user_id, first_name, last_name, email, phone, role, notes, is_deleted, created_at')
    .single();
  if (error) throw error;
  return data as TeamMemberDetail;
}

/** Soft-delete a team member: mark profile is_deleted and ban the auth user so they cannot log in. */
export async function softDeleteTeamMember(
  supabase: SupabaseClient,
  supabaseAdmin: SupabaseClient,
  profileId: string,
  userId: string
) {
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', profileId);
  if (profileError) throw profileError;

  const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: '876000h',
  });
  if (banError) throw banError;
}

/** Send a password recovery email to a team member. Caller authorization must be checked before calling. */
export async function resetTeamMemberPassword(
  supabase: SupabaseClient,
  email: string,
  redirectTo: string
) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
}

/** Fetch all active team members for the current user's company */
export async function getTeamMembers(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, role, created_at')
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as TeamMember[];
}

/** Fetch all pending invitations for the current user's company */
export async function getPendingInvitations(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('invitations')
    .select('id, email, role, status, created_at, expires_at')
    .eq('status', 'pending')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Invitation[];
}

/** Cancel a pending invitation */
export async function cancelInvitation(supabase: SupabaseClient, invitationId: string) {
  const { error } = await supabase
    .from('invitations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', invitationId);

  if (error) throw error;
}

/** Create a new invitation and return the record (including token) */
export async function createInvitation(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    email: string;
    role: string;
    invitedBy: string;
  }
) {
  const { data, error } = await supabase
    .from('invitations')
    .insert({
      company_id: params.companyId,
      email: params.email,
      role: params.role,
      invited_by: params.invitedBy,
      created_by: params.invitedBy,
    })
    .select('id, email, role, token, expires_at')
    .single();

  if (error) throw error;
  return data as Invitation;
}
