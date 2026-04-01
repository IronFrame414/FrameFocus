import type { SupabaseClient } from '@supabase/supabase-js';

export interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  created_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export async function getTeamMembers(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, role, created_at')
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as TeamMember[];
}

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

export async function cancelInvitation(supabase: SupabaseClient, invitationId: string) {
  const { error } = await supabase
    .from('invitations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', invitationId);

  if (error) throw error;
}
