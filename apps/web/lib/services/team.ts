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
